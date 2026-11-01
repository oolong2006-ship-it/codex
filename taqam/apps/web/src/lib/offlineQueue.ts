/**
 * Offline ESS punches (spec §6): when there is no connection the punch is kept on the device with the
 * time it was captured and replayed later with `capturedAt` (the server accepts the last 12 hours and
 * flags it OFFLINE). Storage: IndexedDB, falling back to localStorage (e.g. private mode). With no
 * storage at all `enqueuePunch` rejects so the UI can tell the employee — a punch is never lost silently.
 * Replays are idempotent on the server, so resending after a lost response is safe.
 */

export type PunchKind = 'IN' | 'OUT';
export interface PunchInput {
  kind: PunchKind; lat: number; lng: number; capturedAt: string;
  /** the signed-in employee who punched: a shared browser never sends one user's punch with another's session */
  employeeId: string;
  /** branch code shown on the kiosk when the punch was captured (verified by the server against capturedAt) */
  branchCode?: string;
}
export interface QueuedPunch extends PunchInput { id: string }

export interface PunchStore {
  all(): Promise<QueuedPunch[]>;
  put(p: QueuedPunch): Promise<void>;
  remove(id: string): Promise<void>;
}

export class OfflineQueueUnavailableError extends Error {
  constructor() {
    super('Offline storage is unavailable on this device');
    this.name = 'OfflineQueueUnavailableError';
  }
}

export const OFFLINE_QUEUE_LS_KEY = 'shuoon.offlinePunches';
const DB_NAME = 'shuoon-offline';
const STORE = 'punches';

// ---------- backends ----------
function promisify<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** IndexedDB-backed store (rejects when the database cannot be opened). */
export async function idbStore(idb: IDBFactory): Promise<PunchStore> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const r = idb.open(DB_NAME, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
  const write = (op: (s: IDBObjectStore) => IDBRequest) =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      op(tx.objectStore(STORE)).onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  return {
    all: () => promisify(db.transaction(STORE, 'readonly').objectStore(STORE).getAll() as IDBRequest<QueuedPunch[]>),
    put: (p) => write((s) => s.put(p)),
    remove: (id) => write((s) => s.delete(id)),
  };
}

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** localStorage-backed store (the fallback). */
export function localStorageStore(ls: KV): PunchStore {
  const read = (): QueuedPunch[] => {
    try {
      const v = JSON.parse(ls.getItem(OFFLINE_QUEUE_LS_KEY) || '[]');
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const save = (list: QueuedPunch[]) => ls.setItem(OFFLINE_QUEUE_LS_KEY, JSON.stringify(list));
  return {
    all: async () => read(),
    put: async (p) => save([...read().filter((x) => x.id !== p.id), p]),
    remove: async (id) => save(read().filter((x) => x.id !== id)),
  };
}

/** In-memory store for unit tests only (it would lose punches on reload, so the app never uses it). */
export function memoryStoreForTests(): PunchStore {
  const m = new Map<string, QueuedPunch>();
  return {
    all: async () => [...m.values()].map((p) => ({ ...p })),
    put: async (p) => void m.set(p.id, { ...p }),
    remove: async (id) => void m.delete(id),
  };
}

async function detectStore(): Promise<PunchStore | null> {
  const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (idb) {
    try {
      return await idbStore(idb);
    } catch {
      /* private mode / blocked → localStorage */
    }
  }
  try {
    const ls = typeof window !== 'undefined' ? window.localStorage : undefined;
    if (ls) {
      const probe = `${OFFLINE_QUEUE_LS_KEY}.probe`;
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return localStorageStore(ls);
    }
  } catch {
    /* storage blocked */
  }
  return null;
}

let storePromise: Promise<PunchStore | null> | null = null;
const inflight = new Map<string, Promise<FlushResult>>();

function getStore() {
  return (storePromise ??= detectStore());
}

/** Test hook: forget the detected backend (or force one). */
export function resetOfflineQueueForTests(store?: PunchStore | null) {
  storePromise = store === undefined ? null : Promise.resolve(store);
  inflight.clear();
}

function newId() {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  return c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------- API ----------
/** Keeps a punch on this device until it can be sent. Rejects with OfflineQueueUnavailableError when nothing can store it. */
export async function enqueuePunch(p: PunchInput): Promise<void> {
  const store = await getStore();
  if (!store) throw new OfflineQueueUnavailableError();
  try {
    await store.put({
      id: newId(), kind: p.kind, lat: p.lat, lng: p.lng, capturedAt: p.capturedAt, employeeId: p.employeeId,
      ...(p.branchCode ? { branchCode: p.branchCode } : {}),
    });
  } catch {
    throw new OfflineQueueUnavailableError();
  }
}

/** Punches waiting to be sent, oldest first (only this employee's when `employeeId` is given). */
export async function pendingPunches(employeeId?: string): Promise<QueuedPunch[]> {
  const store = await getStore();
  if (!store) return [];
  const list = await store.all();
  return list.filter((p) => employeeId === undefined || p.employeeId === employeeId).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
}

export interface FlushResult {
  sent: number;
  /** kept queued after a temporary failure (it and everything after it) */
  failed: number;
  /** refused for good, removed and reported through onRejected */
  rejected: number;
  /** other users' punches on this browser, left queued for their own session */
  others: number;
  /** the temporary failure that stopped the flush */
  lastError?: unknown;
}
export interface FlushOptions {
  /** the signed-in employee: only their punches are sent */
  employeeId: string;
  /** A failure the server will never accept (e.g. 400 outside 12 hours): drop it from the queue and report it. */
  isPermanent?: (err: unknown, p: QueuedPunch) => boolean;
  onRejected?: (p: QueuedPunch, err: unknown) => void;
}

/**
 * Sends queued punches oldest first. A transient failure stops the flush and keeps it and everything after
 * it queued (`failed`), so a check-out never overtakes its check-in. Concurrent calls share one flush.
 */
export function flushPunches(send: (p: QueuedPunch) => Promise<void>, opts: FlushOptions): Promise<FlushResult> {
  const running = inflight.get(opts.employeeId);
  if (running) return running;
  const run = (async () => {
    const store = await getStore();
    const res: FlushResult = { sent: 0, failed: 0, rejected: 0, others: 0 };
    if (!store) return res;
    const all = await pendingPunches();
    const list = all.filter((p) => p.employeeId === opts.employeeId);
    res.others = all.length - list.length;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      try {
        await send(p);
        await store.remove(p.id);
        res.sent++;
      } catch (err) {
        if (opts.isPermanent?.(err, p)) {
          await store.remove(p.id);
          res.rejected++;
          opts.onRejected?.(p, err);
          continue;
        }
        res.failed = list.length - i;
        res.lastError = err;
        break;
      }
    }
    return res;
  })().finally(() => {
    inflight.delete(opts.employeeId);
  });
  inflight.set(opts.employeeId, run);
  return run;
}
