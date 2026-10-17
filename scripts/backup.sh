#!/usr/bin/env bash
#
# FamilyVault AI — encrypted backup.
#
# Produces a self-contained, timestamped snapshot of everything needed to
# restore the vault:
#   - familyvault.db : a *consistent* SQLite copy (sqlite3 ".backup")
#   - storage.tar.gz : the AES-256-GCM encrypted document store
#
# The document blobs are ciphertext, so the snapshot is safe to copy off the
# server. It is USELESS WITHOUT DOCUMENT_ENCRYPTION_KEY — store that separately
# and offline (see the note printed at the end).
#
# Usage:
#   ./scripts/backup.sh                 # snapshot local data (reads .env)
#   ./scripts/backup.sh --docker        # snapshot the compose volume
#   BACKUP_DIR=/mnt/backups ./scripts/backup.sh
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="local"
if [ "${1:-}" = "--docker" ]; then
  MODE="docker"
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_ROOT="${BACKUP_DIR:-$REPO_ROOT/backups}"
DEST="$BACKUP_ROOT/$STAMP"

reminder() {
  cat <<'EOF'

  ─────────────────────────────────────────────────────────────────────────
  IMPORTANT — back up the encryption key separately.

  This snapshot can only be restored with the ORIGINAL DOCUMENT_ENCRYPTION_KEY.
  Keep it in a password manager or a sealed offline note, NOT on this server
  and NOT in this backup folder. Without it, every document here is unreadable.
  Never rotate the key while documents exist.
  ─────────────────────────────────────────────────────────────────────────
EOF
}

# Load .env for DATABASE_URL / STORAGE_DIR when the caller has not set them.
# Existing environment variables always win.
load_env() {
  if [ -f "$REPO_ROOT/.env" ]; then
    while IFS= read -r line; do
      case "$line" in
        \#*|"") continue ;;
      esac
      key="${line%%=*}"
      # trim surrounding whitespace from the key
      key="$(printf '%s' "$key" | tr -d '[:space:]')"
      [ -z "$key" ] && continue
      # only import if not already present in the environment
      if [ -z "${!key:-}" ]; then
        val="${line#*=}"
        # strip surrounding quotes
        val="${val%\"}"; val="${val#\"}"
        val="${val%\'}"; val="${val#\'}"
        export "$key=$val"
      fi
    done < "$REPO_ROOT/.env"
  fi
}

backup_local() {
  load_env

  local db_url="${DATABASE_URL:-file:./dev.db}"
  local db_path="${db_url#file:}"
  case "$db_path" in
    /*) : ;;                                  # absolute
    *) db_path="$REPO_ROOT/$db_path" ;;      # relative to repo root
  esac

  local storage="${STORAGE_DIR:-./storage}"
  case "$storage" in
    /*) : ;;
    *) storage="$REPO_ROOT/$storage" ;;
  esac

  mkdir -p "$DEST"

  # --- database ------------------------------------------------------------
  if [ ! -f "$db_path" ]; then
    echo "ERROR: database not found at $db_path" >&2
    echo "       (set DATABASE_URL in .env, or use --docker)" >&2
    exit 1
  fi

  if command -v sqlite3 >/dev/null 2>&1; then
    echo "[backup] Consistent SQLite snapshot → familyvault.db"
    sqlite3 "$db_path" ".backup '$DEST/familyvault.db'"
  else
    echo "[backup] sqlite3 not found; copying the database file directly." >&2
    echo "[backup] WARNING: stop the app first so the copy is not mid-write." >&2
    cp "$db_path" "$DEST/familyvault.db"
  fi

  # --- encrypted document store -------------------------------------------
  if [ -d "$storage" ]; then
    echo "[backup] Encrypted document store → storage.tar.gz"
    tar -czf "$DEST/storage.tar.gz" -C "$storage" .
  else
    echo "[backup] No storage directory at $storage — skipping (empty vault?)"
  fi

  write_readme "$db_path" "$storage"
}

backup_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERROR: docker not found." >&2
    exit 1
  fi

  # The app container is read_only with cap_drop ALL, so we do not try to write
  # inside it. Instead we stop it briefly and tar the whole /app/data volume
  # from a throwaway helper — a clean, consistent snapshot with no partial DB.
  local cid
  cid="$(docker compose ps -q app 2>/dev/null | head -n1 || true)"
  if [ -z "$cid" ]; then
    echo "ERROR: the 'app' service is not running (start it with docker compose up -d)." >&2
    exit 1
  fi

  local vol
  vol="$(docker inspect -f \
    '{{ range .Mounts }}{{ if eq .Destination "/app/data" }}{{ .Name }}{{ end }}{{ end }}' \
    "$cid")"
  if [ -z "$vol" ]; then
    echo "ERROR: could not find a volume mounted at /app/data on the app container." >&2
    exit 1
  fi

  mkdir -p "$DEST"
  echo "[backup] Stopping app for a consistent snapshot…"
  docker compose stop app >/dev/null
  # Always restart the app, even if the snapshot fails.
  trap 'docker compose start app >/dev/null 2>&1 || true' EXIT

  echo "[backup] Archiving volume '$vol' → vault-data.tar.gz"
  MSYS_NO_PATHCONV=1 docker run --rm \
    -v "$vol":/data:ro \
    -v "$DEST":/backup \
    alpine sh -c 'tar -czf /backup/vault-data.tar.gz -C /data .'

  echo "[backup] Restarting app…"
  docker compose start app >/dev/null
  trap - EXIT

  write_readme "/app/data/familyvault.db (volume: $vol)" "/app/data/storage (volume: $vol)"
}

write_readme() {
  local db_desc="$1" storage_desc="$2"
  cat > "$DEST/README.txt" <<EOF
FamilyVault AI backup — $STAMP

Contents
  $( [ -f "$DEST/familyvault.db" ] && echo "familyvault.db   consistent SQLite snapshot" || echo "vault-data.tar.gz  full /app/data volume archive" )
  $( [ -f "$DEST/storage.tar.gz" ] && echo "storage.tar.gz   AES-256-GCM encrypted document store" )

Source
  database : $db_desc
  storage  : $storage_desc

Restoring requires the ORIGINAL DOCUMENT_ENCRYPTION_KEY. Store that key
separately and offline — never in this folder, never only on the server.
EOF

  echo "[backup] Done → $DEST"
  ls -lh "$DEST"
  reminder
}

if [ "$MODE" = "docker" ]; then
  backup_docker
else
  backup_local
fi
