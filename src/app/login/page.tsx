"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLang } from "@/lib/i18n/context";
import { LangToggle } from "@/components/lang-toggle";
import { Button, Card, CardContent, Input, Label } from "@/components/ui";

export default function LoginPage() {
  const { t } = useLang();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError(t("auth.invalid"));
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="absolute end-5 top-5">
        <LangToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="mb-6 text-center">
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-primary text-primary-foreground">SI</div>
            <h1 className="mt-3 text-lg font-semibold">{t("app.name")}</h1>
            <p className="text-sm text-muted-foreground">{t("auth.signIn")}</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-[hsl(var(--danger))]">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("common.loading") : t("auth.signIn")}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/supplier/register" className="text-primary hover:underline">
              {t("auth.supplierRegister")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
