'use server';

import { runApiAction, requireUuid } from '../../../lib/action-runner';

export async function decideExceptionAction(formData: FormData): Promise<void> {
  const id = requireUuid(String(formData.get('id') ?? ''));
  const decision = String(formData.get('decision') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  const status = String(formData.get('status') ?? 'OPEN');
  const target = `/exceptions?status=${encodeURIComponent(status)}`;
  if (decision !== 'approve' && decision !== 'reject') throw new Error('invalid decision');
  await runApiAction(
    `/v1/attendance/exceptions/${id}/${decision}`,
    { note: note || undefined },
    target,
    decision === 'approve' ? 'تم اعتماد الاستثناء.' : 'تم رفض الاستثناء.',
  );
}
