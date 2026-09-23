"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, isConfigured } from "./supabase";
import type { Profile } from "./types";

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** true عند فتح رابط استعادة كلمة المرور من البريد */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  canEdit: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

function loginError(raw: string): string {
  if (raw.includes("Invalid login credentials")) return "البريد أو كلمة المرور غير صحيحة";
  if (raw.includes("Email not confirmed")) return "الحساب غير مفعّل بعد، راجع مدير النظام";
  if (raw.includes("banned")) return "الحساب موقوف، راجع مدير النظام";
  if (/rate limit|Too many/i.test(raw)) return "محاولات كثيرة، حاول بعد قليل";
  if (raw.includes("fetch")) return "تعذر الاتصال بالخادم، تحقق من الإنترنت";
  return "تعذر تسجيل الدخول، حاول مرة أخرى";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [recovering, setRecovering] = useState(false);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await getSupabase().from("profiles").select("*").eq("id", userId).maybeSingle();
    setProfile((data as Profile) ?? null);
    return (data as Profile) ?? null;
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    const sb = getSupabase();
    let active = true;
    sb.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadProfile(data.session.user.id);
      if (active) setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      setSession(s);
      // لا نستدعي Supabase مباشرة داخل المستمع (قد يسبب تعليقاً) — نؤجل
      if (s) setTimeout(() => { void loadProfile(s.user.id); }, 0);
      else setProfile(null);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    if (error) throw new Error(loginError(error.message));
    const p = await loadProfile(data.user.id);
    if (!p || !p.is_active) {
      await getSupabase().auth.signOut();
      throw new Error("الحساب غير مفعّل بعد، اطلب من مدير النظام تفعيله");
    }
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  const sendReset = useCallback(async (email: string) => {
    const redirectTo = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/reset-password/`;
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo });
    if (error && /rate limit/i.test(error.message)) throw new Error("محاولات كثيرة، حاول بعد قليل");
    // لا نكشف إن كان البريد مسجلاً أم لا
  }, []);

  const setPassword = useCallback(async (password: string) => {
    const { error } = await getSupabase().auth.updateUser({ password });
    if (error) {
      if (error.message.includes("different")) throw new Error("اختر كلمة مرور مختلفة عن السابقة");
      if (/weak|at least/i.test(error.message)) throw new Error("كلمة المرور ضعيفة، استخدم 8 أحرف على الأقل");
      throw new Error("تعذر حفظ كلمة المرور، اطلب رابطاً جديداً");
    }
    setRecovering(false);
  }, []);

  const value = useMemo<AuthState>(() => {
    const role = profile?.is_active ? profile.role : null;
    return {
      session, profile, loading, recovering, signIn, signOut, sendReset, setPassword,
      canEdit: role === "admin" || role === "editor",
      isAdmin: role === "admin",
    };
  }, [session, profile, loading, recovering, signIn, signOut, sendReset, setPassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
