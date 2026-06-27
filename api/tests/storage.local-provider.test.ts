import { mkdtempSync } from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { LocalStorageProvider } from '../src/shared/storage/local-storage-provider.js';
import { InvalidFileKeyError } from '../src/shared/storage/errors.js';

describe('LocalStorageProvider', () => {
  it('put/get/delete/exists', async () => {
    const base = mkdtempSync(path.join(os.tmpdir(), 'ls-'));
    const p = new LocalStorageProvider(base, 'http://x/uploads');
    const { key, url } = await p.put({
      kind: 'quiz-cover',
      id: 'my-quiz',
      filename: 'x.png',
      buffer: Buffer.from([0x89, 0x50]),
      mimeType: 'image/png',
    });
    expect(url).toContain('quiz-cover');
    expect(await p.exists(key)).toBe(true);
    const got = await p.get(key);
    expect(got.buffer.length).toBe(2);
    await p.delete(key);
    expect(await p.exists(key)).toBe(false);
  });

  it('put/get video/mp4', async () => {
    const base = mkdtempSync(path.join(os.tmpdir(), 'ls-vid-'));
    const p = new LocalStorageProvider(base, 'http://x/uploads');
    const { key, url } = await p.put({
      kind: 'quiz-background',
      id: 'my-quiz',
      filename: 'file',
      buffer: Buffer.from([0x00, 0x00, 0x00]),
      mimeType: 'video/mp4',
    });
    expect(url).toContain('quiz-background');
    expect(url).toMatch(/\.mp4$/);
    const got = await p.get(key);
    expect(got.mimeType).toBe('video/mp4');
    await p.delete(key);
  });

  it('rejects bad kind', async () => {
    const base = mkdtempSync(path.join(os.tmpdir(), 'ls2-'));
    const p = new LocalStorageProvider(base, 'http://x/uploads');
    await expect(
      p.put({
        kind: 'BadKind',
        id: 'a',
        filename: 'f',
        buffer: Buffer.from([1]),
        mimeType: 'image/png',
      }),
    ).rejects.toThrow(InvalidFileKeyError);
  });
});
