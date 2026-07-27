#!/usr/bin/env bash
# Update Orchestrator on VPS (run from /var/www/orkestr)
set -euo pipefail
cd "$(dirname "$0")"

BRANCH="${1:-cursor/orchestrator-tab-47f8}"

echo "==> Pulling $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> Installing & building"
npm install
npm run install:all
npm run build

echo "==> Restarting"
pm2 restart orkestr --update-env \
  || pm2 start src/index.js --name orkestr --cwd "$(pwd)/server"
pm2 save

echo "==> Done"
pm2 status
curl -sS http://127.0.0.1:3001/api/health || true
echo
