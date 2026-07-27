#!/usr/bin/env bash
# One-shot ArbTrack install for Ubuntu VPS (SpaceWeb and similar)
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/arbtrack}"
REPO_URL="${REPO_URL:-https://github.com/NitLex/proba.git}"
REPO_BRANCH="${REPO_BRANCH:-cursor/arbitrage-tracker-binom-fa77}"

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating system packages"
apt-get update -y
apt-get install -y curl git build-essential ufw

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2"
  npm install -g pm2
fi

echo "==> Fetching ArbTrack ($REPO_BRANCH)"
mkdir -p "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin
  git checkout "$REPO_BRANCH"
  git pull origin "$REPO_BRANCH"
else
  rm -rf "$APP_DIR"
  git clone -b "$REPO_BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "==> Installing dependencies"
npm install
npm run install:all
npm run seed --prefix server
npm run build

echo "==> Opening firewall ports"
ufw allow OpenSSH || true
ufw allow 3001/tcp || true
ufw --force enable || true

echo "==> Starting with PM2"
pm2 delete arbtrack >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "=============================="
echo " ArbTrack is running"
echo " Open: http://${IP:-YOUR_IP}:3001"
echo " Login: demo / demo123"
echo " Or register a new user"
echo "=============================="
pm2 status
