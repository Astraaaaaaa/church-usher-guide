#!/bin/bash

cd "$(dirname "$0")"

# 檢查是否有變更
git add .
if git diff --cached --quiet; then
  echo "✅ 沒有任何變更，無需 push。"
  exit 0
fi

# 用 Python 分析 diff，產生描述改動內容的 commit message
# 傳 --stat 摘要 + 僅文字檔 diff（排除二進位圖片等）
DIFF_INPUT=$(
  echo "=== 變更摘要 ==="
  git -c core.quotepath=false diff --cached --stat
  echo ""
  echo "=== 文字檔內容 ==="
  git -c core.quotepath=false diff --cached -- '*.html' '*.js' '*.css' '*.ts' '*.json' '*.md' '*.txt' '*.sh' '*.py'
)
MSG=$(echo "$DIFF_INPUT" | PYTHONUTF8=1 python3 "$(dirname "$0")/gen_msg.py")

if [[ "$1" == "--no-deploy" ]]; then
  FULL_MSG="$MSG [skip netlify]"
  git commit -m "$FULL_MSG"
  git push
  echo ""
  echo "📤 已 push 到 GitHub（Netlify 不部署）"
  echo "📝 Commit：$FULL_MSG"
else
  git commit -m "$MSG"
  git push
  echo ""
  echo "🚀 已成功部署！"
  echo "📝 Commit：$MSG"
fi
