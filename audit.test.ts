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

  test('12. Personal data management, export, admin self-delete guard & student self-deletion', async () => {
    const profileUpdate = await api<{ user: { name: string; year: number } }>(
      '/api/account/profile',
      {
        method: 'PATCH',
        token: studentToken,
        body: JSON.stringify({
          name: 'Student Audit Updated',
          year: 2,
          currentPassword: 'password123',
          newPassword: 'newPassword123',
        }),
      }
    );
    assert.equal(profileUpdate.status, 200);
    assert.equal(profileUpdate.data.user.name, 'Student Audit Updated');
    assert.equal(profileUpdate.data.user.year, 2);

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

  test('15. Course folder 4-section structure: Course Book & simplified Assignments (title-only + text/image/video/pdf)', async () => {
    // Register a fresh student token for student read & RBAC checks (earlier student account was self-deleted in test 12)
    const folderStudentReg = await api<{ token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Folder Student',
        email: 'folder.student@test.edu',
        phone: '01988887771',
        password: 'password123',
        year: 1,
        acceptedTerms: true,
      }),
    });
    assert.equal(folderStudentReg.status, 201);
    const folderStudentToken = folderStudentReg.data.token;

    // 1. Admin creates a folder inside course-gis-101
    const folderRes = await api<{ folder: { id: string; name: string } }>(
      '/api/courses/course-gis-101/folders',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({ name: 'مجلد الوحدة التجريبية' }),
      }
    );
    assert.equal(folderRes.status, 201);
    const folderId = folderRes.data.folder.id;

    // 2. Admin adds a Course Book (kind: 'book') to the folder
    const bookForm = new FormData();
    bookForm.append('title', 'كتاب أساسيات المساحة');
    bookForm.append('folderId', folderId);
    bookForm.append('kind', 'book');
    bookForm.append(
      'pdf',
      new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'], {
        type: 'application/pdf',
      }),
      'course-book.pdf'
    );
    const bookRes = await api<{ summary: { id: string; kind?: string; folderId?: string } }>(
      '/api/courses/course-gis-101/summaries',
      {
        method: 'POST',
        token: adminToken,
        body: bookForm,
      }
    );
    assert.equal(bookRes.status, 201);
    assert.equal(bookRes.data.summary.kind, 'book');
    assert.equal(bookRes.data.summary.folderId, folderId);

    // 3. Reject assignment when title is missing
    const missingTitleAssign = await api('/api/courses/course-gis-101/assignments', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ folderId, text: 'بدون اسم تكليف' }),
    });
    assert.equal(missingTitleAssign.status, 400);

    // 4. Reject disallowed attachment extension (e.g. .html / .txt)
    const badAttachForm = new FormData();
    badAttachForm.append('title', 'تكليف بمرفق مرفوض');
    badAttachForm.append('folderId', folderId);
    badAttachForm.append(
      'attachment',
      new Blob(['hello'], { type: 'text/plain' }),
      'notes.txt'
    );
    const badAttachRes = await api('/api/courses/course-gis-101/assignments', {
      method: 'POST',
      token: adminToken,
      body: badAttachForm,
    });
    assert.equal(badAttachRes.status, 400);

    // 5. Create assignment with ONLY title (JSON, no text, no attachment)
    const titleOnlyRes = await api<{
      assignment: { id: string; title: string; folderId?: string; text?: string; fileUrl?: string };
    }>('/api/courses/course-gis-101/assignments', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ title: 'تكليف بالاسم فقط', folderId }),
    });
    assert.equal(titleOnlyRes.status, 201);
    assert.equal(titleOnlyRes.data.assignment.title, 'تكليف بالاسم فقط');
    assert.equal(titleOnlyRes.data.assignment.folderId, folderId);
    assert.equal(titleOnlyRes.data.assignment.text, undefined);
    assert.equal(titleOnlyRes.data.assignment.fileUrl, undefined);

    // 6. Create assignment with title + text
    const textOnlyRes = await api<{ assignment: { id: string; text?: string } }>(
      '/api/courses/course-gis-101/assignments',
      {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          title: 'تكليف كتابي',
          folderId,
          text: 'اشرح الفرق بين الإحداثيات الجغرافية والمسقطة.',
        }),
      }
    );
    assert.equal(textOnlyRes.status, 201);
    assert.equal(textOnlyRes.data.assignment.text, 'اشرح الفرق بين الإحداثيات الجغرافية والمسقطة.');

    // 7. Create assignment with title + image attachment
    const imgForm = new FormData();
    imgForm.append('title', 'تكليف بصورة توضيحية');
    imgForm.append('folderId', folderId);
    imgForm.append(
      'attachment',
      new Blob([Buffer.from('89504e470d0a1a0a', 'hex')], { type: 'image/png' }),
      'diagram.png'
    );
    const imgRes = await api<{
      assignment: { id: string; attachmentType?: string; fileUrl?: string };
    }>('/api/courses/course-gis-101/assignments', {
      method: 'POST',
      token: adminToken,
      body: imgForm,
    });
    assert.equal(imgRes.status, 201);
    assert.equal(imgRes.data.assignment.attachmentType, 'image');
    assert.ok(imgRes.data.assignment.fileUrl?.startsWith('/uploads/'));

    // 8. Student cannot create or delete assignments (403)
    const stdCreateAssign = await api('/api/courses/course-gis-101/assignments', {
      method: 'POST',
      token: folderStudentToken,
      body: JSON.stringify({ title: 'محاولة طالب', folderId }),
    });
    assert.equal(stdCreateAssign.status, 403);

    const stdDeleteAssign = await api(`/api/assignments/${titleOnlyRes.data.assignment.id}`, {
      method: 'DELETE',
      token: folderStudentToken,
    });
    assert.equal(stdDeleteAssign.status, 403);

    // 9. Course details exposes books and assignments to enrolled/authenticated student
    const detailsRes = await api<{
      summaries: Array<{ id: string; kind?: string; folderId?: string }>;
      assignments: Array<{ id: string; title: string; folderId?: string }>;
    }>('/api/courses/course-gis-101/details', { token: folderStudentToken });
    assert.equal(detailsRes.status, 200);
    assert.ok(
      detailsRes.data.summaries.some(
        (s) => s.id === bookRes.data.summary.id && s.kind === 'book'
      )
    );
    assert.ok(
      detailsRes.data.assignments.some((a) => a.id === titleOnlyRes.data.assignment.id)
    );

    // 10. Deleting one assignment and then deleting the folder cleans up remaining items
    const delOne = await api(`/api/assignments/${titleOnlyRes.data.assignment.id}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delOne.status, 200);

    const delFolder = await api(`/api/folders/${folderId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    assert.equal(delFolder.status, 200);

    const afterFolderDel = await api<{
      summaries: Array<{ id: string }>;
      assignments: Array<{ id: string }>;
    }>('/api/courses/course-gis-101/details', { token: adminToken });
    assert.equal(afterFolderDel.status, 200);
    assert.ok(!afterFolderDel.data.summaries.some((s) => s.id === bookRes.data.summary.id));
    assert.ok(!afterFolderDel.data.assignments.some((a) => a.id === imgRes.data.assignment.id));
  });
});
