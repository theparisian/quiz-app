export interface PutInput {
  kind: string;
  id: string;
  filename: string;
  buffer: Buffer;
  mimeType: string;
}

export interface PutResult {
  key: string;
  url: string;
}

export interface GetResult {
  buffer: Buffer;
  mimeType: string;
}

export interface StorageProvider {
  put(input: PutInput): Promise<PutResult>;
  get(key: string): Promise<GetResult>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  getUrl(key: string): string;
}
