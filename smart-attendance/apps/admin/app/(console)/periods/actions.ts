'use server';

import { runApiAction } from '../../../lib/action-runner';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const TARGET = '/periods';

export async function lockPeriodAction(formData: FormData): Promise<void> {
  const month = String(formData.get('month') ?? '');
  if (!MONTH_RE.test(month)) throw new Error('invalid month');
  await runApiAction(`/v1/attendance/periods/${month}/lock`, {}, TARGET, 'تم قفل الشهر.');
}

export async function reopenPeriodAction(formData: FormData): Promise<void> {
  const month = String(formData.get('month') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (!MONTH_RE.test(month)) throw new Error('invalid month');
  await runApiAction(`/v1/attendance/periods/${month}/reopen`, { reason }, TARGET, 'تمت إعادة فتح الشهر.');
}
