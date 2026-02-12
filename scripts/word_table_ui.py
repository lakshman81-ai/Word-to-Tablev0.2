import tkinter as tk
from tkinter import filedialog, ttk, messagebox, simpledialog, scrolledtext
import os
import threading
import queue
import logging
from datetime import datetime
import word_to_table
import smart_table_extractor
import app_logging

class WordTableApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Word Table Extractor")
        self.geometry("800x600")

        # --- Logging Setup ---
        self.log_queue = queue.Queue()
        self.logger = app_logging.setup_logger(self.log_queue)
        
        # --- Variables ---
        self.file_path = tk.StringVar()
        self.output_dir = tk.StringVar(value=os.path.join(os.getcwd(), "output_tables"))
        self.status_var = tk.StringVar(value="Ready")
        self.extract_mode = tk.StringVar(value="Standard") # Standard, Smart, Both

        # --- Tabs ---
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill='both', expand=True, padx=10, pady=10)

        self.tab_extract = ttk.Frame(self.notebook)
        self.tab_logs = ttk.Frame(self.notebook)
        self.tab_settings = ttk.Frame(self.notebook)

        self.notebook.add(self.tab_extract, text="Extraction")
        self.notebook.add(self.tab_logs, text="Execution Logs")
        self.notebook.add(self.tab_settings, text="Settings & Logic")

        self.build_extract_tab()
        self.build_logs_tab()
        self.build_settings_tab()

        # Start log poller
        self.after(100, self.process_log_queue)

    def build_extract_tab(self):
        frame = ttk.Frame(self.tab_extract, padding="20")
        frame.pack(fill='both', expand=True)

        # File Selection
        lbl_file = ttk.Label(frame, text="Select Word Document (.docx):")
        lbl_file.pack(anchor='w', pady=(0, 5))
        
        file_frame = ttk.Frame(frame)
        file_frame.pack(fill='x', pady=(0, 15))
        
        entry_file = ttk.Entry(file_frame, textvariable=self.file_path, readonlybackground="white")
        entry_file.pack(side='left', fill='x', expand=True, padx=(0, 5))
        
        btn_browse = ttk.Button(file_frame, text="Browse...", command=self.browse_file)
        btn_browse.pack(side='right')

        # Output Selection
        lbl_out = ttk.Label(frame, text="Select Output Folder:")
        lbl_out.pack(anchor='w', pady=(0, 5))
        
        out_frame = ttk.Frame(frame)
        out_frame.pack(fill='x', pady=(0, 15))
        
        entry_out = ttk.Entry(out_frame, textvariable=self.output_dir)
        entry_out.pack(side='left', fill='x', expand=True, padx=(0, 5))
        
        btn_out = ttk.Button(out_frame, text="Browse...", command=self.browse_output)
        btn_out.pack(side='right')

        # Mode Selection
        lbl_mode = ttk.Label(frame, text="Extraction Mode:")
        lbl_mode.pack(anchor='w', pady=(0, 5))

        mode_frame = ttk.Frame(frame)
        mode_frame.pack(fill='x', pady=(0, 15))

        ttk.Radiobutton(mode_frame, text="Standard (Rules)", variable=self.extract_mode, value="Standard").pack(side='left', padx=(0, 10))
        ttk.Radiobutton(mode_frame, text="Smart (Heuristic)", variable=self.extract_mode, value="Smart").pack(side='left', padx=(0, 10))
        ttk.Radiobutton(mode_frame, text="Both (Compare)", variable=self.extract_mode, value="Both").pack(side='left')

        # Action
        self.btn_extract = ttk.Button(frame, text="Extract Tables to CSV", command=self.start_extraction)
        self.btn_extract.pack(fill='x', pady=10)

        # Status
        self.progress = ttk.Progressbar(frame, mode='indeterminate')
        self.progress.pack(fill='x', pady=(10, 5))
        
        lbl_status = ttk.Label(frame, textvariable=self.status_var, wraplength=500)
        lbl_status.pack(pady=5)

    def build_logs_tab(self):
        frame = ttk.Frame(self.tab_logs, padding="10")
        frame.pack(fill='both', expand=True)

        # Controls
        ctrl_frame = ttk.Frame(frame)
        ctrl_frame.pack(fill='x', pady=(0, 5))

        btn_clear = ttk.Button(ctrl_frame, text="Clear Logs", command=self.clear_logs)
        btn_clear.pack(side='left', padx=(0, 5))

        btn_save = ttk.Button(ctrl_frame, text="Save Logs...", command=self.save_logs)
        btn_save.pack(side='left')

        # Log Window
        self.log_text = scrolledtext.ScrolledText(frame, state='disabled', wrap='word', font=('Consolas', 9))
        self.log_text.pack(fill='both', expand=True)

        # Tags for coloring
        self.log_text.tag_config('INFO', foreground='black')
        self.log_text.tag_config('DEBUG', foreground='gray')
        self.log_text.tag_config('WARNING', foreground='orange')
        self.log_text.tag_config('ERROR', foreground='red')

    def build_settings_tab(self):
        frame = ttk.Frame(self.tab_settings, padding="10")
        frame.pack(fill='both', expand=True)

        lbl = ttk.Label(frame, text="Inbuilt Extraction Logic (Paraphrasing Rules):", font=('Segoe UI', 10, 'bold'))
        lbl.pack(anchor='w', pady=(0, 5))

        txt_logic = tk.Text(frame, wrap='word', height=20, padx=10, pady=10)
        txt_logic.pack(fill='both', expand=True)
        
        logic_desc = word_to_table.get_extraction_logic_description()
        txt_logic.insert('1.0', logic_desc)
        txt_logic.config(state='disabled')

    def process_log_queue(self):
        while not self.log_queue.empty():
            msg = self.log_queue.get()
            self.log_text.config(state='normal')

            # Determine tag based on level name in message
            tag = 'INFO'
            if 'DEBUG' in msg: tag = 'DEBUG'
            elif 'WARNING' in msg: tag = 'WARNING'
            elif 'ERROR' in msg: tag = 'ERROR'

            self.log_text.insert('end', msg + '\n', tag)
            self.log_text.see('end')
            self.log_text.config(state='disabled')

        self.after(100, self.process_log_queue)

    def clear_logs(self):
        self.log_text.config(state='normal')
        self.log_text.delete('1.0', 'end')
        self.log_text.config(state='disabled')

    def save_logs(self):
        path = filedialog.asksaveasfilename(defaultextension=".txt", filetypes=[("Text Files", "*.txt")])
        if path:
            try:
                with open(path, 'w') as f:
                    f.write(self.log_text.get('1.0', 'end'))
                messagebox.showinfo("Saved", "Logs saved successfully.")
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save logs: {e}")

    def browse_file(self):
        path = filedialog.askopenfilename(filetypes=[("Word Documents", "*.docx"), ("All Files", "*.*")])
        if path:
            self.file_path.set(path)

    def browse_output(self):
        path = filedialog.askdirectory()
        if path:
            self.output_dir.set(path)

    def start_extraction(self):
        docx = self.file_path.get()
        out = self.output_dir.get()
        mode = self.extract_mode.get()

        if not docx:
            messagebox.showwarning("Input Missing", "Please select a Word document first.")
            return
        
        if not os.path.exists(docx):
            messagebox.showerror("Error", "Selected file does not exist.")
            return

        self.btn_extract.config(state='disabled')
        self.progress.start(10)
        self.status_var.set(f"Processing ({mode})...")
        self.logger.info(f"--- Starting Extraction: Mode={mode}, File={os.path.basename(docx)} ---")

        threading.Thread(target=self.run_extraction, args=(docx, out, mode), daemon=True).start()

    def header_selection_callback(self, rows_data, suggested_row):
        # Called from background thread
        self.logger.info("Callback Triggered: Header Selection needed.")
        result = {}
        event = threading.Event()

        def show_dialog():
            preview_rows = rows_data[:min(5, len(rows_data))]
            preview_str = "\n".join([str(r) for r in preview_rows])
            
            res = simpledialog.askinteger(
                "Low Confidence",
                f"Smart Extractor is unsure about data start row.\nSuggested: {suggested_row}\n\nPreview (First 5 rows):\n{preview_str}\n\nEnter Start Row Index (0-based):",
                parent=self,
                minvalue=0,
                maxvalue=len(rows_data)-1,
                initialvalue=suggested_row
            )
            result['val'] = res
            event.set()

        self.after(0, show_dialog)
        event.wait()
        return result.get('val')

    def run_extraction(self, docx, out, mode):
        try:
            saved_files = []
            
            # STANDARD MODE
            if mode in ["Standard", "Both"]:
                self.status_var.set("Running Standard Extraction...")
                self.logger.info("Starting Standard Extraction (Rule-Based)...")
                data_store = word_to_table.parse_docx(docx)
                files = word_to_table.save_data(data_store, out)
                saved_files.extend(files)

            # SMART MODE
            if mode in ["Smart", "Both"]:
                self.status_var.set("Running Smart Extraction...")
                self.logger.info("Starting Smart Extraction (Heuristic)...")

                extractor = smart_table_extractor.SmartTableExtractor(docx)
                results = extractor.extract_all(header_callback=self.header_selection_callback)

                # Save Smart Results
                smart_out = os.path.join(out, "smart_output") if mode == "Both" else out
                if not os.path.exists(smart_out):
                    os.makedirs(smart_out)

                for i, res in enumerate(results):
                    df = res['df']
                    path = os.path.join(smart_out, f"Table_{i+1}_Smart.csv")
                    df.to_csv(path, index=False)
                    self.logger.info(f"Saved Smart Table {i+1} to {path}")
                    saved_files.append(path)

            msg = f"Success! {len(saved_files)} files saved."
            self.logger.info("Extraction Process Completed Successfully.")
            self.after(0, lambda: self.finish_extraction(msg, "success"))
            
        except Exception as e:
            err_msg = f"Extraction Failed:\n{str(e)}"
            self.logger.error(err_msg)
            self.after(0, lambda: self.finish_extraction(err_msg, "error"))

    def finish_extraction(self, message, status):
        self.progress.stop()
        self.btn_extract.config(state='normal')
        self.status_var.set(message)
        
        if status == "success":
            messagebox.showinfo("Done", message)
        else:
            messagebox.showerror("Error", message)

if __name__ == "__main__":
    app = WordTableApp()
    app.mainloop()
