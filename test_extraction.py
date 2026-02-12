"""
Automated test script to verify the Word Table Extractor works correctly
"""
import os
import sys
sys.path.insert(0, 'scripts')

import word_to_table
import smart_table_extractor

def test_extraction():
    test_file = "test_phase2.docx"
    
    if not os.path.exists(test_file):
        print(f"ERROR: Test file {test_file} not found!")
        return False
    
    print(f"Testing extraction on: {test_file}")
    print("=" * 60)
    
    # Test Standard Extraction
    print("\n1. Testing Standard (Rule-Based) Extraction...")
    try:
        data_store = word_to_table.parse_docx(test_file)
        table_count = sum(len(tables) for tables in data_store.values())
        print(f"   ✓ Standard extraction successful!")
        print(f"   ✓ Found {table_count} tables")
        for key, tables in data_store.items():
            print(f"   - {key}: {len(tables)} table(s)")
    except Exception as e:
        print(f"   ✗ Standard extraction failed: {e}")
        return False
    
    # Test Smart Extraction
    print("\n2. Testing Smart (Heuristic) Extraction...")
    try:
        extractor = smart_table_extractor.SmartTableExtractor(test_file)
        results = extractor.extract_all()
        print(f"   ✓ Smart extraction successful!")
        print(f"   ✓ Found {len(results)} tables")
        for i, res in enumerate(results):
            df = res['df']
            conf = res['meta']['confidence']
            print(f"   - Table {i+1}: {len(df)} rows, confidence: {conf}")
    except Exception as e:
        print(f"   ✗ Smart extraction failed: {e}")
        return False
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS PASSED!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = test_extraction()
    sys.exit(0 if success else 1)
