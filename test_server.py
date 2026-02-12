"""Test the /extract endpoint with R5.docx"""
import urllib.request
import os
import json

docx_path = r'C:\Code\R5.docx'
print(f"File: {docx_path}")
print(f"Exists: {os.path.exists(docx_path)}")
print(f"Size: {os.path.getsize(docx_path)} bytes")

with open(docx_path, 'rb') as f:
    file_data = f.read()

boundary = b'----TestBoundary123'

body = b''
body += b'------TestBoundary123\r\n'
body += b'Content-Disposition: form-data; name="mode"\r\n\r\n'
body += b'Smart\r\n'
body += b'------TestBoundary123\r\n'
body += b'Content-Disposition: form-data; name="file"; filename="R5.docx"\r\n'
body += b'Content-Type: application/octet-stream\r\n\r\n'
body += file_data
body += b'\r\n------TestBoundary123--\r\n'

req = urllib.request.Request(
    'http://localhost:8000/extract',
    data=body,
    headers={
        'Content-Type': 'multipart/form-data; boundary=----TestBoundary123',
    },
    method='POST'
)

try:
    resp = urllib.request.urlopen(req, timeout=60)
    result = resp.read().decode()
    print(f"\nStatus: {resp.status}")
    print(f"Response length: {len(result)}")
    
    data = json.loads(result)
    if data.get('success'):
        print(f"SUCCESS! Found {len(data['tables'])} tables")
        for i, t in enumerate(data['tables']):
            print(f"  Table {i+1}: {t['rows']} rows x {t['cols']} cols ({t['source']}, {t['confidence']})")
    else:
        print(f"Error: {data.get('error')}")
    
    if data.get('logs'):
        print("\nLogs:")
        for log in data['logs']:
            print(f"  {log}")

except urllib.error.HTTPError as e:
    print(f"\nHTTP Error: {e.code}")
    body = e.read().decode()
    print(f"Response: {body[:500]}")
except Exception as e:
    print(f"\nError: {type(e).__name__}: {e}")
