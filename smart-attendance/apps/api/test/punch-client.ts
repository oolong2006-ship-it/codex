import { INestApplication } from '@nestjs/common';
import { canonicalJson } from '@sa/domain';
import { sha256Hex } from '../src/auth/crypto';
import { fakeSign } from '../src/devices/attestation';
import { Session, bearer, http } from './helpers';

export const CENTER = { lat: 24.7136, lng: 46.6753 };
export const metersNorth = (m: number) => ({ lat: CENTER.lat + m / 111_195, lng: CENTER.lng });

/** عميل بصمة لجهاز مربوط: يطلب تحديًا ويوقّع الجسم كما يفعل الهاتف. */
export function punchClient(app: INestApplication, session: Session, keyId: string) {
  return {
    async signed(o: { type: string; at?: { lat: number; lng: number }; accuracy?: number }) {
      const ch = await http(app).post('/v1/attendance/challenges').set(bearer(session));
      if (ch.status !== 201) throw new Error(`challenge ${ch.status}`);
      const at = o.at ?? CENTER;
      const body = {
        challenge_id: ch.body.challenge_id as string,
        type: o.type,
        location_samples: [{ lat: at.lat, lng: at.lng, accuracy_m: o.accuracy ?? 10, captured_at: new Date().toISOString(), provider: 'gps' }],
        client_time: new Date().toISOString(),
        client_tz: 'Asia/Riyadh',
        app_version: '1.0.0',
        os: 'android',
        os_version: '14',
      };
      const hash = sha256Hex((ch.body.nonce as string) + canonicalJson(body));
      return { ...body, attestation: { key_id: keyId, signature: fakeSign(`fake-public-key:${keyId}`, hash) } };
    },
    send(payload: object) {
      return http(app).post('/v1/attendance/punches').set(bearer(session)).set('Idempotency-Key', crypto.randomUUID()).send(payload);
    },
  };
}
