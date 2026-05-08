import { LocalStorageProvider } from './local-storage-provider.js';
import { S3StorageProvider } from './s3-storage-provider.js';
import type { StorageProvider } from './storage-provider.js';

let storageSingleton: StorageProvider | null = null;

export type { StorageProvider, PutInput, PutResult, GetResult } from './storage-provider.js';
export type { S3StorageProviderOptions } from './s3-storage-provider.js';
export {
  StorageError,
  FileNotFoundError,
  InvalidFileKeyError,
  NotImplementedError,
} from './errors.js';
export { LocalStorageProvider } from './local-storage-provider.js';
export { S3StorageProvider } from './s3-storage-provider.js';

export function resetStorageForTests(): void {
  storageSingleton = null;
}

export function getStorage(): StorageProvider {
  if (storageSingleton) return storageSingleton;

  const provider = (process.env.STORAGE_PROVIDER ?? 'local').toLowerCase();

  if (provider === 's3') {
    storageSingleton = new S3StorageProvider({
      bucket: process.env.STORAGE_S3_BUCKET ?? '',
      region: process.env.STORAGE_S3_REGION ?? '',
      accessKeyId: process.env.STORAGE_S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.STORAGE_S3_SECRET_ACCESS_KEY ?? '',
      publicUrl: process.env.STORAGE_S3_PUBLIC_URL ?? process.env.STORAGE_PUBLIC_URL ?? '',
      ...(process.env.STORAGE_S3_ENDPOINT ? { endpoint: process.env.STORAGE_S3_ENDPOINT } : {}),
    });
    return storageSingleton;
  }

  const basePath = process.env.STORAGE_LOCAL_PATH ?? './uploads';
  const publicUrl = process.env.STORAGE_PUBLIC_URL ?? 'http://localhost:3000/uploads';
  storageSingleton = new LocalStorageProvider(basePath, publicUrl);
  return storageSingleton;
}
