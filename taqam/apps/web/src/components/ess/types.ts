// Local types for the Employee Self-Service app (mirrors docs/API_CONTRACT.md).
// Kept separate from src/lib/types.ts on purpose to avoid coupling with the dashboard.

export type ReqStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'INCOMPLETE' | 'OFF' | 'HOLIDAY';
export type RequestType = 'SALARY_CERTIFICATE' | 'EXPENSE_CLAIM' | 'LOAN' | 'EXIT_REENTRY' | 'ATTENDANCE_CORRECTION' | 'LETTER' | 'OTHER';

export interface Announcement { id: string; title: string; body: string; createdAt: string; branchId?: string | null; authorName?: string }

export interface LeaveBalanceSummary { entitlementPerYear?: number; accrued?: number; taken?: number; balance: number }

export interface MeHome {
  employee: { name: string; jobTitle?: string; branchName?: string };
  today: {
    shift: { name: string; startTime: string; endTime: string } | null;
    checkIn: string | null;
    checkOut: string | null;
    status: AttendanceStatus | string | null;
  };
  /** Contract leaves the shape open: a plain number of days or the balance summary object. */
  leaveBalance: number | LeaveBalanceSummary | null;
  /** Count (or, defensively, a list) of my pending requests. */
  pendingRequests: number | unknown[];
  lastPayslip: { id: string; period: string; net: number } | null;
  announcements: Announcement[];
  branch: { lat: number; lng: number; radiusMeters: number } | null;
}

export interface AttendanceRecord {
  date: string; checkIn: string | null; checkOut: string | null;
  workedMinutes: number; lateMinutes: number; overtimeMinutes: number;
  status: AttendanceStatus | string;
}

export interface LeaveType { id: string; code: string; nameAr: string; nameEn?: string; paid: boolean; maxDaysPerYear: number | null }
export interface LeaveBalance { leaveTypeId: string; code: string; nameAr: string; nameEn?: string; entitlement: number | null; taken: number; balance: number | null }
export interface LeaveRequest {
  id: string; leaveTypeId: string; leaveType?: { code: string; nameAr: string; nameEn?: string };
  startDate: string; endDate: string; days: number; reason?: string | null;
  status: ReqStatus; approverName?: string | null; decidedAt?: string | null; comment?: string | null; createdAt: string;
}
export interface MyLeaves { data: LeaveRequest[]; balances: LeaveBalance[] }

export interface PayslipListItem { id: string; period: string; net: number; gross: number; status: string }
export interface PayslipLine { code: string; labelAr: string; labelEn?: string; amount: number }
export interface Payslip {
  id: string; payrollRunId: string; period: string; employeeId: string;
  employee: { id: string; employeeNumber: string; name: string; branchName?: string; iban?: string; isSaudi?: boolean };
  payableDays: number; earnings: PayslipLine[]; deductions: PayslipLine[];
  gross: number; totalDeductions: number; net: number; gosiEmployee: number; gosiEmployer: number; notes?: string[];
}

export interface EmployeeRequest {
  id: string; type: RequestType; title: string; details?: string | null; amount?: number | null;
  payload?: Record<string, unknown> | null; status: ReqStatus;
  approverName?: string | null; decidedAt?: string | null; comment?: string | null; createdAt: string;
}

export interface Notification { id: string; title: string; body?: string | null; link?: string | null; readAt: string | null; createdAt: string }

export interface MyProfile {
  id: string; employeeNumber: string; firstNameAr: string; lastNameAr: string; fullNameEn?: string;
  nationality?: string; isSaudi?: boolean; gender?: 'MALE' | 'FEMALE'; birthDate?: string | null; maritalStatus?: string | null;
  nationalId?: string; idExpiry?: string | null; passportNumber?: string | null; passportExpiry?: string | null;
  phone?: string; email?: string;
  branch?: { id: string; nameAr: string } | null; department?: { id: string; name: string } | null; manager?: { id: string; name: string } | null;
  jobTitle?: string; hireDate?: string; contractType?: 'UNLIMITED' | 'FIXED'; contractEndDate?: string | null; probationEndDate?: string | null;
  status?: string; basicSalary?: number; housingAllowance?: number; transportAllowance?: number; otherAllowances?: number;
  iban?: string; bankCode?: string; avatarColor?: string | null;
}

/** Accept either a bare array or a `{ data: [] }` envelope. */
export function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (v && typeof v === 'object' && Array.isArray((v as { data?: unknown }).data)) return (v as { data: T[] }).data;
  return [];
}
