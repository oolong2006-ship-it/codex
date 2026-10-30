import type { ReactNode } from 'react';

export function Card({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="card">
      <div className="muted">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ colSpan, children = 'لا توجد بيانات.' }: { colSpan: number; children?: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="muted">
        {children}
      </td>
    </tr>
  );
}

const TONES: Record<string, string> = {
  PRESENT: 'ok',
  VERIFIED: 'ok',
  APPROVED: 'ok',
  ACTIVE: 'ok',
  CLOSED: 'ok',
  LATE: 'warn',
  EARLY_LEAVE: 'warn',
  PENDING_REVIEW: 'warn',
  OPEN: 'warn',
  NOT_DUE: '',
  ABSENT: 'danger',
  INCOMPLETE: 'danger',
  REJECTED: 'danger',
  LOCKED: 'danger',
  SUSPENDED: 'danger',
};

export function Pill({ value, label }: { value: string | null | undefined; label: string }) {
  const tone = value ? TONES[value] ?? '' : '';
  return <span className={`pill ${tone}`}>{label}</span>;
}

export function Notice({ tone, children }: { tone: 'error' | 'ok'; children: ReactNode }) {
  return <p className={`notice ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>;
}

/** رسالة الخطأ تأتي في الرابط بعد عملية فاشلة، فتُعرض في الصفحة نفسها. */
export function FlashFromQuery({ error, ok }: { error?: string; ok?: string }) {
  return (
    <>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice tone="ok">{ok}</Notice> : null}
    </>
  );
}
