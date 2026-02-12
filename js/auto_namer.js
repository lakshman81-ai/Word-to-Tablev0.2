/**
 * auto_namer.js — Heuristic Column Renaming
 *
 * Analyzes column data to suggest better names for generic headers (Column_1, etc.)
 */

class AutoColumnNamer {
    constructor() {
        this.threshold = 0.6; // 60% of non-empty rows must match top value
        this.minRows = 3;     // Minimum rows to make a decision
    }

    run(tables) {
        console.log("AutoNamer: Analyzing columns...");
        let changed = false;

        for (const table of tables) {
            if (!table.headers) continue;

            const newHeaders = [...table.headers];
            let tableChanged = false;

            for (let i = 0; i < newHeaders.length; i++) {
                const header = newHeaders[i];

                // Only rename generic headers
                if (!header || header.startsWith('Column_')) {
                    const colData = this._getColumnData(table.dataRows, i);
                    const suggestion = this._analyzeColumn(colData);

                    if (suggestion) {
                        // Rename: "Column_1" -> "Column_1(Pipe)"
                        // Or if header was empty -> "Pipe"
                        const base = header || `Column_${i+1}`;
                        newHeaders[i] = `${base}(${suggestion})`;
                        tableChanged = true;
                        console.log(`AutoNamer: Renamed ${base} -> ${newHeaders[i]} in Table ${table.index + 1}`);
                    }
                }
            }

            if (tableChanged) {
                table.headers = newHeaders;
                changed = true;
            }
        }

        if (changed) {
            // Update UI? app.js usually handles this if we return true or modify state.
            // But since this is run at extraction time, the render happens after.
            // If run manually, we might need to trigger render.
        }

        return changed;
    }

    _getColumnData(rows, colIndex) {
        return rows.map(row => row[colIndex]).filter(val => val && val.trim() !== '');
    }

    _analyzeColumn(values) {
        if (values.length < this.minRows) return null;

        const counts = {};
        for (const v of values) {
            const clean = v.trim();
            counts[clean] = (counts[clean] || 0) + 1;
        }

        // Find top value
        let topVal = null;
        let topCount = 0;

        for (const [val, count] of Object.entries(counts)) {
            if (count > topCount) {
                topCount = count;
                topVal = val;
            }
        }

        // Check frequency
        if (topVal && (topCount / values.length) >= this.threshold) {
            // Truncate if too long
            return topVal.length > 15 ? topVal.substring(0, 12) + '...' : topVal;
        }

        return null;
    }
}

// Export global instance
const autoNamer = new AutoColumnNamer();
