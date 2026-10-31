// TypeScript interfaces mirroring docs/API_CONTRACT.md (v1).
// Owned by the dashboard engineer; other frontends may import read-only.
import type { Role } from './auth';

export type { Role };
export type ID = string;

export type NitaqatBand = 'PLATINUM' | 'HIGH_GREEN' | 'MID_GREEN' | 'LOW_GREEN' | 'RED';
export type ExpiryStatus = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'OK' | 'NONE';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type Sector = 'RESTAURANTS' | 'RETAIL' | 'CONTRACTING' | 'HEALTHCARE' | 'LOGISTICS' | 'OTHER';
export type TerminationReason =
  | 'EMPLOYER_TERMINATION' | 'CONTRACT_END' | 'RESIGNATION' | 'ARTICLE_80' | 'ARTICLE_81'
  | 'FORCE_MAJEURE' | 'FEMALE_MARRIAGE_CHILDBIRTH' | 'RETIREMENT' | 'DEATH';

// ---------- Dashboard ----------
export interface DashboardData {
  /** saudizationRate/nitaqatBand are official (Qiwa-documented Saudis); internalSaudizationRate counts every Saudi. */
  headcount: number; saudis: number; nonSaudis: number; documentedSaudis: number; saudizationRate: number; internalSaudizationRate: number; nitaqatBand: NitaqatBand;
  presentToday: number; lateToday: number; absentToday: number; onLeaveToday: number;
  pendingLeaves: number; pendingRequests: number;
  monthlyPayrollCost: number;
  expiringDocuments: { employeeId: ID; employeeName: string; type: DocumentType; expiryDate: string; status: ExpiryStatus }[];
  headcountByBranch: { branchId: ID; branchName: string; count: number; saudis: number; documentedSaudis: number; saudizationRate: number; internalSaudizationRate: number }[];
  headcountByDepartment: { departmentId: ID; name: string; count: number }[];
  payrollTrend: { period: string; gross: number; net: number }[];
  attendanceTrend: { date: string; present: number; late: number; absent: number }[];
  recentActivity: ActivityItem[];
}
export interface ActivityItem { id: ID; action: string; entity: string; createdAt: string; userName: string }

// ---------- Company & settings ----------
export interface Company {
  id: ID; nameAr: string; nameEn?: string | null; crNumber?: string | null; establishmentId?: string | null;
  gosiNumber?: string | null; vatNumber?: string | null; sector?: Sector | string | null; city?: string | null;
  iban?: string | null; bankCode?: string | null; weekendDays: number[]; payrollDay: number;
}
export interface AppUser {
  id: ID; email: string; name: string; role: Role; isActive: boolean; employeeId?: ID | null;
  lastLoginAt?: string | null; createdAt?: string;
}
export interface LeaveType { id: ID; code: string; nameAr: string; nameEn?: string | null; paid: boolean; maxDaysPerYear: number | null }
export interface Holiday { id: ID; date: string; nameAr: string; nameEn?: string | null }
export interface AuditLog { id: ID; action: string; entity: string; entityId?: string | null; userName?: string | null; createdAt: string; data?: unknown }

// ---------- Branches & departments ----------
export interface Branch {
  id: ID; nameAr: string; nameEn?: string | null; city: string; address?: string | null;
  lat: number; lng: number; radiusMeters: number; managerEmployeeId?: ID | null;
  /** saudizationRate/nitaqatBand are official (Qiwa-documented Saudis); internalSaudizationRate counts every Saudi. */
  employeesCount: number; saudis: number; documentedSaudis: number; saudizationRate: number; internalSaudizationRate: number; nitaqatBand: NitaqatBand; managerName?: string | null;
}
export interface Department { id: ID; name: string; parentId: ID | null; employeesCount: number }

// ---------- Employees ----------
export type Gender = 'MALE' | 'FEMALE';
export type EmployeeStatus = 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
export type ContractType = 'UNLIMITED' | 'FIXED';
export interface Employee {
  id: ID; employeeNumber: string; firstNameAr: string; lastNameAr: string; fullNameEn: string;
  nationality: string; isSaudi: boolean; gender: Gender; birthDate?: string | null; maritalStatus?: string | null;
  nationalId: string; idExpiry?: string | null; passportNumber?: string | null; passportExpiry?: string | null;
  phone?: string | null; email?: string | null;
  branchId?: ID | null; branch?: { id: ID; nameAr: string } | null;
  departmentId?: ID | null; department?: { id: ID; name: string } | null;
  managerId?: ID | null; manager?: { id: ID; name: string } | null;
  jobTitle: string; hireDate: string; contractType: ContractType; contractEndDate?: string | null; probationEndDate?: string | null;
  status: EmployeeStatus; terminationDate?: string | null; terminationReason?: TerminationReason | null;
  basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowances: number;
  iban?: string | null; bankCode?: string | null; gosiRegistered: boolean; hoursPerDay: number;
  /** First GOSI registration: on/after 2024-07-03 ⇒ NEW Social Insurance Law regime; null ⇒ LEGACY. */
  gosiFirstRegisteredAt?: string | null;
  /** Contract documented in Qiwa — since 15 Apr 2026 only documented Saudis count for Nitaqat. */
  qiwaDocumented?: boolean; qiwaDocumentedAt?: string | null;
  avatarColor?: string | null; createdAt: string;
}
export type DocumentType = 'IQAMA' | 'PASSPORT' | 'CONTRACT' | 'CERTIFICATE' | 'INSURANCE' | 'OTHER';
export interface EmployeeDocument {
  id: ID; employeeId?: ID; type: DocumentType; number?: string | null; issueDate?: string | null;
  expiryDate?: string | null; note?: string | null; status?: ExpiryStatus;
}
export interface LeaveBalanceSummary { entitlementPerYear: number; accrued: number; taken: number; balance: number }
export interface EmployeeDetail extends Employee {
  documents: EmployeeDocument[];
  leaveBalance?: LeaveBalanceSummary | null;
  user?: { id: ID; email: string; role: Role } | null;
}
export interface ExpiringDocument { id: ID; employeeId: ID; employeeName: string; type: DocumentType; number?: string | null; expiryDate: string; status: ExpiryStatus }
export interface OrgNode { id: ID; name: string; jobTitle: string; managerId: ID | null; branchName?: string | null }

// ---------- EOSB ----------
export interface ServiceDuration { years: number; months: number; days: number; totalYears: number; totalDays: number }
export interface EosbResult {
  service: ServiceDuration; fullAward: number; factor: number; award: number; leaveEncashment: number; total: number;
  breakdown: { labelAr: string; labelEn: string; amount: number }[]; notesAr: string[];
}

// ---------- Shifts & attendance ----------
export interface Shift { id: ID; branchId: ID; name: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; days: number[]; color: string }
export interface RosterData { employees: { id: ID; name: string }[]; assignments: { id: ID; employeeId: ID; shiftId: ID; date: string }[] }
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT' | 'ON_LEAVE' | 'INCOMPLETE' | 'OFF' | 'HOLIDAY';
export interface AttendanceRow {
  employeeId: ID; employeeName: string; branchName?: string | null; shiftName?: string | null;
  checkIn: string | null; checkOut: string | null; workedMinutes: number; lateMinutes: number; overtimeMinutes: number;
  status: AttendanceStatus; recordId: ID | null;
}
export interface AttendanceSummaryRow {
  employeeId: ID; employeeName: string; presentDays: number; lateDays: number; absentDays: number;
  lateMinutes: number; overtimeMinutes: number; workedHours: number;
}

// ---------- Leaves & requests ----------
export interface LeaveRequest {
  id: ID; employeeId: ID; employee?: { id: ID; name: string; branchName?: string | null } | null;
  leaveTypeId: ID; leaveType?: { code: string; nameAr: string; nameEn?: string | null } | null;
  startDate: string; endDate: string; days: number; reason?: string | null; status: ApprovalStatus;
  approverName?: string | null; decidedAt?: string | null; comment?: string | null; createdAt: string;
}
export interface LeaveBalance { leaveTypeId: ID; code: string; nameAr: string; nameEn?: string | null; entitlement: number | null; taken: number; balance: number | null }
export type RequestType = 'SALARY_CERTIFICATE' | 'EXPENSE_CLAIM' | 'LOAN' | 'EXIT_REENTRY' | 'ATTENDANCE_CORRECTION' | 'LETTER' | 'OTHER';
export interface EmployeeRequest {
  id: ID; employeeId: ID; employee?: { id: ID; name: string; branchName?: string | null } | null;
  type: RequestType; title: string; details?: string | null; amount?: number | null; payload?: Record<string, unknown> | null;
  status: ApprovalStatus; approverName?: string | null; decidedAt?: string | null; comment?: string | null; createdAt: string;
}

// ---------- Payroll ----------
export interface Loan {
  id: ID; employeeId: ID; employee?: { id: ID; name: string; employeeNumber?: string } | null;
  amount: number; monthlyDeduction: number; startPeriod: string; note?: string | null;
  remaining: number; status: 'ACTIVE' | 'PAID' | 'CANCELLED'; createdAt?: string;
}
export type PayrollStatus = 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'PAID';
export interface PayrollRun {
  id: ID; period: string; status: PayrollStatus; employeesCount: number; totalGross: number; totalDeductions: number;
  totalNet: number; totalGosiEmployer: number; totalEmployerCost: number; createdAt: string;
  approvedAt?: string | null; paidAt?: string | null; approvedByName?: string | null; wpsExportedAt?: string | null;
}
export interface PayLine { code: string; labelAr: string; labelEn: string; amount: number }
export interface Payslip {
  id: ID; payrollRunId: ID; period: string; employeeId: ID;
  employee: { id: ID; employeeNumber: string; name: string; branchName?: string | null; iban?: string | null; isSaudi: boolean };
  payableDays: number; earnings: PayLine[]; deductions: PayLine[]; gross: number; totalDeductions: number; net: number;
  gosiEmployee: number; gosiEmployer: number; notes: string[];
}
export interface PayrollRunDetail extends PayrollRun { payslips: Payslip[] }
/** GET /payroll/runs/:id/wps-check — Mudad pre-upload checker (spec §2). ERROR blocks «جاهز للرفع», WARNING does not. */
export type WpsIssueCode = 'INVALID_IBAN' | 'MISSING_NATIONAL_ID' | 'NON_POSITIVE_NET' | 'DUPLICATE_NATIONAL_ID' | 'EMPLOYEE_MISSING_FROM_RUN' | 'NET_MISMATCH' | 'DEDUCTION_OVER_HALF' | 'PAID_BELOW_CONTRACT' | 'LATE_PAYMENT';
export interface WpsIssue {
  code: WpsIssueCode; severity: 'ERROR' | 'WARNING'; messageAr: string;
  /** null for run-level issues (LATE_PAYMENT). */
  employeeNumber: string | null; employeeId: ID | null; employeeName: string | null;
}
export interface WpsCheck {
  period: string;
  /** Date LATE_PAYMENT is tested against: paid date; unpaid → scheduled day, or today once that has passed. */
  paymentDate: string;
  /** Paid date, else the company payroll day in the period (the date written in the WPS file). */
  scheduledPaymentDate: string;
  exportedAt: string | null; ready: boolean; errors: number; warnings: number; issues: WpsIssue[] }
export type AdjustmentType = 'BONUS' | 'COMMISSION' | 'ALLOWANCE' | 'DEDUCTION' | 'PENALTY';
export interface Adjustment {
  id: ID; employeeId: ID; employee?: { id: ID; name: string } | null; period: string; type: AdjustmentType;
  amount: number; note?: string | null; createdAt?: string;
}

// ---------- Saudization ----------
/** Official = Qiwa-documented Saudis / all active (counts for Nitaqat since 15 Apr 2026); internal = all Saudis / all active. `rate`/`band` are official. */
export interface SaudizationSummary {
  total: number; saudis: number; documentedSaudis: number; undocumentedSaudis: number;
  rate: number; officialRate: number; internalRate: number; band: NitaqatBand; marginToDrop: number; alert: boolean; hiresToNextBand: number;
}
export interface SaudizationData {
  /** BRANCH: a branch manager's figures cover their own branch only. */
  scope: 'COMPANY' | 'BRANCH';
  company: SaudizationSummary & { nonSaudis: number; nextBand: NitaqatBand | null };
  branches: (SaudizationSummary & { branchId: ID; branchName: string })[];
  undocumented: { id: ID; employeeNumber: string; name: string; branchId: ID | null; branchName: string | null }[];
  thresholds: { platinum: number; highGreen: number; midGreen: number; lowGreen: number };
}
export interface SaudizationSim { before: { rate: number; band: NitaqatBand }; after: { rate: number; band: NitaqatBand } }

// ---------- Performance ----------
export interface PerformanceCycle { id: ID; name: string; startDate: string; endDate: string; status: 'DRAFT' | 'ACTIVE' | 'CLOSED'; reviewsCount: number; completedCount: number }
export interface Goal { title: string; weight: number; score: number | null }
export interface PerformanceReview {
  id: ID; cycleId: ID; employee: { id: ID; name: string; jobTitle?: string | null; branchName?: string | null };
  reviewerName?: string | null; goals: Goal[]; overallScore: number | null; comments?: string | null; status: 'PENDING' | 'SUBMITTED';
}

// ---------- Recruitment ----------
export type CandidateStage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'OFFER' | 'HIRED' | 'REJECTED';
export interface Job {
  id: ID; title: string; branchId?: ID | null; branch?: { id: ID; nameAr: string } | null; departmentId?: ID | null;
  department?: { id: ID; name: string } | null; employmentType: string; description?: string | null;
  status: 'OPEN' | 'CLOSED'; candidatesCount: number; createdAt?: string;
}
export interface Candidate {
  id: ID; jobId: ID; name: string; email?: string | null; phone?: string | null; nationality?: string | null;
  expectedSalary?: number | null; notes?: string | null; stage: CandidateStage; createdAt?: string;
}

// ---------- Announcements & notifications ----------
export interface Announcement { id: ID; title: string; body: string; branchId?: ID | null; branch?: { id: ID; nameAr: string } | null; branchName?: string | null; authorName?: string | null; createdAt: string }
export interface AppNotification { id: ID; title: string; body?: string | null; link?: string | null; readAt: string | null; createdAt: string }

// ---------- Reports ----------
export interface HeadcountReport {
  byBranch: { branchId?: ID; branchName: string; count: number; saudis?: number }[];
  byDepartment: { departmentId?: ID; name: string; count: number }[];
  byNationality: { nationality: string; count: number }[];
  byGender: { gender: Gender | string; count: number }[];
  joinersByMonth: { period: string; count: number }[];
  leaversByMonth: { period: string; count: number }[];
}
export interface PayrollCostRow { period: string; gross: number; net: number; gosiEmployer: number; employerCost: number }
export interface AttendanceReportRow {
  branchId?: ID; branchName: string; presentDays: number; lateDays: number; absentDays: number;
  lateMinutes: number; overtimeMinutes: number; workedHours: number;
}
