import type { StorageProvider } from '../storage/storage-provider.js';
import { sanitizeSvg } from './svg-sanitizer.js';

export { createUploadMiddleware } from './multer-factory.js';
export { sanitizeSvg } from './svg-sanitizer.js';

export interface UploadedFileShape {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export async function uploadFile(params: {
  kind: string;
  id: string;
  file: UploadedFileShape;
  storage: StorageProvider;
}): Promise<{ key: string; url: string }> {
  const mimeType = params.file.mimetype;
  let buffer = params.file.buffer;
  if (mimeType === 'image/svg+xml') {
    buffer = sanitizeSvg(buffer);
  }
  return params.storage.put({
    kind: params.kind,
    id: params.id,
    filename: 'file',
    buffer,
    mimeType,
  });
}
