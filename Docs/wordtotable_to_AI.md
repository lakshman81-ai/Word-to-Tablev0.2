# Word Table Extraction to AI: Developer Guide

This document outlines the technical architecture, optimization strategies, and future enhancements for the Word Table Extraction Tool.

## 1. Technical Architecture

### 1.1 Backend: `word_to_table.py`
The backend logic is entirely decoupled from the UI, allowing it to be used as a standalone CLI tool or integrated into web applications.
- **Core Loop:** Iterates through `document.iterchildren()` (paragraphs and tables) to maintain linear context.
- **Pattern Matching:** Uses `re` (regex) for header signatures (e.g., `DN nr inch`) and data patterns (e.g., `\bTW..\b`).
- **Context Handling:** Maintains a `last_context` variable (text of the last paragraph seen) to associate tables with their preceding descriptions (e.g., "Bolting Type").
- **Output:** Returns a dictionary of DataFrames (`data_store`), which is then serialized to CSVs.

### 1.2 Frontend: `word_table_ui.py`
The frontend is a `tkinter` application designed for simplicity and portability.
- **Threading:** File extraction runs in a separate thread (`threading.Thread`) to prevent UI freezing during large file processing.
- **Feedback:** Uses `messagebox` for errors/success and a `Progressbar` for visual feedback.
- **Settings:** Dynamically loads the extraction logic description from the backend via `get_extraction_logic_description()`.

## 2. Optimization Strategies (For Future AI)

### 2.1 Handling Complex Tables
- **Merged Cells:** The current logic (`parse_table_to_df`) handles basic row/column mismatches but may struggle with complex merged headers. Implement logic to parse `gridSpan` and `vMerge` XML attributes if needed.
- **Nested Tables:** Currently not supported. Logic would need to recursively scan table cells for nested tables.

### 2.2 OCR Integration
- **Scanned PDFs:** If input files are scanned images embedded in Word or PDFs converted to Word images, use `pytesseract` or Azure Computer Vision API to extract text before processing.

### 2.3 Dynamic Configuration
- **Rule Engine:** Move the hardcoded `if/elif` logic in `parse_docx` to a JSON-based configuration file (`rules.json`). This would allow users to add new table types without modifying Python code.
  ```json
  {
    "table_type": "Valves",
    "header_regex": "Valves",
    "data_regex": "...F",
    "context_logic": "preceding_paragraph"
  }
  ```

## 3. Testing & Verification

### 3.1 Mock Data
Use `scripts/create_test_docx_phase2.py` to generate test documents covering all known table types.
```bash
python scripts/create_test_docx_phase2.py
python scripts/word_to_table.py test_phase2.docx --output verification_output
```

### 3.2 Real-World Validation
- Validate against diverse `.docx` samples to ensure regex robustness (e.g., case sensitivity, extra spaces).
- Check `Bolting Type` extraction accuracy against documents with varying formatting styles (bold headers, bullet points).

## 4. Requirement Checklist
- [x] Extract specific engineering tables (Bolting, Piping, Valves, etc.).
- [x] Capture context from preceding paragraphs.
- [x] UI with File Upload and Output Folder selection.
- [x] Explicit extraction logic display in UI.
- [x] Save tables as individual CSVs.
