# Deploying FamilyVault AI

FamilyVault AI stores two things: a database and a folder of encrypted files.
Where you deploy decides how those two are provided, and — because this app is
built around data privacy — **where those two live is a privacy decision**. The
default and recommended shape keeps both on hardware you control.

## Choose a shape

| Host | Database | Files | Privacy |
|---|---|---|---|
| **Your own VPS / Docker** | SQLite on disk | `STORAGE_DIR` on disk | ✅ Everything stays on your machine — recommended |
| **Render / Fly / Railway** | Attached volume | Volume | ⚠️ Works, but you are trusting a third-party host with the data |
| **Netlify / Vercel Functions** | Managed Postgres | Object storage (S3/R2) | ❌ Third-party DB + object storage; large code changes |
| **Netlify static export** | — | — | ❌ Not possible — the app is server-rendered |

**Privacy-first principle:** the app is designed so that no third party ever
holds your data. Documents are encrypted at rest with a key that only exists in
your environment, OCR and AI summaries run on your own server, there is no
telemetry, and the database is a single SQLite file. Hosting on your own VPS
preserves every one of those properties; hosting on a managed platform does not.

**Why serverless is a mismatch by default:** the app writes uploaded files to
`STORAGE_DIR` and keeps SQLite in a file. Serverless platforms give you an
ephemeral filesystem, so uploads vanish between invocations, and they force both
the database and the files onto third-party services.

> **A note on Supabase.** This repository does **not** use Supabase. Authentication
> is NextAuth v5 with credentials, and the database is Prisma (SQLite by default,
> PostgreSQL supported). If a deployed instance is showing a *"Supabase URL"*
> error, that deployment is running **different code** — this project has no
> Supabase keys, SDK or configuration to fix. Deploy the code in this repository
> instead, following the steps below.

---

## 1. Local production check (do this first)

Before deploying anywhere, prove it works locally in production mode:

```bash
npm install
cp .env.example .env      # then set AUTH_SECRET and DOCUMENT_ENCRYPTION_KEY
npm run db:migrate
npm run build
npm start                 # http://localhost:3000
```

Register an account, upload a PDF or a photo, confirm the summary, extracted
fields and expiry appear, then open `/try` to check guest mode.

---

## 2. Self-hosting on a VPS (privacy-first, recommended)

This is the recommended deployment: the whole app runs on a single server you
own, behind automatic HTTPS, with all data on one encrypted volume.

### What you need

- A VPS or VM with a public IP and Docker + Docker Compose v2 installed.
- A domain (e.g. `vault.example.com`) whose DNS you control.
- SSH access to the server.

### 2.1 Server preparation

Log in as a **non-root** user that can run Docker (do not run the app as root):

```bash
# Create a deploy user and add it to the docker group
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo su - deploy
```

Install Docker if it is not already present (official convenience script, or
your distro's packages), then confirm:

```bash
docker --version
docker compose version
```

### 2.2 Firewall — expose only what is needed

Only SSH and HTTP(S) should be reachable from the internet. The app itself is
never published directly; **Caddy terminates TLS** and proxies to it over the
Docker network.

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (Let's Encrypt challenge + redirect)
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

> Do **not** open port 3000 to the world. In `docker-compose.yml` the app uses
> `expose: ["3000"]` only, so it is reachable exclusively by Caddy on the
> internal network.

### 2.3 DNS

Create an **A record** (and an **AAAA record** if you have IPv6) pointing your
domain at the server's public IP. Wait for it to resolve:

```bash
dig +short vault.example.com
```

### 2.4 Get the code and configure

```bash
git clone <your-repo-url> familyvault
cd familyvault

cp .env.example .env
```

Generate the two required secrets — one for sessions, one for document
encryption — and put them in `.env`:

```bash
openssl rand -hex 32   # AUTH_SECRET
openssl rand -hex 32   # DOCUMENT_ENCRYPTION_KEY
```

Then edit `.env`:

- `AUTH_SECRET="<first value>"`
- `DOCUMENT_ENCRYPTION_KEY="<second value>"`
- `AUTH_TRUST_HTTPS="true"` (Caddy serves HTTPS, so session cookies get `Secure`)
- `SITE_ADDRESS="vault.example.com"` (the domain Caddy requests a certificate for)
- `NEXT_PUBLIC_APP_URL="https://vault.example.com"`

```bash
chmod 600 .env      # keep secrets out of other users' reach
```

> **Back up `DOCUMENT_ENCRYPTION_KEY` offline now** — a password manager or a
> sealed note, stored separately from the server. Without it the encrypted
> documents cannot be read, and if you change it after documents exist they
> become permanently undecryptable.

### 2.5 Start the stack

```bash
docker compose up -d --build
docker compose ps          # both `app` and `caddy` should be running
docker compose logs -f caddy
```

Caddy will obtain a Let's Encrypt certificate for `SITE_ADDRESS` on first
request. Visit `https://vault.example.com`, register an account and upload a
test document.

### 2.6 Confirm the hardening

```bash
# The app must NOT be reachable directly on 3000 from outside:
curl -m 3 http://<server-ip>:3000 || echo "unreachable (correct)"

# It MUST be reachable over HTTPS:
curl -sI https://vault.example.com | grep -i strict-transport-security

# The container refuses to boot without the encryption key:
docker compose run --rm -e DOCUMENT_ENCRYPTION_KEY= app
# -> "[entrypoint] FATAL: DOCUMENT_ENCRYPTION_KEY is not set." and a non-zero exit
```

### 2.7 Updating

```bash
cd familyvault
git pull
docker compose up -d --build      # migrations run automatically at boot
docker image prune -f             # optional: remove the old image
```

`docker-entrypoint.sh` runs `prisma migrate deploy` on every start, so schema
changes are applied automatically. Your data lives on the `vault-data` volume
and is never touched by a rebuild.

### 2.8 Backups

Use `scripts/backup.sh` (see [Backups](#backups) below) to produce a consistent
snapshot of the database and the encrypted file store, then copy that snapshot
off the server. Keep `DOCUMENT_ENCRYPTION_KEY` somewhere else entirely.

---

## 3. Docker details (what the stack gives you)

The repo ships a multi-stage `Dockerfile` that builds the self-contained
`.next/standalone` tree (`output: "standalone"`) and runs it on a slim Node
image as a **non-root** user (uid 1001) with a `HEALTHCHECK`.

Everything the app persists lives on **one mounted volume at `/app/data`**:

| Path | What it holds |
|---|---|
| `/app/data/familyvault.db` | the SQLite database (`DATABASE_URL`) |
| `/app/data/storage` | AES-256-GCM encrypted document blobs (`STORAGE_DIR`) |
| `/app/data/storage/ocr-lang` | cached OCR language data (`OCR_LANG_PATH`) |

The image installs a PDF page renderer (`poppler-utils`), which is what lets a
scanned PDF be read page by page instead of reported as unreadable. It comes with
the container, so there is nothing to set up on the host. Running the app
**without** Docker (`npm start`) means installing it yourself —
`apt-get install poppler-utils` — and if it is absent the app still stores and
serves every file; it just says plainly that a scan's pages could not be read.

`docker-compose.yml` additionally hardens the app container:
`read_only` root filesystem with `tmpfs` for scratch space,
`no-new-privileges`, `cap_drop: ALL` and a `pids_limit`, and the app is kept off
the public network (`expose` only). TLS is handled by the bundled **Caddy**
service, which reads `deploy/Caddyfile` and stores certificates on its own
volumes.

### Without Compose

If you prefer plain Docker, the volume and env flags are the same, but you must
supply TLS yourself:

```bash
docker build -t familyvault-ai .

docker run -d --name familyvault -p 127.0.0.1:3000:3000 \
  -e AUTH_SECRET="<paste>" \
  -e DOCUMENT_ENCRYPTION_KEY="<paste>" \
  -e AUTH_TRUST_HTTPS="true" \
  -v familyvault_data:/app/data \
  familyvault-ai
```

Note `-p 127.0.0.1:3000:3000`: the app binds to loopback only, so a TLS
terminator (Caddy, nginx, Traefik) on the same host is the only thing that can
reach it.

---

## 4. Managed container hosts (Render / Fly / Railway)

If you would rather not manage a server, `render.yaml` is a Blueprint that turns
the Dockerfile into a web service with a persistent disk:

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, pick the repo, apply.
3. Render generates `AUTH_SECRET` and `DOCUMENT_ENCRYPTION_KEY`, mounts a 5 GB
   disk at `/app/data`, and health-checks `/`.

Fly.io example:

```bash
fly launch --no-deploy
fly volumes create vault_data --size 1
fly secrets set AUTH_SECRET="$(openssl rand -hex 32)" \
                DOCUMENT_ENCRYPTION_KEY="$(openssl rand -hex 32)"
fly deploy
```

> The volume is not optional. Without a persistent disk at `/app/data`, every
> deploy starts with an empty vault. These hosts work, but they mean trusting a
> third party with your data — use them only if you accept that trade-off.

---

## 5. Netlify (redirect / landing only)

Netlify **cannot** host this app: it has no persistent disk, so SQLite and the
encrypted file store have nowhere to live. The recommended use of a Netlify site
is a **thin landing page that redirects to your self-hosted instance**, hosting
no application and no data. The ready-made files are in
`deploy/netlify-redirect/`:

- `index.html` — a minimal privacy notice that links to your VPS URL.
- `_redirects` — sends every other path to your VPS with a `301`.

Deploy them with the Netlify CLI, then edit the destination URL to your domain:

```bash
netlify deploy --prod --dir=deploy/netlify-redirect
```

If you would rather take the old link offline entirely, simply leave the site
empty — the app itself is entirely independent of Netlify.

---

## 6. PostgreSQL instead of SQLite

1. Change `provider` to `"postgresql"` in `prisma/schema.prisma`.
2. Set `DATABASE_URL="postgresql://user:pass@host:5432/familyvault?schema=public"`.
3. `rm -rf prisma/migrations && npm run db:migrate` (fresh migration history).
4. `npm run db:deploy` on the server.

> If the Postgres instance is not on the same machine, this reintroduces a
> third-party data processor — contrary to the privacy-first default.

---

## Backups

Two things are needed to restore, and they must be backed up **separately**:

1. **The database** — `familyvault.db` (SQLite) or a `pg_dump` of your Postgres.
2. **`STORAGE_DIR`** — the encrypted blobs.

`scripts/backup.sh` produces both in one timestamped folder, taking a
**consistent SQLite snapshot** (via `sqlite3 .backup`, safe while the app is
running) and a **tar of the encrypted storage directory**:

```bash
# On the server (or against a stopped container):
./scripts/backup.sh                       # writes to ./backups/<timestamp>/
BACKUP_DIR=/mnt/backups ./scripts/backup.sh
```

The snapshot is already encrypted — the document blobs are AES-256-GCM
ciphertext — so it is safe to copy off the server. Then move it somewhere else
(S3-compatible storage, another host, an offline disk).

### Restore

1. Provision a fresh VPS and check out the code.
2. Put the **original** `DOCUMENT_ENCRYPTION_KEY` in `.env` — a backup cannot be
   decrypted without it.
3. Stop the stack and remove the (empty) volume:
   ```bash
   docker compose down
   docker volume rm familyvault_vault-data
   ```
4. Recreate the volume and copy the backup in:
   ```bash
   docker volume create familyvault_vault-data
   docker run --rm -v familyvault_vault-data:/app/data \
     -v "$PWD/backups/<timestamp>":/backup alpine \
     sh -c "cp /backup/familyvault.db /app/data/ && \
            mkdir -p /app/data/storage && \
            tar -xzf /backup/storage.tar.gz -C /app/data/storage"
   ```
5. `docker compose up -d` and confirm your documents are intact.

Keep `DOCUMENT_ENCRYPTION_KEY` somewhere else entirely (a password manager or
secret store). Without it, the encrypted files cannot be read; and if you change
it after documents have been stored, those documents become undecryptable.

---

## Going-live checklist

- [ ] VPS firewall allows only 22, 80 and 443 — **not** 3000
- [ ] Non-root deploy user; app container runs as non-root (uid 1001)
- [ ] `AUTH_SECRET` set to a long random value (`openssl rand -hex 32`)
- [ ] `DOCUMENT_ENCRYPTION_KEY` set, and backed up **separately and offline**
- [ ] `AUTH_TRUST_HTTPS=true` and `SITE_ADDRESS` set to your domain
- [ ] `NODE_ENV=production` so `assertProductionSecrets()` passes at boot
- [ ] `npm run db:deploy` run against the production database
- [ ] `STORAGE_DIR` on a persistent, backed-up volume, outside `./public`
- [ ] `docker compose run --rm -e DOCUMENT_ENCRYPTION_KEY= app` refuses to start
- [ ] `/settings` shows no configuration warnings
- [ ] Upload one test document, confirm it is encrypted at rest, then delete it
- [ ] `scripts/backup.sh` run once and the snapshot copied off the server
