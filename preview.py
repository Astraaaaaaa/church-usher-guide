#!/usr/bin/env python3
"""Local preview server — fetches Google Sheet CSV and serves as JSON"""

import http.server, urllib.request, urllib.parse, csv, json, io, os, socketserver, time

PORT = 8888
SHEET_ID = "1CMaaFrrabbTXgVbBi9vFi_OWrbYbMvqkfTBKI9DTKww"

def csv_url(tab):
    bust = int(time.time())
    return (
        f"https://docs.google.com/spreadsheets/d/{SHEET_ID}"
        f"/gviz/tq?tqx=out:csv&sheet={urllib.parse.quote(tab)}&_cb={bust}"
    )

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/.netlify/functions/sheet"):
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            tab = params.get("tab", ["2026"])[0]
            self._serve_sheet(tab)
        else:
            super().do_GET()

    def _serve_sheet(self, tab):
        try:
            req = urllib.request.Request(csv_url(tab), headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=15) as r:
                raw = r.read().decode("utf-8")
            rows = list(csv.reader(io.StringIO(raw)))
            out = json.dumps(rows).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(out)
        except Exception as e:
            err = json.dumps({"error": str(e)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err)

    def log_message(self, fmt, *args):
        pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"✅  預覽伺服器啟動：http://localhost:{PORT}/index.html")
    print("    按 Ctrl+C 停止")
    httpd.serve_forever()
