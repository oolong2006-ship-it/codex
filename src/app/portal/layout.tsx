import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPPLIER") redirect("/dashboard");

  return (
    <AppShell variant="portal" user={{ name: user.name, role: user.role, org: user.organizationName }}>
      {children}
    </AppShell>
  );
}
