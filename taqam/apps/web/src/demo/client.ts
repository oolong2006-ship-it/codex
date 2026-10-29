/**
 * In-browser replacement for the Shuoon REST API (loaded lazily by src/lib/api.ts when NEXT_PUBLIC_DEMO=1).
 * Requests are routed to the ported controllers below; state lives in memory and is persisted to localStorage.
 */
import { todayStr, day } from './dates';
import { clearDb, loadDb, saveDb, MAX_AGE_DAYS, type DB } from './db';
import { HttpError, forbidden, notFound } from './errors';
import { match, type Query } from './router';
import { assertCompanyAccess, sweepExpiry, touchActivity } from './lifecycle';
import { adminRoutes } from './routes-admin';
import { billingRoutes } from './routes-billing';
import { coreRoutes, resolveUser } from './routes-core';
import { moreRoutes } from './routes-more';
import { buildSeed } from './seed';
import { STAFF, Services, type AuthUser } from './services';

const routes = [...coreRoutes, ...moreRoutes, ...adminRoutes, ...billingRoutes];
let db: DB | null = null;

function fresh(): DB {
  const seeded = buildSeed();
  saveDb(seeded);
  return seeded;
}

function getDb(): DB {
  if (db) return db;
  const stored = typeof window !== 'undefined' ? loadDb() : null;
  const ageDays = stored ? (day(todayStr()).getTime() - day(stored.seededOn).getTime()) / 86400000 : Infinity;
  db = stored && ageDays <= MAX_AGE_DAYS ? stored : fresh();
  return db;
}

/** Wipes the browser copy and rebuilds the demo dataset. */
export function resetDemoData() {
  clearDb();
  db = fresh();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DemoResponse { status: number; data: unknown }

/** Handle one API call. Resolves with `{ status, data }` (errors use the API's `{ statusCode, message, messageAr }` body). */
export async function demoFetch(method: string, path: string, opts: { body?: unknown; query?: Record<string, unknown>; token?: string | null } = {}): Promise<DemoResponse> {
  await sleep(150 + Math.random() * 150);
  const state = getDb();
  const svc = new Services(state);
  const query: Query = {};
  for (const [k, val] of Object.entries(opts.query ?? {})) if (val !== undefined && val !== null && val !== '') query[k] = String(val);
  const body = (opts.body && typeof opts.body === 'object' ? JSON.parse(JSON.stringify(opts.body)) : {}) as Record<string, unknown>;
  try {
    const m = match(routes, method, path);
    if (!m) throw notFound(`Cannot ${method} ${path}`, 'العنصر غير موجود');
    let user = null as unknown as AuthUser;
    if (m.route.roles !== 'PUBLIC') {
      user = resolveUser(state, svc, opts.token ?? null);
      const isAdminPath = /^\/admin(\/|$)/.test(path);
      // Platform admins only reach /auth/* and /admin/*; company roles never reach /admin/*.
      if (user.role === 'SUPER_ADMIN' && !isAdminPath && !path.startsWith('/auth/')) throw forbidden();
      const roles = m.route.roles ?? STAFF;
      if (!roles.includes(user.role)) throw forbidden();
      if (user.role === 'SUPER_ADMIN') sweepExpiry(svc);
      else if (!user.impersonatedBy) {
        // Company status gate (PENDING / SUSPENDED / EXPIRED → 403 with code); support sessions bypass it.
        assertCompanyAccess(svc, user.companyId);
        touchActivity(svc, user.companyId);
      }
    }
    const result = m.route.handler({ db: state, svc, user, params: m.params, query, body });
    if (method !== 'GET' || svc.dirty || /\/(wps|export)$/.test(path)) saveDb(state);
    const status = method === 'POST' && !/\/(login|calculate|approve|reject|mark-paid|read|read-all|cancel|check-in|check-out|terminate|eosb|pay|void|run)$/.test(path) ? 201 : 200;
    return { status, data: result === undefined ? undefined : typeof result === 'string' ? result : JSON.parse(JSON.stringify(result)) };
  } catch (e) {
    if (svc.dirty) saveDb(state); // e.g. a lazy expiry recorded right before the 403
    if (e instanceof HttpError) return { status: e.status, data: e.toJSON() };
    console.error('[demo api]', method, path, e);
    return { status: 500, data: { statusCode: 500, message: 'Internal server error', messageAr: 'حدث خطأ غير متوقع' } };
  }
}
