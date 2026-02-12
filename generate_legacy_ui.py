"""Generate index.html with correct Python indentation and working PyScript CDN."""
import os

# Read the Python web app code (already has correct indentation)
with open('scripts/web_app.py', 'r', encoding='utf-8') as f:
    py_code = f.read()

# But we need to update imports for new PyScript API
# Old: from js import document, ...
# New: from pyscript import document, window
py_code_new = py_code.replace(
    'from js import document, Uint8Array, File, window',
    'from js import Uint8Array, File'
)
py_code_new = py_code_new.replace(
    'import js\n',
    'import js\nfrom pyscript import document, window\n'
)

# Build HTML
lines = []
lines.append('<!DOCTYPE html>')
lines.append('<html lang="en">')
lines.append('<head>')
lines.append('    <meta charset="UTF-8">')
lines.append('    <meta name="viewport" content="width=device-width, initial-scale=1.0">')
lines.append('    <title>Word Table Extractor (AI Powered)</title>')
lines.append('    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@pyscript/core@0.6.1/dist/core.css">')
lines.append('    <script type="module" src="https://cdn.jsdelivr.net/npm/@pyscript/core@0.6.1/dist/core.js"></script>')
lines.append('    <style>')
lines.append("        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; max-width: 900px; margin: 0 auto; color: #333; }")
lines.append("        h1 { color: #2c3e50; border-bottom: 2px solid #eee; padding-bottom: 10px; }")
lines.append("        .container { display: flex; gap: 20px; flex-wrap: wrap; }")
lines.append("        .main-panel { flex: 1; min-width: 300px; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }")
lines.append("        .log-panel { flex: 1; min-width: 300px; background: #fdfdfd; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); border: 1px solid #eee; }")
lines.append("        .controls { margin-bottom: 20px; }")
lines.append("        label { display: block; margin-bottom: 5px; font-weight: bold; }")
lines.append('        select, input[type="file"] { width: 100%; padding: 8px; margin-bottom: 15px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }')
lines.append("        button { background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; width: 100%; }")
lines.append("        button:hover { background: #2980b9; }")
lines.append("        button:disabled { background: #bdc3c7; cursor: not-allowed; }")
lines.append("        button.secondary { background: #95a5a6; margin-top: 10px; font-size: 14px; padding: 5px 10px; width: auto; }")
lines.append("        button.secondary:hover { background: #7f8c8d; }")
lines.append("        #output { margin-top: 20px; }")
lines.append("        .download-link { display: block; margin: 10px 0; padding: 10px; background: white; border: 1px solid #ddd; border-radius: 4px; text-decoration: none; color: #333; transition: background 0.2s; }")
lines.append("        .download-link:hover { background: #f0f8ff; border-color: #3498db; }")
lines.append("        .meta-info { font-size: 0.85em; color: #7f8c8d; margin-top: 5px; }")
lines.append("        #loading { display: none; color: #e67e22; font-weight: bold; text-align: center; margin: 10px 0; }")
lines.append("        #log_output { width: 100%; height: 300px; background: #2c3e50; color: #ecf0f1; font-family: 'Consolas', monospace; font-size: 12px; padding: 10px; border-radius: 4px; overflow-y: auto; white-space: pre-wrap; box-sizing: border-box; }")
lines.append("        .log-entry { margin-bottom: 2px; border-bottom: 1px solid #34495e; padding-bottom: 2px; }")
lines.append("        .log-INFO { color: #ecf0f1; }")
lines.append("        .log-DEBUG { color: #95a5a6; }")
lines.append("        .log-WARNING { color: #f39c12; }")
lines.append("        .log-ERROR { color: #e74c3c; }")
lines.append("    </style>")
lines.append("</head>")
lines.append("<body>")
lines.append('    <h1>Word Table Extractor</h1>')
lines.append('    <div class="container">')
lines.append('        <div class="main-panel">')
lines.append('            <h3>Configuration</h3>')
lines.append('            <div class="controls">')
lines.append('                <label for="file_upload">1. Select Document (.docx only)</label>')
lines.append('                <input type="file" id="file_upload" accept=".docx" />')
lines.append('                <div id="file_warning" style="display:none; color: #e74c3c; font-size: 0.9em; margin-bottom: 10px;">')
lines.append('                    Warning: Only .docx files are supported. Convert .doc files to .docx first.')
lines.append('                </div>')
lines.append('                <label for="extraction_mode">2. Extraction Mode</label>')
lines.append('                <select id="extraction_mode">')
lines.append('                    <option value="Standard">Standard (Rule-Based)</option>')
lines.append('                    <option value="Smart" selected>Smart (Heuristic)</option>')
lines.append('                    <option value="Both">Both (Compare)</option>')
lines.append('                </select>')
lines.append('                <button id="btn_process">Extract Tables</button>')
lines.append('                <div id="pyscript_status" style="color: #f39c12; font-size: 0.9em; margin-top: 5px;">')
lines.append('                    Loading PyScript... Please wait before clicking the button.')
lines.append('                </div>')
lines.append('                <div id="loading">Processing... please wait...</div>')
lines.append('            </div>')
lines.append('            <h3>Results</h3>')
lines.append('            <div id="output"></div>')
lines.append('        </div>')
lines.append('        <div class="log-panel">')
lines.append('            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">')
lines.append('                <h3 style="margin: 0;">Execution Logs</h3>')
lines.append('                <div>')
lines.append('                    <button class="secondary" id="btn_clear_logs">Clear</button>')
lines.append('                    <button class="secondary" id="btn_save_logs">Save</button>')
lines.append('                </div>')
lines.append('            </div>')
lines.append('            <div id="log_output"></div>')
lines.append('        </div>')
lines.append('    </div>')
lines.append('')

# Add py-config as a JSON script tag
config = '    <script type="py" config=\'{"packages": ["pandas", "python-docx"]}\' terminal>'
lines.append(config)

# Write as joined string, then add the Python code starting at column 0
html_before_py = '\n'.join(lines) + '\n'

html_after_py = '    </script>\n</body>\n</html>\n'

with open('legacy_index.html', 'w', encoding='utf-8', newline='\n') as f:
    f.write(html_before_py)
    # Python code starts at column 0 - critical for correct indentation
    f.write(py_code)
    if not py_code.endswith('\n'):
        f.write('\n')
    f.write(html_after_py)

print("SUCCESS: legacy_index.html generated!")
print(f"File size: {os.path.getsize('legacy_index.html')} bytes")

# Quick verification of indentation
with open('legacy_index.html', 'r', encoding='utf-8') as f:
    all_lines = f.readlines()

in_py = False
errors = 0
for i, line in enumerate(all_lines, 1):
    stripped = line.rstrip()
    if 'type="py"' in line:
        in_py = True
        print(f"  Python block starts at line {i}")
        continue
    if '</script>' in line and in_py:
        in_py = False
        print(f"  Python block ends at line {i}")
        continue
    if in_py and stripped:
        leading = len(line) - len(line.lstrip())
        if stripped.startswith('class ') or stripped.startswith('def ') or stripped.startswith('async def'):
            if leading != 0:
                print(f"  ERROR line {i}: top-level '{stripped[:30]}' has indent {leading}")
                errors += 1
            else:
                pass  # OK
        elif stripped.startswith('super().__init__') or stripped.startswith('self.'):
            if leading < 8:
                print(f"  ERROR line {i}: method body '{stripped[:30]}' has indent {leading}, expected >=8")
                errors += 1

if errors == 0:
    print("  All indentation checks PASSED!")
else:
    print(f"  {errors} indentation errors found!")
