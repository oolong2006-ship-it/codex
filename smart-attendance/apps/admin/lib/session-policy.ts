export type SessionAction = 'allow' | 'refresh' | 'login';

/**
 * قرار الوصول لصفحة: المسارات العامة مفتوحة، ومن يملك رمز وصول يمر،
 * ومن يملك رمز تحديث فقط يُجدَّد له الرمز، والباقي إلى تسجيل الدخول.
 */
export function sessionAction(input: { isPublic: boolean; hasAccess: boolean; hasRefresh: boolean }): SessionAction {
  if (input.isPublic || input.hasAccess) return 'allow';
  return input.hasRefresh ? 'refresh' : 'login';
}
