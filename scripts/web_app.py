import asyncio
import js
from js import document, Uint8Array, File, window
import io
import os
import logging
import pandas as pd
from datetime import datetime

print("PyScript initialization started...")

# --- Custom Web Logger ---
class WebLogHandler(logging.Handler):
    def __init__(self, output_element_id):
        super().__init__()
        self.output_element_id = output_element_id
        self.formatter = logging.Formatter('%(asctime)s | %(levelname)-7s | %(message)s', datefmt='%H:%M:%S')

    def emit(self, record):
        try:
            msg = self.format(record)
            log_div = document.getElementById(self.output_element_id)
            entry = document.createElement("div")
            entry.className = f"log-entry log-{record.levelname}"
            entry.innerText = msg
            log_div.appendChild(entry)
            log_div.scrollTop = log_div.scrollHeight
        except Exception:
            self.handleError(record)

# Setup Logging
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)
for h in logger.handlers[:]:
    logger.removeHandler(h)
web_handler = WebLogHandler("log_output")
logger.addHandler(web_handler)

def validate_file_upload(*args):
    file_input = document.getElementById('file_upload')
    file_warning = document.getElementById('file_warning')
    if file_input.files.length > 0:
        file = file_input.files.item(0)
        if not file.name.lower().endswith('.docx'):
            file_warning.style.display = 'block'
            logger.warning(f"Invalid file type: {file.name}. Only .docx files are supported.")
            return False
        else:
            file_warning.style.display = 'none'
            return True
    return True

file_input_el = document.getElementById('file_upload')
file_input_el.addEventListener('change', validate_file_upload)

def clear_logs(*args):
    log_div = document.getElementById("log_output")
    log_div.innerHTML = ""

def save_logs(*args):
    log_div = document.getElementById("log_output")
    content = log_div.innerText
    blob = js.Blob.new([content], {type : 'text/plain'})
    url = js.URL.createObjectURL(blob)
    link = document.createElement("a")
    link.href = url
    link.download = f"extraction_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    link.click()

async def process_file(*args):
    import smart_table_extractor
    import word_to_table

    file_input = document.getElementById('file_upload')
    mode_select = document.getElementById('extraction_mode')
    loading = document.getElementById('loading')
    btn = document.getElementById('btn_process')
    out_div = document.getElementById("output")

    mode = mode_select.value

    if not file_input.files.length:
        window.alert("Please select a file first.")
        return

    if not validate_file_upload():
        window.alert("Please select a .docx file. .doc files are not supported.")
        return

    loading.style.display = "block"
    btn.disabled = True
    out_div.innerHTML = ""
    logger.info(f"--- Starting Extraction: Mode={mode} ---")

    try:
        file = file_input.files.item(0)
        array_buffer = await file.arrayBuffer()
        data = Uint8Array.new(array_buffer)

        input_filename = "input.docx"
        with open(input_filename, "wb") as f:
            f.write(bytearray(data))

        results = []

        # STANDARD MODE
        if mode in ["Standard", "Both"]:
            logger.info("Running Standard Extraction (Rules)...")
            try:
                data_store = word_to_table.parse_docx(input_filename)
                for key, dfs in data_store.items():
                    for i, df in enumerate(dfs):
                        results.append({
                            "df": df,
                            "meta": {"confidence": "Standard Rule", "start_row": "N/A", "type": key},
                            "source": "Standard"
                        })
            except Exception as e:
                logger.error(f"Standard Extraction Error: {e}")

        # SMART MODE
        if mode in ["Smart", "Both"]:
            logger.info("Running Smart Extraction (Heuristic)...")
            try:
                extractor = smart_table_extractor.SmartTableExtractor(input_filename)
                smart_results = extractor.extract_all()
                for res in smart_results:
                    res["source"] = "Smart"
                    results.append(res)
            except Exception as e:
                logger.error(f"Smart Extraction Error: {e}")

        logger.info(f"Processing Complete. Found {len(results)} tables.")

        if not results:
            out_div.innerHTML = "<p>No tables found.</p>"
        else:
            for i, res in enumerate(results):
                df = res['df']
                source = res.get("source", "Unknown")
                csv_content = df.to_csv(index=False)

                blob = js.Blob.new([csv_content], {type : 'text/csv'})
                url = js.URL.createObjectURL(blob)

                link = document.createElement("a")
                link.href = url
                link.download = f"{file.name}_{source}_Table_{i+1}.csv"
                link.className = "download-link"

                title = document.createElement("div")
                title.innerText = f"Table {i+1} ({source})"
                title.style.fontWeight = "bold"

                meta = document.createElement("div")
                meta.className = "meta-info"
                meta_text = ""
                if source == "Smart":
                    meta_text = f"Confidence: {res['meta']['confidence']} | Rows: {len(df)}"
                else:
                    meta_text = f"Type: {res['meta']['type']} | Rows: {len(df)}"

                meta.innerText = meta_text

                link.appendChild(title)
                link.appendChild(meta)
                out_div.appendChild(link)

    except Exception as e:
        window.alert(f"Error: {str(e)}")
        logger.error(f"Critical Error: {str(e)}")
        print(e)
    finally:
        loading.style.display = "none"
        btn.disabled = False

# Wire up buttons via addEventListener (new PyScript API doesn't use py-click)
btn_clear = document.getElementById("btn_clear_logs")
btn_clear.addEventListener("click", clear_logs)

btn_save = document.getElementById("btn_save_logs")
btn_save.addEventListener("click", save_logs)

btn_process = document.getElementById("btn_process")
btn_process.addEventListener("click", process_file)

# Signal that PyScript is fully loaded
print("PyScript fully initialized and ready!")
logger.info("PyScript initialization complete. Ready to extract tables.")
pyscript_status = document.getElementById("pyscript_status")
pyscript_status.innerText = "PyScript is ready! Select a file and extract tables."
pyscript_status.style.color = "#27ae60"

