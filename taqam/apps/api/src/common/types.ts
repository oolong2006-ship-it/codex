import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
  employeeId: string | null;
  branchId: string | null;
}

export interface JwtPayload {
  sub: string;
  companyId: string;
  role: Role;
  employeeId: string | null;
  branchId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}
