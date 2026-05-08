import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new AppError(`Validation failed: ${message}`, 400, 'VALIDATION_ERROR');
    }
    throw error;
  }
}
