export type AcademicYear = 1 | 2 | 3 | 4;

export type UserRole = 'admin' | 'teacher' | 'student';

export type NavSection = 'home' | 'courses' | 'learning' | 'gpa' | 'community';

export type AdminPermissionKey =
  | 'manage_ranks'
  | 'manage_officials'
  | 'manage_courses'
  | 'manage_quizzes'
  | 'manage_learning'
  | 'manage_community'
  | 'manage_students'
  | 'manage_user_notes'
  | 'manage_support'
  | 'view_sensitive_data';

export type AdminRankIcon =
  | 'crown'
  | 'medal'
  | 'cpu'
  | 'graduation-cap'
  | 'users'
  | 'headset'
  | 'clipboard-check';

export type AdminRankColor =
  | 'gold'
  | 'silver'
  | 'sky'
  | 'emerald'
  | 'violet'
  | 'amber'
  | 'rose';

export interface UserRankBadge {
  rankId: string;
  nameAr: string;
  nameEn: string;
  badgeIcon: AdminRankIcon;
  badgeColor: AdminRankColor;
  isSuperAdminRank: boolean;
}

export interface AdminRank {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  description: string;
  badgeIcon: AdminRankIcon;
  badgeColor: AdminRankColor;
  displayOrder: number;
  isSuperAdminRank: boolean;
  isVisibleInSupport: boolean;
  permissions: AdminPermissionKey[];
  updatedAt: string;
}

export interface AdminOfficial {
  id: string;
  userId: string;
  rankId: string;
  displayName: string;
  whatsappNumber: string;
  titleNote?: string;
  showInSupport: boolean;
  isActive: boolean;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSupportOfficial {
  id: string;
  rankId: string;
  displayName: string;
  titleNote?: string;
  hasWhatsapp: boolean;
  whatsappUrl?: string;
}

export interface PublicSupportLeader {
  id: string;
  displayName: string;
  titleAr: string;
  titleEn: string;
  urgencyNoteAr: string;
  urgencyNoteEn: string;
  hasWhatsapp: boolean;
  whatsappUrl?: string;
}

export interface PublicSupportRank {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string;
  description: string;
  badgeIcon: AdminRankIcon;
  badgeColor: AdminRankColor;
  displayOrder: number;
  isSuperAdminRank: boolean;
  officials: PublicSupportOfficial[];
}

export interface AdminRankCandidateUser {
  id: string;
  name: string;
  role: UserRole;
  year: AcademicYear;
  adminRankId?: string;
  isProtected: boolean;
  isSuspended?: boolean;
}

export interface AdminPermissionMeta {
  key: AdminPermissionKey;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  superAdminOnly?: boolean;
}

export interface SupportTeamMember {
  id: string;
  slotNumber: number; // 1..7
  userId: string;
  displayName: string;
  specialty?: string;
  whatsappNumber: string;
  isActive: boolean;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicSupportTeamMember {
  id: string;
  slotNumber: number;
  userId: string;
  displayName: string;
  specialty?: string;
  hasWhatsapp: boolean;
  whatsappUrl?: string;
}

export type NoteReactionEmoji = '👍' | '❤️' | '👏' | '🔥' | '💡' | '✅';

export interface UserProfileNoteReaction {
  userId: string;
  userName: string;
  emoji: NoteReactionEmoji;
  reactedAt: string;
}

export interface UserProfileNote {
  id: string;
  targetUserId: string;
  authorId: string;
  authorName: string;
  content: string;
  reactions: UserProfileNoteReaction[];
  createdAt: string;
  updatedAt: string;
}

export interface AdminRanksDirectoryResponse {
  ranks: AdminRank[];
  officials: AdminOfficial[];
  supportTeam: SupportTeamMember[];
  maxSupportTeamSize: number;
  candidates: AdminRankCandidateUser[];
  permissionsCatalog: AdminPermissionMeta[];
  canEditRanks: boolean;
  canManageOfficials: boolean;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  phone: string;
  year: AcademicYear;
  role: UserRole;
  adminRankId?: string;
  isSuperAdmin?: boolean;
  permissions?: AdminPermissionKey[];
  rankBadge?: UserRankBadge;
  isProtected: boolean;
  isSuspended?: boolean;
  suspendedReason?: string;
  suspendedAt?: string;
  points: number;
  quizzesCompleted: number;
  emailVerified?: boolean;
  lastLoginAt?: string;
  createdAt: string;
}

export interface Course {
  id: string;
  title: string;
  code: string;
  year: AcademicYear;
  track: 'GIS' | 'Programming' | 'General';
  description: string;
  instructor: string;
  coverUrl?: string;
  releaseAt?: string;
  releaseLabel?: string;
  createdAt: string;
  summariesCount?: number;
  quizzesCount?: number;
  foldersCount?: number;
}

export interface CourseFolder {
  id: string;
  courseId: string;
  name: string;
  description?: string;
  coverUrl?: string;
  releaseAt?: string;
  viewsCount?: number;
  isTrending?: boolean;
  courseTitle?: string;
  courseCode?: string;
  courseYear?: AcademicYear;
  courseTrack?: 'GIS' | 'Programming' | 'General';
  booksCount?: number;
  summariesCount?: number;
  quizzesCount?: number;
  assignmentsCount?: number;
  createdAt: string;
}

export type SummaryCategory = 'book' | 'summary';

export interface SummaryItem {
  id: string;
  courseId: string;
  folderId?: string;
  category?: SummaryCategory;
  title: string;
  description: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  releaseAt?: string;
  viewsCount?: number;
  createdBy: string;
  createdAt: string;
}

export interface CourseAssignment {
  id: string;
  courseId: string;
  folderId?: string;
  title: string;
  type: 'pdf' | 'image' | 'text';
  contentText?: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  roleTag?: 'assignment' | 'submission';
  createdBy: string;
  createdById: string;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export interface Quiz {
  id: string;
  courseId: string;
  folderId?: string;
  title: string;
  difficulty?: QuizDifficulty;
  generatedByAi?: boolean;
  isPracticeOnly?: boolean;
  durationMinutes: number;
  pointsPerQuestion: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  questionsPerAttempt?: number;
  releaseAt?: string;
  questions: QuizQuestion[];
  createdAt: string;
}

export interface QuizQuestionBreakdown {
  questionId: string;
  question: string;
  options: string[];
  selectedIndex: number;
  correctIndex: number;
  isCorrect: boolean;
  explanation?: string;
}

export interface QuizSubmission {
  id: string;
  quizId: string;
  courseId: string;
  userId: string;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  timeSpentSeconds?: number;
  breakdown?: QuizQuestionBreakdown[];
  submittedAt: string;
}

export interface AnnouncementCountdown {
  id: string;
  scope: 'home' | 'courses';
  title: string;
  description?: string;
  category: 'exam' | 'news' | 'release';
  targetAt: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'course' | 'exam' | 'lecture' | 'announcement' | 'general';
  targetSection: NavSection;
  year: AcademicYear | 0;
  read: boolean;
  createdBy: string;
  createdAt: string;
}

export interface LectureNote {
  id: string;
  timestampSeconds: number;
  text: string;
  createdAt: string;
}

export interface StudentLectureProgress {
  lastPositionSeconds: number;
  playbackRate: number;
  updatedAt: string;
  notes: LectureNote[];
}

export interface LectureVideo {
  id: string;
  title: string;
  description: string;
  category: 'GIS' | 'Programming' | 'General';
  year: AcademicYear | 0;
  instructor: string;
  videoUrl: string;
  subtitleUrl?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentSize?: number;
  allowDownload: boolean;
  durationSeconds?: number;
  createdBy: string;
  createdAt: string;
  myProgress: StudentLectureProgress;
}

export interface PlatformConfig {
  whatsappNumber: string;
  telegramUrl: string;
}

export interface PlatformVisitLog {
  visitorKey: string;
  userId?: string;
  userName?: string;
  userYear?: AcademicYear;
  lastVisitAt: string;
  visitCount: number;
}

export interface AdminAnalyticsData {
  totalVisits: number;
  uniqueVisitorsCount: number;
  todayVisits: number;
  registeredVisitorsCount: number;
  recentVisitors: PlatformVisitLog[];
  overview?: {
    studentsCount: number;
    teachersCount?: number;
    adminsCount: number;
    suspendedCount: number;
    verifiedEmailsCount: number;
    coursesCount: number;
    summariesCount: number;
    quizzesCount: number;
    lecturesCount: number;
    totalSubmissions: number;
    avgQuizScorePercent: number;
    openTicketsCount: number;
    recentErrorsCount: number;
  };
}

export type AdminAuditAction =
  | 'user.create'
  | 'user.credentials_update'
  | 'user.admin_activated'
  | 'user.suspend'
  | 'user.activate'
  | 'user.delete'
  | 'user.profile_view'
  | 'user.note_create'
  | 'user.note_delete'
  | 'users.csv_export'
  | 'rank.update'
  | 'admin.activation_password_update'
  | 'official.assign'
  | 'official.update'
  | 'official.remove'
  | 'support_team.assign'
  | 'support_team.update'
  | 'support_team.remove'
  | 'sessions.revoke_non_admins';

export interface AdminAuditLog {
  id: string;
  actorId: string;
  actorName: string;
  action: AdminAuditAction;
  targetUserId?: string;
  targetUserName?: string;
  details?: string;
  ip?: string;
  createdAt: string;
}

export interface AdminUsersStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  studentsCount: number;
  teachersCount: number;
  adminsCount: number;
}

export interface AdminUsersResponse {
  users: User[];
  pagination: {
    page: number;
    limit: number;
    totalFiltered: number;
    totalPages: number;
  };
  stats: AdminUsersStats;
}

export interface AdminUserProfileSubmission {
  id: string;
  quizId: string;
  quizTitle: string;
  courseId: string;
  courseTitle: string;
  score: number;
  maxScore: number;
  correctCount: number;
  totalQuestions: number;
  timeSpentSeconds?: number;
  submittedAt: string;
}

export interface AdminUserProfileResponse {
  user: User;
  academicStats: {
    points: number;
    quizzesCompleted: number;
    totalSubmissions: number;
    avgQuizScorePercent: number;
    enrolledCoursesCount: number;
    completedSummariesCount: number;
    studyMinutes: number;
    tasksTotal: number;
    tasksCompleted: number;
    gpaEntriesCount: number;
    lecturesWatchedCount: number;
    supportTicketsCount: number;
    enrolledCourses: Array<{
      id: string;
      title: string;
      code: string;
      year: AcademicYear;
    }>;
  };
  recentSubmissions: AdminUserProfileSubmission[];
  notes?: UserProfileNote[];
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userYear: AcademicYear;
  category: 'bug' | 'course' | 'account' | 'suggestion';
  subject: string;
  description: string;
  section?: string;
  status: 'open' | 'in_review' | 'resolved';
  adminReply?: string;
  repliedBy?: string;
  repliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppErrorLog {
  id: string;
  source: 'server' | 'client' | 'ai';
  message: string;
  path?: string;
  userId?: string;
  stack?: string;
  createdAt: string;
}

export interface BackupFileInfo {
  filename: string;
  size: number;
  createdAt: string;
}

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface SystemStatusData {
  status: 'operational' | 'maintenance';
  maintenance: MaintenanceState;
  uptimeSeconds: number;
  timestamp: string;
  services: {
    api: 'up';
    database: 'up';
    websocket: 'up' | 'polling';
    aiConfigured: boolean;
    emailConfigured: boolean;
    supabaseConfigured?: boolean;
    supabaseDetails?: {
      urlConfigured: boolean;
      publishableKeyConfigured: boolean;
      serviceRoleConfigured: boolean;
      dbEnabled: boolean;
    };
    storageMode?: 'supabase' | 'local';
  };
}

export interface LearningLink {
  id: string;
  title: string;
  url: string;
  type: 'youtube' | 'platform';
  category: 'GIS' | 'Programming' | 'General';
  year: AcademicYear | 0;
  description: string;
  createdAt: string;
}

export interface GroupLink {
  id: string;
  title: string;
  url: string;
  platform: 'WhatsApp' | 'Telegram' | 'Discord' | 'Other';
  year: AcademicYear | 0;
  description: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  room: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  userYear: AcademicYear;
  rankBadge?: UserRankBadge;
  text: string;
  audioUrl?: string;
  audioName?: string;
  audioMimeType?: string;
  audioSize?: number;
  audioDurationSeconds?: number;
  createdAt: string;
}

export interface GpaCourseEntry {
  id: string;
  name: string;
  credits: number;
  coursework: number;
  midterm: number;
  finalExam: number;
  includeInGpa?: boolean;
}

export interface StudentTask {
  id: string;
  title: string;
  dueDate: string;
  courseTitle?: string;
  type: 'task' | 'exam';
  completed: boolean;
  createdAt: string;
}

export interface LastLessonRecord {
  courseId: string;
  courseTitle: string;
  lessonTitle: string;
  summaryId?: string;
  updatedAt: string;
}

export interface EnrolledCourseProgress {
  course: Course;
  totalSummaries: number;
  completedSummaries: number;
  totalQuizzes: number;
  completedQuizzes: number;
  progressPercent: number;
}

export interface UpcomingQuizItem {
  quizId: string;
  title: string;
  courseId: string;
  courseTitle: string;
  durationMinutes: number;
  questionsCount: number;
}

export interface AvailableCourseItem extends Course {
  enrolled: boolean;
}

export interface StudentAchievement {
  id: string;
  titleAr: string;
  titleEn: string;
  descAr: string;
  descEn: string;
  badgeIcon: 'flag' | 'zap' | 'medal' | 'trophy' | 'clock' | 'book' | 'crown';
  color: 'sky' | 'violet' | 'gold' | 'amber' | 'emerald';
  earned: boolean;
  progressPercent: number;
}

export interface TrackStrengthBreakdown {
  track: 'GIS' | 'Programming' | 'General';
  labelAr: string;
  labelEn: string;
  attempts: number;
  hasData: boolean;
  strengthPercent: number;
  weaknessPercent: number;
}

export interface CourseStrengthBreakdown {
  courseId: string;
  courseTitle: string;
  courseCode: string;
  track: 'GIS' | 'Programming' | 'General';
  attempts: number;
  strengthPercent: number;
  weaknessPercent: number;
}

export interface StrengthWeaknessSummary {
  overallStrengthPercent: number;
  overallWeaknessPercent: number;
  hasQuizData: boolean;
  hasSignal: boolean;
  avgQuizScorePercent: number;
  strongestArea: { label: string; percent: number } | null;
  weakestArea: { label: string; percent: number } | null;
  trackBreakdown: TrackStrengthBreakdown[];
  courseBreakdown: CourseStrengthBreakdown[];
}

export interface StudentDashboardData {
  completionPercentage: number;
  enrolledCourses: EnrolledCourseProgress[];
  availableCourses: AvailableCourseItem[];
  lastLesson: LastLessonRecord | null;
  upcomingQuizzes: UpcomingQuizItem[];
  tasks: StudentTask[];
  personalInfo?: User & {
    leaderboardRank: number;
    totalRankedUsers: number;
  };
  achievements?: StudentAchievement[];
  earnedBadgesCount?: number;
  totalBadgesCount?: number;
  strengthsAndWeaknesses?: StrengthWeaknessSummary;
  stats: {
    studyMinutes: number;
    completedLessonsCount: number;
    totalLessonsCount: number;
    completedQuizzesCount: number;
    totalQuizzesCount: number;
    enrolledCoursesCount: number;
    points: number;
    quizzesCompleted: number;
  };
}
