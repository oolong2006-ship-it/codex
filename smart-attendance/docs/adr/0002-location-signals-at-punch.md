# ADR-0002: إشارات الموقع الإضافية عند لحظة البصمة

- **الحالة:** معتمد — 2026-10-26 (اعتماد المالك الشامل لمقترحات الفريق)
- **التفصيل الملزم:** `docs/product/trust-accuracy.md` §2 و§9

## القرار
يضاف إلى عقد `POST /v1/attendance/punches` (specs §D) — **عند البصمة فقط** — الحقول الاختيارية:
- لكل عينة: `source_info` (iOS `isSimulatedBySoftware` و`isProducedByAccessory`)، و`vertical_accuracy_m`، و`floor` (دليل لا قرار).
- على مستوى الطلب: `accuracy_authorization` (`full|reduced|approximate`)، و`wifi_connected_bssid_hash`، و`wifi_scan_hashes[]` (Android فقط).
- BSSID **لا يُرسل خامًا ولا يُخزّن خامًا أبدًا**: HMAC-SHA256 بملح سري لكل عميل (F40).
- iOS يتطلب entitlement `com.apple.developer.networking.wifi-info`. لا Background location في أي manifest (F39).

## العواقب
- تحديث إشعار خصوصية الموظف قبل التفعيل (D-10، PD-06).
- كل الحقول اختيارية: غيابها لا يغير قرار specs §B.
