'use client';
import { useEffect, useState } from 'react';
import clsx from 'clsx';

/**
 * Renders a ZATCA Phase-1 QR: the QR content is the base64 TLV string exactly as the API (or the demo mock) returns it
 * in `invoice.qr`. Encoded with qrcode@1.5.4 (loaded on demand), error correction M, as a data-URL PNG for printing.
 */
export function ZatcaQr({ value, size = 128, className, label }: { value: string; size?: number; className?: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    import('qrcode')
      .then((m) => (m.default ?? m).toDataURL(value, { errorCorrectionLevel: 'M', margin: 1, width: size * 2, color: { dark: '#0F2747', light: '#FFFFFF' } }))
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(null); });
    return () => { alive = false; };
  }, [value, size]);
  return (
    <span className={clsx('inline-block shrink-0 rounded-lg border border-line bg-white p-1', className)} style={{ width: size + 10, height: size + 10 }}>
      {src
        ? <img src={src} width={size} height={size} alt={label} data-testid="invoice-qr" data-qr={value} className="block h-full w-full" />
        : <span className="block h-full w-full animate-pulse rounded bg-sand" aria-hidden />}
    </span>
  );
}
