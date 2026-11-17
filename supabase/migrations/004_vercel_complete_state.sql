-- ============================================================
-- Mavia Educational Platform - Migration 004:
-- Complete Schema Parity + Durable App State Snapshot for Vercel
-- ============================================================

-- 1. Missing columns added in newer features
ALTER TABLE public.course_folders
  ADD COLUMN IF NOT EXISTS viewed_by JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.summaries
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'summary';

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS difficulty TEXT,
  ADD COLUMN IF NOT EXISTS generated_by_ai BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.platform_config
  ADD COLUMN IF NOT EXISTS admin_activation_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS admin_activation_password_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS admin_activation_default_rank_id TEXT;

-- 2. Course Assignments (uploaded PDFs/images/notes inside folders)
CREATE TABLE IF NOT EXISTS public.course_assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES public.course_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('pdf', 'image', 'text')),
  content_text TEXT,
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  mime_type TEXT,
  role_tag TEXT,
  created_by TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Dedicated Support Team Slots (1..7)
CREATE TABLE IF NOT EXISTS public.support_team (
  id TEXT PRIMARY KEY,
  slot_number INTEGER NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  specialty TEXT,
  whatsapp_number TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Admin Notes & Reactions on Student Profiles
CREATE TABLE IF NOT EXISTS public.user_profile_notes (
  id TEXT PRIMARY KEY,
  target_user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  content TEXT NOT NULL,
  reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Atomic Durable Snapshot Table for Vercel Serverless Sync
CREATE TABLE IF NOT EXISTS public.app_state_snapshot (
  id TEXT PRIMARY KEY DEFAULT 'default',
  payload JSONB NOT NULL,
  version BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Strict RLS & Privileges (Service Role / Backend only)
ALTER TABLE public.course_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profile_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_state_snapshot ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.course_assignments,
  public.support_team,
  public.user_profile_notes,
  public.app_state_snapshot
FROM anon, authenticated;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'course_assignments',
    'support_team',
    'user_profile_notes',
    'app_state_snapshot'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_full_%I" ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "service_role_full_%I" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;
