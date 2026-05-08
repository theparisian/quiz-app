import type { UserRole } from '@quiz-app/types';

declare module 'express-serve-static-core' {
  interface Request {
    user?:
      | {
          id: bigint;
          email: string | null;
          displayName: string | null;
          role: UserRole;
          cinemaId: bigint | null;
        }
      | undefined;
  }
}

export {};
