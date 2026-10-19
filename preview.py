#!/usr/bin/env python3
"""
本地預覽伺服器：模擬 Netlify Function /.netlify/functions/views
用法：python3 preview.py
然後打開 http://localhost:8080
"""
import http.server, json, os, urllib.parse

PORT = 8080
BASE = os.path.dirname(os.path.abspath(__file__))
COUNTER_FILE = os.path.join(BASE, '.preview_views_count')

def get_count():
    try:
        with open(COUNTER_FILE) as f:
            return int(f.read().strip())
    except:
        return 0

def inc_count():
    c = get_count() + 1
    with open(COUNTER_FILE, 'w') as f:
        f.write(str(c))
    return c

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=BASE, **kw)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == '/.netlify/functions/views':
            count = inc_count()
            body = json.dumps({'count': count}).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(body)
            print(f'  [views] count = {count}')
        else:
            super().do_GET()

    def log_message(self, fmt, *args):
        if '/.netlify/functions/' not in args[0]:
            super().log_message(fmt, *args)

with http.server.HTTPServer(('', PORT), Handler) as httpd:
    print(f'預覽伺服器啟動：http://localhost:{PORT}')
    print('按 Ctrl+C 停止\n')
    httpd.serve_forever()
