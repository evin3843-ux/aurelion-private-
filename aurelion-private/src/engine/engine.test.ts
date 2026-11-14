import { describe, expect, it } from 'vitest';
import * as L from './ledger';
import { convert, fmt, fmtCompact, mulDiv, parseCents, parseDec } from './money';
import { validateState } from './validate';

const T0 = new Date(2026, 0, 15, 10).getTime();
const usd = (n: number) => n * 100;
const fresh = () => L.createInitial(T0);
const bal = (s: any, id: string, now = T0 + 1) => L.balances(s, now)[id];

describe('money', () => {
  it('formats and parses without floats', () => {
    expect(fmt(2_000_000_000)).toBe('$20,000,000.00');
    expect(fmt(-1234567, 'EUR')).toBe('−€12,345.67');
    expect(fmtCompact(2_000_000_000)).toBe('$20.00M');
    expect(parseCents('1,234.5')).toBe(123450);
    expect(parseCents('0.1')! + parseCents('0.2')!).toBe(30);
    expect(parseCents('1.234')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseDec('2.5', 4)).toBe(25000);
    expect(mulDiv(5, 1, 2)).toBe(3);
    expect(mulDiv(-5, 1, 2)).toBe(-3);
  });
});

describe('initial scenario', () => {
  it('opens with exactly $20,000,000.00 in the primary account only', () => {
    const s = fresh(), b = L.balances(s, T0);
    expect(b.A1).toEqual({ balance: 2_000_000_000, available: 2_000_000_000 });
    for (const a of s.accounts.filter(a => !a.primary)) expect(b[a.id].balance).toBe(0);
    expect(L.wealthAt(s, T0)).toBe(2_000_000_000);
    expect(fmt(L.wealthAt(s, T0))).toBe('$20,000,000.00');
    expect(L.reconcile(s, T0)).toEqual([]);
  });
});

describe('transfers', () => {
  it('internal transfers move balances and preserve total wealth', () => {
    let s = fresh();
    s = L.transfer(s, { key: 'k1', from: 'A1', to: 'A2', amount: usd(5_000_000) }, T0 + 1);
    expect(bal(s, 'A1').balance).toBe(usd(15_000_000));
    expect(bal(s, 'A2').balance).toBe(usd(5_000_000));
    expect(L.wealthAt(s, T0 + 1)).toBe(2_000_000_000);
    expect(s.txns.at(-1)!.postings.reduce((n, p) => n + p.amount, 0)).toBe(0);
  });
  it('rejects duplicates, overdrafts and same-account transfers', () => {
    let s = fresh();
    s = L.transfer(s, { key: 'k1', from: 'A1', to: 'A2', amount: 100 }, T0 + 1);
    expect(() => L.transfer(s, { key: 'k1', from: 'A1', to: 'A2', amount: 100 }, T0 + 2)).toThrow(/already recorded/);
    expect(() => L.transfer(s, { key: 'k2', from: 'A2', to: 'A1', amount: 101 }, T0 + 2)).toThrow(/Insufficient/);
    expect(() => L.transfer(s, { key: 'k3', from: 'A1', to: 'A1', amount: 1 }, T0 + 2)).toThrow();
    expect(() => L.transfer(s, { key: 'k4', from: 'A1', to: 'A2', amount: 0 }, T0 + 2)).toThrow();
    expect(() => L.transfer(s, { key: 'k5', from: 'A1', to: 'A2', amount: 1.5 }, T0 + 2)).toThrow();
  });
  it('cross-currency transfers use the illustrative rate and keep wealth within a cent', () => {
    let s = fresh();
    s = L.transfer(s, { key: 'fx', from: 'A1', to: 'A4', amount: usd(1_000_000) }, T0 + 1);
    expect(bal(s, 'A4').balance).toBe(92_000_000);
    expect(Math.abs(L.wealthAt(s, T0 + 1) - 2_000_000_000)).toBeLessThanOrEqual(1);
    expect(convert(92_000_000, 'EUR', 'USD', s.rates)).toBe(usd(1_000_000));
  });
});

describe('external payments', () => {
  const setup = () => {
    let s = L.saveRecipient(fresh(), { name: 'Halden & Rowe', institution: 'Fictional', currency: 'USD' });
    s = L.pay(s, { key: 'p1', from: 'A1', recipientId: s.recipients[0].id, amount: usd(250_000), cur: 'USD' }, T0 + 10);
    return s;
  };
  it('holds funds while pending, then settles', () => {
    const s = setup(), id = s.txns.at(-1)!.id;
    expect(L.statusOf(s.txns.at(-1)!, T0 + 11)).toBe('pending');
    expect(bal(s, 'A1', T0 + 11)).toEqual({ balance: usd(20_000_000), available: usd(19_750_000) });
    expect(L.wealthAt(s, T0 + 11)).toBe(usd(20_000_000));
    const later = T0 + 10 + L.PENDING_MS;
    expect(bal(s, 'A1', later)).toEqual({ balance: usd(19_750_000), available: usd(19_750_000) });
    expect(L.wealthAt(s, later)).toBe(usd(19_750_000));
    const s2 = L.settleNow(s, id, T0 + 20);
    expect(bal(s2, 'A1', T0 + 20).balance).toBe(usd(19_750_000));
  });
  it('cancellation releases the hold; settled payments cannot be cancelled', () => {
    const s = setup(), id = s.txns.at(-1)!.id;
    const c = L.cancel(s, id, T0 + 20);
    expect(bal(c, 'A1', T0 + 10 + L.PENDING_MS * 2)).toEqual({ balance: usd(20_000_000), available: usd(20_000_000) });
    expect(() => L.cancel(s, id, T0 + 10 + L.PENDING_MS)).toThrow(/pending/);
    expect(L.reconcile(c, T0 + 30)).toEqual([]);
  });
  it('refunds a settled payment once', () => {
    const s = setup(), id = s.txns.at(-1)!.id, later = T0 + L.PENDING_MS + 100;
    const r = L.refund(s, { key: 'r1', txnId: id }, later);
    expect(bal(r, 'A1', later).balance).toBe(usd(20_000_000));
    expect(() => L.refund(r, { key: 'r2', txnId: id }, later)).toThrow(/already/);
  });
});

describe('cards', () => {
  it('spending debits the linked account; freeze and limits are enforced', () => {
    let s = fresh();
    s = L.cardSpend(s, { key: 'c1', cardId: 'C9', amount: usd(12_400), description: 'Maison Verre', category: 'Dining' }, T0 + 1);
    expect(bal(s, 'A1').balance).toBe(usd(20_000_000 - 12_400));
    expect(L.cardSpent(s, 'C9', T0 + 2)).toBe(usd(12_400));
    const frozen = L.updateCard(s, 'C9', { frozen: true });
    expect(() => L.cardSpend(frozen, { key: 'c2', cardId: 'C9', amount: 100 }, T0 + 2)).toThrow(/frozen/);
    expect(() => L.cardSpend(s, { key: 'c3', cardId: 'C9', amount: usd(240_000) }, T0 + 2)).toThrow(/limit/);
    const thawed = L.updateCard(frozen, 'C9', { frozen: false });
    const ok = L.cardSpend(thawed, { key: 'c4', cardId: 'C9', amount: 100 }, T0 + 3);
    const refunded = L.refund(ok, { key: 'c5', txnId: s.txns.at(-1)!.id }, T0 + 4);
    expect(L.cardSpent(refunded, 'C9', T0 + 5)).toBe(100);
    expect(L.spending(refunded, T0, T0 + 10, T0 + 5).total).toBe(100);
  });
});

describe('investments', () => {
  it('buying converts cash to holdings at cost; price changes move wealth; sells realise gains', () => {
    let s = fresh();
    s = L.buy(s, { key: 'b1', accountId: 'A1', qty: 1_000_0000, price: usd(250), create: { name: 'Global Equity Basket', symbol: 'GEB', cls: 'Equities', assumptionBps: 600 } }, T0 + 1);
    expect(bal(s, 'A1').balance).toBe(usd(20_000_000 - 250_000));
    expect(L.wealthAt(s, T0 + 1)).toBe(usd(20_000_000));
    const h = s.holdings[0].id;
    s = L.setPrice(s, h, usd(275), T0 + 5);
    expect(L.wealthAt(s, T0 + 4)).toBe(usd(20_000_000));
    expect(L.wealthAt(s, T0 + 5)).toBe(usd(20_025_000));
    const p = L.positions(s, T0 + 5)[0];
    expect([p.value, p.cost, p.gain, p.gainBps]).toEqual([usd(275_000), usd(250_000), usd(25_000), 1000]);
    s = L.sell(s, { key: 's1', accountId: 'A3', holdingId: h, qty: 400_0000, price: usd(275) }, T0 + 6);
    expect(bal(s, 'A3', T0 + 6).balance).toBe(usd(110_000));
    expect(L.positions(s, T0 + 6)[0].realised).toBe(usd(10_000));
    expect(L.wealthAt(s, T0 + 6)).toBe(usd(20_025_000));
    expect(() => L.sell(s, { key: 's2', accountId: 'A3', holdingId: h, qty: 700_0000, price: usd(275) }, T0 + 7)).toThrow(/more than/);
    expect(L.reconcile(s, T0 + 7)).toEqual([]);
  });
});

describe('accounts and scenario', () => {
  it('archives only empty, unlinked, non-primary accounts', () => {
    let s = L.createAccount(fresh(), { name: 'Family Office', currency: 'CHF' }, T0);
    const id = s.accounts.at(-1)!.id;
    expect(() => L.archiveAccount(s, 'A1', T0)).toThrow();
    const funded = L.transfer(s, { key: 'x', from: 'A1', to: id, amount: 100 }, T0 + 1);
    expect(() => L.archiveAccount(funded, id, T0 + 2)).toThrow(/empty/);
    s = L.archiveAccount(s, id, T0 + 1);
    expect(() => L.deposit(s, { key: 'd', accountId: id, amount: 1 }, T0 + 2)).toThrow(/archived/);
  });
  it('rebuilds from a new opening amount and refuses one the ledger cannot support', () => {
    let s = L.withdraw(fresh(), { key: 'w', accountId: 'A1', amount: usd(1_000_000) }, T0 + 1);
    const up = L.setOpening(s, usd(50_000_000), T0 + 2);
    expect(bal(up, 'A1', T0 + 2).balance).toBe(usd(49_000_000));
    expect(() => L.setOpening(s, usd(500_000), T0 + 2)).toThrow(/Reset/);
  });
  it('monthly flow and wealth history reconcile with the ledger', () => {
    let s = fresh();
    s = L.deposit(s, { key: 'd1', accountId: 'A2', amount: usd(40_000) }, T0 + 1000);
    s = L.withdraw(s, { key: 'w1', accountId: 'A1', amount: usd(15_000) }, T0 + 2000);
    expect(L.flow(s, 'A2', L.monthStart(T0), L.addMonths(T0, 1), T0 + 3000)).toEqual({ inflow: usd(40_000), outflow: 0 });
    const pts = L.series(s, T0, T0 + 3000, t => L.wealthAt(s, t));
    expect(pts[0].v).toBe(usd(20_000_000));
    expect(pts.at(-1)!.v).toBe(usd(20_025_000));
    expect(pts.at(-1)!.v).toBe(L.wealthAt(s, T0 + 3000));
    const nf = L.netFlow(s, T0, T0 + 3000, T0 + 3000);
    expect(nf.inflow - nf.outflow).toBe(pts.at(-1)!.v - pts[0].v);
  });
});

describe('export / import integrity', () => {
  it('round-trips through JSON with identical balances and passes validation', () => {
    let s = fresh();
    s = L.transfer(s, { key: 'a', from: 'A1', to: 'A5', amount: usd(300_000) }, T0 + 1);
    s = L.cardSpend(s, { key: 'b', cardId: 'C10', amount: usd(900) }, T0 + 2);
    s = L.buy(s, { key: 'c', accountId: 'A1', qty: 12_5000, price: 1_234_56, create: { name: 'Note', symbol: 'N', cls: 'Fixed Income', assumptionBps: 350 } }, T0 + 3);
    const back = JSON.parse(JSON.stringify(s));
    expect(validateState(back, T0 + 4)).toEqual([]);
    expect(L.balances(back, T0 + 4)).toEqual(L.balances(s, T0 + 4));
    expect(L.wealthAt(back, T0 + 4)).toBe(L.wealthAt(s, T0 + 4));
  });
  it('rejects malformed or tampered files', () => {
    expect(validateState(null).length).toBeGreaterThan(0);
    expect(validateState({ schema: 2 }).length).toBeGreaterThan(0);
    const s: any = JSON.parse(JSON.stringify(fresh()));
    s.txns[0].postings[0].accountId = 'ZZ';
    expect(validateState(s, T0).length).toBeGreaterThan(0);
    const t: any = JSON.parse(JSON.stringify(fresh()));
    t.txns[0].postings[0].amount = 10.5;
    expect(validateState(t, T0).length).toBeGreaterThan(0);
    const o: any = JSON.parse(JSON.stringify(L.withdraw(fresh(), { key: 'w', accountId: 'A1', amount: 500 }, T0 + 1)));
    o.txns[0].postings[0].amount = 100; // overdraws the account
    expect(validateState(o, T0 + 2).length).toBeGreaterThan(0);
  });
});
