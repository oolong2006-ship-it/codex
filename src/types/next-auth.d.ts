import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      organizationId: string;
      organizationName: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    organizationId: string;
    organizationName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: UserRole;
    organizationId: string;
    organizationName: string;
  }
}
