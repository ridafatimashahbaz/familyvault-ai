# Architecture

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript |
| Styling | Tailwind CSS v4 (`@theme` tokens in `globals.css`) |
| Data | Prisma 6 + SQLite (PostgreSQL supported) |
| Auth | NextAuth v5 (credentials provider, JWT sessions), bcryptjs |
| OCR | tesseract.js, with PDF text-layer fast path via pdf-parse |
| AI | Built-in local engine only — no cloud AI, no API keys |
| Validation | Zod 4 |
| Crypto | Node `crypto` — AES-256-GCM + scrypt (at rest) · WebCrypto in the browser — PBKDF2 + AES-256-GCM (private vault) |

## Request flow

```
Browser
  │
  ├── GET  pages  ──►  Server Component  ──►  service layer  ──►  Prisma
  │                        (reads directly; no HTTP hop)
  │
  └── mutations  ──►  /api/* route handler  ──►  service layer  ──►  Prisma
                          (Zod parse, origin check, ownership check)
```

- **Reads** happen in Server Components, which call `src/lib/services/*`
  directly. This avoids an internal HTTP round-trip and keeps the file route the
  only place a raw blob is streamed.
- **Writes** happen through `/api` routes so client components get predictable
  JSON, status codes and error messages (`src/lib/api.ts`).

## Two surfaces

| | `src/` | `pwa/` |
|---|---|---|
| Build | `output: "standalone"` — a Node server | `output: "export"` — static files |
| API routes | Yes | None (no server runtime to host them) |
| Auth | NextAuth v5 JWT cookie session | None |
| Data | Prisma + SQLite | None |

They are separate applications and share **no runtime, no origin guarantee, no
authentication session and no database**. A signed-in session in one is not a
session in the other, so the private vault lifecycle lives in `src/`, where the
user is actually signed in, and reuses the reviewed crypto and storage modules
from `pwa/src/vault/*` through the `@vault/*` path alias. Bridging a `pwa/`
install to the app's authentication would mean moving session material across
origins; that bridge has deliberately **not** been invented.

## Directory map

```
src/
  app/
    (app)/            Authenticated area; `layout.tsx` gates it with requireUser()
    api/              REST route handlers (documents, family-members, assistant, account, system…)
    try/              Public guest demo
    login/ register/  Auth pages (server actions)
    layout.tsx        Root layout: metadata, PWA, service worker
    manifest.ts       Web app manifest
  components/
    ui/               Primitives: button, card, badge, field, alert, skeleton, empty-state
    documents/        Upload form, filter bar, rows, preview, actions, edit form, badges
    family/           Family profile CRUD
    assistant/        Chat UI
    settings/         Profile + password forms
    guest/            Guest-mode provider, signup gate and sample vault
    vault/            Private vault screen: status, setup/unlock, private file list (client only)
  lib/
    ai/               provider.ts (engine status), summarize.ts, retrieval.ts, assistant.ts, prompts.ts
    pipeline/         process.ts (entry), classify.ts, extract.ts, dates.ts, labelled-dates.ts,
                      expiry.ts, ocr.ts, pdf.ts, render.ts, extracted-data.ts
    security/         crypto.ts (AES-GCM), upload.ts (magic-byte sniffing), storage.ts
    services/         documents.ts, family-members.ts, users.ts, assistant.ts, vault.ts, vault-documents.ts
    vault/            Browser-side vault: contract.ts, client.ts, session.ts, storage.ts, private-documents.ts
    serializers.ts    DB row → client shape
    demo-data.ts      Sample vault for guest mode
    constants.ts      Document taxonomy (single source of truth)
    env.ts            Zod-validated environment access
    session.ts        requireUser / requireApiUser / getSessionUser
pwa/src/vault/        crypto.ts, keys.ts, store.ts, export.ts, types.ts, errors.ts
                      (shared with the app through the @vault/* alias)
prisma/               schema.prisma, migrations, seed.mjs
docs/                 This file, DATABASE_SCHEMA.md, DEPLOYMENT.md
tests/unit/           Pipeline + retrieval unit tests
```

## The document pipeline

Entry point: `src/lib/pipeline/process.ts` (`processDocument`), called by
`uploadDocument` and by `reprocessDocument`.

1. **Validate** — `validateUpload` reads the file's magic bytes. The filename and
   the browser's MIME type are ignored. SVG/HTML are never accepted.
2. **Encrypt & store** — `saveDocumentFile` writes an AES-256-GCM blob under
   `STORAGE_DIR/<userId>/<uuid>.<ext>`, mode `0600`. The whole file is always
   kept; the limits below apply to *reading*, never to storage.
3. **Text, page by page** — `pdf.ts` takes the PDF's own text layer when it has
   one (`PDF_TEXT_LAYER_MIN_CHARS` characters is the threshold). A scan gets its
   pages rasterised by `render.ts` — which needs a PDF renderer installed, and
   says so plainly when there is none — and the images go through tesseract.js.
   Caps: `MAX_PDF_PAGES` pages of text, `MAX_OCR_PAGES` OCR pages,
   `OCR_TIME_BUDGET_MS` of worker time. `pageCount` and `pagesRead` are both
   stored, so the UI can report what was skipped.
4. **Classify** — text and filename are scored against `DOC_TYPES`; the result
   carries a confidence and the matched evidence.
5. **Extract** — labelled fields (name, number, dates) are pulled from the text.
6. **Dates** — `labelled-dates.ts` reports a date only with the label it was found
   next to, its role (issue, appointment, follow-up, examination, prescription,
   expiry, payment due, renewal, academic deadline, other), its page, whether the
   day is known, a confidence and plain-language reasons. Ambiguous day/month
   orders and month-only dates are flagged for review rather than guessed, and no
   year is ever invented. `expiry.ts` then decides the reminder columns.
7. **Summarise** — the built-in local engine composes the prose; the source is
   recorded as `local` in `summarySource`.
8. **Persist** — everything except the text itself goes into the existing
   `extractedData` column through `extracted-data.ts`: fields, classification
   evidence, page counts, the labelled dates and the user's decisions. No
   migration was needed for any of it.

Failures are recorded on the row (`status: "failed"`, `errorMessage`) rather than
thrown away, and surfaced on the dashboard for retry.

**User corrections outrank the machine.** On re-analysis, `reprocessDocument`
keeps hand-corrected text (`textEdited`), a manually chosen category
(`classificationSource: "manual"`) and any date the user confirmed, corrected or
rejected (`reviewed`), and adds a warning for each one it kept instead of the new
result. Nothing is overwritten silently.

## The private vault path

A second, separate path exists for files the app is not allowed to read. It lives
in `src/lib/vault/*` on the browser side and `src/lib/services/vault*.ts` on the
server side, and reuses the reviewed crypto modules in `pwa/src/vault/*` through
the `@vault/*` alias.

```
Browser                                                        Server
  │ passphrase ─► PBKDF2 (1,000,000) ─► unwrap VK               │
  │ VK ─► wrap per-document DEK ─► encrypt metadata             │
  │                                                             │
  ├─ PUT /api/vault/material ─ wrapped blobs only ────────────►  one record per account
  ├─ PUT /api/vault/documents/:id ─ ciphertext JSON ─────────►  STORAGE_DIR/
  │                                                            │   vault-documents/<userId>/<id>.fvault
  └─ GET …/:id ◄──── the same opaque bytes ──────────────────►  │
       │ unwrap DEK with VK ─► decrypt ─► GCM tag check          │
       └ plaintext is assembled in the browser only             │
```

- **Sealing happens before transmission.** A fresh DEK and a fresh IV per
  encryption, AES-256-GCM with purpose-bound additional authenticated data, and
  the file's name and metadata encrypted under the vault key alongside the bytes.
  The server receives ciphertext it cannot open and stores it unchanged.
- **Nothing on this path is read server-side.** Vault bytes never reach OCR,
  classification, extraction, the summariser, retrieval or the assistant, and no
  vault plaintext is logged. `services/vault-documents.ts` handles opaque records
  only — it has no decrypt path.
- **The inventory is minimal by construction.** Listing returns `id`, `sizeBytes`
  and `updatedAt` — no titles, so the private file list is not a metadata leak.
- **The two paths do not cross automatically.** No migration turns a `Document`
  row into a vault object. Moving a file there is a deliberate, per-file action:
  open it, add it to the vault, confirm it decrypts, only then delete the server
  copy. Legacy documents stay where they are and stay readable by the app.

## Security model

There are two protection levels in this app, and they are not the same thing.

- **At rest (ordinary documents)** — AES-256-GCM with a scrypt-stretched key held
  by the server. The GCM auth tag makes tampering fail to decrypt instead of
  returning corrupted plaintext. The app can still open these files, so their
  content, names and OCR text are **not** end-to-end encrypted.
- **End-to-end (private vault)** — keys are derived and held in the browser from a
  passphrase the server never sees. The server stores ciphertext it cannot open.
  Resetting the account password does not reset the vault passphrase, and there is
  no server-side recovery path for vault content.
- **What the server can still see about vault objects** — that an account has N of
  them, their opaque ids, their byte sizes and their write times. It cannot see
  file names, contents, types, dates, tags or which family member they belong to.
- **Pending migration** — the `VaultMaterial` model ships as an unapplied, purely
  additive migration. Until the operator applies it, `GET/PUT /api/vault/material`
  fail and the vault still works on the device only (`inspectVault` reports this
  plainly rather than pretending the account is in sync).
- **At the boundary** — every document route verifies ownership by
  `userId`. The file route sends `no-store` and a strict `Content-Disposition`.
- **Uploads** — magic-byte typing; a renamed executable is rejected.
- **Sessions** — JWT signed with `AUTH_SECRET`; `requireUser()` in the `(app)`
  layout is the gate (there is no edge middleware).
- **Rate limits** — in-memory per-key budgets for login and the assistant.

## Local-first AI

Every summariser, assistant answer and "explain" response is composed by the
built-in local engine in `src/lib/ai/`. There is no cloud AI: no provider SDKs,
no API keys and no code path that sends document text, OCR output or metadata
off the machine. `src/lib/ai/provider.ts` reports the engine status (always
`local`) so the UI can label output honestly. `answerLocally` composes answers
from retrieved documents and `summarize` writes extractive prose, so the app is
fully functional with no configuration.
