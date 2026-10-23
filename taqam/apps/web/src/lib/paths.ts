/** Demo / static-hosting helpers (GitHub Pages serves the demo under a sub-path such as /codex). */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === '1';

/** Base path the app is served under. Only applied in demo (static export) builds. */
export const BASE_PATH = IS_DEMO ? (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/+$/, '') : '';

/** Prefix an absolute app path ("/login") with the base path for raw URLs (window.location, <a>, fetch). next/link & router.push add it themselves. */
export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith('/') || path.startsWith('//')) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)) return path;
  return `${BASE_PATH}${path}`;
}

/** ESS payslip detail link. The static demo export cannot pre-render every payslip id, so it uses a query-string route. */
export function payslipHref(id: string): string {
  return IS_DEMO ? `/me/payslips/view?id=${encodeURIComponent(id)}` : `/me/payslips/${id}`;
}
