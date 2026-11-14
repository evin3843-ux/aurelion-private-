import { CURS } from './money';
import type { State } from './types';
import { reconcile } from './ledger';

const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
const int = (x: unknown) => typeof x === 'number' && Number.isSafeInteger(x);
const str = (x: unknown) => typeof x === 'string';
const cur = (x: unknown) => CURS.includes(x as any);

/** Structural and referential validation of persisted or imported data. Returns a list of problems. */
export function validateState(x: unknown, now = Date.now()): string[] {
  const e: string[] = [];
  if (!isObj(x)) return ['Not an Aurelion Private data file.'];
  if (x.schema !== 1) return ['Unsupported data version.'];
  if (!int(x.seq) || !int(x.inception)) e.push('Missing sequence or inception.');
  if (!isObj(x.profile) || !str(x.profile.name)) e.push('Invalid profile.');
  for (const k of ['accounts', 'txns', 'cards', 'recipients', 'holdings']) if (!Array.isArray(x[k])) return [...e, `Missing ${k}.`];
  if (!isObj(x.rates) || !CURS.every(c => int(x.rates[c]) && x.rates[c] > 0) || x.rates.USD !== 1_000_000) e.push('Invalid exchange rates.');
  const ids = new Set<string>();
  for (const a of x.accounts) {
    if (!isObj(a) || !str(a.id) || !str(a.name) || !str(a.ident) || !cur(a.currency) || typeof a.archived !== 'boolean') { e.push('Invalid account record.'); continue; }
    if (ids.has(a.id)) e.push('Duplicate account id.');
    ids.add(a.id);
  }
  const hids = new Set<string>();
  for (const h of x.holdings) {
    if (!isObj(h) || !str(h.id) || !str(h.name) || !Array.isArray(h.prices) || !h.prices.length || !h.prices.every((p: any) => isObj(p) && int(p.ts) && int(p.price) && p.price > 0) || !int(h.assumptionBps)) { e.push('Invalid holding record.'); continue; }
    hids.add(h.id);
  }
  const tids = new Set<string>();
  for (const t of x.txns) {
    if (!isObj(t) || !str(t.id) || !str(t.key) || !int(t.ts) || !str(t.type) || !str(t.description) || !str(t.category) || !Array.isArray(t.postings)) { e.push('Invalid transaction record.'); continue; }
    if (tids.has(t.id)) e.push('Duplicate transaction id.');
    tids.add(t.id);
    for (const p of t.postings) if (!isObj(p) || !ids.has(p.accountId) || !int(p.amount)) e.push(`Transaction ${t.id} has an invalid posting.`);
    if (t.settleAt != null && !int(t.settleAt)) e.push(`Transaction ${t.id} has an invalid settlement time.`);
    if (t.holding && (!isObj(t.holding) || !hids.has(t.holding.id) || !int(t.holding.qty) || !int(t.holding.price))) e.push(`Transaction ${t.id} references an unknown holding.`);
  }
  for (const c of x.cards) if (!isObj(c) || !str(c.id) || !str(c.nickname) || !ids.has(c.accountId) || !int(c.limit) || typeof c.frozen !== 'boolean') e.push('Invalid card record.');
  for (const r of x.recipients) if (!isObj(r) || !str(r.id) || !str(r.name) || !cur(r.currency)) e.push('Invalid recipient record.');
  if (e.length) return [...new Set(e)];
  return reconcile(x as unknown as State, now);
}
