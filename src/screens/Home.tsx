import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, ChevronRight, Eye, EyeOff, Repeat, User } from 'lucide-react';
import { addMonths, flow, holdingsValueAt, monthStart, series, statusOf, wealthAt } from '../engine/ledger';
import { convert, fmtBps, mulDiv } from '../engine/money';
import { go, openSheet, setPrefs } from '../store/store';
import { AnimatedMoney, Emblem, IC, Money, Seg, Sim, TxnRow, useData } from '../ui/bits';
import { AreaChart } from '../ui/Chart';

export const RANGES = [
  { v: '1D', ms: 864e5 }, { v: '1W', ms: 7 * 864e5 }, { v: '1M', ms: 30 * 864e5 }, { v: '3M', ms: 91 * 864e5 },
  { v: '6M', ms: 182 * 864e5 }, { v: '1Y', ms: 365 * 864e5 }, { v: 'All', ms: Infinity },
] as const;
export type Range = (typeof RANGES)[number]['v'];
export function rangeStart(range: Range, now: number, inception: number) {
  const ms = RANGES.find(r => r.v === range)!.ms;
  return Math.min(Math.max(ms === Infinity ? inception : now - ms, inception), now - 60_000);
}

export default function Home() {
  const { s, now, prefs, bal, cur } = useData();
  const [range, setRange] = useState<Range>('1M');
  const [sel, setSel] = useState(0);
  const active = s.accounts.filter(a => !a.archived);
  const W = (t: number) => wealthAt(s, Math.max(t, s.inception), cur);
  const from = rangeStart(range, now, s.inception);
  const pts = useMemo(() => series(s, from, now, W), [s, from, now, cur]);
  const total = pts[pts.length - 1].v, base = pts[0].v, delta = total - base;
  const available = active.reduce((n, a) => n + convert(bal[a.id].available, a.currency, cur, s.rates), 0);
  const invested = convert(holdingsValueAt(s, now), 'USD', cur, s.rates);
  const cash = total - invested;
  const recent = [...s.txns].sort((a, b) => b.ts - a.ts).slice(0, 5);
  const pending = s.txns.filter(t => statusOf(t, now) === 'pending').length;
  const a = active[Math.min(sel, active.length - 1)];
  const f = flow(s, a.id, monthStart(now), addMonths(now, 1), now);
  const hour = new Date(now).getHours();
  const actions = [
    { l: 'Transfer', i: ArrowLeftRight, f: () => openSheet({ t: 'transfer' }) },
    { l: 'Add funds', i: ArrowDownLeft, f: () => openSheet({ t: 'move', mode: 'deposit' }) },
    { l: 'Withdraw', i: ArrowUpRight, f: () => openSheet({ t: 'move', mode: 'withdraw' }) },
    { l: 'Convert', i: Repeat, f: () => openSheet({ t: 'convert' }) },
  ];
  return (
    <div className="screen">
      <header className="top">
        <div className="brand"><Emblem size={30} /><div><b>AURELION</b><span>PRIVATE</span></div></div>
        <div className="top-r">
          <button type="button" className="icon-btn" aria-label={prefs.hide ? 'Show figures' : 'Hide figures'} aria-pressed={prefs.hide} onClick={() => setPrefs({ hide: !prefs.hide })}>{prefs.hide ? <EyeOff {...IC} /> : <Eye {...IC} />}</button>
          <button type="button" className="avatar" aria-label="Profile and settings" onClick={() => openSheet({ t: 'settings' })}>{s.profile.photo ? <img src={s.profile.photo} alt="" /> : <User {...IC} size={18} />}</button>
        </div>
      </header>

      <section className="hero">
        <p className="greet">{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}, {s.profile.name}</p>
        <div className="eyebrow">Total wealth <Sim /></div>
        <AnimatedMoney c={total} cur={cur} className="wealth" />
        <div className="hero-meta">
          <span className={delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'muted'}>
            <Money c={delta} cur={cur} sign /> <span className="num">({fmtBps(base > 0 ? mulDiv(delta, 10_000, base) : 0, true)})</span>
          </span>
          <span className="muted">{range === 'All' ? 'since inception' : `past ${range}`}</span>
        </div>
        <AreaChart pts={pts} cur={cur} animKey={range} label={`Total wealth, ${range}`} />
        <Seg small label="Chart range" value={range} options={RANGES.map(r => r.v)} onChange={setRange} />
        <p className="footnote">Derived from your simulated ledger{active.some(x => x.currency !== cur && bal[x.id].balance !== 0) || (cur !== 'USD' && invested !== 0) ? ' at illustrative exchange rates' : ''}.</p>
      </section>

      <section className="pair">
        <div><span className="eyebrow">Available funds</span><Money c={available} cur={cur} className="fig" /></div>
        <div><span className="eyebrow">Pending</span><span className="fig num">{pending}</span></div>
      </section>

      <nav className="quick" aria-label="Quick actions">
        {actions.map(x => <button key={x.l} type="button" onClick={x.f}><span><x.i {...IC} /></span>{x.l}</button>)}
      </nav>

      <section>
        <div className="sec-h"><h2>Accounts</h2><button type="button" className="link" onClick={() => go('accounts')}>All accounts</button></div>
        <div className="rail" role="tablist" aria-label="Account selector">
          {active.map((x, i) => (
            <button key={x.id} type="button" role="tab" aria-selected={i === sel} className={'chip-card' + (i === sel ? ' on' : '')} onClick={() => setSel(i)}>
              <span className="chip-n">{x.name}</span>
              <Money c={bal[x.id].balance} cur={x.currency} className="chip-v" />
              <span className="chip-id">{prefs.privacy ? '••••' : x.ident.slice(-7)}</span>
            </button>
          ))}
        </div>
        <div className="panel swap" key={a.id}>
          <div className="grid2">
            <div><span className="eyebrow">Balance</span><Money c={bal[a.id].balance} cur={a.currency} className="fig" /></div>
            <div><span className="eyebrow">Available</span><Money c={bal[a.id].available} cur={a.currency} className="fig" /></div>
            <div><span className="eyebrow">In this month</span><Money c={f.inflow} cur={a.currency} className="fig sm pos" /></div>
            <div><span className="eyebrow">Out this month</span><Money c={f.outflow} cur={a.currency} className="fig sm" /></div>
          </div>
          <button type="button" className="row slim" onClick={() => openSheet({ t: 'account', id: a.id })}><span className="row-m"><span className="row-t">Account details</span></span><ChevronRight {...IC} size={16} /></button>
        </div>
      </section>

      <section>
        <div className="sec-h"><h2>Portfolio</h2><button type="button" className="link" onClick={() => go('wealth')}>Wealth</button></div>
        <button type="button" className="panel tap" onClick={() => go('wealth')}>
          <div className="split" aria-hidden="true"><span style={{ flex: Math.max(cash, 0) || (invested ? 0 : 1) }} /><span className="alt" style={{ flex: Math.max(invested, 0) }} /></div>
          <div className="grid2">
            <div><span className="eyebrow"><i className="dot" />Cash</span><Money c={cash} cur={cur} className="fig sm" /></div>
            <div><span className="eyebrow"><i className="dot alt" />Investments</span><Money c={invested} cur={cur} className="fig sm" /></div>
          </div>
        </button>
      </section>

      <section>
        <div className="sec-h"><h2>Recent activity</h2><button type="button" className="link" onClick={() => go('activity')}>View all</button></div>
        <div className="list">{recent.map(t => <TxnRow key={t.id} s={s} t={t} now={now} onClick={() => openSheet({ t: 'txn', id: t.id })} />)}</div>
      </section>
    </div>
  );
}
