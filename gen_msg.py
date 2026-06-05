#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import sys, re

sys.stdin.reconfigure(encoding='utf-8', errors='replace')
sys.stdout.reconfigure(encoding='utf-8')

diff = sys.stdin.read()
added, removed = [], []

for line in diff.splitlines():
    if line.startswith('+') and not line.startswith('+++'):
        text = re.sub(r'<[^>]+>', ' ', line[1:]).strip()
        text = re.sub(r'\s+', ' ', text).strip()
        if len(text) > 3:
            added.append(text)
    elif line.startswith('-') and not line.startswith('---'):
        text = re.sub(r'<[^>]+>', ' ', line[1:]).strip()
        text = re.sub(r'\s+', ' ', text).strip()
        if len(text) > 3:
            removed.append(text)

parts = []
if added:
    preview = '；'.join(added[:3])
    if len(preview) > 60:
        preview = preview[:60] + '…'
    parts.append('新增：' + preview)
if removed:
    preview = '；'.join(removed[:2])
    if len(preview) > 40:
        preview = preview[:40] + '…'
    parts.append('移除：' + preview)

print('｜'.join(parts) if parts else '更新內容')
