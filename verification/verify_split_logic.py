from playwright.sync_api import sync_playwright
import os
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load local index.html
        cwd = os.getcwd()
        filepath = os.path.join(cwd, "index.html")
        print(f"Loading {filepath}")
        page.goto(f"file://{filepath}")

        # Verify version meta
        try:
            version_meta = page.locator("meta[name='version']")
            version = version_meta.get_attribute("content")
            print(f"Meta Version: {version}")
        except:
            print("Meta version not found")

        # Inject mock data into appState (matches image.png example partially)
        # We need a table with one row that has:
        # Col 0: "Pipe\nPipe"
        # Col 1: "181" (no newline)
        # Col 2: "691\n691"

        # We access appState directly (it is in global scope for non-module scripts)
        page.evaluate("""
            appState.tables = [{
                index: 0,
                tableName: "Pipe Table",
                headers: ["Item", "Size", "Code"],
                dataRows: [
                    ["Pipe\\nPipe", "181", "691\\n691"]
                ],
                rows: 1,
                cols: 3,
                pageNumber: 4,
                confidence: "high"
            }];
            // Render initial state (results tab)
            renderAllTabs();
        """)

        # Check if validator object exists.
        page.evaluate("if (typeof validator === 'undefined') throw new Error('Validator not loaded');")

        print("Triggering validation...")

        # Start validation.
        page.evaluate("validator.validateAll()")

        # Wait for modal
        try:
            # Wait for modal to appear
            page.wait_for_selector("#validator-modal", state="visible", timeout=5000)
            print("Modal appeared.")

            # Take screenshot of the modal to see what it proposes
            page.screenshot(path="verification/modal_preview.png")

            # Click "Yes, Split" button
            # We use force=True just in case, but standard click should work
            page.click("#vm-yes")
            print("Clicked 'Yes, Split'.")

            # Wait for modal to disappear
            page.wait_for_selector("#validator-modal", state="hidden", timeout=5000)
            print("Modal closed.")

        except Exception as e:
            print(f"Error handling modal: {e}")
            page.screenshot(path="verification/error.png")
            browser.close()
            return

        # Now verify the table data in appState or UI

        # Switch to Results tab to ensure we are viewing the table
        page.evaluate("switchMainTab('results')")

        # Wait for table
        page.wait_for_selector(".result-table")

        # Take final screenshot
        screenshot_path = "verification/split_result.png"
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        # Verify content programmatically
        rows = page.locator(".result-table tbody tr")
        count = rows.count()
        print(f"Rows after split: {count}")

        if count != 2:
            print("FAILED: Expected 2 rows.")
        else:
            row0_text = rows.nth(0).inner_text()
            row1_text = rows.nth(1).inner_text()
            print(f"Row 0: {row0_text}")
            print(f"Row 1: {row1_text}")

            # Check cell specifically. Row 1, Col 1 should be empty
            # Note: inner_text might be empty string or whitespace
            cell_1_1 = rows.nth(1).locator("td").nth(1).inner_text().strip()
            print(f"Cell (1,1) content: '{cell_1_1}'")

            if cell_1_1 == "":
                print("SUCCESS: Cell (1,1) is empty as expected.")
            else:
                print(f"FAILURE: Cell (1,1) is '{cell_1_1}', expected empty string.")

        browser.close()

if __name__ == "__main__":
    run()
