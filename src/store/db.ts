// IndexedDB persistence. The ledger document is stored alongside the previous
// good copy so a corrupted write can be recovered on next launch.
import type { State } from '../engine/types';
import { validateState } from '../engine/validate';

const DB = 'aurelion-private', STORE = 'records';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(db => new Promise<T | undefined>((res, rej) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); res(r ? r.result : undefined); };
    t.onerror = t.onabort = () => { db.close(); rej(t.error); };
  }));
}
export const getRec = <T,>(key: string) => tx<T>('readonly', s => s.get(key) as IDBRequest<T>);
export function saveState(next: State, prev?: State | null): Promise<unknown> {
  return tx('readwrite', s => { if (prev) s.put(prev, 'backup'); s.put(next, 'state'); });
}
export const clearAll = () => tx('readwrite', s => { s.clear(); });

export type Loaded = { state: State | null; recovered: boolean };
/** Load and validate; fall back to the backup copy if the main record is damaged. */
export async function loadState(now: number): Promise<Loaded> {
  const main = await getRec<State>('state');
  if (main && validateState(main, now).length === 0) return { state: main, recovered: false };
  const backup = await getRec<State>('backup');
  if (backup && validateState(backup, now).length === 0) return { state: backup, recovered: true };
  return { state: null, recovered: !!main };
}
