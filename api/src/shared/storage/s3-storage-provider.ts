import { NotImplementedError } from './errors.js';
import type { GetResult, PutInput, PutResult, StorageProvider } from './storage-provider.js';

export interface S3StorageProviderOptions {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  endpoint?: string;
}

export class S3StorageProvider implements StorageProvider {
  constructor(_options: S3StorageProviderOptions) {}

  async put(_input: PutInput): Promise<PutResult> {
    throw new NotImplementedError('S3StorageProvider.put is not implemented yet');
  }

  async get(_key: string): Promise<GetResult> {
    throw new NotImplementedError('S3StorageProvider.get is not implemented yet');
  }

  async delete(_key: string): Promise<void> {
    throw new NotImplementedError('S3StorageProvider.delete is not implemented yet');
  }

  async exists(_key: string): Promise<boolean> {
    throw new NotImplementedError('S3StorageProvider.exists is not implemented yet');
  }

  getUrl(_key: string): string {
    throw new NotImplementedError('S3StorageProvider.getUrl is not implemented yet');
  }
}
