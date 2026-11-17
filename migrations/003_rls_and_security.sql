-- MVIA Educational Platform: Strict Row Level Security (RLS) & Student PII Isolation
-- Idempotent security migration.
-- Architecture note: The Express backend accesses Supabase using SERVICE_ROLE_KEY
-- (which bypasses RLS safely on the server). All direct PostgREST access via `anon`
-- or `authenticated` roles is strictly locked down to prevent PII or answer-key leaks.

-- 1. Enable RLS across ALL tables
ALTER TABLE public.admin_ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_officials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_official_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learning_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lecture_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpa_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_analytics_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_visitors ENABLE ROW LEVEL SECURITY;

-- 2. Revoke direct `anon` access to every table (prevents unauthenticated PostgREST scraping)
REVOKE ALL ON TABLE
  public.admin_ranks,
  public.users,
  public.admin_officials,
  public.admin_official_contacts,
  public.sessions,
  public.courses,
  public.course_folders,
  public.summaries,
  public.quizzes,
  public.quiz_questions,
  public.quiz_submissions,
  public.announcements,
  public.notifications,
  public.learning_links,
  public.lectures,
  public.lecture_progress,
  public.group_links,
  public.chat_messages,
  public.gpa_tables,
  public.student_progress,
  public.student_tasks,
  public.support_tickets,
  public.error_logs,
  public.admin_audit_logs,
  public.platform_config,
  public.maintenance_state,
  public.platform_analytics_summary,
  public.platform_visitors
FROM anon;

-- 3. Revoke `authenticated` access to highly sensitive tables (hashes, sessions, WhatsApp numbers, audit logs, quiz answer keys)
REVOKE ALL ON TABLE
  public.users,
  public.sessions,
  public.admin_official_contacts,
  public.quiz_questions,
  public.error_logs,
  public.admin_audit_logs,
  public.platform_visitors,
  public.platform_analytics_summary
FROM authenticated;

-- 4. Safe public/leaderboard view (ZERO password_hash, email, phone, or suspension PII)
CREATE OR REPLACE VIEW public.leaderboard_profiles AS
SELECT
  id,
  name,
  year,
  role,
  admin_rank_id,
  points,
  quizzes_completed,
  email_verified,
  created_at
FROM public.users;

REVOKE ALL ON public.leaderboard_profiles FROM anon;
GRANT SELECT ON public.leaderboard_profiles TO authenticated;

-- 5. Text-compatible RBAC helper functions (idempotent replacement of 001 functions)
DROP FUNCTION IF EXISTS public.is_mvia_super_admin(UUID);
DROP FUNCTION IF EXISTS public.has_mvia_permission(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.is_mvia_super_admin(check_user_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    LEFT JOIN public.admin_ranks r ON r.id = u.admin_rank_id
    WHERE u.id = check_user_id
      AND u.role = 'admin'
      AND (
        u.admin_rank_id = 'rank-super-admin'
        OR (u.is_protected = TRUE AND u.admin_rank_id IS NULL)
        OR r.is_super_admin_rank = TRUE
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.has_mvia_permission(check_user_id TEXT, perm TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    LEFT JOIN public.admin_ranks r ON r.id = u.admin_rank_id
    WHERE u.id = check_user_id
      AND u.role = 'admin'
      AND (
        public.is_mvia_super_admin(check_user_id)
        OR (perm <> 'manage_ranks' AND r.permissions ? perm)
      )
  );
$$;

-- 6. Explicit idempotent RLS Policies for authenticated PostgREST callers (defense-in-depth)
DROP POLICY IF EXISTS "Authenticated read visible ranks" ON public.admin_ranks;
CREATE POLICY "Authenticated read visible ranks"
  ON public.admin_ranks FOR SELECT
  TO authenticated
  USING (is_visible_in_support = TRUE OR public.has_mvia_permission(auth.uid()::text, 'manage_officials'));

DROP POLICY IF EXISTS "Super Admin update ranks" ON public.admin_ranks;
CREATE POLICY "Super Admin update ranks"
  ON public.admin_ranks FOR UPDATE
  TO authenticated
  USING (public.is_mvia_super_admin(auth.uid()::text))
  WITH CHECK (public.is_mvia_super_admin(auth.uid()::text));

DROP POLICY IF EXISTS "Authenticated read active support officials" ON public.admin_officials;
CREATE POLICY "Authenticated read active support officials"
  ON public.admin_officials FOR SELECT
  TO authenticated
  USING (
    (is_active = TRUE AND show_in_support = TRUE)
    OR public.has_mvia_permission(auth.uid()::text, 'manage_officials')
  );

DROP POLICY IF EXISTS "Super Admin insert officials" ON public.admin_officials;
CREATE POLICY "Super Admin insert officials"
  ON public.admin_officials FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_mvia_super_admin(auth.uid()::text)
    AND user_id <> auth.uid()::text
  );

DROP POLICY IF EXISTS "Authorized update non-self officials" ON public.admin_officials;
CREATE POLICY "Authorized update non-self officials"
  ON public.admin_officials FOR UPDATE
  TO authenticated
  USING (
    user_id <> auth.uid()::text
    AND (
      public.is_mvia_super_admin(auth.uid()::text)
      OR (
        public.has_mvia_permission(auth.uid()::text, 'manage_officials')
        AND rank_id NOT IN ('rank-super-admin', 'rank-deputy-director')
      )
    )
  )
  WITH CHECK (
    user_id <> auth.uid()::text
    AND (
      public.is_mvia_super_admin(auth.uid()::text)
      OR (
        public.has_mvia_permission(auth.uid()::text, 'manage_officials')
        AND rank_id NOT IN ('rank-super-admin', 'rank-deputy-director')
      )
    )
  );

DROP POLICY IF EXISTS "Super Admin delete officials" ON public.admin_officials;
CREATE POLICY "Super Admin delete officials"
  ON public.admin_officials FOR DELETE
  TO authenticated
  USING (
    public.is_mvia_super_admin(auth.uid()::text)
    AND user_id <> auth.uid()::text
  );

DROP POLICY IF EXISTS "Super Admin manage official contacts" ON public.admin_official_contacts;
CREATE POLICY "Super Admin manage official contacts"
  ON public.admin_official_contacts FOR ALL
  TO authenticated
  USING (public.is_mvia_super_admin(auth.uid()::text))
  WITH CHECK (public.is_mvia_super_admin(auth.uid()::text));

-- Student-owned personal workspace isolation policies
DROP POLICY IF EXISTS "Students read own gpa" ON public.gpa_tables;
CREATE POLICY "Students read own gpa"
  ON public.gpa_tables FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Students manage own progress" ON public.student_progress;
CREATE POLICY "Students manage own progress"
  ON public.student_progress FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Students manage own tasks" ON public.student_tasks;
CREATE POLICY "Students manage own tasks"
  ON public.student_tasks FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Students manage own lecture progress" ON public.lecture_progress;
CREATE POLICY "Students manage own lecture progress"
  ON public.lecture_progress FOR ALL
  TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);

DROP POLICY IF EXISTS "Students read own submissions" ON public.quiz_submissions;
CREATE POLICY "Students read own submissions"
  ON public.quiz_submissions FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.has_mvia_permission(auth.uid()::text, 'manage_quizzes')
  );

DROP POLICY IF EXISTS "Students access own support tickets" ON public.support_tickets;
CREATE POLICY "Students access own support tickets"
  ON public.support_tickets FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()::text
    OR public.has_mvia_permission(auth.uid()::text, 'manage_support')
  );

-- Authenticated read-only catalog access (non-sensitive educational content)
DROP POLICY IF EXISTS "Authenticated read courses" ON public.courses;
CREATE POLICY "Authenticated read courses"
  ON public.courses FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read folders" ON public.course_folders;
CREATE POLICY "Authenticated read folders"
  ON public.course_folders FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read summaries" ON public.summaries;
CREATE POLICY "Authenticated read summaries"
  ON public.summaries FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read quizzes" ON public.quizzes;
CREATE POLICY "Authenticated read quizzes"
  ON public.quizzes FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read announcements" ON public.announcements;
CREATE POLICY "Authenticated read announcements"
  ON public.announcements FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read learning links" ON public.learning_links;
CREATE POLICY "Authenticated read learning links"
  ON public.learning_links FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read lectures" ON public.lectures;
CREATE POLICY "Authenticated read lectures"
  ON public.lectures FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read group links" ON public.group_links;
CREATE POLICY "Authenticated read group links"
  ON public.group_links FOR SELECT TO authenticated USING (TRUE);

DROP POLICY IF EXISTS "Authenticated read chat messages" ON public.chat_messages;
CREATE POLICY "Authenticated read chat messages"
  ON public.chat_messages FOR SELECT TO authenticated USING (TRUE);
