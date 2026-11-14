import { useMemo, useState } from 'react';
import * as L from '../engine/ledger';
import { fmt, fmtBps, fmtQty, mulDiv, parseCents, parseDec, QTY_SCALE } from '../engine/money';
import { ASSET_CLASSES, SPEND_CATEGORIES, type AssetClass } from '../engine/types';
import { act, announce, getSnap, openSheet, toast, type SheetSpec } from '../store/store';
import { AmountInput, ConfirmBtn, Field, Money, Seg, Sim, Toggle, TxnRow, useClose, useData, useKey } from '../ui/bits';
import { AreaChart } from '../ui/Chart';
import { Success } from './MoneySheets';

const parseBps = (v: string) => { const neg = v.trim().startsWith('-'); const n = parseDec(v.replace('-', ''), 2); return n == null ? null : neg ? -n : n; };

export function CardSettingsSheet({ spec }: { spec: Extract<SheetSpec, { t: 'cardSettings' }> }) {
  const { s } = useData();
  const close = useClose();
  const c = s.cards.find(x => x.id === spec.id)!;
  const [nick, setNick] = useState(c.nickname); const [limit, setLimit] = useState(fmt(c.limit).slice(1)); const [acct, setAcct] = useState(c.accountId);
  const [err, setErr] = useState('');
  const save = () => {
    const l = parseCents(limit);
    if (l == null) return setErr('Enter a valid monthly limit.');
    const r = act(st => L.updateCard(st, c.id, { nickname: nick, limit: l, accountId: acct }));
    if (r.ok) { toast('Card settings saved'); close(); } else setErr(r.error);
  };
  return (
    <div className="form">
      <Field label="Card nickname"><input value={nick} maxLength={24} onChange={e => setNick(e.target.value)} /></Field>
      <Field label="Monthly spending limit (USD)" hint="Purchases that would exceed the limit are declined."><input inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} /></Field>
      <Field label="Linked account" hint="Simulated purchases debit this account."><select value={acct} onChange={e => setAcct(e.target.value)}>{s.accounts.filter(a => !a.archived).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></Field>
      <div className="row"><span className="row-m"><span className="row-t">Freeze card</span><span className="row-s">Declines every simulated purchase until unfrozen.</span></span><Toggle on={c.frozen} label="Freeze card" onChange={v => act(st => L.updateCard(st, c.id, { frozen: v }))} /></div>
      <dl className="kv"><div><dt>Product</dt><dd>{c.product}</dd></div><div><dt>Identifier</dt><dd className="mono">{c.ident}</dd></div></dl>
      <p className="footnote">This identifier is a non-functional label. The card cannot be used for payment anywhere.</p>
      {err && <p className="err" role="alert">{err}</p>}
      <button type="button" className="btn" onClick={save}>Save settings</button>
    </div>
  );
}

export function CardSpendSheet({ spec }: { spec: Extract<SheetSpec, { t: 'cardSpend' }> }) {
  const { s, now, bal } = useData();
  const close = useClose(), k = useKey();
  const c = s.cards.find(x => x.id === spec.id)!, a = s.accounts.find(x => x.id === c.accountId)!;
  const [merchant, setMerchant] = useState(''); const [cat, setCat] = useState<string>('Dining'); const [amt, setAmt] = useState('');
  const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const cents = parseCents(amt);
  const submit = () => {
    if (cents == null || cents <= 0) return setErr('Enter an amount greater than zero.');
    const r = act((st, n) => L.cardSpend(st, { key: k.key(), cardId: c.id, amount: cents, description: merchant || 'Card purchase', category: cat }, n));
    if (r.ok) { setDone(true); if (getSnap().prefs.notifCard) announce(c.nickname, `${merchant || 'Card purchase'} · ${fmt(cents, a.currency)}`); } else setErr(r.error);
  };
  if (done) return <Success title="Purchase authorised" lines={[['Card', c.nickname], ['Merchant', merchant || 'Card purchase'], ['Amount', fmt(cents!, a.currency)], ['Debited from', a.name]]} onDone={close} txnKey={k.key()} />;
  return (
    <div className="form">
      {c.frozen && <p className="err" role="alert">{c.nickname} is frozen. Unfreeze it to authorise simulated purchases.</p>}
      <Field label="Merchant" hint="Any fictional merchant name."><input value={merchant} maxLength={40} placeholder="e.g. Maison Verre" onChange={e => setMerchant(e.target.value)} /></Field>
      <Field label="Category"><select value={cat} onChange={e => setCat(e.target.value)}>{SPEND_CATEGORIES.map(x => <option key={x}>{x}</option>)}</select></Field>
      <AmountInput value={amt} onChange={v => { setAmt(v); setErr(''); }} prefix={a.currency === 'USD' ? '$' : a.currency} />
      <p className="footnote center">Available in {a.name}: <Money c={bal[a.id].available} cur={a.currency} /> · Limit remaining: <Money c={Math.max(0, c.limit - L.cardSpent(s, c.id, now))} /></p>
      {err && <p className="err" role="alert">{err}</p>}
      <button type="button" className="btn" disabled={c.frozen} onClick={submit}>Authorise simulated purchase</button>
    </div>
  );
}

export function TradeSheet({ spec }: { spec: Extract<SheetSpec, { t: 'trade' }> }) {
  const { s, now, bal } = useData();
  const close = useClose(), k = useKey();
  const pos = L.positions(s, now).find(p => p.holding.id === spec.id);
  const usd = s.accounts.filter(a => !a.archived && a.currency === 'USD');
  const inv = usd.find(a => a.kind === 'investment');
  const [acct, setAcct] = useState((spec.mode !== 'sell' && inv && bal[inv.id].available > 0 ? inv : usd.find(a => a.primary) ?? usd[0])?.id ?? '');
  const [name, setName] = useState(''); const [sym, setSym] = useState(''); const [cls, setCls] = useState<AssetClass>('Equities');
  const [qty, setQty] = useState(''); const [price, setPrice] = useState(pos ? fmt(pos.price).slice(1) : ''); const [asm, setAsm] = useState('5.00');
  const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const q = parseDec(qty, 4), p = parseCents(price), total = q && p ? L.valueOf(q, p) : 0;
  const sellMode = spec.mode === 'sell';
  const submit = () => {
    if (!q || q <= 0) return setErr('Enter a quantity (up to four decimals).');
    if (!p || p <= 0) return setErr('Enter a price per unit.');
    const bps = parseBps(asm);
    if (spec.mode === 'new' && bps == null) return setErr('Enter an assumed annual return, e.g. 5.00.');
    const r = act((st, n) => sellMode
      ? L.sell(st, { key: k.key(), accountId: acct, holdingId: spec.id!, qty: q, price: p }, n)
      : L.buy(st, { key: k.key(), accountId: acct, qty: q, price: p, holdingId: spec.id, create: spec.mode === 'new' ? { name, symbol: sym, cls, assumptionBps: bps! } : undefined }, n));
    if (r.ok) setDone(true); else setErr(r.error);
  };
  if (!usd.length) return <p className="err">A USD account is needed to fund investments.</p>;
  if (done) return <Success title={sellMode ? 'Sale recorded' : 'Purchase recorded'} lines={[['Holding', pos?.holding.name ?? name], ['Quantity', fmtQty(q!)], ['Price', fmt(p!)], [sellMode ? 'Proceeds' : 'Cost', fmt(total)]]} onDone={close} txnKey={k.key()} />;
  return (
    <div className="form">
      {spec.mode === 'new' && <>
        <Field label="Holding name"><input value={name} maxLength={40} autoFocus placeholder="e.g. Global Equity Basket" onChange={e => setName(e.target.value)} /></Field>
        <div className="grid2">
          <Field label="Short code"><input value={sym} maxLength={6} placeholder="GEB" onChange={e => setSym(e.target.value.toUpperCase())} /></Field>
          <Field label="Asset class"><select value={cls} onChange={e => setCls(e.target.value as AssetClass)}>{ASSET_CLASSES.map(c => <option key={c}>{c}</option>)}</select></Field>
        </div>
      </>}
      {pos && <p className="footnote">You hold <b className="num">{fmtQty(pos.qty)}</b> of {pos.holding.name}, last priced at <Money c={pos.price} />.</p>}
      <div className="grid2">
        <Field label="Quantity" hint={sellMode && pos ? <button type="button" className="link" onClick={() => setQty(String(pos.qty / QTY_SCALE))}>Sell all</button> : undefined}><input inputMode="decimal" value={qty} placeholder="0" onChange={e => { setQty(e.target.value); setErr(''); }} /></Field>
        <Field label="Price per unit (USD)"><input inputMode="decimal" value={price} placeholder="0.00" onChange={e => { setPrice(e.target.value); setErr(''); }} /></Field>
      </div>
      {spec.mode === 'new' && <Field label="Assumed annual return (%)" hint="Your own assumption, used only for the illustrative projection."><input inputMode="decimal" value={asm} onChange={e => setAsm(e.target.value)} /></Field>}
      <Field label={sellMode ? 'Proceeds to' : 'Funded from'} hint={<>Available <Money c={bal[acct]?.available ?? 0} /></>}><select value={acct} onChange={e => setAcct(e.target.value)}>{usd.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <div className="result"><span className="eyebrow">{sellMode ? 'Proceeds' : 'Total cost'}</span><span className="wealth sm num">{fmt(total)}</span><Sim>Hypothetical · user-entered price</Sim></div>
      {err && <p className="err" role="alert">{err}</p>}
      <button type="button" className="btn" onClick={submit}>{sellMode ? 'Record sale' : 'Record purchase'}</button>
    </div>
  );
}

export function HoldingSheet({ spec }: { spec: Extract<SheetSpec, { t: 'holding' }> }) {
  const { s, now } = useData();
  const close = useClose();
  const p = L.positions(s, now).find(x => x.holding.id === spec.id);
  const [price, setPrice] = useState(''); const [asm, setAsm] = useState('');
  const proj = useMemo(() => {
    if (!p) return [];
    const Y = 365 * 864e5, out = [{ t: now, v: p.value }];
    let v = p.value;
    for (let y = 1; y <= 10; y++) { v = mulDiv(v, 10_000 + p.holding.assumptionBps, 10_000); out.push({ t: now + y * Y, v }); }
    return out;
  }, [p?.value, p?.holding.assumptionBps, now]);
  if (!p) return <p className="footnote">This holding is no longer available.</p>;
  const h = p.holding;
  const tx = s.txns.filter(t => t.holding?.id === h.id).sort((a, b) => b.ts - a.ts);
  const savePrice = () => { const c = parseCents(price); const r = c ? act((st, n) => L.setPrice(st, h.id, c, n)) : { ok: false as const, error: 'Enter a price.' }; if (r.ok) { setPrice(''); toast('Illustrative price updated'); } else toast(r.error, 'warn'); };
  const saveAsm = () => { const b = parseBps(asm); if (b == null || b < -9000 || b > 10_000) return toast('Enter a return between −90% and 100%.', 'warn'); act(st => L.updateHolding(st, h.id, { assumptionBps: b })); setAsm(''); toast('Assumption updated'); };
  return (
    <div className="form">
      <div className="review-amt"><span className="eyebrow">{h.cls} · {h.symbol} <Sim>Hypothetical</Sim></span><Money c={p.value} className="wealth sm" />
        <span className={p.gain >= 0 ? 'pos' : 'neg'}><Money c={p.gain} sign /> <span className="num">({fmtBps(p.gainBps, true)})</span> <span className="muted">unrealised</span></span></div>
      <div className="stack row2"><button type="button" className="btn" onClick={() => openSheet({ t: 'trade', mode: 'buy', id: h.id })}>Buy more</button><button type="button" className="btn ghost" disabled={p.qty === 0} onClick={() => openSheet({ t: 'trade', mode: 'sell', id: h.id })}>Sell</button></div>
      <dl className="kv">
        <div><dt>Quantity</dt><dd className="num">{fmtQty(p.qty)}</dd></div>
        <div><dt>Illustrative price</dt><dd><Money c={p.price} /></dd></div>
        <div><dt>Cost basis</dt><dd><Money c={p.cost} /></dd></div>
        <div><dt>Realised to date</dt><dd><Money c={p.realised} sign /></dd></div>
        <div><dt>Assumed annual return</dt><dd className="num">{fmtBps(h.assumptionBps)}</dd></div>
      </dl>
      <div className="grid2 end">
        <Field label="New price (USD)"><input inputMode="decimal" value={price} placeholder={fmt(p.price).slice(1)} onChange={e => setPrice(e.target.value)} /></Field>
        <button type="button" className="btn ghost" disabled={!price} onClick={savePrice}>Update price</button>
        <Field label="Assumed return (%)"><input inputMode="decimal" value={asm} placeholder={(h.assumptionBps / 100).toFixed(2)} onChange={e => setAsm(e.target.value)} /></Field>
        <button type="button" className="btn ghost" disabled={!asm} onClick={saveAsm}>Update</button>
      </div>
      {p.qty > 0 && <div className="panel"><span className="eyebrow">Ten-year illustration at {fmtBps(h.assumptionBps)} a year</span>
        <AreaChart pts={proj} height={150} label="Illustrative projection" animKey={String(h.assumptionBps)} />
        <p className="footnote">Compounds your own assumption from today’s user-entered value. It is not a forecast, and prices here are never live market data.</p></div>}
      {tx.length > 0 && <><div className="sec-h"><h2>Trades</h2></div><div className="list">{tx.map(t => <TxnRow key={t.id} s={s} t={t} now={now} accountId={t.postings[0].accountId} onClick={() => openSheet({ t: 'txn', id: t.id })} />)}</div></>}
      {tx.length === 0 && <ConfirmBtn label="Remove holding" confirm="Tap again to remove" onConfirm={() => { const r = act((st, n) => L.removeHolding(st, h.id, n)); if (r.ok) close(); }} />}
    </div>
  );
}
