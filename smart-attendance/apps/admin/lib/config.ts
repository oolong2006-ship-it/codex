/** إعدادات الواجهة. الأسرار لا تُكتب هنا؛ العنوان يأتي من البيئة. */
export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

export const COOKIE_ACCESS = 'sa_access';
export const COOKIE_REFRESH = 'sa_refresh';
/** رمز MFA المؤقت بين كلمة المرور والرمز الزمني. */
export const COOKIE_MFA = 'sa_mfa';
/** سر TOTP يُعرض مرة واحدة عند التفعيل الأول. */
export const COOKIE_MFA_SETUP = 'sa_mfa_setup';

export const DEFAULT_TIMEZONE = 'Asia/Riyadh';
