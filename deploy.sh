#!/bin/bash

cd "$(dirname "$0")"

# 檢查是否有變更
git add .
if git diff --cached --quiet; then
  echo "✅ 沒有任何變更，無需 push。"
  exit 0
fi

# 用 Python 分析 diff，產生描述改動內容的 commit message
MSG=$(git diff --cached | PYTHONUTF8=1 python3 - << 'PYEOF'
import sys, re
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
    parts.append(f'新增：{preview}')
if removed:
    preview = '；'.join(removed[:2])
    if len(preview) > 40:
        preview = preview[:40] + '…'
    parts.append(f'移除：{preview}')

if parts:
    print('｜'.join(parts))
else:
    print('更新內容')
PYEOF
)

TIMESTAMP=$(date "+%Y-%m-%d %H:%M")
FULL_MSG="$MSG｜$TIMESTAMP"

git commit -m "$FULL_MSG"
git push

echo ""
echo "🚀 已成功部署！"
echo "📝 Commit：$FULL_MSG"
