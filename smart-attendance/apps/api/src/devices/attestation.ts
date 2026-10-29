import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConfigError, type AppConfig } from '../config';

export interface AttestationInput {
  platform: 'ios' | 'android';
  keyId: string;
  /** حمولة المنصة كما أرسلها التطبيق (App Attest attestation أو Key Attestation chain + Play Integrity). */
  payload: Record<string, unknown>;
  /** التحدي الصادر من الخادم لهذه العملية. */
  nonce: string;
}

export interface AttestationResult {
  verified: boolean;
  publicKey: string | null;
  /** ملخص قابل للتخزين — دون رموز أو شهادات خام. */
  verdict: Record<string, unknown>;
}

/** توقيع البصمة: App Attest assertion أو توقيع Keystore + Play Integrity token (specs §D). */
export interface AssertionInput {
  platform: 'ios' | 'android';
  keyId: string;
  publicKey: string;
  /** SHA256(nonce ‖ canonical_json(body دون attestation)) بصيغة hex. */
  clientDataHash: string;
  payload: Record<string, unknown>;
}

/** إشارات سلامة الجهاز المستخرجة من التحقق (تغذي الطبقة 3). */
export interface DeviceSignals {
  meets_device_integrity?: boolean;
  app_access_risk?: string[];
  recent_device_activity_level?: 1 | 2 | 3 | 4;
  verified_boot?: boolean;
  app_attest_key_churn?: boolean;
}

export interface AssertionResult {
  verified: boolean;
  signals: DeviceSignals;
}

export abstract class AttestationAdapter {
  abstract readonly name: string;
  abstract verifyKeyAttestation(input: AttestationInput): Promise<AttestationResult>;
  abstract verifyAssertion(input: AssertionInput): Promise<AssertionResult>;
}

/** توقيع Fake: HMAC-SHA256 بمفتاح الجهاز «العام» المزيف على clientDataHash. للاختبار فقط. */
export function fakeSign(publicKey: string, clientDataHash: string): string {
  return createHmac('sha256', publicKey).update(clientDataHash).digest('hex');
}

/**
 * للتطوير والاختبار فقط (prompts/phase-1 §5). ينجح فقط إذا:
 * payload.fake_verdict === 'valid' و payload.nonce يطابق التحدي.
 * هكذا تبقى اختبارات إعادة الاستخدام والتلاعب ذات معنى.
 */
export class FakeAttestationAdapter extends AttestationAdapter {
  readonly name = 'fake';

  async verifyKeyAttestation(input: AttestationInput): Promise<AttestationResult> {
    const nonceOk = input.payload.nonce === input.nonce;
    const verdictOk = input.payload.fake_verdict === 'valid';
    return {
      verified: nonceOk && verdictOk,
      publicKey: nonceOk && verdictOk ? `fake-public-key:${input.keyId}` : null,
      verdict: { adapter: 'fake', nonce_match: nonceOk, fake_verdict: String(input.payload.fake_verdict ?? '') },
    };
  }

  /**
   * ينجح فقط إذا payload.signature = fakeSign(publicKey, clientDataHash)، فأي تعديل في
   * الجسم بعد التوقيع يفشل (F5). payload.fake_signals تحاكي حكم Play Integrity/Key Attestation.
   */
  async verifyAssertion(input: AssertionInput): Promise<AssertionResult> {
    const sig = typeof input.payload.signature === 'string' ? input.payload.signature : '';
    const expected = fakeSign(input.publicKey, input.clientDataHash);
    const verified =
      sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    const raw = (input.payload.fake_signals ?? {}) as DeviceSignals;
    return { verified, signals: verified ? raw : {} };
  }
}

/**
 * يختار المحول. التحقق الحقيقي من App Attest/Key Attestation/Play Integrity
 * لم يُنفذ بعد (Blocked: Spike ADR-0001 على أجهزة حقيقية + مفاتيح Apple/Google)،
 * لذلك يرفض التشغيل بدل أن يقبل أجهزة دون تحقق.
 */
export function createAttestationAdapter(config: AppConfig): AttestationAdapter {
  if (config.attestationAdapter === 'fake') {
    if (config.env === 'production') throw new ConfigError('FakeAttestationAdapter is forbidden in production');
    return new FakeAttestationAdapter();
  }
  throw new ConfigError(
    'Platform attestation adapter is not implemented yet (Blocked: ADR-0001 spike). Refusing to start.',
  );
}
