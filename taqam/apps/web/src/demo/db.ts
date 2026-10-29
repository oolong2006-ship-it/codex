/** In-memory demo database (mirrors apps/api/prisma/schema.prisma), persisted to localStorage. */
import { DEFAULT_BILLING, DEFAULT_REMINDERS, type BillingSettings, type ReminderSettings } from '@/lib/billing';

export type Role = 'OWNER' | 'HR_ADMIN' | 'PAYROLL' | 'BRANCH_MANAGER' | 'EMPLOYEE' | 'SUPER_ADMIN';
export type CompanyStatus = 'PENDING' | 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type Plan = 'ESSENTIALS' | 'GROWTH' | 'ENTERPRISE';
export type BillingCycle = 'MONTHLY' | 'ANNUAL';
export type CompanyEventType = 'REGISTERED' | 'ACTIVATED' | 'SUSPENDED' | 'REACTIVATED' | 'PLAN_CHANGED' | 'EXTENDED' | 'NOTE' | 'IMPERSONATED' | 'EXPIRED' | 'DELETED'
  | 'INVOICE_ISSUED' | 'INVOICE_PAID' | 'INVOICE_VOIDED' | 'REMINDER_SENT';
export type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'LOST';
export type Approval = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export interface Company {
  id: string; nameAr: string; nameEn: string | null; crNumber: string | null; establishmentId: string | null; gosiNumber: string | null;
  vatNumber: string | null; sector: string | null; city: string | null; iban: string | null; bankCode: string | null;
  weekendDays: number[]; payrollDay: number; employeesCount: number | null; createdAt: string; updatedAt: string;
  // platform lifecycle (docs/ADMIN_PORTAL.md)
  status: CompanyStatus; plan: Plan; billingCycle: BillingCycle; maxEmployees: number | null; pricePerEmployee: number | null;
  trialEndsAt: string | null; subscriptionEndsAt: string | null; activatedAt: string | null; suspendedAt: string | null;
  suspensionReason: string | null; adminNotes: string | null; lastActivityAt: string | null;
}
export interface Branch {
  id: string; companyId: string; nameAr: string; nameEn: string | null; city: string; address: string | null; lat: number; lng: number;
  radiusMeters: number; managerEmployeeId: string | null; createdAt: string; updatedAt: string;
}
export interface Department { id: string; companyId: string; name: string; parentId: string | null; createdAt: string }
export interface User {
  id: string; companyId: string; email: string; password: string; name: string; role: Role; employeeId: string | null;
  isActive: boolean; lastLoginAt: string | null; createdAt: string; updatedAt: string; phone?: string | null;
}
/** Platform SUPER_ADMIN account (companyId/employeeId are always null for these). */
export interface PlatformAdmin { id: string; email: string; password: string; name: string; isActive: boolean; lastLoginAt: string | null; createdAt: string; updatedAt: string }
export interface CompanyEvent {
  id: string; companyId: string; companyName: string | null; type: CompanyEventType; fromStatus: CompanyStatus | null; toStatus: CompanyStatus | null;
  data: Record<string, unknown> | null; adminId: string | null; adminName: string | null; createdAt: string;
}
export interface PlatformSettings {
  requireApproval: boolean; trialDays: number; prices: Record<Plan, number | null>; annualDiscount: number;
  billing: BillingSettings; reminders: ReminderSettings;
}
export const DEFAULT_SETTINGS: PlatformSettings = {
  requireApproval: true, trialDays: 14, prices: { ESSENTIALS: 19, GROWTH: 29, ENTERPRISE: null }, annualDiscount: 0.15,
  billing: DEFAULT_BILLING, reminders: DEFAULT_REMINDERS,
};
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'VOID';
export type PaymentMethod = 'BANK_TRANSFER' | 'CARD' | 'CASH' | 'OTHER';
/** Platform → subscriber invoice (docs/ADMIN_PORTAL.md v2). `overdue` is derived in the views, never stored. */
export interface Invoice {
  id: string; number: string; companyId: string; companyName: string; status: InvoiceStatus; plan: Plan; billingCycle: BillingCycle;
  periodStart: string; periodEnd: string; months: number; employees: number; unitPrice: number;
  subtotal: number; discountRate: number; discount: number; taxable: number; vatRate: number; vat: number; total: number;
  issueDate: string; dueDate: string; paidAt: string | null; paymentMethod: PaymentMethod | null; paymentRef: string | null;
  notes: string | null; voidReason: string | null; createdByName: string | null; createdAt: string; updatedAt: string;
}
export type EmailType = 'TRIAL_ENDING' | 'SUBSCRIPTION_ENDING' | 'EXPIRED' | 'INVOICE_ISSUED' | 'PAYMENT_RECEIVED' | 'INVOICE_OVERDUE' | 'MANUAL_REMINDER';
/** Outbox entry. The demo never sends mail: status is always LOGGED. Kept when a company is deleted. */
export interface EmailLog {
  id: string; companyId: string | null; to: string; subject: string; body: string; type: EmailType; status: 'SENT' | 'FAILED' | 'LOGGED';
  error: string | null; dedupeKey: string | null; createdAt: string;
}
export interface Employee {
  id: string; companyId: string; employeeNumber: string; firstNameAr: string; lastNameAr: string; fullNameEn: string | null;
  nationality: string; isSaudi: boolean; gender: 'MALE' | 'FEMALE'; birthDate: string | null; maritalStatus: string | null;
  nationalId: string; idExpiry: string | null; passportNumber: string | null; passportExpiry: string | null; phone: string | null;
  email: string | null; branchId: string | null; departmentId: string | null; managerId: string | null; jobTitle: string | null;
  hireDate: string; contractType: 'UNLIMITED' | 'FIXED'; contractEndDate: string | null; probationEndDate: string | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED'; terminationDate: string | null; terminationReason: string | null;
  basicSalary: number; housingAllowance: number; transportAllowance: number; otherAllowances: number; iban: string | null;
  bankCode: string | null; gosiRegistered: boolean; hoursPerDay: number; avatarColor: string; annualLeaveCarryOver: number;
  createdAt: string; updatedAt: string;
}
export interface EmployeeDocument {
  id: string; companyId: string; employeeId: string; type: string; number: string | null; issueDate: string | null;
  expiryDate: string | null; note: string | null; createdAt: string;
}
export interface Shift {
  id: string; companyId: string; branchId: string; name: string; startTime: string; endTime: string; breakMinutes: number;
  graceMinutes: number; days: number[]; color: string; createdAt: string;
}
export interface ShiftAssignment { id: string; companyId: string; employeeId: string; shiftId: string; date: string }
export interface AttendanceRecord {
  id: string; companyId: string; employeeId: string; date: string; shiftId: string | null; checkIn: string | null; checkOut: string | null;
  checkInLat: number | null; checkInLng: number | null; checkOutLat: number | null; checkOutLng: number | null;
  workedMinutes: number; lateMinutes: number; earlyLeaveMinutes: number; overtimeMinutes: number; status: string; source: string;
  note: string | null; createdAt: string; updatedAt: string;
}
export interface LeaveType { id: string; companyId: string; code: string; nameAr: string; nameEn: string; paid: boolean; maxDaysPerYear: number | null; createdAt: string }
export interface LeaveRequest {
  id: string; companyId: string; employeeId: string; leaveTypeId: string; startDate: string; endDate: string; days: number;
  reason: string | null; status: Approval; approverId: string | null; approverName: string | null; decidedAt: string | null;
  comment: string | null; createdAt: string;
}
export interface EmployeeRequest {
  id: string; companyId: string; employeeId: string; type: string; title: string; details: string | null; amount: number | null;
  payload: Record<string, unknown> | null; status: Approval; approverId: string | null; approverName: string | null;
  decidedAt: string | null; comment: string | null; createdAt: string;
}
export interface Loan {
  id: string; companyId: string; employeeId: string; amount: number; monthlyDeduction: number; remaining: number; startPeriod: string;
  status: 'ACTIVE' | 'PAID' | 'CANCELLED'; note: string | null; requestId: string | null; createdAt: string; updatedAt: string;
}
export interface PayrollRun {
  id: string; companyId: string; period: string; status: 'DRAFT' | 'CALCULATED' | 'APPROVED' | 'PAID'; employeesCount: number;
  totalGross: number; totalDeductions: number; totalNet: number; totalGosiEmployer: number; totalEmployerCost: number;
  calculatedAt: string | null; approvedAt: string | null; approvedById: string | null; approvedByName: string | null;
  paidAt: string | null; createdAt: string; updatedAt: string;
}
export interface PayLine { code: string; labelAr: string; labelEn: string; amount: number }
export interface Payslip {
  id: string; companyId: string; payrollRunId: string; employeeId: string; period: string; payableDays: number;
  earnings: PayLine[]; deductions: PayLine[]; gross: number; totalDeductions: number; net: number; gosiEmployee: number;
  gosiEmployer: number; employerCost: number; loanDeductions: { loanId: string; amount: number }[]; inputs: unknown;
  notes: string[]; createdAt: string;
}
export interface PayrollAdjustment {
  id: string; companyId: string; employeeId: string; period: string; type: 'BONUS' | 'COMMISSION' | 'ALLOWANCE' | 'DEDUCTION' | 'PENALTY';
  amount: number; note: string | null; createdById: string | null; createdAt: string;
}
export interface PublicHoliday { id: string; companyId: string; date: string; nameAr: string; nameEn: string | null; createdAt: string }
export interface Announcement {
  id: string; companyId: string; title: string; body: string; branchId: string | null; authorId: string | null; authorName: string | null; createdAt: string;
}
export interface Notification {
  id: string; companyId: string; userId: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string;
}
export interface AuditLog {
  id: string; companyId: string; userId: string | null; userName: string | null; action: string; entity: string; entityId: string | null;
  data: unknown; createdAt: string;
}
export interface ReviewCycle { id: string; companyId: string; name: string; startDate: string; endDate: string; status: 'DRAFT' | 'ACTIVE' | 'CLOSED'; createdAt: string }
export interface Goal { title: string; weight: number; score: number | null }
export interface PerformanceReview {
  id: string; companyId: string; cycleId: string; employeeId: string; reviewerId: string | null; goals: Goal[]; overallScore: number | null;
  comments: string | null; status: 'PENDING' | 'SUBMITTED'; submittedAt: string | null; createdAt: string; updatedAt: string;
}
export interface JobOpening {
  id: string; companyId: string; title: string; branchId: string | null; departmentId: string | null; employmentType: string;
  description: string | null; status: 'OPEN' | 'CLOSED'; createdAt: string; updatedAt: string;
}
export interface Candidate {
  id: string; companyId: string; jobId: string; name: string; email: string | null; phone: string | null; nationality: string | null;
  expectedSalary: number | null; notes: string | null; stage: string; createdAt: string; updatedAt: string;
}
export interface Lead {
  id: string; name: string; company: string; email: string; phone: string; employeesCount: number | null; sector: string | null; message: string | null;
  status: LeadStatus; notes: string | null; createdAt: string; updatedAt: string;
}

export interface DB {
  version: number;
  seededOn: string;
  seq: number;
  newEmployeeUsed: number;
  jobUsed: number;
  companies: Company[];
  branches: Branch[];
  departments: Department[];
  users: User[];
  employees: Employee[];
  documents: EmployeeDocument[];
  shifts: Shift[];
  assignments: ShiftAssignment[];
  attendance: AttendanceRecord[];
  leaveTypes: LeaveType[];
  leaves: LeaveRequest[];
  requests: EmployeeRequest[];
  loans: Loan[];
  runs: PayrollRun[];
  payslips: Payslip[];
  adjustments: PayrollAdjustment[];
  holidays: PublicHoliday[];
  announcements: Announcement[];
  notifications: Notification[];
  audit: AuditLog[];
  cycles: ReviewCycle[];
  reviews: PerformanceReview[];
  jobs: JobOpening[];
  candidates: Candidate[];
  leads: Lead[];
  admins: PlatformAdmin[];
  companyEvents: CompanyEvent[];
  settings: PlatformSettings;
  invoices: Invoice[];
  emails: EmailLog[];
  /** Riyadh day the reminder job last ran (it runs lazily when /admin/overview loads, once per demo day). */
  remindersRunOn: string | null;
}

export const STORAGE_KEY = 'taqam.demo.v2';
export const DB_VERSION = 6;
/** Seeded data is relative to "today"; a snapshot older than this is re-seeded so attendance and payroll stay current. */
export const MAX_AGE_DAYS = 7;

export function emptyDb(seededOn: string): DB {
  return {
    version: DB_VERSION, seededOn, seq: 0, newEmployeeUsed: 0, jobUsed: 0,
    companies: [], branches: [], departments: [], users: [], employees: [], documents: [], shifts: [], assignments: [], attendance: [],
    leaveTypes: [], leaves: [], requests: [], loans: [], runs: [], payslips: [], adjustments: [], holidays: [], announcements: [],
    notifications: [], audit: [], cycles: [], reviews: [], jobs: [], candidates: [], leads: [],
    admins: [], companyEvents: [], settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), invoices: [], emails: [], remindersRunOn: null,
  };
}

/** Sequential id with a readable prefix ("lv-0042"). */
export function nextId(db: DB, prefix: string): string {
  db.seq += 1;
  return `${prefix}-${db.seq.toString(36).padStart(4, '0')}`;
}

export function loadDb(): DB | null {
  try {
    window.localStorage.removeItem('taqam.demo.v1'); // pre-admin-portal snapshot: free the space, it is never read again
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const db = JSON.parse(raw) as DB;
    return db && db.version === DB_VERSION ? db : null;
  } catch {
    return null;
  }
}

export function saveDb(db: DB) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* quota exceeded or storage unavailable — keep working in memory */
  }
}

export function clearDb() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem('taqam.demo.v1');
  } catch {
    /* storage unavailable */
  }
}
