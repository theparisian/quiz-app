export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

export class FileNotFoundError extends StorageError {
  constructor(key: string) {
    super(`File not found: ${key}`);
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

export class InvalidFileKeyError extends StorageError {
  constructor(key: string, reason?: string) {
    super(reason ? `Invalid file key: ${key} (${reason})` : `Invalid file key: ${key}`);
    Object.setPrototypeOf(this, InvalidFileKeyError.prototype);
  }
}

export class NotImplementedError extends StorageError {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
