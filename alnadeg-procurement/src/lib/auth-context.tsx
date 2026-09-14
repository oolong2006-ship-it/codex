"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { PHONE_EMAIL_DOMAIN, supabase } from "./supabase";
import { normalizeSaudiPhone } from "./validation";
import { GLOBAL_SCOPE_ROLES } from "./constants";
import type { ProfileRow, UserRole } from "@/types/database";

interface AuthState {
  session: Session | null;
  profile: ProfileRow | null;
  loading: boolean;
  signIn: (phone: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  isSuperAdmin: boolean;
  hasGlobalScope: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

/** رسائل أخطاء الدخول بالعربية دون كشف أي معلومة حساسة */
function loginErrorMessage(raw: string): string {
  if (raw.includes("Invalid login credentials")) {
    return "رقم الجوال أو كلمة المرور غير صحيحة";
  }
  if (raw.includes("banned") || raw.includes("User is banned")) {
    return "الحساب معطّل، يرجى مراجعة مدير النظام";
  }
  if (raw.includes("Email not confirmed")) {
    return "الحساب غير مفعّل، يرجى مراجعة مدير النظام";
  }
  if (raw.includes("Too many requests") || raw.includes("rate limit")) {
    return "محاولات كثيرة جدًا، يرجى المحاولة بعد قليل";
  }
  return "تعذر تسجيل الدخول، يرجى المحاولة لاحقًا";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error || !data) { setProfile(null); return null; }
    setProfile(data as ProfileRow);
    return data as ProfileRow;
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) await loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!active) return;
      setSession(s);
      if (s?.user) {
        await loadProfile(s.user.id);
      } else {
        setProfile(null);
        // انتهاء الجلسة يعيد المستخدم لصفحة الدخول
        if (event === "SIGNED_OUT") router.replace("/login/");
      }
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile, router]);

  const signIn = useCallback(async (phone: string, password: string) => {
    const normalized = normalizeSaudiPhone(phone);
    if (!normalized) throw new Error("رقم الجوال غير صحيح. مثال: 0551234567");

    // الدخول برقم الجوال يتم عبر بريد داخلي مشتق منه — دون رسائل SMS
    const { data, error } = await supabase.auth.signInWithPassword({
      email: `${normalized}@${PHONE_EMAIL_DOMAIN}`,
      password,
    });
    if (error) throw new Error(loginErrorMessage(error.message));
    if (!data.user) throw new Error("تعذر تسجيل الدخول، يرجى المحاولة لاحقًا");

    const p = await loadProfile(data.user.id);
    if (!p) {
      await supabase.auth.signOut();
      throw new Error("لا يوجد ملف مستخدم لهذا الحساب، يرجى مراجعة مدير النظام");
    }
    if (!p.is_active) {
      await supabase.auth.signOut();
      throw new Error("الحساب معطّل، يرجى مراجعة مدير النظام");
    }

    // تسجيل آخر دخول في سجل التدقيق — لا يمنع الدخول إن فشل
    try { await supabase.rpc("record_login"); } catch { /* تجاهل */ }
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    router.replace("/login/");
  }, [router]);

  const changePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      if (error.message.includes("should be different")) {
        throw new Error("يجب أن تختلف كلمة المرور الجديدة عن الحالية");
      }
      throw new Error("تعذر تغيير كلمة المرور، يرجى المحاولة لاحقًا");
    }
    // رفع علامة تغيير كلمة المرور الإجباري
    if (session?.user) {
      await supabase.from("profiles")
        .update({ must_change_password: false }).eq("id", session.user.id);
      await loadProfile(session.user.id);
    }
  }, [session, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session, loadProfile]);

  const value = useMemo<AuthState>(() => ({
    session, profile, loading, signIn, signOut, changePassword, refreshProfile,
    hasRole: (...roles) => !!profile && roles.includes(profile.role),
    isSuperAdmin: profile?.role === "super_admin",
    hasGlobalScope: !!profile && GLOBAL_SCOPE_ROLES.includes(profile.role),
  }), [session, profile, loading, signIn, signOut, changePassword, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
