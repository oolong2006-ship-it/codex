'use server';

import { runApiAction, requireUuid } from '../../../../lib/action-runner';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TARGET = '/shifts/manage';

export async function createTemplateAction(formData: FormData): Promise<void> {
  const name = String(formData.get('name') ?? '').trim();
  const startTime = String(formData.get('start_time') ?? '');
  const endTime = String(formData.get('end_time') ?? '');
  const days = formData.getAll('day').map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  if (!name || !TIME_RE.test(startTime) || !TIME_RE.test(endTime) || !days.length) {
    throw new Error('invalid template');
  }
  await runApiAction(
    '/v1/shift-templates',
    { name, start_time: startTime, end_time: endTime, days: [...new Set(days)] },
    TARGET,
    'تم إنشاء قالب الوردية.',
  );
}

export async function assignShiftAction(formData: FormData): Promise<void> {
  const employeeId = requireUuid(String(formData.get('employee_id') ?? ''));
  const templateId = requireUuid(String(formData.get('shift_template_id') ?? ''));
  const validFrom = String(formData.get('valid_from') ?? '');
  const validTo = String(formData.get('valid_to') ?? '');
  if (!DATE_RE.test(validFrom) || (validTo && !DATE_RE.test(validTo))) throw new Error('invalid dates');
  await runApiAction(
    `/v1/employees/${employeeId}/shift-assignments`,
    { shift_template_id: templateId, valid_from: validFrom, valid_to: validTo || undefined },
    TARGET,
    'تم تعيين الوردية.',
  );
}
