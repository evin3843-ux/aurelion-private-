import { useSyncExternalStore } from 'react';
import * as L from '../engine/ledger';
import type { Cur } from '../engine/money';
import type { State } from '../engine/types';
import { validateState } from '../engine/validate';
import { clearAll, loadState, saveState } from './db';

export type Tab = 'home' | 'accounts' | 'cards' | 'wealth' | 'activity';
export type SheetSpec =
  | { t: 'transfer'; from?: string; to?: string; external?: boolean }
  | { t: 'move'; mode: 'deposit' | 'withdraw'; accountId?: string }
  | { t: 'convert' } | { t: 'newAccount' } | { t: 'settings' } | { t: 'recipients' }
  | { t: 'recipient'; id?: string }
  | { t: 'account'; id: string } | { t: 'txn'; id: string }
  | { t: 'cardSettings'; id: string } | { t: 'cardSpend'; id: string }
  | { t: 'holding'; id: string } | { t: 'trade'; mode: 'new' | 'buy' | 'sell'; id?: string }
  | { t: 'pin' };
export interface Prefs {
  hide: boolean; privacy: boolean; motion: 'system' | 'reduce' | 'full';
  theme: 'obsidian' | 'graphite'; accent: 'champagne' | 'platinum'; cur: Cur;
  notifSettle: boolean; notifCard: boolean; notifSystem: boolean;
  lock?: { salt: string; hash: string };
}
const PREF_KEY = 'aurelion.prefs';
const defaults: Prefs = { hide: false, privacy: false, motion: 'system', theme: 'obsidian', accent: 'champagne', cur: 'USD', notifSettle: true, notifCard: true, notifSystem: false };
function readPrefs(): Prefs {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return defaults; }
}

export interface Toast { id: number; text: string; tone?: 'ok' | 'warn' }
interface Snap {
  s: State | null; now: number; ready: boolean; error?: string;
  tab: Tab; sheets: { id: number; spec: SheetSpec }[]; prefs: Prefs; locked: boolean; toasts: Toast[];
}
let snap: Snap = { s: null, now: Date.now(), ready: false, tab: 'home', sheets: [], prefs: readPrefs(), locked: !!readPrefs().lock, toasts: [] };
const subs = new Set<() => void>();
const set = (p: Partial<Snap>) => { snap = { ...snap, ...p }; subs.forEach(f => f()); };
export const getSnap = () => snap;
export const useApp = () => useSyncExternalStore(f => { subs.add(f); return () => subs.delete(f); }, getSnap);

let uid = 1;
export const newKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${uid++}`;

/* ── persistence ── */
let chain: Promise<unknown> = Promise.resolve();
function persist(next: State, prev: State | null) {
  chain = chain.then(() => saveState(next, prev)).catch(() => toast('Changes could not be saved on this device.', 'warn'));
}
export async function boot() {
  const now = Date.now();
  try {
    const { state, recovered } = await loadState(now);
    const s = state ?? L.createInitial(now);
    if (!state) await saveState(s);
    set({ s, now, ready: true });
    if (recovered) toast(state ? 'Stored data was damaged; the last good copy was restored.' : 'Stored data could not be read; the simulation was started afresh.', 'warn');
  } catch {
    // IndexedDB unavailable (e.g. private mode): run in memory.
    set({ s: L.createInitial(now), now, ready: true });
    toast('Device storage is unavailable; changes will not persist.', 'warn');
  }
  setInterval(tick, 4000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && snap.prefs.lock) set({ locked: true });
    document.documentElement.toggleAttribute('data-away', document.hidden && snap.prefs.privacy);
    if (!document.hidden) tick();
  });
}
function tick() {
  const now = Date.now(), s = snap.s;
  if (s) for (const t of s.txns) {
    if (t.settleAt && t.cancelledAt == null && t.settleAt > snap.now && t.settleAt <= now && snap.prefs.notifSettle) announce('Payment settled', t.description);
  }
  set({ now });
}

/* ── actions ── */
export type Result = { ok: true } | { ok: false; error: string; code?: string };
/** Apply a pure engine function. Duplicate submissions are ignored silently. */
export function act(fn: (s: State, now: number) => State): Result {
  const prev = snap.s;
  if (!prev) return { ok: false, error: 'Not ready.' };
  const now = Date.now();
  try {
    const next = fn(prev, now);
    set({ s: next, now });
    persist(next, prev);
    return { ok: true };
  } catch (e) {
    if (e instanceof L.EngineError) return e.code === 'DUPLICATE' ? { ok: true } : { ok: false, error: e.message, code: e.code };
    return { ok: false, error: 'Something went wrong. Nothing was changed.' };
  }
}
export function replaceState(next: State) { const prev = snap.s; set({ s: next, now: Date.now() }); persist(next, prev); }
export async function resetAll(opening: number) {
  const now = Date.now();
  const s = L.createInitial(now, opening, snap.s?.profile);
  await clearAll().catch(() => {});
  set({ s, now, sheets: [], tab: 'home' });
  persist(s, null);
}
export function exportJson(): string {
  return JSON.stringify({ app: 'aurelion-private', kind: 'financial-simulation', schema: 1, exportedAt: new Date().toISOString(), state: snap.s }, null, 2);
}
export function importJson(text: string): Result {
  let data: any;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (data?.app !== 'aurelion-private') return { ok: false, error: 'This is not an Aurelion Private backup.' };
  const errs = validateState(data.state, Date.now());
  if (errs.length) return { ok: false, error: errs[0] };
  replaceState(data.state);
  return { ok: true };
}

/* ── ui ── */
let sid = 1;
export const go = (tab: Tab) => set({ tab });
export const openSheet = (spec: SheetSpec) => set({ sheets: [...snap.sheets, { id: sid++, spec }] });
export const closeSheet = (id: number) => set({ sheets: snap.sheets.filter(x => x.id !== id) });
export function setPrefs(p: Partial<Prefs>) {
  const prefs = { ...snap.prefs, ...p };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  set({ prefs });
}
export const setLocked = (locked: boolean) => set({ locked });
export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const id = uid++;
  set({ toasts: [...snap.toasts, { id, text, tone }] });
  setTimeout(() => set({ toasts: snap.toasts.filter(t => t.id !== id) }), 3600);
}
export function announce(title: string, body: string) {
  toast(`${title} · ${body}`);
  if (snap.prefs.notifSystem && 'Notification' in window && Notification.permission === 'granted') {
    const opts = { body: `${body} — Financial simulation`, icon: './icons/icon-192.png' };
    navigator.serviceWorker?.getRegistration().then(r => { if (r) return r.showNotification(title, opts); new Notification(title, opts); }).catch(() => {});
  }
}
export const reducedMotion = () =>
  snap.prefs.motion === 'reduce' || (snap.prefs.motion === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

/* ── local app lock (privacy only; not banking-grade authentication) ── */
async function digest(salt: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(salt + ':' + pin);
  if (crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) | 0;
  return 'f' + (h >>> 0).toString(16);
}
export async function setPin(pin: string) { const salt = newKey(); setPrefs({ lock: { salt, hash: await digest(salt, pin) } }); }
export const clearPin = () => setPrefs({ lock: undefined });
export async function checkPin(pin: string) { const l = snap.prefs.lock; return !l || (await digest(l.salt, pin)) === l.hash; }
