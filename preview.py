#!/usr/bin/env python3
"""Local preview server — index.html calls GAS directly via JSONP"""

import http.server, os, socketserver

PORT = 8888

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

os.chdir(os.path.dirname(os.path.abspath(__file__)))
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"✅  預覽伺服器啟動：http://localhost:{PORT}/index.html")
    print("    按 Ctrl+C 停止")
    httpd.serve_forever()
