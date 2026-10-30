'use server';

import { requireUuid, runApiAction } from '../../../lib/action-runner';

const TARGET = '/devices';

export async function decideChangeAction(formData: FormData): Promise<void> {
  const id = requireUuid(String(formData.get('id') ?? ''));
  const decision = String(formData.get('decision') ?? '');
  if (decision !== 'approve' && decision !== 'reject') throw new Error('invalid decision');
  await runApiAction(
    `/v1/devices/change-requests/${id}/${decision}`,
    {},
    TARGET,
    decision === 'approve' ? 'تم اعتماد تغيير الجهاز.' : 'تم رفض طلب تغيير الجهاز.',
  );
}

export async function bindingAction(formData: FormData): Promise<void> {
  const id = requireUuid(String(formData.get('id') ?? ''));
  const action = String(formData.get('action') ?? '');
  if (action !== 'suspend' && action !== 'reactivate') throw new Error('invalid action');
  await runApiAction(
    `/v1/devices/bindings/${id}/${action}`,
    {},
    TARGET,
    action === 'suspend' ? 'تم إيقاف الجهاز.' : 'تمت إعادة تفعيل الجهاز.',
  );
}
