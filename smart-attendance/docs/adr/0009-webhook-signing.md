# ADR-0009: توقيع Webhooks وتسليمها

- **الحالة:** معتمد — 2026-10-26 (اعتماد المالك الشامل لمقترحات الفريق)
- **التفصيل الملزم:** `docs/product/integration-hub.md` (ب) و§6، و`security-compliance.md` T5/T6

## القرار
- نمط Standard Webhooks: رؤوس `webhook-id` و`webhook-timestamp` و`webhook-signature: v1,<base64(HMAC-SHA256)>` على `id.timestamp.body`؛ نافذة قبول زمنية تحددها السياسة.
- تدوير الأسرار بسرّين صالحين مؤقتًا.
- retry بتأخير أُسّي ثم dead-letter ثم replay يدوي.
- الحمولة **رفيعة**: معرّفات ورموز فقط، بلا إحداثيات ولا بيانات أجهزة (PD-08: `signals[]` في REST فقط).
- الحماية من SSRF: `https` فقط، ورفض العناوين الخاصة والميتاداتا، وتثبيت IP المحلول، وعدم اتباع إعادة التوجيه، وegress proxy معزول (S4–S7).
