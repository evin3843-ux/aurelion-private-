import { useMemo, useState } from 'react';
import { ListFilter, Search, SearchX } from 'lucide-react';
import { addMonths, monthStart, netFlow, spending, statusOf } from '../engine/ledger';
import { parseCents } from '../engine/money';
import type { Txn, TxnType } from '../engine/types';
import { openSheet } from '../store/store';
import { dayLabel, Empty, Field, fmtMonth, IC, Money, Seg, Sim, TxnRow, txnView, useData } from '../ui/bits';
import { PALETTE } from '../ui/Chart';

const TYPES: { v: TxnType | 'all'; l: string }[] = [
  { v: 'all', l: 'All types' }, { v: 'deposit', l: 'Deposits' }, { v: 'withdrawal', l: 'Withdrawals' }, { v: 'transfer', l: 'Transfers' },
  { v: 'payment', l: 'Payments' }, { v: 'card', l: 'Card' }, { v: 'refund', l: 'Refunds' }, { v: 'buy', l: 'Purchases' }, { v: 'sell', l: 'Sales' },
];
type Sort = 'Newest' | 'Oldest' | 'Largest' | 'Smallest';

export default function Activity() {
  const { s, now } = useData();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TxnType | 'all'>('all');
  const [acct, setAcct] = useState('all');
  const [dir, setDir] = useState<'All' | 'Credits' | 'Debits'>('All');
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [min, setMin] = useState(''); const [max, setMax] = useState('');
  const [sort, setSort] = useState<Sort>('Newest');
  const filtersOn = [type !== 'all', acct !== 'all', dir !== 'All', from, to, min, max].filter(Boolean).length;
  const clear = () => { setType('all'); setAcct('all'); setDir('All'); setFrom(''); setTo(''); setMin(''); setMax(''); setSort('Newest'); };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const lo = parseCents(min), hi = parseCents(max);
    const f = from ? new Date(from + 'T00:00:00').getTime() : -Infinity, t = to ? new Date(to + 'T23:59:59.999').getTime() : Infinity;
    const size = (x: Txn) => Math.abs(txnView(s, x, acct === 'all' ? undefined : acct).amount);
    const out = s.txns.filter(x => {
      if (type !== 'all' && x.type !== type) return false;
      if (acct !== 'all' && !x.postings.some(p => p.accountId === acct)) return false;
      if (x.ts < f || x.ts > t) return false;
      const v = txnView(s, x, acct === 'all' ? undefined : acct);
      if (dir === 'Credits' && !(v.amount > 0 && !v.neutral)) return false;
      if (dir === 'Debits' && !(v.amount < 0)) return false;
      if (lo != null && size(x) < lo) return false;
      if (hi != null && size(x) > hi) return false;
      if (needle && !`${x.description} ${x.category} ${x.note ?? ''} ${x.type}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    const cmp: Record<Sort, (a: Txn, b: Txn) => number> = { Newest: (a, b) => b.ts - a.ts, Oldest: (a, b) => a.ts - b.ts, Largest: (a, b) => size(b) - size(a), Smallest: (a, b) => size(a) - size(b) };
    return out.sort(cmp[sort]);
  }, [s, q, type, acct, dir, from, to, min, max, sort]);

  const m0 = monthStart(now), m1 = addMonths(now, 1);
  const nf = netFlow(s, m0, m1, now), cat = spending(s, m0, m1, now);
  const byTime = sort === 'Newest' || sort === 'Oldest';
  let lastDay = '', lastMonth = '';
  return (
    <div className="screen">
      <header className="title"><h1>Activity</h1><Sim /></header>
      <section className="panel">
        <span className="eyebrow">{fmtMonth(now)}</span>
        <div className="grid2">
          <div><span className="eyebrow">Money in</span><Money c={nf.inflow} className="fig sm pos" /></div>
          <div><span className="eyebrow">Money out</span><Money c={nf.outflow} className="fig sm" /></div>
        </div>
        {cat.rows.length > 0 && <div className="cats">{cat.rows.slice(0, 5).map((r, n) => (
          <div key={r.category} className="cat"><span>{r.category}</span><Money c={r.amount} /><i><b style={{ width: `${(r.amount / cat.total) * 100}%`, background: PALETTE[n % PALETTE.length] }} /></i></div>
        ))}</div>}
        <p className="footnote">USD equivalent at illustrative rates. Spending covers card purchases, payments and withdrawals, net of refunds.</p>
      </section>

      <div className="searchbar">
        <label className="search"><Search {...IC} size={17} /><input type="search" placeholder="Search activity" aria-label="Search activity" value={q} onChange={e => setQ(e.target.value)} enterKeyHint="search" /></label>
        <button type="button" className={'icon-btn ring' + (filtersOn ? ' on' : '')} aria-label={`Filters${filtersOn ? `, ${filtersOn} active` : ''}`} aria-expanded={open} onClick={() => setOpen(!open)}><ListFilter {...IC} /></button>
      </div>
      {open && (
        <section className="panel filters">
          <div className="grid2">
            <Field label="Type"><select value={type} onChange={e => setType(e.target.value as any)}>{TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></Field>
            <Field label="Account"><select value={acct} onChange={e => setAcct(e.target.value)}><option value="all">All accounts</option>{s.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="From"><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="To"><input type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
            <Field label="Min amount"><input inputMode="decimal" placeholder="0.00" value={min} onChange={e => setMin(e.target.value)} /></Field>
            <Field label="Max amount"><input inputMode="decimal" placeholder="Any" value={max} onChange={e => setMax(e.target.value)} /></Field>
          </div>
          <Seg small label="Direction" value={dir} options={['All', 'Credits', 'Debits'] as const} onChange={setDir} />
          <Seg small label="Sort order" value={sort} options={['Newest', 'Oldest', 'Largest', 'Smallest'] as const} onChange={setSort} />
          <button type="button" className="link block" onClick={clear} disabled={!filtersOn && sort === 'Newest'}>Clear filters</button>
        </section>
      )}

      <p className="count" aria-live="polite">{rows.length} {rows.length === 1 ? 'entry' : 'entries'}{filtersOn || q ? ' match' : ''}</p>
      {rows.length ? (
        <div className="feed">
          {rows.map(t => {
            const mo = fmtMonth(t.ts), day = dayLabel(t.ts, now);
            const heads = [];
            if (byTime && mo !== lastMonth) {
              lastMonth = mo;
              const a = monthStart(t.ts), f = netFlow(s, a, addMonths(a, 1), now);
              heads.push(<div key={'m' + mo} className="month-h"><b>{mo}</b><span><Money c={f.inflow} sign className="pos" /> · <Money c={-f.outflow} /></span></div>);
            }
            if (byTime && day !== lastDay) { lastDay = day; heads.push(<div key={'d' + day + mo} className="day-h">{day}</div>); }
            return <div key={t.id}>{heads}<TxnRow s={s} t={t} now={now} accountId={acct === 'all' ? undefined : acct} onClick={() => openSheet({ t: 'txn', id: t.id })} /></div>;
          })}
        </div>
      ) : <Empty icon={<SearchX {...IC} size={22} />} title="Nothing matches" text="Adjust the search or filters to see more of the ledger." action={<button type="button" className="btn ghost" onClick={() => { clear(); setQ(''); }}>Clear search and filters</button>} />}
      {s.txns.some(t => statusOf(t, now) === 'pending') && <p className="footnote center">Pending payments settle about two minutes after instruction.</p>}
    </div>
  );
}
