import { revalidatePath } from "next/cache";
import { requireDashboardActor, getLang } from "@/server/web";
import { enableIntegration, getIntegration } from "@/server/integrations/pos";
import { requirePermission } from "@/server/actor";
import { PERMISSIONS } from "@/server/rbac";
import { env } from "@/server/env";
import { t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "Integrations" };

async function enableFoodics() {
  "use server";
  await enableIntegration(await requireDashboardActor(), "foodics");
  revalidatePath("/dashboard/integrations");
}

export default async function IntegrationsPage() {
  const actor = await requireDashboardActor();
  requirePermission(actor, PERMISSIONS.INTEGRATION_MANAGE);
  const lang = await getLang();
  const foodics = await getIntegration(actor, "foodics");
  return (
    <>
      <PageHeader title={t(lang, "integrations.title")} />
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-xl">
            <h2 className="font-semibold">{t(lang, "integrations.foodics")}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-espresso-700">{t(lang, "integrations.foodicsBody")}</p>
          </div>
          {foodics?.active ? (
            <span className="pill bg-mint-50 text-mint-600">{t(lang, "integrations.enabled")}</span>
          ) : (
            <form action={enableFoodics}><button className="btn-primary">{t(lang, "integrations.enable")}</button></form>
          )}
        </div>
        {foodics?.active && (
          <dl className="mt-5 grid gap-3 text-sm">
            <div>
              <dt className="text-xs font-medium text-espresso-500">{t(lang, "integrations.webhookUrl")}</dt>
              <dd className="mt-1 break-all rounded-lg bg-cream-200 px-3 py-2 font-mono text-xs" dir="ltr">{`${env().APP_URL}/api/integrations/foodics/${foodics.id}`}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-espresso-500">{t(lang, "integrations.secret")}</dt>
              <dd className="mt-1 break-all rounded-lg bg-cream-200 px-3 py-2 font-mono text-xs" dir="ltr">{foodics.webhook_secret}</dd>
            </div>
          </dl>
        )}
      </section>
    </>
  );
}
