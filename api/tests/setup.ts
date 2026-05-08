import 'dotenv/config';
import path from 'path';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';

process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.NODE_ENV = 'test';
process.env.STORAGE_PROVIDER = 'local';
const uploadTmp = mkdtempSync(path.join(tmpdir(), 'quiz-api-upload-'));
process.env.STORAGE_LOCAL_PATH = uploadTmp;
process.env.STORAGE_PUBLIC_URL = 'http://localhost:3999/uploads';
