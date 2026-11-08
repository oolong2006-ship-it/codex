import { requireDashboardActor, getLang } from "@/server/web";
import { CAMPAIGN_TEMPLATES, AUDIENCES, audienceSize, listCampaigns } from "@/server/domain/campaigns";
import { getMerchant } from "@/server/domain/management";
import { requirePermission } from "@/server/actor";
import { PERMISSIONS } from "@/server/rbac";
import { messaging } from "@/server/messaging/provider";
import { fmtDateTime, t } from "@/lib/i18n";
import { PageHeader } from "@/components/page-header";
import { CampaignForm } from "./campaign-form";

export const metadata = { title: "Campaigns" };

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<{ template?: string; audience?: string }> }) {
  const actor = await requireDashboardActor();
  requirePermission(actor, PERMISSIONS.CAMPAIGN_SEND);
  const lang = await getLang();
  const sp = await searchParams;
  const [history, merchant, ...sizes] = await Promise.all([listCampaigns(actor), getMerchant(actor), ...AUDIENCES.map((a) => audienceSize(actor, a))]);
  const k = (key: string, p?: Record<string, string | number>) => t(lang, key, p);
  return (
    <>
      <PageHeader title={k("campaigns.title")} sub={k("campaigns.consentNote")} />
      {messaging().name === "console" && <p className="mb-4 rounded-xl bg-cream-200 px-4 py-2.5 text-sm text-espresso-700">{k("campaigns.providerConsole")}</p>}
      <CampaignForm
        business={merchant.name}
        templates={CAMPAIGN_TEMPLATES.map((x) => ({ key: x.key, name: x.name[lang], message: x.message, suggestedAudience: x.suggestedAudience }))}
        audiences={AUDIENCES.map((a) => ({ key: a, label: k(`campaigns.audience.${a}`) }))}
        sizes={Object.fromEntries(AUDIENCES.map((a, i) => [a, sizes[i] ?? 0]))}
        initialTemplate={sp.template}
        initialAudience={AUDIENCES.includes(sp.audience as never) ? sp.audience : undefined}
        labels={{ template: k("campaigns.template"), audience: k("campaigns.audience"), message: k("campaigns.message"), messageHint: k("campaigns.messageHint"), send: k("campaigns.send"), recipients: k("campaigns.recipients"), preview: k("campaigns.preview") }}
      />
      <h2 className="mb-3 mt-8 font-semibold">{k("campaigns.history")}</h2>
      <div className="card overflow-x-auto">
        {history.length === 0 ? <p className="p-8 text-center text-espresso-500">{k("common.none")}</p> : (
          <table className="table">
            <thead><tr><th>{k("common.date")}</th><th>{k("campaigns.template")}</th><th>{k("campaigns.audience")}</th><th>{k("campaigns.recipients")}</th></tr></thead>
            <tbody>
              {history.map((c) => (
                <tr key={c.id}>
                  <td className="text-xs">{fmtDateTime(lang, c.created_at)}</td>
                  <td>{CAMPAIGN_TEMPLATES.find((x) => x.key === c.template_key)?.name[lang] ?? c.template_key}</td>
                  <td>{k(`campaigns.audience.${c.audience}`)}</td>
                  <td className="tabular-nums">{c.sent} / {c.recipients}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
