/**
 * validator.js — Quality Assurance for extracted tables
 *
 * Implements rules:
 * 1. Interactive: Detects "double rows" (e.g. "Pipe\nPipe") and offers to split.
 * 2. Auto: Deletes empty first rows.
 * 3. Auto: Promotes first row to header if headers are generic.
 * 4. Auto: Demotes header if it contains newlines (e.g., "Pipe\nPipe").
 */

class TableValidator {
    constructor() {
        this.changes = [];
        this.rules = {
            '4': { enabled: true, name: "Demote Multi-line Headers", desc: "If a header contains newlines (e.g., 'Pipe\\nPipe'), move it to the first data row." },
            '2': { enabled: true, name: "Delete Empty First Row", desc: "If the first row of data is completely empty, remove it." },
            '3': { enabled: true, name: "Auto-Promote Header", desc: "If headers are generic (Column_1...) and the first row looks like a header, promote it." },
            '5': { enabled: false, name: "De-duplicate while merging", desc: "Reduces cells containing repeated lines (e.g., 'Pipe\\nPipe' -> 'Pipe')." },
            '1': { enabled: true, name: "Split Merged Rows", desc: "Interactively detect rows with repeated text (e.g., 'Pipe\\nPipe') and offer to split them." }
        };
    }

    /**
     * Main entry point. Runs after extraction.
     */
    async validateAll() {
        console.log("Validator: Starting validation...");
        this.changes = [];

        for (const table of appState.tables) {
            let demotionOccurred = false;

            // Rule 4: Header Demotion (Auto)
            if (this.rules['4'].enabled && this._checkHeaderDemotion(table)) {
                demotionOccurred = true;
            }

            // Rule 2: Empty First Row (Auto)
            if (this.rules['2'].enabled && this._checkEmptyFirstRow(table)) {
                // Modified
            }

            // Rule 3: Auto Promote Header (Auto)
            // Skip if Rule 4 ran (to avoid undoing it) OR if Rule 3 is disabled
            if (this.rules['3'].enabled && !demotionOccurred && this._checkAutoPromoteHeader(table)) {
                // Modified
            }

            // Rule 5: De-duplicate while merging (Auto)
            if (this.rules['5'].enabled) {
                this._checkDeduplication(table);
            }

            // Rule 1: Repeated Text (Interactive)
            if (this.rules['1'].enabled) {
                const splitCandidates = this._checkRepeatedTextRows(table);
                if (splitCandidates.length > 0) {
                    splitCandidates.sort((a, b) => b - a);
                    await this._promptSplit(table, splitCandidates);
                }
            }
        }

        if (this.changes.length > 0) {
            renderAllTabs();
            updateStatusBar();
        }

        console.log("Validator: Validation complete.");
    }

    hasChanges() {
        return this.changes.length > 0;
    }

    toggleRule(ruleId) {
        if (this.rules[ruleId]) {
            this.rules[ruleId].enabled = !this.rules[ruleId].enabled;
            this.renderTab(); // Re-render tab to update toggle UI
            console.log(`Validator: Rule ${ruleId} toggled to ${this.rules[ruleId].enabled}`);
        }
    }

    async reRun() {
        await this.validateAll();
        this.renderTab();
    }

    renderTab() {
        const container = document.getElementById('tab-validator');
        if (!container) return;

        let configHtml = `<div class="validator-rules">`;
        const order = ['4', '2', '3', '5', '1'];
        for (const id of order) {
            const rule = this.rules[id];
            const checked = rule.enabled ? 'checked' : '';
            configHtml += `
                <div class="rule-item">
                    <label class="switch">
                        <input type="checkbox" ${checked} onchange="validator.toggleRule('${id}')">
                        <span class="slider round"></span>
                    </label>
                    <div class="rule-info">
                        <strong>Rule ${id}: ${rule.name}</strong>
                        <p>${rule.desc}</p>
                    </div>
                </div>
            `;
        }
        configHtml += `</div>`;

        let reportHtml = `<div class="validator-report-list">`;
        if (this.changes.length === 0) {
            reportHtml += `
                <div class="empty-state-small" style="text-align:center; padding: 20px; color: var(--text-secondary);">
                    <p>No issues found in last run.</p>
                </div>
            `;
        } else {
            reportHtml += `<ul class="validator-list">`;
            for (const change of this.changes) {
                const table = appState.tables[change.tableIndex];
                const tableName = table ? `(${table.tableName})` : '';
                reportHtml += `
                    <li class="validator-item">
                        <span class="v-table">
                            <a href="#" onclick="app.scrollToTable(${change.tableIndex}); return false;">
                                Table ${change.tableIndex + 1} ${tableName}
                            </a>
                        </span>
                        <span class="v-msg">${this._escapeHTML(change.message)}</span>
                        <span class="v-rule badge">Rule ${change.rule}</span>
                    </li>
                `;
            }
            reportHtml += `</ul>`;
        }
        reportHtml += `</div>`;

        container.innerHTML = `
            <div class="validator-container">
                <div class="validator-report-panel">
                    <h2 style="margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:8px;">Validation Report</h2>
                    ${reportHtml}
                    <div class="actions" style="margin-top: 20px; display: flex; gap: 10px;">
                        <button class="btn-primary" onclick="switchMainTab('results')">View Tables</button>
                        <button class="btn-secondary" onclick="validator.reRun()">Re-Run Validation</button>
                    </div>
                </div>
                <div class="validator-config-panel">
                    <h2 style="margin-bottom:16px; border-bottom:1px solid var(--border); padding-bottom:8px;">Configuration</h2>
                    ${configHtml}
                </div>
            </div>
        `;
    }

    _logChange(tableIndex, rule, message) {
        this.changes.push({ tableIndex, rule, message });
        console.log(`Validator [Rule ${rule}]: ${message}`);
        // removed _showToast per user request
    }

    // ─── Rule 4: Header Demotion ───
    _checkHeaderDemotion(table) {
        if (!table.headers || table.headers.length === 0) return false;
        const hasNewline = table.headers.some(h => h && h.includes('\n'));

        if (hasNewline) {
            const oldHeaders = [...table.headers];

            // Clean headers before demoting:
            // If header is "Column_X", replace with empty string in data row.
            const cleanedHeaders = oldHeaders.map(h => {
                if (!h || h.startsWith('Column_')) return '';
                return h;
            });

            table.dataRows.unshift(cleanedHeaders);
            table.rows++;
            table.headers = oldHeaders.map((_, i) => `Column_${i + 1}`);
            this._logChange(table.index, '4', 'Demoted headers containing newlines to first row.');
            return true;
        }
        return false;
    }

    // ─── Rule 2: Empty First Row ───
    _checkEmptyFirstRow(table) {
        if (table.dataRows.length === 0) return false;
        const firstRow = table.dataRows[0];
        const isEmpty = firstRow.every(cell => !cell || cell.trim() === '');

        if (isEmpty) {
            table.dataRows.shift();
            table.rows--;
            this._logChange(table.index, '2', 'Deleted empty first row.');
            return true;
        }
        return false;
    }

    // ─── Rule 3: Auto Promote Header ───
    _checkAutoPromoteHeader(table) {
        const isGeneric = table.headers.every(h => h.startsWith('Column_'));
        if (!isGeneric || table.dataRows.length === 0) return false;

        const firstRow = table.dataRows[0];

        // Critical Fix: Do NOT auto-promote if the row contains newlines
        const hasNewline = firstRow.some(c => c && c.includes('\n'));
        if (hasNewline) return false;

        const cols = firstRow.length;
        const condA = (!firstRow[0] || firstRow[0].trim() === '') &&
                      firstRow.slice(1).every(c => c && c.trim() !== '');
        const condB = cols > 5 &&
                      (!firstRow[0] || firstRow[0].trim() === '') &&
                      (!firstRow[1] || firstRow[1].trim() === '') &&
                      firstRow.slice(2).every(c => c && c.trim() !== '');
        const condC = firstRow.every(c => c && c.trim() !== '');

        if (condA || condB || condC) {
            const newHeaders = [...firstRow];
            const oldHeaders = [...table.headers];
            table.dataRows.shift();
            table.rows--;
            table.headers = newHeaders.map((h, i) => h || oldHeaders[i]);

            const rule = condA ? "3a" : (condB ? "3b" : "3c");
            this._logChange(table.index, rule, 'Promoted first row to header.');
            return true;
        }
        return false;
    }

    // ─── Rule 5: De-duplicate while merging ───
    _checkDeduplication(table) {
        let count = 0;
        table.dataRows.forEach((row, rIndex) => {
            row.forEach((cell, cIndex) => {
                if (cell && cell.includes('\n')) {
                    const parts = cell.split('\n');
                    // Check if all parts are identical (ignoring empty lines?)
                    // Let's trim each part first.
                    const cleanParts = parts.map(p => p.trim()).filter(p => p.length > 0);

                    if (cleanParts.length > 1) {
                        const first = cleanParts[0];
                        const allSame = cleanParts.every(p => p === first);
                        if (allSame) {
                            table.dataRows[rIndex][cIndex] = first;
                            count++;
                        }
                    }
                }
            });
        });

        if (count > 0) {
            this._logChange(table.index, '5', `Deduplicated content in ${count} cells.`);
            return true;
        }
        return false;
    }

    // ─── Rule 1: Repeated Text (Split) ───
    _checkRepeatedTextRows(table) {
        const candidates = [];
        table.dataRows.forEach((row, rIndex) => {
            let patternCount = 0;
            for (const cell of row) {
                if (!cell) continue;
                if (cell.includes('\n')) {
                    const parts = cell.split('\n');
                    if (parts.length >= 2 && parts[0].trim() === parts[1].trim()) {
                        patternCount++;
                    }
                }
            }
            if (patternCount > 0) candidates.push(rIndex);
        });
        return candidates;
    }

    async _promptSplit(table, rowIndices) {
        for (const rowIndex of rowIndices) {
            const row = table.dataRows[rowIndex];

            // Build Table Preview
            let html = '<div class="table-preview-wrapper" style="overflow-x:auto; margin: 10px 0; border:1px solid var(--border); border-radius:4px;"><table class="result-table" style="width:100%"><thead><tr>';
            table.headers.forEach(h => {
                html += `<th>${this._escapeHTML(h)}</th>`;
            });
            html += '</tr></thead><tbody><tr>';
            row.forEach(cell => {
                const escaped = this._escapeHTML(cell || '');
                html += `<td>${escaped.replace(/\n/g, '<br>')}</td>`;
            });
            html += '</tr></tbody></table></div>';

            const confirmed = await this._showModal(
                `Table ${table.index + 1}: Split Row?`,
                `<p>Row ${rowIndex + 1} contains repeated text (e.g. "Pipe<br>Pipe").</p>
                 ${html}
                 <p>Do you want to split this into two rows?</p>`
            );

            if (confirmed) {
                this._performSplit(table, rowIndex);
                this._logChange(table.index, '1', `Split row ${rowIndex + 1} (Interactive).`);
            }
        }
    }

    _performSplit(table, rowIndex) {
        const originalRow = table.dataRows[rowIndex];
        const rowA = [];
        const rowB = [];

        originalRow.forEach(cell => {
            if (cell && cell.includes('\n')) {
                // Find index of first newline
                const idx = cell.indexOf('\n');
                // Row A gets part BEFORE newline
                rowA.push(cell.substring(0, idx).trim());
                // Row B gets part AFTER newline (and subsequent newlines joined or kept?)
                // User said "look for text after \n".
                // If there are multiple newlines, we should probably keep them in the second row
                // or split further?
                // The requirement implies a simple split: Part1 -> Row A, Rest -> Row B.
                rowB.push(cell.substring(idx + 1).trim());
            } else {
                // If no newline, keep value in Row A, empty in Row B
                rowA.push(cell);
                rowB.push("");
            }
        });

        table.dataRows[rowIndex] = rowA;
        table.dataRows.splice(rowIndex + 1, 0, rowB);
        table.rows++;
    }

    _showModal(title, bodyHTML) {
        return new Promise((resolve) => {
            let modal = document.getElementById('validator-modal');
            if (!modal) {
                // Ensure modal created if not exists
                // Code omitted for brevity, but should be same as before or rely on pre-existing DOM
                modal = document.createElement('div');
                modal.id = 'validator-modal';
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content">
                        <h3 id="vm-title"></h3>
                        <div id="vm-body"></div>
                        <div class="modal-actions">
                            <button id="vm-yes" class="btn-primary">Yes, Split</button>
                            <button id="vm-no" class="btn-secondary">No, Skip</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            modal.querySelector('#vm-title').textContent = title;
            modal.querySelector('#vm-body').innerHTML = bodyHTML;
            modal.style.display = 'flex';

            const btnYes = modal.querySelector('#vm-yes');
            const btnNo = modal.querySelector('#vm-no');

            const newYes = btnYes.cloneNode(true);
            const newNo = btnNo.cloneNode(true);
            btnYes.parentNode.replaceChild(newYes, btnYes);
            btnNo.parentNode.replaceChild(newNo, btnNo);

            newYes.onclick = () => {
                modal.style.display = 'none';
                resolve(true);
            };
            newNo.onclick = () => {
                modal.style.display = 'none';
                resolve(false);
            };
        });
    }

    _escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

const validator = new TableValidator();
