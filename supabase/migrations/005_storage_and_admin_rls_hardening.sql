-- ============================================================
-- Mavia Educational Platform - Migration 005:
-- Supabase Storage Bucket & Strict Admin RBAC / RLS Hardening
-- ============================================================

-- 1. Provision public-read Supabase Storage bucket for durable uploads (PDFs, images, audio, videos, subtitles)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mavia-uploads',
  'mavia-uploads',
  TRUE,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/mpeg',
    'audio/mp3',
    'audio/webm',
    'audio/ogg',
    'audio/wav',
    'audio/mp4',
    'audio/x-m4a',
    'video/mp4',
    'video/webm',
    'text/vtt',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Storage Object RLS Policies:
-- Public read for uploaded course materials/covers/audio, while writes/deletes are restricted strictly
-- to Backend Express Server (service_role) after Admin/Teacher/Student RBAC verification.
DROP POLICY IF EXISTS "mavia_uploads_public_read" ON storage.objects;
CREATE POLICY "mavia_uploads_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'mavia-uploads');

DROP POLICY IF EXISTS "mavia_uploads_service_role_write" ON storage.objects;
CREATE POLICY "mavia_uploads_service_role_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'mavia-uploads')
  WITH CHECK (bucket_id = 'mavia-uploads');

-- 3. Explicit defense-in-depth privilege lockout against non-admin privilege escalation on core tables
REVOKE ALL ON TABLE
  public.users,
  public.sessions,
  public.admin_ranks,
  public.admin_officials,
  public.admin_official_contacts,
  public.admin_audit_logs,
  public.platform_config,
  public.maintenance_state,
  public.error_logs,
  public.course_assignments,
  public.support_team,
  public.user_profile_notes,
  public.app_state_snapshot
FROM anon;

REVOKE INSERT, UPDATE, DELETE ON TABLE
  public.users,
  public.sessions,
  public.admin_ranks,
  public.admin_audit_logs,
  public.platform_config,
  public.maintenance_state,
  public.app_state_snapshot
FROM authenticated;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'admin_ranks',
    'users',
    'admin_officials',
    'admin_official_contacts',
    'sessions',
    'courses',
    'course_folders',
    'summaries',
    'quizzes',
    'quiz_questions',
    'quiz_submissions',
    'announcements',
    'notifications',
    'learning_links',
    'lectures',
    'lecture_progress',
    'group_links',
    'chat_messages',
    'gpa_tables',
    'student_progress',
    'student_tasks',
    'support_tickets',
    'error_logs',
    'admin_audit_logs',
    'platform_config',
    'maintenance_state',
    'platform_analytics_summary',
    'platform_visitors'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_full_%I" ON public.%I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "service_role_full_%I" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      tbl, tbl
    );
  END LOOP;
END $$;
