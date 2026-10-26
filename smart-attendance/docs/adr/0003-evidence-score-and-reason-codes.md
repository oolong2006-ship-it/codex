# ADR-0003: Evidence score والأكواد الجديدة

- **الحالة:** معتمد — 2026-10-26 (اعتماد المالك الشامل لمقترحات الفريق)
- **التفصيل الملزم:** `docs/product/trust-accuracy.md` §4 و§5

## القرار
1. `risk_points` و`support_points` = مجموع أوزان الأكواد المرصودة. **الأوزان والعتبات في إصدار السياسة**، لا في الكود.
2. **خفض:** `risk_points ≥ pending_threshold` → `PENDING_REVIEW` حتى لو لم تكفِ إشارة منفردة.
3. **رفع مقيد:** `LOC_UNCERTAIN` → `VERIFIED` فقط إذا `SUP_WIFI_KNOWN` و`risk_points = 0` و`a ≤ max_accuracy_m` والخيار مفعّل للموقع. **لا يرفع `LOC_OUTSIDE` أبدًا** (F33).
4. لا مسار إلى `REJECTED` عبر الدرجة إلا بتفعيل صريح من العميل (specs §A).
5. أكواد جديدة: `LOC_APPROXIMATE_PERMISSION`، `RISK_LOCATION_ACCESSORY`، `RISK_SAMPLE_INCONSISTENT`، `RISK_ACCURACY_IMPLAUSIBLE`، `RISK_WIFI_UNKNOWN_AT_SITE`، `RISK_REMOTE_CONTROL_APP`، `RISK_HIGH_DEVICE_ACTIVITY`، `RISK_BOOT_UNVERIFIED`، `RISK_APP_ATTEST_KEY_CHURN` (تحقيق فقط)، `SUP_WIFI_KNOWN`، `SUP_PROVIDER_GNSS`.
6. `RISK_IMPOSSIBLE_TRAVEL` يحسب `effective_distance = max(0, d − a_prev − a_now)` (F30).
7. العينات الملتقطة قبل `challenge.issued_at` تُستبعد (F21)، والملتقطة بعد استلام الخادم تُستبعد + `RISK_CLOCK_SKEW` (F22).
8. `attendance_decisions` يخزن `risk_points` و`support_points` إضافة إلى reasons/signals.

## الاختبارات
F19–F34 في specs §G.
