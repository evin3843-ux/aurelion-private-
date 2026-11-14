import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, Search } from 'lucide-react';
import * as L from '../engine/ledger';
import { CURS, fmt, fmtQty, fmtRate, type Cur } from '../engine/money';
import { CATEGORIES } from '../engine/types';
import { act, openSheet, toast, type SheetSpec } from '../store/store';
import { ConfirmBtn, Empty, Field, fmtDate, fmtTime, IC, Money, Seg, Sim, TxnRow, useClose, useData, useKey } from '../ui/bits';
import { AreaChart, PALETTE } from '../ui/Chart';
import { rangeStart, RANGES, type Range } from '../screens/Home';

export function NewAccountSheet() {
  const close = useClose();
  const [name, setName] = useState(''); const [cur, setCur] = useState<Cur>('USD'); const [err, setErr] = useState('');
  const save = () => { const r = act((s, now) => L.createAccount(s, { name, currency: cur }, now)); if (r.ok) { toast('Account created'); close(); } else setErr(r.error); };
  return (
    <div className="form">
      <Field label="Account name" error={err}><input value={name} maxLength={32} autoFocus placeholder="e.g. Family Office" onChange={e => { setName(e.target.value); setErr(''); }} /></Field>
      <Seg label="Account currency" value={cur} options={CURS} onChange={setCur} />
      <p className="footnote">New accounts open empty with a simulation-only identifier. Fund them by transfer.</p>
      <button type="button" className="btn" onClick={save}>Create account</button>
    </div>
  );
}

export function AccountSheet({ spec }: { spec: Extract<SheetSpec, { t: 'account' }> }) {
  const { s, now, bal, prefs } = useData();
  const close = useClose();
  const a = s.accounts.find(x => x.id === spec.id)!;
  const [range, setRange] = useState<Range>('1M');
  const [q, setQ] = useState(''); const [kind, setKind] = useState<'All' | 'In' | 'Out'>('All');
  const [name, setName] = useState<string | null>(null);
  const from = rangeStart(range, now, Math.max(s.inception, a.createdAt));
  const pts = useMemo(() => L.series(s, from, now, t => L.balanceAt(s, a.id, t), a.id), [s, from, now, a.id]);
  const f = L.flow(s, a.id, L.monthStart(now), L.addMonths(now, 1), now);
  const cat = L.spending(s, L.monthStart(now), L.addMonths(now, 1), now, { accountId: a.id });
  const hv = a.kind === 'portfolio' ? L.holdingsValueAt(s, now) : 0;
  const tx = s.txns.filter(t => t.postings.some(p => p.accountId === a.id)).filter(t => {
    const amt = t.postings.find(p => p.accountId === a.id)!.amount;
    return (kind === 'All' || (kind === 'In' ? amt > 0 : amt < 0)) && (!q || `${t.description} ${t.category} ${t.note ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  }).sort((x, y) => y.ts - x.ts);
  const rename = () => { const r = act(st => L.renameAccount(st, a.id, name ?? '')); if (r.ok) { setName(null); toast('Account renamed'); } else toast(r.error, 'warn'); };
  const archive = () => { const r = act((st, n) => L.archiveAccount(st, a.id, n)); if (r.ok) { toast(`${a.name} archived`); close(); } else toast(r.error, 'warn'); };
  return (
    <div className="form">
      <div className="review-amt"><span className="eyebrow">Current balance <Sim /></span><Money c={bal[a.id].balance} cur={a.currency} className="wealth sm" />
        <span className="muted">Available <Money c={bal[a.id].available} cur={a.currency} /></span></div>
      {!a.archived && <nav className="quick three" aria-label="Account actions">
        <button type="button" onClick={() => openSheet({ t: 'transfer', from: a.id })}><span><ArrowLeftRight {...IC} /></span>Transfer</button>
        <button type="button" onClick={() => openSheet({ t: 'move', mode: 'deposit', accountId: a.id })}><span><ArrowDownLeft {...IC} /></span>Add funds</button>
        <button type="button" onClick={() => openSheet({ t: 'transfer', from: a.id, external: true })}><span><ArrowLeftRight {...IC} /></span>Pay</button>
      </nav>}
      <div className="panel"><AreaChart pts={pts} cur={a.currency} height={150} animKey={range} label={`${a.name} balance history`} />
        <Seg small label="Balance history range" value={range} options={RANGES.map(r => r.v)} onChange={setRange} /></div>
      <dl className="kv">
        <div><dt>Identifier</dt><dd className="mono">{prefs.privacy ? 'AUR-SIM-••••' : a.ident}</dd></div>
        <div><dt>Currency</dt><dd>{a.currency}</dd></div>
        <div><dt>In this month</dt><dd><Money c={f.inflow} cur={a.currency} className="pos" /></dd></div>
        <div><dt>Out this month</dt><dd><Money c={f.outflow} cur={a.currency} /></dd></div>
        {a.kind === 'portfolio' && <div><dt>Holdings held here</dt><dd><Money c={hv} /></dd></div>}
        <div><dt>Opened</dt><dd>{fmtDate(a.createdAt)}</dd></div>
      </dl>
      {cat.rows.length > 0 && <div className="panel"><span className="eyebrow">Spending this month · USD equivalent</span><div className="cats">{cat.rows.map((r, n) => (
        <div key={r.category} className="cat"><span>{r.category}</span><Money c={r.amount} /><i><b style={{ width: `${(r.amount / cat.total) * 100}%`, background: PALETTE[n % PALETTE.length] }} /></i></div>))}</div></div>}

      <div className="sec-h"><h2>Transactions</h2><span className="muted">{tx.length}</span></div>
      <label className="search"><Search {...IC} size={17} /><input type="search" placeholder="Search this account" aria-label="Search this account" value={q} onChange={e => setQ(e.target.value)} /></label>
      <Seg small label="Direction" value={kind} options={['All', 'In', 'Out'] as const} onChange={setKind} />
      {tx.length ? <div className="list">{tx.slice(0, 60).map(t => <TxnRow key={t.id} s={s} t={t} now={now} accountId={a.id} onClick={() => openSheet({ t: 'txn', id: t.id })} />)}</div>
        : <Empty icon={<Search {...IC} size={22} />} title="No transactions" text={q || kind !== 'All' ? 'Nothing matches the current search.' : 'This account has no activity yet.'} />}

      <div className="sec-h"><h2>Manage</h2></div>
      {name == null ? <button type="button" className="btn ghost" onClick={() => setName(a.name)}>Rename account</button> : (
        <div className="inline-edit"><input value={name} maxLength={32} aria-label="Account name" autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && rename()} /><button type="button" className="btn small" onClick={rename}>Save</button><button type="button" className="btn ghost small" onClick={() => setName(null)}>Cancel</button></div>
      )}
      {a.archived ? <button type="button" className="btn ghost" onClick={() => { act(st => L.restoreAccount(st, a.id)); toast('Account restored'); }}>Restore account</button>
        : !a.primary && <ConfirmBtn label="Archive account" confirm="Tap again to archive" onConfirm={archive} />}
      {!a.primary && !a.archived && <p className="footnote center">Only empty accounts with nothing pending and no linked cards can be archived.</p>}
    </div>
  );
}

const TYPE_L: Record<string, string> = { opening: 'Opening balance', deposit: 'Deposit', withdrawal: 'Withdrawal', transfer: 'Internal transfer', payment: 'External payment', card: 'Card purchase', refund: 'Refund', buy: 'Investment purchase', sell: 'Investment sale' };

export function TxnSheet({ spec }: { spec: Extract<SheetSpec, { t: 'txn' }> }) {
  const { s, now, prefs } = useData();
  const close = useClose(), k = useKey();
  const t = s.txns.find(x => x.id === spec.id);
  const [note, setNote] = useState(t?.note ?? '');
  if (!t) return <Empty icon={<Search {...IC} size={22} />} title="Entry not found" text="This ledger entry is no longer available." />;
  const st = L.statusOf(t, now);
  const acct = (id: string) => s.accounts.find(a => a.id === id)!;
  const main = t.postings[0], cur = acct(main.accountId).currency;
  const card = s.cards.find(c => c.id === t.cardId), rec = s.recipients.find(r => r.id === t.recipientId);
  const refunded = L.isRefunded(s, t.id);
  const run = (fn: Parameters<typeof act>[0], ok: string) => { const r = act(fn); toast(r.ok ? ok : r.error, r.ok ? 'ok' : 'warn'); };
  return (
    <div className="form">
      <div className="review-amt">
        <span className="eyebrow">{TYPE_L[t.type]}</span>
        <Money c={t.type === 'transfer' ? Math.abs(main.amount) : main.amount} cur={cur} sign={t.type !== 'transfer'} className={'wealth sm' + (st === 'cancelled' ? ' struck' : '')} />
        <span><em className={'tag ' + (st === 'completed' ? 'ok' : st)}>{st}</em> <Sim /></span>
      </div>
      <dl className="kv">
        <div><dt>Description</dt><dd>{t.description}</dd></div>
        <div><dt>Date</dt><dd>{fmtDate(t.ts)} · {fmtTime(t.ts)}</dd></div>
        {t.postings.map((p, i) => <div key={i}><dt>{p.amount < 0 ? 'Debited' : 'Credited'}</dt><dd>{acct(p.accountId).name} · <Money c={p.amount} cur={acct(p.accountId).currency} sign /></dd></div>)}
        {t.sent && t.fx && <div><dt>Sent as</dt><dd className="num">{prefs.hide ? '••••' : fmt(t.sent.amount, t.sent.cur)}</dd></div>}
        {t.fx && <div><dt>Illustrative rate</dt><dd className="num">1 {t.fx.from} = {fmtRate(t.fx.rate)} {t.fx.to}</dd></div>}
        {rec && <div><dt>Recipient</dt><dd>{rec.name} · {rec.institution}</dd></div>}
        {card && <div><dt>Card</dt><dd>{card.nickname}</dd></div>}
        {t.holding && <div><dt>Quantity × price</dt><dd className="num">{fmtQty(Math.abs(t.holding.qty))} × {fmt(t.holding.price)}</dd></div>}
        {t.settleAt && st === 'pending' && <div><dt>Settles</dt><dd>{fmtTime(t.settleAt)}</dd></div>}
        {t.cancelledAt && <div><dt>Cancelled</dt><dd>{fmtDate(t.cancelledAt)} · {fmtTime(t.cancelledAt)}</dd></div>}
        {refunded && <div><dt>Refund</dt><dd>Refunded in full</dd></div>}
        <div><dt>Ledger entry</dt><dd className="mono">{t.id}</dd></div>
      </dl>
      <Field label="Category"><select value={t.category} disabled={t.type === 'transfer' || t.type === 'opening' || !!t.holding} onChange={e => act(x => L.editTxn(x, t.id, { category: e.target.value }))}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Note"><input value={note} maxLength={120} placeholder="Add a private note" onChange={e => setNote(e.target.value)} onBlur={() => note !== (t.note ?? '') && act(x => L.editTxn(x, t.id, { note }))} /></Field>
      {st === 'pending' && <div className="stack">
        <button type="button" className="btn ghost" onClick={() => run((x, n) => L.settleNow(x, t.id, n), 'Payment settled')}>Settle now</button>
        <ConfirmBtn label="Cancel payment" confirm="Tap again to cancel" onConfirm={() => run((x, n) => L.cancel(x, t.id, n), 'Payment cancelled; funds released')} />
      </div>}
      {st === 'completed' && ['card', 'payment'].includes(t.type) && !refunded &&
        <ConfirmBtn className="btn ghost" label="Simulate refund" confirm="Tap again to refund in full" onConfirm={() => { run((x, n) => L.refund(x, { key: k.key(), txnId: t.id }, n), 'Refund recorded'); k.renew(); }} />}
      <p className="footnote center">A simulated ledger entry. Not a record or proof of any real payment.</p>
      <button type="button" className="btn ghost" onClick={close}>Close</button>
    </div>
  );
}
