# Deploying the FamilyVault PWA to Netlify

The browser-encrypted vault is a **static site** inside this repository (`pwa/`).
It has no server, no database and no accounts: everything is stored on the
device that opens it, scrambled before it is saved. That means it can be hosted
on any static host. This document covers the approved route: the existing
Netlify site.

## What gets deployed

- **Deployed:** the static PWA only (the folder `pwa/out` after a build).
- **Not deployed:** the server-side Next.js app (`src/`), its database, and every
  API route. Those stay your private copy on this machine; the PWA never talks
  to them.

Nothing in the published folder can read your documents: there are no API keys,
no database, no environment variables. The pages are plain files.

## One-time setup

1. Put the repo on Netlify (the `netlify.toml` in the repo root already points
   Netlify at the right build: command `npm run build:pwa`, publish folder
   `pwa/out`, Node 22). If the site is already linked to this repo, pushing the
   branch is enough — Netlify builds and publishes the PWA itself.
2. If you prefer to publish by hand from this machine instead, install the CLI
   once: `npm install -g netlify-cli` and run `npx netlify login`.

## The deploy step (needs your approval each time)

Build and publish in one go:

```
npm run build:pwa && npx netlify deploy --prod --dir=pwa/out
```

That command publishes the vault to your live Netlify URL. Nothing is sent
anywhere until you run it — the build output stays on this machine.

## What users do

1. Open the URL in Chrome or Edge on the phone or computer.
2. Choose **Add to Home screen** (or **Install app** on desktop). The app icon
   appears like a native app.
3. Make the vault with a passphrase, save the recovery file when shown, and add
   documents. All of it stays on that device; the Netlify site only ever
   delivers the app files.

## After each code update

Re-run the same build-and-publish command. Repeat visitors get the new app the
next time they open it; their documents stay untouched on their devices.

## Offline and updates

The published folder is plain files, and the service worker (`pwa/public/sw.js`,
currently cache version `v3`) decides how each request is answered:

- **Opening the app** goes to the network first and falls back to the saved copy
  only when there is no network. That is what makes "they get the new app on the
  next open" true rather than hoped for: a stale shell cannot pin an old release.
- **Built assets, icons, the manifest, the on-device reading files
  (`/reading-runtime/`) and the demo pictures (`/recognition-samples/`)** are
  served from cache first and refreshed quietly, so the installed app opens with
  the router off.
- **Nothing under `/api/` and nothing that is not a GET** is ever cached, and no
  document data passes through the worker at all — it lives in IndexedDB and is
  decrypted in the page.

Observed locally on 2026-10-17 against the built export (`npm run build:pwa`,
then `node scripts/serve-pwa-preview.mjs 3413`): the worker registered, 20
entries were cached, and with the **origin server stopped** the app still opened,
the demo picture still rendered, and a sample still read back with 100% of words
matched.

Two honest limits:

- The reading files and demo pictures are cached the first time they are
  requested, so a device that has never opened the handwriting demo while online
  will not be able to read offline until it has done so once.
- Expiry reminders can only appear while the app is open. There is no server and
  no push service in this app, so nothing can wake a phone that is closed, and
  the screen says so instead of promising otherwise.

## Limits to keep in mind

- Each device holds its own vault. Moving documents to a new phone or computer
  is done with a backup file: **Save a backup file** on the old device, then
  **Choose a backup file to restore** on the new one.
- Clearing the browser's site data for the app erases that device's vault. The
  on-screen storage line and the footer say this too; the backup file is the
  protection.
- There is no "reset my passphrase by e-mail". The recovery file downloaded at
  setup is the only way back into a forgotten vault; keep it somewhere safe.
