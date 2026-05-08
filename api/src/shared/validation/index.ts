import { type ZodType, type ZodTypeDef, ZodError } from 'zod';
import { AppError } from '../errors/app-error.js';

export function validate<Output, Def extends ZodTypeDef, Input>(
  schema: ZodType<Output, Def, Input>,
  data: unknown,
): Output {
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
