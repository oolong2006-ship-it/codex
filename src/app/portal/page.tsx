import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, AlertCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getOwnedSupplier } from "@/lib/supplier-service";
import { computeCompleteness } from "@/lib/completeness";
import { requiredDocumentsForSupplier } from "@/lib/rules";
import { Card, CardContent, CardHeader, CardTitle, Progress, Button } from "@/components/ui";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function PortalOverview() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const supplier = await getOwnedSupplier(user.id, user.organizationId);
  if (!supplier) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p>No supplier profile is linked to this account.</p>
          <Link href="/supplier/register"><Button className="mt-4">Complete registration</Button></Link>
        </CardContent>
      </Card>
    );
  }

  const { score, missing } = computeCompleteness(supplier);
  const requiredDocs = await requiredDocumentsForSupplier(user.organizationId, supplier.id);
  const missingMandatory = requiredDocs.filter((d) => d.mandatory && !d.provided);
  const canSubmit = ["REGISTERED", "PROFILE_INCOMPLETE", "REJECTED", "CONDITIONAL"].includes(supplier.status) && missingMandatory.length === 0;

  const { SubmitButton } = await import("./submit-button");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{supplier.companyNameEn}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono">{supplier.supplierCode}</span>
            <StatusBadge status={supplier.status} />
          </div>
        </div>
        <SubmitButton
          disabled={!canSubmit}
          disabledReason={
            missingMandatory.length > 0
              ? `${missingMandatory.length} mandatory document(s) still required`
              : !["REGISTERED", "PROFILE_INCOMPLETE", "REJECTED", "CONDITIONAL"].includes(supplier.status)
              ? "Application already in review"
              : undefined
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Profile completeness</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <span className="text-3xl font-bold">{score}%</span>
              <div className="flex-1"><Progress value={score} /></div>
            </div>
            {missing.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-[hsl(var(--success))]">
                <CheckCircle2 className="h-4 w-4" /> Your profile is complete.
              </p>
            ) : (
              <div>
                <p className="mb-2 text-sm font-medium">Missing items</p>
                <ul className="space-y-1.5">
                  {missing.map((m) => (
                    <li key={m.key} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Circle className="h-3.5 w-3.5" /> {m.en}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Required documents</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {requiredDocs.map((d) => (
                <li key={d.code} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2">
                    {d.provided ? (
                      <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                    ) : d.mandatory ? (
                      <AlertCircle className="h-4 w-4 text-[hsl(var(--danger))]" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                    {d.nameEn}
                  </span>
                  {d.mandatory && !d.provided && <span className="text-xs text-[hsl(var(--danger))]">required</span>}
                </li>
              ))}
            </ul>
            <Link href="/portal/documents"><Button variant="outline" size="sm" className="mt-4 w-full">Manage documents</Button></Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Products" value={supplier.products.length} href="/portal/catalog" />
        <StatTile label="Categories" value={supplier.categories.length} href="/portal/profile" />
        <StatTile label="Contacts" value={supplier.contacts.length} href="/portal/profile" />
        <StatTile label="Documents" value={supplier.documents.length} href="/portal/documents" />
      </div>
    </div>
  );
}

function StatTile({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="pt-5">
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-sm text-muted-foreground">{label}</div>
        </CardContent>
      </Card>
    </Link>
  );
}
