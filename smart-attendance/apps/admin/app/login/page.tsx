import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <section className="login-card">
      <h1>تسجيل الدخول</h1>
      <p className="muted">لوحة الحضور للإدارة والمدراء.</p>
      <LoginForm />
    </section>
  );
}
