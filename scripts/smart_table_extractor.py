import re
import pandas as pd
from docx import Document
from docx.document import Document as _Document
from docx.oxml.text.paragraph import CT_P
from docx.oxml.table import CT_Tbl
from docx.table import _Cell, Table
from docx.text.paragraph import Paragraph
from collections import Counter
import statistics
import logging

# Logger
logger = logging.getLogger(__name__)

class SmartTableExtractor:
    def __init__(self, docx_path=None):
        self.docx_path = docx_path
        logger.info(f"Initialized SmartTableExtractor for: {docx_path}")

    def load_document(self):
        return Document(self.docx_path)

    def extract_all(self, header_callback=None):
        doc = self.load_document()
        results = []
        table_count = 0
        for block in self.iter_block_items(doc):
            if isinstance(block, Table):
                table_count += 1
                logger.debug(f"Smart Processing Table #{table_count}")
                df, metadata = self.process_table(block, header_callback, table_count)
                if not df.empty:
                    logger.info(f"Table #{table_count} extracted successfully. Rows: {len(df)}")
                    results.append({"df": df, "meta": metadata})
                else:
                    logger.debug(f"Table #{table_count} yielded no data.")

        logger.info(f"Smart Extraction Complete. Found {len(results)} tables.")
        return results

    def iter_block_items(self, parent):
        if isinstance(parent, _Document):
            parent_elm = parent.element.body
        elif isinstance(parent, _Cell):
            parent_elm = parent._tc
        else:
            raise ValueError("something's not right")

        for child in parent_elm.iterchildren():
            if isinstance(child, CT_P):
                yield Paragraph(child, parent)
            elif isinstance(child, CT_Tbl):
                yield Table(child, parent)

    def get_cell_text(self, cell):
        return re.sub(r'\s+', ' ', cell.text).strip()

    def analyze_column_types(self, texts, col_idx):
        types = []
        for t in texts:
            if not t:
                types.append("empty")
            elif t.isdigit():
                types.append("int")
            elif re.match(r'^-?\d+(\.\d+)?$', t):
                types.append("float")
            else:
                types.append("text")

        # Log summary of types
        counts = Counter(types)
        logger.debug(f"Column {col_idx} Types: {dict(counts)}")
        return types

    def analyze_patterns(self, texts, col_idx):
        # Simplistic pattern: length
        lengths = [len(t) for t in texts if t]
        if not lengths:
            logger.debug(f"Column {col_idx} empty.")
            return 0, False

        # Check consistency (std dev or just mode match)
        mode_len = statistics.mode(lengths)
        match_count = sum(1 for l in lengths if l == mode_len)
        consistency = match_count / len(lengths)

        is_consistent = consistency > 0.7
        logger.debug(f"Column {col_idx} Pattern: Mode Len {mode_len}, Consistency {consistency:.2f} -> {'Consistent' if is_consistent else 'Inconsistent'}")

        return mode_len, is_consistent

    def process_table(self, table, header_callback=None, table_id=0):
        # 1. Extract Grid
        rows_data = []
        for row in table.rows:
            rows_data.append([self.get_cell_text(cell) for cell in row.cells])

        if not rows_data:
            return pd.DataFrame(), {}

        # Normalize all rows to the same width (handles merged cells)
        num_cols = max(len(r) for r in rows_data)
        for i in range(len(rows_data)):
            while len(rows_data[i]) < num_cols:
                rows_data[i].append("")
            # Trim rows that are too long
            rows_data[i] = rows_data[i][:num_cols]

        num_rows = len(rows_data)
        logger.debug(f"Table #{table_id} Grid: {num_rows}x{num_cols} (normalized)")

        # 2. Analyze Columns to find Start Row
        start_row_votes = []

        for col_idx in range(num_cols):
            col_texts = [r[col_idx] if col_idx < len(r) else "" for r in rows_data]
            types = self.analyze_column_types(col_texts, col_idx)

            # (b) Datatype Logic
            run_length = 0
            first_int_idx = -1

            for i, t in enumerate(types):
                if t in ["int", "float"]:
                    if run_length == 0:
                        first_int_idx = i
                    run_length += 1
                elif t == "empty":
                    if run_length > 0:
                        if run_length >= 2: break
                        run_length = 0
                        first_int_idx = -1
                else: # text
                    if run_length >= 2: break
                    run_length = 0
                    first_int_idx = -1

            if run_length >= 1 and first_int_idx > -1:
                 # Check preceding row to be header
                 start_row_votes.append(first_int_idx)
                 logger.debug(f"Column {col_idx} voted for Start Row: {first_int_idx} (Type Logic)")

            # (a) Pattern Logic
            mode_len, is_consistent = self.analyze_patterns(col_texts, col_idx)
            if is_consistent:
                for i, t in enumerate(col_texts):
                    if len(t) == mode_len:
                        if i > 0:
                            start_row_votes.append(i)
                            logger.debug(f"Column {col_idx} voted for Start Row: {i} (Pattern Logic)")
                        break

        # Consensus
        if not start_row_votes:
            start_row = 1 if num_rows > 1 else 0
            confidence = "low"
            logger.warning(f"Table #{table_id}: No start row consensus. Fallback to Row {start_row}.")
        else:
            start_row = Counter(start_row_votes).most_common(1)[0][0]
            confidence = "high"
            logger.info(f"Table #{table_id}: Consensus Start Row: {start_row}")

        # Callback if low confidence
        if confidence == "low" and header_callback:
             logger.info(f"Table #{table_id}: Confidence LOW. Triggering User Callback.")
             try:
                 user_start = header_callback(rows_data, start_row)
                 if user_start is not None and isinstance(user_start, int):
                     start_row = user_start
                     confidence = "user-defined"
                     logger.info(f"User selected Start Row: {start_row}")
             except Exception as e:
                 logger.error(f"Callback error: {e}")

        # Adjust Start Row if it points to an empty row
        while start_row < num_rows:
            is_empty = all(not cell for cell in rows_data[start_row])
            if not is_empty:
                break
            logger.debug(f"Row {start_row} is empty, skipping.")
            start_row += 1

        # 3. Extract Headers
        header_rows = rows_data[:start_row]
        data_rows = rows_data[start_row:]

        headers = [""] * num_cols

        skip_row_0 = False
        if len(header_rows) > 0:
            r0 = header_rows[0]
            non_empty_r0 = [t for t in r0 if t]
            unique_r0 = set(non_empty_r0)

            if len(non_empty_r0) > 0 and (len(unique_r0) == 1 or len(non_empty_r0) == 1):
                skip_row_0 = True
                logger.debug("Row 0 identified as Title (merged/single). Skipping for header construction.")

        for r_idx, row in enumerate(header_rows):
            if r_idx == 0 and skip_row_0:
                continue
            for c_idx, text in enumerate(row):
                if text:
                    if headers[c_idx]:
                        headers[c_idx] += " " + text
                    else:
                        headers[c_idx] = text

        for i in range(len(headers)):
            if not headers[i]:
                headers[i] = f"Column_{i+1}"

        logger.debug(f"Headers Constructed: {headers}")

        # Normalize data rows to match header count
        normalized_data = []
        for row in data_rows:
            if len(row) < len(headers):
                row = row + [""] * (len(headers) - len(row))
            elif len(row) > len(headers):
                row = row[:len(headers)]
            normalized_data.append(row)

        try:
            df = pd.DataFrame(normalized_data, columns=headers)
        except Exception as e:
            logger.error(f"Table #{table_id}: DataFrame creation failed: {e}")
            # Fallback: create without column names
            try:
                df = pd.DataFrame(normalized_data)
            except Exception as e2:
                logger.error(f"Table #{table_id}: Fallback also failed: {e2}")
                return pd.DataFrame(), {}

        return df, {"start_row": start_row, "confidence": confidence}

    # ─── Page-Aware Extraction (Batch 1 Enhancement) ───

    def extract_all_with_pages(self, header_callback=None):
        """Enhanced extraction with page tracking, table naming, and stray text capture.

        Returns dict with:
            tables: list of {df, meta} where meta includes page_number, table_name, table_index
            stray_text: list of {pageNumber, paragraphs} for non-table text
            total_pages: int
        """
        doc = self.load_document()
        blocks = list(self.iter_block_items(doc))

        results = []
        stray_text_by_page = {}
        page_number = 1
        table_count = 0
        paragraph_count = 0
        total_block_count = len(blocks)

        logger.info(f"Document has {total_block_count} blocks")

        for i, block in enumerate(blocks):
            if isinstance(block, Paragraph):
                paragraph_count += 1
                # Check for page breaks in the paragraph's XML
                xml_str = block._element.xml
                if '<w:lastRenderedPageBreak' in xml_str or 'w:type="page"' in xml_str:
                    page_number += 1
                    logger.debug(f"Page break detected → now on page {page_number}")

                text = re.sub(r'\s+', ' ', block.text).strip()
                if text:
                    # Check if next block is a table — if so, this paragraph is context, not stray
                    next_block = blocks[i + 1] if i + 1 < len(blocks) else None
                    if not isinstance(next_block, Table):
                        # This is stray text — not immediately before a table
                        if page_number not in stray_text_by_page:
                            stray_text_by_page[page_number] = []
                        stray_text_by_page[page_number].append(
                            self._get_paragraph_style_info(block, text)
                        )

            elif isinstance(block, Table):
                table_count += 1
                logger.debug(f"─── TABLE #{table_count} (Page {page_number}) ───")

                df, metadata = self.process_table(block, header_callback, table_count)

                if not df.empty:
                    # Table name detection (priority order):
                    # 1. First short paragraph BELOW the table
                    table_name = self._detect_table_name_below(blocks, i, table_count)
                    # 2. First row title check
                    if not table_name:
                        table_name = self._detect_table_name_first_row(df)
                    # 3. Column header concatenation with "_"
                    if not table_name:
                        non_generic = [c for c in df.columns if not c.startswith("Column_")]
                        table_name = "_".join(non_generic) if non_generic else f"Table_{table_count}"
                        logger.debug(f"Table #{table_count} name: '{table_name}' (src: header concat)")

                    metadata['page_number'] = page_number
                    metadata['table_name'] = table_name
                    metadata['table_index'] = table_count

                    logger.info(
                        f"Table #{table_count}: {len(df)} rows × {len(df.columns)} cols | "
                        f"{metadata['confidence']} | \"{table_name}\" | Page {page_number}"
                    )
                    results.append({"df": df, "meta": metadata})
                else:
                    logger.debug(f"Table #{table_count} yielded no data.")

        # Convert stray text dict to sorted list
        stray_text = [
            {"pageNumber": p, "paragraphs": paras}
            for p, paras in sorted(stray_text_by_page.items())
        ]

        logger.info(
            f"=== Extraction Complete: {len(results)} tables across {page_number} pages | "
            f"{paragraph_count} paragraphs | "
            f"{len(stray_text)} pages with stray text ==="
        )

        return {
            "tables": results,
            "stray_text": stray_text,
            "total_pages": page_number
        }

    def _detect_table_name_below(self, blocks, table_idx, table_count):
        """Priority 1: Look for short paragraph BELOW the table (<80 chars)."""
        for j in range(table_idx + 1, len(blocks)):
            if isinstance(blocks[j], Table):
                break  # Hit next table, stop looking
            if isinstance(blocks[j], Paragraph):
                text = re.sub(r'\s+', ' ', blocks[j].text).strip()
                if text and len(text) < 80:
                    logger.debug(f"Table #{table_count} name: '{text}' (src: paragraph below)")
                    return text
                break  # Only check the first paragraph after the table
        return None

    def _detect_table_name_first_row(self, df):
        """Priority 2: Check if first row looks like a title (single value or all same)."""
        if len(df) > 0:
            first_row = df.iloc[0]
            non_empty = [str(v).strip() for v in first_row if str(v).strip()]
            unique = set(non_empty)
            if non_empty and (len(unique) == 1 or len(non_empty) == 1):
                return non_empty[0][:60]
        return None

    def _get_paragraph_style_info(self, paragraph, text):
        """Extract style information from a paragraph for stray text display."""
        style_name = ""
        is_bold = False
        try:
            if paragraph.style:
                style_name = str(paragraph.style.name)
            is_bold = any(
                run.bold for run in paragraph.runs
                if run.bold is not None
            )
        except Exception:
            pass

        return {
            "text": text,
            "style": style_name,
            "bold": is_bold
        }


if __name__ == "__main__":
    import sys
    import json
    logging.basicConfig(level=logging.DEBUG)
    path = "test_phase2.docx"
    if len(sys.argv) > 1:
        path = sys.argv[1]

    extractor = SmartTableExtractor(path)
    result = extractor.extract_all_with_pages()

    print(f"\n{'='*50}")
    print(f"Total pages: {result['total_pages']}")
    print(f"Tables found: {len(result['tables'])}")
    for t in result['tables']:
        meta = t['meta']
        print(f"  Page {meta['page_number']}: {meta['table_name']} ({len(t['df'])}×{len(t['df'].columns)}) [{meta['confidence']}]")
    print(f"Stray text pages: {len(result['stray_text'])}")
    for st in result['stray_text']:
        print(f"  Page {st['pageNumber']}: {len(st['paragraphs'])} paragraphs")
