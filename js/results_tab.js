/**
 * results_tab.js — Results tab renderer
 *
 * Renders:
 *   - Horizontal page tabs (Page 1, Page 2, ...) with table count badges
 *   - Vertical table tabs (left sidebar, color-coded green/red)
 *   - Table content panel (approve/reject, editable name, table preview, meta, CSV download)
 */

function renderResultsTab() {
    const container = document.getElementById('tab-results');
    if (!container) return;

    if (appState.tables.length === 0) {
        renderEmptyState(container);
        return;
    }

    const pages = getPageNumbers();
    const pageTabsHTML = buildPageTabs(pages);

    // Build results layout (sidebar + content)
    const currentPageTables = getTablesByPage(appState.activePageTab);
    ensureActiveTableIndex(currentPageTables);

    const sidebarHTML = buildSidebar(currentPageTables);
    const contentHTML = renderTableContent(appState.activeTableIndex);

    container.innerHTML = `
        ${pageTabsHTML}
        <div class="results-layout">
            ${sidebarHTML}
            ${contentHTML}
        </div>
    `;
}

function renderEmptyState(container) {
    container.innerHTML = `
        <div class="empty-state">
            <div class="icon">📊</div>
            <h3>No tables extracted yet</h3>
            <p>Upload a .docx file and click Extract to begin.</p>
        </div>
    `;
}

function buildPageTabs(pages) {
    let html = '<div class="page-tabs">';
    for (const page of pages) {
        const count = getTablesByPage(page).length;
        const active = page === appState.activePageTab ? 'active' : '';
        html += `<button class="page-tab-btn ${active}" onclick="switchPageTab(${page})" data-page="${page}">
            Page ${page} <span class="badge">${count}</span>
        </button>`;
    }
    html += '</div>';
    return html;
}

function ensureActiveTableIndex(currentPageTables) {
    if (!currentPageTables.find(t => t.index === appState.activeTableIndex)) {
        appState.activeTableIndex = currentPageTables.length > 0 ? currentPageTables[0].index : -1;
    }
}

function buildSidebar(currentPageTables) {
    let html = '<div class="table-tabs-sidebar">';

    // Merge Button
    const mergeDisabled = appState.selectedTableIndices.size < 2 ? 'disabled' : '';
    html += `
        <div class="sidebar-actions">
            <button id="btn-merge-tables" class="btn-merge" ${mergeDisabled} onclick="mergeTables()">
                🔗 Merge Tables
            </button>
        </div>
    `;

    for (const table of currentPageTables) {
        html += buildSidebarItem(table);
    }
    html += '</div>';
    return html;
}

function buildSidebarItem(table) {
    const stateClass = table.approved ? 'approved' : 'rejected';
    const activeClass = table.index === appState.activeTableIndex ? 'active' : '';
    const deletedClass = table.status === 'deleted' ? 'deleted' : '';
    const shortName = table.tableName.length > 25 ? table.tableName.substring(0, 22) + '...' : table.tableName;
    const isChecked = appState.selectedTableIndices.has(table.index) ? 'checked' : '';
    const checkboxDisabled = table.status === 'deleted' ? 'disabled' : '';

    return `
        <div class="table-tab-item">
            <input type="checkbox" class="table-select-checkbox"
                ${isChecked} ${checkboxDisabled}
                onchange="toggleTableSelection(${table.index}, this.checked)">
            <button class="table-tab-btn ${stateClass} ${activeClass} ${deletedClass}"
                data-index="${table.index}" onclick="switchTableTab(${table.index})">
                <span class="tab-label">${escapeHTML(shortName)}</span>
                <span class="tab-meta">${table.rows}×${table.cols} | ${table.confidence}</span>
            </button>
        </div>`;
}

function renderTableContent(tableIndex) {
    if (tableIndex < 0 || tableIndex >= appState.tables.length) {
        return '<div class="table-content-panel"><div class="empty-state"><p>Select a table from the sidebar.</p></div></div>';
    }

    const table = appState.tables[tableIndex];

    if (table.status === 'deleted') {
        return `
            <div class="table-content-panel">
                <div class="empty-state">
                    <div class="icon">🗑️</div>
                    <h3>Table Deleted</h3>
                    <p>This table was merged or removed.</p>
                    <button class="btn-approve" onclick="restoreTable(${tableIndex})">↩️ Restore Table</button>
                </div>
            </div>
        `;
    }

    const approveActive = table.approved ? 'active-state' : '';
    const rejectActive = !table.approved ? 'active-state' : '';
    const confClass = table.confidence === 'high' || table.confidence === 'Rule-Based' ? 'confidence-high' : 'confidence-low';

    return `
        <div class="table-content-panel">
            <div class="action-row">
                <button class="btn-approve ${approveActive}" onclick="setApproval(${tableIndex}, true)">✅ Approve</button>
                <button class="btn-reject ${rejectActive}" onclick="setApproval(${tableIndex}, false)">❌ Reject</button>
                <div class="table-name-group">
                    <label>Table Name:</label>
                    <input type="text" class="table-name-input" value="${escapeHTML(table.tableName)}" 
                        onchange="renameTable(${tableIndex}, this.value)" 
                        onblur="renameTable(${tableIndex}, this.value)">
                </div>
                <button class="btn-save-table" onclick="addTableNameColumn(${tableIndex})" title="Add a column with table name">
                    ➕ Name Col
                </button>
                <button class="btn-save-table" onclick="saveTableState(${tableIndex})">
                    💾 Save
                </button>
            </div>

            <div class="table-preview">
                ${renderTableInteractive(table)}
            </div>

            <div class="table-meta">
                <span class="meta-item">📐 ${table.rows} rows × ${table.cols} cols</span>
                <span class="meta-item">🔍 Confidence: <span class="${confClass}">${table.confidence}</span></span>
                <span class="meta-item">⚙️ ${table.source}</span>
                <button class="btn-csv-download" onclick="downloadTableCSV(${tableIndex})">📥 Download CSV</button>
            </div>
        </div>
    `;
}

function renderTableInteractive(table) {
    if (!table.headers || !table.dataRows) {
        return table.html || '<p>No structured data available.</p>';
    }

    let html = '<table>';

    // Header Row
    html += '<thead><tr>';
    // Action column header (Demote button)
    html += `<th class="row-actions-cell" title="Actions">
                <button class="btn-demote-header" onclick="demoteHeaderToRow(${table.index})" title="Demote header to first row">
                    ⬇️
                </button>
             </th>`;

    table.headers.forEach((header, colIndex) => {
        html += `<th>
            <div style="display: flex; align-items: center; gap: 4px;">
                <input type="text" class="editable-header-input"
                       value="${escapeHTML(header)}"
                       onchange="updateHeaderName(${table.index}, ${colIndex}, this.value)">
                <button class="btn-header-action" title="Fill Down" onclick="fillDown(${table.index}, ${colIndex})">
                    ⬇️
                </button>
            </div>
        </th>`;
    });
    html += '</tr></thead>';

    // Data Rows
    html += '<tbody>';
    table.dataRows.forEach((row, rowIndex) => {
        html += `<tr>`;
        // Action column (Move Up, Delete)
        html += `<td class="row-actions-cell">
                    <div class="row-actions">
                        <button class="action-icon btn-move-header" onclick="promoteRowToHeader(${table.index}, ${rowIndex})" title="Move to Header">
                            ⬆️
                        </button>
                        <button class="action-icon btn-delete-row" onclick="deleteRow(${table.index}, ${rowIndex})" title="Delete Row">
                            🗑️
                        </button>
                    </div>
                 </td>`;

        row.forEach(cell => {
            html += `<td>${escapeHTML(cell || '')}</td>`;
        });
        html += `</tr>`;
    });
    html += '</tbody></table>';

    return html;
}

// ═══════════ Interactive Actions ═══════════

function updateHeaderName(tableIndex, colIndex, newName) {
    const table = appState.tables[tableIndex];
    if (table && table.headers) {
        const oldName = table.headers[colIndex];
        table.headers[colIndex] = newName;
        logAction(`Renamed header '${oldName}' to '${newName}' in table '${table.tableName}'`);
        recordEvent('updateHeaderName', { tableIndex, colIndex, newName });
    }
}

function demoteHeaderToRow(tableIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    // Clean up current headers: replace 'Column_X' with ''
    const rowFromHeader = table.headers.map(h =>
        (h.startsWith('Column_') || h.startsWith('Column ')) ? '' : h
    );

    // Insert as first row
    table.dataRows.unshift(rowFromHeader);
    table.rows++;

    // Reset headers to default
    table.headers = table.headers.map((_, i) => `Column_${i+1}`);

    logAction(`Demoted header to first row for table '${table.tableName}'`);
    recordEvent('demoteHeaderToRow', { tableIndex });
    renderResultsTab();
}

function promoteRowToHeader(tableIndex, rowIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    // Take row data as new headers
    const newHeaders = [...table.dataRows[rowIndex]]; // Clone
    table.headers = newHeaders;

    // Remove the row
    table.dataRows.splice(rowIndex, 1);
    table.rows--;

    logAction(`Promoted row ${rowIndex+1} to header for table '${table.tableName}'`);
    recordEvent('promoteRowToHeader', { tableIndex, rowIndex });
    renderResultsTab();
}

function deleteRow(tableIndex, rowIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    table.dataRows.splice(rowIndex, 1);
    table.rows--;

    logAction(`Deleted row ${rowIndex+1} from table '${table.tableName}'`);
    recordEvent('deleteRow', { tableIndex, rowIndex });
    renderResultsTab();
}

function saveTableState(tableIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    // Reconstruct CSV
    const escapeCsv = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val).replace(/"/g, '""');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str}"`;
        return str;
    };

    const headerLine = table.headers.map(escapeCsv).join(',');
    const rowLines = table.dataRows.map(r => r.map(escapeCsv).join(',')).join('\n');
    table.csv = headerLine + '\n' + rowLines;

    logAction(`Saved table '${table.tableName}' (updated CSV)`);
    showStatus('Table saved successfully!', 'success');
}

function switchPageTab(pageNum) {
    appState.activePageTab = pageNum;
    const pageTables = getTablesByPage(pageNum);
    appState.activeTableIndex = pageTables.length > 0 ? pageTables[0].index : -1;
    renderResultsTab();
}

function switchTableTab(tableIndex) {
    appState.activeTableIndex = tableIndex;
    renderResultsTab();
}

function downloadTableCSV(tableIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    const safeName = table.tableName.replace(/[^a-zA-Z0-9_\-\s]/g, '').replace(/\s+/g, '_');
    downloadCSV(table.csv, `${safeName}.csv`);
}

function toggleTableSelection(tableIndex, isChecked) {
    if (isChecked) {
        appState.selectedTableIndices.add(tableIndex);
    } else {
        appState.selectedTableIndices.delete(tableIndex);
    }
    updateMergeButtonState();
}

function updateMergeButtonState() {
    const btn = document.getElementById('btn-merge-tables');
    if (btn) {
        btn.disabled = appState.selectedTableIndices.size < 2;
    }
}

function mergeTables() {
    const indices = Array.from(appState.selectedTableIndices).sort((a, b) => a - b);
    if (indices.length < 2) return;

    const sourceTables = indices.map(i => appState.tables[i]);
    const firstTable = sourceTables[0];
    const colCount = firstTable.cols;

    // Validate column counts
    for (const t of sourceTables) {
        if (t.cols !== colCount) {
            alert(`Cannot merge tables with different column counts. Table '${t.tableName}' has ${t.cols} columns, expected ${colCount}.`);
            return;
        }
    }

    // Create Merged Table
    const newIndex = appState.tables.length;
    const newTable = {
        index: newIndex,
        pageNumber: appState.activePageTab, // Place on current page tab
        tableName: `Merged Table ${new Date().toLocaleTimeString()}`,
        confidence: 'user-approved',
        approved: true,
        html: '', // Not used for interactive
        csv: '', // Will be generated on save
        rows: 0,
        cols: colCount,
        headers: [...firstTable.headers], // Clone headers from first table
        dataRows: [],
        source: 'User-Merged',
        type: 'merged',
        status: 'active'
    };

    // Aggregate Data
    sourceTables.forEach(t => {
        // Mark as deleted
        t.status = 'deleted';
        // Append rows
        newTable.dataRows.push(...t.dataRows.map(row => [...row])); // Deep copy rows
    });
    newTable.rows = newTable.dataRows.length;

    // Add to state
    appState.tables.push(newTable);

    // Clear selection
    appState.selectedTableIndices.clear();

    // Log
    logAction(`Merged ${indices.length} tables into '${newTable.tableName}'`);
    recordEvent('mergeTables', { indices });

    // Switch to new table
    appState.activeTableIndex = newIndex;
    renderResultsTab();
    showStatus('Tables merged successfully', 'success');
}

function addTableNameColumn(tableIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    // Add header
    table.headers.unshift("Table Name");

    // Add data to each row
    table.dataRows.forEach(row => {
        row.unshift(table.tableName);
    });

    table.cols++;

    logAction(`Added 'Table Name' column to '${table.tableName}'`);
    recordEvent('addTableNameColumn', { tableIndex });
    renderResultsTab();
}

function fillDown(tableIndex, colIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    let lastValue = "";
    let filledCount = 0;

    for (let i = 0; i < table.dataRows.length; i++) {
        const cellValue = table.dataRows[i][colIndex];

        if (cellValue === null || cellValue === undefined || cellValue === "") {
            table.dataRows[i][colIndex] = lastValue;
            filledCount++;
        } else {
            lastValue = cellValue;
        }
    }

    logAction(`Filled down ${filledCount} cells in column '${table.headers[colIndex]}' of table '${table.tableName}'`);
    recordEvent('fillDown', { tableIndex, colIndex });
    renderResultsTab();
}

function restoreTable(tableIndex) {
    const table = appState.tables[tableIndex];
    if (!table) return;

    table.status = 'active';
    logAction(`Restored table '${table.tableName}'`);
    recordEvent('restoreTable', { tableIndex });
    renderResultsTab();
}
