import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  enqueuePunch,
  flushPunches,
  idbStore,
  localStorageStore,
  memoryStoreForTests,
  OFFLINE_QUEUE_LS_KEY,
  OfflineQueueUnavailableError,
  pendingPunches,
  resetOfflineQueueForTests,
  type QueuedPunch,
} from './offlineQueue';

const IN = { kind: 'IN' as const, lat: 24.7, lng: 46.6, capturedAt: '2026-10-31T05:00:00.000Z', employeeId: 'emp-A' };
const OUT = { kind: 'OUT' as const, lat: 24.7, lng: 46.6, capturedAt: '2026-10-31T13:00:00.000Z', employeeId: 'emp-A' };
const A = { employeeId: 'emp-A' };

afterEach(() => {
  resetOfflineQueueForTests();
  vi.unstubAllGlobals();
});

describe('offline punch queue', () => {
  beforeEach(() => resetOfflineQueueForTests(memoryStoreForTests()));

  it('enqueue twice, flush with a sender failing the 2nd → {sent:1, failed:1}; the failed one stays queued', async () => {
    await enqueuePunch(IN);
    await enqueuePunch(OUT);
    const sent: string[] = [];
    const res = await flushPunches(async (p) => {
      if (p.kind === 'OUT') throw new Error('network down');
      sent.push(p.kind);
    }, A);
    expect(res).toEqual({ sent: 1, failed: 1, rejected: 0, others: 0, lastError: expect.any(Error) });
    expect(sent).toEqual(['IN']);
    const left = await pendingPunches();
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject(OUT);

    expect(await flushPunches(async () => {}, A)).toEqual({ sent: 1, failed: 0, rejected: 0, others: 0 });
    expect(await pendingPunches()).toEqual([]);
  });

  it('sends in capture order and stops at the first transient failure (OUT never jumps ahead of IN)', async () => {
    await enqueuePunch(OUT);
    await enqueuePunch(IN);
    const tried: string[] = [];
    const offline = new Error('offline');
    const res = await flushPunches(async (p) => {
      tried.push(p.kind);
      throw offline;
    }, A);
    expect(tried).toEqual(['IN']);
    expect(res).toEqual({ sent: 0, failed: 2, rejected: 0, others: 0, lastError: offline });
    expect((await pendingPunches()).map((p) => p.kind)).toEqual(['IN', 'OUT']);
  });

  it('a permanent refusal is removed and reported, never dropped silently', async () => {
    await enqueuePunch(IN);
    await enqueuePunch(OUT);
    const reported: Array<[QueuedPunch, unknown]> = [];
    const refusal = Object.assign(new Error('window'), { status: 400 });
    const res = await flushPunches(
      async (p) => {
        if (p.kind === 'IN') throw refusal;
      },
      { ...A, isPermanent: (e) => (e as { status?: number }).status === 400, onRejected: (p, e) => reported.push([p, e]) },
    );
    expect(res).toEqual({ sent: 1, failed: 0, rejected: 1, others: 0 });
    expect(reported).toHaveLength(1);
    expect(reported[0][0]).toMatchObject(IN);
    expect(reported[0][1]).toBe(refusal);
    expect(await pendingPunches()).toEqual([]);
  });

  it('concurrent flushes (online event + page load) send each punch once', async () => {
    await enqueuePunch(IN);
    let calls = 0;
    const send = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
    };
    const [a, b] = await Promise.all([flushPunches(send, A), flushPunches(send, A)]);
    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });

  it('one browser, two users: only the signed-in employee\'s punches are sent; the others stay queued', async () => {
    await enqueuePunch(IN);
    await enqueuePunch({ ...OUT, employeeId: 'emp-B' });
    const sent: string[] = [];
    const res = await flushPunches(async (p) => { sent.push(`${p.employeeId}:${p.kind}`); }, A);
    expect(sent).toEqual(['emp-A:IN']);
    expect(res).toEqual({ sent: 1, failed: 0, rejected: 0, others: 1 });
    expect(await pendingPunches('emp-A')).toEqual([]);
    expect(await pendingPunches('emp-B')).toEqual([expect.objectContaining({ kind: 'OUT', employeeId: 'emp-B' })]);
    expect(await pendingPunches()).toHaveLength(1);
    // B signs in later on the same browser: B's punch goes with B's session
    const res2 = await flushPunches(async (p) => { sent.push(`${p.employeeId}:${p.kind}`); }, { employeeId: 'emp-B' });
    expect(res2).toEqual({ sent: 1, failed: 0, rejected: 0, others: 0 });
    expect(sent).toEqual(['emp-A:IN', 'emp-B:OUT']);
  });

  it('stores the branch code typed offline with the punch', async () => {
    await enqueuePunch({ ...IN, branchCode: '482913' });
    expect((await pendingPunches('emp-A'))[0].branchCode).toBe('482913');
  });

  it('keeps the exact capturedAt so a replay is idempotent on the server', async () => {
    await enqueuePunch(IN);
    const [p] = await pendingPunches();
    expect(p.capturedAt).toBe(IN.capturedAt);
    expect(p.id).toBeTruthy();
  });
});

describe('storage backends and fallback', () => {
  it('falls back to localStorage when IndexedDB is unavailable (e.g. private mode)', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
    resetOfflineQueueForTests();
    await enqueuePunch(IN);
    expect(JSON.parse(store.get(OFFLINE_QUEUE_LS_KEY)!)).toEqual([expect.objectContaining(IN)]);
    expect(await flushPunches(async () => {}, A)).toEqual({ sent: 1, failed: 0, rejected: 0, others: 0 });
    expect(JSON.parse(store.get(OFFLINE_QUEUE_LS_KEY)!)).toEqual([]);
  });

  it('falls back to localStorage when opening IndexedDB throws', async () => {
    const store = new Map<string, string>();
    vi.stubGlobal('indexedDB', { open: () => { throw new Error('InvalidStateError'); } });
    vi.stubGlobal('window', { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) } });
    resetOfflineQueueForTests();
    await enqueuePunch(IN);
    expect(store.has(OFFLINE_QUEUE_LS_KEY)).toBe(true);
  });

  it('with no storage at all, enqueue rejects (the UI shows an error) instead of losing the punch', async () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => {} } });
    resetOfflineQueueForTests();
    await expect(enqueuePunch(IN)).rejects.toBeInstanceOf(OfflineQueueUnavailableError);
  });

  it('localStorageStore round-trips', async () => {
    const store = new Map<string, string>();
    const s = localStorageStore({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v), removeItem: (k) => void store.delete(k) });
    await s.put({ id: 'a', ...IN });
    await s.put({ id: 'b', ...OUT });
    await s.remove('a');
    expect(await s.all()).toEqual([{ id: 'b', ...OUT }]);
  });

  it('idbStore round-trips through IndexedDB', async () => {
    const s = await idbStore(fakeIndexedDB());
    await s.put({ id: 'a', ...IN });
    await s.put({ id: 'b', ...OUT });
    await s.remove('a');
    expect(await s.all()).toEqual([{ id: 'b', ...OUT }]);
  });
});

/** Just enough of IndexedDB for the queue: one database, one object store keyed by `id`. */
function fakeIndexedDB(): IDBFactory {
  const data = new Map<string, unknown>();
  const later = (fn: () => void) => setTimeout(fn, 0);
  const request = <T>(run: () => T) => {
    const r: { result?: T; error?: unknown; onsuccess?: () => void; onerror?: () => void } = {};
    later(() => {
      try { r.result = run(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); }
    });
    return r;
  };
  let created = false;
  const db = {
    objectStoreNames: { contains: () => created },
    createObjectStore: () => { created = true; },
    transaction: () => {
      const tx: { oncomplete?: () => void; onerror?: () => void; onabort?: () => void; objectStore: () => unknown } = {
        objectStore: () => ({
          put: (v: { id: string }) => request(() => { data.set(v.id, structuredClone(v)); return v.id; }),
          delete: (k: string) => request(() => { data.delete(k); }),
          getAll: () => request(() => [...data.values()].map((v) => structuredClone(v))),
        }),
      };
      setTimeout(() => tx.oncomplete?.(), 5);
      return tx;
    },
    close: () => {},
  };
  return {
    open: () => {
      const r: { result?: unknown; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
      later(() => {
        r.result = db;
        if (!created) r.onupgradeneeded?.();
        r.onsuccess?.();
      });
      return r;
    },
  } as unknown as IDBFactory;
}
