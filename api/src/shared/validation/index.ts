import { AppError } from '../errors/app-error.js';

/** Forme minimale d'un schéma zod, quelle que soit la copie du module zod qui l'a créé. */
interface SafeParseable<T> {
  safeParse(
    data: unknown,
  ):
    | { success: true; data: T }
    | { success: false; error: { issues: { path: (string | number)[]; message: string }[] } };
}

/**
 * Valide `data` et lève une 400 VALIDATION_ERROR en cas d'échec.
 * `safeParse` plutôt que `parse` + `instanceof ZodError` : les schémas importés de
 * `@quiz-app/validation` viennent d'une autre copie du module zod (build du paquet), et leur
 * ZodError n'était pas reconnu par `instanceof` (l'erreur ressortait en 500).
 */
export function validate<T>(schema: SafeParseable<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const message = result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
  throw new AppError(`Validation failed: ${message}`, 400, 'VALIDATION_ERROR');
}
