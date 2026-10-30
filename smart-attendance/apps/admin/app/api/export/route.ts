import { NextRequest, NextResponse } from 'next/server';
import { apiRequest, toApiError } from '../../../lib/api-client';
import { COOKIE_ACCESS } from '../../../lib/config';

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function jsonError(status: number, code: string, messageAr: string) {
  return NextResponse.json({ error: { code, message_ar: messageAr, message_en: code } }, { status });
}

/** تنزيل CSV من الخادم بتوكن الجلسة. النوع والمعاملات يُتحقق منها قبل الإرسال. */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_ACCESS)?.value;
  if (!token) return jsonError(401, 'AUTH_UNAUTHENTICATED', 'سجّل الدخول للمتابعة.');

  const params = req.nextUrl.searchParams;
  const kind = params.get('kind');
  let path: string;
  let query: Record<string, string | undefined>;

  if (kind === 'shifts') {
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return jsonError(400, 'VALIDATION_FAILED', 'تاريخ البداية والنهاية غير صالح.');
    path = '/v1/attendance/shift-report';
    query = { from, to, employee_id: params.get('employee_id') ?? undefined, format: 'csv' };
  } else if (kind === 'attendance') {
    const month = params.get('month') ?? '';
    if (!MONTH_RE.test(month)) return jsonError(400, 'VALIDATION_FAILED', 'الشهر غير صالح.');
    path = '/v1/attendance/export.csv';
    query = { month };
  } else {
    return jsonError(400, 'VALIDATION_FAILED', 'نوع التصدير غير معروف.');
  }

  const res = await apiRequest(path, { token, query });
  if (!res.ok) {
    const error = await toApiError(res);
    return jsonError(error.status, error.code, error.messageAr);
  }
  return new NextResponse(res.body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': res.headers.get('content-disposition') ?? 'attachment',
      'cache-control': 'no-store',
    },
  });
}
