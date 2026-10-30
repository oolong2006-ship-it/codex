/** يضيف رسالة نجاح أو خطأ إلى رابط الصفحة، فتظهر بعد إعادة التوجيه. */
export function withFlash(target: string, key: 'ok' | 'error', message: string): string {
  const [path, query = ''] = target.split('?');
  const params = new URLSearchParams(query);
  params.set(key, message);
  return `${path}?${params.toString()}`;
}

export function pathOf(target: string): string {
  return target.split('?')[0] ?? '/';
}
