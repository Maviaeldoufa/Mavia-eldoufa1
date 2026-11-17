import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { WebSocket } from 'ws';
import { calculateSemesterGpa, evaluateCourseGrade } from '../src/utils/gpa.ts';

const TEST_PORT = 3199;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const WS_URL = `ws://127.0.0.1:${TEST_PORT}/ws/chat`;
const TMP_DIR = path.resolve('/tmp', `mvia-audit-run-${Date.now()}`);
const TMP_DB = path.join(TMP_DIR, 'db.json');
const TMP_UPLOADS = path.join(TMP_DIR, 'uploads');
const TEST_ADMIN_SECRET = 'TEST-SECRET-ADMIN-99';

let serverProc: ReturnType<typeof spawn> | null = null;

async function waitForServer(url: string, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Wait for boot
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Production server did not become ready in time');
}

async function api<T = Record<string, unknown>>(
  endpoint: string,
  options: RequestInit & { token?: string } = {}
): Promise<{ status: number; data: T }> {
  const headers = new Headers(options.headers || {});
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

before(async () => {
  fs.mkdirSync(TMP_UPLOADS, { recursive: true });
  serverProc = spawn('node', ['server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(TEST_PORT),
      MVIA_DB_FILE: TMP_DB,
      MVIA_UPLOADS_DIR: TMP_UPLOADS,
      MVIA_DISABLE_AUTO_BACKUP: '1',
      ADMIN_SECRET_CODE: TEST_ADMIN_SECRET,
      RESEND_API_KEY: 're_test_without_sender',
      EMAIL_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  await waitForServer(`${BASE_URL}/api/platform/config`);
});

after(async () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
  }
  if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
});

describe('MVIA Production-Readiness Audit Suite', () => {
  let studentToken = '';
  let studentId = '';
  let adminToken = '';

  test('1. Production SPA serving & bundle secret hygiene', async () => {
    const htmlRes = await fetch(`${BASE_URL}/`);
    assert.equal(htmlRes.status, 200);
    const html = await htmlRes.text();
    assert.ok(html.includes('<div id="root"></div>'));

    const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');
    assert.ok(fs.existsSync(assetsDir), 'dist/assets must exist after npm run build');
    const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
    assert.ok(jsFiles.length > 0, 'Built JS bundle must exist');

    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf-8');
      assert.ok(!content.includes('MAFIA-ADMIN'), 'Hardcoded admin code leaked in bundle');
      assert.ok(!content.includes('admin123'), 'Founder admin password leaked in bundle');
      assert.ok(!content.includes('01000000000'), 'Founder admin phone leaked in bundle');
    }
  });

  test('2. Unauthenticated requests are strictly blocked with 401', async () => {
    const protectedEndpoints = [
      '/api/auth/me',
      '/api/users',
      '/api/courses',
      '/api/student/dashboard',
      '/api/admin/analytics',
      '/api/notifications',
      '/api/gpa',
    ];
    for (const ep of protectedEndpoints) {
      const res = await api(ep);
      assert.equal(res.status, 401, `${ep} should require auth`);
    }
  });

  test('3. Registration validation, admin secret verification, login & logout', async () => {
    // Missing terms acceptance
    const noTerms = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test Student',
        email: 'std@test.edu',
        phone: '01999999991',
        password: 'password123',
        year: 2,
        acceptedTerms: false,
      }),
    });
    assert.equal(noTerms.status, 400);

    // Wrong admin secret
    const badAdmin = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Attacker',
        email: 'att@test.edu',
        phone: '01999999992',
        password: 'password123',
        year: 2,
        adminCode: 'MAFIA-ADMIN',
        acceptedTerms: true,
      }),
    });
    assert.equal(badAdmin.status, 403);

    // Valid student registration
    const stdReg = await api<{ token: string; user: { id: string; role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Student Audit',
          email: 'student.audit@test.edu',
          phone: '01999999993',
          password: 'password123',
          year: 1,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(stdReg.status, 201);
    assert.equal(stdReg.data.user.role, 'student');
    studentToken = stdReg.data.token;
    studentId = stdReg.data.user.id;

    // Duplicate email/phone check
    const dupReg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Student Audit Dup',
        email: 'student.audit@test.edu',
        phone: '01999999994',
        password: 'password123',
        year: 1,
        acceptedTerms: true,
      }),
    });
    assert.equal(dupReg.status, 409);

    // Valid admin registration via configured secret
    const admReg = await api<{ token: string; user: { role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Admin Audit',
          email: 'admin.audit@test.edu',
          phone: '01999999995',
          password: 'adminPassword123',
          year: 4,
          adminCode: TEST_ADMIN_SECRET,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(admReg.status, 201);
    assert.equal(admReg.data.user.role, 'admin');
    adminToken = admReg.data.token;

    // Logout & token revocation check
    const badLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: '01999999993', password: 'wrong' }),
    });
    assert.equal(badLogin.status, 401);

    const login2 = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'student.audit@test.edu', password: 'password123' }),
    });
    assert.equal(login2.status, 200);
    const logoutRes = await api('/api/auth/logout', { method: 'POST', token: login2.data.token });
    assert.equal(logoutRes.status, 200);
    const revokedMe = await api('/api/auth/me', { token: login2.data.token });
    assert.equal(revokedMe.status, 401);
  });

  test('4. Student PII isolation & Admin RBAC enforcement', async () => {
    // Student leaderboard must NOT leak email/phone/suspension fields
    const stdUsers = await api<{
      users: Array<{ email: string; phone: string; isSuspended?: boolean }>;
    }>('/api/users', { token: studentToken });
    assert.equal(stdUsers.status, 200);
    assert.ok(stdUsers.data.users.length >= 2);
    for (const u of stdUsers.data.users) {
      assert.equal(u.email, '', 'Student request leaked another user email');
      assert.equal(u.phone, '', 'Student request leaked another user phone');
      assert.equal(u.isSuspended, undefined, 'Student request leaked moderation status');
    }

    // Admin sees full user fields
    const admUsers = await api<{ users: Array<{ email: string; phone: string }> }>('/api/users', {
      token: adminToken,
    });
    assert.equal(admUsers.status, 200);
    assert.ok(admUsers.data.users.some((u) => u.email.includes('@')));

    // Student blocked from admin endpoints
    const forbiddenChecks: Array<[string, RequestInit]> = [
      ['/api/admin/analytics', { method: 'GET' }],
      ['/api/admin/users', { method: 'POST', body: JSON.stringify({}) }],
      ['/api/courses', { method: 'POST', body: JSON.stringify({ title: 'X', year: 1 }) }],
      ['/api/announcements', { method: 'POST', body: JSON.stringify({ title: 'X', targetAt: new Date().toISOString() }) }],
      ['/api/admin/platform/config', { method: 'PUT', body: JSON.stringify({ whatsappNumber: '010', telegramUrl: 'https://t.me/x' }) }],
      ['/api/notifications', { method: 'POST', body: JSON.stringify({ title: 'X', message: 'Y' }) }],
    ];
    for (const [ep, opts] of forbiddenChecks) {
      const r = await api(ep, { ...opts, token: studentToken });
      assert.equal(r.status, 403, `Student must be forbidden from ${ep}`);
    }

    // URL injection checks for admin routes
    const badTelegram = await api('/api/admin/platform/config', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ whatsappNumber: '010', telegramUrl: 'javascript:alert(1)' }),
    });
    assert.equal(badTelegram.status, 400);

    const badLearningUrl = await api('/api/learning', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ title: 'XSS', url: 'javascript:alert(1)' }),
    });
    assert.equal(badLearningUrl.status, 400);
  });

  test('5. Quiz answer key sanitization & anti-exploit grading', async () => {
    const details = await api<{
      quizzes: Array<{ id: string; questions: Array<{ id: string; correctIndex: number; explanation?: string }> }>;
    }>('/api/courses/course-gis-101/details', { token: studentToken });
    assert.equal(details.status, 200);
    const quiz = details.data.quizzes[0];
    assert.ok(quiz);
    for (const q of quiz.questions) {
      assert.equal(q.correctIndex, -1, 'Quiz answer key leaked to student');
      assert.equal(q.explanation, undefined, 'Quiz explanation leaked before submit');
    }

    // Attempt duplicate questionId score exploit (10x same question)
    const firstQ = quiz.questions[0];
    const exploitResponses = Array.from({ length: 10 }, () => ({
      questionId: firstQ.id,
      selectedIndex: 1,
    }));
    const submitRes = await api<{
      submission: { breakdown: unknown[]; correctCount: number; score: number };
      user: { points: number; quizzesCompleted: number };
    }>(`/api/quizzes/${quiz.id}/submit`, {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({ responses: exploitResponses, timeSpentSeconds: 30 }),
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.data.submission.breakdown.length, 1, 'Duplicate questionIds must be deduplicated');
    assert.ok(submitRes.data.submission.correctCount <= 1);
    assert.ok(submitRes.data.submission.score <= 25);
    assert.equal(submitRes.data.user.quizzesCompleted, 1);
  });

  test('6. Student dashboard, enrollment, lesson progress, lectures, notifications & GPA', async () => {
    const dash1 = await api<{ stats: { enrolledCoursesCount: number } }>('/api/student/dashboard', {
      token: studentToken,
    });
    assert.equal(dash1.status, 200);

    const enroll = await api<{ enrolled: boolean }>('/api/student/enroll', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({ courseId: 'course-gis-401' }),
    });
    assert.equal(enroll.status, 200);
    assert.equal(enroll.data.enrolled, true);

    const lessonProg = await api<{ completedSummaryIds: string[] }>('/api/student/lesson-progress', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({
        courseId: 'course-gis-101',
        summaryId: 'sum-1',
        lessonTitle: 'Test Lesson',
        completed: true,
      }),
    });
    assert.equal(lessonProg.status, 200);
    assert.ok(lessonProg.data.completedSummaryIds.includes('sum-1'));

    const taskCreate = await api<{ task: { id: string } }>('/api/student/tasks', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({ title: 'Audit Task', dueDate: '2026-12-01', type: 'task' }),
    });
    assert.equal(taskCreate.status, 201);

    const lecProg = await api<{ progress: { lastPositionSeconds: number } }>('/api/lectures/lec-gis-101/progress', {
      method: 'PUT',
      token: studentToken,
      body: JSON.stringify({ lastPositionSeconds: 18, playbackRate: 1.5 }),
    });
    assert.equal(lecProg.status, 200);
    assert.equal(lecProg.data.progress.lastPositionSeconds, 18);

    const readAll = await api('/api/notifications/read-all', { method: 'POST', token: studentToken });
    assert.equal(readAll.status, 200);
    const notifs = await api<{ unreadCount: number }>('/api/notifications', { token: studentToken });
    assert.equal(notifs.data.unreadCount, 0);

    // GPA math & API persistence
    const gpaEntries = [
      { id: '1', name: 'GIS', credits: 3, coursework: 20, midterm: 20, finalExam: 55, includeInGpa: true },
      { id: '2', name: 'Elective', credits: 2, coursework: 10, midterm: 10, finalExam: 30, includeInGpa: false },
    ];
    const g1 = evaluateCourseGrade(gpaEntries[0]);
    assert.equal(g1.total, 95);
    assert.equal(g1.letter, 'A+');
    const summary = calculateSemesterGpa(gpaEntries);
    assert.equal(summary.gpa, 4.0);
    assert.equal(summary.includedCount, 1);
    assert.equal(summary.excludedCount, 1);

    const gpaSave = await api<{ entries: unknown[] }>('/api/gpa', {
      method: 'PUT',
      token: studentToken,
      body: JSON.stringify({ entries: gpaEntries }),
    });
    assert.equal(gpaSave.status, 200);
    assert.equal(gpaSave.data.entries.length, 2);
  });

  test('7. WebSocket real-time chat & Admin suspension lifecycle', async () => {
    // Reject invalid room via REST
    const badRoom = await api('/api/community/chat/hacked-room', { token: studentToken });
    assert.equal(badRoom.status, 400);

    // Reject unauthenticated WS
    await new Promise<void>((resolve, reject) => {
      const wsBad = new WebSocket(`${WS_URL}?token=invalid&room=general`);
      wsBad.on('close', (code) => {
        assert.equal(code, 4001);
        resolve();
      });
      wsBad.on('error', () => reject(new Error('Expected close 4001')));
    });

    // Valid WS join & send
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(studentToken)}&room=general`);
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('WS timeout'));
      }, 4000);

      ws.on('message', (raw) => {
        const pkt = JSON.parse(raw.toString()) as { type: string; message?: { text: string } };
        if (pkt.type === 'chat:init') {
          ws.send(JSON.stringify({ type: 'chat:send', room: 'general', text: 'Audit WS hello' }));
        } else if (pkt.type === 'chat:message' && pkt.message?.text === 'Audit WS hello') {
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    // Suspend & unsuspend lifecycle
    const suspendRes = await api(`/api/admin/users/${studentId}/suspend`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ reason: 'Audit test suspension' }),
    });
    assert.equal(suspendRes.status, 200);

    const blockedMe = await api<{ suspended?: boolean }>('/api/auth/me', { token: studentToken });
    assert.equal(blockedMe.status, 401); // Session was revoked immediately

    const blockedLogin = await api<{ suspended?: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: '01999999993', password: 'password123' }),
    });
    assert.equal(blockedLogin.status, 403);
    assert.equal(blockedLogin.data.suspended, true);

    const unsuspendRes = await api(`/api/admin/users/${studentId}/unsuspend`, {
      method: 'POST',
      token: adminToken,
    });
    assert.equal(unsuspendRes.status, 200);

    const restoredLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: '01999999993', password: 'password123' }),
    });
    assert.equal(restoredLogin.status, 200);
    studentToken = restoredLogin.data.token;
  });

  test('8. Support & issue reporting tickets privacy and admin triage', async () => {
    const createRes = await api<{ ticket: { id: string; status: string } }>(
      '/api/support/tickets',
      {
        method: 'POST',
        token: studentToken,
        body: JSON.stringify({
          category: 'bug',
          subject: 'PDF preview test issue',
          description: 'Detailed description of PDF preview problem for testing.',
          section: 'courses',
        }),
      }
    );
    assert.equal(createRes.status, 201);
    const ticketId = createRes.data.ticket.id;

    // Register second student and ensure ticket privacy isolation
    const std2 = await api<{ token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Second Student',
        email: 'std2.audit@test.edu',
        phone: '01999999996',
        password: 'password123',
        year: 2,
        acceptedTerms: true,
      }),
    });
    assert.equal(std2.status, 201);

    const std2List = await api<{ tickets: Array<{ id: string }> }>('/api/support/tickets', {
      token: std2.data.token,
    });
    assert.equal(std2List.status, 200);
    assert.ok(!std2List.data.tickets.some((t) => t.id === ticketId));

    // Admin sees and resolves ticket
    const admList = await api<{ tickets: Array<{ id: string }> }>('/api/support/tickets', {
      token: adminToken,
    });
    assert.ok(admList.data.tickets.some((t) => t.id === ticketId));

    const triage = await api<{ ticket: { status: string; adminReply?: string } }>(
      `/api/admin/support/tickets/${ticketId}`,
      {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({ status: 'resolved', adminReply: 'Fixed in build.' }),
      }
    );
    assert.equal(triage.status, 200);
    assert.equal(triage.data.ticket.status, 'resolved');
    assert.equal(triage.data.ticket.adminReply, 'Fixed in build.');
  });

  test('9. Backups, schema-validated restore & Admin Analytics overview', async () => {
    // Student cannot access backup endpoints
    const stdBackup = await api('/api/admin/system/backups', { token: studentToken });
    assert.equal(stdBackup.status, 403);

    const createBackup = await api<{ backup: { filename: string; size: number } }>(
      '/api/admin/system/backups',
      { method: 'POST', token: adminToken }
    );
    assert.equal(createBackup.status, 201);
    const filename = createBackup.data.backup.filename;
    assert.ok(filename.endsWith('.json'));

    const listRes = await api<{ backups: Array<{ filename: string }> }>(
      '/api/admin/system/backups',
      { token: adminToken }
    );
    assert.equal(listRes.status, 200);
    assert.ok(listRes.data.backups.some((b) => b.filename === filename));

    // Download backup file
    const dlRes = await fetch(
      `${BASE_URL}/api/admin/system/backups/${encodeURIComponent(filename)}/download`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.equal(dlRes.status, 200);
    const snapshotJson = await dlRes.json();

    // Invalid restore payload rejected
    const badRestore = await api('/api/admin/system/restore', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ data: { broken: true } }),
    });
    assert.equal(badRestore.status, 400);

    // Valid restore succeeds and creates pre-restore snapshot
    const goodRestore = await api<{ ok: boolean; preRestoreBackup: { filename: string } }>(
      '/api/admin/system/restore',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ data: snapshotJson }),
      }
    );
    assert.equal(goodRestore.status, 200);
    assert.equal(goodRestore.data.ok, true);
    assert.ok(goodRestore.data.preRestoreBackup.filename.includes('pre-restore'));

    // Admin analytics overview includes real counts
    const analytics = await api<{
      overview: {
        studentsCount: number;
        coursesCount: number;
        totalSubmissions: number;
      };
    }>('/api/admin/analytics', { token: adminToken });
    assert.equal(analytics.status, 200);
    assert.ok(analytics.data.overview.studentsCount >= 2);
    assert.ok(analytics.data.overview.coursesCount >= 1);
    assert.ok(analytics.data.overview.totalSubmissions >= 1);
  });

  test('10. Error monitoring, public status/health & maintenance mode isolation', async () => {
    const errPost = await api('/api/monitoring/client-error', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({ message: 'Test client exception', path: '/courses' }),
    });
    assert.equal(errPost.status, 201);

    const admErrors = await api<{ errors: Array<{ message: string }> }>(
      '/api/admin/system/errors',
      { token: adminToken }
    );
    assert.equal(admErrors.status, 200);
    assert.ok(admErrors.data.errors.some((e) => e.message === 'Test client exception'));

    const clearErrs = await api('/api/admin/system/errors', {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(clearErrs.status, 200);

    // Enable maintenance mode
    const maintOn = await api<{ maintenance: { enabled: boolean } }>(
      '/api/admin/system/maintenance',
      {
        method: 'PUT',
        token: adminToken,
        body: JSON.stringify({ enabled: true, message: 'Audit maintenance active' }),
      }
    );
    assert.equal(maintOn.status, 200);
    assert.equal(maintOn.data.maintenance.enabled, true);

    const statusDuringMaint = await api<{ status: string }>('/api/status');
    assert.equal(statusDuringMaint.status, 200);
    assert.equal(statusDuringMaint.data.status, 'maintenance');

    // Student blocked with 503 during maintenance
    const stdBlocked = await api<{ maintenance?: boolean }>('/api/courses', {
      token: studentToken,
    });
    assert.equal(stdBlocked.status, 503);
    assert.equal(stdBlocked.data.maintenance, true);

    // Admin remains unblocked and turns off maintenance
    const admCourses = await api('/api/courses', { token: adminToken });
    assert.equal(admCourses.status, 200);

    const maintOff = await api('/api/admin/system/maintenance', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(maintOff.status, 200);

    const healthOk = await api<{ ok: boolean; status: string }>('/api/health');
    assert.equal(healthOk.status, 200);
    assert.equal(healthOk.data.ok, true);
    assert.equal(healthOk.data.status, 'ok');
  });

  test('11. Email verification safely disabled without EMAIL_FROM & login brute-force lockout', async () => {
    const statusRes = await api<{ services: { emailConfigured: boolean } }>('/api/status');
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data.services.emailConfigured, false);

    const sendRes = await api<{ sent: boolean; disabled?: boolean; requiresConfig: boolean }>(
      '/api/auth/send-verification',
      { method: 'POST', token: studentToken }
    );
    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.data.sent, false);
    assert.equal(sendRes.data.disabled, true);
    assert.equal(sendRes.data.requiresConfig, true);

    const verifyBad = await api('/api/auth/verify-email', {
      method: 'POST',
      token: studentToken,
      body: JSON.stringify({ code: '123456' }),
    });
    assert.equal(verifyBad.status, 400);

    // Register isolated lockout target account & trigger 5 failed logins -> 429
    await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Lockout User',
        email: 'lockout@test.edu',
        phone: '01999999997',
        password: 'correctPassword1',
        year: 1,
        acceptedTerms: true,
      }),
    });

    for (let i = 0; i < 4; i++) {
      const attempt = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: 'lockout@test.edu', password: 'wrong' }),
      });
      assert.equal(attempt.status, 401);
    }

    const lockedAttempt = await api<{ retryAfterSeconds?: number }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier: 'lockout@test.edu', password: 'wrong' }),
    });
    assert.equal(lockedAttempt.status, 429);
    assert.ok((lockedAttempt.data.retryAfterSeconds || 0) > 0);
  });

  test('12. Personal data management, credential edit lock for students, export, admin self-delete guard & student self-deletion', async () => {
    // Student can update name and year, but NOT email or password after registration
    const lockedPasswordAttempt = await api<{ error: string }>(
      '/api/account/profile',
      {
        method: 'PATCH',
        token: studentToken,
        body: JSON.stringify({
          name: 'Student Audit Updated',
          currentPassword: 'password123',
          newPassword: 'newPassword123',
        }),
      }
    );
    assert.equal(lockedPasswordAttempt.status, 403);

    const lockedEmailAttempt = await api<{ error: string }>(
      '/api/account/profile',
      {
        method: 'PATCH',
        token: studentToken,
        body: JSON.stringify({
          email: 'hacked.student@test.edu',
        }),
      }
    );
    assert.equal(lockedEmailAttempt.status, 403);

    const profileUpdate = await api<{ user: { name: string; year: number } }>(
      '/api/account/profile',
      {
        method: 'PATCH',
        token: studentToken,
        body: JSON.stringify({
          name: 'Student Audit Updated',
          year: 2,
        }),
      }
    );
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.data.user.name, 'Student Audit Updated');
    assert.equal(profileUpdate.data.user.year, 2);

    // Super Admin updates student's password cleanly, revoking prior student session
    const superAdminReset = await api<{ user: { id: string } }>(
      `/api/admin/users/${studentId}/credentials`,
      {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          newPassword: 'newPassword123',
        }),
      }
    );
    assert.equal(superAdminReset.status, 200);

    // Student signs back in with the new password set by Super Admin
    const reLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.audit@test.edu',
        password: 'newPassword123',
      }),
    });
    assert.equal(reLogin.status, 200);
    studentToken = reLogin.data.token;

    const exportRes = await fetch(`${BASE_URL}/api/account/export`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.equal(exportRes.status, 200);
    const exported = (await exportRes.json()) as {
      profile: { id: string; email: string };
      quizSubmissions: unknown[];
    };
    assert.equal(exported.profile.id, studentId);
    assert.equal(exported.profile.email, 'student.audit@test.edu');
    assert.ok(Array.isArray(exported.quizSubmissions));

    // Protected/admin cannot self-delete
    const adminSelfDelete = await api('/api/account', {
      method: 'DELETE',
      token: adminToken,
      body: JSON.stringify({ password: 'adminPassword123' }),
    });
    assert.equal(adminSelfDelete.status, 403);

    // Wrong password rejected
    const wrongDelete = await api('/api/account', {
      method: 'DELETE',
      token: studentToken,
      body: JSON.stringify({ password: 'wrong' }),
    });
    assert.equal(wrongDelete.status, 401);

    // Student deletes own account with new password
    const okDelete = await api('/api/account', {
      method: 'DELETE',
      token: studentToken,
      body: JSON.stringify({ password: 'newPassword123' }),
    });
    assert.equal(okDelete.status, 200);

    const afterDeleteMe = await api('/api/auth/me', { token: studentToken });
    assert.equal(afterDeleteMe.status, 401);
  });

  test('13. Admin User Management Dashboard: roles, RBAC, search/filter/sort/pagination, profile stats, CSV & audit log', async () => {
    // 1. Admin creates a teacher and a student (with formula-injection-like name for CSV test)
    const teacherCreate = await api<{
      user: { id: string; role: string; passwordHash?: string; lastLoginAt?: string };
    }>('/api/admin/users', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        name: 'د. طارق المدرس',
        email: 'teacher.audit@test.edu',
        phone: '01888888881',
        password: 'teacherPass123',
        year: 3,
        role: 'teacher',
      }),
    });
    assert.equal(teacherCreate.status, 201);
    assert.equal(teacherCreate.data.user.role, 'teacher');
    assert.equal(teacherCreate.data.user.passwordHash, undefined);
    assert.equal(teacherCreate.data.user.lastLoginAt, undefined);
    const teacherId = teacherCreate.data.user.id;

    const formulaStudentCreate = await api<{ user: { id: string; role: string } }>(
      '/api/admin/users',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          name: '=CMD() طالب اختبار',
          email: 'formula.std@test.edu',
          phone: '01888888882',
          password: 'studentPass123',
          year: 2,
          role: 'student',
        }),
      }
    );
    assert.equal(formulaStudentCreate.status, 201);
    const formulaStudentId = formulaStudentCreate.data.user.id;

    // 2. Teacher logs in -> updates lastLoginAt, and verify BOTH teacher & student are blocked from all Admin User Management endpoints
    const teacherLogin = await api<{ token: string; user: { lastLoginAt?: string } }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          identifier: 'teacher.audit@test.edu',
          password: 'teacherPass123',
        }),
      }
    );
    assert.equal(teacherLogin.status, 200);
    assert.ok(teacherLogin.data.user.lastLoginAt, 'Login must record lastLoginAt');
    const teacherToken = teacherLogin.data.token;

    const studentLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'formula.std@test.edu',
        password: 'studentPass123',
      }),
    });
    assert.equal(studentLogin.status, 200);
    const fStudentToken = studentLogin.data.token;

    const adminOnlyEndpoints: Array<[string, RequestInit]> = [
      ['/api/admin/users', { method: 'GET' }],
      [`/api/admin/users/${formulaStudentId}/profile`, { method: 'GET' }],
      ['/api/admin/users/export.csv', { method: 'GET' }],
      ['/api/admin/audit-logs', { method: 'GET' }],
      [`/api/admin/users/${formulaStudentId}/suspend`, { method: 'POST', body: JSON.stringify({}) }],
      [`/api/admin/users/${formulaStudentId}/unsuspend`, { method: 'POST' }],
      [`/api/admin/users/${formulaStudentId}`, { method: 'DELETE' }],
    ];
    for (const nonAdminToken of [fStudentToken, teacherToken]) {
      for (const [ep, opts] of adminOnlyEndpoints) {
        const res = await api(ep, { ...opts, token: nonAdminToken });
        assert.equal(res.status, 403, `Non-admin must get 403 on ${ep}`);
      }
      // Verify leaderboard endpoint hides PII from non-admins
      const lb = await api<{ users: Array<{ email: string; phone: string }> }>('/api/users', {
        token: nonAdminToken,
      });
      assert.equal(lb.status, 200);
      for (const u of lb.data.users) {
        assert.equal(u.email, '');
        assert.equal(u.phone, '');
      }
    }

    // 3. Search, role/status filtering, sorting & pagination + total/active counts
    const teacherList = await api<{
      users: Array<{ id: string; role: string; lastLoginAt?: string; passwordHash?: string }>;
      stats: {
        totalUsers: number;
        activeUsers: number;
        suspendedUsers: number;
        studentsCount: number;
        teachersCount: number;
        adminsCount: number;
      };
      pagination: { page: number; limit: number; totalFiltered: number; totalPages: number };
    }>('/api/admin/users?role=teacher&search=طارق&page=1&limit=5', {
      token: adminToken,
    });
    assert.equal(teacherList.status, 200);
    assert.equal(teacherList.data.users.length, 1);
    assert.equal(teacherList.data.users[0].id, teacherId);
    assert.ok(teacherList.data.users[0].lastLoginAt);
    assert.equal(teacherList.data.users[0].passwordHash, undefined);
    assert.ok(teacherList.data.stats.totalUsers >= 8);
    assert.ok(teacherList.data.stats.activeUsers >= 8);
    assert.ok(teacherList.data.stats.teachersCount >= 1);
    assert.ok(teacherList.data.stats.adminsCount >= 1);

    const pagedList = await api<{
      users: unknown[];
      pagination: { page: number; totalPages: number; totalFiltered: number };
    }>('/api/admin/users?page=2&limit=2&sortBy=name&sortDir=asc', {
      token: adminToken,
    });
    assert.equal(pagedList.status, 200);
    assert.equal(pagedList.data.users.length, 2);
    assert.equal(pagedList.data.pagination.page, 2);
    assert.ok(pagedList.data.pagination.totalPages >= 4);

    // 4. Student enrolls + completes summary, Admin inspects profile & academic statistics
    await api('/api/student/enroll', {
      method: 'POST',
      token: fStudentToken,
      body: JSON.stringify({ courseId: 'course-gis-101' }),
    });
    await api('/api/student/lesson-progress', {
      method: 'POST',
      token: fStudentToken,
      body: JSON.stringify({
        courseId: 'course-gis-101',
        summaryId: 'sum-1',
        lessonTitle: 'Intro Vector vs Raster',
        completed: true,
      }),
    });

    const profileRes = await api<{
      user: { id: string; passwordHash?: string; email: string };
      academicStats: {
        enrolledCoursesCount: number;
        completedSummariesCount: number;
      };
    }>(`/api/admin/users/${formulaStudentId}/profile`, {
      token: adminToken,
    });
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.data.user.passwordHash, undefined);
    assert.equal(profileRes.data.user.email, 'formula.std@test.edu');
    assert.ok(profileRes.data.academicStats.enrolledCoursesCount >= 1);
    assert.ok(profileRes.data.academicStats.completedSummariesCount >= 1);

    // 5. CSV Export: masked default vs full contact + formula-injection neutralization & no password leak
    const maskedCsvRes = await fetch(`${BASE_URL}/api/admin/users/export.csv`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(maskedCsvRes.status, 200);
    assert.ok(maskedCsvRes.headers.get('content-type')?.includes('text/csv'));
    const maskedCsv = await maskedCsvRes.text();
    assert.ok(!maskedCsv.includes('formula.std@test.edu'), 'Default CSV export must mask emails');
    assert.ok(maskedCsv.includes('fo***@test.edu'), 'Masked email pattern should be present');
    assert.ok(maskedCsv.includes("'=CMD() طالب اختبار"), 'CSV formula injection must be neutralized');
    assert.ok(!maskedCsv.includes('passwordHash'), 'Password hashes must never appear in CSV');

    const fullCsvRes = await fetch(
      `${BASE_URL}/api/admin/users/export.csv?includeContact=true&role=student`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    assert.equal(fullCsvRes.status, 200);
    const fullCsv = await fullCsvRes.text();
    assert.ok(fullCsv.includes('formula.std@test.edu'));
    assert.ok(!fullCsv.includes('teacher.audit@test.edu'), 'Role filter should scope CSV export');

    // 6. Suspend -> Activate -> Delete lifecycle + Admin protected guard
    const suspendTeacher = await api<{ user: { isSuspended: boolean } }>(
      `/api/admin/users/${teacherId}/suspend`,
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ reason: 'Reviewing permissions' }),
      }
    );
    assert.equal(suspendTeacher.status, 200);
    assert.equal(suspendTeacher.data.user.isSuspended, true);

    const suspendedStatsCheck = await api<{ stats: { suspendedUsers: number } }>(
      '/api/admin/users?status=suspended',
      { token: adminToken }
    );
    assert.equal(suspendedStatsCheck.status, 200);
    assert.ok(suspendedStatsCheck.data.stats.suspendedUsers >= 1);

    const activateTeacher = await api<{ user: { isSuspended: boolean } }>(
      `/api/admin/users/${teacherId}/unsuspend`,
      { method: 'POST', token: adminToken }
    );
    assert.equal(activateTeacher.status, 200);
    assert.equal(activateTeacher.data.user.isSuspended, false);

    // Founder admin cannot be suspended or deleted
    const suspendFounder = await api('/api/admin/users/user-founder-admin/suspend', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ reason: 'Invalid' }),
    });
    assert.equal(suspendFounder.status, 403);
    const deleteFounder = await api('/api/admin/users/user-founder-admin', {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(deleteFounder.status, 403);

    // Delete student & teacher cleanly
    const deleteFStd = await api(`/api/admin/users/${formulaStudentId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(deleteFStd.status, 200);

    const afterDeleteFStd = await api('/api/auth/me', { token: fStudentToken });
    assert.equal(afterDeleteFStd.status, 401);

    // 7. Audit Log records all sensitive actions
    const auditRes = await api<{
      logs: Array<{ action: string; targetUserId?: string; actorName: string }>;
    }>('/api/admin/audit-logs', { token: adminToken });
    assert.equal(auditRes.status, 200);
    const actions = new Set(auditRes.data.logs.map((l) => l.action));
    for (const expectedAction of [
      'user.create',
      'user.profile_view',
      'users.csv_export',
      'user.suspend',
      'user.activate',
      'user.delete',
    ]) {
      assert.ok(actions.has(expectedAction), `Missing audit log action: ${expectedAction}`);
    }
  });

  test('14. Batch Chat audio & voice recording upload, MP3 transcoding, WebSocket broadcast & rejection of non-audio files', async () => {
    // Use adminToken and join WebSocket room 'general' to observe live broadcast
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(adminToken)}&room=general`);
    const wsMessagePromise = new Promise<{
      id: string;
      audioUrl?: string;
      audioMimeType?: string;
      text: string;
    }>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Did not receive live chat audio WebSocket broadcast'));
      }, 6000);

      ws.on('message', (raw) => {
        const pkt = JSON.parse(raw.toString()) as {
          type: string;
          message?: { id: string; audioUrl?: string; audioMimeType?: string; text: string };
        };
        if (pkt.type === 'chat:message' && pkt.message?.audioUrl) {
          clearTimeout(timer);
          resolve(pkt.message);
        }
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // Reject non-audio disguised file
    const badForm = new FormData();
    badForm.append(
      'audio',
      new Blob(['<script>alert(1)</script>'], { type: 'text/html' }),
      'malicious.html'
    );
    const badUpload = await api('/api/community/chat/general/audio', {
      method: 'POST',
      token: adminToken,
      body: badForm,
    });
    assert.equal(badUpload.status, 400);

    // Build a valid 0.5-second 8000Hz mono 16-bit PCM WAV buffer
    const sampleRate = 8000;
    const numSamples = 4000;
    const dataSize = numSamples * 2;
    const wavBuf = Buffer.alloc(44 + dataSize);
    wavBuf.write('RIFF', 0);
    wavBuf.writeUInt32LE(36 + dataSize, 4);
    wavBuf.write('WAVE', 8);
    wavBuf.write('fmt ', 12);
    wavBuf.writeUInt32LE(16, 16); // PCM chunk size
    wavBuf.writeUInt16LE(1, 20); // PCM format
    wavBuf.writeUInt16LE(1, 22); // mono
    wavBuf.writeUInt32LE(sampleRate, 24);
    wavBuf.writeUInt32LE(sampleRate * 2, 28); // byte rate
    wavBuf.writeUInt16LE(2, 32); // block align
    wavBuf.writeUInt16LE(16, 34); // bits per sample
    wavBuf.write('data', 36);
    wavBuf.writeUInt32LE(dataSize, 40);
    for (let i = 0; i < numSamples; i++) {
      const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
      wavBuf.writeInt16LE(sample, 44 + i * 2);
    }

    const goodForm = new FormData();
    goodForm.append(
      'audio',
      new Blob([wavBuf], { type: 'audio/wav' }),
      'voice-test-note.wav'
    );
    goodForm.append('text', 'تسجيل صوتي تجريبي');
    goodForm.append('durationSeconds', '1');

    const goodUpload = await api<{
      message: {
        id: string;
        audioUrl?: string;
        audioName?: string;
        audioMimeType?: string;
        audioSize?: number;
        text: string;
      };
    }>('/api/community/chat/general/audio', {
      method: 'POST',
      token: adminToken,
      body: goodForm,
    });
    assert.equal(goodUpload.status, 201);
    assert.ok(goodUpload.data.message.audioUrl?.endsWith('.mp3'), 'Uploaded audio must be transcoded to universal MP3');
    assert.equal(goodUpload.data.message.audioMimeType, 'audio/mpeg');
    assert.ok((goodUpload.data.message.audioSize || 0) > 500);
    assert.equal(goodUpload.data.message.text, 'تسجيل صوتي تجريبي');

    // Verify real-time WebSocket broadcast delivered the audio message
    const wsMsg = await wsMessagePromise;
    assert.equal(wsMsg.id, goodUpload.data.message.id);
    assert.equal(wsMsg.audioUrl, goodUpload.data.message.audioUrl);
    ws.close();

    // Verify public/downloadable MP3 asset serves cleanly with audio/mpeg for WhatsApp/Telegram sharing
    const mp3Res = await fetch(`${BASE_URL}${goodUpload.data.message.audioUrl}`);
    assert.equal(mp3Res.status, 200);
    assert.ok(mp3Res.headers.get('content-type')?.includes('audio/mpeg'));
  });

  test('15. 7-Person Admin Support Team Selection & Admin User Profile Notes (Reaction-Only)', async () => {
    // Create two isolated test students (target + bystander) + extra users for 7-seat test
    const createdStudentIds: string[] = [];
    const tokensByIdx: string[] = [];
    for (let i = 1; i <= 8; i++) {
      const res = await api<{ user: { id: string } }>('/api/admin/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          name: `Support & Notes User ${i}`,
          email: `sup.notes.${i}@test.edu`,
          phone: `0177777770${i}`,
          password: 'userPass123',
          year: ((i - 1) % 4) + 1,
          role: 'student',
        }),
      });
      assert.equal(res.status, 201);
      createdStudentIds.push(res.data.user.id);

      if (i <= 2) {
        const loginRes = await api<{ token: string }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            identifier: `sup.notes.${i}@test.edu`,
            password: 'userPass123',
          }),
        });
        assert.equal(loginRes.status, 200);
        tokensByIdx.push(loginRes.data.token);
      }
    }

    const targetUserId = createdStudentIds[0];
    const targetToken = tokensByIdx[0];
    const bystanderToken = tokensByIdx[1];

    // --- Part A: 7-Person Admin-Selected Support Team ---
    // Non-admin blocked from assigning support team
    const unauthAssign = await api('/api/admin/support-team', {
      method: 'POST',
      token: targetToken,
      body: JSON.stringify({
        userId: targetUserId,
        displayName: 'Unauthorized',
        whatsappNumber: '01012345678',
      }),
    });
    assert.equal(unauthAssign.status, 403);

    const assignedMemberIds: string[] = [];
    for (let slot = 1; slot <= 7; slot++) {
      // Test slot 7 assigned without WhatsApp first, then added later by Admin
      const assignRes = await api<{ member: { id: string; slotNumber: number; userId: string } }>(
        '/api/admin/support-team',
        {
          method: 'POST',
          token: adminToken,
          body: JSON.stringify({
            userId: createdStudentIds[slot - 1],
            slotNumber: slot,
            displayName: `عضو دعم #${slot}`,
            specialty: `دعم تقني مقعد ${slot}`,
            ...(slot === 7 ? {} : { whatsappNumber: `0102222330${slot}` }),
            isActive: true,
          }),
        }
      );
      assert.equal(assignRes.status, 201);
      assert.equal(assignRes.data.member.slotNumber, slot);
      assignedMemberIds.push(assignRes.data.member.id);
    }

    // 8th auto-slot assignment rejected once all 7 seats are filled
    const eighthAutoAssign = await api('/api/admin/support-team', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        userId: createdStudentIds[7],
        displayName: 'عضو ثامن مرفوض',
        whatsappNumber: '01022223399',
      }),
    });
    assert.equal(eighthAutoAssign.status, 400);

    // Public student directory returns Leader (للضرورة) & all 7 members without exposing raw phone numbers
    const dirRes = await api<{
      leader: {
        titleAr: string;
        urgencyNoteAr: string;
        hasWhatsapp: boolean;
        whatsappUrl?: string;
        whatsappNumber?: string;
      };
      supportTeam: Array<{
        id: string;
        slotNumber: number;
        displayName: string;
        hasWhatsapp: boolean;
        whatsappUrl?: string;
        whatsappNumber?: string;
      }>;
    }>('/api/support/directory', { token: targetToken });
    assert.equal(dirRes.status, 200);
    assert.equal(dirRes.data.leader.titleAr, 'ليدر المنصة');
    assert.equal(dirRes.data.leader.urgencyNoteAr, 'للضرورة');
    assert.equal(dirRes.data.leader.whatsappNumber, undefined);
    assert.equal(dirRes.data.supportTeam.length, 7);
    for (const m of dirRes.data.supportTeam) {
      assert.equal(m.whatsappNumber, undefined, 'Raw WhatsApp number must never be exposed in directory');
      if (m.slotNumber === 7) {
        assert.equal(m.hasWhatsapp, false);
        assert.equal(m.whatsappUrl, undefined);
      } else {
        assert.equal(m.hasWhatsapp, true);
        assert.ok(m.whatsappUrl?.startsWith('https://wa.me/'));
      }
    }

    // Admin adds WhatsApp number later for slot 7 + updates Platform Leader WhatsApp
    const nonAdminLeaderPatch = await api('/api/admin/support/leader-whatsapp', {
      method: 'PATCH',
      token: targetToken,
      body: JSON.stringify({ whatsappNumber: '01055556666' }),
    });
    assert.equal(nonAdminLeaderPatch.status, 403);

    const adminLeaderPatch = await api<{ ok: boolean; whatsappUrl: string }>(
      '/api/admin/support/leader-whatsapp',
      {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({ whatsappNumber: '01055556666' }),
      }
    );
    assert.equal(adminLeaderPatch.status, 200);
    assert.ok(adminLeaderPatch.data.whatsappUrl.startsWith('https://wa.me/'));

    const leaderLinkRes = await api<{ whatsappUrl: string; urgencyNote: string }>(
      '/api/support/leader/whatsapp-link',
      { method: 'POST', token: targetToken }
    );
    assert.equal(leaderLinkRes.status, 200);
    assert.equal(leaderLinkRes.data.urgencyNote, 'للضرورة');
    assert.ok(leaderLinkRes.data.whatsappUrl.startsWith('https://wa.me/'));

    // Clicking a support team member resolves secure WhatsApp URL
    const waLinkRes = await api<{ whatsappUrl: string; slotNumber: number }>(
      `/api/support/team/${assignedMemberIds[0]}/whatsapp-link`,
      { method: 'POST', token: targetToken }
    );
    assert.equal(waLinkRes.status, 200);
    assert.ok(waLinkRes.data.whatsappUrl.startsWith('https://wa.me/'));
    assert.equal(waLinkRes.data.slotNumber, 1);

    // Admin adds number & later updates/removes slot 7 member
    const patchSupportRes = await api<{ member: { isActive: boolean; specialty?: string } }>(
      `/api/admin/support-team/${assignedMemberIds[6]}`,
      {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({ isActive: false, specialty: 'تخصص محدث', whatsappNumber: '01033334444' }),
      }
    );
    assert.equal(patchSupportRes.status, 200);
    assert.equal(patchSupportRes.data.member.isActive, false);

    const removeSupportRes = await api(`/api/admin/support-team/${assignedMemberIds[6]}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(removeSupportRes.status, 200);

    // --- Part B: Admin Notes on User Profile & Reaction-Only User Interaction ---
    const nonAdminNotePost = await api(`/api/admin/users/${targetUserId}/notes`, {
      method: 'POST',
      token: bystanderToken,
      body: JSON.stringify({ content: 'Unauthorized note' }),
    });
    assert.equal(nonAdminNotePost.status, 403);

    const createNoteRes = await api<{
      note: { id: string; targetUserId: string; content: string; reactions: unknown[] };
    }>(`/api/admin/users/${targetUserId}/notes`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ content: 'أحسنت في المذاكرة هذا الأسبوع، استمر!' }),
    });
    assert.equal(createNoteRes.status, 201);
    const noteId = createNoteRes.data.note.id;
    assert.equal(createNoteRes.data.note.targetUserId, targetUserId);
    assert.equal(createNoteRes.data.note.reactions.length, 0);

    // Admin profile view includes note
    const adminProfileRes = await api<{ notes?: Array<{ id: string; content: string }> }>(
      `/api/admin/users/${targetUserId}/profile`,
      { token: adminToken }
    );
    assert.equal(adminProfileRes.status, 200);
    assert.ok(adminProfileRes.data.notes?.some((n) => n.id === noteId));

    // Bystander cannot view or react to another student's note
    const bystanderNotesRes = await api<{ notes: Array<{ id: string }> }>('/api/account/notes', {
      token: bystanderToken,
    });
    assert.equal(bystanderNotesRes.status, 200);
    assert.equal(bystanderNotesRes.data.notes.some((n) => n.id === noteId), false);

    const bystanderReactRes = await api(`/api/account/notes/${noteId}/react`, {
      method: 'POST',
      token: bystanderToken,
      body: JSON.stringify({ emoji: '👍' }),
    });
    assert.equal(bystanderReactRes.status, 403);

    // Target student views note and can only react with allowed emojis (no free-text replies)
    const targetNotesRes = await api<{ notes: Array<{ id: string; content: string }> }>(
      '/api/account/notes',
      { token: targetToken }
    );
    assert.equal(targetNotesRes.status, 200);
    assert.ok(targetNotesRes.data.notes.some((n) => n.id === noteId));

    const badEmojiRes = await api(`/api/account/notes/${noteId}/react`, {
      method: 'POST',
      token: targetToken,
      body: JSON.stringify({ emoji: 'text reply attempt' }),
    });
    assert.equal(badEmojiRes.status, 400);

    const reactLikeRes = await api<{
      note: { reactions: Array<{ userId: string; emoji: string }> };
    }>(`/api/account/notes/${noteId}/react`, {
      method: 'POST',
      token: targetToken,
      body: JSON.stringify({ emoji: '👍' }),
    });
    assert.equal(reactLikeRes.status, 200);
    assert.equal(reactLikeRes.data.note.reactions[0].emoji, '👍');

    // Switch reaction to ✅
    const reactCheckRes = await api<{
      note: { reactions: Array<{ userId: string; emoji: string }> };
    }>(`/api/account/notes/${noteId}/react`, {
      method: 'POST',
      token: targetToken,
      body: JSON.stringify({ emoji: '✅' }),
    });
    assert.equal(reactCheckRes.status, 200);
    assert.equal(reactCheckRes.data.note.reactions.length, 1);
    assert.equal(reactCheckRes.data.note.reactions[0].emoji, '✅');

    // Clicking same reaction again toggles it off cleanly
    const reactToggleOffRes = await api<{ note: { reactions: unknown[] } }>(
      `/api/account/notes/${noteId}/react`,
      {
        method: 'POST',
        token: targetToken,
        body: JSON.stringify({ emoji: '✅' }),
      }
    );
    assert.equal(reactToggleOffRes.status, 200);
    assert.equal(reactToggleOffRes.data.note.reactions.length, 0);

    // Admin deletes the note
    const deleteNoteRes = await api(
      `/api/admin/users/${targetUserId}/notes/${noteId}`,
      { method: 'DELETE', token: adminToken }
    );
    assert.equal(deleteNoteRes.status, 200);

    // Cleanup temporary test users (cascade cleans remaining support team entries)
    for (const id of createdStudentIds) {
      await api(`/api/admin/users/${id}`, { method: 'DELETE', token: adminToken });
    }
  });

  test('16. Personal dashboard metrics, Super Admin exclusive credentials editing & custom admin activation password', async () => {
    // 1. Register two students for testing dashboard metrics, activation password & credentials edits
    const regPrimary = await api<{
      token: string;
      user: { id: string; role: string; email: string };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'طالب لوحة التحكم',
        email: 'dash.student@test.edu',
        phone: '01777777701',
        password: 'dashPass123',
        year: 2,
        acceptedTerms: true,
      }),
    });
    assert.equal(regPrimary.status, 201);
    const dashStudentToken = regPrimary.data.token;
    const dashStudentId = regPrimary.data.user.id;

    const regTarget = await api<{
      token: string;
      user: { id: string; role: string; email: string };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'طالب تعديل البيانات',
        email: 'cred.target@test.edu',
        phone: '01777777702',
        password: 'credOldPass123',
        year: 1,
        acceptedTerms: true,
      }),
    });
    assert.equal(regTarget.status, 201);
    const targetTokenOld = regTarget.data.token;
    const targetUserId = regTarget.data.user.id;

    // 2. Verify personal dashboard returns personalInfo, achievements & strengthsAndWeaknesses
    const dashRes = await api<{
      personalInfo: { id: string; email: string; leaderboardRank: number; totalRankedUsers: number };
      achievements: Array<{ id: string; earned: boolean; progressPercent: number }>;
      earnedBadgesCount: number;
      totalBadgesCount: number;
      strengthsAndWeaknesses: {
        overallStrengthPercent: number;
        overallWeaknessPercent: number;
        hasQuizData: boolean;
        trackBreakdown: Array<{ track: string; strengthPercent: number; weaknessPercent: number }>;
      };
    }>('/api/student/dashboard', { token: dashStudentToken });
    assert.equal(dashRes.status, 200);
    assert.equal(dashRes.data.personalInfo.id, dashStudentId);
    assert.equal(dashRes.data.personalInfo.email, 'dash.student@test.edu');
    assert.ok(dashRes.data.personalInfo.leaderboardRank >= 1);
    assert.ok(dashRes.data.totalBadgesCount >= 5);
    assert.ok(Array.isArray(dashRes.data.achievements));
    assert.equal(typeof dashRes.data.earnedBadgesCount, 'number');
    assert.equal(typeof dashRes.data.strengthsAndWeaknesses.overallStrengthPercent, 'number');
    assert.equal(typeof dashRes.data.strengthsAndWeaknesses.overallWeaknessPercent, 'number');
    assert.ok(Array.isArray(dashRes.data.strengthsAndWeaknesses.trackBreakdown));

    // 3. Super Admin sets a custom Admin Activation Password and chooses default rank
    const setActPass = await api<{
      configured: boolean;
      defaultRankId: string;
    }>('/api/admin/activation-password', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({
        password: 'LeaderSecretActivation2026',
        defaultRankId: 'rank-student-affairs',
      }),
    });
    assert.equal(setActPass.status, 200);
    assert.equal(setActPass.data.configured, true);
    assert.equal(setActPass.data.defaultRankId, 'rank-student-affairs');

    // Public config must NEVER leak activation password or hash
    const publicCfg = await api<Record<string, unknown>>('/api/platform/config');
    assert.equal(publicCfg.status, 200);
    assert.equal('adminActivationPasswordHash' in publicCfg.data, false);
    assert.equal('adminActivationDefaultRankId' in publicCfg.data, false);

    // 4. Student tries wrong activation password -> 403; correct password -> promoted to delegated admin
    const wrongActivate = await api('/api/account/activate-admin', {
      method: 'POST',
      token: dashStudentToken,
      body: JSON.stringify({ password: 'WrongActivationPassword' }),
    });
    assert.equal(wrongActivate.status, 403);

    const okActivate = await api<{
      user: { role: string; adminRankId?: string; isSuperAdmin?: boolean };
    }>('/api/account/activate-admin', {
      method: 'POST',
      token: dashStudentToken,
      body: JSON.stringify({ password: 'LeaderSecretActivation2026' }),
    });
    assert.equal(okActivate.status, 200);
    assert.equal(okActivate.data.user.role, 'admin');
    assert.equal(okActivate.data.user.adminRankId, 'rank-student-affairs');
    assert.equal(Boolean(okActivate.data.user.isSuperAdmin), false);

    // 5. Also confirm new registration with custom activation password works cleanly
    const regViaActivation = await api<{
      user: { role: string; adminRankId?: string; isSuperAdmin?: boolean };
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'أدمن مفعل عند التسجيل',
        email: 'reg.admin.act@test.edu',
        phone: '01777777703',
        password: 'regAdminPass123',
        year: 3,
        adminCode: 'LeaderSecretActivation2026',
        acceptedTerms: true,
      }),
    });
    assert.equal(regViaActivation.status, 201);
    assert.equal(regViaActivation.data.user.role, 'admin');
    assert.equal(regViaActivation.data.user.adminRankId, 'rank-student-affairs');
    assert.equal(Boolean(regViaActivation.data.user.isSuperAdmin), false);

    // 6. Newly promoted sub-admin CANNOT edit activation password or users' email/password (403)
    const subAdminSetAct = await api('/api/admin/activation-password', {
      method: 'PUT',
      token: dashStudentToken,
      body: JSON.stringify({ password: 'HijackPassword999' }),
    });
    assert.equal(subAdminSetAct.status, 403);

    const subAdminCredEdit = await api(`/api/admin/users/${targetUserId}/credentials`, {
      method: 'PATCH',
      token: dashStudentToken,
      body: JSON.stringify({
        email: 'subadmin.blocked@test.edu',
        newPassword: 'blockedChange123',
      }),
    });
    assert.equal(subAdminCredEdit.status, 403);

    // 7. Super Admin CAN edit target user's email & password exclusively, revoking target's old session
    const superAdminCredEdit = await api<{
      user: { id: string; email: string };
    }>(`/api/admin/users/${targetUserId}/credentials`, {
      method: 'PATCH',
      token: adminToken,
      body: JSON.stringify({
        email: 'cred.updated@test.edu',
        newPassword: 'credNewPass456',
      }),
    });
    assert.equal(superAdminCredEdit.status, 200);
    assert.equal(superAdminCredEdit.data.user.email, 'cred.updated@test.edu');

    // Old session of target user must be invalidated after password update
    const oldSessionCheck = await api('/api/auth/me', { token: targetTokenOld });
    assert.equal(oldSessionCheck.status, 401);

    // Target user logs in with updated email & new password
    const updatedLogin = await api<{
      token: string;
      user: { email: string };
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'cred.updated@test.edu',
        password: 'credNewPass456',
      }),
    });
    assert.equal(updatedLogin.status, 200);
    assert.equal(updatedLogin.data.user.email, 'cred.updated@test.edu');

    // Super Admin can clear activation password cleanly
    const clearAct = await api<{ configured: boolean }>('/api/admin/activation-password', {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ clear: true }),
    });
    assert.equal(clearAct.status, 200);
    assert.equal(clearAct.data.configured, false);
  });
});


