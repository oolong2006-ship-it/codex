import { redirect } from "next/navigation";
import { getLang, getPosActor } from "@/server/web";
import { t } from "@/lib/i18n";
import { AuthShell } from "@/components/auth-shell";
import { PinForm } from "./pin-form";

export const metadata = { title: "Cashier" };

export default async function PosLogin({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  if (await getPosActor()) redirect("/pos");
  const lang = await getLang();
  const { m } = await searchParams;
  return (
    <AuthShell lang={lang} title={t(lang, "pos.login.title")} photo="barista">
      <PinForm defaultMerchant={m} labels={{ merchant: t(lang, "pos.login.merchant"), pin: t(lang, "pos.login.pin"), submit: t(lang, "pos.login.submit") }} />
    </AuthShell>
  );
}
