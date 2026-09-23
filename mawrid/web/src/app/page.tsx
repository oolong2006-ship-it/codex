"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isConfigured } from "@/lib/supabase";
import { NotConfigured } from "@/components/NotConfigured";
import { Spinner } from "@/components/ui";

export default function Home() {
  const { session, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isConfigured || loading) return;
    router.replace(session ? "/suppliers/" : "/login/");
  }, [session, loading, router]);
  return isConfigured ? <Spinner /> : <NotConfigured />;
}
