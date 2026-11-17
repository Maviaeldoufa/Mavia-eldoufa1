import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import {
  buildMigrationBundle,
  createPreMigrationBackup,
  loadJsonDatabase,
  verifyJsonIntegrity,
} from '../scripts/migrate-json-to-supabase.ts';

describe('MVIA Supabase Schema & Migration Readiness Suite', () => {
  test('1. SQL migration files exist in ordered supabase/migrations and cover all core tables with idempotent RLS', () => {
    const migrationsDir = path.resolve(process.cwd(), 'supabase', 'migrations');
    const files = fs.readdirSync(migrationsDir).sort();
    assert.deepEqual(files.slice(0, 3), [
      '001_admin_ranks_support.sql',
      '002_full_core_schema.sql',
      '003_rls_and_security.sql',
    ]);

    // Ensure duplicate SQL files were moved out of project root
    for (const sqlFile of files) {
      assert.equal(
        fs.existsSync(path.resolve(process.cwd(), sqlFile)),
        false,
        `Duplicate root SQL file should not exist outside supabase/migrations: ${sqlFile}`
      );
    }

    // Ensure migration script and package.json scripts align with scripts/ layout
    const scriptPath = path.resolve(process.cwd(), 'scripts', 'migrate-json-to-supabase.ts');
    assert.ok(fs.existsSync(scriptPath), 'scripts/migrate-json-to-supabase.ts must exist');
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf-8')) as {
      scripts?: Record<string, string>;
    };
    assert.ok(pkg.scripts?.['db:migrate:dry']?.includes('scripts/migrate-json-to-supabase.ts'));
    assert.ok(pkg.scripts?.['db:migrate']?.includes('scripts/migrate-json-to-supabase.ts'));
    assert.ok(pkg.scripts?.['db:verify']?.includes('scripts/migrate-json-to-supabase.ts'));

    const schemaSql = fs.readFileSync(
      path.join(migrationsDir, '002_full_core_schema.sql'),
      'utf-8'
    );
    const rlsSql = fs.readFileSync(
      path.join(migrationsDir, '003_rls_and_security.sql'),
      'utf-8'
    );

    const requiredTables = [
      'admin_ranks',
      'users',
      'admin_officials',
      'admin_official_contacts',
      'sessions',
      'courses',
      'course_folders',
      'summaries',
      'quizzes',
      'quiz_questions',
      'quiz_submissions',
      'announcements',
      'notifications',
      'learning_links',
      'lectures',
      'lecture_progress',
      'group_links',
      'chat_messages',
      'gpa_tables',
      'student_progress',
      'student_tasks',
      'support_tickets',
      'error_logs',
      'admin_audit_logs',
      'platform_config',
      'maintenance_state',
      'platform_analytics_summary',
      'platform_visitors',
    ];

    for (const table of requiredTables) {
      assert.ok(
        schemaSql.includes(`CREATE TABLE IF NOT EXISTS public.${table}`),
        `Missing idempotent CREATE TABLE for ${table}`
      );
      assert.ok(
        rlsSql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`),
        `Missing RLS enablement for ${table}`
      );
    }

    assert.ok(rlsSql.includes('FROM anon;'), 'Must revoke anon access on sensitive tables');
    assert.ok(
      rlsSql.includes('CREATE OR REPLACE VIEW public.leaderboard_profiles'),
      'Must provide PII-free leaderboard view'
    );
  });

  test('2. Real mafia-db.json passes integrity verification and preserves scrypt hashes & IDs', () => {
    const dbPath = path.resolve(process.cwd(), 'data', 'mafia-db.json');
    assert.ok(fs.existsSync(dbPath), 'Original data/mafia-db.json must remain intact');

    const store = loadJsonDatabase(dbPath);
    const report = verifyJsonIntegrity(store);

    assert.equal(report.valid, true, `Integrity errors: ${report.errors.join('; ')}`);
    assert.equal(
      report.summary.scryptPasswordsPreserved,
      report.summary.usersCount,
      'Every user scrypt password hash must be preserved'
    );
    assert.ok(report.summary.usersCount >= 1);
    assert.ok(report.summary.coursesCount >= 1);
    assert.ok(report.summary.adminRanksCount === 7);

    const bundle1 = buildMigrationBundle(store);
    const bundle2 = buildMigrationBundle(store);
    assert.deepEqual(bundle1.users, bundle2.users, 'Migration bundle must be deterministic');
    assert.deepEqual(bundle1.courses, bundle2.courses);
    assert.deepEqual(bundle1.quiz_questions, bundle2.quiz_questions);

    // Founder admin and primary GIS course IDs remain identical
    assert.ok(bundle1.users.some((u) => u.id === 'user-founder-admin'));
    assert.ok(bundle1.courses.some((c) => c.id === 'course-gis-101'));
    assert.ok(bundle1.admin_ranks.some((r) => r.id === 'rank-super-admin'));
  });

  test('3. Pre-migration backup creates an exact restorable snapshot without touching source DB', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvia-mig-test-'));
    try {
      const srcDbPath = path.resolve(process.cwd(), 'data', 'mafia-db.json');
      const copiedDb = path.join(tmpDir, 'mafia-db.json');
      const originalRaw = fs.readFileSync(srcDbPath, 'utf-8');
      fs.writeFileSync(copiedDb, originalRaw, 'utf-8');

      const backup = createPreMigrationBackup(copiedDb, 'test-pre-supabase');
      assert.ok(fs.existsSync(backup.backupPath));
      assert.ok(backup.filename.includes('test-pre-supabase'));
      assert.equal(fs.readFileSync(backup.backupPath, 'utf-8'), originalRaw);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('4. Frontend src/ files never import Supabase secrets or @supabase/supabase-js', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const walk = (dir: string): string[] => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) files.push(...walk(full));
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) files.push(full);
      }
      return files;
    };

    for (const file of walk(srcDir)) {
      const content = fs.readFileSync(file, 'utf-8');
      assert.ok(
        !content.includes('SUPABASE_SERVICE_ROLE_KEY'),
        `Forbidden secret reference in frontend file: ${file}`
      );
      assert.ok(
        !content.includes('@supabase/supabase-js'),
        `Supabase client should not be bundled in frontend file: ${file}`
      );
    }
  });
});
