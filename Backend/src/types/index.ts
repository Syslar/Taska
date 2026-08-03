import { Profile } from '@prisma/client';

// Extend Express Request interface to carry Clerk user identity + Prisma Profile
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
      profile?: Profile;
    }
  }
}

export {};
