import 'dotenv/config';
import path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

/* Vitest : base dédiée via DATABASE_URL_TEST, ou substitution quiz_app_dev → quiz_app_test. */
{
  const dev = process.env.DATABASE_URL;
  const explicit = process.env.DATABASE_URL_TEST;
  if (explicit) {
    process.env.DATABASE_URL = explicit;
  } else if (dev?.includes('/quiz_app_dev')) {
    process.env.DATABASE_URL = dev.replace(/\/quiz_app_dev(\?|$)/, '/quiz_app_test$1');
  }
}

process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.NODE_ENV = 'test';
process.env.STORAGE_PROVIDER = 'local';
const uploadTmp = mkdtempSync(path.join(tmpdir(), 'quiz-api-upload-'));
process.env.STORAGE_LOCAL_PATH = uploadTmp;
process.env.STORAGE_PUBLIC_URL = 'http://localhost:3999/uploads';
process.env.AI_PROVIDER = 'mock';
process.env.PRIZE_HMAC_SECRET = 'test-prize-hmac-secret-32chars-min!!';
