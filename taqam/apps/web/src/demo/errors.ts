/** HTTP-shaped errors thrown by the demo handlers (same bodies as apps/api's HttpExceptionFilter). */
const DEFAULT_AR: Record<number, string> = {
  400: 'طلب غير صالح',
  401: 'يجب تسجيل الدخول',
  403: 'ليس لديك صلاحية لهذا الإجراء',
  404: 'العنصر غير موجود',
  409: 'تعارض مع بيانات موجودة',
  500: 'حدث خطأ غير متوقع',
};

export class HttpError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(String(body.message ?? status));
  }
  toJSON() {
    const b = { ...this.body };
    if (!b.messageAr && DEFAULT_AR[this.status]) b.messageAr = DEFAULT_AR[this.status];
    return { statusCode: this.status, ...b };
  }
}

export const badRequest = (message: string, messageAr?: string, extra: Record<string, unknown> = {}) => new HttpError(400, { message, messageAr, ...extra });
export const unauthorized = (message: string, messageAr: string) => new HttpError(401, { message, messageAr });
export const notFound = (entity = 'Resource', messageAr = 'العنصر غير موجود') => new HttpError(404, { message: `${entity} not found`, messageAr });
export const conflict = (message: string, messageAr?: string) => new HttpError(409, { message, messageAr });
export const forbidden = (message = 'Forbidden', messageAr = 'ليس لديك صلاحية لهذا الإجراء') => new HttpError(403, { message, messageAr });
/** 403 carrying a machine-readable `code` (COMPANY_PENDING, COMPANY_SUSPENDED, COMPANY_EXPIRED, SEAT_LIMIT…). */
export const forbiddenCode = (code: string, message: string, messageAr: string) => new HttpError(403, { message, messageAr, code });
