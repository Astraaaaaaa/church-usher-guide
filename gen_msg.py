#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, subprocess, re

sys.stdin.reconfigure(encoding='utf-8', errors='replace')
sys.stdout.reconfigure(encoding='utf-8')

diff = sys.stdin.read()

# ── LLM-based generation (requires claude CLI) ────────────────────────────────
try:
    prompt = (
        "根據以下 git diff，生成一行繁體中文 commit message。\n"
        "格式：<type>: <描述>（30 字以內）\n"
        "type：feat 新功能 / fix 修復 / style 樣式 / refactor 重構 / chore 設定\n"
        "只輸出 commit message，不要任何解釋或多餘文字。\n\n"
        f"git diff:\n{diff[:4000]}"
    )
    result = subprocess.run(
        ['claude', '-p', prompt],
        capture_output=True, text=True, timeout=30, encoding='utf-8'
    )
    if result.returncode == 0:
        msg = result.stdout.strip().splitlines()[0].strip()
        if msg:
            print(msg)
            sys.exit(0)
except Exception:
    pass

# ── Fallback: keyword extraction from changed files ───────────────────────────
changed_files = set()
for line in diff.splitlines():
    if line.startswith('diff --git'):
        parts = line.split(' b/')
        if len(parts) > 1:
            changed_files.add(parts[-1].strip())

if changed_files:
    files = ', '.join(sorted(changed_files)[:3])
    print(f'chore: 更新 {files}')
else:
    print('chore: 更新內容')
