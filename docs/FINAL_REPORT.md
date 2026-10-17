# FamilyVault AI — implementation report

Original report date: 2026-10-15. This report-only update does not commit, push or
publish anything.

Prior verification is retained as historical evidence, not a current all-green
result. Current scoped observations supplied for this update are listed
separately; no tests, builds or browser checks were rerun for this documentation
edit. The current PWA is not verified feature-complete.

**Status labels used**

- **Implemented and tested** — code exists, automated tests cover it, and it was
  exercised at the surface a user meets (browser or CLI).
- **Implemented but not adequately tested** — code exists and runs, but the
  evidence is thinner than the claim.
- **Partially implemented** — some of the requirement works; the missing part is
  named.
- **Not implemented** — absent, and said so plainly.
- **Blocked by a specific dependency or authorization** — cannot proceed without
  a decision or external resource.

---

## How verification was done

### Prior verification — baseline report dated 2026-10-15

These are results recorded in earlier work, before the current reminder,
release and recognition changes. They have not been rerun for this update and
must not be read as verification of the current revision.

| Evidence | Command / method | Prior result (not freshly verified) |
| --- | --- | --- |
| Unit tests | `npm test` | 316/316 passed at the historical baseline |
| Database integration tests | `npm run test:db` (isolated SQLite file) | 5/5 passed in earlier work |
| Types | `npm run typecheck` + `npm run typecheck:pwa` | Previously clean; current PWA check has a missing-module error (below) |
| Lint | `npm run lint` + `npx eslint pwa` | Previously clean |
| Production build | `npm run build` | Succeeded in earlier work |
| Static PWA build | `npm run build:pwa` | Previously succeeded |
| Fresh-database migrations | `prisma migrate deploy` on a throwaway DB | Both migrations previously applied |
| Server app in a real browser | production server on an isolated DB + storage, synthetic two-page PDF uploaded through the UI | Prior observations in sections C–E below |
| Vault PWA in a real browser | static build served locally, synthetic PDF, core vault flows driven through the UI | Prior observations under "Vault PWA" below; not full feature verification |

The earlier browser runs were reported to use throwaway data/storage and
synthetic files, without opening the real `prisma/dev.db` or the real folders in
`storage/documents`; the sandboxes were reported deleted afterwards.

### Current scoped observations — supplied for this update

- **17/17 vault-local tests pass**, including rejection of another vault's
  recovery kit while preserving the existing vault material and document.
  `recoverLocalVault` was fixed to reject such foreign kits.
- **18/18 labelled-dates and recognition-analysis tests pass.** Pure recognition
  output analysis was added. These tests check logic against supplied outputs;
  they are **not measurements of real OCR or handwriting accuracy**.
- The current PWA typecheck encountered missing `./reminders` while another
  agent was actively creating that module. A clean rerun is not established by
  this report; current reminder, recognition and release work remains ongoing.

These scoped results do not establish a current full-suite pass, successful
release build, notification delivery, handwriting capability or update
compatibility. They are not added to the historical 316-test count.

### Vault PWA — prior browser-verified core flows

The standalone encrypted vault (`pwa/`, intended for installation from the
existing Netlify site) was exercised against a locally served static build.
These observations do not verify the site's live contents or current changes:

- Create a vault; the recovery kit contains a **raw `recoveryKey` and a wrapped
  vault key (VK)**, not only wrapped blobs. The passphrase is absent. The kit can
  recover the VK independently of the passphrase and decrypt corresponding
  encrypted documents when available; it must be protected as secret key material.
- Add a synthetic PDF; the stored envelope contains only an opaque id,
  timestamps, encrypted `content`, `wrappedDek` and encrypted `metadata`.
  Original byte size is inside encrypted metadata, alongside title, file name,
  person and file type; there is no plaintext byte-count field.
- Search by name and filter by kind narrow the list; "Save a copy" returns
  bytes identical to the uploaded file (SHA-256 match).
- Lock; a wrong passphrase is refused with a plain message;
  the right passphrase reopens the same documents. This is not a general
  guarantee against information leakage.
- Forgot-passphrase recovery with the saved file swaps the passphrase (old one
  stops working, new one works) while the document bytes stay identical.
- Export a backup file; restoring it on a second browser origin brings the
  vault back and the document opens byte-identical.
- Two-step removal ("Remove for good?" confirm, self-resetting after six
  seconds) deletes with a confirmation notice.
- Offline: with the local server stopped, app reload and vault creation were
  observed using the installed service worker. **Offline document opening and
  reading were not observed** and remain unverified.

---

## Server application scope — sections A–H

Sections A–H describe the separate Next.js server application and its **prior
verification**, not the installable static PWA. Their status labels refer to
that earlier server-app evidence; they do not establish equivalent PWA features
or a current passing revision. In particular, the server pipeline, assistant,
reminder date handling and OCR described here must not be read as verified PWA
capabilities.

## A. Product and architecture — **Implemented and tested**

Next.js App Router application with a server-side processing pipeline.

- Upload → magic-byte type check → AES-256-GCM encryption at rest → page-aware
  text extraction → document-type classification → field extraction → labelled
  date detection → local summary → reminder columns.
- All new pipeline state (page count, per-page text, labelled dates, user
  decisions, edited text) lives in the existing `Document.extractedData` column
  behind a typed contract, so **no migration is needed** for any of this work.
- `docs/ARCHITECTURE.md` and `docs/DATABASE_SCHEMA.md` describe the current
  modules and the `extractedData` payload.

## B. Security and privacy — **Implemented and tested** (with one documented limit)

- Session auth on every data route; every query is scoped to the signed-in user;
  unknown or foreign ids return the same 404 so ids cannot be probed.
- Origin check and per-user rate limits on write routes, including the vault
  material endpoint.
- Documents are encrypted at rest with AES-256-GCM; the container refuses to
  boot without `DOCUMENT_ENCRYPTION_KEY` (fail-closed).
- Secret material (passphrase, vault keys, data keys) is never stored in the
  `VaultMaterial` table. Tests cover the contract.
- Documented limit, unchanged: in this architecture the server can read a
  document's plaintext while it processes and displays it. The browser-side vault
  (`/vault`) is the answer to that, and it is separate.

**Blocked item:** the additive `add_vault_material` migration exists in the repo
but has deliberately **not** been applied to the real database. Applying it is a
one-way step on real data and needs your go-ahead.

## C. Upload, storage, viewing, editing — **Partially implemented**

Working and verified in the browser: type detection from bytes, 15 MB per-file
cap, encrypted storage, page-count caps (store always, process up to the cap),
per-page text, rename, document type/category/tags, delete, failed-processing
state, download, and re-analysis on request.

**Not implemented:** image preprocessing (deskew, denoise, contrast). The
requirement was that preprocessing must never overwrite the original; nothing was
added, so there is also no overwrite risk. Photos of poor quality therefore OCR
worse than they could.

## D. OCR and text handling — **Partially implemented**

- Digital PDFs: embedded text layer is used directly (faster, exact).
- Scanned PDFs: rendered to page images with `pdftoppm` when the host has it; the
  pipeline reports honestly when no renderer is available.
- Photos/scans: printed-text OCR via the local Tesseract worker, single worker,
  time budget and page cap, per-page text with page numbers.
- The user can correct recognised text; the correction survives re-analysis and
  the document page says so.

**Handwriting: not supported.** It is not silently faked — low-confidence pages
get a plain-language warning that the printed-text reader cannot learn
handwriting and that numbers should be checked, and the correction card is
offered. `tests/fixtures` keeps printed and handwriting cases separate.

## E. Dates, evidence and reminders — **Implemented and tested**

- Dates are only accepted next to an explicit printed heading; the heading, the
  page, the exact text, the confidence and a review flag are all recorded and
  shown. Ambiguous `dd/mm` values are flagged for review instead of guessed;
  a date with no printed year is never given one.
- User decisions (this is right / not it / use as the expiry) are stored, survive
  re-analysis, and are surfaced: a confirmed expiry is labelled **Set by you** and
  a fresh read that disagrees is reported instead of silently replacing it.
- When the coarse reader and the heading-aware reader disagree on the expiry, the
  heading-aware reading wins and the disagreement is shown, e.g. at upload:
  *"Two dates could be the expiry. Using 2026-11-19 — found next to "Coverage
  until" on page 2 — instead of 2026-11-30. You can change it below."*
- Verified in the browser: an insurance page with both "Coverage until
  19-11-2026" and "Renew before 30 November 2026" set the reminder to
  19 Nov 2026; choosing the renewal date instead moved the reminder to
  30 Nov 2026, the source row changed to **Set by you**, and re-analysis kept the
  user's date and explained that the fresh read suggested the other one.

## F. Categories — **Implemented and tested**

Classification runs locally (no network) from taxonomy keywords, file-name hints
and structural fingerprints. The evidence that produced the type is shown. A
category you set by hand outranks the reader on re-analysis, and the page says
which suggestion was not applied.

A real defect found in the browser run and since fixed: the hint "nic" matched
inside the word "clinic", so a clinic card was classified as a national ID.
Short terms now only match on word boundaries.

## G. Summaries and the assistant — **Implemented and tested**

Summaries are written by the local engine only; cloud AI transmission was
removed earlier in this work. The summary degrades honestly (says plainly when no
text could be read) and does not quote OCR noise as sentences. The assistant
answers from documents in your own vault and can quote the stored text.

## H. Search and retrieval — **Implemented and tested**

Search and the assistant's context selection use the stored text and a local
ranking function — no new vector database and no third-party service. Ranking
tests cover relevance, snippets, empty queries and unrelated questions, and every
query is scoped to the signed-in household.

## I. Interface, languages, PWA — **Partially implemented**

**Server app, prior report:** English and Urdu with RTL, light/dark/system theme,
on-device voice input and read-aloud, and the floating assistant button were
reported for the server interface. This is not verification of those features
in the separate static PWA.

**Static PWA (`pwa/`):** core vault setup, recovery, document management and
backup/restore have prior browser evidence as scoped above. Offline evidence
covers reload and vault creation only, not document opening or reading.
Handwriting, private deduplicated expiry notifications, and release/update
compatibility remain ongoing work; the product is **not feature-complete**.
Current scoped unit-test passes do not establish real OCR accuracy, notification
delivery, install/update behavior or a successful current release build.

**Gap:** `/vault` inside the server app was not exercised in the earlier browser
verification; only automated test coverage was reported. It is separate from
`pwa/`, the chosen user-facing distribution. The existing site's live contents
have not been inspected for this report.

## J. Tests — historical baseline and current scoped results

The prior baseline recorded 316 passing unit tests and 5 passing database
integration tests, covering the pipeline (classification, fields, dates, expiry
reconciliation, summaries, retrieval), correction paths, vault contract and
crypto, local-only vault lifecycle, API routes and route-level security checks.
Those totals predate the current reminder, release and recognition changes;
there is no fresh full-suite result in this update.

Current supplied results are 17/17 vault-local tests and 18/18 labelled-dates
plus recognition-analysis tests, as detailed above. These scoped passes are not
a current all-green claim. Synthetic fixtures and pure output-analysis tests do
not measure real printed-text OCR or handwriting accuracy.

## K. Deployment — release work ongoing; publishing requires authorization

**Chosen route: the encrypted PWA on the existing Netlify site.** The intended
build is static files (`npm run build:pwa` → `pwa/out`) with no hosted
document-processing backend or server-side document database. This is not a
claim that delivered code cannot read documents: downloaded browser JavaScript
can access plaintext while the vault is unlocked. Privacy therefore depends on
trusted application code, hosting and updates, not encryption at rest alone.

`netlify.toml` and `docs/PWA_DEPLOYMENT.md` describe the static deployment route;
this report does not establish that the current release artifacts are ready.
The server app remains in the repository, but VPS/self-host deployment is
superseded as the chosen public route; its readiness was not reverified here.

**The current local revision has not been published.** An existing Netlify site
is the target; its live contents have not been inspected for this report. This
is not a claim that no deployment exists. Release work and verification remain
in progress, and publishing still requires explicit authorization.

---

## Reproduce the prior server-app browser verification

1. `npm run build`
2. Throwaway DB: `DATABASE_URL="file:../.next/verify-tmp/verify.db" npx prisma migrate deploy`
3. Start on an isolated port with `STORAGE_DIR` pointing at the throwaway folder,
   `AUTH_SECRET` and `DOCUMENT_ENCRYPTION_KEY` set to random values.
4. Register any address, upload a PDF, open the document, use the date-review
   card, then press **Re-analyse**.
5. Stop the server **before** the next `npm run build` (Windows keeps the
   throwaway SQLite file locked and the build then fails), and delete
   `.next/verify-tmp/`.

Note: reach the app by one hostname only. Both `localhost:3100` and
`127.0.0.1:3100` are loopback, but they are different origins, and the same-origin
check on write routes rejects the cross-name case by design.

## Verification on 2026-10-17

Gates, all run on this machine against the current local revision:

| Check | Command | Result |
| - | - | - |
| Root typecheck | `npm run typecheck` | clean (one fixture defect in `tests/unit/reminders.test.ts` was found and fixed here) |
| PWA typecheck | `npm run typecheck:pwa` | clean |
| Lint | `npm run lint` | clean |
| Unit tests | `npm test` | 339 pass, 0 fail |
| Isolated DB tests | `npm run test:db` | 5 pass, 0 fail (throwaway SQLite; `dev.db` untouched) |
| Integration tests | `npm run test:integration` | 7 pass, 0 fail (the glob re-runs the 5 DB cases above) |
| Server app build | `npm run build` | succeeds |
| PWA static export | `npm run build:pwa` | succeeds, 4 pages |

Recognition is measured, not asserted: `node scripts/measure-recognition-accuracy.mjs`
scores every synthetic sample against its known text and writes
`pwa/public/recognition-samples/accuracy.json` — character error rate 0.0522 and
word error rate 0.2182 across all cases, 0.0000 for the printed control, and
**0 dates suggested that are not present in the reference text**. The samples are
synthetic pen strokes, so these numbers do not describe anyone's real handwriting.

Expiry reminders, observed in a browser on the PWA dev origin:

- A date nobody confirmed is listed under "Check these dates against the original
  before they can remind you" and produces no alert.
- After ticking "I checked this expiry date against the original" and saving, the
  card showed "fv-sample expires in 4 days · 2026-10-21 · confirmed by you" and the
  list chip read "Expires in 4 days".
- Saving again showed "Nothing new to tell you. 1 date in your vault is inside the
  7-day window and you have already been shown it." The ledger in local storage
  holds only `id:stage:date` — no title, no contents.
- Notification permission is denied in this automated browser, so the on-screen
  path is what was verified; an operating-system notice was not exercised.

Offline and updates, observed against the built export served from
`scripts/serve-pwa-preview.mjs`: service worker `v3` registered, 20 entries cached
including `/reading-runtime/*` and the demo sample, and with the **origin server
stopped** the app still opened, the sample picture still rendered, and "Read this
sample now" completed with 100% of words matched. Navigations go to the network
first and fall back to cache, so a new release is used on the next open instead of
being pinned by a stale shell.

Every browser interaction here was scripted — dispatched events and native value
setters — because the automated browser's viewport refuses pointer clicks. This is
functional verification, not a pointer-level UI test. Nothing was committed,
pushed, migrated or published during this work.

## Open decisions and unfinished work

1. **Publish the PWA** — the route is chosen and the local build is verified. The
   typecheck error that this report previously recorded is fixed, every gate was
   re-run on 2026-10-17 (see “Verification on 2026-10-17” above), and offline access plus
   compatible updates were observed in a browser with the origin server stopped.
   What remains is authorization, not code: publishing needs your go-ahead, and
   this machine has no Netlify credentials (`~/.netlify` does not exist), so the
   live site's contents have still not been inspected.
2. **Apply `add_vault_material` to the real database** — additive, but a one-way
   step; it matters only if you ever run the server app, and needs your
   go-ahead with a backup taken first.
3. **Evidence gaps that are real** — image preprocessing remains a server-app
   gap. Handwriting accuracy is now *measured* (`pwa/public/recognition-samples/
   accuracy.json`, with an invented-date counter at zero) but the samples are
   synthetic pen strokes, so nothing here proves accuracy on a real relative's
   handwriting. Expiry reminders are implemented and browser-verified for the
   confirmed, unconfirmed and deduplicated paths; operating-system notification
   delivery could not be exercised because the automated browser denies the
   notification permission, and no path can wake a closed phone.
