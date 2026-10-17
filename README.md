# FamilyVault AI

One secure place for your family's important documents. Upload a CNIC, passport, certificate, or
medical record, and FamilyVault AI files it under the right category and family member, reads it
with AI to pull out a summary and key fields, and flags anything expiring soon.

Built as a hackathon MVP — small, deployable, and reliable rather than feature-heavy.

---

## 1. Features

- Email/password sign up, log in, log out (Supabase Auth)
- Upload documents (PDF, PNG, JPG, WEBP) to private storage
- Assign a document to a category and a family member
- **Analyze with AI** — categorizes the document, writes a short summary, extracts key fields
  (name, document number, issue date, issuing authority), and detects an expiry date if present
- Dashboard with total documents, expiring-soon count, family member count, recent uploads, and
  an expiry-alerts list (Active / Expiring Soon / Expired)
- Search documents by name, filter by category
- Family Members page — add people, see each person's documents
- AI Assistant — answers questions using only your own document/family data (no data leaves your
  Supabase project except the text sent to the AI provider during analysis/Q&A)
- One-click demo data so a fresh account isn't empty for a demo
- Every AI feature degrades gracefully: if `ANTHROPIC_API_KEY` is missing or the API call fails,
  the rest of the app keeps working and shows a clear "AI unavailable" message instead of crashing

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite, Tailwind CSS, React Router |
| Backend | Node.js + Express |
| Database | Supabase PostgreSQL (with Row Level Security) |
| Auth | Supabase Auth |
| File storage | Supabase Storage (private bucket) |
| AI | Anthropic Claude API (single provider) |

No Docker, no Kubernetes, no message queues, no vector database — one frontend, one backend, one
Supabase project.

## 3. Architecture

```
User uploads a document
        │
        ▼
Frontend (React) ──fetch──► Backend (Express) ──service role──► Supabase (Postgres + Storage)
        │                          │
        │                          └─ verifies the Supabase session token on every request
        │
        └─ Supabase Auth directly (sign up / log in / log out — no backend involved)

"Analyze with AI" ──► Backend downloads the file from Storage ──► extracts text (PDF) or sends
the image directly ──► Claude API returns category / summary / extracted fields / expiry date
──► saved back to the documents table
```

The frontend never talks to the database or to Claude directly — the backend holds the Supabase
**service role** key and the **Anthropic** key, and every request is scoped to
`req.userId` (from the verified session token), so users can only ever read or write their own
rows even though the backend uses the service role.

```
familyvault-ai/
├── frontend/     React + Vite app (Vercel)
├── backend/      Express API (Render, or any Node host)
├── database/
│   └── schema.sql   Run once in the Supabase SQL editor
├── .env.example  (one inside frontend/ and one inside backend/)
└── README.md
```

## 4. Environment variables

### `frontend/.env` (copy from `frontend/.env.example`)

| Variable | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` `public` key |
| `VITE_API_URL` | The deployed backend URL, no trailing slash (e.g. `https://familyvault-api.onrender.com`) |

### `backend/.env` (copy from `backend/.env.example`)

| Variable | Where to find it |
|---|---|
| `PORT` | Any free port, e.g. `5000` |
| `FRONTEND_ORIGIN` | The deployed frontend URL, no trailing slash. Comma-separate multiple origins. |
| `SUPABASE_URL` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key. **Backend only — never in the frontend.** |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys. Optional at startup — the app runs without it, AI features just show an "unavailable" message. |

Never commit `.env` files — both are already covered by `.gitignore`.

## 5. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste the entire contents of `database/schema.sql`, and run
   it. This creates the `family_members` and `documents` tables, enables Row Level Security, adds
   the "only see your own rows" policies, and creates the `documents` storage bucket with its own
   access policies.
3. Confirm under **Table Editor** that both tables exist and RLS is enabled.
4. Confirm under **Storage** that a bucket named `documents` exists (private, not public).
5. Copy the Project URL, `anon` key, and `service_role` key into the two `.env` files as above.
6. By default Supabase requires email confirmation for new sign-ups. For a fast demo, you can
   turn this off under **Authentication → Providers → Email → Confirm email**, or just check the
   confirmation email during the demo.

## 6. AI API setup

1. Create an API key at [console.anthropic.com](https://console.anthropic.com).
2. Put it in `backend/.env` as `ANTHROPIC_API_KEY`. That's the only AI provider used anywhere in
   this project.
3. If you skip this step, the app still starts and runs — document analysis and the AI Assistant
   will show "AI analysis is temporarily unavailable" instead of failing.

## 7. Local development

```bash
# Backend
cd backend
npm install
cp .env.example .env      # fill in the values from sections 5–6
npm run dev                # starts on http://localhost:5000

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env      # VITE_API_URL=http://localhost:5000
npm run dev                # starts on http://localhost:5173
```

Open `http://localhost:5173`, sign up, and go to **Settings → Load demo data** to populate a few
sample documents and family members if you don't want to upload real files during development.

## 8. Production build

```bash
cd frontend && npm run build   # outputs frontend/dist
cd backend  && npm start       # runs the Express server directly (no build step needed)
```

## 9. Deployment

**Frontend → Netlify**
- Import the repository. The root `netlify.toml` sets the base directory to `frontend/`,
  the build command to `npm ci --include=dev && npm run build`, and the publish directory to
  `dist` within `frontend/`.
- Netlify installs dependencies from `frontend/package.json` and uses its committed lockfile.
  The build explicitly installs development dependencies, including Vite, before compiling,
  so it also works when the deploy runner has not installed dependencies beforehand.
  No root `package.json` is needed.
- Add the three frontend `VITE_*` environment variables from section 4 in Netlify, with
  `VITE_API_URL` pointing to the deployed Express backend, then deploy.
- The configuration includes a fallback to `index.html` for React Router page URLs.
- Deploy the backend separately as described below and include the Netlify frontend URL in
  its `FRONTEND_ORIGIN` setting.

**Frontend → Vercel**
- Import the repo, set the project root to `frontend/`.
- Build command `npm run build`, output directory `dist` (Vercel's Vite preset does this
  automatically).
- Add the three `VITE_*` environment variables from section 4.

**Backend → Render**
- New Web Service, root directory `backend/`.
- Build command `npm install`, start command `npm start`.
- Add the backend environment variables from section 4. Set `FRONTEND_ORIGIN` to your Vercel URL.

**Database/Storage/Auth → Supabase** — already covered in section 5, nothing to deploy.

After both are live, go back into the Vercel project and set `VITE_API_URL` to the Render URL,
then redeploy the frontend so it points at the live backend instead of localhost.

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "The app is not configured yet" banner | Missing `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` | Set them in `frontend/.env` (or the Vercel dashboard) and redeploy/restart |
| Every API call returns 503 "Server is not configured" | Missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` on the backend | Set them in `backend/.env` (or Render dashboard) and restart |
| Browser console shows a CORS error | Backend's `FRONTEND_ORIGIN` doesn't match the frontend's actual URL | Update `FRONTEND_ORIGIN` on the backend to the exact deployed frontend URL (no trailing slash), restart |
| Upload fails immediately | Storage bucket `documents` doesn't exist or its policies weren't created | Re-run `database/schema.sql` in the Supabase SQL editor |
| "AI analysis is temporarily unavailable" | `ANTHROPIC_API_KEY` missing or invalid, or the API call failed | Set/check the key on the backend; the rest of the app keeps working either way |
| Frontend loads but API calls fail with "Failed to fetch" | `VITE_API_URL` still points at `localhost` in production | Set it to the deployed backend URL and rebuild the frontend |
| Sign up succeeds but login says invalid credentials | Supabase email confirmation is on and the email hasn't been confirmed yet | Confirm via the email link, or turn off email confirmation for the demo (section 5) |

## 11. Demo instructions

1. Deploy (or run locally) following sections 5–9.
2. Sign up for an account.
3. Go to **Settings → Load demo data** — this adds 4 family members and 5 sample documents
   (clearly labeled "Demo"), including one expiring in 10 days and one in 28 days, so the
   dashboard's expiry alerts have something to show immediately.
4. Open **Dashboard** to show the stats and expiry alerts.
5. Open **Documents**, upload a real file, and click **Analyze with AI** to show the live
   extraction (category, summary, fields, expiry date).
6. Open **AI Assistant** and ask one of the suggested questions, e.g. "What documents are
   expiring soon?"
7. Open **Family** to show documents grouped by person.
