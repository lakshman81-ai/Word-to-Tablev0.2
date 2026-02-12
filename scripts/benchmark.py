import word_to_table
import smart_table_extractor
import os
import pandas as pd
import json

def benchmark(files):
    results = []

    for f in files:
        if not os.path.exists(f):
            print(f"Skipping {f} (Not found)")
            continue

        print(f"Benchmarking {f}...")

        # Old Logic (Rule-based)
        try:
            old_data = word_to_table.parse_docx(f)
            old_count = sum(len(dfs) for dfs in old_data.values())
            old_rows = sum(sum(len(df) for df in dfs) for dfs in old_data.values())
        except Exception as e:
            old_count = -1
            old_rows = -1
            print(f"Old Logic Error on {f}: {e}")

        # New Logic (Smart/Heuristic)
        try:
            extractor = smart_table_extractor.SmartTableExtractor(f)
            new_data = extractor.extract_all()
            new_count = len(new_data)
            new_rows = sum(len(res['df']) for res in new_data)
        except Exception as e:
            new_count = -1
            new_rows = -1
            print(f"New Logic Error on {f}: {e}")

        results.append({
            "File": f,
            "Old_Tables": old_count,
            "Old_Rows": old_rows,
            "New_Tables": new_count,
            "New_Rows": new_rows
        })

    return pd.DataFrame(results)

if __name__ == "__main__":
    # Define files to test
    files = ["test_phase2.docx", "dummy_test.docx"]

    # Check if other potential files exist
    extras = ["Docs/R5.doc", "Docs/input.md"]
    for e in extras:
        if os.path.exists(e):
            files.append(e)

    df = benchmark(files)
    print("\nBenchmark Results:")
    print(df.to_string())

    # Save report
    with open("benchmark_report.txt", "w") as f:
        f.write("Benchmark Report\n")
        f.write("================\n\n")
        f.write(df.to_string())
        f.write("\n\nNote:\n")
        f.write("- Old_Tables: Count of tables matched by specific rules (Bolting, Piping, etc.)\n")
        f.write("- New_Tables: Count of ALL tables extracted by Smart Logic.\n")
