export type AcademicYear = 1 | 2 | 3 | 4;

export type UserRole = 'admin' | 'teacher' | 'student';

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
  whatsappNumber: string; // Private server-side only; never returned in public/student endpoints
  titleNote?: string;
  showInSupport: boolean;
  isActive: boolean;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTeamMember {
  id: string;
  slotNumber: number; // 1..7
  userId: string;
  displayName: string;
  specialty?: string;
  whatsappNumber: string; // Private server-side only; never returned in public/student endpoints
  isActive: boolean;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
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

export interface UserRankBadge {
  rankId: string;
  nameAr: string;
  nameEn: string;
  badgeIcon: AdminRankIcon;
  badgeColor: AdminRankColor;
  isSuperAdminRank: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  year: AcademicYear;
  role: UserRole;
  adminRankId?: string;
  isProtected: boolean; // Cannot be kicked by anyone
  isSuspended?: boolean; // Temporarily banned until Admin grants permission
  suspendedReason?: string;
  suspendedAt?: string;
  points: number;
  quizzesCompleted: number;
  emailVerified?: boolean;
  emailVerificationTokenHash?: string;
  emailVerificationExpiresAt?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
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

export interface CourseFolder {
  id: string;
  courseId: string;
  name: string;
  description?: string;
  coverUrl?: string;
  releaseAt?: string;
  createdAt: string;
}

export interface SummaryItem {
  id: string;
  courseId: string;
  folderId?: string;
  title: string;
  description: string;
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  releaseAt?: string;
  viewedBy?: string[];
  createdBy: string;
  createdAt: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
}

export interface Quiz {
  id: string;
  courseId: string;
  folderId?: string;
  title: string;
  durationMinutes: number;
  pointsPerQuestion: number;
  randomizeQuestions?: boolean;
  randomizeOptions?: boolean;
  questionsPerAttempt?: number; // 0 or undefined = all questions in bank
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
  targetSection: 'home' | 'courses' | 'learning' | 'gpa' | 'community';
  year: AcademicYear | 0; // 0 = all years
  readBy: string[];
  createdBy: string;
  createdAt: string;
}

export interface LectureNote {
  id: string;
  timestampSeconds: number;
  text: string;
  createdAt: string;
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
}

export interface StudentLectureProgress {
  lastPositionSeconds: number;
  playbackRate: number;
  updatedAt: string;
  notes: LectureNote[];
}

export interface PlatformVisitLog {
  visitorKey: string;
  userId?: string;
  userName?: string;
  userYear?: AcademicYear;
  lastVisitAt: string;
  visitCount: number;
}

export interface PlatformAnalytics {
  totalVisits: number;
  dailyCounts: Record<string, number>;
  visitors: Record<string, PlatformVisitLog>;
}

export interface PlatformConfig {
  whatsappNumber: string;
  telegramUrl: string;
  adminActivationPasswordHash?: string;
  adminActivationPasswordUpdatedAt?: string;
  adminActivationDefaultRankId?: string;
}

export interface LearningLink {
  id: string;
  title: string;
  url: string;
  type: 'youtube' | 'platform';
  category: 'GIS' | 'Programming' | 'General';
  year: AcademicYear | 0; // 0 = all years
  description: string;
  createdAt: string;
}

export interface GroupLink {
  id: string;
  title: string;
  url: string;
  platform: 'WhatsApp' | 'Telegram' | 'Discord' | 'Other';
  year: AcademicYear | 0; // 0 = general
  description: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  room: string; // 'general' | 'year-1' | 'year-2' | 'year-3' | 'year-4'
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
  coursework: number; // out of 20
  midterm: number; // out of 20
  finalExam: number; // out of 60
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

export interface StudentProgressRecord {
  enrolledCourseIds: string[];
  completedSummaryIds: string[];
  lastLesson?: LastLessonRecord;
  studyMinutes: number;
  tasks: StudentTask[];
}

export interface SessionRecord {
  token: string;
  userId: string;
  createdAt: string;
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

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt?: string;
  updatedBy?: string;
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
  | 'support_team.remove';

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

export interface DatabaseSchema {
  users: User[];
  sessions: SessionRecord[];
  courses: Course[];
  folders?: CourseFolder[];
  summaries: SummaryItem[];
  quizzes: Quiz[];
  quizSubmissions: QuizSubmission[];
  announcements?: AnnouncementCountdown[];
  notifications?: NotificationItem[];
  lectures?: LectureVideo[];
  lectureProgress?: Record<string, Record<string, StudentLectureProgress>>;
  analytics?: PlatformAnalytics;
  platformConfig?: PlatformConfig;
  learningLinks: LearningLink[];
  groupLinks: GroupLink[];
  chatMessages: ChatMessage[];
  gpaTables: Record<string, GpaCourseEntry[]>;
  studentProgress?: Record<string, StudentProgressRecord>;
  supportTickets?: SupportTicket[];
  errorLogs?: AppErrorLog[];
  maintenance?: MaintenanceState;
  adminAuditLogs?: AdminAuditLog[];
  adminRanks?: AdminRank[];
  adminOfficials?: AdminOfficial[];
  supportTeam?: SupportTeamMember[];
  userProfileNotes?: UserProfileNote[];
}
