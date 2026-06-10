#!/usr/bin/env bash
#
# ReadStack one-shot deploy — run ON the Akamai (Linode) CPU app box as root.
# Stands up backend (uvicorn) + frontend (Next) behind Caddy with auto-HTTPS,
# wired to pgvector + Anthropic. No GPU. Idempotent: safe to re-run to redeploy.
#
# Prereqs (see DEPLOY.md Part 1): a pgvector box reachable from this box, and an
# A record pointing your domain at THIS box's IP (Caddy needs it for the cert).
#
# Usage:
#   1. Create /opt/readstack-deploy.env (or export these in your shell):
#        DOMAIN=readstack.itamih.com
#        DATABASE_URL=postgresql://user:pass@<db-ip>:5432/readstack
#        ANTHROPIC_API_KEY=sk-ant-...
#        # optional: REPO_URL, BRANCH, MOCK=1 (skip Anthropic, run on mock)
#   2. curl -fsSL <raw deploy.sh> -o deploy.sh   # or scp it up
#   3. sudo bash deploy.sh
#
set -euo pipefail

# --- config ------------------------------------------------------------------
ENV_FILE="${ENV_FILE:-/opt/readstack-deploy.env}"
[ -f "$ENV_FILE" ] && { echo "Loading $ENV_FILE"; set -a; . "$ENV_FILE"; set +a; }

REPO_URL="${REPO_URL:-https://github.com/sameerhimati/ReadStack.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/readstack}"
DOMAIN="${DOMAIN:?Set DOMAIN (e.g. readstack.itamih.com)}"

if [ "${MOCK:-0}" != "1" ]; then
  : "${DATABASE_URL:?Set DATABASE_URL (or MOCK=1 to run without a DB/key)}"
  : "${ANTHROPIC_API_KEY:?Set ANTHROPIC_API_KEY (or MOCK=1)}"
fi

[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo bash deploy.sh)"; exit 1; }

echo "==> Deploying ReadStack to https://$DOMAIN  (branch: $BRANCH)"

# --- 1. system packages ------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git python3-venv python3-pip caddy curl ca-certificates
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# --- 2. code -----------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  echo "==> Updating existing checkout"
  git -C "$APP_DIR" fetch --all --quiet
  git -C "$APP_DIR" checkout "$BRANCH" --quiet
  git -C "$APP_DIR" reset --hard "origin/$BRANCH" --quiet
else
  echo "==> Cloning $REPO_URL"
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

# --- 3. backend --------------------------------------------------------------
echo "==> Backend: venv + deps"
python3 -m venv "$APP_DIR/backend/.venv"
"$APP_DIR/backend/.venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/backend/.venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"

# Backend env. Embeddings always run locally on this CPU box (the volume
# inference); generation goes to Anthropic. NEVER set AKAMAI_INFERENCE_URL here
# (no GPU) — the router falls back to Claude automatically.
if [ "${MOCK:-0}" = "1" ]; then
  cat > "$APP_DIR/backend/.env" <<EOF
MOCK_INFERENCE=1
EOF
else
  cat > "$APP_DIR/backend/.env" <<EOF
DATABASE_URL=$DATABASE_URL
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
EOF
fi
chmod 600 "$APP_DIR/backend/.env"

# --- 4. frontend (static-served Next, client-fetches the API) ----------------
echo "==> Frontend: build"
echo "NEXT_PUBLIC_API_URL=https://$DOMAIN" > "$APP_DIR/frontend/.env.production"
( cd "$APP_DIR/frontend" && npm ci --no-audit --no-fund && npm run build )

# --- 5. systemd units (survive reboot + disconnect) --------------------------
echo "==> systemd units"
cat > /etc/systemd/system/readstack-backend.service <<EOF
[Unit]
Description=ReadStack backend (uvicorn)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$APP_DIR/backend
EnvironmentFile=$APP_DIR/backend/.env
ExecStart=$APP_DIR/backend/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/readstack-frontend.service <<EOF
[Unit]
Description=ReadStack frontend (Next)
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=$APP_DIR/frontend
ExecStart=/usr/bin/npm run start -- --port 3000
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now readstack-backend readstack-frontend
systemctl restart readstack-backend readstack-frontend

# --- 6. Caddy: single origin, auto-HTTPS, no CORS ----------------------------
echo "==> Caddyfile"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    # API -> uvicorn
    handle /pipeline*          { reverse_proxy 127.0.0.1:8000 }
    handle /snapshot*          { reverse_proxy 127.0.0.1:8000 }
    handle /add*               { reverse_proxy 127.0.0.1:8000 }
    handle /article*           { reverse_proxy 127.0.0.1:8000 }
    handle /lesson/*           { reverse_proxy 127.0.0.1:8000 }
    handle /topic/*            { reverse_proxy 127.0.0.1:8000 }
    handle /generate-media*    { reverse_proxy 127.0.0.1:8000 }
    handle /media/*            { reverse_proxy 127.0.0.1:8000 }
    handle /health*            { reverse_proxy 127.0.0.1:8000 }
    # everything else -> the Next frontend
    handle                     { reverse_proxy 127.0.0.1:3000 }
}
EOF
systemctl reload caddy || systemctl restart caddy

# --- 7. bake the snapshot once (the only step that runs inference) -----------
echo "==> Waiting for backend, then baking the snapshot"
for i in $(seq 1 30); do
  curl -fsS -m 3 http://127.0.0.1:8000/health >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS -m 600 -X POST http://127.0.0.1:8000/pipeline \
  -H 'Content-Type: application/json' -d '{}' >/dev/null \
  && echo "==> Snapshot baked." \
  || echo "!! Bake failed — check: journalctl -u readstack-backend -n 50"

echo
echo "==> Done.  Open:  https://$DOMAIN"
echo "    logs:   journalctl -u readstack-backend -f   |   journalctl -u readstack-frontend -f"
echo "    rebake: curl -X POST http://127.0.0.1:8000/pipeline -d '{}' -H 'Content-Type: application/json'"
