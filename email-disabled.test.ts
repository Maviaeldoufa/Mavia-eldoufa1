import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, test } from 'node:test';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mvia-email-flag-'));
process.env.MVIA_DB_FILE = path.join(tmpDir, 'db.json');
process.env.MVIA_UPLOADS_DIR = path.join(tmpDir, 'uploads');
process.env.MVIA_DISABLE_AUTO_BACKUP = '1';

const { getEmailDeliveryConfig } = await import('../server/db.ts');

describe('MVIA Email Feature Flag (EMAIL_ENABLED)', () => {
  const prevEnabled = process.env.EMAIL_ENABLED;
  const prevKey = process.env.RESEND_API_KEY;
  const prevFrom = process.env.EMAIL_FROM;

  after(() => {
    if (prevEnabled === undefined) delete process.env.EMAIL_ENABLED;
    else process.env.EMAIL_ENABLED = prevEnabled;

    if (prevKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = prevKey;

    if (prevFrom === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = prevFrom;

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('1. Email delivery remains disabled when EMAIL_ENABLED=false even if Resend vars exist', () => {
    process.env.EMAIL_ENABLED = 'false';
    process.env.RESEND_API_KEY = 're_dummy_key_for_test';
    process.env.EMAIL_FROM = 'MVIA <noreply@mvia.edu>';

    const cfg = getEmailDeliveryConfig();
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.apiKey, '');
    assert.equal(cfg.fromEmail, '');
  });

  test('2. Email delivery defaults to disabled when EMAIL_ENABLED and Resend vars are unset', () => {
    delete process.env.EMAIL_ENABLED;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const cfg = getEmailDeliveryConfig();
    assert.equal(cfg.enabled, false);
  });

  test('3. Email delivery can be re-enabled cleanly via EMAIL_ENABLED=true with valid Resend config', () => {
    process.env.EMAIL_ENABLED = 'true';
    process.env.RESEND_API_KEY = 're_dummy_key_for_test';
    process.env.EMAIL_FROM = 'MVIA <noreply@mvia.edu>';

    const cfg = getEmailDeliveryConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.apiKey, 're_dummy_key_for_test');
    assert.equal(cfg.fromEmail, 'MVIA <noreply@mvia.edu>');
  });

  test('4. Platform does not require RESEND_API_KEY or EMAIL_FROM even if EMAIL_ENABLED=true', () => {
    process.env.EMAIL_ENABLED = 'true';
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    const cfg = getEmailDeliveryConfig();
    assert.equal(cfg.enabled, false);
  });
});
