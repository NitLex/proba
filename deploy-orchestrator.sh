#!/usr/bin/env bash
# One-shot Orchestrator install for Ubuntu VPS (SpaceWeb / orkestr.online)
# Tracker stays on trekerarbitrag.ru — this host only runs the pipeline UI/API.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/orkestr}"
REPO_URL="${REPO_URL:-https://github.com/NitLex/proba.git}"
REPO_BRANCH="${REPO_BRANCH:-cursor/orchestrator-tab-47f8}"
DOMAIN="${DOMAIN:-orkestr.online}"
TRACKER_URL="${TRACKER_URL:-https://trekerarbitrag.ru}"

export DEBIAN_FRONTEND=noninteractive

echo "==> Updating system packages"
apt-get update -y
apt-get install -y curl git build-essential ufw nginx certbot python3-certbot-nginx

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "==> Installing PM2"
  npm install -g pm2
fi

echo "==> Fetching Orchestrator ($REPO_BRANCH)"
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

if [ ! -f "$APP_DIR/SECRETS.env" ] && [ ! -f "$APP_DIR/.env" ]; then
  echo "==> Creating starter .env (fill secrets before production use)"
  cat > "$APP_DIR/.env" <<EOF
APP_MODE=orchestrator
ORCHESTRATOR_PUBLIC_URL=https://${DOMAIN}
ARBTRACK_PUBLIC_URL=${TRACKER_URL}
PIPELINE_TRACKER_MODE=remote
ARBTRACK_USERNAME=
ARBTRACK_PASSWORD=
IMAGE_PROVIDER=agent
PORT=3001
EOF
fi

echo "==> Opening firewall"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
ufw allow 3001/tcp || true
ufw --force enable || true

echo "==> Nginx site for ${DOMAIN}"
cat > /etc/nginx/sites-available/orkestr <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
ln -sfn /etc/nginx/sites-available/orkestr /etc/nginx/sites-enabled/orkestr
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if [ "${SKIP_CERTBOT:-0}" != "1" ]; then
  echo "==> Trying Let's Encrypt for ${DOMAIN}"
  certbot --nginx -d "${DOMAIN}" -d "www.${DOMAIN}" --non-interactive --agree-tos \
    -m "admin@${DOMAIN}" --redirect || echo "WARN: certbot failed — check DNS A → this VPS, then rerun certbot"
fi

echo "==> Starting with PM2"
pm2 delete orkestr >/dev/null 2>&1 || true
pm2 delete arbtrack >/dev/null 2>&1 || true
# PM2 7 may treat *.cjs ecosystem as a script — start entry explicitly
pm2 start src/index.js --name orkestr --cwd "$APP_DIR/server" || \
  pm2 start "$APP_DIR/ecosystem.orchestrator.cjs" --only orkestr
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo ""
echo "=============================="
echo " Orchestrator is running"
echo " Open: https://${DOMAIN}  (or http://${IP:-YOUR_IP}:3001)"
echo " APP_MODE=orchestrator → remote tracker ${TRACKER_URL}"
echo " Fill ARBTRACK_USERNAME / ARBTRACK_PASSWORD + API keys in SECRETS.env"
echo "=============================="
pm2 status
curl -sS "http://127.0.0.1:3001/api/health" || true
echo
