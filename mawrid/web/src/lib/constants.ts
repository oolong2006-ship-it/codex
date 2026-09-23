// القوائم الثابتة — مطابقة لـ mawrid/CLAUDE.md والنموذج الأولي

export const CATEGORIES = [
  "لحوم ودواجن", "أسماك وبحريات", "خضار وفواكه", "ألبان وأجبان", "بقالة جافة", "زيوت وسمن",
  "مجمدات", "مخبوزات وحلويات", "مشروبات وقهوة", "بهارات وصوصات", "تغليف واستهلاكيات",
  "منظفات وكيماويات", "معدات مطابخ", "صيانة وخدمات فنية", "زي موحد", "غاز وطاقة",
] as const;

export const CITIES = [
  "الرياض", "جدة", "مكة المكرمة", "المدينة المنورة", "الدمام", "الخبر", "الأحساء", "القصيم",
  "أبها", "خميس مشيط", "تبوك", "حائل", "جازان", "نجران", "الطائف", "ينبع",
] as const;

export const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

export const CERTIFICATES = [
  "ترخيص الغذاء والدواء", "HACCP", "ISO 22000", "ISO 9001", "FSSC 22000", "شهادة حلال", "مصنع وطني",
] as const;

export const PAYMENT_TERMS = ["نقدي", "آجل", "نقدي وآجل"] as const;
export type PaymentTerms = (typeof PAYMENT_TERMS)[number];

export const STATUSES = ["موثّق", "قيد التحقق", "غير موثّق"] as const;
export type VerificationStatus = (typeof STATUSES)[number];

export const SOURCES = ["ERP الناضج", "فريق المشتريات", "بحث عام", "تسجيل ذاتي"] as const;

export const ROLES = ["admin", "editor", "viewer"] as const;
export type UserRole = (typeof ROLES)[number];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "مدير",
  editor: "مدخل بيانات",
  viewer: "مشاهد",
};

export const MAX_COMPARE = 3;
export const PAGE_SIZE = 60;
