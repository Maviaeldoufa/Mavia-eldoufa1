-- MVIA Platform: Administrative Ranks, Officials & Secure Support Directory
-- Run inside Supabase SQL Editor when migrating/deploying to Supabase PostgreSQL.
-- Preserves existing user accounts and enforces strict Row Level Security (RLS).

-- 1. Administrative Ranks Table (7 default positions)
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

-- Seed 7 default ranks with ZERO automatic permissions on ranks 2-7
INSERT INTO public.admin_ranks (
  id, slug, name_ar, name_en, description, badge_icon, badge_color,
  display_order, is_super_admin_rank, is_visible_in_support, permissions
) VALUES
  (
    'rank-super-admin', 'super_admin', 'المدير العام', 'Super Admin',
    'القيادة العليا للمنصة مع كامل الصلاحيات وإدارة الرتب وتوزيع المسؤولين.',
    'crown', 'gold', 1, TRUE, TRUE,
    '["manage_ranks","manage_officials","manage_courses","manage_quizzes","manage_learning","manage_community","manage_students","manage_support","view_sensitive_data"]'::jsonb
  ),
  (
    'rank-deputy-director', 'deputy_director', 'نائب المدير العام', 'Deputy General Manager',
    'ينوب عن المدير العام في الإشراف والتشغيل وفق الصلاحيات المفوضة فقط.',
    'medal', 'silver', 2, FALSE, TRUE, '[]'::jsonb
  ),
  (
    'rank-tech-director', 'tech_director', 'مدير النظام والتقنية', 'Systems & Tech Director',
    'مسؤول البنية التقنية والأنظمة والأعطال الفنية.',
    'cpu', 'sky', 3, FALSE, TRUE, '[]'::jsonb
  ),
  (
    'rank-academic-director', 'academic_director', 'مدير الشؤون التعليمية', 'Academic Affairs Director',
    'الإشراف على المناهج والمسارات التعليمية والمواد الدراسية.',
    'graduation-cap', 'emerald', 4, FALSE, TRUE, '[]'::jsonb
  ),
  (
    'rank-student-affairs', 'student_affairs', 'مسؤول شؤون الطلاب', 'Student Affairs Officer',
    'متابعة حسابات الطلاب واستفسارات الفرق الدراسية.',
    'users', 'violet', 5, FALSE, TRUE, '[]'::jsonb
  ),
  (
    'rank-tech-support', 'tech_support', 'مسؤول الدعم الفني', 'Technical Support Officer',
    'استقبال البلاغات ومساعدة الطلاب في مشاكل الدخول والاستخدام.',
    'headset', 'amber', 6, FALSE, TRUE, '[]'::jsonb
  ),
  (
    'rank-exams-content', 'exams_content', 'مسؤول الاختبارات والمحتوى', 'Exams & Content Officer',
    'متابعة بنوك الأسئلة والاختبارات والملخصات الدراسية.',
    'clipboard-check', 'rose', 7, FALSE, TRUE, '[]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- 2. Officials Public Directory Table (NO phone numbers stored here!)
CREATE TABLE IF NOT EXISTS public.admin_officials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rank_id TEXT NOT NULL REFERENCES public.admin_ranks(id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL,
  title_note TEXT,
  show_in_support BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_officials_rank_active
  ON public.admin_officials (rank_id, is_active, show_in_support);

-- 3. Private WhatsApp Contact Table (Strictly isolated from students & public queries)
CREATE TABLE IF NOT EXISTS public.admin_official_contacts (
  official_id UUID PRIMARY KEY REFERENCES public.admin_officials(id) ON DELETE CASCADE,
  whatsapp_number TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS) on all new tables
ALTER TABLE public.admin_ranks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_officials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_official_contacts ENABLE ROW LEVEL SECURITY;

-- Helper function: checks whether caller is Super Admin (never trusts user display name)
CREATE OR REPLACE FUNCTION public.is_mvia_super_admin(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_officials o
    JOIN public.admin_ranks r ON r.id = o.rank_id
    WHERE o.user_id = check_user_id
      AND o.is_active = TRUE
      AND r.is_super_admin_rank = TRUE
  );
$$;

-- Helper function: checks whether caller holds a specific rank permission
CREATE OR REPLACE FUNCTION public.has_mvia_permission(check_user_id UUID, perm TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_officials o
    JOIN public.admin_ranks r ON r.id = o.rank_id
    WHERE o.user_id = check_user_id
      AND o.is_active = TRUE
      AND (
        r.is_super_admin_rank = TRUE
        OR r.permissions ? perm
      )
  );
$$;

-- RLS Policies for admin_ranks:
-- Authenticated users can read visible support ranks (non-sensitive metadata only)
CREATE POLICY "Authenticated read visible ranks"
  ON public.admin_ranks FOR SELECT
  TO authenticated
  USING (is_visible_in_support = TRUE OR public.has_mvia_permission(auth.uid(), 'manage_officials'));

-- Only Super Admin can update ranks or permissions
CREATE POLICY "Super Admin update ranks"
  ON public.admin_ranks FOR UPDATE
  TO authenticated
  USING (public.is_mvia_super_admin(auth.uid()))
  WITH CHECK (public.is_mvia_super_admin(auth.uid()));

-- RLS Policies for admin_officials:
-- Students can read ONLY active & support-visible officials (NO phone column exists in this table!)
CREATE POLICY "Authenticated read active support officials"
  ON public.admin_officials FOR SELECT
  TO authenticated
  USING (
    (is_active = TRUE AND show_in_support = TRUE)
    OR public.has_mvia_permission(auth.uid(), 'manage_officials')
  );

-- Only Super Admin (or explicitly delegated manage_officials excluding rank 1/2 and self) can write officials
CREATE POLICY "Super Admin insert officials"
  ON public.admin_officials FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_mvia_super_admin(auth.uid())
    AND user_id <> auth.uid()
  );

CREATE POLICY "Authorized update non-self officials"
  ON public.admin_officials FOR UPDATE
  TO authenticated
  USING (
    user_id <> auth.uid()
    AND (
      public.is_mvia_super_admin(auth.uid())
      OR (
        public.has_mvia_permission(auth.uid(), 'manage_officials')
        AND rank_id NOT IN ('rank-super-admin', 'rank-deputy-director')
      )
    )
  )
  WITH CHECK (
    user_id <> auth.uid()
    AND (
      public.is_mvia_super_admin(auth.uid())
      OR (
        public.has_mvia_permission(auth.uid(), 'manage_officials')
        AND rank_id NOT IN ('rank-super-admin', 'rank-deputy-director')
      )
    )
  );

CREATE POLICY "Super Admin delete officials"
  ON public.admin_officials FOR DELETE
  TO authenticated
  USING (
    public.is_mvia_super_admin(auth.uid())
    AND user_id <> auth.uid()
  );

-- RLS Policies for admin_official_contacts (WhatsApp numbers):
-- CRITICAL: NO SELECT policy for students/authenticated users!
-- Only Super Admin or Server Service Role (bypasses RLS) can read/write private WhatsApp numbers.
CREATE POLICY "Super Admin manage official contacts"
  ON public.admin_official_contacts FOR ALL
  TO authenticated
  USING (public.is_mvia_super_admin(auth.uid()))
  WITH CHECK (public.is_mvia_super_admin(auth.uid()));
