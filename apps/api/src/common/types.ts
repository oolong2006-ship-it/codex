export interface AuthenticatedUser {
  id: string;
  email: string;
  organizationId: string | null;
  roles: string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
