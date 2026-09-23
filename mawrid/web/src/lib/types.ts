import type { PaymentTerms, UserRole, VerificationStatus } from "./constants";

export interface Supplier {
  id: string;
  name: string;
  legal_name: string | null;
  cr: string | null;
  vat: string | null;
  city: string;
  district: string | null;
  national_address: string | null;
  contact_name: string | null;
  contact_role: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  categories: string[];
  products: string | null;
  coverage: string[];
  delivery_days: string[];
  lead_time: string | null;
  moq: string | null;
  payment: PaymentTerms | null;
  credit_days: number;
  certificates: string[];
  sfda_license: string | null;
  status: VerificationStatus;
  rating: number;
  notes: string | null;
  source: string | null;
  demo: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  dedup_key: string;
}

/** الحقول القابلة للكتابة من الواجهة */
export type SupplierInput = Omit<
  Supplier,
  "id" | "created_at" | "updated_at" | "created_by" | "updated_by" | "dedup_key" | "demo"
>;

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface SupplierStats {
  total: number;
  demo: number;
  categories: Record<string, number>;
}

export interface SupplierFilters {
  q: string;
  category: string;
  city: string;
  payment: string;
  cert: string;
  status: string;
  sort: "name" | "rating" | "updated";
}
