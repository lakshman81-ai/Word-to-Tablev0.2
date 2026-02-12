/**
 * settings_tab.js — Application configuration
 */

const appSettings = {
    enableAutoNamer: true,
    enableValidator: true,
    debugMode: false,
    robustParsing: false
};

function renderSettingsTab() {
    const container = document.getElementById('tab-settings'); // Or re-use tab-edit?
    // Let's assume we map 'edit' tab to Settings or create a new 'settings' tab.
    // The plan said "re-purpose 'Edit Tables' or add a new one".
    // I'll stick to 'edit' tab for now, renaming it in UI if needed,
    // or just render into 'tab-edit'.

    if (!container) return;

    container.innerHTML = `
        <div class="settings-panel">
            <h2>Application Settings</h2>

            <div class="setting-group">
                <label>
                    <input type="checkbox" id="chk-autonamer" ${appSettings.enableAutoNamer ? 'checked' : ''} onchange="toggleSetting('enableAutoNamer')">
                    Enable Auto-Namer (Heuristic Column Renaming)
                </label>
                <p class="desc">Automatically renames generic columns like 'Column_1' if data is consistent.</p>
            </div>

            <div class="setting-group">
                <label>
                    <input type="checkbox" id="chk-validator" ${appSettings.enableValidator ? 'checked' : ''} onchange="toggleSetting('enableValidator')">
                    Enable Auto-Validator (Quality Rules)
                </label>
                <p class="desc">Automatically fixes common issues (empty rows, generic headers) and detects others.</p>
            </div>

            <div class="setting-group">
                <label>
                    <input type="checkbox" id="chk-debug" ${appSettings.debugMode ? 'checked' : ''} onchange="toggleSetting('debugMode')">
                    Debug Mode
                </label>
                <p class="desc">Show detailed logs in the console and Logs tab.</p>
            </div>

            <div class="setting-group">
                <label>
                    <input type="checkbox" id="chk-robust" ${appSettings.robustParsing ? 'checked' : ''} onchange="toggleSetting('robustParsing')">
                    Robust Parsing (Server Mode Only)
                </label>
                <p class="desc">Uses coordinate-based grid parsing to better handle merged cells. Slower but more accurate for complex tables.</p>
            </div>

            <div class="actions">
                <button class="btn-secondary" onclick="resetSettings()">Reset to Defaults</button>
            </div>
        </div>
    `;
}

function toggleSetting(key) {
    if (appSettings.hasOwnProperty(key)) {
        appSettings[key] = !appSettings[key];
        console.log(`Settings: ${key} set to ${appSettings[key]}`);

        // Persist to localStorage if desired (optional)
        localStorage.setItem('appSettings', JSON.stringify(appSettings));
    }
}

function loadSettings() {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(appSettings, parsed);
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }
}

function resetSettings() {
    appSettings.enableAutoNamer = true;
    appSettings.enableValidator = true;
    appSettings.debugMode = false;
    appSettings.robustParsing = false;
    localStorage.removeItem('appSettings');
    renderSettingsTab();
}

// Initialize
document.addEventListener('DOMContentLoaded', loadSettings);
