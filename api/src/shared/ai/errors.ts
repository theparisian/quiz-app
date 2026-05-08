export class AiError extends Error {
  public readonly code: string;
  public readonly statusHint?: number;

  constructor(message: string, code: string, statusHint?: number) {
    super(message);
    this.code = code;
    if (statusHint !== undefined) this.statusHint = statusHint;
    Object.setPrototypeOf(this, AiError.prototype);
  }
}

export class AiTimeoutError extends AiError {
  constructor(message = 'AI request timed out') {
    super(message, 'AI_TIMEOUT');
    Object.setPrototypeOf(this, AiTimeoutError.prototype);
  }
}

export class AiRefusalError extends AiError {
  constructor(message = 'Model refused to generate content') {
    super(message, 'AI_REFUSAL');
    Object.setPrototypeOf(this, AiRefusalError.prototype);
  }
}

export class AiInvalidOutputError extends AiError {
  public readonly details: unknown;

  constructor(message: string, details: unknown) {
    super(message, 'AI_INVALID_OUTPUT');
    this.details = details;
    Object.setPrototypeOf(this, AiInvalidOutputError.prototype);
  }
}
