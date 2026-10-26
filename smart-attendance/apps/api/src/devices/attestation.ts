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

export abstract class AttestationAdapter {
  abstract readonly name: string;
  abstract verifyKeyAttestation(input: AttestationInput): Promise<AttestationResult>;
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
