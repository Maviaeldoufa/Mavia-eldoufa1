import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import type { DatabaseSchema } from '../server/types.ts';

export interface MigrationBundle {
  admin_ranks: Array<Record<string, unknown>>;
  users: Array<Record<string, unknown>>;
  admin_officials: Array<Record<string, unknown>>;
  admin_official_contacts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  courses: Array<Record<string, unknown>>;
  course_folders: Array<Record<string, unknown>>;
  summaries: Array<Record<string, unknown>>;
  quizzes: Array<Record<string, unknown>>;
  quiz_questions: Array<Record<string, unknown>>;
  quiz_submissions: Array<Record<string, unknown>>;
  announcements: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  learning_links: Array<Record<string, unknown>>;
  lectures: Array<Record<string, unknown>>;
  lecture_progress: Array<Record<string, unknown>>;
  group_links: Array<Record<string, unknown>>;
  chat_messages: Array<Record<string, unknown>>;
  gpa_tables: Array<Record<string, unknown>>;
  student_progress: Array<Record<string, unknown>>;
  student_tasks: Array<Record<string, unknown>>;
  support_tickets: Array<Record<string, unknown>>;
  error_logs: Array<Record<string, unknown>>;
  admin_audit_logs: Array<Record<string, unknown>>;
  platform_config: Array<Record<string, unknown>>;
  maintenance_state: Array<Record<string, unknown>>;
  platform_analytics_summary: Array<Record<string, unknown>>;
  platform_visitors: Array<Record<string, unknown>>;
}

export interface IntegrityReport {
  valid: boolean;
  warnings: string[];
  errors: string[];
  summary: {
    usersCount: number;
    scryptPasswordsPreserved: number;
    totalUserPoints: number;
    totalQuizzesCompleted: number;
    coursesCount: number;
    quizzesCount: number;
    quizQuestionsCount: number;
    quizSubmissionsCount: number;
    adminRanksCount: number;
    adminOfficialsCount: number;
  };
}

export interface VerificationResult {
  passed: boolean;
  tableChecks: Array<{
    table: keyof MigrationBundle;
    expected: number;
    actual: number;
    matched: boolean;
  }>;
  checksumChecks: Array<{
    name: string;
    expected: number;
    actual: number;
    matched: boolean;
  }>;
}

const DEFAULT_DB_FILE = process.env.MVIA_DB_FILE
  ? path.resolve(process.env.MVIA_DB_FILE)
  : path.resolve(process.cwd(), 'data', 'mafia-db.json');

const UPSERT_PLAN: Array<{
  table: keyof MigrationBundle;
  onConflict: string;
}> = [
  { table: 'admin_ranks', onConflict: 'id' },
  { table: 'users', onConflict: 'id' },
  { table: 'admin_officials', onConflict: 'id' },
  { table: 'admin_official_contacts', onConflict: 'official_id' },
  { table: 'sessions', onConflict: 'token' },
  { table: 'courses', onConflict: 'id' },
  { table: 'course_folders', onConflict: 'id' },
  { table: 'summaries', onConflict: 'id' },
  { table: 'quizzes', onConflict: 'id' },
  { table: 'quiz_questions', onConflict: 'quiz_id,id' },
  { table: 'quiz_submissions', onConflict: 'id' },
  { table: 'announcements', onConflict: 'id' },
  { table: 'notifications', onConflict: 'id' },
  { table: 'learning_links', onConflict: 'id' },
  { table: 'lectures', onConflict: 'id' },
  { table: 'lecture_progress', onConflict: 'user_id,lecture_id' },
  { table: 'group_links', onConflict: 'id' },
  { table: 'chat_messages', onConflict: 'id' },
  { table: 'gpa_tables', onConflict: 'user_id' },
  { table: 'student_progress', onConflict: 'user_id' },
  { table: 'student_tasks', onConflict: 'id' },
  { table: 'support_tickets', onConflict: 'id' },
  { table: 'error_logs', onConflict: 'id' },
  { table: 'admin_audit_logs', onConflict: 'id' },
  { table: 'platform_config', onConflict: 'id' },
  { table: 'maintenance_state', onConflict: 'id' },
  { table: 'platform_analytics_summary', onConflict: 'id' },
  { table: 'platform_visitors', onConflict: 'visitor_key' },
];

function cleanOptionalText(val?: string | null): string | null {
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanOptionalIso(val?: string | null): string | null {
  const txt = cleanOptionalText(val);
  if (!txt) return null;
  const ms = Date.parse(txt);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export function loadJsonDatabase(dbFilePath = DEFAULT_DB_FILE): DatabaseSchema {
  if (!fs.existsSync(dbFilePath)) {
    throw new Error(`Database JSON file not found at: ${dbFilePath}`);
  }
  const raw = fs.readFileSync(dbFilePath, 'utf-8');
  return JSON.parse(raw) as DatabaseSchema;
}

export function createPreMigrationBackup(
  dbFilePath = DEFAULT_DB_FILE,
  reason = 'pre-supabase'
): { filename: string; backupPath: string; size: number } {
  const dataDir = path.dirname(dbFilePath);
  const backupsDir = path.join(dataDir, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }
  const safeReason = reason.replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'pre-supabase';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mvia-backup-${stamp}-${safeReason}.json`;
  const backupPath = path.join(backupsDir, filename);
  const raw = fs.readFileSync(dbFilePath, 'utf-8');
  const tmpPath = `${backupPath}.tmp`;
  fs.writeFileSync(tmpPath, raw, 'utf-8');
  fs.renameSync(tmpPath, backupPath);
  const stat = fs.statSync(backupPath);
  return { filename, backupPath, size: stat.size };
}

export function buildMigrationBundle(store: DatabaseSchema): MigrationBundle {
  const now = new Date().toISOString();
  const rankIds = new Set((store.adminRanks || []).map((r) => r.id));
  const userIds = new Set((store.users || []).map((u) => u.id));
  const courseIds = new Set((store.courses || []).map((c) => c.id));
  const folderIds = new Set((store.folders || []).map((f) => f.id));

  const admin_ranks = (store.adminRanks || []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name_ar: r.nameAr,
    name_en: r.nameEn,
    description: r.description || '',
    badge_icon: r.badgeIcon,
    badge_color: r.badgeColor,
    display_order: r.displayOrder,
    is_super_admin_rank: Boolean(r.isSuperAdminRank),
    is_visible_in_support: r.isVisibleInSupport !== false,
    permissions: Array.isArray(r.permissions) ? r.permissions : [],
    updated_at: cleanOptionalIso(r.updatedAt) || now,
  }));

  const users = (store.users || []).map((u) => ({
    id: u.id,
    name: u.name,
    email: cleanOptionalText(u.email)?.toLowerCase() ?? null,
    phone: cleanOptionalText(u.phone),
    password_hash: u.passwordHash,
    year: u.year,
    role: u.role,
    admin_rank_id: u.adminRankId && rankIds.has(u.adminRankId) ? u.adminRankId : null,
    is_protected: Boolean(u.isProtected),
    is_suspended: Boolean(u.isSuspended),
    suspended_reason: cleanOptionalText(u.suspendedReason),
    suspended_at: cleanOptionalIso(u.suspendedAt),
    points: Number(u.points || 0),
    quizzes_completed: Number(u.quizzesCompleted || 0),
    email_verified: Boolean(u.emailVerified),
    email_verification_token_hash: cleanOptionalText(u.emailVerificationTokenHash),
    email_verification_expires_at: cleanOptionalIso(u.emailVerificationExpiresAt),
    last_login_at: cleanOptionalIso(u.lastLoginAt),
    created_at: cleanOptionalIso(u.createdAt) || now,
  }));

  const validOfficials = (store.adminOfficials || []).filter(
    (o) => userIds.has(o.userId) && rankIds.has(o.rankId) && userIds.has(o.assignedBy)
  );

  const admin_officials = validOfficials.map((o) => ({
    id: o.id,
    user_id: o.userId,
    rank_id: o.rankId,
    display_name: o.displayName,
    title_note: cleanOptionalText(o.titleNote),
    show_in_support: o.showInSupport !== false,
    is_active: o.isActive !== false,
    assigned_by: o.assignedBy,
    created_at: cleanOptionalIso(o.createdAt) || now,
    updated_at: cleanOptionalIso(o.updatedAt) || now,
  }));

  const admin_official_contacts = validOfficials
    .filter((o) => Boolean(cleanOptionalText(o.whatsappNumber)))
    .map((o) => ({
      official_id: o.id,
      whatsapp_number: o.whatsappNumber.trim(),
      updated_at: cleanOptionalIso(o.updatedAt) || now,
    }));

  const sessions = (store.sessions || [])
    .filter((s) => userIds.has(s.userId))
    .map((s) => ({
      token: s.token,
      user_id: s.userId,
      created_at: cleanOptionalIso(s.createdAt) || now,
      expires_at: null,
    }));

  const courses = (store.courses || []).map((c) => ({
    id: c.id,
    title: c.title,
    code: c.code,
    year: c.year,
    track: c.track,
    description: c.description || '',
    instructor: c.instructor || '',
    cover_url: cleanOptionalText(c.coverUrl),
    release_at: cleanOptionalIso(c.releaseAt),
    release_label: cleanOptionalText(c.releaseLabel),
    created_at: cleanOptionalIso(c.createdAt) || now,
  }));

  const course_folders = (store.folders || [])
    .filter((f) => courseIds.has(f.courseId))
    .map((f) => ({
      id: f.id,
      course_id: f.courseId,
      name: f.name,
      description: cleanOptionalText(f.description),
      cover_url: cleanOptionalText(f.coverUrl),
      release_at: cleanOptionalIso(f.releaseAt),
      created_at: cleanOptionalIso(f.createdAt) || now,
    }));

  const summaries = (store.summaries || [])
    .filter((s) => courseIds.has(s.courseId))
    .map((s) => ({
      id: s.id,
      course_id: s.courseId,
      folder_id: s.folderId && folderIds.has(s.folderId) ? s.folderId : null,
      title: s.title,
      description: s.description || '',
      file_url: cleanOptionalText(s.fileUrl),
      file_name: cleanOptionalText(s.fileName),
      file_size: typeof s.fileSize === 'number' ? s.fileSize : null,
      release_at: cleanOptionalIso(s.releaseAt),
      viewed_by: Array.isArray(s.viewedBy) ? s.viewedBy : [],
      created_by: s.createdBy,
      created_at: cleanOptionalIso(s.createdAt) || now,
    }));

  const quizzes = (store.quizzes || [])
    .filter((q) => courseIds.has(q.courseId))
    .map((q) => ({
      id: q.id,
      course_id: q.courseId,
      folder_id: q.folderId && folderIds.has(q.folderId) ? q.folderId : null,
      title: q.title,
      duration_minutes: q.durationMinutes,
      points_per_question: q.pointsPerQuestion,
      randomize_questions: Boolean(q.randomizeQuestions),
      randomize_options: Boolean(q.randomizeOptions),
      questions_per_attempt: Number(q.questionsPerAttempt || 0),
      release_at: cleanOptionalIso(q.releaseAt),
      created_at: cleanOptionalIso(q.createdAt) || now,
    }));

  const quiz_questions: Array<Record<string, unknown>> = [];
  for (const q of store.quizzes || []) {
    if (!courseIds.has(q.courseId)) continue;
    (q.questions || []).forEach((item, index) => {
      quiz_questions.push({
        id: item.id,
        quiz_id: q.id,
        question_order: index,
        question: item.question,
        options: Array.isArray(item.options) ? item.options : [],
        correct_index: item.correctIndex,
        explanation: cleanOptionalText(item.explanation),
      });
    });
  }

  const quiz_submissions = (store.quizSubmissions || [])
    .filter((sub) => userIds.has(sub.userId))
    .map((sub) => ({
      id: sub.id,
      quiz_id: sub.quizId,
      course_id: sub.courseId,
      user_id: sub.userId,
      score: sub.score,
      max_score: sub.maxScore,
      correct_count: sub.correctCount,
      total_questions: sub.totalQuestions,
      time_spent_seconds:
        typeof sub.timeSpentSeconds === 'number' ? sub.timeSpentSeconds : null,
      breakdown: Array.isArray(sub.breakdown) ? sub.breakdown : null,
      submitted_at: cleanOptionalIso(sub.submittedAt) || now,
    }));

  const announcements = (store.announcements || []).map((a) => ({
    id: a.id,
    scope: a.scope,
    title: a.title,
    description: cleanOptionalText(a.description),
    category: a.category,
    target_at: cleanOptionalIso(a.targetAt) || now,
    created_at: cleanOptionalIso(a.createdAt) || now,
  }));

  const notifications = (store.notifications || []).map((n) => ({
    id: n.id,
    title: n.title,
    message: n.message,
    type: n.type,
    target_section: n.targetSection,
    year: n.year,
    read_by: Array.isArray(n.readBy) ? n.readBy : [],
    created_by: n.createdBy,
    created_at: cleanOptionalIso(n.createdAt) || now,
  }));

  const learning_links = (store.learningLinks || []).map((l) => ({
    id: l.id,
    title: l.title,
    url: l.url,
    type: l.type,
    category: l.category,
    year: l.year,
    description: l.description || '',
    created_at: cleanOptionalIso(l.createdAt) || now,
  }));

  const lectures = (store.lectures || []).map((lec) => ({
    id: lec.id,
    title: lec.title,
    description: lec.description || '',
    category: lec.category,
    year: lec.year,
    instructor: lec.instructor || '',
    video_url: lec.videoUrl,
    subtitle_url: cleanOptionalText(lec.subtitleUrl),
    attachment_url: cleanOptionalText(lec.attachmentUrl),
    attachment_name: cleanOptionalText(lec.attachmentName),
    attachment_size:
      typeof lec.attachmentSize === 'number' ? lec.attachmentSize : null,
    allow_download: lec.allowDownload !== false,
    duration_seconds:
      typeof lec.durationSeconds === 'number' ? lec.durationSeconds : null,
    created_by: lec.createdBy,
    created_at: cleanOptionalIso(lec.createdAt) || now,
  }));

  const lecture_progress: Array<Record<string, unknown>> = [];
  for (const [uid, perLecture] of Object.entries(store.lectureProgress || {})) {
    if (!userIds.has(uid) || !perLecture) continue;
    for (const [lectureId, rec] of Object.entries(perLecture)) {
      lecture_progress.push({
        user_id: uid,
        lecture_id: lectureId,
        last_position_seconds: Number(rec.lastPositionSeconds || 0),
        playback_rate: Number(rec.playbackRate || 1),
        notes: Array.isArray(rec.notes) ? rec.notes : [],
        updated_at: cleanOptionalIso(rec.updatedAt) || now,
      });
    }
  }

  const group_links = (store.groupLinks || []).map((g) => ({
    id: g.id,
    title: g.title,
    url: g.url,
    platform: g.platform,
    year: g.year,
    description: g.description || '',
    created_at: cleanOptionalIso(g.createdAt) || now,
  }));

  const chat_messages = (store.chatMessages || []).map((m) => ({
    id: m.id,
    room: m.room,
    user_id: m.userId,
    user_name: m.userName,
    user_role: m.userRole,
    user_year: m.userYear,
    rank_badge: m.rankBadge || null,
    text: m.text || '',
    audio_url: cleanOptionalText(m.audioUrl),
    audio_name: cleanOptionalText(m.audioName),
    audio_mime_type: cleanOptionalText(m.audioMimeType),
    audio_size: typeof m.audioSize === 'number' ? m.audioSize : null,
    audio_duration_seconds:
      typeof m.audioDurationSeconds === 'number' ? m.audioDurationSeconds : null,
    created_at: cleanOptionalIso(m.createdAt) || now,
  }));

  const gpa_tables = Object.entries(store.gpaTables || {})
    .filter(([uid]) => userIds.has(uid))
    .map(([uid, entries]) => ({
      user_id: uid,
      entries: Array.isArray(entries) ? entries : [],
      updated_at: now,
    }));

  const student_progress: Array<Record<string, unknown>> = [];
  const student_tasks: Array<Record<string, unknown>> = [];
  for (const [uid, prog] of Object.entries(store.studentProgress || {})) {
    if (!userIds.has(uid) || !prog) continue;
    student_progress.push({
      user_id: uid,
      enrolled_course_ids: Array.isArray(prog.enrolledCourseIds)
        ? prog.enrolledCourseIds
        : [],
      completed_summary_ids: Array.isArray(prog.completedSummaryIds)
        ? prog.completedSummaryIds
        : [],
      last_lesson: prog.lastLesson || null,
      study_minutes: Number(prog.studyMinutes || 0),
      updated_at: now,
    });
    for (const task of prog.tasks || []) {
      student_tasks.push({
        id: task.id,
        user_id: uid,
        title: task.title,
        due_date: task.dueDate,
        course_title: cleanOptionalText(task.courseTitle),
        type: task.type,
        completed: Boolean(task.completed),
        created_at: cleanOptionalIso(task.createdAt) || now,
      });
    }
  }

  const support_tickets = (store.supportTickets || []).map((t) => ({
    id: t.id,
    user_id: t.userId,
    user_name: t.userName,
    user_email: t.userEmail || '',
    user_year: t.userYear,
    category: t.category,
    subject: t.subject,
    description: t.description,
    section: cleanOptionalText(t.section),
    status: t.status,
    admin_reply: cleanOptionalText(t.adminReply),
    replied_by: cleanOptionalText(t.repliedBy),
    replied_at: cleanOptionalIso(t.repliedAt),
    created_at: cleanOptionalIso(t.createdAt) || now,
    updated_at: cleanOptionalIso(t.updatedAt) || now,
  }));

  const error_logs = (store.errorLogs || []).map((e) => ({
    id: e.id,
    source: e.source,
    message: e.message,
    path: cleanOptionalText(e.path),
    user_id: cleanOptionalText(e.userId),
    stack: cleanOptionalText(e.stack),
    created_at: cleanOptionalIso(e.createdAt) || now,
  }));

  const admin_audit_logs = (store.adminAuditLogs || []).map((log) => ({
    id: log.id,
    actor_id: log.actorId,
    actor_name: log.actorName,
    action: log.action,
    target_user_id: cleanOptionalText(log.targetUserId),
    target_user_name: cleanOptionalText(log.targetUserName),
    details: cleanOptionalText(log.details),
    ip: cleanOptionalText(log.ip),
    created_at: cleanOptionalIso(log.createdAt) || now,
  }));

  const platform_config = store.platformConfig
    ? [
        {
          id: 'default',
          whatsapp_number: store.platformConfig.whatsappNumber || '',
          telegram_url: store.platformConfig.telegramUrl || '',
          updated_at: now,
        },
      ]
    : [];

  const maintenance_state = store.maintenance
    ? [
        {
          id: 'default',
          enabled: Boolean(store.maintenance.enabled),
          message: store.maintenance.message || '',
          updated_at: cleanOptionalIso(store.maintenance.updatedAt),
          updated_by: cleanOptionalText(store.maintenance.updatedBy),
        },
      ]
    : [];

  const platform_analytics_summary = store.analytics
    ? [
        {
          id: 'default',
          total_visits: Number(store.analytics.totalVisits || 0),
          daily_counts: store.analytics.dailyCounts || {},
          updated_at: now,
        },
      ]
    : [];

  const platform_visitors = Object.values(store.analytics?.visitors || {}).map((v) => ({
    visitor_key: v.visitorKey,
    user_id: cleanOptionalText(v.userId),
    user_name: cleanOptionalText(v.userName),
    user_year: typeof v.userYear === 'number' ? v.userYear : null,
    last_visit_at: cleanOptionalIso(v.lastVisitAt) || now,
    visit_count: Number(v.visitCount || 1),
  }));

  return {
    admin_ranks,
    users,
    admin_officials,
    admin_official_contacts,
    sessions,
    courses,
    course_folders,
    summaries,
    quizzes,
    quiz_questions,
    quiz_submissions,
    announcements,
    notifications,
    learning_links,
    lectures,
    lecture_progress,
    group_links,
    chat_messages,
    gpa_tables,
    student_progress,
    student_tasks,
    support_tickets,
    error_logs,
    admin_audit_logs,
    platform_config,
    maintenance_state,
    platform_analytics_summary,
    platform_visitors,
  };
}

export function verifyJsonIntegrity(store: DatabaseSchema): IntegrityReport {
  const warnings: string[] = [];
  const errors: string[] = [];
  const bundle = buildMigrationBundle(store);

  const users = store.users || [];
  let scryptCount = 0;
  const seenEmails = new Set<string>();
  const seenPhones = new Set<string>();

  for (const u of users) {
    if (
      typeof u.passwordHash === 'string' &&
      /^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(u.passwordHash)
    ) {
      scryptCount += 1;
    } else {
      errors.push(`User ${u.id} has invalid passwordHash format (cannot preserve safely).`);
    }

    const emailNorm = cleanOptionalText(u.email)?.toLowerCase();
    if (emailNorm) {
      if (seenEmails.has(emailNorm)) {
        errors.push(`Duplicate email detected in source JSON for user ${u.id}.`);
      }
      seenEmails.add(emailNorm);
    } else {
      warnings.push(`User ${u.id} has empty email; normalized to NULL for PostgreSQL partial index.`);
    }

    const phoneNorm = cleanOptionalText(u.phone);
    if (phoneNorm) {
      if (seenPhones.has(phoneNorm)) {
        errors.push(`Duplicate phone detected in source JSON for user ${u.id}.`);
      }
      seenPhones.add(phoneNorm);
    }
  }

  const quizIds = new Set((store.quizzes || []).map((q) => q.id));
  const orphanQuizSubs = (store.quizSubmissions || []).filter(
    (s) => !quizIds.has(s.quizId)
  ).length;
  if (orphanQuizSubs > 0) {
    warnings.push(
      `${orphanQuizSubs} historical quiz submission(s) reference deleted quizzes; preserved safely without dropping records.`
    );
  }

  const totalUserPoints = users.reduce((acc, u) => acc + Number(u.points || 0), 0);
  const totalQuizzesCompleted = users.reduce(
    (acc, u) => acc + Number(u.quizzesCompleted || 0),
    0
  );

  return {
    valid: errors.length === 0,
    warnings,
    errors,
    summary: {
      usersCount: bundle.users.length,
      scryptPasswordsPreserved: scryptCount,
      totalUserPoints,
      totalQuizzesCompleted,
      coursesCount: bundle.courses.length,
      quizzesCount: bundle.quizzes.length,
      quizQuestionsCount: bundle.quiz_questions.length,
      quizSubmissionsCount: bundle.quiz_submissions.length,
      adminRanksCount: bundle.admin_ranks.length,
      adminOfficialsCount: bundle.admin_officials.length,
    },
  };
}

function createServerSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment.'
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function upsertInBatches(
  supabase: SupabaseClient,
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict: string,
  batchSize = 200
): Promise<void> {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict, ignoreDuplicates: false });
    if (error) {
      throw new Error(`Upsert failed on table "${table}": ${error.message}`);
    }
  }
}

export async function verifySupabaseParity(
  supabase: SupabaseClient,
  store: DatabaseSchema
): Promise<VerificationResult> {
  const bundle = buildMigrationBundle(store);
  const tableChecks: VerificationResult['tableChecks'] = [];

  for (const { table } of UPSERT_PLAN) {
    const expected = bundle[table].length;
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });
    if (error) {
      throw new Error(`Count check failed on table "${table}": ${error.message}`);
    }
    const actual = count ?? 0;
    tableChecks.push({
      table,
      expected,
      actual,
      matched: actual >= expected,
    });
  }

  const { data: userStats, error: userErr } = await supabase
    .from('users')
    .select('id, points, quizzes_completed');
  if (userErr) {
    throw new Error(`User checksum query failed: ${userErr.message}`);
  }

  const expectedPoints = (store.users || []).reduce((sum, u) => sum + Number(u.points || 0), 0);
  const actualPoints = (userStats || []).reduce((sum, u) => sum + Number(u.points || 0), 0);

  const expectedQuizzesCompleted = (store.users || []).reduce(
    (sum, u) => sum + Number(u.quizzesCompleted || 0),
    0
  );
  const actualQuizzesCompleted = (userStats || []).reduce(
    (sum, u) => sum + Number(u.quizzes_completed || 0),
    0
  );

  const checksumChecks = [
    {
      name: 'total_user_points',
      expected: expectedPoints,
      actual: actualPoints,
      matched: actualPoints === expectedPoints,
    },
    {
      name: 'total_quizzes_completed',
      expected: expectedQuizzesCompleted,
      actual: actualQuizzesCompleted,
      matched: actualQuizzesCompleted === expectedQuizzesCompleted,
    },
  ];

  const passed =
    tableChecks.every((c) => c.matched) && checksumChecks.every((c) => c.matched);

  return {
    passed,
    tableChecks,
    checksumChecks,
  };
}

export async function runMigrationCli(argv = process.argv.slice(2)): Promise<void> {
  const execute = argv.includes('--execute');
  const verifyOnly = argv.includes('--verify-only');
  const skipBackup = argv.includes('--no-backup');

  const store = loadJsonDatabase(DEFAULT_DB_FILE);
  const integrity = verifyJsonIntegrity(store);

  console.log('=== MVIA JSON -> Supabase Migration Utility ===');
  console.log(`Source file: ${DEFAULT_DB_FILE}`);
  console.log(
    `Integrity status: ${integrity.valid ? 'VALID' : 'FAILED'} | Users: ${integrity.summary.usersCount} (scrypt preserved: ${integrity.summary.scryptPasswordsPreserved}) | Courses: ${integrity.summary.coursesCount} | Quizzes: ${integrity.summary.quizzesCount} | Questions: ${integrity.summary.quizQuestionsCount} | Ranks: ${integrity.summary.adminRanksCount}`
  );

  for (const w of integrity.warnings) {
    console.warn(`[WARN] ${w}`);
  }
  if (!integrity.valid) {
    for (const err of integrity.errors) {
      console.error(`[ERROR] ${err}`);
    }
    process.exitCode = 1;
    return;
  }

  if (verifyOnly) {
    const supabase = createServerSupabaseClient();
    const verification = await verifySupabaseParity(supabase, store);
    console.log('Verification table counts:', JSON.stringify(verification.tableChecks, null, 2));
    console.log('Verification checksums:', JSON.stringify(verification.checksumChecks, null, 2));
    if (!verification.passed) {
      console.error('[ERROR] Supabase parity verification failed.');
      process.exitCode = 1;
    } else {
      console.log('[OK] Supabase parity verification passed 100%.');
    }
    return;
  }

  if (!skipBackup) {
    const backup = createPreMigrationBackup(DEFAULT_DB_FILE, execute ? 'pre-supabase' : 'dryrun');
    console.log(`[BACKUP] Created snapshot: ${backup.filename} (${backup.size} bytes)`);
  }

  const bundle = buildMigrationBundle(store);

  if (!execute) {
    console.log('[DRY-RUN] No remote database writes performed. Planned table row counts:');
    for (const { table, onConflict } of UPSERT_PLAN) {
      console.log(`  - ${table}: ${bundle[table].length} row(s) [upsert key: ${onConflict}]`);
    }
    console.log('[DRY-RUN] Ready for execution with --execute once SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY are set.');
    return;
  }

  const supabase = createServerSupabaseClient();
  for (const { table, onConflict } of UPSERT_PLAN) {
    const rows = bundle[table];
    await upsertInBatches(supabase, table, rows, onConflict);
    console.log(`[MIGRATED] ${table}: ${rows.length} row(s) upserted.`);
  }

  const verification = await verifySupabaseParity(supabase, store);
  if (!verification.passed) {
    console.error('[ERROR] Post-migration verification detected a mismatch:');
    console.error(JSON.stringify(verification, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('[SUCCESS] Migration and post-migration verification completed cleanly.');
}

const isMain =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  path.resolve(process.argv[1]).endsWith(path.join('scripts', 'migrate-json-to-supabase.ts'));

if (isMain) {
  runMigrationCli().catch((err) => {
    console.error('[FATAL] Migration utility failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
