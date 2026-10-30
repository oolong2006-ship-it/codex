import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { serverApi, messageOf } from './server-api';
import { pathOf, withFlash } from './flash';

/**
 * ينفذ طلب تعديل على الخادم، ثم يعيد التوجيه إلى الصفحة نفسها برسالة نجاح أو خطأ.
 * الخادم هو صاحب القرار؛ الواجهة لا تُظهر نجاحًا قبل رده.
 */
export async function runApiAction(path: string, body: unknown, target: string, okMessage: string): Promise<never> {
  try {
    await serverApi(path, { method: 'POST', body });
  } catch (error) {
    redirect(withFlash(target, 'error', messageOf(error)));
  }
  revalidatePath(pathOf(target));
  redirect(withFlash(target, 'ok', okMessage));
}

export function requireUuid(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid identifier');
  }
  return value;
}
