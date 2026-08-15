import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Boxes, ShieldCheck, Search, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { isProcurement } from "@/lib/rbac";
import { LangToggle } from "@/components/lang-toggle";
import { Button } from "@/components/ui";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect(isProcurement(user.role) ? "/dashboard" : "/portal");
  }

  const features = [
    { icon: Boxes, title: "Structured supplier profiles", body: "Turn catalogs, documents and free-text into a searchable supplier database." },
    { icon: Sparkles, title: "AI catalog intelligence", body: "Extract products and classify suppliers with human-in-the-loop review." },
    { icon: Search, title: "Procurement search", body: "Find qualified suppliers by category, city, certification and credit terms." },
    { icon: ShieldCheck, title: "Qualification & approval", body: "Document management, expiry alerts, RBAC and full audit trail." },
  ];

  return (
    <div className="min-h-screen">
      <header className="container flex items-center justify-between py-5">
        <div className="flex items-center gap-2 font-semibold">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">SI</div>
          Supplier Intelligence Hub
        </div>
        <div className="flex items-center gap-3">
          <LangToggle />
          <Link href="/login">
            <Button variant="outline" size="sm">Sign in</Button>
          </Link>
        </div>
      </header>

      <main className="container py-16">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            Supplier Discovery → Registration → Qualification → Intelligence
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Enterprise supplier registration & discovery
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Register, qualify, classify and discover suppliers — with AI-assisted catalog
            extraction, document management and a procurement-grade search engine.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link href="/supplier/register">
              <Button size="lg">
                Register as a supplier <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">Procurement sign in</Button>
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-16 grid max-w-5xl gap-4 sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="rounded-lg border border-border bg-card p-5">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
