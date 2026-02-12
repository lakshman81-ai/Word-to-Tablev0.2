/**
 * docx_parser.js — Browser-based .docx table extraction (Mode B)
 *
 * A .docx file is a ZIP archive containing word/document.xml.
 * Tables are <w:tbl> elements, paragraphs are <w:p>.
 * Page breaks are <w:lastRenderedPageBreak/> or <w:br w:type="page"/>.
 *
 * This module uses JSZip to unzip and DOMParser to parse the XML.
 * The extraction algorithm mirrors smart_table_extractor.py.
 */

const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

class DocxParser {
    constructor() {
        this.logs = [];
    }

    log(level, msg) {
        const ts = new Date().toLocaleTimeString();
        this.logs.push(`${ts} | ${level.toUpperCase().padEnd(5)} | ${msg}`);
    }

    /**
     * Main entry point. Accepts ArrayBuffer from file input.
     * Returns same JSON structure as server.py /extract response.
     */
    async extract(fileBuffer) {
        this.logs = [];
        this.log('INFO', '=== Browser Extraction Started ===');

        // Step 1: Unzip .docx
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library not loaded');
        }
        const zip = await JSZip.loadAsync(fileBuffer);
        const docXmlFile = zip.file('word/document.xml');
        if (!docXmlFile) {
            return { success: false, error: 'Invalid .docx: missing word/document.xml' };
        }
        const xmlText = await docXmlFile.async('string');
        this.log('INFO', `Loaded document.xml (${xmlText.length} chars)`);

        // Step 2: Parse XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        const bodies = xmlDoc.getElementsByTagNameNS(WORD_NS, 'body');
        if (bodies.length === 0) {
            return { success: false, error: 'Invalid document structure: no body element' };
        }
        const body = bodies[0];

        // Step 3: Walk blocks
        const blocks = this._iterBlockItems(body);
        this.log('INFO', `Document: ${blocks.length} blocks`);

        // Step 4: Process
        return this._processBlocks(blocks);
    }

    // ─── Block Iteration ───

    _getChildren(el) {
        const children = [];
        if (el.children) return Array.from(el.children); // Browser
        if (el.childNodes) { // Node/xmldom
            for (let i = 0; i < el.childNodes.length; i++) {
                const n = el.childNodes[i];
                if (n.nodeType === 1) children.push(n);
            }
        }
        return children;
    }

    _iterBlockItems(bodyElement) {
        const blocks = [];
        const children = this._getChildren(bodyElement);
        for (const child of children) {
            const ln = child.localName;
            if (ln === 'p') {
                blocks.push({
                    type: 'paragraph',
                    text: this._getParagraphText(child),
                    style: this._getParagraphStyleName(child),
                    bold: this._isParagraphBold(child),
                    hasPageBreak: this._hasPageBreak(child),
                    element: child
                });
            } else if (ln === 'tbl') {
                blocks.push({
                    type: 'table',
                    element: child
                });
            }
        }
        return blocks;
    }

    // ─── Paragraph Helpers ───

    _getParagraphText(pEl) {
        const texts = [];
        const runs = pEl.getElementsByTagNameNS(WORD_NS, 'r');
        // Convert to array for compatibility
        const runArray = Array.from(runs);

        for (const run of runArray) {
            const children = this._getChildren(run);
            for (const child of children) {
                if (child.localName === 't') {
                    texts.push(child.textContent);
                } else if (child.localName === 'br') {
                    texts.push('\n');
                } else if (child.localName === 'cr') {
                    texts.push('\n');
                }
            }
        }
        // Normalize spaces but preserve newlines
        // Replace multiple non-newline spaces with single space
        const joined = texts.join('');
        // Debug for Pipe Pipe issue
        if (joined.includes('Pipe') && joined.includes('Pipe', joined.indexOf('Pipe') + 1)) {
             // console.log('DEBUG Pipe Paragraph:', JSON.stringify(texts));
        }
        // Normalize:
        // 1. Replace \r (CR) with \n (LF) to handle Windows/Old Mac line endings as newlines
        // 2. Replace \v (VT) and \f (FF) with \n as they are vertical breaks
        // 3. Replace multiple horizontal whitespace (space, tab) with single space
        return joined
            .replace(/\r/g, '\n')
            .replace(/[\v\f]/g, '\n')
            .replace(/[ \t]+/g, ' ')
            .trim();
    }

    _getParagraphStyleName(pEl) {
        const pPr = pEl.getElementsByTagNameNS(WORD_NS, 'pPr');
        if (pPr.length === 0) return '';
        const pStyle = pPr[0].getElementsByTagNameNS(WORD_NS, 'pStyle');
        if (pStyle.length === 0) return '';
        return pStyle[0].getAttribute('w:val') || '';
    }

    _isParagraphBold(pEl) {
        const runs = Array.from(pEl.getElementsByTagNameNS(WORD_NS, 'r'));
        for (const run of runs) {
            const rPr = run.getElementsByTagNameNS(WORD_NS, 'rPr');
            if (rPr.length > 0) {
                const bEls = rPr[0].getElementsByTagNameNS(WORD_NS, 'b');
                if (bEls.length > 0) {
                    const val = bEls[0].getAttribute('w:val');
                    if (val === null || val === '1' || val === 'true') return true;
                }
            }
        }
        return false;
    }

    _hasPageBreak(pEl) {
        // Check <w:lastRenderedPageBreak/>
        const lrpb = pEl.getElementsByTagNameNS(WORD_NS, 'lastRenderedPageBreak');
        if (lrpb.length > 0) return true;
        // Check <w:br w:type="page"/>
        const brs = Array.from(pEl.getElementsByTagNameNS(WORD_NS, 'br'));
        for (const br of brs) {
            if (br.getAttribute('w:type') === 'page') return true;
        }
        return false;
    }

    // ─── Table Extraction ───

    _extractTableGrid(tblEl) {
        const trEls = Array.from(tblEl.getElementsByTagNameNS(WORD_NS, 'tr'));
        const grid = [];
        for (const tr of trEls) {
            const rowData = [];
            // Only direct child <w:tc> elements (not nested table cells)
            const children = this._getChildren(tr);
            for (const child of children) {
                if (child.localName === 'tc') {
                    const text = this._getCellText(child);
                    const gridSpan = this._getGridSpan(child);
                    rowData.push(text);
                    for (let s = 1; s < gridSpan; s++) rowData.push('');
                }
            }
            grid.push(rowData);
        }
        return grid;
    }

    _getCellText(tcEl) {
        const texts = [];
        const pEls = Array.from(tcEl.getElementsByTagNameNS(WORD_NS, 'p'));
        for (const p of pEls) {
            const t = this._getParagraphText(p);
            texts.push(t); // Keep even empty paragraphs to preserve vertical spacing
        }

        // Remove trailing empty strings to avoid unnecessary whitespace at end
        while (texts.length > 0 && !texts[texts.length - 1]) {
            texts.pop();
        }

        // Join with newline.
        // Critical Fix: Do NOT .trim() the result!
        // We need to preserve leading newlines (e.g. "\n031") so the Validator
        // can correctly split/align data to the second row.
        return texts.join('\n');
    }

    _getGridSpan(tcEl) {
        const tcPr = tcEl.getElementsByTagNameNS(WORD_NS, 'tcPr');
        if (tcPr.length === 0) return 1;
        const gs = tcPr[0].getElementsByTagNameNS(WORD_NS, 'gridSpan');
        if (gs.length === 0) return 1;
        return parseInt(gs[0].getAttribute('w:val')) || 1;
    }

    // ─── Grid Normalization ───

    _normalizeGrid(grid) {
        if (grid.length === 0) return grid;
        const maxCols = Math.max(...grid.map(r => r.length));
        return grid.map(row => {
            while (row.length < maxCols) row.push('');
            return row.slice(0, maxCols);
        });
    }

    // ─── Header Detection ───

    _analyzeColumnType(text) {
        if (!text || !text.trim()) return 'empty';
        const t = text.trim();
        if (/^\d+$/.test(t)) return 'int';
        if (/^-?\d+(\.\d+)?$/.test(t)) return 'float';
        return 'text';
    }

    _detectHeaders(grid) {
        if (grid.length === 0) return { headerRow: 0, confidence: 'low', headers: [] };
        if (grid.length === 1) return { headerRow: 0, confidence: 'low', headers: grid[0].map((c, i) => c || `Column_${i + 1}`) };

        const numCols = grid[0].length;
        const numRows = grid.length;
        const votes = [];

        for (let col = 0; col < numCols; col++) {
            const types = grid.map(row => this._analyzeColumnType(row[col] || ''));

            // Find first run of numeric types (>=2)
            let runLength = 0;
            let firstIdx = -1;
            for (let r = 0; r < types.length; r++) {
                if (types[r] === 'int' || types[r] === 'float') {
                    if (runLength === 0) firstIdx = r;
                    runLength++;
                } else if (types[r] === 'empty') {
                    if (runLength >= 2) break;
                    // Short empty gap OK, don't reset
                } else {
                    if (runLength >= 2) break;
                    runLength = 0;
                    firstIdx = -1;
                }
            }

            if (runLength >= 1 && firstIdx > 0) {
                votes.push(firstIdx);
            }
        }

        let startRow, confidence;
        if (votes.length === 0) {
            startRow = 1;
            confidence = 'low';
        } else {
            // Find most common vote
            const counts = {};
            votes.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
            startRow = parseInt(Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]);
            confidence = 'high';
        }

        // Build headers from rows before startRow
        const headerSlice = grid.slice(0, startRow);
        const headers = new Array(numCols).fill('');

        // Check if row 0 is a title row (single value or all same)
        let skipRow0 = false;
        if (headerSlice.length > 0) {
            const r0 = headerSlice[0];
            const nonEmpty = r0.filter(c => c.trim());
            const unique = new Set(nonEmpty);
            if (nonEmpty.length > 0 && (unique.size === 1 || nonEmpty.length === 1)) {
                skipRow0 = true;
            }
        }

        for (let ri = 0; ri < headerSlice.length; ri++) {
            if (ri === 0 && skipRow0) continue;
            for (let ci = 0; ci < numCols; ci++) {
                const text = (headerSlice[ri][ci] || '').trim();
                if (text) {
                    // Use newline separator for multi-row headers so Validator Rule 4 can detect it
                    headers[ci] = headers[ci] ? headers[ci] + '\n' + text : text;
                }
            }
        }

        // Fill empty headers with generic names
        for (let i = 0; i < headers.length; i++) {
            if (!headers[i]) headers[i] = `Column_${i + 1}`;
        }

        return { headerRow: startRow, confidence, headers };
    }

    // ─── Table Name Detection ───

    _detectTableName(blocks, tableIdx, grid, headers, tableCount) {
        // Priority 1: First short paragraph BELOW the table
        for (let j = tableIdx + 1; j < blocks.length; j++) {
            if (blocks[j].type === 'table') break;
            if (blocks[j].type === 'paragraph' && blocks[j].text) {
                const text = blocks[j].text.trim();
                if (text.length > 0 && text.length < 80) {
                    this.log('DEBUG', `Table #${tableCount} name: "${text}" (src: paragraph below)`);
                    return text;
                }
                break;
            }
        }

        // Priority 2: First row if it looks like a title
        if (grid.length > 0) {
            const firstRow = grid[0];
            const nonEmpty = firstRow.filter(c => c.trim());
            const unique = new Set(nonEmpty);
            if (nonEmpty.length > 0 && (unique.size === 1 || nonEmpty.length === 1)) {
                const name = nonEmpty[0].substring(0, 60);
                this.log('DEBUG', `Table #${tableCount} name: "${name}" (src: first row title)`);
                return name;
            }
        }

        // Priority 3: Column headers joined with "_"
        const nonGeneric = headers.filter(h => !h.startsWith('Column_'));
        const name = nonGeneric.length > 0 ? nonGeneric.join('_') : `Table_${tableCount}`;
        this.log('DEBUG', `Table #${tableCount} name: "${name}" (src: header concat)`);
        return name;
    }

    // ─── Core Processing ───

    _processBlocks(blocks) {
        let pageNumber = 1;
        let tableCount = 0;
        const tables = [];
        const strayTextByPage = {};

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];

            // Track page breaks
            if (block.type === 'paragraph' && block.hasPageBreak) {
                pageNumber++;
            }

            if (block.type === 'paragraph' && block.text) {
                // If next block is table, this is context, not stray
                const nextBlock = blocks[i + 1];
                if (!nextBlock || nextBlock.type !== 'table') {
                    if (!strayTextByPage[pageNumber]) strayTextByPage[pageNumber] = [];
                    strayTextByPage[pageNumber].push({
                        text: block.text,
                        style: block.style,
                        bold: block.bold
                    });
                }
            }

            if (block.type === 'table') {
                tableCount++;
                const grid = this._extractTableGrid(block.element);
                if (grid.length === 0) continue;

                const normalized = this._normalizeGrid(grid);
                this.log('DEBUG', `TABLE #${tableCount} (Page ${pageNumber}) Grid: ${normalized.length}×${normalized[0].length}`);

                const { headerRow, confidence, headers } = this._detectHeaders(normalized);
                const tableName = this._detectTableName(blocks, i, normalized, headers, tableCount);
                const dataRows = normalized.slice(headerRow);

                // Build HTML
                const html = this._gridToHTML(headers, dataRows);
                const csv = this._gridToCSV(headers, dataRows);

                tables.push({
                    pageNumber,
                    tableName,
                    confidence,
                    rows: dataRows.length,
                    cols: headers.length,
                    headers,
                    dataRows,
                    html,
                    csv,
                    source: 'Smart',
                    type: 'Heuristic',
                    tableIndex: tableCount
                });

                this.log('INFO', `Table #${tableCount}: ${dataRows.length}×${headers.length} | ${confidence} | "${tableName}" | Page ${pageNumber}`);
            }
        }

        const strayText = Object.entries(strayTextByPage)
            .map(([page, paragraphs]) => ({ pageNumber: parseInt(page), paragraphs }))
            .sort((a, b) => a.pageNumber - b.pageNumber);

        this.log('INFO', `=== Done: ${tables.length} tables across ${pageNumber} pages ===`);

        return {
            success: true,
            tables,
            strayText,
            totalPages: pageNumber,
            logs: this.logs
        };
    }

    // ─── Output Formatting ───

    _gridToHTML(headers, rows) {
        let html = '<table class="result-table"><thead><tr>';
        for (const h of headers) html += `<th>${this._esc(h)}</th>`;
        html += '</tr></thead><tbody>';
        for (const row of rows) {
            html += '<tr>';
            for (const cell of row) html += `<td>${this._esc(String(cell))}</td>`;
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    }

    _gridToCSV(headers, rows) {
        const escape = v => {
            const s = String(v);
            if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
        };
        const lines = [headers.map(escape).join(',')];
        for (const row of rows) lines.push(row.map(escape).join(','));
        return lines.join('\n');
    }

    _esc(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
