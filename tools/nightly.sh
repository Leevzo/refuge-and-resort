#!/bin/bash
# Run nightly on the Mac mini: rebuild rates.js from the newest public data, and publish it if it changed.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
echo "== $(date '+%Y-%m-%d %H:%M')"
git pull --rebase --quiet
/usr/bin/python3 -I tools/rates.py
if git diff --quiet -- rates.js; then
  echo "rates.js unchanged; nothing to publish."
  exit 0
fi
node --test >/dev/null 2>&1 || { echo "Tests failed; not publishing."; git checkout -- rates.js config.js; exit 1; }
git add rates.js config.js
git commit --quiet -m "Rates: $(date '+%Y-%m-%d') from Inside Airbnb"
git push --quiet
echo "Published new rates."
