import { Role } from '@prisma/client';

/** A company (tenant) user. `companyId` is always set — guaranteed centrally by the auth guards. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  employeeId: string | null;
  branchId: string | null;
  /** Set when the request uses an impersonation token issued by a platform admin. */
  impersonatedBy?: string | null;
}

/** A platform admin (role SUPER_ADMIN). Never has a company / employee. */
export interface PlatformUser {
  id: string;
  email: string;
  name: string;
  role: 'SUPER_ADMIN';
  companyId: null;
  employeeId: null;
  branchId: null;
}

export type RequestUser = AuthUser | PlatformUser;

export const isPlatformUser = (u: RequestUser | undefined | null): u is PlatformUser => !!u && u.role === 'SUPER_ADMIN';

export interface JwtPayload {
  sub: string;
  companyId: string | null;
  role: Role;
  employeeId: string | null;
  branchId: string | null;
  /** Admin user id when this is an impersonation token. */
  impersonatedBy?: string;
  /** User.tokenVersion at issue time; a password change/reset bumps it and revokes older tokens. */
  tv?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: RequestUser;
    }
  }
}
