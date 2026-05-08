import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { FileNotFoundError, InvalidFileKeyError } from './errors.js';
import type { GetResult, PutInput, PutResult, StorageProvider } from './storage-provider.js';

const KIND_ID_SEGMENT = /^[a-z0-9-]+$/;
const FILENAME_SAFE = /^[a-zA-Z0-9._-]+$/;

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
};

function validateKeySegments(kind: string, id: string, filename: string): void {
  if (!KIND_ID_SEGMENT.test(kind)) {
    throw new InvalidFileKeyError(kind, 'invalid kind');
  }
  if (!KIND_ID_SEGMENT.test(id)) {
    throw new InvalidFileKeyError(id, 'invalid id');
  }
  if (!FILENAME_SAFE.test(filename)) {
    throw new InvalidFileKeyError(filename, 'invalid filename');
  }
}

function assertLogicalKeySafe(key: string): void {
  if (key.startsWith('/') || key.startsWith('\\') || key.includes('..')) {
    throw new InvalidFileKeyError(key, 'path traversal');
  }
}

function resolveUnderBase(basePath: string, segments: string[]): string {
  const resolvedBase = path.resolve(basePath);
  const target = path.resolve(resolvedBase, ...segments);
  const relative = path.relative(resolvedBase, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new InvalidFileKeyError(segments.join('/'), 'escapes base path');
  }
  return target;
}

export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly basePath: string,
    private readonly publicUrlBase: string,
  ) {}

  async put(input: PutInput): Promise<PutResult> {
    validateKeySegments(input.kind, input.id, input.filename);
    const ext = MIME_EXT[input.mimeType];
    if (!ext) {
      throw new InvalidFileKeyError(input.mimeType, 'unsupported mime type');
    }

    const fileBase = `${randomUUID()}${ext}`;
    const dirSegments = [input.kind, input.id];
    const dirPath = resolveUnderBase(this.basePath, dirSegments);
    await fs.mkdir(dirPath, { recursive: true });

    const key = [...dirSegments, fileBase].join('/');
    assertLogicalKeySafe(key);

    const filePath = resolveUnderBase(this.basePath, [...dirSegments, fileBase]);
    await fs.writeFile(filePath, input.buffer);

    return { key, url: this.urlForKey(key) };
  }

  async get(key: string): Promise<GetResult> {
    assertLogicalKeySafe(key);
    const segments = key.split('/');
    if (segments.length < 3) {
      throw new InvalidFileKeyError(key, 'key too short');
    }
    const filePath = resolveUnderBase(this.basePath, segments);
    try {
      const buffer = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeType =
        ext === '.png'
          ? 'image/png'
          : ext === '.jpg' || ext === '.jpeg'
            ? 'image/jpeg'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.svg'
                ? 'image/svg+xml'
                : 'application/octet-stream';
      return { buffer, mimeType };
    } catch (e) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        (e as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        throw new FileNotFoundError(key);
      }
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    assertLogicalKeySafe(key);
    const segments = key.split('/');
    if (segments.length < 3) {
      throw new InvalidFileKeyError(key, 'key too short');
    }
    const filePath = resolveUnderBase(this.basePath, segments);
    try {
      await fs.unlink(filePath);
    } catch (e) {
      if (
        e &&
        typeof e === 'object' &&
        'code' in e &&
        (e as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return;
      }
      throw e;
    }
  }

  async exists(key: string): Promise<boolean> {
    assertLogicalKeySafe(key);
    const segments = key.split('/');
    if (segments.length < 3) return false;
    try {
      const filePath = resolveUnderBase(this.basePath, segments);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getUrl(key: string): string {
    assertLogicalKeySafe(key);
    return this.urlForKey(key);
  }

  private urlForKey(key: string): string {
    const base = this.publicUrlBase.replace(/\/+$/, '');
    const encoded = key
      .split('/')
      .map((s) => encodeURIComponent(s))
      .join('/');
    return `${base}/${encoded}`;
  }
}
