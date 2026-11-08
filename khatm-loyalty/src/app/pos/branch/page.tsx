import { redirect } from "next/navigation";
import { getDashboardActor, getLang, getPosActor } from "@/server/web";
import { listBranches } from "@/server/domain/management";
import { t } from "@/lib/i18n";
import { AuthShell } from "@/components/auth-shell";
import { chooseBranchAction } from "../actions";

export default async function ChooseBranch() {
  const actor = (await getPosActor()) ?? (await getDashboardActor());
  if (!actor) redirect("/pos/login");
  const lang = await getLang();
  const branches = await listBranches(actor, true);
  return (
    <AuthShell lang={lang} title={t(lang, "pos.chooseBranch")}>
      <div className="grid gap-2">
        {branches.map((b) => (
          <form key={b.id} action={chooseBranchAction}>
            <input type="hidden" name="branchId" value={b.id} />
            <button className="btn-ghost w-full justify-between py-3.5 text-base">
              <span>{b.name}</span>
              <span className="text-sm text-espresso-500">{b.city ?? ""}</span>
            </button>
          </form>
        ))}
      </div>
    </AuthShell>
  );
}
