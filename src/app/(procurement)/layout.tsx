import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { isProcurement } from "@/lib/rbac";
import { AppShell } from "@/components/app-shell";

export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isProcurement(user.role)) redirect("/portal");

  return (
    <AppShell variant="procurement" user={{ name: user.name, role: user.role, org: user.organizationName }}>
      {children}
    </AppShell>
  );
}
