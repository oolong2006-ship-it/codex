import { z } from "zod";

export const registerSchema = z.object({
  // account
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
  mobile: z.string().min(6).max(30),
  // company
  companyNameEn: z.string().min(2).max(200),
  companyNameAr: z.string().min(2).max(200),
  crNumber: z.string().max(50).optional().or(z.literal("")),
  vatNumber: z.string().max(50).optional().or(z.literal("")),
  companyType: z.string().max(80).optional().or(z.literal("")),
  yearEstablished: z.coerce.number().int().min(1900).max(2100).optional(),
  city: z.string().max(80).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
  employeeCount: z.string().max(40).optional().or(z.literal("")),
  supplierTypes: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  // first contact
  contactName: z.string().min(2).max(120),
  contactJobTitle: z.string().max(120).optional().or(z.literal("")),
  contactEmail: z.string().email().max(200).optional().or(z.literal("")),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const companySchema = z.object({
  companyNameEn: z.string().min(2).max(200),
  companyNameAr: z.string().min(2).max(200),
  crNumber: z.string().max(50).optional().or(z.literal("")),
  vatNumber: z.string().max(50).optional().or(z.literal("")),
  iban: z.string().max(60).optional().or(z.literal("")),
  companyType: z.string().max(80).optional().or(z.literal("")),
  yearEstablished: z.coerce.number().int().min(1900).max(2100).optional(),
  country: z.string().max(80).default("Saudi Arabia"),
  city: z.string().max(80).optional().or(z.literal("")),
  headquarters: z.string().max(200).optional().or(z.literal("")),
  website: z.string().max(200).optional().or(z.literal("")),
  employeeCount: z.string().max(40).optional().or(z.literal("")),
  annualRevenue: z.string().max(60).optional().or(z.literal("")),
  primaryPhone: z.string().max(40).optional().or(z.literal("")),
  supplierTypes: z.array(z.string()).default([]),
});

export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  jobTitle: z.string().max(120).optional().or(z.literal("")),
  mobile: z.string().max(30).optional().or(z.literal("")),
  whatsapp: z.string().max(30).optional().or(z.literal("")),
  email: z.string().email().max(200).optional().or(z.literal("")),
});

export const productSchema = z.object({
  nameEn: z.string().min(1).max(200),
  nameAr: z.string().max(200).optional().or(z.literal("")),
  sku: z.string().max(80).optional().or(z.literal("")),
  brand: z.string().max(120).optional().or(z.literal("")),
  model: z.string().max(120).optional().or(z.literal("")),
  countryOfOrigin: z.string().max(80).optional().or(z.literal("")),
  categoryId: z.string().optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  specifications: z.string().max(2000).optional().or(z.literal("")),
  unitOfMeasure: z.string().max(40).optional().or(z.literal("")),
  minOrderQty: z.coerce.number().int().min(0).optional(),
  leadTime: z.string().max(80).optional().or(z.literal("")),
  warranty: z.string().max(120).optional().or(z.literal("")),
});

export const serviceSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().max(120).optional().or(z.literal("")),
  description: z.string().max(2000).optional().or(z.literal("")),
  citiesCovered: z.array(z.string()).default([]),
  sla: z.string().max(200).optional().or(z.literal("")),
  experienceYears: z.coerce.number().int().min(0).max(200).optional(),
});

export const brandSchema = z.object({
  name: z.string().min(1).max(120),
  country: z.string().max(80).optional().or(z.literal("")),
  relationship: z.enum(["MANUFACTURER", "AGENT", "DISTRIBUTOR", "RESELLER"]),
});

export const locationSchema = z.object({
  country: z.string().min(1).max(80),
  region: z.string().max(80).optional().or(z.literal("")),
  city: z.string().max(80).optional().or(z.literal("")),
});

export const commercialTermsSchema = z.object({
  paymentTerms: z.string().max(80).optional().or(z.literal("")),
  creditDays: z.coerce.number().int().min(0).max(365).optional(),
  minimumOrder: z.string().max(80).optional().or(z.literal("")),
  deliveryLeadTime: z.string().max(80).optional().or(z.literal("")),
  deliveryCapability: z.coerce.boolean().default(false),
  warehouseAvailable: z.coerce.boolean().default(false),
  fleetAvailable: z.coerce.boolean().default(false),
  importCapability: z.coerce.boolean().default(false),
});
