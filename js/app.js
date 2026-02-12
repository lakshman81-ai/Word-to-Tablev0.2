/**
 * app.js — Central state management and tab controller
 *
 * This is the "brain" of the frontend. It:
 *   1. Detects Local vs Browser mode
 *   2. Routes extraction to server (POST /extract) or DocxParser (JSZip)
 *   3. Stores all results in appState
 *   4. Manages tab switching
 *   5. Provides state mutation API for tab renderers
 */

// ═══════════ Global State ═══════════

const appState = {
    mode: null,              // 'local' or 'browser'
    filename: '',
    tables: [],              // [{index, pageNumber, tableName, confidence, approved, html, csv, rows, cols, headers, dataRows, source, type}]
    strayText: [],           // [{pageNumber, paragraphs: [{text, style, bold}]}]
    totalPages: 0,
    logs: [],
    activeMainTab: 'results',
    activePageTab: 1,
    activeTableIndex: -1,
    selectedTableIndices: new Set(), // For multi-select operations
    recording: false,
    memory: []
};

// ═══════════ Mode Detection ═══════════

async function detectMode() {
    // 1. Check if hosted on GitHub Pages (avoid 404 console error)
    if (window.location.hostname.includes('github.io')) {
        appState.mode = 'browser';
        updateModeUI();
        return;
    }

    try {
        // 2. Try to connect to server with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const resp = await fetch('/extract', {
            method: 'HEAD',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
            appState.mode = 'local';
        } else {
            appState.mode = 'browser';
        }
    } catch (e) {
        appState.mode = 'browser';
    }
    updateModeUI();
}

function updateModeUI() {
    const sbMode = document.getElementById('sb-mode');
    if (appState.mode === 'local') {
        sbMode.textContent = '🖥️ Local Server';
        sbMode.title = 'Connected to Python server at localhost';
    } else {
        sbMode.textContent = '🌐 Browser Mode';
        sbMode.title = 'Running client-side extraction (no server)';
    }
}

// ═══════════ Extraction ═══════════

async function extractTables() {
    const fileInput = document.getElementById('file_upload');
    const file = fileInput.files[0];

    if (!file) {
        showStatus('Please select a .docx file first', 'error');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.docx')) {
        showStatus('Only .docx files are supported', 'error');
        return;
    }

    const btn = document.getElementById('btn_extract');
    btn.disabled = true;
    showLoading(true);
    showStatus('Extracting tables...', 'working');

    try {
        let result;
        if (appState.mode === 'local') {
            result = await extractViaServer(file);
        } else {
            result = await extractViaBrowser(file);
        }

        if (result.success) {
            loadResultIntoState(result, file.name);

            // Post-Processing: AutoNamer & Validator
            if (typeof appSettings !== 'undefined') {
                if (appSettings.enableAutoNamer && typeof autoNamer !== 'undefined') {
                    autoNamer.run(appState.tables);
                }
                if (appSettings.enableValidator && typeof validator !== 'undefined') {
                    await validator.validateAll();

                    // Show Validator Tab if changes occurred
                    if (validator.hasChanges && validator.hasChanges()) {
                        const btnVal = document.getElementById('btn-tab-validator');
                        if (btnVal) {
                            btnVal.style.display = 'inline-block';
                            switchMainTab('validator'); // "First tab if loaded" logic
                            return; // Stop here so we don't switch to 'results'
                        }
                    }
                }
            }

            renderAllTabs();
            updateStatusBar();
            showStatus(`Found ${appState.tables.length} tables across ${appState.totalPages} pages`, 'success');
            switchMainTab('results');
        } else {
            showStatus('Extraction failed: ' + (result.error || 'Unknown error'), 'error');
        }
    } catch (err) {
        showStatus('Error: ' + err.message, 'error');
        console.error('Extraction error:', err);
    } finally {
        btn.disabled = false;
        showLoading(false);
    }
}

async function extractViaServer(file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('mode', document.getElementById('extraction_mode').value);

    // Pass robust setting if available
    if (typeof appSettings !== 'undefined' && appSettings.robustParsing) {
        fd.append('robust', 'true');
    }

    const resp = await fetch('/extract', { method: 'POST', body: fd });
    return await resp.json();
}

async function extractViaBrowser(file) {
    // Uses the DocxParser class from docx_parser.js
    if (typeof DocxParser === 'undefined') {
        throw new Error('Browser extraction engine not loaded. Check docx_parser.js');
    }
    const parser = new DocxParser();
    const buffer = await file.arrayBuffer();
    return await parser.extract(buffer);
}

// ═══════════ Load Into State ═══════════

function loadResultIntoState(result, filename) {
    appState.filename = filename;
    appState.totalPages = result.totalPages || 1;
    appState.strayText = result.strayText || [];
    appState.logs = result.logs || [];

    appState.tables = (result.tables || []).map((t, i) => ({
        index: i,
        pageNumber: t.pageNumber || 1,
        tableName: t.tableName || `Table_${i + 1}`,
        confidence: t.confidence || 'low',
        approved: (t.confidence === 'high' || t.confidence === 'Rule-Based'),
        html: t.html || '',
        csv: t.csv || '',
        rows: t.rows || 0,
        cols: t.cols || 0,
        headers: t.headers || [],
        dataRows: t.dataRows || [],
        source: t.source || 'Unknown',
        type: t.type || '',
    }));

    // Set initial active page and table
    const pages = getPageNumbers();
    appState.activePageTab = pages.length > 0 ? pages[0] : 1;
    const pageTables = getTablesByPage(appState.activePageTab);
    appState.activeTableIndex = pageTables.length > 0 ? pageTables[0].index : -1;
}

// ═══════════ Navigation API ═══════════

function scrollToTable(index) {
    // 1. Switch to Results tab
    switchMainTab('results');

    // 2. Find which page contains this table
    const table = appState.tables.find(t => t.index === index);
    if (!table) return;

    // 3. Switch to that page tab
    appState.activePageTab = table.pageNumber;
    renderResultsTab(); // Re-render to show correct page

    // 4. Scroll to table (using ID or class)
    // We need to ensure render completes first. Since render is synchronous mostly,
    // we can try to find the element.
    // Ideally, renderResultsTab creates elements with data-index.
    setTimeout(() => {
        const el = document.querySelector(`.table-tab-btn[data-index="${index}"]`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.click(); // Select it
        }
    }, 100);
}

// Attach to global app object if not already (appState is global, but functions are global too)
window.app = window.app || {};
window.app.scrollToTable = scrollToTable;

// ═══════════ State Mutation API ═══════════

function toggleApproval(tableIndex) {
    appState.tables[tableIndex].approved = !appState.tables[tableIndex].approved;
    renderAllTabs();
    updateStatusBar();
}

function setApproval(tableIndex, approved) {
    appState.tables[tableIndex].approved = approved;
    renderAllTabs();
    updateStatusBar();
}

function renameTable(tableIndex, newName) {
    appState.tables[tableIndex].tableName = newName;
    // Light update — just the sidebar label
    const tabBtn = document.querySelector(`.table-tab-btn[data-index="${tableIndex}"] .tab-label`);
    if (tabBtn) tabBtn.textContent = newName;

    // Record event
    if (typeof recordEvent === 'function') {
        recordEvent('renameTable', { tableIndex, newName });
    }
}

function promoteTable(tableIndex) {
    appState.tables[tableIndex].approved = true;
    appState.tables[tableIndex].confidence = 'user-approved';
    renderAllTabs();
    updateStatusBar();
}

function getApprovedTables() {
    return appState.tables.filter(t => t.approved);
}

function getRejectedTables() {
    return appState.tables.filter(t => !t.approved);
}

function getTablesByPage(pageNum) {
    return appState.tables.filter(t => t.pageNumber === pageNum);
}

function getPageNumbers() {
    const pages = new Set(appState.tables.map(t => t.pageNumber));
    return [...pages].sort((a, b) => a - b);
}

// ═══════════ Tab Controller ═══════════

function switchMainTab(tabName) {
    appState.activeMainTab = tabName;
    document.querySelectorAll('.main-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(c => {
        c.style.display = 'none';
    });
    const tabEl = document.getElementById(`tab-${tabName}`);
    if (tabEl) tabEl.style.display = 'block';
    renderTab(tabName);
}

function renderAllTabs() {
    renderTab(appState.activeMainTab);
}

function renderTab(name) {
    // Hide Record button unless on results tab
    const btnRecord = document.getElementById('btn-record-status');
    if (btnRecord) {
        btnRecord.style.display = (name === 'results') ? 'flex' : 'none';
    }

    switch (name) {
        case 'validator': if (typeof validator !== 'undefined' && typeof validator.renderTab === 'function') validator.renderTab(); break;
        case 'results': if (typeof renderResultsTab === 'function') renderResultsTab(); break;
        case 'batch':   renderBatchTab(); break;
        case 'edit':    renderPlaceholder('tab-edit', '✏️', 'Edit Tables (Beta)', 'Coming in Batch 3'); break;
        case 'settings': if (typeof renderSettingsTab === 'function') renderSettingsTab(); break;
        case 'stray':   renderPlaceholder('tab-stray', '📄', 'Stray Text', 'Coming in Batch 2'); break;
        case 'logs':    renderLogsTab(); break;
    }
}

function renderPlaceholder(containerId, icon, title, subtitle) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
        <div class="placeholder-tab">
            <div class="icon">${icon}</div>
            <h3>${title}</h3>
            <p>${subtitle}</p>
        </div>
    `;
}

function renderLogsTab() {
    const container = document.getElementById('tab-logs');
    if (!container) return;

    if (appState.logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📋</div>
                <h3>No logs yet</h3>
                <p>Extract a document to see processing logs.</p>
            </div>
        `;
        return;
    }

    let html = '<div class="logs-container">';
    for (const log of appState.logs) {
        let cls = 'log-line';
        const lower = log.toLowerCase();
        if (lower.includes('error')) cls += ' error';
        else if (lower.includes('warn')) cls += ' warn';
        else if (lower.includes('debug')) cls += ' debug';
        else if (lower.includes('info') || lower.includes('found') || lower.includes('complete')) cls += ' info';
        html += `<div class="${cls}">${escapeHTML(log)}</div>`;
    }
    html += '</div>';
    container.innerHTML = html;

    // Auto-scroll to bottom of logs
    const logContainer = container.querySelector('.logs-container');
    if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

// ═══════════ Status Bar ═══════════

function updateStatusBar() {
    const approved = appState.tables.filter(t => t.approved).length;
    const rejected = appState.tables.length - approved;

    document.getElementById('sb-file').textContent = appState.filename || 'No file loaded';
    document.getElementById('sb-tables').textContent = `Tables: ${appState.tables.length}`;
    document.getElementById('sb-approved').textContent = `✅ ${approved}`;
    document.getElementById('sb-rejected').textContent = `❌ ${rejected}`;
    document.getElementById('sb-pages').textContent = `Pages: ${appState.totalPages}`;
}

// ═══════════ UI Helpers ═══════════

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.toggle('active', show);
}

function showStatus(msg, type) {
    const el = document.getElementById('status');
    if (!el) return;
    el.textContent = msg;
    el.className = type || '';
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function downloadCSV(csv, filename) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function logAction(msg) {
    const timestamp = new Date().toLocaleTimeString();
    appState.logs.push(`[${timestamp}] ${msg}`);
    // If logs tab is active, re-render it
    if (appState.activeMainTab === 'logs') {
        renderLogsTab();
    }
}

// ═══════════ Record / Replay ═══════════

function toggleRecording() {
    appState.recording = !appState.recording;
    const btn = document.getElementById('btn-record-status');

    if (appState.recording) {
        appState.memory = []; // Clear previous memory
        btn.classList.add('recording');
        btn.classList.remove('dull');
        btn.innerHTML = '🔴 Recording...';
        showStatus('Recording started. Perform actions on tables.', 'working');
        updateBrainIcon();
    } else {
        btn.classList.remove('recording');
        btn.classList.add('dull');
        btn.innerHTML = '⏺️ Record';
        showStatus(`Recording stopped. Saved ${appState.memory.length} actions.`, 'success');
        updateBrainIcon();
    }
}

function updateBrainIcon() {
    const icon = document.getElementById('icon-brain-status');
    if (!icon) return;

    const hasMemory = appState.memory.length > 0;

    if (hasMemory) {
        icon.classList.add('available');
        icon.classList.remove('dull');
        icon.title = `Memory Available (${appState.memory.length} actions)`;
    } else {
        icon.classList.remove('available');
        icon.classList.add('dull');
        icon.title = 'Memory Empty';
    }
}

function recordEvent(action, params) {
    if (!appState.recording) return;

    // Store event
    appState.memory.push({ action, params });

    // Visual feedback
    logAction(`[REC] Recorded: ${action}`);
    updateBrainIcon();
}

function renderBatchTab() {
    const container = document.getElementById('tab-batch');
    if (!container) return;

    const hasMemory = appState.memory.length > 0;
    const btnClass = hasMemory ? 'available' : '';
    const btnTitle = hasMemory ? 'Run Recorded Macro' : 'No memory available';

    container.innerHTML = `
        <div class="batch-container">
            <h2>Batch Processing (Memory Replay)</h2>
            <button class="btn-brain-large ${btnClass}" onclick="replayMemory()" title="${btnTitle}" ${hasMemory ? '' : 'disabled'}>
                🧠
            </button>
            <p>${hasMemory ? 'Click the brain to replay recorded actions on current tables.' : 'Record actions in the Results tab first.'}</p>

            <div id="batch-log-container" class="batch-log">
                <div class="log-line debug">Waiting for command...</div>
            </div>
        </div>
    `;
}

async function replayMemory() {
    if (appState.memory.length === 0) {
        showStatus('No actions recorded.', 'error');
        return;
    }

    const logContainer = document.getElementById('batch-log-container');
    const log = (msg) => {
        if (logContainer) {
            const div = document.createElement('div');
            div.className = 'log-line info';
            div.textContent = msg;
            logContainer.appendChild(div);
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        console.log(`[REPLAY] ${msg}`);
    };

    log(`Starting replay of ${appState.memory.length} actions...`);

    for (let i = 0; i < appState.memory.length; i++) {
        const event = appState.memory[i];
        const { action, params } = event;

        try {
            log(`Step ${i+1}: ${action}`);

            // Map action string to function
            switch (action) {
                case 'updateHeaderName':
                    if (typeof updateHeaderName === 'function')
                        updateHeaderName(params.tableIndex, params.colIndex, params.newName);
                    break;
                case 'demoteHeaderToRow':
                    if (typeof demoteHeaderToRow === 'function')
                        demoteHeaderToRow(params.tableIndex);
                    break;
                case 'promoteRowToHeader':
                    if (typeof promoteRowToHeader === 'function')
                        promoteRowToHeader(params.tableIndex, params.rowIndex);
                    break;
                case 'deleteRow':
                    if (typeof deleteRow === 'function')
                        deleteRow(params.tableIndex, params.rowIndex);
                    break;
                case 'mergeTables':
                    // We must reproduce the selection!
                    appState.selectedTableIndices = new Set(params.indices);
                    if (typeof mergeTables === 'function')
                        mergeTables();
                    break;
                case 'fillDown':
                    if (typeof fillDown === 'function')
                        fillDown(params.tableIndex, params.colIndex);
                    break;
                case 'addTableNameColumn':
                    if (typeof addTableNameColumn === 'function')
                        addTableNameColumn(params.tableIndex);
                    break;
                case 'renameTable':
                    if (typeof renameTable === 'function')
                        renameTable(params.tableIndex, params.newName);
                    break;
                case 'restoreTable':
                    if (typeof restoreTable === 'function')
                        restoreTable(params.tableIndex);
                    break;
                default:
                    log(`Unknown action: ${action}`);
            }

            // Allow UI to update
            await new Promise(r => setTimeout(r, 100));

        } catch (e) {
            log(`Error at step ${i+1}: ${e.message}`);
        }
    }

    log('Replay complete.');
    showStatus('Batch replay complete', 'success');
}

// ═══════════ Init ═══════════

document.addEventListener('DOMContentLoaded', () => {
    detectMode();
    switchMainTab('results');
    updateStatusBar();

    // Set Version/Date
    const el = document.getElementById('sb-version');
    if (el) {
        // Hardcoded build time as requested
        el.textContent = "v2.2.3 | 12-Feb 12:30pm";
    }
    console.log("App Version: v2.2.3 loaded");
});
