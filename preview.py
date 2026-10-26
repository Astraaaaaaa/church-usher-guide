#!/usr/bin/env python3
"""
本地預覽伺服器：模擬 Netlify Functions
- /.netlify/functions/views   → 瀏覽計數
- /.netlify/functions/reactions → emoji 投票（本地用假資料）
用法：python3 preview.py
然後打開 http://localhost:8080
"""
import http.server, json, os, urllib.parse

PORT = 8080
BASE = os.path.dirname(os.path.abspath(__file__))
COUNTER_FILE = os.path.join(BASE, '.preview_views_count')

# 本地票數（重啟歸零，僅供測試 UI）
_reactions = {}

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
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = dict(urllib.parse.parse_qsl(parsed.query))

        if path == '/.netlify/functions/views':
            count = inc_count()
            body = json.dumps({'count': count}).encode()
            self._json(body)
            print(f'  [views] count = {count}')

        elif path == '/.netlify/functions/reactions':
            emoji = params.get('emoji', '')
            text  = params.get('text', '')
            if emoji:
                _reactions[emoji] = _reactions.get(emoji, 0) + 1
            print(f'  [reactions] emoji={emoji!r} text={text!r} counts={_reactions}')
            body = json.dumps({'ok': True, 'counts': _reactions}).encode()
            self._json(body)

        else:
            super().do_GET()

    def _json(self, body):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if '/.netlify/functions/' not in args[0]:
            super().log_message(fmt, *args)

with http.server.HTTPServer(('', PORT), Handler) as httpd:
    print(f'預覽伺服器啟動：http://localhost:{PORT}')
    print('按 Ctrl+C 停止\n')
    httpd.serve_forever()
