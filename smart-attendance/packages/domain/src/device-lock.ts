/**
 * DeviceLock — آلة الحالات (specs §C). دوال نقية؛ الخادم يفرضها، وقاعدة البيانات
 * تفرض «ارتباط ACTIVE واحد» بقيد partial unique.
 */
import type { Role } from './roles';
import { DEVICE_ADMIN_ROLES } from './roles';

export const BINDING_STATUSES = [
  'PENDING_ACTIVATION',
  'ACTIVE',
  'SUPERSEDED',
  'REVOKED',
  'SUSPENDED',
] as const;
export type BindingStatus = (typeof BINDING_STATUSES)[number];

export const CHANGE_REQUEST_STATUSES = ['OPEN', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export const CHANGE_REASONS = ['LOST', 'STOLEN', 'BROKEN', 'UPGRADE'] as const;
export type ChangeReason = (typeof CHANGE_REASONS)[number];

type Transition = { from: BindingStatus; to: BindingStatus; roles: readonly Role[] | 'system' };

/**
 * الانتقالات المسموحة. `system` = يحدث داخل تدفق معتمد (الربط الأول، أو اعتماد تغيير)
 * ولا يُستدعى مباشرة من endpoint.
 */
const TRANSITIONS: readonly Transition[] = [
  { from: 'PENDING_ACTIVATION', to: 'ACTIVE', roles: DEVICE_ADMIN_ROLES },
  { from: 'PENDING_ACTIVATION', to: 'REVOKED', roles: DEVICE_ADMIN_ROLES },
  { from: 'ACTIVE', to: 'SUPERSEDED', roles: 'system' },
  { from: 'ACTIVE', to: 'REVOKED', roles: DEVICE_ADMIN_ROLES },
  { from: 'ACTIVE', to: 'SUSPENDED', roles: DEVICE_ADMIN_ROLES },
  // specs §C: SUSPENDED → ACTIVE بقرار HR فقط.
  { from: 'SUSPENDED', to: 'ACTIVE', roles: ['hr'] },
  { from: 'SUSPENDED', to: 'REVOKED', roles: DEVICE_ADMIN_ROLES },
  // بلاغ سرقة: HR يوقف، ثم يعتمد طلب التغيير من الجهاز الجديد.
  { from: 'SUSPENDED', to: 'SUPERSEDED', roles: 'system' },
];

export function canTransitionBinding(
  from: BindingStatus,
  to: BindingStatus,
  actorRoles: readonly Role[] | 'system',
): boolean {
  const t = TRANSITIONS.find((x) => x.from === from && x.to === to);
  if (!t) return false;
  if (t.roles === 'system') return actorRoles === 'system';
  if (actorRoles === 'system') return false;
  return actorRoles.some((r) => (t.roles as readonly Role[]).includes(r));
}

/** هل يملك الموظف ارتباطًا يمنع الربط الأول ويوجب طلب تغيير؟ (F6) */
export function blocksFirstBinding(status: BindingStatus): boolean {
  return status === 'ACTIVE' || status === 'SUSPENDED' || status === 'PENDING_ACTIVATION';
}

export function isChangeRequestExpired(createdAt: Date, now: Date, ttlDays: number): boolean {
  return now.getTime() - createdAt.getTime() >= ttlDays * 24 * 60 * 60 * 1000;
}

/** رمز التفعيل: 8 خانات من أبجدية دون أحرف ملتبسة (0/O، 1/I). */
export const ACTIVATION_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const ACTIVATION_CODE_LENGTH = 8;

export function activationCodeFromBytes(bytes: Uint8Array): string {
  if (bytes.length < ACTIVATION_CODE_LENGTH) throw new Error('not enough entropy');
  let out = '';
  for (let i = 0; i < ACTIVATION_CODE_LENGTH; i++) {
    // 256 قابلة للقسمة على 32، فلا انحياز.
    out += ACTIVATION_ALPHABET[(bytes[i] as number) % ACTIVATION_ALPHABET.length];
  }
  return out;
}

export function normalizeActivationCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * القيم الافتراضية لسياسة الأجهزة كما وردت في specs §C و§D. تُنسخ إلى
 * policy_versions عند إنشاء العميل؛ الخادم يقرأ السياسة لا هذا الثابت.
 */
export const DEFAULT_DEVICE_POLICY = {
  activation_code_ttl_hours: 72,
  change_request_ttl_days: 7,
  first_device_requires_approval: false,
  same_device_rebind: 'auto' as 'auto' | 'approval',
  challenge_ttl_seconds: 60,
};
export type DevicePolicy = typeof DEFAULT_DEVICE_POLICY;
export const DEVICE_POLICY_KIND = 'device';
