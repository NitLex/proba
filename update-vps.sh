#!/usr/bin/env bash
# Update ArbTrack on VPS (run from /var/www/arbtrack)
set -euo pipefail
cd "$(dirname "$0")"

BRANCH="${1:-cursor/arbitrage-tracker-binom-fa77}"

echo "==> Pulling $BRANCH"
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"

echo "==> Installing & building"
npm install
npm run install:all
npm run build

echo "==> Restarting"
pm2 restart arbtrack || pm2 start ecosystem.config.cjs
pm2 save

echo "==> Done"
pm2 status
