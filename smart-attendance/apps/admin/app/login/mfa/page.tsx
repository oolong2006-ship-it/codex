import { cookies } from 'next/headers';
import { COOKIE_MFA_SETUP } from '../../../lib/config';
import { MfaForm } from '../MfaForm';

export const dynamic = 'force-dynamic';

interface Setup {
  secret: string;
  otpauth_url: string;
}

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  const raw = (await cookies()).get(COOKIE_MFA_SETUP)?.value;
  const setup: Setup | null = mode === 'setup' && raw ? (JSON.parse(raw) as Setup) : null;

  return (
    <section className="login-card">
      <h1>التحقق الثنائي</h1>
      {setup ? (
        <>
          <p>أضف الحساب إلى تطبيق المصادقة (مثل Google Authenticator) باستخدام هذا المفتاح، ثم أدخل الرمز الذي يظهر:</p>
          <code className="secret" dir="ltr">{setup.secret}</code>
        </>
      ) : (
        <p className="muted">أدخل الرمز من تطبيق المصادقة.</p>
      )}
      <MfaForm />
    </section>
  );
}
