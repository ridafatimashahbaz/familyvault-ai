# Database schema

FamilyVault AI uses **Prisma** with **SQLite** by default (PostgreSQL is
supported — see `docs/DEPLOYMENT.md`). The schema lives in
[`prisma/schema.prisma`](../prisma/schema.prisma).

## Entity overview

```
User ─1:many─ FamilyMember
  │               │
  │               └─0:many─┐
  ├─1:many──────────────── Document ─many:many─ Tag   (via DocumentTag)
  ├─1:many─ AssistantMessage
  └─1:1──── VaultMaterial   (opaque wrapped key blobs; migration still pending)
```

Every record is scoped to a `User`. Documents are additionally *optional*
scoped to a `FamilyMember`, so deleting a profile leaves its documents in place
(`onDelete: SetNull`).

Private-vault **files** are deliberately not here — see
"Private-vault data is not in this schema" below.

## Models

### `User`
One row per household account.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` @id | `cuid()` |
| `email` | `String` @unique | login identifier |
| `passwordHash` | `String` | bcrypt, cost 12 |
| `name` | `String` | shown in the shell |
| `createdAt` / `updatedAt` | `DateTime` | |

### `FamilyMember`
A profile documents can be filed under.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `userId` | `String` | → `User`, `onDelete: Cascade` |
| `name` | `String` | |
| `relation` | `String` | `self` \| `spouse` \| `child` \| … (see constants) |
| `birthDate` | `DateTime?` | |
| `notes` | `String?` | |
| `archived` | `Boolean` | soft-hide without deleting |
| `createdAt` / `updatedAt` | `DateTime` | |

Constraints: `@@unique([userId, name])`, index on `userId`.

### `Document`
The core record: stored file, classification, OCR output, extracted data and
dates.

| Group | Columns |
|---|---|
| **File** | `originalName`, `storageKey` @unique, `mimeType`, `sizeBytes`, `sha256`, `encrypted`, `extension` |
| **Classification** | `title`, `docType`, `category`, `classificationConfidence` (0–1), `classificationSource` (`local` \| `manual`; legacy rows may hold `llm`) |
| **Processing** | `status` (`queued`/`processing`/`ready`/`failed`), `errorMessage`, `processedAt` |
| **OCR** | `ocrText`, `ocrStatus` (`pending`/`processing`/`done`/`failed`/`skipped`), `ocrEngine`, `ocrConfidence` |
| **Engine output** | `summary` (written by the built-in local engine), `summarySource`, `extractedData` (JSON string — see below) |
| **Dates** | `issueDate`, `expiryDate`, `expirySource`, `noExpiry` |
| **Relations** | `userId` → `User` (Cascade), `familyMemberId?` → `FamilyMember` (SetNull), `tags` via `DocumentTag` |
| **Meta** | `notes`, `createdAt`, `updatedAt` |

Indexes: `[userId, createdAt]`, `[userId, category]`, `[userId, docType]`,
`[userId, status]`, `[userId, expiryDate]`, `[userId, sha256]`,
`[familyMemberId]`.

> `storageKey` is `<userId>/<uuid>.<ext>` and is validated against a strict
> character pattern before any filesystem call, which is what makes path
> traversal impossible even if a key arrived from a client.

#### The `extractedData` payload

Written and read only through `src/lib/pipeline/extracted-data.ts`, so the column
has one typed contract instead of ad-hoc JSON:

```jsonc
{
  "fields":    { "Name": "…", "CNIC Number": "…" },   // extracted field values
  "evidence":  ["cnic", "date of expiry"],             // terms behind the classification
  "pageCount": 3,                                      // pages in the file (null if unknown)
  "pagesRead":  2,                                     // pages actually read this run
  "dates":     [{ "role": "expiry", "iso": "2030-08-31", "raw": "31-08-2030",
                  "page": 1, "precision": "day", "confidence": 0.9,
                  "evidence": "Date of Expiry 31-08-2030",
                  "reviewRequired": false, "reasons": [] }],
  "reviewed":  { "expiry:2030-08-31:1": { "action": "confirmed", "decidedAt": "…" } },
  "textEdited": false
}
```

- The per-page text is deliberately **not** here — `ocrText` already holds the
  document, and repeating it per page would double the column for no benefit.
- `reviewed` and `textEdited` are user decisions. A date decision is keyed
  `role:iso:page` — the identity of the date the app detected — with the user's
  own value, if they changed it, in `iso`. `reprocessDocument` carries them
  forward; a fresh OCR run may not overwrite them.
- `parseExtractedData` accepts anything: rows written before this shape existed
  (only `fields` and `evidence`), unparseable JSON, and dates or decisions that
  are missing or malformed. Bad input yields an empty contract rather than an
  exception, because a document page must still render.
- All of this lives in a column that already existed, so **no migration** was
  needed for page-aware reading, labelled dates or the correction path.

### `Tag` and `DocumentTag`
Tags are per-user and reusable. `DocumentTag` is the explicit many-to-many join
with a composite primary key `@@id([documentId, tagId])` and an index on `tagId`.

### `AssistantMessage`
Persisted chat history for the assistant.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `userId` | `String` | → `User`, `onDelete: Cascade` |
| `role` | `String` | `user` \| `assistant` |
| `content` | `String` | message text |
| `sources` | `String?` | JSON array of cited document ids |
| `createdAt` | `DateTime` | |

Index: `[userId, createdAt]`.

### `VaultMaterial`

One row per account: the *opaque* key material for the browser-side private vault.

| Column | Type | Notes |
|---|---|---|
| `id` | `String` @id | `cuid()` |
| `userId` | `String` @unique | → `User`, `onDelete: Cascade`; one vault per account |
| `kdfName` / `kdfHash` / `kdfIterations` / `kdfSalt` | `String` / `String` / `Int` / `String` | public KDF parameters; `kdfSalt` is base64, 16 bytes |
| `materialCreatedAt` | `DateTime` | carried inside the material the browser signs |
| `wrappedByPassphrase` | `String` | JSON `EncryptedBlob`, purpose `vk:passphrase` |
| `wrappedByRecoveryKey` | `String` | JSON `EncryptedBlob`, purpose `vk:recovery` |
| `createdAt` / `updatedAt` | `DateTime` | |

The two `wrapped*` columns hold ciphertext produced in the browser. The server
treats them as opaque text: the passphrase, the vault key, the passphrase-derived
key and the recovery key are never stored, sent or derivable from this row.

> **Migration status:** `20261013161402_add_vault_material` exists in
> `prisma/migrations/` but is **not applied** to `dev.db` yet. Until it is applied
> (`npm run db:migrate`, or `prisma migrate deploy` at container boot), the model
> has no table, so `GET/PUT /api/vault/material` fail and the private vault works
> on the device only. Ordinary documents are unaffected. The change is purely
> additive — it touches no existing table, column or index.

## Private-vault data is not in this schema

A private document does **not** get a `Document` row. It is stored as one opaque
object:

```
STORAGE_DIR/vault-documents/<userId>/<opaqueId>.fvault
```

The file holds the browser's JSON record — `content`, `wrappedDek` and `meta`, all
base64 ciphertext — and the server writes and returns those bytes unchanged.

The reason is the table above. `Document` carries `originalName`, `title`, `notes`,
`ocrText`, `summary`, `extractedData`, `docType`, `category`, `issueDate`,
`expiryDate` and `sha256` as **plaintext columns**, and its file is decrypted with
a server-held key so the pipeline can read it. Ciphertext stuffed into those
columns would still be a metadata leak and still not be a vault — so the private
path uses no schema at all. This also means the private vault works with zero
migrations, and legacy rows are neither read nor rewritten by it.

## Why strings instead of enums

SQLite has no native `enum`. Status, relation and category columns are therefore
plain strings whose allowed values live in
[`src/lib/constants.ts`](../src/lib/constants.ts) and are enforced in the service
layer with Zod. This keeps the schema portable to PostgreSQL without a migration
rewrite.

## Extending the taxonomy

To add a document type, add one entry to `DOC_TYPES` in `src/lib/constants.ts`.
The classifier, expiry rules, filters and the type picker all read from that
table — no schema change is required.

## Common operations

```bash
npm run db:migrate     # create + apply a migration in development
npm run db:deploy      # apply pending migrations in production
npm run db:push        # push schema without a migration (prototyping)
npm run db:studio      # browse data in Prisma Studio
npm run db:seed        # create a demo login and family profiles
```

## Data retention

- Deleting a `User` cascades to family members, documents, tags, messages and the
  `VaultMaterial` row.
- Deleting a `FamilyMember` sets its documents' `familyMemberId` to `null`
  (they stay in the vault, unfiled).
- Deleting a `Document` removes its row; the service also deletes the encrypted
  file from `STORAGE_DIR`.
- Deleting a private document unlinks its `<userId>/<id>.fvault` object under
  `STORAGE_DIR/vault-documents`. The opaque id and its bytes are the only thing
  stored server-side, so there is no row to clean up afterwards.
- Two retention notes worth stating plainly: the account-side delete does **not**
  reach into another device's IndexedDB copy of the same vault, and the
  per-account `vault-documents/<userId>/` directory is not swept by the
  `User`-cascade — removing files is a filesystem step, not a database one.
