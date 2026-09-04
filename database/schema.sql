-- FamilyVault AI — Database Schema (Supabase PostgreSQL)
-- Run this whole file in the Supabase SQL Editor (Project -> SQL Editor -> New query).
-- Auth/users are handled entirely by Supabase Auth (auth.users) — no custom users table needed.

-- ============================================================
-- 1. FAMILY MEMBERS
-- ============================================================
create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text not null,
  created_at timestamptz not null default now()
);

create index if not exists family_members_user_id_idx on public.family_members(user_id);

-- ============================================================
-- 2. DOCUMENTS
-- ============================================================
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_member_id uuid references public.family_members(id) on delete set null,
  name text not null,
  category text not null default 'Other',
  file_path text,                    -- path inside the Supabase Storage bucket (null for seeded demo rows)
  file_type text,                    -- mime type
  file_size bigint,
  summary text,                      -- AI-generated short summary
  extracted_data jsonb default '{}'::jsonb,  -- AI-extracted fields (name, doc number, dates, etc.)
  expiry_date date,                  -- nullable — only set when AI detects one
  analysis_status text not null default 'pending', -- pending | analyzing | done | failed | unavailable
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists documents_user_id_idx on public.documents(user_id);
create index if not exists documents_family_member_id_idx on public.documents(family_member_id);
create index if not exists documents_expiry_date_idx on public.documents(expiry_date);

-- ============================================================
-- 3. ROW LEVEL SECURITY — users may only ever touch their own rows
-- ============================================================
alter table public.family_members enable row level security;
alter table public.documents enable row level security;

drop policy if exists "family_members_select_own" on public.family_members;
create policy "family_members_select_own" on public.family_members
  for select using (auth.uid() = user_id);

drop policy if exists "family_members_insert_own" on public.family_members;
create policy "family_members_insert_own" on public.family_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "family_members_update_own" on public.family_members;
create policy "family_members_update_own" on public.family_members
  for update using (auth.uid() = user_id);

drop policy if exists "family_members_delete_own" on public.family_members;
create policy "family_members_delete_own" on public.family_members
  for delete using (auth.uid() = user_id);

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select using (auth.uid() = user_id);

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own" on public.documents
  for insert with check (auth.uid() = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents
  for update using (auth.uid() = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete using (auth.uid() = user_id);

-- ============================================================
-- 4. STORAGE BUCKET
--    Create this from the Supabase dashboard -> Storage -> New bucket
--    Name: "documents"   Public: OFF (private)
--    Then run the policies below so users can only reach their own files.
--    Files must be uploaded under a path prefixed with the user's id, e.g.
--    "<user_id>/<uuid>-<filename>", which is what the backend does.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "documents_storage_select_own" on storage.objects;
create policy "documents_storage_select_own" on storage.objects
  for select using (
    bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "documents_storage_insert_own" on storage.objects;
create policy "documents_storage_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "documents_storage_delete_own" on storage.objects;
create policy "documents_storage_delete_own" on storage.objects
  for delete using (
    bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Done. After running this:
--   1. Confirm the "documents" bucket exists under Storage.
--   2. Confirm both tables exist under Table Editor.
--   3. Confirm RLS is enabled (shown in Table Editor).
-- ============================================================
