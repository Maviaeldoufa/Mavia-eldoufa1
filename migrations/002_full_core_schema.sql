-- MVIA Educational Platform: Full PostgreSQL Core Schema (Idempotent)
-- Covers all 24 entities of DatabaseSchema while preserving exact TEXT IDs,
-- relationships, and scrypt password hashes from data/mafia-db.json.
-- Safe to run repeatedly and safe to run after 001_admin_ranks_support.sql.

-- 1. Administrative Ranks (ensure table & 7 default ranks exist)
CREATE TABLE IF NOT EXISTS public.admin_ranks (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  badge_icon TEXT NOT NULL CHECK (badge_icon IN ('crown', 'medal', 'cpu', 'graduation-cap', 'users', 'headset', 'clipboard-check')),
  badge_color TEXT NOT NULL CHECK (badge_color IN ('gold', 'silver', 'sky', 'emerald', 'violet', 'amber', 'rose')),
  display_order INTEGER NOT NULL DEFAULT 1,
  is_super_admin_rank BOOLEAN NOT NULL DEFAULT FALSE,
  is_visible_in_support BOOLEAN NOT NULL DEFAULT TRUE,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Users (Preserves exact string IDs and scrypt "salt:hash" password hashes)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  password_hash TEXT NOT NULL,
  year SMALLINT NOT NULL CHECK (year IN (1, 2, 3, 4)),
  role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  admin_rank_id TEXT REFERENCES public.admin_ranks(id) ON DELETE SET NULL,
  is_protected BOOLEAN NOT NULL DEFAULT FALSE,
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_reason TEXT,
  suspended_at TIMESTAMPTZ,
  points INTEGER NOT NULL DEFAULT 0,
  quizzes_completed INTEGER NOT NULL DEFAULT 0,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verification_token_hash TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique indexes allow empty/null email on legacy accounts while enforcing uniqueness on real addresses
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON public.users (LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
  ON public.users (phone)
  WHERE phone IS NOT NULL AND phone <> '';

CREATE INDEX IF NOT EXISTS idx_users_role_year_points
  ON public.users (role, year, points DESC);

CREATE INDEX IF NOT EXISTS idx_users_suspended
  ON public.users (is_suspended);

-- 3. Reconcile admin_officials & admin_official_contacts from 001 (UUID -> TEXT linked to public.users)
DO $$
DECLARE
  col_type TEXT;
  official_count INTEGER := 0;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'admin_officials'
    AND column_name = 'user_id';

  IF col_type = 'uuid' THEN
    SELECT COUNT(*) INTO official_count FROM public.admin_officials;
    IF official_count = 0 THEN
      DROP TABLE IF EXISTS public.admin_official_contacts;
      DROP TABLE IF EXISTS public.admin_officials;
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_officials (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rank_id TEXT NOT NULL REFERENCES public.admin_ranks(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  title_note TEXT,
  show_in_support BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by TEXT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_officials_rank_active
  ON public.admin_officials (rank_id, is_active, show_in_support);

-- Strictly isolated table for private WhatsApp numbers
CREATE TABLE IF NOT EXISTS public.admin_official_contacts (
  official_id TEXT PRIMARY KEY REFERENCES public.admin_officials(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Sessions (Bearer tokens)
CREATE TABLE IF NOT EXISTS public.sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id
  ON public.sessions (user_id);

-- 5. Courses & Folders & Summaries
CREATE TABLE IF NOT EXISTS public.courses (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  code TEXT NOT NULL,
  year SMALLINT NOT NULL CHECK (year IN (1, 2, 3, 4)),
  track TEXT NOT NULL CHECK (track IN ('GIS', 'Programming', 'General')),
  description TEXT NOT NULL DEFAULT '',
  instructor TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  release_at TIMESTAMPTZ,
  release_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_courses_year_track
  ON public.courses (year, track);

CREATE TABLE IF NOT EXISTS public.course_folders (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  release_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_course_folders_course_id
  ON public.course_folders (course_id);

CREATE TABLE IF NOT EXISTS public.summaries (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES public.course_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  file_url TEXT,
  file_name TEXT,
  file_size BIGINT,
  release_at TIMESTAMPTZ,
  viewed_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_course_folder
  ON public.summaries (course_id, folder_id);

-- 6. Quizzes, Question Bank & Submissions
CREATE TABLE IF NOT EXISTS public.quizzes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  folder_id TEXT REFERENCES public.course_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  points_per_question INTEGER NOT NULL DEFAULT 25,
  randomize_questions BOOLEAN NOT NULL DEFAULT FALSE,
  randomize_options BOOLEAN NOT NULL DEFAULT FALSE,
  questions_per_attempt INTEGER NOT NULL DEFAULT 0,
  release_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quizzes_course_folder
  ON public.quizzes (course_id, folder_id);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id TEXT NOT NULL,
  quiz_id TEXT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL DEFAULT 0,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  PRIMARY KEY (quiz_id, id)
);

CREATE TABLE IF NOT EXISTS public.quiz_submissions (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_questions INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER,
  breakdown JSONB,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_user_quiz
  ON public.quiz_submissions (user_id, quiz_id, submitted_at DESC);

-- 7. Announcements, Notifications & Learning Resources
CREATE TABLE IF NOT EXISTS public.announcements (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('home', 'courses')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('exam', 'news', 'release')),
  target_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('course', 'exam', 'lecture', 'announcement', 'general')),
  target_section TEXT NOT NULL CHECK (target_section IN ('home', 'courses', 'learning', 'gpa', 'community')),
  year SMALLINT NOT NULL DEFAULT 0 CHECK (year IN (0, 1, 2, 3, 4)),
  read_by JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_year_created
  ON public.notifications (year, created_at DESC);

CREATE TABLE IF NOT EXISTS public.learning_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('youtube', 'platform')),
  category TEXT NOT NULL CHECK (category IN ('GIS', 'Programming', 'General')),
  year SMALLINT NOT NULL DEFAULT 0 CHECK (year IN (0, 1, 2, 3, 4)),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lectures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('GIS', 'Programming', 'General')),
  year SMALLINT NOT NULL DEFAULT 0 CHECK (year IN (0, 1, 2, 3, 4)),
  instructor TEXT NOT NULL DEFAULT '',
  video_url TEXT NOT NULL,
  subtitle_url TEXT,
  attachment_url TEXT,
  attachment_name TEXT,
  attachment_size BIGINT,
  allow_download BOOLEAN NOT NULL DEFAULT TRUE,
  duration_seconds INTEGER,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lecture_progress (
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  lecture_id TEXT NOT NULL,
  last_position_seconds DOUBLE PRECISION NOT NULL DEFAULT 0,
  playback_rate DOUBLE PRECISION NOT NULL DEFAULT 1,
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, lecture_id)
);

-- 8. Community Groups & Real-time Chat Messages
CREATE TABLE IF NOT EXISTS public.group_links (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('WhatsApp', 'Telegram', 'Discord', 'Other')),
  year SMALLINT NOT NULL DEFAULT 0 CHECK (year IN (0, 1, 2, 3, 4)),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL CHECK (room IN ('general', 'year-1', 'year-2', 'year-3', 'year-4')),
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL CHECK (user_role IN ('admin', 'teacher', 'student')),
  user_year SMALLINT NOT NULL CHECK (user_year IN (1, 2, 3, 4)),
  rank_badge JSONB,
  text TEXT NOT NULL DEFAULT '',
  audio_url TEXT,
  audio_name TEXT,
  audio_mime_type TEXT,
  audio_size BIGINT,
  audio_duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created
  ON public.chat_messages (room, created_at DESC);

-- 9. Student GPA, Progress & Tasks
CREATE TABLE IF NOT EXISTS public.gpa_tables (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_progress (
  user_id TEXT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  enrolled_course_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  completed_summary_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_lesson JSONB,
  study_minutes INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  course_title TEXT,
  type TEXT NOT NULL CHECK (type IN ('task', 'exam')),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_tasks_user_id
  ON public.student_tasks (user_id, completed);

-- 10. Support Tickets, Error Logs, Admin Audit Logs
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  user_year SMALLINT NOT NULL CHECK (user_year IN (1, 2, 3, 4)),
  category TEXT NOT NULL CHECK (category IN ('bug', 'course', 'account', 'suggestion')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  section TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_review', 'resolved')),
  admin_reply TEXT,
  replied_by TEXT,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status
  ON public.support_tickets (user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.error_logs (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('server', 'client', 'ai')),
  message TEXT NOT NULL,
  path TEXT,
  user_id TEXT,
  stack TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at
  ON public.error_logs (created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_user_id TEXT,
  target_user_name TEXT,
  details TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON public.admin_audit_logs (created_at DESC);

-- 11. Platform Singleton Settings & Visitor Analytics
CREATE TABLE IF NOT EXISTS public.platform_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  whatsapp_number TEXT NOT NULL DEFAULT '',
  telegram_url TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.maintenance_state (
  id TEXT PRIMARY KEY DEFAULT 'default',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS public.platform_analytics_summary (
  id TEXT PRIMARY KEY DEFAULT 'default',
  total_visits BIGINT NOT NULL DEFAULT 0,
  daily_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.platform_visitors (
  visitor_key TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  user_year SMALLINT CHECK (user_year IN (1, 2, 3, 4)),
  last_visit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  visit_count INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_platform_visitors_last_visit
  ON public.platform_visitors (last_visit_at DESC);
