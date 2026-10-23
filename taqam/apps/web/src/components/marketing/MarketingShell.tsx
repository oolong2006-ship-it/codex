import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

/** Header + main + footer used by the home page and the (marketing) route group. */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-sand">
      <SiteHeader />
      <main id="main" className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
