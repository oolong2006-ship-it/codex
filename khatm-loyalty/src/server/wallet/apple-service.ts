import { one, q, pool } from "../db";
import { safeEqual } from "../domain/customers";
import { env } from "../env";
import { wallet } from ".";
import { passViewBySerial } from "./pass-view";

/**
 * Apple Wallet web service — https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
 * `segments` is the path after /api/wallet/apple/v1/.
 */
export async function appleWebService(method: string, segments: string[], headers: Headers, body: string, search: URLSearchParams): Promise<Response> {
  const passTypeId = env().APPLE_PASS_TYPE_ID;
  const auth = headers.get("authorization") ?? "";
  const token = auth.startsWith("ApplePass ") ? auth.slice(10).trim() : "";

  const authorized = async (serial: string) => {
    const c = await one<{ auth_token: string }>(`SELECT auth_token FROM cards WHERE serial_number = $1`, [serial]);
    return !!c && token.length > 0 && safeEqual(c.auth_token, token);
  };

  // POST /log
  if (segments[0] === "log" && method === "POST") {
    try {
      const logs = (JSON.parse(body) as { logs?: string[] }).logs ?? [];
      for (const l of logs.slice(0, 20)) console.warn("[apple-wallet]", String(l).slice(0, 500));
    } catch {
      /* ignore malformed log payloads */
    }
    return new Response(null, { status: 200 });
  }

  // /devices/{device}/registrations/{passType}[/{serial}]
  if (segments[0] === "devices" && segments[2] === "registrations") {
    const device = segments[1] ?? "";
    const type = segments[3] ?? "";
    const serial = segments[4];
    if (!/^[A-Za-z0-9]{1,128}$/.test(device) || type !== passTypeId) return new Response(null, { status: 404 });

    if (serial && (method === "POST" || method === "DELETE")) {
      if (!(await authorized(serial))) return new Response(null, { status: 401 });
      if (method === "DELETE") {
        await pool().query(`DELETE FROM wallet_registrations WHERE device_library_id = $1 AND serial_number = $2`, [device, serial]);
        return new Response(null, { status: 200 });
      }
      let pushToken = "";
      try {
        pushToken = String((JSON.parse(body) as { pushToken?: string }).pushToken ?? "");
      } catch {
        return new Response(null, { status: 400 });
      }
      if (!/^[A-Za-z0-9]{8,200}$/.test(pushToken)) return new Response(null, { status: 400 });
      const r = await pool().query(
        `INSERT INTO wallet_registrations(device_library_id, serial_number, push_token) VALUES ($1,$2,$3)
         ON CONFLICT (device_library_id, serial_number) DO UPDATE SET push_token = EXCLUDED.push_token
         RETURNING (xmax = 0) AS inserted`,
        [device, serial, pushToken],
      );
      return new Response(null, { status: r.rows[0]?.inserted ? 201 : 200 });
    }

    if (!serial && method === "GET") {
      const since = Number(search.get("passesUpdatedSince") ?? "0") || 0;
      const rows = await q<{ serial_number: string; updated: string }>(
        `SELECT c.serial_number, floor(extract(epoch FROM greatest(c.updated_at, p.updated_at)) * 1000)::bigint::text AS updated
         FROM wallet_registrations r
         JOIN cards c ON c.serial_number = r.serial_number
         JOIN loyalty_programs p ON p.id = c.program_id
         WHERE r.device_library_id = $1 AND floor(extract(epoch FROM greatest(c.updated_at, p.updated_at)) * 1000) > $2`,
        [device, since],
      );
      if (rows.length === 0) return new Response(null, { status: 204 });
      const lastUpdated = rows.reduce((m, r) => (BigInt(r.updated) > BigInt(m) ? r.updated : m), "0");
      return Response.json({ serialNumbers: rows.map((r) => r.serial_number), lastUpdated });
    }
  }

  // GET /passes/{passType}/{serial}
  if (segments[0] === "passes" && method === "GET") {
    const [, type, serial] = segments;
    if (type !== passTypeId || !serial) return new Response(null, { status: 404 });
    if (!(await authorized(serial))) return new Response(null, { status: 401 });
    const view = await passViewBySerial(serial);
    if (!view) return new Response(null, { status: 404 });
    const ims = headers.get("if-modified-since");
    if (ims && Math.floor(view.updatedAt.getTime() / 1000) <= Math.floor(new Date(ims).getTime() / 1000)) return new Response(null, { status: 304 });
    const buf = await wallet().buildApplePass(view);
    return new Response(new Uint8Array(buf), {
      headers: { "content-type": "application/vnd.apple.pkpass", "last-modified": view.updatedAt.toUTCString() },
    });
  }

  return new Response(null, { status: 404 });
}
