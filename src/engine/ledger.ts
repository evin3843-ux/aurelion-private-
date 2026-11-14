// Deterministic fictional ledger. Every function is pure: (state, input, now) → new state.
// Balances are never stored; they are always derived from postings.
import { convert, mulDiv, QTY_SCALE, RATE_SCALE, type Cur, type Rates } from './money';
import type { Account, AssetClass, Card, Holding, Recipient, State, Txn, TxnStatus } from './types';

export class EngineError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
const fail = (code: string, msg: string): never => { throw new EngineError(code, msg); };

export const PENDING_MS = 120_000; // external payments settle after two minutes
export const DEFAULT_OPENING = 2_000_000_000; // $20,000,000.00
export const DEFAULT_RATES: Rates = { USD: 1_000_000, AED: 3_672_500, EUR: 920_000, GBP: 790_000, CHF: 880_000 };

/* ───────── selectors ───────── */
export const eff = (t: Txn) => t.settleAt ?? t.ts;
export const statusOf = (t: Txn, now: number): TxnStatus =>
  t.cancelledAt != null ? 'cancelled' : eff(t) > now ? 'pending' : 'completed';

export type Bal = { balance: number; available: number };
export function balances(s: State, now: number): Record<string, Bal> {
  const out: Record<string, Bal> = {};
  for (const a of s.accounts) out[a.id] = { balance: 0, available: 0 };
  for (const t of s.txns) {
    const st = statusOf(t, now);
    if (st === 'cancelled') continue;
    for (const p of t.postings) {
      const b = out[p.accountId];
      if (!b) continue;
      if (st === 'completed') { b.balance += p.amount; b.available += p.amount; }
      else if (p.amount < 0) b.available += p.amount; // pending debits are held
    }
  }
  return out;
}
export function balanceAt(s: State, accountId: string, t: number): number {
  let v = 0;
  for (const x of s.txns) {
    if (x.cancelledAt != null || eff(x) > t) continue;
    for (const p of x.postings) if (p.accountId === accountId) v += p.amount;
  }
  return v;
}
export const priceAt = (h: Holding, t: number): number => {
  let p = h.prices[0]?.price ?? 0;
  for (const x of h.prices) if (x.ts <= t) p = x.price;
  return p;
};
export const valueOf = (qty: number, price: number) => mulDiv(qty, price, QTY_SCALE);

export interface Position {
  holding: Holding; qty: number; price: number; value: number; cost: number;
  gain: number; gainBps: number; realised: number;
}
export function positions(s: State, now: number): Position[] {
  const acc: Record<string, { qty: number; cost: number; realised: number }> = {};
  for (const h of s.holdings) acc[h.id] = { qty: 0, cost: 0, realised: 0 };
  for (const t of [...s.txns].sort((a, b) => a.ts - b.ts)) {
    if (!t.holding || statusOf(t, now) !== 'completed') continue;
    const a = acc[t.holding.id];
    if (!a) continue;
    const { qty, price } = t.holding;
    if (qty > 0) { a.qty += qty; a.cost += valueOf(qty, price); }
    else {
      const sold = -qty;
      const part = a.qty === 0 ? 0 : mulDiv(a.cost, sold, a.qty);
      a.realised += valueOf(sold, price) - part;
      a.cost -= part; a.qty -= sold;
    }
  }
  return s.holdings.map(h => {
    const a = acc[h.id];
    const price = priceAt(h, now);
    const value = valueOf(a.qty, price);
    const gain = value - a.cost;
    return { holding: h, qty: a.qty, price, value, cost: a.cost, gain, gainBps: a.cost > 0 ? mulDiv(gain, 10_000, a.cost) : 0, realised: a.realised };
  });
}
export function holdingsValueAt(s: State, t: number): number {
  const qty: Record<string, number> = {};
  for (const x of s.txns) {
    if (!x.holding || x.cancelledAt != null || eff(x) > t) continue;
    qty[x.holding.id] = (qty[x.holding.id] ?? 0) + x.holding.qty;
  }
  let v = 0;
  for (const h of s.holdings) v += valueOf(qty[h.id] ?? 0, priceAt(h, t));
  return v;
}
export function cashAt(s: State, t: number, cur: Cur): number {
  let v = 0;
  for (const a of s.accounts) v += convert(balanceAt(s, a.id, t), a.currency, cur, s.rates);
  return v;
}
/** Total wealth = Σ account balances + Σ holdings, expressed in `cur`. */
export const wealthAt = (s: State, t: number, cur: Cur = 'USD'): number =>
  cashAt(s, t, cur) + convert(holdingsValueAt(s, t), 'USD', cur, s.rates);

export type Pt = { t: number; v: number };
/** Step series of f over [from,to] with a point either side of every ledger event. */
export function series(s: State, from: number, to: number, f: (t: number) => number, accountId?: string): Pt[] {
  const times = new Set<number>();
  for (const x of s.txns) {
    if (x.cancelledAt != null) continue;
    if (accountId && !x.postings.some(p => p.accountId === accountId)) continue;
    const e = eff(x);
    if (e > from && e <= to) times.add(e);
  }
  if (!accountId) for (const h of s.holdings) for (const p of h.prices) if (p.ts > from && p.ts <= to) times.add(p.ts);
  const pts: Pt[] = [{ t: from, v: f(from) }];
  if (times.size > 200) {
    for (let i = 1; i < 160; i++) { const t = from + Math.round(((to - from) * i) / 160); pts.push({ t, v: f(t) }); }
  } else {
    for (const e of [...times].sort((a, b) => a - b)) pts.push({ t: e - 1, v: f(e - 1) }, { t: e, v: f(e) });
  }
  pts.push({ t: to, v: f(to) });
  return pts;
}

export const monthStart = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };
export const addMonths = (t: number, n: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime(); };

/** Inflow and outflow of completed postings on an account in [from,to). */
export function flow(s: State, accountId: string, from: number, to: number, now: number) {
  let inflow = 0, outflow = 0;
  for (const t of s.txns) {
    if (statusOf(t, now) !== 'completed' || t.type === 'opening') continue;
    const e = eff(t);
    if (e < from || e >= to) continue;
    for (const p of t.postings) if (p.accountId === accountId) { if (p.amount > 0) inflow += p.amount; else outflow -= p.amount; }
  }
  return { inflow, outflow };
}
/** Movement of total wealth from outside-world flows (not internal transfers) in [from,to), USD. */
export function netFlow(s: State, from: number, to: number, now: number) {
  let inflow = 0, outflow = 0;
  const cur = (id: string) => s.accounts.find(a => a.id === id)?.currency ?? 'USD';
  for (const t of s.txns) {
    if (statusOf(t, now) !== 'completed' || ['opening', 'transfer', 'buy', 'sell'].includes(t.type)) continue;
    const e = eff(t);
    if (e < from || e >= to) continue;
    for (const p of t.postings) {
      const usd = convert(p.amount, cur(p.accountId), 'USD', s.rates);
      if (usd > 0) inflow += usd; else outflow -= usd;
    }
  }
  return { inflow, outflow };
}
/** Spending by category in USD (card, payment, withdrawal; net of refunds). */
export function spending(s: State, from: number, to: number, now: number, f: { accountId?: string; cardId?: string } = {}) {
  const by: Record<string, number> = {};
  const cur = (id: string) => s.accounts.find(a => a.id === id)?.currency ?? 'USD';
  for (const t of s.txns) {
    if (statusOf(t, now) !== 'completed') continue;
    if (!['card', 'payment', 'withdrawal', 'refund'].includes(t.type)) continue;
    if (f.cardId && t.cardId !== f.cardId) continue;
    const e = eff(t);
    if (e < from || e >= to) continue;
    for (const p of t.postings) {
      if (f.accountId && p.accountId !== f.accountId) continue;
      by[t.category] = (by[t.category] ?? 0) - convert(p.amount, cur(p.accountId), 'USD', s.rates);
    }
  }
  const rows = Object.entries(by).filter(([, v]) => v > 0).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
  return { rows, total: rows.reduce((n, r) => n + r.amount, 0) };
}
/** Card spend this month in USD: pending and completed purchases, less refunds. */
export function cardSpent(s: State, cardId: string, now: number): number {
  const from = monthStart(now);
  const cur = (id: string) => s.accounts.find(a => a.id === id)?.currency ?? 'USD';
  let v = 0;
  for (const t of s.txns) {
    if (t.cardId !== cardId || t.cancelledAt != null || t.ts < from) continue;
    for (const p of t.postings) v -= convert(p.amount, cur(p.accountId), 'USD', s.rates);
  }
  return Math.max(0, v);
}
export const isRefunded = (s: State, id: string) => s.txns.some(t => t.refundOf === id);

/* ───────── helpers ───────── */
const posInt = (n: number, what = 'an amount') => { if (!Number.isSafeInteger(n) || n <= 0) fail('AMOUNT', `Enter ${what} greater than zero.`); };
function acct(s: State, id: string): Account {
  const a = s.accounts.find(x => x.id === id);
  if (!a) return fail('ACCOUNT', 'Account not found.');
  if (a.archived) fail('ARCHIVED', `${a.name} is archived.`);
  return a;
}
function need(s: State, now: number, a: Account, amount: number) {
  if (balances(s, now)[a.id].available < amount) fail('INSUFFICIENT', `Insufficient available funds in ${a.name}.`);
}
function post(s: State, t: Omit<Txn, 'id'>): State {
  if (!t.key) fail('KEY', 'Missing idempotency key.');
  if (s.txns.some(x => x.key === t.key)) fail('DUPLICATE', 'This instruction was already recorded.');
  for (const p of t.postings) if (!Number.isSafeInteger(p.amount) || p.amount === 0) fail('AMOUNT', 'Invalid posting amount.');
  const seq = s.seq + 1;
  return { ...s, seq, txns: [...s.txns, { ...t, id: 'T' + seq }] };
}
const clean = (v: string, max = 80) => v.trim().slice(0, max);

/* ───────── money movement ───────── */
export interface Base { key: string; description?: string; category?: string; note?: string }

export function deposit(s: State, i: Base & { accountId: string; amount: number }, now: number): State {
  const a = acct(s, i.accountId); posInt(i.amount);
  return post(s, { key: i.key, ts: now, type: 'deposit', description: clean(i.description || 'Funds received'), category: i.category || 'Income', note: i.note, postings: [{ accountId: a.id, amount: i.amount }] });
}
export function withdraw(s: State, i: Base & { accountId: string; amount: number }, now: number): State {
  const a = acct(s, i.accountId); posInt(i.amount); need(s, now, a, i.amount);
  return post(s, { key: i.key, ts: now, type: 'withdrawal', description: clean(i.description || 'Withdrawal'), category: i.category || 'Other', note: i.note, postings: [{ accountId: a.id, amount: -i.amount }] });
}
/** Internal transfer. `amount` is in the source account's currency. */
export function transfer(s: State, i: Base & { from: string; to: string; amount: number }, now: number): State {
  if (i.from === i.to) fail('SAME', 'Choose two different accounts.');
  const a = acct(s, i.from), b = acct(s, i.to); posInt(i.amount); need(s, now, a, i.amount);
  const credit = convert(i.amount, a.currency, b.currency, s.rates);
  if (credit <= 0) fail('AMOUNT', 'Amount is too small to convert.');
  return post(s, {
    key: i.key, ts: now, type: 'transfer', description: clean(i.description || `Transfer to ${b.name}`), category: 'Transfer', note: i.note,
    postings: [{ accountId: a.id, amount: -i.amount }, { accountId: b.id, amount: credit }],
    fx: a.currency === b.currency ? undefined : { from: a.currency, to: b.currency, rate: mulDiv(s.rates[b.currency], RATE_SCALE, s.rates[a.currency]) },
  });
}
/** Payment to an external fictional recipient. `amount` is in `cur`; settles after PENDING_MS. */
export function pay(s: State, i: Base & { from: string; recipientId: string; amount: number; cur: Cur }, now: number): State {
  const a = acct(s, i.from); posInt(i.amount);
  const r = s.recipients.find(x => x.id === i.recipientId) ?? fail('RECIPIENT', 'Recipient not found.');
  const debit = convert(i.amount, i.cur, a.currency, s.rates);
  posInt(debit); need(s, now, a, debit);
  return post(s, {
    key: i.key, ts: now, settleAt: now + PENDING_MS, type: 'payment', recipientId: r.id,
    description: clean(i.description || `Payment to ${r.name}`), category: i.category || 'Services', note: i.note,
    postings: [{ accountId: a.id, amount: -debit }], sent: { cur: i.cur, amount: i.amount },
    fx: i.cur === a.currency ? undefined : { from: a.currency, to: i.cur, rate: mulDiv(s.rates[i.cur], RATE_SCALE, s.rates[a.currency]) },
  });
}
export function cancel(s: State, id: string, now: number): State {
  const t = s.txns.find(x => x.id === id) ?? fail('TXN', 'Transaction not found.');
  if (statusOf(t, now) !== 'pending') fail('STATE', 'Only pending transactions can be cancelled.');
  return { ...s, txns: s.txns.map(x => (x.id === id ? { ...x, cancelledAt: now } : x)) };
}
export function settleNow(s: State, id: string, now: number): State {
  const t = s.txns.find(x => x.id === id) ?? fail('TXN', 'Transaction not found.');
  if (statusOf(t, now) !== 'pending') fail('STATE', 'This transaction is not pending.');
  return { ...s, txns: s.txns.map(x => (x.id === id ? { ...x, settleAt: now } : x)) };
}
export function cardSpend(s: State, i: Base & { cardId: string; amount: number }, now: number): State {
  const c = s.cards.find(x => x.id === i.cardId) ?? fail('CARD', 'Card not found.');
  if (c.frozen) fail('FROZEN', `${c.nickname} is frozen. Unfreeze it to authorise purchases.`);
  const a = acct(s, c.accountId); posInt(i.amount);
  const usd = convert(i.amount, a.currency, 'USD', s.rates);
  if (cardSpent(s, c.id, now) + usd > c.limit) fail('LIMIT', 'This purchase exceeds the card’s monthly limit.');
  need(s, now, a, i.amount);
  return post(s, { key: i.key, ts: now, type: 'card', cardId: c.id, description: clean(i.description || 'Card purchase'), category: i.category || 'Other', note: i.note, postings: [{ accountId: a.id, amount: -i.amount }] });
}
export function refund(s: State, i: { key: string; txnId: string }, now: number): State {
  const t = s.txns.find(x => x.id === i.txnId) ?? fail('TXN', 'Transaction not found.');
  if (!['card', 'payment'].includes(t.type) || statusOf(t, now) !== 'completed') fail('STATE', 'Only completed purchases and payments can be refunded.');
  if (isRefunded(s, t.id)) fail('REFUNDED', 'This transaction has already been refunded.');
  for (const p of t.postings) acct(s, p.accountId);
  return post(s, { key: i.key, ts: now, type: 'refund', refundOf: t.id, cardId: t.cardId, recipientId: t.recipientId, description: `Refund · ${t.description}`, category: t.category, postings: t.postings.map(p => ({ accountId: p.accountId, amount: -p.amount })) });
}
export function editTxn(s: State, id: string, patch: { category?: string; note?: string; description?: string }): State {
  return { ...s, txns: s.txns.map(t => (t.id === id ? { ...t, ...patch, description: patch.description != null ? clean(patch.description) || t.description : t.description } : t)) };
}

/* ───────── hypothetical investments ───────── */
export function buy(
  s: State,
  i: { key: string; accountId: string; qty: number; price: number; holdingId?: string; create?: { name: string; symbol: string; cls: AssetClass; assumptionBps: number } },
  now: number,
): State {
  const a = acct(s, i.accountId);
  if (a.currency !== 'USD') fail('CURRENCY', 'Investments are funded from USD accounts.');
  posInt(i.qty, 'a quantity'); posInt(i.price, 'a price');
  const cost = valueOf(i.qty, i.price); posInt(cost); need(s, now, a, cost);
  let n = s, h = s.holdings.find(x => x.id === i.holdingId);
  if (!h) {
    if (!i.create || !clean(i.create.name)) fail('HOLDING', 'Give the holding a name.');
    const seq = s.seq + 1;
    h = { id: 'H' + seq, name: clean(i.create!.name, 40), symbol: clean(i.create!.symbol, 8).toUpperCase() || 'HYP', cls: i.create!.cls, prices: [{ ts: now, price: i.price }], assumptionBps: i.create!.assumptionBps };
    n = { ...s, seq, holdings: [...s.holdings, h] };
  } else if (priceAt(h, now) !== i.price) {
    n = { ...s, holdings: s.holdings.map(x => (x.id === h!.id ? { ...x, prices: [...x.prices, { ts: now, price: i.price }] } : x)) };
  }
  return post(n, { key: i.key, ts: now, type: 'buy', description: `Purchase · ${h.name}`, category: 'Investment', postings: [{ accountId: a.id, amount: -cost }], holding: { id: h.id, qty: i.qty, price: i.price } });
}
export function sell(s: State, i: { key: string; accountId: string; holdingId: string; qty: number; price: number }, now: number): State {
  const a = acct(s, i.accountId);
  if (a.currency !== 'USD') fail('CURRENCY', 'Sale proceeds settle to USD accounts.');
  const pos = positions(s, now).find(p => p.holding.id === i.holdingId) ?? fail('HOLDING', 'Holding not found.');
  posInt(i.qty, 'a quantity'); posInt(i.price, 'a price');
  if (i.qty > pos.qty) fail('QTY', 'You cannot sell more than you hold.');
  const proceeds = valueOf(i.qty, i.price); posInt(proceeds);
  const n = pos.price === i.price ? s : setPrice(s, i.holdingId, i.price, now);
  return post(n, { key: i.key, ts: now, type: 'sell', description: `Sale · ${pos.holding.name}`, category: 'Investment', postings: [{ accountId: a.id, amount: proceeds }], holding: { id: i.holdingId, qty: -i.qty, price: i.price } });
}
export function setPrice(s: State, holdingId: string, price: number, now: number): State {
  posInt(price, 'a price');
  return { ...s, holdings: s.holdings.map(h => (h.id === holdingId ? { ...h, prices: [...h.prices, { ts: now, price }] } : h)) };
}
export function updateHolding(s: State, id: string, patch: Partial<Pick<Holding, 'name' | 'symbol' | 'cls' | 'assumptionBps'>>): State {
  return { ...s, holdings: s.holdings.map(h => (h.id === id ? { ...h, ...patch } : h)) };
}
export function removeHolding(s: State, id: string, now: number): State {
  if ((positions(s, now).find(p => p.holding.id === id)?.qty ?? 0) !== 0) fail('STATE', 'Sell the position before removing it.');
  if (s.txns.some(t => t.holding?.id === id)) fail('STATE', 'Holdings with ledger history are kept for reconciliation.');
  return { ...s, holdings: s.holdings.filter(h => h.id !== id) };
}

/* ───────── accounts, cards, recipients, rates ───────── */
const identFor = (code: string, seq: number) => `AUR-SIM-${code}-${String(seq).padStart(4, '0')}`;
export function createAccount(s: State, i: { name: string; currency: Cur }, now: number): State {
  const name = clean(i.name, 32);
  if (!name) fail('NAME', 'Give the account a name.');
  const seq = s.seq + 1;
  return { ...s, seq, accounts: [...s.accounts, { id: 'A' + seq, name, kind: 'custom', currency: i.currency, ident: identFor('CU', seq), archived: false, createdAt: now }] };
}
export function renameAccount(s: State, id: string, name: string): State {
  const n = clean(name, 32);
  if (!n) fail('NAME', 'Give the account a name.');
  return { ...s, accounts: s.accounts.map(a => (a.id === id ? { ...a, name: n } : a)) };
}
export function archiveAccount(s: State, id: string, now: number): State {
  const a = acct(s, id), b = balances(s, now)[id];
  if (a.primary) fail('PRIMARY', 'The primary account cannot be archived.');
  if (b.balance !== 0 || b.available !== 0) fail('NONEMPTY', 'Only empty accounts with nothing pending can be archived.');
  if (s.cards.some(c => c.accountId === id)) fail('LINKED', 'Link its cards to another account first.');
  return { ...s, accounts: s.accounts.map(x => (x.id === id ? { ...x, archived: true } : x)) };
}
export const restoreAccount = (s: State, id: string): State => ({ ...s, accounts: s.accounts.map(x => (x.id === id ? { ...x, archived: false } : x)) });

export function updateCard(s: State, id: string, patch: Partial<Pick<Card, 'nickname' | 'frozen' | 'limit' | 'accountId'>>): State {
  if (patch.limit != null && (!Number.isSafeInteger(patch.limit) || patch.limit < 0)) fail('AMOUNT', 'Enter a valid limit.');
  if (patch.accountId) acct(s, patch.accountId);
  if (patch.nickname != null && !clean(patch.nickname)) fail('NAME', 'Give the card a nickname.');
  return { ...s, cards: s.cards.map(c => (c.id === id ? { ...c, ...patch, nickname: patch.nickname != null ? clean(patch.nickname, 24) : c.nickname } : c)) };
}
export function saveRecipient(s: State, i: { id?: string; name: string; institution: string; currency: Cur }): State {
  const name = clean(i.name, 40), institution = clean(i.institution, 40) || 'Fictional institution';
  if (!name) fail('NAME', 'Give the recipient a name.');
  if (i.id) return { ...s, recipients: s.recipients.map(r => (r.id === i.id ? { ...r, name, institution, currency: i.currency } : r)) };
  const seq = s.seq + 1;
  return { ...s, seq, recipients: [...s.recipients, { id: 'R' + seq, name, institution, currency: i.currency, ident: `RCP-SIM-${String(seq).padStart(4, '0')}` }] };
}
export const removeRecipient = (s: State, id: string): State => ({ ...s, recipients: s.recipients.filter(r => r.id !== id) });
export function setRate(s: State, cur: Cur, rate: number): State {
  if (cur === 'USD') fail('RATE', 'USD is the base currency.');
  if (!Number.isSafeInteger(rate) || rate < 1000 || rate > 1_000_000_000) fail('RATE', 'Enter a rate between 0.001 and 1000.');
  return { ...s, rates: { ...s.rates, [cur]: rate } };
}
export const setProfile = (s: State, p: Partial<State['profile']>): State => ({ ...s, profile: { ...s.profile, ...p, name: p.name != null ? clean(p.name, 40) || s.profile.name : s.profile.name } });

/* ───────── scenario ───────── */
export function createInitial(now: number, opening = DEFAULT_OPENING, profile?: State['profile']): State {
  if (!Number.isSafeInteger(opening) || opening < 0 || opening > 100_000_000_000_00) fail('AMOUNT', 'Enter an opening amount up to 100 billion.');
  const mk = (n: number, name: string, kind: Account['kind'], currency: Cur, code: string, primary?: boolean): Account =>
    ({ id: 'A' + n, name, kind, currency, ident: identFor(code, n), archived: false, createdAt: now, primary });
  const accounts = [
    mk(1, 'Private Current', 'current', 'USD', 'PC', true),
    mk(2, 'Reserve Account', 'reserve', 'USD', 'RS'),
    mk(3, 'Investment Account', 'investment', 'USD', 'IV'),
    mk(4, 'Multi-Currency · EUR', 'multi', 'EUR', 'MC'),
    mk(5, 'Multi-Currency · GBP', 'multi', 'GBP', 'MC'),
    mk(6, 'Multi-Currency · CHF', 'multi', 'CHF', 'MC'),
    mk(7, 'Multi-Currency · AED', 'multi', 'AED', 'MC'),
    mk(8, 'Wealth Portfolio', 'portfolio', 'USD', 'WP'),
  ];
  const card = (n: number, product: string, tag: string, limit: number): Card =>
    ({ id: 'C' + n, product, nickname: product, ident: `SIM ···· ···· ${tag}`, accountId: 'A1', frozen: false, limit });
  const s: State = {
    schema: 1, seq: 11, inception: now,
    profile: profile ?? { name: 'Private Client', tier: 'Private Client' },
    accounts, txns: [], recipients: [], holdings: [], rates: { ...DEFAULT_RATES },
    cards: [card(9, 'Aurelion Obsidian', 'OBSD', 25_000_000), card(10, 'Aurelion Reserve', 'RSRV', 10_000_000), card(11, 'Aurelion Private', 'PRVT', 50_000_000)],
  };
  return opening === 0 ? s : post(s, { key: 'opening', ts: now, type: 'opening', description: 'Opening balance', category: 'Income', postings: [{ accountId: 'A1', amount: opening }] });
}
export const openingAmount = (s: State) => s.txns.find(t => t.type === 'opening')?.postings[0]?.amount ?? 0;
/** Change the opening amount and reconcile; rejected if the existing ledger would overdraw. */
export function setOpening(s: State, amount: number, now: number): State {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 100_000_000_000_00) fail('AMOUNT', 'Enter an opening amount up to 100 billion.');
  const has = s.txns.some(t => t.type === 'opening');
  let n: State;
  if (has) n = amount === 0 ? { ...s, txns: s.txns.filter(t => t.type !== 'opening') } : { ...s, txns: s.txns.map(t => (t.type === 'opening' ? { ...t, postings: [{ ...t.postings[0], amount }] } : t)) };
  else if (amount === 0) n = s;
  else {
    const primary = s.accounts.find(a => a.primary) ?? s.accounts[0];
    n = post(s, { key: 'opening', ts: s.inception, type: 'opening', description: 'Opening balance', category: 'Income', postings: [{ accountId: primary.id, amount }] });
  }
  const b = balances(n, now);
  for (const a of n.accounts) if (b[a.id].available < 0 || b[a.id].balance < 0)
    fail('SCENARIO', `Existing activity on ${a.name} exceeds this opening amount. Reset the simulation to start again from a new figure.`);
  return n;
}

/* ───────── reconciliation ───────── */
/** Independent checks used by tests and by the in-app integrity report. */
export function reconcile(s: State, now: number): string[] {
  const issues: string[] = [];
  const b = balances(s, now);
  let sum = 0;
  for (const a of s.accounts) {
    if (b[a.id].balance !== balanceAt(s, a.id, now)) issues.push(`${a.name}: balance and history disagree`);
    if (b[a.id].balance < 0) issues.push(`${a.name}: negative balance`);
    if (b[a.id].available > b[a.id].balance) issues.push(`${a.name}: available exceeds balance`);
    sum += convert(b[a.id].balance, a.currency, 'USD', s.rates);
  }
  const hv = positions(s, now).reduce((n, p) => n + p.value, 0);
  if (hv !== holdingsValueAt(s, now)) issues.push('Holdings valuation disagrees');
  if (sum + hv !== wealthAt(s, now, 'USD')) issues.push('Total wealth does not equal accounts plus holdings');
  if (new Set(s.txns.map(t => t.key)).size !== s.txns.length) issues.push('Duplicate transaction keys');
  return issues;
}
export type { Recipient };
