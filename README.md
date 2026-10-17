# FamilyVault AI

**Every family document, read, filed and never out of date.**

Upload a CNIC, passport, birth certificate or electricity bill. FamilyVault AI works
out what it is, reads the text, pulls out the numbers and dates, writes a
plain-language summary, and warns you before anything expires.

It is built to hold identity documents, so it is **local-first**: OCR,
classification, summaries and the assistant all run on your own server with no
cloud AI. No document data ever leaves the machine.

---

## Features

| | |
|---|---|
| **Accounts** | Email + password registration and sign-in, bcrypt at cost 12, rate-limited |
| **Guest mode** | `/try` — browse a sample vault with no account; any save prompts sign-up |
| **Upload** | Drag-and-drop, real progress, JPG/PNG/GIF/WEBP/BMP/TIFF/HEIC/PDF, 15 MB default |
| **Classification** | ~30 document types across 8 categories, with a confidence score and the evidence behind it |
| **OCR** | Tesseract.js locally; PDFs use their text layer first when they have one, and scans are rendered page by page and read (up to 12 pages, 60 s budget) |
| **Extraction** | Names, numbers and dates pulled from the recognised text into editable fields |
| **Summaries** | A plain-language summary per document, written by the built-in local engine |
| **Expiry tracking** | Dates detected only when the document labels them; each one shows the words it was found next to, its page and how clearly it was read |
| **Corrections** | Fix the recognised text or any date on the document page — confirm it, change it, or say it is not that. Your version is what a re-run keeps |
| **Expiry calendar** | Every expiry on one month view, with `.ics` export and "add to Google Calendar" links |
| **Search & filter** | Title, OCR text, summary, fields, notes, tags, member — all URL-driven and shareable |
| **Family profiles** | One household login, a profile per person, documents filed under them |
| **Assistant** | Answers from your own vault, citing the documents it used; "Understand it" explains any document in plain words |
| **Voice** | Speak a question or hear the answer read aloud (English/اردو/پنجابی). Speech-to-text runs on-device — audio never leaves the device |
| **Themes** | Light / dark / system, remembered on the device with no flash on reload |
| **Urdu & RTL** | English ⇄ اردو across the landing, auth, dashboard, assistant, reminders and calendar screens, with a true right-to-left layout |
| **Offline** | An opt-in, encrypted "important information" snapshot — upcoming expiries stay readable with no network |
| **Private vault** | `/vault` — files encrypted in your browser under a vault passphrase that is *not* your account password; the server stores ciphertext, opaque ids and wrapped keys only |
| **Security** | AES-256-GCM at rest, magic-byte type sniffing, SVG/HTML refused, ownership-checked file route |
| **Installable** | Web app manifest + service worker — add to home screen on mobile or desktop |

---

## Requirements

- **Node.js 20.11 or newer** (24 LTS recommended)
- No database server, no API keys, no cloud account
- **Optional: a PDF page renderer** (`poppler-utils` on Debian/Ubuntu) to read PDFs
  that are scans. The Dockerfile installs it. Without it those files still store
  and download, and the app says plainly that the pages could not be read.
- **Handwriting is not recognised.** Printed text only; anything the reader is
  unsure about is flagged for you to check or type in.

---

## Quick start

```bash
# 1. Install dependencies (also runs `prisma generate`)
npm install

# 2. Create your environment file and set the two required secrets
cp .env.example .env
node -e "console.log('AUTH_SECRET=' + require('crypto').randomBytes(32).toString('base64url'))"
node -e "console.log('DOCUMENT_ENCRYPTION_KEY=' + require('crypto').randomBytes(48).toString('base64url'))"
# paste both values into .env

# 3. Create the SQLite database
npm run db:migrate

# 4. (optional) Seed a demo login with a few family profiles
npm run db:seed

# 5. Run it
npm run dev
```

Open <http://localhost:3000>. Register an account, or click **Try the demo** to
explore `/try` without signing in.

> The app boots with **no AI/OCR API keys**. Everything runs locally rather than
> failing.

---

## Configuration

All settings are optional except `AUTH_SECRET` (and `DOCUMENT_ENCRYPTION_KEY` in
production, where documents must not be stored in the clear). See
[`.env.example`](./.env.example) for the full annotated list.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `file:./dev.db` | SQLite by default; PostgreSQL is supported (see below) |
| `AUTH_SECRET` | — | **Required.** Signs session JWTs |
| `DOCUMENT_ENCRYPTION_KEY` | — | Stretches into the AES-256-GCM key. Recommended; required in production |
| `STORAGE_DIR` | `./storage` | Where encrypted files live. Must stay outside `./public` |
| `MAX_UPLOAD_MB` | `15` | Per-file upload limit |
| `OCR_ENGINE` | `tesseract` | `tesseract` or `none` |
| `OCR_LANGUAGES` | `eng` | Comma-separated tesseract language codes |
| `OCR_LANG_PATH` | `./storage/ocr-lang` | Local folder of language data, so OCR does not depend on a download |
| `PDF_TEXT_LAYER_MIN_CHARS` | `40` | Below this many characters a PDF is treated as a scan and its pages are read as images |
| `ASSISTANT_MAX_CONTEXT_DOCS` | `6` | How many documents the local assistant may cite in one answer |
| `EXPIRY_WARNING_DAYS` | `60` | "Expiring soon" window |

To read documents in another language, add its code (e.g. `eng,urd`) and either
download the training data with `npm run ocr:download-langs` or let tesseract.js
fetch it from the CDN on first use.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Unit tests (classification, extraction, dates and per-page reading, PDF text, stored data, corrections, retrieval, summaries) |
| `npm run test:integration` | Real SQLite: constraints and per-user isolation |
| `npm run test:db` | The vault-material database test on its own |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build:pwa` | Build the separate browser-only vault spike in `pwa/` |
| `npm run db:migrate` | Apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:studio` | Browse the database in Prisma Studio |
| `npm run db:seed` | Create a demo login and family profiles |
| `npm run ocr:download-langs` | Pre-download tesseract language data |

---

## How it works

```
Upload ─► validate (magic bytes) ─► encrypt ─► store
             │
             ▼
        OCR or PDF text layer ─► classify ─► extract fields ─► detect dates ─► summarise
             │
             ▼
        SQLite (Prisma)  +  encrypted files under STORAGE_DIR
```

```
Private vault ─► browser: one fresh key per file, AES-GCM over the bytes *and* the
               │          metadata; that key wrapped under the vault key
               ▼
           server: an opaque `.fvault` object under STORAGE_DIR/vault-documents/<user>/
               │
               ▼
           browser: unwrap, decrypt, verify the tag — the server never sees plaintext
```

- **Two storage paths.** Ordinary documents go through the pipeline above, so the
  server holds their names, OCR text, fields and summary. Private vault files do
  not: they are already ciphertext when they arrive, and no OCR, classification,
  summary, assistant or preview is ever run on them.
- **Nothing moves between the paths by itself.** A private file stays private
  until you open it and upload it again as an ordinary document; an existing
  document is never re-labelled or rewritten as a vault file.
- **Reads what it can, says what it did.** A file is always stored whole and
  downloadable, but reading is capped (40 pages of text, 12 OCR pages, 60 seconds)
  because one OCR worker handles every upload. The document page tells you how
  many pages were read, so "nothing about page 30" is never presented as "page 30
  says nothing".
- **Your correction outranks the machine.** Re-analysing a document keeps the text
  you typed, the category you chose and the dates you confirmed or rejected, and
  tells you each time that it kept yours instead of a new guess.
- **Reads** — Server Components call the service layer directly; no HTTP hop.
- **Writes** — client components call the REST routes under `/api`, which are
  ownership-checked per user.
- **Search & filters** — the `/documents` list is driven entirely by the URL, so
  any view is shareable and survives reload and back/forward.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the module map and
[`docs/DATABASE_SCHEMA.md`](./docs/DATABASE_SCHEMA.md) for the data model.

---

## Deployment

The repo ships a production `Dockerfile`, `docker-compose.yml` and a Render
Blueprint (`render.yaml`). The quickest self-hosted path:

```bash
cp .env.example .env      # set AUTH_SECRET and DOCUMENT_ENCRYPTION_KEY
docker compose up --build # http://localhost:3000
```

The container keeps the SQLite database and the encrypted files on one volume at
`/app/data` and runs `prisma migrate deploy` at boot.

Netlify, Vercel, Docker, Render and a plain VPS are covered in
[`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md). Read the **storage** section first:
the default SQLite + local-files setup needs a persistent disk, which rules out
purely serverless hosts unless you move to a managed database and object storage.

### Install on your device (PWA)

The app is a Progressive Web App, so anyone can "install" it on a phone, tablet
or computer straight from the browser — no app store, no separate download. Each
device opens the site once, adds it to its home screen or dock, and from then on
it launches full-screen with its own icon. Documents stay encrypted on the server.

Send users to **`/install`**, which walks them through it per device:

| Device | Browser | What to do |
|---|---|---|
| iPhone / iPad | Safari | Share → **Add to Home Screen** |
| Android | Chrome | ⋮ menu → **Install app** |
| Windows / Linux / Mac | Chrome or Edge | **Install** icon in the address bar |
| Mac | Safari | File → **Add to Dock** |

Chromium browsers also get a one-tap **Install now** button on that page (driven
by `beforeinstallprompt`); Safari and Firefox fall back to the steps above.

Installability needs real PNG icons. They live in `public/icons/` and
`public/apple-touch-icon.png`, declared in `src/app/manifest.ts` and the root
layout. To regenerate them from the source SVG:

```bash
npx sharp-cli -i src/app/icon.svg -o public/icons/icon-192.png resize 192 192
npx sharp-cli -i src/app/icon.svg -o public/icons/icon-512.png resize 512 512
npx sharp-cli -i public/icons/source-fullbleed.svg -o public/icons/maskable-512.png resize 512 512
npx sharp-cli -i public/icons/source-fullbleed.svg -o public/apple-touch-icon.png resize 180 180
```

---

## Security notes

- Files are encrypted with AES-256-GCM; the auth tag makes tampering fail to
  decrypt rather than return corrupted text.
- An encrypted blob lives outside `./public` and is streamed only through
  `/api/documents/[id]/file`, which checks ownership and sends `no-store`.
- Uploads are typed by their magic bytes, never by filename or browser MIME
  type. SVG and HTML are refused because both can carry script.
- Passwords are bcrypt-hashed; login has separate per-IP and per-account budgets.
- Voice is on-device only: Whisper runs in a Web Worker (WASM) and audio never
  leaves the browser. There is no vendor-cloud fallback — if the on-device model
  is unavailable, voice input fails closed rather than uploading your audio.
- The offline "Important information" snapshot is opt-in and stored only on the
  device as AES-GCM ciphertext under a non-extractable WebCrypto key. It holds
  expiry dates and titles only — never document files or OCR text — and is purged
  on sign-out along with its key.
- Keep `DOCUMENT_ENCRYPTION_KEY` backed up separately: without it, encrypted
  files cannot be read, and changing it makes existing documents undecryptable.

### Private vault

- The passphrase is used once, in the browser, to derive a non-extractable key
  (PBKDF2-SHA256, 1,000,000 iterations) that unwraps the vault key. It is never
  sent, never stored, and never written to a log. Each file gets its own
  AES-256-GCM data key and its own random IV; the file name, type and labels are
  encrypted too, under the vault key.
- **What the server can still see** about a private file: how many objects an
  account holds, their opaque ids, their byte sizes, their write times, and the
  same request metadata as any other call. **What it cannot see**: the file name,
  contents, type, dates, people, tags or any of the encrypted metadata.
- **Two secrets, two recovery paths.** Resetting the *account password* does not
  open or reset the *vault passphrase*. If the passphrase is lost, the saved
  recovery file is the only way back in — there is no server-side recovery, and
  support cannot help. The vault key is never stored: locked vault material is
  useless without one of those two secrets.
- **Ordinary documents are not end-to-end encrypted.** They are encrypted at
  rest with the server's own key and the app decrypts them to run OCR,
  classification and summaries, so whoever controls the server and its
  environment can read them. Never describe `/documents` content as E2E — only
  `/vault` content is.
- **Migration status.** `prisma/migrations/20261013161402_add_vault_material`
  is *not applied* in this environment yet. Until it is, `GET/PUT
  /api/vault/material` fail and the vault works on the device only — the screen
  says so in plain language instead of pretending to sync. `npm run db:migrate`
  (or `prisma migrate deploy`, which the container runs at boot) applies it; the
  change is additive and touches no existing table.
- **Moving a legacy document into the vault** is deliberately not automatic. The
  intended route stays client-side: open the old document, then add that file to
  the private vault, confirm it decrypts, and only then delete the server copy.
  Anything less would silently rewrite family records under a name the app can no
  longer read.

---

## Repository layout

```
src/
  app/            Next.js App Router (pages + /api route handlers)
  components/     UI: shell, documents, family, assistant, settings, guest
    vault/        Private vault screen: status, setup/unlock, private file list
  lib/
    ai/           Local summariser, assistant and explain engines (no cloud AI)
    pipeline/     OCR, classification, extraction, expiry, summarisation
    security/     Crypto, upload validation, storage
    services/     Prisma-backed data access (one module per domain)
    vault/        Browser-side vault: data contract, session, sealing, API client
pwa/src/vault/    Reviewed crypto core shared with the app through @vault/*
public/           Static assets: PWA icons, manifest, service worker
prisma/           Schema, migrations, seed
docs/             Architecture, schema and deployment guides
tests/            Unit tests
```
