import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

const TEST_PORT = 3201;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TMP_DIR = path.resolve('/tmp', `mvia-vercel-run-${Date.now()}`);
const TMP_DB = path.join(TMP_DIR, 'db.json');
const TMP_UPLOADS = path.join(TMP_DIR, 'uploads');
const TEST_ADMIN_SECRET = 'TEST-VERCEL-ADMIN-SECRET';

let serverProc: ReturnType<typeof spawn> | null = null;

async function waitForServer(url: string, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Wait for server boot
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('Test server did not become ready in time');
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

  await waitForServer(`${BASE_URL}/api/health`);
});

after(async () => {
  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 300));
  }
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
});

describe('MVIA Admin Session Revocation, REST Chat & Vercel Adapter Suite', () => {
  test('1. Admin can revoke all non-admin sessions while preserving every admin session', async () => {
    const admin1Reg = await api<{ token: string; user: { id: string; role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Primary Admin',
          email: 'admin1.sessions@test.edu',
          phone: '01777777701',
          password: 'password123',
          year: 4,
          adminCode: TEST_ADMIN_SECRET,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(admin1Reg.status, 201);

    const admin2Reg = await api<{ token: string; user: { id: string; role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Peer Admin',
          email: 'admin2.sessions@test.edu',
          phone: '01777777702',
          password: 'password123',
          year: 4,
          adminCode: TEST_ADMIN_SECRET,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(admin2Reg.status, 201);

    const studentReg = await api<{ token: string; user: { id: string; role: string } }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: 'Session Student',
          email: 'student.sessions@test.edu',
          phone: '01777777703',
          password: 'password123',
          year: 2,
          acceptedTerms: true,
        }),
      }
    );
    assert.equal(studentReg.status, 201);

    const teacherCreate = await api<{ user: { id: string; role: string } }>(
      '/api/admin/users',
      {
        method: 'POST',
        token: admin1Reg.data.token,
        body: JSON.stringify({
          name: 'Session Teacher',
          email: 'teacher.sessions@test.edu',
          phone: '01777777704',
          password: 'password123',
          year: 4,
          role: 'teacher',
        }),
      }
    );
    assert.equal(teacherCreate.status, 201);
    assert.equal(teacherCreate.data.user.role, 'teacher');

    const teacherLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'teacher.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(teacherLogin.status, 200);

    // Non-admin and unauthenticated callers are strictly rejected
    const unauthRevoke = await api('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
    });
    assert.equal(unauthRevoke.status, 401);

    const studentRevoke = await api('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
      token: studentReg.data.token,
    });
    assert.equal(studentRevoke.status, 403);

    const teacherRevoke = await api('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
      token: teacherLogin.data.token,
    });
    assert.equal(teacherRevoke.status, 403);

    // Admin triggers global non-admin session revocation
    const revokeRes = await api<{
      ok: boolean;
      revokedSessionsCount: number;
      affectedUsersCount: number;
      keptAdminSessionsCount: number;
    }>('/api/admin/sessions/revoke-non-admins', {
      method: 'POST',
      token: admin1Reg.data.token,
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.data.ok, true);
    assert.ok(revokeRes.data.revokedSessionsCount >= 2);
    assert.ok(revokeRes.data.affectedUsersCount >= 2);
    assert.ok(revokeRes.data.keptAdminSessionsCount >= 2);

    // Both student and teacher tokens are now invalidated (must sign in again)
    const studentAfter = await api('/api/auth/me', { token: studentReg.data.token });
    assert.equal(studentAfter.status, 401);

    const teacherAfter = await api('/api/auth/me', { token: teacherLogin.data.token });
    assert.equal(teacherAfter.status, 401);

    // Both admins (caller AND peer admin) remain signed in untouched
    const admin1After = await api('/api/auth/me', { token: admin1Reg.data.token });
    assert.equal(admin1After.status, 200);

    const admin2After = await api('/api/auth/me', { token: admin2Reg.data.token });
    assert.equal(admin2After.status, 200);

    // Student can sign back in cleanly afterwards
    const studentRelogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(studentRelogin.status, 200);
    assert.ok(studentRelogin.data.token);

    // Audit log captured the bulk revocation event
    const auditRes = await api<{ logs: Array<{ action: string }> }>(
      '/api/admin/audit-logs',
      { token: admin1Reg.data.token }
    );
    assert.equal(auditRes.status, 200);
    assert.ok(
      auditRes.data.logs.some((l) => l.action === 'sessions.revoke_non_admins'),
      'Expected sessions.revoke_non_admins audit entry'
    );
  });

  test('2. Community batch chat works over REST fallback for Vercel Serverless', async () => {
    const loginRes = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(loginRes.status, 200);
    const token = loginRes.data.token;

    const emptyMsg = await api('/api/community/chat/general', {
      method: 'POST',
      token,
      body: JSON.stringify({ text: '   ' }),
    });
    assert.equal(emptyMsg.status, 400);

    const postMsg = await api<{
      message: { id: string; text: string; room: string; userRole: string };
    }>('/api/community/chat/general', {
      method: 'POST',
      token,
      body: JSON.stringify({ text: 'رسالة اختبار عبر REST لمنصة Vercel' }),
    });
    assert.equal(postMsg.status, 201);
    assert.equal(postMsg.data.message.room, 'general');
    assert.equal(postMsg.data.message.userRole, 'student');
    assert.equal(postMsg.data.message.text, 'رسالة اختبار عبر REST لمنصة Vercel');

    const adminLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'admin1.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(adminLogin.status, 200);

    const adminPostMsg = await api<{
      message: { id: string; text: string; rankBadge?: { labelAr?: string } };
    }>('/api/community/chat/general', {
      method: 'POST',
      token: adminLogin.data.token,
      body: JSON.stringify({ text: 'رسالة أدمن عبر REST' }),
    });
    assert.equal(adminPostMsg.status, 201);
    assert.ok(adminPostMsg.data.message.rankBadge, 'Admin REST message should carry rankBadge');

    const listRes = await api<{
      messages: Array<{ id: string; text: string; rankBadge?: unknown }>;
    }>('/api/community/chat/general', { token });
    assert.equal(listRes.status, 200);
    assert.ok(
      listRes.data.messages.some((m) => m.id === postMsg.data.message.id),
      'Posted REST message must appear in GET history'
    );
    const hydratedAdminMsg = listRes.data.messages.find(
      (m) => m.id === adminPostMsg.data.message.id
    );
    assert.ok(hydratedAdminMsg?.rankBadge, 'GET chat history must hydrate rankBadge');
  });

  test('3. Vercel API adapter normalizes rewrite paths and serves requests under VERCEL=1 without EROFS', async () => {
    const prevVercel = process.env.VERCEL;
    const prevDbFile = process.env.MVIA_DB_FILE;
    const prevUploadsDir = process.env.MVIA_UPLOADS_DIR;
    const prevAutoBackup = process.env.MVIA_DISABLE_AUTO_BACKUP;

    process.env.VERCEL = '1';
    delete process.env.MVIA_DB_FILE;
    delete process.env.MVIA_UPLOADS_DIR;
    process.env.MVIA_DISABLE_AUTO_BACKUP = '1';

    let serverlessHttp: http.Server | null = null;
    try {
      const vercelMod = await import('../api/index.ts');
      const { normalizeVercelApiUrl, default: handler } = vercelMod;

      assert.equal(
        normalizeVercelApiUrl('/api?__mvia_path=auth/login'),
        '/api/auth/login'
      );
      assert.equal(
        normalizeVercelApiUrl('/api?__mvia_path=admin/users&page=2&role=student'),
        '/api/admin/users?page=2&role=student'
      );
      assert.equal(normalizeVercelApiUrl('/api/health?check=1'), '/api/health?check=1');

      serverlessHttp = http.createServer((req, res) => {
        void handler(req, res);
      });

      await new Promise<void>((resolve) => serverlessHttp!.listen(0, '127.0.0.1', resolve));
      const addr = serverlessHttp.address();
      assert.ok(addr && typeof addr === 'object');
      const serverlessBase = `http://127.0.0.1:${addr.port}`;

      const healthRes = await fetch(`${serverlessBase}/api?__mvia_path=health`);
      assert.equal(healthRes.status, 200);
      const healthBody = (await healthRes.json()) as {
        ok: boolean;
        runtime?: string;
      };
      assert.equal(healthBody.ok, true);
      assert.equal(healthBody.runtime, 'vercel');

      const statusRes = await fetch(`${serverlessBase}/api?__mvia_path=status`);
      assert.equal(statusRes.status, 200);
      const statusBody = (await statusRes.json()) as {
        services?: { websocket?: string };
      };
      assert.equal(statusBody.services?.websocket, 'polling');

      const loginRes = await fetch(`${serverlessBase}/api?__mvia_path=auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'nonexistent@test.edu', password: 'wrong' }),
      });
      assert.equal(loginRes.status, 401);
      const loginJson = (await loginRes.json()) as { error?: string };
      assert.ok(loginJson.error, 'JSON error response must be returned through Vercel rewrite');
    } finally {
      if (serverlessHttp) {
        await new Promise<void>((resolve) => serverlessHttp!.close(() => resolve()));
      }
      if (prevVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = prevVercel;
      if (prevDbFile === undefined) delete process.env.MVIA_DB_FILE;
      else process.env.MVIA_DB_FILE = prevDbFile;
      if (prevUploadsDir === undefined) delete process.env.MVIA_UPLOADS_DIR;
      else process.env.MVIA_UPLOADS_DIR = prevUploadsDir;
      if (prevAutoBackup === undefined) delete process.env.MVIA_DISABLE_AUTO_BACKUP;
      else process.env.MVIA_DISABLE_AUTO_BACKUP = prevAutoBackup;
    }
  });

  test('4. Clean seed has no demo users or admin123 password and blocks non-admin privilege escalation', async () => {
    // 1) Hardcoded legacy demo password 'admin123' must not log in as founder
    const legacyLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: '01000000000',
        password: 'admin123',
      }),
    });
    assert.equal(legacyLogin.status, 401);

    // 2) Registration with invalid adminCode is strictly rejected (403)
    const fakeAdminReg = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Attempt Escalation',
        email: 'escalate@test.edu',
        phone: '01777777799',
        password: 'password123',
        year: 1,
        adminCode: 'WRONG-SECRET',
        acceptedTerms: true,
      }),
    });
    assert.equal(fakeAdminReg.status, 403);

    // 3) Regular student cannot access admin endpoints or self-promote
    const studentLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'student.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(studentLogin.status, 200);
    const sToken = studentLogin.data.token;

    const activateWrong = await api('/api/account/activate-admin', {
      method: 'POST',
      token: sToken,
      body: JSON.stringify({ password: 'wrong-activation-pass' }),
    });
    assert.equal(activateWrong.status, 403);

    const profileEmailEdit = await api('/api/account/profile', {
      method: 'PATCH',
      token: sToken,
      body: JSON.stringify({ email: 'hijack@test.edu' }),
    });
    assert.equal(profileEmailEdit.status, 403);

    const createOfficial = await api('/api/admin/officials', {
      method: 'POST',
      token: sToken,
      body: JSON.stringify({ userId: 'user-founder-admin', rankId: 'rank-super-admin' }),
    });
    assert.equal(createOfficial.status, 403);

    const editRank = await api('/api/admin/ranks/rank-student-affairs', {
      method: 'PATCH',
      token: sToken,
      body: JSON.stringify({ permissions: ['manage_ranks'] }),
    });
    assert.equal(editRank.status, 403);

    const createAdminUser = await api('/api/admin/users', {
      method: 'POST',
      token: sToken,
      body: JSON.stringify({
        name: 'Rogue Admin',
        email: 'rogue@test.edu',
        phone: '01777777798',
        password: 'password123',
        year: 4,
        role: 'admin',
      }),
    });
    assert.equal(createAdminUser.status, 403);

    // 4) Seeded DB must not contain legacy fake demo students user-std-1..6
    const adminLogin = await api<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: 'admin1.sessions@test.edu',
        password: 'password123',
      }),
    });
    assert.equal(adminLogin.status, 200);

    const usersList = await api<{ users: Array<{ id: string; email?: string }> }>(
      '/api/admin/users?limit=100',
      { token: adminLogin.data.token }
    );
    assert.equal(usersList.status, 200);
    const demoIds = new Set([
      'user-std-1',
      'user-std-2',
      'user-std-3',
      'user-std-4',
      'user-std-5',
      'user-std-6',
    ]);
    assert.equal(
      usersList.data.users.some((u) => demoIds.has(u.id)),
      false,
      'Fresh seeded DB must not contain any fake demo students'
    );
  });
});

