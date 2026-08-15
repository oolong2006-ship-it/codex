import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

export interface ExtractedProduct {
  nameEn?: string;
  nameAr?: string;
  brand?: string;
  model?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  specifications?: string;
  countryOfOrigin?: string;
  unit?: string;
  confidence?: number;
}

export interface ClassificationResult {
  primaryCategory?: string;
  secondaryCategories: string[];
  supplierTypes: string[];
  keywords: string[];
  suggestedProducts: string[];
  suggestedBrands: string[];
}

function client(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Extract JSON from a model response that may include prose or code fences. */
function parseJson<T>(text: string, fallback: T): T {
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = fenced ? fenced[1] : text;
    const start = raw.indexOf("{");
    const arrStart = raw.indexOf("[");
    const from =
      arrStart !== -1 && (arrStart < start || start === -1) ? arrStart : start;
    if (from === -1) return fallback;
    const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
    return JSON.parse(raw.slice(from, end + 1)) as T;
  } catch {
    return fallback;
  }
}

// ── Catalog extraction ────────────────────────────────────────

export async function extractProductsFromText(
  text: string,
): Promise<ExtractedProduct[]> {
  const trimmed = text.slice(0, 40_000);
  const c = client();
  if (!c) return heuristicExtract(trimmed);

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system:
        "You extract structured product records from supplier catalogs. " +
        "Return ONLY a JSON array. Each item may have: nameEn, nameAr, brand, model, " +
        "category, subcategory, description, specifications, countryOfOrigin, unit, " +
        "confidence (0-1). Never invent data that is not present.",
      messages: [
        {
          role: "user",
          content: `Extract all products from this catalog text as a JSON array:\n\n${trimmed}`,
        },
      ],
    });
    const textOut = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    const parsed = parseJson<ExtractedProduct[]>(textOut, []);
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch {
    return heuristicExtract(trimmed);
  }
}

/**
 * Deterministic fallback: treat each non-trivial line that looks like a product
 * row as a candidate product. Keeps the workflow usable without an API key.
 */
function heuristicExtract(text: string): ExtractedProduct[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4 && l.length <= 160)
    .filter((l) => /[a-zA-Z؀-ۿ]/.test(l))
    .filter((l) => !/^(page|catalog|www\.|http|tel|email|address)/i.test(l));

  const seen = new Set<string>();
  const products: ExtractedProduct[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Split "Name - spec" or "Name: spec" patterns.
    const m = line.split(/\s[-:–]\s/);
    products.push({
      nameEn: m[0].slice(0, 120),
      description: m[1]?.slice(0, 200),
      confidence: 0.4,
    });
    if (products.length >= 60) break;
  }
  return products;
}

// ── Supplier classification ───────────────────────────────────

export async function classifySupplier(input: {
  companyName: string;
  description?: string;
  productNames?: string[];
  website?: string;
}): Promise<ClassificationResult> {
  const c = client();
  const fallback: ClassificationResult = heuristicClassify(input);
  if (!c) return fallback;

  try {
    const res = await c.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You classify B2B suppliers for a procurement platform. Return ONLY JSON " +
        "with keys: primaryCategory, secondaryCategories (array), supplierTypes " +
        "(array of MANUFACTURER|AUTHORIZED_AGENT|DISTRIBUTOR|WHOLESALER|RETAILER|" +
        "SERVICE_PROVIDER|CONTRACTOR|IMPORTER), keywords (array), suggestedProducts " +
        "(array), suggestedBrands (array).",
      messages: [
        {
          role: "user",
          content: JSON.stringify(input),
        },
      ],
    });
    const textOut = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    const parsed = parseJson<Partial<ClassificationResult>>(textOut, {});
    return {
      primaryCategory: parsed.primaryCategory ?? fallback.primaryCategory,
      secondaryCategories: parsed.secondaryCategories ?? [],
      supplierTypes: parsed.supplierTypes ?? [],
      keywords: parsed.keywords ?? fallback.keywords,
      suggestedProducts: parsed.suggestedProducts ?? [],
      suggestedBrands: parsed.suggestedBrands ?? [],
    };
  } catch {
    return fallback;
  }
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  "Food & Beverage": ["food", "chicken", "poultry", "meat", "frozen", "beverage", "coffee", "dairy", "غذاء", "دجاج", "لحم"],
  "Kitchen Equipment": ["kitchen", "oven", "refrigerat", "freezer", "cold room", "cooking", "مطبخ", "ثلاجة", "فرن"],
  Maintenance: ["hvac", "maintenance", "air condition", "ac ", "repair", "صيانة", "تكييف"],
  IT: ["server", "hardware", "software", "network", "laptop", "computer", "تقنية", "خوادم"],
  Cleaning: ["clean", "detergent", "hygiene", "sanit", "تنظيف", "منظفات"],
  Packaging: ["packag", "carton", "plastic bag", "wrap", "تغليف", "تعبئة"],
  Construction: ["construct", "cement", "steel", "concrete", "building", "مقاولات", "بناء"],
  Furniture: ["furniture", "chair", "desk", "office furniture", "أثاث"],
  Logistics: ["logistic", "transport", "fleet", "delivery", "shipping", "نقل", "شحن"],
};

function heuristicClassify(input: {
  companyName: string;
  description?: string;
  productNames?: string[];
}): ClassificationResult {
  const hay = [
    input.companyName,
    input.description ?? "",
    ...(input.productNames ?? []),
  ]
    .join(" ")
    .toLowerCase();

  const scores: { category: string; hits: number }[] = [];
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = kws.filter((k) => hay.includes(k)).length;
    if (hits > 0) scores.push({ category: cat, hits });
  }
  scores.sort((a, b) => b.hits - a.hits);

  const keywords = Array.from(
    new Set(
      Object.values(CATEGORY_KEYWORDS)
        .flat()
        .filter((k) => hay.includes(k) && /[a-z]/.test(k)),
    ),
  ).slice(0, 10);

  return {
    primaryCategory: scores[0]?.category,
    secondaryCategories: scores.slice(1, 3).map((s) => s.category),
    supplierTypes: [],
    keywords,
    suggestedProducts: [],
    suggestedBrands: [],
  };
}
