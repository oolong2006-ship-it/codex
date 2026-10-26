# المرحلة 1 — Secure Foundation

اقرأ `CLAUDE.md` و`docs/specs.md` و`docs/prd-mvp.md` وكل ADRs.

## الهدف
أساس يعمل محليًا بأمر واحد، معزول بين العملاء، ومختبر. **دون واجهات مستخدم نهائية.**

## النطاق
1. **المستودع:** الهيكل في CLAUDE.md §4، وpnpm + Turborepo، وeslint/prettier/tsconfig مشتركة.
2. **بيئة محلية:** `docker compose up` يشغّل Postgres+PostGIS وRedis. `pnpm dev` يشغّل api وadmin. وملف `.env.example` دون أسرار.
3. **قاعدة البيانات:** migrations للجداول:
   tenants، tenant_settings، legal_entities، branches، departments، employees، user_accounts، roles، permissions، user_role_assignments، work_locations، geofences (+ versions)، devices، device_bindings، device_attestations، device_change_requests، activation_codes، policies (+ versions بتاريخ سريان)، audit_logs.
   - RLS على كل جدول تشغيلي، والتطبيق يضبط `app.tenant_id` لكل طلب.
   - trigger يمنع UPDATE/DELETE على `audit_logs`.
4. **المصادقة والصلاحيات:**
   - تسجيل دخول بالبريد أو الجوال وكلمة المرور، وJWT مدته 15 دقيقة، وrefresh token دوّار مع كشف إعادة الاستخدام.
   - MFA (TOTP) إلزامي لأدوار HR والإدارة.
   - RBAC: platform_admin، tenant_admin، hr، branch_manager، employee. وABAC بنطاق الفروع لـ branch_manager.
5. **DeviceLock — الخادم فقط:** endpoints الربط الأول برمز التفعيل، وطلب التغيير، والاعتماد والرفض، والإيقاف، وفق specs §C.
   - التحقق من App Attest attestation وPlay Integrity token على الخادم عبر adapter.
   - **في التطوير:** `FakeAttestationAdapter` يحاكي النجاح والفشل.
   - **في الإنتاج:** الـ Fake ممنوع، ويفشل التشغيل إذا لم تُضبط المفاتيح.
6. **Audit:** interceptor يسجل كل عملية كتابة حساسة.
7. **CI:** GitHub Actions تشغّل lint وtypecheck وunit وe2e (Postgres حقيقي في container)، وفحص الأسرار، وفحص الاعتماديات.
8. **Seed للتطوير:** عميلان A وB، لكل منهما فرعان وموظفون بأدوار مختلفة.

## خارج النطاق
البصمة، والورديات، والتطبيق الجوال، وواجهات الإدارة الفعلية.

## معايير القبول (اختبارات تُشغَّل وتُنقل نتيجتها)
- [ ] `docker compose up && pnpm db:migrate && pnpm db:seed && pnpm test` ينجح من نسخة نظيفة.
- [ ] F6، وF7، وF8 (API + RLS)، وF16 (على audit_logs) ناجحة.
- [ ] اختبار: تعطيل فحص الخدمة عمدًا ← RLS وحده يمنع تسرب بيانات العميل B.
- [ ] اختبار: لا ارتباطين `ACTIVE` لنفس الموظف (قيد DB).
- [ ] OpenAPI يُولَّد تلقائيًا ويغطي كل endpoints.
- [ ] Threat model مختصر (STRIDE) في `docs/threat-model.md` لمسارات الدخول وربط الجهاز.

## توقف
حدّث `docs/status.md` واعرض نتائج الاختبارات الفعلية. **ثم توقف.**
