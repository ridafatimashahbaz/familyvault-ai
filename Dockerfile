# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# FamilyVault AI - production image
#
# Three stages: install deps, build the Next.js app, then ship the traced
# `output: "standalone"` server on a slim runtime. The database (SQLite) and
# the encrypted document store both live on a single mounted volume at
# /app/data, so the container itself stays stateless and replaceable.
# ---------------------------------------------------------------------------

# --- 1. Dependencies --------------------------------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
# postinstall runs `prisma generate`, so the schema has to be present here.
COPY prisma ./prisma
RUN npm ci

# --- 2. Build ---------------------------------------------------------------
FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `next build` only needs the environment to parse; real secrets are injected
# at runtime. The throwaway database path keeps any build-time query off the
# real volume.
ENV DATABASE_URL="file:./build-time.db" \
    AUTH_SECRET="build-time-placeholder-not-used-at-runtime-000000000000" \
    DOCUMENT_ENCRYPTION_KEY="build-time-placeholder-not-used-at-runtime-000000000000" \
    STORAGE_DIR="/tmp/build-storage"
RUN npx prisma generate && npm run build

# --- 3. Runtime -------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL="file:/app/data/familyvault.db" \
    STORAGE_DIR="/app/data/storage" \
    OCR_LANG_PATH="/app/data/storage/ocr-lang"

# `pdftoppm` (poppler-utils) turns a scanned PDF into images before OCR. The
# app detects its absence and reports that honestly, but a deployed instance
# should have it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates poppler-utils \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

# The standalone bundle carries server.js plus the traced node_modules.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma CLI + engine + migrations so `migrate deploy` can run at boot.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
 && mkdir -p /app/data \
 && chown -R nextjs:nodejs /app/data

USER nextjs
EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
