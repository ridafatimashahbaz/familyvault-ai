#!/bin/sh
# Runtime entrypoint for the FamilyVault AI container.
#
# Applies any pending Prisma migrations against the mounted SQLite volume, then
# hands the process over to the Next.js standalone server.
set -e

if [ -z "$AUTH_SECRET" ]; then
  echo "[entrypoint] FATAL: AUTH_SECRET is not set." >&2
  exit 1
fi

# Fail closed: without a dedicated key the app cannot encrypt documents at
# rest, so refuse to start rather than ever write a plaintext file.
if [ -z "$DOCUMENT_ENCRYPTION_KEY" ]; then
  echo "[entrypoint] FATAL: DOCUMENT_ENCRYPTION_KEY is not set." >&2
  echo "[entrypoint] Generate one with: openssl rand -hex 32" >&2
  exit 1
fi

echo "[entrypoint] Applying database migrations…"
node ./node_modules/prisma/build/index.js migrate deploy

echo "[entrypoint] Starting FamilyVault AI on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node server.js
