#!/bin/bash

cd "$(dirname "$0")"

# 檢查是否有變更
git add .
if git diff --cached --quiet; then
  echo "✅ 沒有任何變更，無需 push。"
  exit 0
fi

# 用 Python 分析 diff，產生描述改動內容的 commit message
MSG=$(git -c core.quotepath=false diff --cached | PYTHONUTF8=1 python3 "$(dirname "$0")/gen_msg.py")

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
