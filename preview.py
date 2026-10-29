#!/usr/bin/env python3
"""
本地預覽伺服器：模擬 Netlify Functions
- /.netlify/functions/views      → 瀏覽計數
- /.netlify/functions/reactions  → emoji 投票（本地假資料）
- /.netlify/functions/subscribe  → 推播訂閱（本地假資料，印出資訊）
用法：python3 preview.py
然後打開 http://localhost:8080
"""
import http.server, json, os, urllib.parse, urllib.request

GAS_URL = 'https://script.google.com/macros/s/AKfycbynXDyXAO8dGLvzC6SnrBlyKFdrAAddgc4cmYjS0XxCwzNRg3-0PMns0BKI1k9HIz5G/exec'

# 本地訂閱記錄（重啟歸零）
_subscriptions = []
_cache = {'sheet': None}  # 快取 sheet 資料，避免重複呼叫 GAS

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

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/.netlify/functions/subscribe':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                name = data.get('name', '')
                notify_time = data.get('notifyTime', '17:30')
                sub  = data.get('subscription', {})
                entry = {'name': name, 'notifyTime': notify_time, 'subscription': sub}
                _subscriptions.append(entry)
                # 存到檔案，讓測試腳本可以讀
                subs_file = os.path.join(BASE, '.preview_subscriptions.json')
                with open(subs_file, 'w') as f:
                    json.dump(_subscriptions, f, ensure_ascii=False, indent=2)
                print(f'  [subscribe] name={name!r}  notifyTime={notify_time}')
                print(f'  [subscribe] 已存到 .preview_subscriptions.json')
                resp = json.dumps({'ok': True}).encode()
            except Exception as ex:
                print(f'  [subscribe] 錯誤：{ex}')
                resp = json.dumps({'ok': False}).encode()
            self._json(resp)
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = dict(urllib.parse.parse_qsl(parsed.query))

        if path == '/.netlify/functions/views':
            count = inc_count()
            body = json.dumps({'count': count}).encode()
            self._json(body)
            print(f'  [views] count = {count}')

        elif path == '/.netlify/functions/subscribe' and params.get('action') == 'names':
            # 直接呼叫 GAS ?action=names（和 Netlify function 一樣）
            try:
                url = f'{GAS_URL}?action=names'
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=15) as r:
                    body_bytes = r.read()
                data = json.loads(body_bytes)
                names = data.get('names', [])
                if not names:
                    raise ValueError('empty names from GAS')
                print(f'  [names] 抓到 {len(names)} 個名字：{names[:5]}…')
                self._json(json.dumps({'names': names}).encode())
            except Exception as ex:
                print(f'  [names] GAS 錯誤：{ex}，使用測試假名單')
                fallback = {'names': ['測試同工甲', '測試同工乙', '測試同工丙']}
                self._json(json.dumps(fallback).encode())

        elif path == '/.netlify/functions/sheet':
            tab = params.get('tab', '2026')
            try:
                url = f'{GAS_URL}?tab={urllib.parse.quote(tab)}'
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=15) as r:
                    body = r.read()
                parsed_rows = json.loads(body)
                _cache['sheet'] = parsed_rows
                print(f'  [sheet] tab={tab!r} → {len(body)} bytes，{len(parsed_rows)} rows')
            except Exception as ex:
                print(f'  [sheet] 錯誤：{ex}')
                body = b'[]'
            self._json(body)

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
