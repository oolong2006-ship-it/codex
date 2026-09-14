"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchLocations } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { formatPhoneForDisplay } from "@/lib/validation";
import { Button, Card, Spinner } from "@/components/ui";
import type { LocationRow } from "@/types/database";

export default function ProfilePage() {
  const { profile, signOut } = useAuth();
  const [location, setLocation] = useState<LocationRow | null>(null);

  useEffect(() => {
    if (!profile?.location_id) return;
    fetchLocations(false)
      .then((ls) => setLocation(ls.find((l) => l.id === profile.location_id) ?? null))
      .catch(() => {});
  }, [profile?.location_id]);

  if (!profile) return <Spinner />;

  const rows: [string, string][] = [
    ["الاسم", profile.full_name ?? "—"],
    ["رقم الجوال", formatPhoneForDisplay(profile.phone)],
    ["الدور", ROLE_LABEL[profile.role]],
    ["الوظيفة", profile.job_title ?? "—"],
    ["الموقع أو الفرع", location?.name_ar ?? "—"],
    ["حالة الحساب", profile.is_active ? "نشط" : "معطّل"],
    ["آخر دخول", formatDateTime(profile.last_login_at)],
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-extrabold text-brand-800">الملف الشخصي</h1>
      </header>

      <Card title="بياناتي" className="max-w-2xl">
        <dl>
          {rows.map(([label, value]) => (
            <div key={label}
              className="flex items-baseline justify-between gap-2 border-b
                         border-slate-100 py-2.5 last:border-0">
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="text-sm font-semibold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/change-password/">
            <Button variant="secondary">تغيير كلمة المرور</Button>
          </Link>
          <Button variant="ghost" onClick={signOut}>تسجيل الخروج</Button>
        </div>
      </Card>
    </div>
  );
}
