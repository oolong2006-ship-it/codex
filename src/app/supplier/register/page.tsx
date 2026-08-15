import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getDefaultOrganization } from "@/lib/tenant";
import { LangToggle } from "@/components/lang-toggle";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const org = await getDefaultOrganization().catch(() => null);
  const categories = org
    ? await prisma.category.findMany({
        where: { organizationId: org.id, level: 0 },
        orderBy: { nameEn: "asc" },
        select: { id: true, nameEn: true, nameAr: true },
      })
    : [];

  return (
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">SI</div>
          Supplier Intelligence Hub
        </Link>
        <LangToggle />
      </header>
      <main className="container max-w-2xl py-8">
        <RegisterForm categories={categories} />
      </main>
    </div>
  );
}
