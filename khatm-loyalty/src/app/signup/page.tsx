import Link from "next/link";
import { getLang } from "@/server/web";
import { t } from "@/lib/i18n";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Sign up" };

export default async function SignupPage() {
  const lang = await getLang();
  const k = (key: string) => t(lang, key);
  return (
    <AuthShell lang={lang} title={k("auth.signup.title")}>
      <SignupForm
        labels={{
          businessName: k("auth.signup.businessName"),
          slug: k("auth.signup.slug"),
          slugHint: k("auth.signup.slugHint"),
          ownerName: k("auth.signup.ownerName"),
          email: k("common.email"),
          password: k("common.password"),
          branchName: k("auth.signup.firstBranch"),
          city: k("common.city"),
          submit: k("auth.signup.submit"),
        }}
      />
      <p className="mt-6 text-center text-sm text-espresso-500">
        {k("auth.signup.haveAccount")}{" "}
        <Link href="/login" className="font-semibold text-espresso-800 hover:underline">
          {k("auth.login.submit")}
        </Link>
      </p>
    </AuthShell>
  );
}
