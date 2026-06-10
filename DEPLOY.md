# ReadStack — Akamai (Linode) Deploy Runbook

All-Akamai stack: pgvector (DB) + a CPU box (backend+frontend) + a GPU box (Ollama).
The app runs on **mock today** (no GPU needed) — stand up the public URL first, wire
the GPU in later with 3 env vars. Put **every box in the SAME region**.

Repo: `git@github.com:sameerhimati/ReadStack.git`

---

## Part 1 — pgvector (the database) — Marketplace one-click

1. **Linodes → Create → Marketplace** → search **pgvector** → select it.
2. App options: set a **database password** (note it) and DB name (e.g. `readstack`).
3. **Plan:** Dedicated **4 GB**. **Region:** your chosen region (reuse for all boxes).
4. Add your SSH key, label it `readstack-db`, **Create**. Wait ~3–5 min for the install.
5. SSH in, confirm Postgres is up and reachable; the StackScript drops credentials in a
   file under `/root` (or `/home`). Allow the backend box's IP in `pg_hba.conf` +
   `listen_addresses='*'` in `postgresql.conf` (or put both boxes in a **VPC** and use the
   private IP — cleaner). Our app runs `CREATE EXTENSION IF NOT EXISTS vector` itself.
6. Build the connection string for later:
   `DATABASE_URL=postgresql://<user>:<pass>@<db-ip>:5432/readstack`

> Why the Marketplace app and not Linode Managed Databases: the one-click ships Postgres
> **with the pgvector extension**; Managed DBs usually don't let you `CREATE EXTENSION vector`.

---

## Part 2 — Backend + Frontend — one CPU box behind Caddy

1. **Create → OS: Ubuntu 24.04**, Dedicated **8 GB**, **same region**, SSH key, label
   `readstack-app`. (8 GB because the local MiniLM embedder pulls torch.)
2. **DNS:** point a subdomain you control at the box's IP, e.g. an **A record**
   `readstack.itamih.com → <app-ip>`. Caddy needs a real hostname for auto-HTTPS.
3. SSH in and install deps:
   ```bash
   apt update && apt install -y git python3-venv python3-pip caddy
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs
   ```
4. Clone + backend:
   ```bash
   git clone https://github.com/sameerhimati/ReadStack.git /opt/readstack
   cd /opt/readstack/backend
   python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
   ```
5. Backend env (`/opt/readstack/backend/.env` — or an env file the systemd unit reads):
   ```
   DATABASE_URL=postgresql://<user>:<pass>@<db-ip>:5432/readstack
   MOCK_INFERENCE=1        # flip OFF once the GPU is up (Part 3)
   ```
6. Frontend build (static, client-fetches the API):
   ```bash
   cd /opt/readstack/frontend
   echo 'NEXT_PUBLIC_API_URL=https://readstack.itamih.com' > .env.production
   npm ci && npm run build
   ```
   (Serve `frontend/.next` via `npm run start`, or export static — whichever the Next
   version supports. The Caddyfile below proxies the Next server on :3000.)
7. **Caddyfile** (`/etc/caddy/Caddyfile`) — single origin, auto-HTTPS, no CORS:
   ```
   readstack.itamih.com {
       # API → uvicorn
       handle /pipeline*   { reverse_proxy localhost:8000 }
       handle /snapshot*   { reverse_proxy localhost:8000 }
       handle /add*        { reverse_proxy localhost:8000 }
       handle /article*    { reverse_proxy localhost:8000 }
       handle /media/*     { reverse_proxy localhost:8000 }
       handle /health*     { reverse_proxy localhost:8000 }
       # everything else → the Next frontend
       handle              { reverse_proxy localhost:3000 }
   }
   ```
   Then `systemctl reload caddy`.
8. Run the two services (quick: `tmux`; proper: two `systemd` units):
   ```bash
   # backend
   cd /opt/readstack/backend && set -a && . .env && set +a && \
     .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000
   # frontend
   cd /opt/readstack/frontend && npm run start -- --port 3000
   ```
9. **Bake the snapshot once** (this is the only step that runs inference — judges then
   read the cache): `curl -X POST https://readstack.itamih.com/pipeline -d '{}' -H 'Content-Type: application/json'`
10. Open `https://readstack.itamih.com` — the frontend loads `GET /snapshot` (zero inference).

---

## Part 3 — GPU (Ollama) — when the ticket clears

1. **Create → Marketplace → Ollama**, **GPU** plan (smallest that holds an 8B: RTX 4000 Ada
   class), same region, label `readstack-gpu`.
2. SSH in: `ollama pull llama3.1:8b` (Ollama serves an OpenAI-compatible API on `:11434`).
3. On the **app box**, set and restart the backend:
   ```
   AKAMAI_INFERENCE_URL=http://<gpu-ip>:11434
   AKAMAI_MODEL_WEAK=llama3.1:8b
   AKAMAI_MODEL_MID=llama3.1:8b      # one GPU: point every tier at the 8B
   AKAMAI_MODEL_STRONG=llama3.1:8b
   # remove MOCK_INFERENCE
   ```
4. Re-bake: `curl -X POST .../pipeline -d '{}'`. Now labels + lessons are real model output
   and topics stop being nonsense. (`akamai.py` is OpenAI-compatible + env-driven, so this is
   the only change — no code edit. Swap Ollama→vLLM later the same way if you want throughput.)

---

## Notes
- **Mixed-content trap:** the single-origin Caddy setup avoids it. Never serve the frontend
  on HTTPS while pointing it at an HTTP backend IP — browsers silently block every fetch.
- **Media (audio):** lives on the app box under `backend/data/media/` and is served at
  `/media/<file>`. Object Storage is the durability upgrade, not needed for the demo.
- **Cost:** the CPU + DB boxes bill hourly (~$0.16/hr together); destroy after the event.
