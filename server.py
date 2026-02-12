"""
Local web server for Word Table Extractor.
Uses Python's built-in http.server - no Flask needed.
Handles file uploads and table extraction server-side.
"""
import http.server
import json
import os
import sys
import io
import cgi
import tempfile
import traceback
import webbrowser
from urllib.parse import urlparse

# Add scripts directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))

import word_to_table
import smart_table_extractor
import pandas as pd

PORT = 8000


class ExtractorHandler(http.server.SimpleHTTPRequestHandler):
    """Custom HTTP handler that processes file uploads for table extraction."""

    def do_HEAD(self):
        """Handle HEAD requests — used by frontend for mode detection."""
        parsed = urlparse(self.path)
        if parsed.path == '/extract':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
        else:
            super().do_HEAD()

    def do_POST(self):
        """Handle POST requests for file upload and extraction."""
        parsed = urlparse(self.path)

        if parsed.path == '/extract':
            self._handle_extract()
        else:
            self.send_error(404, "Not Found")

    def _handle_extract(self):
        """Process uploaded .docx file and extract tables."""
        try:
            # Parse multipart form data
            content_type = self.headers.get('Content-Type', '')
            if 'multipart/form-data' not in content_type:
                self._send_json(400, {"error": "Expected multipart/form-data"})
                return

            # Parse the form data
            boundary = content_type.split('boundary=')[1].encode()
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)

            # Extract file and mode from multipart data
            file_data, filename, mode, robust_flag = self._parse_multipart(body, boundary)

            if not file_data:
                self._send_json(400, {"error": "No file uploaded"})
                return

            if not filename.lower().endswith('.docx'):
                self._send_json(400, {"error": "Only .docx files are supported. Please convert .doc files to .docx format."})
                return

            # Save to temp file
            tmp_path = os.path.join(tempfile.gettempdir(), 'upload.docx')
            with open(tmp_path, 'wb') as f:
                f.write(file_data)

            results = []
            logs = []
            stray_text = []
            total_pages = 1

            # STANDARD MODE
            if mode in ["Standard", "Both"]:
                logs.append(f"Running Standard Extraction (Rules)... Robust Mode: {robust_flag}")
                try:
                    data_store = word_to_table.parse_docx(tmp_path, robust_mode=robust_flag)
                    for key, dfs in data_store.items():
                        for i, df in enumerate(dfs):
                            results.append({
                                "html": df.to_html(index=False, classes="result-table"),
                                "csv": df.to_csv(index=False),
                                "rows": len(df),
                                "cols": len(df.columns),
                                "source": "Standard",
                                "type": str(key),
                                "confidence": "Rule-Based"
                            })
                    logs.append(f"Standard: Found {sum(len(dfs) for dfs in data_store.values())} tables")
                except Exception as e:
                    logs.append(f"Standard Extraction Error: {str(e)}")

            # SMART MODE
            if mode in ["Smart", "Both"]:
                logs.append("Running Smart Extraction (Heuristic)...")
                try:
                    extractor = smart_table_extractor.SmartTableExtractor(tmp_path)
                    extraction_result = extractor.extract_all_with_pages()

                    for res in extraction_result["tables"]:
                        df = res['df']
                        meta = res['meta']
                        results.append({
                            "html": df.to_html(index=False, classes="result-table"),
                            "csv": df.to_csv(index=False),
                            "rows": len(df),
                            "cols": len(df.columns),
                            "headers": list(df.columns),
                            "dataRows": df.values.tolist(),
                            "source": "Smart",
                            "type": "Heuristic",
                            "confidence": str(meta.get('confidence', 'low')),
                            "pageNumber": meta.get('page_number', 1),
                            "tableName": meta.get('table_name', ''),
                            "tableIndex": meta.get('table_index', 0),
                        })

                    stray_text = extraction_result.get("stray_text", [])
                    total_pages = extraction_result.get("total_pages", 1)
                    logs.append(f"Smart: Found {len(extraction_result['tables'])} tables across {total_pages} pages")
                except Exception as e:
                    logs.append(f"Smart Extraction Error: {str(e)}")
                    traceback.print_exc()

            # Cleanup
            try:
                os.remove(tmp_path)
            except:
                pass

            logs.append(f"Processing complete. Total tables found: {len(results)}")

            self._send_json(200, {
                "success": True,
                "tables": results,
                "strayText": stray_text,
                "totalPages": total_pages,
                "logs": logs,
                "filename": filename
            })

        except Exception as e:
            traceback.print_exc()
            self._send_json(500, {"error": str(e), "traceback": traceback.format_exc()})

    def _parse_multipart(self, body, boundary):
        """Parse multipart form data to extract file and mode."""
        file_data = None
        filename = ""
        mode = "Smart"
        robust_flag = False

        parts = body.split(b'--' + boundary)
        for part in parts:
            if b'Content-Disposition' not in part:
                continue

            header_end = part.find(b'\r\n\r\n')
            if header_end == -1:
                continue

            header = part[:header_end].decode('utf-8', errors='replace')
            content = part[header_end + 4:]

            # Remove trailing \r\n--
            if content.endswith(b'\r\n'):
                content = content[:-2]

            if 'name="file"' in header:
                # Extract filename
                if 'filename="' in header:
                    fn_start = header.index('filename="') + 10
                    fn_end = header.index('"', fn_start)
                    filename = header[fn_start:fn_end]
                file_data = content
            elif 'name="mode"' in header:
                mode = content.decode('utf-8').strip()
            elif 'name="robust"' in header:
                val = content.decode('utf-8').strip().lower()
                robust_flag = (val == 'true')

        return file_data, filename, mode, robust_flag

    def _send_json(self, status_code, data):
        """Send a JSON response."""
        response = json.dumps(data, ensure_ascii=False)
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response.encode('utf-8'))))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(response.encode('utf-8'))

    def log_message(self, format, *args):
        """Override to show cleaner log messages."""
        print(f"[Server] {args[0]}")


def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(('', PORT), ExtractorHandler)
    print(f"=" * 50)
    print(f"  Word Table Extractor - Web Server")
    print(f"  Running at http://localhost:{PORT}")
    print(f"  Open http://localhost:{PORT}/index.html")
    print(f"=" * 50)

    # Auto-open browser
    webbrowser.open(f'http://localhost:{PORT}/index.html')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()


if __name__ == '__main__':
    main()
