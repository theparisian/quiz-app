import type { UserRole } from '@quiz-app/types';
import type { Server as SocketIoServer } from 'socket.io';

declare module 'express-serve-static-core' {
  interface Application {
    get(name: 'io'): SocketIoServer | undefined;
    set(name: 'io', value: SocketIoServer): this;
  }

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
    nuc?:
      | {
          id: bigint;
          screenId: bigint;
        }
      | undefined;
  }
}

export {};
