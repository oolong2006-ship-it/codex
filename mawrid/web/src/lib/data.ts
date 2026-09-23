"use client";
import { PAGE_SIZE } from "./constants";
import { getSupabase } from "./supabase";
import type { Profile, Supplier, SupplierFilters, SupplierInput, SupplierStats } from "./types";
import type { UserRole } from "./constants";

function rpcArgs(f: SupplierFilters) {
  return {
    p_q: f.q || null, p_category: f.category || null, p_city: f.city || null,
    p_payment: f.payment || null, p_cert: f.cert || null, p_status: f.status || null,
  };
}

export async function searchSuppliers(f: SupplierFilters, offset = 0, limit = PAGE_SIZE) {
  const { data, error } = await getSupabase().rpc("search_suppliers", {
    ...rpcArgs(f), p_sort: f.sort, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as Supplier[];
}

export async function countSuppliers(f: SupplierFilters) {
  const { data, error } = await getSupabase().rpc("count_suppliers", rpcArgs(f));
  if (error) throw error;
  return Number(data ?? 0);
}

/** كل الموردين المطابقين (للتصدير) — على دفعات */
export async function allMatchingSuppliers(f: SupplierFilters) {
  const out: Supplier[] = [];
  for (let offset = 0; ; offset += 500) {
    const page = await searchSuppliers(f, offset, 500);
    out.push(...page);
    if (page.length < 500) return out;
  }
}

export async function supplierStats(): Promise<SupplierStats> {
  const { data, error } = await getSupabase().rpc("supplier_stats");
  if (error) throw error;
  return data as SupplierStats;
}

export async function getSupplier(id: string) {
  const { data, error } = await getSupabase().from("suppliers").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Supplier | null;
}

export async function getSuppliersByIds(ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await getSupabase().from("suppliers").select("*").in("id", ids);
  if (error) throw error;
  const rows = (data ?? []) as Supplier[];
  return ids.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as Supplier[];
}

export async function createSupplier(input: SupplierInput) {
  const { data, error } = await getSupabase().from("suppliers").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateSupplier(id: string, input: SupplierInput) {
  const { error } = await getSupabase().from("suppliers").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteSupplier(id: string) {
  const { error, count } = await getSupabase().from("suppliers").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  if (!count) throw { code: "42501", message: "FORBIDDEN" };
}

export async function deleteDemoSuppliers() {
  const { data, error } = await getSupabase().rpc("delete_demo_suppliers");
  if (error) throw error;
  return Number(data ?? 0);
}

/** مفاتيح التكرار الموجودة — لمعاينة الاستيراد (جديد / تحديث) */
export async function existingDedupKeys() {
  const keys = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await getSupabase().from("suppliers")
      .select("dedup_key").order("id").range(from, from + 999);
    if (error) throw error;
    data.forEach((r) => keys.add(r.dedup_key as string));
    if (data.length < 1000) return keys;
  }
}

/** إدراج أو تحديث دفعة حسب مفتاح التكرار */
export async function upsertSuppliers(rows: SupplierInput[]) {
  const { error } = await getSupabase().from("suppliers")
    .upsert(rows, { onConflict: "dedup_key", defaultToNull: false });
  if (error) throw error;
}

// ------------------------------------------------------------ المستخدمون
export async function listProfiles() {
  const { data, error } = await getSupabase().from("profiles")
    .select("*").order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, "role" | "is_active" | "full_name">>) {
  const { error } = await getSupabase().from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export type { UserRole };
