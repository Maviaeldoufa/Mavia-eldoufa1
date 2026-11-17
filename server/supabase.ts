import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseSchema } from './types.ts';

let cachedClient: SupabaseClient | null = null;
let cachedKeySignature = '';
let lastSupabaseSyncError: string | null = null;

function getSupabaseUrl(): string {
  return (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
}

function getSupabasePublishableKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ''
  ).trim();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseSecretKey());
}

export function isSupabaseDbEnabled(): boolean {
  if (!isSupabaseConfigured()) return false;
  if (process.env.MVIA_FORCE_SUPABASE === '1') return true;
  // Respect isolated test DB files used by `npm test`
  if (process.env.MVIA_DB_FILE) return false;
  return true;
}

export function getSupabaseStatusDetails() {
  return {
    urlConfigured: Boolean(getSupabaseUrl()),
    publishableKeyConfigured: Boolean(getSupabasePublishableKey()),
    serviceRoleConfigured: Boolean(getSupabaseSecretKey()),
    dbEnabled: isSupabaseDbEnabled(),
  };
}

export function getLastSupabaseSyncError(): string | null {
  return lastSupabaseSyncError;
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const serviceRoleKey = getSupabaseSecretKey();
  if (!url || !serviceRoleKey) return null;

  const sig = `${url}::${serviceRoleKey.slice(0, 12)}`;
  if (!cachedClient || cachedKeySignature !== sig) {
    cachedClient = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    cachedKeySignature = sig;
  }
  return cachedClient;
}

async function fetchAllRows<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  orderBy?: { column: string; ascending?: boolean }
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select('*');
    if (orderBy) {
      query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
    }
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      throw new Error(`Supabase read failed on "${table}": ${error.message}`);
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return rows;
}

/**
 * Reconstructs DatabaseSchema from normalized relational tables when a project
 * ran `npm run db:migrate` before `app_state_snapshot` was populated.
 */
async function hydrateFromNormalizedTables(
  supabase: SupabaseClient
): Promise<DatabaseSchema | null> {
  const { data: userCheck, error: checkErr } = await supabase
    .from('users')
    .select('id')
    .limit(1);

  if (checkErr || !userCheck || userCheck.length === 0) {
    return null;
  }

  const [
    adminRanksRows,
    usersRows,
    officialsRows,
    officialContactsRows,
    sessionsRows,
    coursesRows,
    foldersRows,
    summariesRows,
    quizzesRows,
    quizQuestionsRows,
    quizSubmissionsRows,
    announcementsRows,
    notificationsRows,
    learningLinksRows,
    lecturesRows,
    lectureProgressRows,
    groupLinksRows,
    chatMessagesRows,
    gpaTablesRows,
    studentProgressRows,
    studentTasksRows,
    supportTicketsRows,
    errorLogsRows,
    auditLogsRows,
    platformConfigRows,
    maintenanceRows,
    analyticsSummaryRows,
    visitorsRows,
  ] = await Promise.all([
    fetchAllRows<any>(supabase, 'admin_ranks', { column: 'display_order', ascending: true }),
    fetchAllRows<any>(supabase, 'users'),
    fetchAllRows<any>(supabase, 'admin_officials'),
    fetchAllRows<any>(supabase, 'admin_official_contacts'),
    fetchAllRows<any>(supabase, 'sessions'),
    fetchAllRows<any>(supabase, 'courses'),
    fetchAllRows<any>(supabase, 'course_folders'),
    fetchAllRows<any>(supabase, 'summaries'),
    fetchAllRows<any>(supabase, 'quizzes'),
    fetchAllRows<any>(supabase, 'quiz_questions', { column: 'question_order', ascending: true }),
    fetchAllRows<any>(supabase, 'quiz_submissions'),
    fetchAllRows<any>(supabase, 'announcements'),
    fetchAllRows<any>(supabase, 'notifications'),
    fetchAllRows<any>(supabase, 'learning_links'),
    fetchAllRows<any>(supabase, 'lectures'),
    fetchAllRows<any>(supabase, 'lecture_progress'),
    fetchAllRows<any>(supabase, 'group_links'),
    fetchAllRows<any>(supabase, 'chat_messages', { column: 'created_at', ascending: true }),
    fetchAllRows<any>(supabase, 'gpa_tables'),
    fetchAllRows<any>(supabase, 'student_progress'),
    fetchAllRows<any>(supabase, 'student_tasks'),
    fetchAllRows<any>(supabase, 'support_tickets'),
    fetchAllRows<any>(supabase, 'error_logs'),
    fetchAllRows<any>(supabase, 'admin_audit_logs'),
    fetchAllRows<any>(supabase, 'platform_config'),
    fetchAllRows<any>(supabase, 'maintenance_state'),
    fetchAllRows<any>(supabase, 'platform_analytics_summary'),
    fetchAllRows<any>(supabase, 'platform_visitors'),
  ]);

  // Optional extended tables from migration 004
  const [assignmentsRows, supportTeamRows, notesRows] = await Promise.all([
    fetchAllRows<any>(supabase, 'course_assignments').catch(() => []),
    fetchAllRows<any>(supabase, 'support_team').catch(() => []),
    fetchAllRows<any>(supabase, 'user_profile_notes').catch(() => []),
  ]);

  const contactByOfficial = new Map<string, string>(
    officialContactsRows.map((c: any) => [String(c.official_id), String(c.whatsapp_number || '')])
  );

  const questionsByQuiz = new Map<string, any[]>();
  for (const q of quizQuestionsRows) {
    const qid = String(q.quiz_id);
    if (!questionsByQuiz.has(qid)) questionsByQuiz.set(qid, []);
    questionsByQuiz.get(qid)!.push({
      id: String(q.id),
      question: String(q.question),
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: Number(q.correct_index || 0),
      explanation: q.explanation || undefined,
    });
  }

  const lectureProgress: DatabaseSchema['lectureProgress'] = {};
  for (const row of lectureProgressRows) {
    const uid = String(row.user_id);
    if (!lectureProgress[uid]) lectureProgress[uid] = {};
    lectureProgress[uid][String(row.lecture_id)] = {
      lastPositionSeconds: Number(row.last_position_seconds || 0),
      playbackRate: Number(row.playback_rate || 1),
      updatedAt: row.updated_at || new Date().toISOString(),
      notes: Array.isArray(row.notes) ? row.notes : [],
    };
  }

  const gpaTables: DatabaseSchema['gpaTables'] = {};
  for (const row of gpaTablesRows) {
    gpaTables[String(row.user_id)] = Array.isArray(row.entries) ? row.entries : [];
  }

  const tasksByUser = new Map<string, any[]>();
  for (const t of studentTasksRows) {
    const uid = String(t.user_id);
    if (!tasksByUser.has(uid)) tasksByUser.set(uid, []);
    tasksByUser.get(uid)!.push({
      id: String(t.id),
      title: String(t.title),
      dueDate: String(t.due_date),
      courseTitle: t.course_title || undefined,
      type: t.type === 'exam' ? 'exam' : 'task',
      completed: Boolean(t.completed),
      createdAt: t.created_at || new Date().toISOString(),
    });
  }

  const studentProgress: NonNullable<DatabaseSchema['studentProgress']> = {};
  for (const p of studentProgressRows) {
    const uid = String(p.user_id);
    studentProgress[uid] = {
      enrolledCourseIds: Array.isArray(p.enrolled_course_ids) ? p.enrolled_course_ids : [],
      completedSummaryIds: Array.isArray(p.completed_summary_ids) ? p.completed_summary_ids : [],
      lastLesson: p.last_lesson || undefined,
      studyMinutes: Number(p.study_minutes || 0),
      tasks: tasksByUser.get(uid) || [],
    };
  }

  const visitors: Record<string, any> = {};
  for (const v of visitorsRows) {
    visitors[String(v.visitor_key)] = {
      visitorKey: String(v.visitor_key),
      userId: v.user_id || undefined,
      userName: v.user_name || undefined,
      userYear: v.user_year || undefined,
      lastVisitAt: v.last_visit_at || new Date().toISOString(),
      visitCount: Number(v.visit_count || 1),
    };
  }

  const cfgRow = platformConfigRows[0];
  const maintRow = maintenanceRows[0];
  const analyticsRow = analyticsSummaryRows[0];

  return {
    adminRanks: adminRanksRows.map((r: any) => ({
      id: String(r.id),
      slug: String(r.slug),
      nameAr: String(r.name_ar),
      nameEn: String(r.name_en),
      description: String(r.description || ''),
      badgeIcon: r.badge_icon,
      badgeColor: r.badge_color,
      displayOrder: Number(r.display_order || 1),
      isSuperAdminRank: Boolean(r.is_super_admin_rank),
      isVisibleInSupport: r.is_visible_in_support !== false,
      permissions: Array.isArray(r.permissions) ? r.permissions : [],
      updatedAt: r.updated_at || new Date().toISOString(),
    })),
    users: usersRows.map((u: any) => ({
      id: String(u.id),
      name: String(u.name),
      email: u.email || '',
      phone: u.phone || '',
      passwordHash: String(u.password_hash),
      year: u.year,
      role: u.role,
      adminRankId: u.admin_rank_id || undefined,
      isProtected: Boolean(u.is_protected),
      isSuspended: Boolean(u.is_suspended),
      suspendedReason: u.suspended_reason || undefined,
      suspendedAt: u.suspended_at || undefined,
      points: Number(u.points || 0),
      quizzesCompleted: Number(u.quizzes_completed || 0),
      emailVerified: Boolean(u.email_verified),
      emailVerificationTokenHash: u.email_verification_token_hash || undefined,
      emailVerificationExpiresAt: u.email_verification_expires_at || undefined,
      lastLoginAt: u.last_login_at || undefined,
      createdAt: u.created_at || new Date().toISOString(),
    })),
    adminOfficials: officialsRows.map((o: any) => ({
      id: String(o.id),
      userId: String(o.user_id),
      rankId: String(o.rank_id),
      displayName: String(o.display_name),
      whatsappNumber: contactByOfficial.get(String(o.id)) || '',
      titleNote: o.title_note || undefined,
      showInSupport: o.show_in_support !== false,
      isActive: o.is_active !== false,
      assignedBy: String(o.assigned_by),
      createdAt: o.created_at || new Date().toISOString(),
      updatedAt: o.updated_at || new Date().toISOString(),
    })),
    sessions: sessionsRows.map((s: any) => ({
      token: String(s.token),
      userId: String(s.user_id),
      createdAt: s.created_at || new Date().toISOString(),
    })),
    courses: coursesRows.map((c: any) => ({
      id: String(c.id),
      title: String(c.title),
      code: String(c.code),
      year: c.year,
      track: c.track,
      description: String(c.description || ''),
      instructor: String(c.instructor || ''),
      coverUrl: c.cover_url || undefined,
      releaseAt: c.release_at || undefined,
      releaseLabel: c.release_label || undefined,
      createdAt: c.created_at || new Date().toISOString(),
    })),
    folders: foldersRows.map((f: any) => ({
      id: String(f.id),
      courseId: String(f.course_id),
      name: String(f.name),
      description: f.description || undefined,
      coverUrl: f.cover_url || undefined,
      releaseAt: f.release_at || undefined,
      viewedBy: Array.isArray(f.viewed_by) ? f.viewed_by : [],
      createdAt: f.created_at || new Date().toISOString(),
    })),
    summaries: summariesRows.map((s: any) => ({
      id: String(s.id),
      courseId: String(s.course_id),
      folderId: s.folder_id || undefined,
      category: s.category === 'book' ? 'book' : 'summary',
      title: String(s.title),
      description: String(s.description || ''),
      fileUrl: s.file_url || undefined,
      fileName: s.file_name || undefined,
      fileSize: s.file_size != null ? Number(s.file_size) : undefined,
      releaseAt: s.release_at || undefined,
      viewedBy: Array.isArray(s.viewed_by) ? s.viewed_by : [],
      createdBy: String(s.created_by),
      createdAt: s.created_at || new Date().toISOString(),
    })),
    assignments: assignmentsRows.map((a: any) => ({
      id: String(a.id),
      courseId: String(a.course_id),
      folderId: a.folder_id || undefined,
      title: String(a.title),
      type: a.type,
      contentText: a.content_text || undefined,
      fileUrl: a.file_url || undefined,
      fileName: a.file_name || undefined,
      fileSize: a.file_size != null ? Number(a.file_size) : undefined,
      mimeType: a.mime_type || undefined,
      roleTag: a.role_tag || undefined,
      createdBy: String(a.created_by),
      createdById: String(a.created_by_id),
      createdAt: a.created_at || new Date().toISOString(),
    })),
    quizzes: quizzesRows.map((q: any) => ({
      id: String(q.id),
      courseId: String(q.course_id),
      folderId: q.folder_id || undefined,
      title: String(q.title),
      difficulty: q.difficulty || undefined,
      generatedByAi: Boolean(q.generated_by_ai),
      durationMinutes: Number(q.duration_minutes || 10),
      pointsPerQuestion: Number(q.points_per_question || 25),
      randomizeQuestions: Boolean(q.randomize_questions),
      randomizeOptions: Boolean(q.randomize_options),
      questionsPerAttempt: Number(q.questions_per_attempt || 0),
      releaseAt: q.release_at || undefined,
      questions: questionsByQuiz.get(String(q.id)) || [],
      createdAt: q.created_at || new Date().toISOString(),
    })),
    quizSubmissions: quizSubmissionsRows.map((sub: any) => ({
      id: String(sub.id),
      quizId: String(sub.quiz_id),
      courseId: String(sub.course_id),
      userId: String(sub.user_id),
      score: Number(sub.score || 0),
      maxScore: Number(sub.max_score || 0),
      correctCount: Number(sub.correct_count || 0),
      totalQuestions: Number(sub.total_questions || 0),
      timeSpentSeconds:
        sub.time_spent_seconds != null ? Number(sub.time_spent_seconds) : undefined,
      breakdown: Array.isArray(sub.breakdown) ? sub.breakdown : undefined,
      submittedAt: sub.submitted_at || new Date().toISOString(),
    })),
    announcements: announcementsRows.map((a: any) => ({
      id: String(a.id),
      scope: a.scope,
      title: String(a.title),
      description: a.description || undefined,
      category: a.category,
      targetAt: a.target_at || new Date().toISOString(),
      createdAt: a.created_at || new Date().toISOString(),
    })),
    notifications: notificationsRows.map((n: any) => ({
      id: String(n.id),
      title: String(n.title),
      message: String(n.message),
      type: n.type,
      targetSection: n.target_section,
      year: n.year,
      readBy: Array.isArray(n.read_by) ? n.read_by : [],
      createdBy: String(n.created_by),
      createdAt: n.created_at || new Date().toISOString(),
    })),
    learningLinks: learningLinksRows.map((l: any) => ({
      id: String(l.id),
      title: String(l.title),
      url: String(l.url),
      type: l.type,
      category: l.category,
      year: l.year,
      description: String(l.description || ''),
      createdAt: l.created_at || new Date().toISOString(),
    })),
    lectures: lecturesRows.map((lec: any) => ({
      id: String(lec.id),
      title: String(lec.title),
      description: String(lec.description || ''),
      category: lec.category,
      year: lec.year,
      instructor: String(lec.instructor || ''),
      videoUrl: String(lec.video_url),
      subtitleUrl: lec.subtitle_url || undefined,
      attachmentUrl: lec.attachment_url || undefined,
      attachmentName: lec.attachment_name || undefined,
      attachmentSize:
        lec.attachment_size != null ? Number(lec.attachment_size) : undefined,
      allowDownload: lec.allow_download !== false,
      durationSeconds:
        lec.duration_seconds != null ? Number(lec.duration_seconds) : undefined,
      createdBy: String(lec.created_by),
      createdAt: lec.created_at || new Date().toISOString(),
    })),
    lectureProgress,
    groupLinks: groupLinksRows.map((g: any) => ({
      id: String(g.id),
      title: String(g.title),
      url: String(g.url),
      platform: g.platform,
      year: g.year,
      description: String(g.description || ''),
      createdAt: g.created_at || new Date().toISOString(),
    })),
    chatMessages: chatMessagesRows.map((m: any) => ({
      id: String(m.id),
      room: String(m.room),
      userId: String(m.user_id),
      userName: String(m.user_name),
      userRole: m.user_role,
      userYear: m.user_year,
      rankBadge: m.rank_badge || undefined,
      text: String(m.text || ''),
      audioUrl: m.audio_url || undefined,
      audioName: m.audio_name || undefined,
      audioMimeType: m.audio_mime_type || undefined,
      audioSize: m.audio_size != null ? Number(m.audio_size) : undefined,
      audioDurationSeconds:
        m.audio_duration_seconds != null
          ? Number(m.audio_duration_seconds)
          : undefined,
      createdAt: m.created_at || new Date().toISOString(),
    })),
    gpaTables,
    studentProgress,
    supportTickets: supportTicketsRows.map((t: any) => ({
      id: String(t.id),
      userId: String(t.user_id),
      userName: String(t.user_name),
      userEmail: String(t.user_email || ''),
      userYear: t.user_year,
      category: t.category,
      subject: String(t.subject),
      description: String(t.description),
      section: t.section || undefined,
      status: t.status,
      adminReply: t.admin_reply || undefined,
      repliedBy: t.replied_by || undefined,
      repliedAt: t.replied_at || undefined,
      createdAt: t.created_at || new Date().toISOString(),
      updatedAt: t.updated_at || new Date().toISOString(),
    })),
    errorLogs: errorLogsRows.map((e: any) => ({
      id: String(e.id),
      source: e.source,
      message: String(e.message),
      path: e.path || undefined,
      userId: e.user_id || undefined,
      stack: e.stack || undefined,
      createdAt: e.created_at || new Date().toISOString(),
    })),
    adminAuditLogs: auditLogsRows.map((log: any) => ({
      id: String(log.id),
      actorId: String(log.actor_id),
      actorName: String(log.actor_name),
      action: log.action,
      targetUserId: log.target_user_id || undefined,
      targetUserName: log.target_user_name || undefined,
      details: log.details || undefined,
      ip: log.ip || undefined,
      createdAt: log.created_at || new Date().toISOString(),
    })),
    platformConfig: cfgRow
      ? {
          whatsappNumber: String(cfgRow.whatsapp_number || '01159637247'),
          telegramUrl: String(cfgRow.telegram_url || 'https://t.me/+201159637247'),
          adminActivationPasswordHash:
            cfgRow.admin_activation_password_hash || undefined,
          adminActivationPasswordUpdatedAt:
            cfgRow.admin_activation_password_updated_at || undefined,
          adminActivationDefaultRankId:
            cfgRow.admin_activation_default_rank_id || undefined,
        }
      : {
          whatsappNumber: '01159637247',
          telegramUrl: 'https://t.me/+201159637247',
        },
    maintenance: maintRow
      ? {
          enabled: Boolean(maintRow.enabled),
          message: String(maintRow.message || ''),
          updatedAt: maintRow.updated_at || undefined,
          updatedBy: maintRow.updated_by || undefined,
        }
      : {
          enabled: false,
          message: 'نقوم حالياً بأعمال صيانة وتحديثات لتحسين أداء المنصة. سنعود قريباً.',
        },
    analytics: {
      totalVisits: Number(analyticsRow?.total_visits || 0),
      dailyCounts: (analyticsRow?.daily_counts as Record<string, number>) || {},
      visitors,
    },
    supportTeam: supportTeamRows.map((m: any) => ({
      id: String(m.id),
      slotNumber: Number(m.slot_number),
      userId: String(m.user_id),
      displayName: String(m.display_name),
      specialty: m.specialty || undefined,
      whatsappNumber: String(m.whatsapp_number || ''),
      isActive: m.is_active !== false,
      assignedBy: String(m.assigned_by),
      createdAt: m.created_at || new Date().toISOString(),
      updatedAt: m.updated_at || new Date().toISOString(),
    })),
    userProfileNotes: notesRows.map((n: any) => ({
      id: String(n.id),
      targetUserId: String(n.target_user_id),
      authorId: String(n.author_id),
      authorName: String(n.author_name),
      content: String(n.content),
      reactions: Array.isArray(n.reactions) ? n.reactions : [],
      createdAt: n.created_at || new Date().toISOString(),
      updatedAt: n.updated_at || new Date().toISOString(),
    })),
  };
}

export async function loadLatestStateFromSupabase(
  currentVersion: number
): Promise<
  | { status: 'unchanged'; version: number }
  | { status: 'updated'; data: DatabaseSchema; version: number }
  | { status: 'empty' }
  | { status: 'error'; error: string }
> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { status: 'unchanged', version: currentVersion };

  try {
    const { data: meta, error: metaErr } = await supabase
      .from('app_state_snapshot')
      .select('version')
      .eq('id', 'default')
      .maybeSingle();

    if (metaErr) {
      lastSupabaseSyncError = metaErr.message;
      return { status: 'error', error: metaErr.message };
    }

    if (meta) {
      const remoteVersion = Number(meta.version || 1);
      if (currentVersion > 0 && remoteVersion === currentVersion) {
        lastSupabaseSyncError = null;
        return { status: 'unchanged', version: remoteVersion };
      }

      const { data: fullRow, error: fullErr } = await supabase
        .from('app_state_snapshot')
        .select('payload, version')
        .eq('id', 'default')
        .single();

      if (fullErr || !fullRow?.payload) {
        const msg = fullErr?.message || 'Empty snapshot payload';
        lastSupabaseSyncError = msg;
        return { status: 'error', error: msg };
      }

      lastSupabaseSyncError = null;
      return {
        status: 'updated',
        data: fullRow.payload as DatabaseSchema,
        version: Number(fullRow.version || remoteVersion),
      };
    }

    // Snapshot row missing: check if relational tables already contain migrated data
    const hydrated = await hydrateFromNormalizedTables(supabase);
    if (hydrated) {
      lastSupabaseSyncError = null;
      return { status: 'updated', data: hydrated, version: 0 };
    }

    lastSupabaseSyncError = null;
    return { status: 'empty' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Supabase sync failed';
    lastSupabaseSyncError = msg;
    return { status: 'error', error: msg };
  }
}

export async function saveStateToSupabase(
  data: DatabaseSchema,
  nextVersion: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient();
  if (!supabase) return { ok: false, error: 'Supabase not configured' };

  try {
    const { error } = await supabase.from('app_state_snapshot').upsert(
      {
        id: 'default',
        payload: data,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) {
      lastSupabaseSyncError = error.message;
      return { ok: false, error: error.message };
    }
    lastSupabaseSyncError = null;
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Supabase save failed';
    lastSupabaseSyncError = msg;
    return { ok: false, error: msg };
  }
}
