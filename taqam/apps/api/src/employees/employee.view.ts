import { Prisma } from '@prisma/client';

export const employeeInclude = {
  branch: { select: { id: true, nameAr: true, nameEn: true } },
  department: { select: { id: true, name: true } },
  manager: { select: { id: true, firstNameAr: true, lastNameAr: true } },
} satisfies Prisma.EmployeeInclude;

export type EmployeeWithRel = Prisma.EmployeeGetPayload<{ include: typeof employeeInclude }>;

export const fullName = (e: { firstNameAr: string; lastNameAr: string }) => `${e.firstNameAr} ${e.lastNameAr}`;

export function employeeView(e: EmployeeWithRel) {
  const { manager, ...rest } = e;
  return {
    ...rest,
    name: fullName(e),
    manager: manager ? { id: manager.id, name: fullName(manager) } : null,
  };
}
