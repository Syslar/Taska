// Extend Express Request interface to carry Clerk user identity + Profile
declare global {
  namespace Express {
    interface Request {
      user?: { id: string };
      profile?: any;
    }
  }
}

export {};
