# Word Table Extraction Tool

This tool extracts specific engineering tables (Bolting, Assemblies, Piping, etc.) from Word Documents (`.docx`) into structured CSV files.

## Features
*   **Automatic Detection:** Identifies tables based on header text, data patterns (e.g., `TW??`), and contextual paragraphs.
*   **Context Aware:** Captures "Bolting Type" or "Assembly Name" from preceding paragraphs.
*   **Batch Processing:** Handles multiple tables within a single document.
*   **GUI:** Simple graphical interface for file selection and settings review.

## Usage

### 1. Graphical User Interface (Recommended)
Run the UI script:
```bash
python scripts/word_table_ui.py
```
1.  **Select File:** Click "Browse..." to choose your `.docx` file.
2.  **Select Output:** Choose a folder to save the CSVs (defaults to `output_tables`).
3.  **Extract:** Click "Extract Tables".
4.  **Settings Tab:** View the current logic used for extraction.

### 2. Command Line Interface
Run the backend script directly:
```bash
python scripts/word_to_table.py input_document.docx --output my_results_folder
```

## Logic Overview

The tool scans the document linearly. It uses regex to match headers (e.g., "DN nr inch") or data patterns (e.g., `...F` for valves).

| Table Type | Header Signature | Context Logic |
| :--- | :--- | :--- |
| **Bolting** | `DN nr inch` + `MESC number` | Preceding Paragraph |
| **Assemblies** | `Column 1` + `Column 2` | Preceding Paragraph (Truncated) |
| **Piping** | `PIPE` (Upper) | - |
| **Valves** | `Valves` / `...F` | - |
| **Instruments** | `Instruments` / `TW??` | - |

*(See "Settings & Logic" tab in UI for full list)*

## Requirements
*   Python 3.x
*   `pandas`
*   `python-docx`
*   `tkinter` (Usually included with Python)

```bash
pip install pandas python-docx
```
