import { useMemo, useState } from 'react';
import { ChevronRight, Plus, TrendingUp } from 'lucide-react';
import { addMonths, cashAt, monthStart, netFlow, openingAmount, positions, series, wealthAt } from '../engine/ledger';
import { convert, fmtBps, fmtQty, mulDiv, type Cur } from '../engine/money';
import { openSheet } from '../store/store';
import { AnimatedMoney, Empty, IC, Money, Seg, Sim, useData } from '../ui/bits';
import { AreaChart, Donut, FlowBars, PALETTE, type Slice } from '../ui/Chart';
import { rangeStart, RANGES, type Range } from './Home';

export default function Wealth() {
  const { s, now, bal, cur } = useData();
  const [range, setRange] = useState<Range>('All');
  const [view, setView] = useState<'Asset class' | 'Currency'>('Asset class');
  const pos = positions(s, now);
  const toCur = (usd: number) => convert(usd, 'USD', cur, s.rates);
  const invested = toCur(pos.reduce((n, p) => n + p.value, 0));
  const cash = cashAt(s, now, cur), total = wealthAt(s, now, cur);
  const cost = pos.reduce((n, p) => n + p.cost, 0), gain = pos.reduce((n, p) => n + p.gain, 0), realised = pos.reduce((n, p) => n + p.realised, 0);
  const from = rangeStart(range, now, s.inception);
  const W = (t: number) => wealthAt(s, Math.max(t, s.inception), cur);
  const pts = useMemo(() => series(s, from, now, W), [s, from, now, cur]);
  const opening = toCur(openingAmount(s)), since = total - opening;

  const slices: Slice[] = useMemo(() => {
    if (view === 'Currency') {
      const by: Partial<Record<Cur, number>> = {};
      for (const a of s.accounts) by[a.currency] = (by[a.currency] ?? 0) + convert(bal[a.id].balance, a.currency, cur, s.rates);
      by.USD = (by.USD ?? 0) + invested;
      return Object.entries(by).filter(([, v]) => v! > 0).map(([label, value], i) => ({ label, value: value!, color: PALETTE[i % PALETTE.length] }));
    }
    const by: Record<string, number> = { Cash: Math.max(0, cash) };
    for (const p of pos) by[p.holding.cls] = (by[p.holding.cls] ?? 0) + toCur(p.value);
    return Object.entries(by).filter(([, v]) => v > 0).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
  }, [s, now, cur, view]);

  const months = Array.from({ length: 6 }, (_, i) => {
    const a = addMonths(now, i - 5), f = netFlow(s, a, addMonths(a, 1), now);
    return { label: new Date(a).toLocaleDateString('en-GB', { month: 'short' }), a: toCur(f.inflow), b: toCur(f.outflow) };
  });
  const thisMonth = netFlow(s, monthStart(now), addMonths(now, 1), now);
  const net = toCur(thisMonth.inflow - thisMonth.outflow);

  return (
    <div className="screen">
      <header className="title"><h1>Wealth</h1><button type="button" className="icon-btn ring" aria-label="Add hypothetical holding" onClick={() => openSheet({ t: 'trade', mode: 'new' })}><Plus {...IC} /></button></header>
      <section className="hero compact">
        <div className="eyebrow">Net worth <Sim /></div>
        <AnimatedMoney c={total} cur={cur} className="wealth sm" />
        <div className="hero-meta"><span className={since > 0 ? 'pos' : since < 0 ? 'neg' : 'muted'}><Money c={since} cur={cur} sign /> <span className="num">({fmtBps(opening > 0 ? mulDiv(since, 10_000, opening) : 0, true)})</span></span><span className="muted">vs. opening scenario</span></div>
      </section>

      <section className="panel alloc">
        <Donut slices={slices}><span className="eyebrow">Invested</span><b className="num">{total > 0 ? fmtBps(mulDiv(invested, 10_000, total)) : '0.00%'}</b></Donut>
        <div className="alloc-r">
          <Seg small label="Allocation view" value={view} options={['Asset class', 'Currency'] as const} onChange={setView} />
          <ul className="legend">{slices.map(x => (
            <li key={x.label}><i style={{ background: x.color }} /><span>{x.label}</span><b className="num">{total > 0 ? fmtBps(mulDiv(x.value, 10_000, total)) : '—'}</b></li>
          ))}</ul>
        </div>
      </section>
      <section className="pair">
        <div><span className="eyebrow">Cash</span><Money c={cash} cur={cur} className="fig" /></div>
        <div><span className="eyebrow">Investments</span><Money c={invested} cur={cur} className="fig" /></div>
      </section>

      <section>
        <div className="sec-h"><h2>Historical performance</h2></div>
        <div className="panel"><AreaChart pts={pts} cur={cur} height={170} animKey={range} label={`Net worth history, ${range}`} />
          <Seg small label="History range" value={range} options={RANGES.map(r => r.v)} onChange={setRange} /></div>
      </section>

      <section>
        <div className="sec-h"><h2>Monthly net movement</h2><Money c={net} cur={cur} sign className={net > 0 ? 'pos' : net < 0 ? 'neg' : 'muted'} /></div>
        <div className="panel"><FlowBars items={months} cur={cur} /><p className="footnote">Inflows above, outflows below. Internal transfers and investment trades are excluded.</p></div>
      </section>

      <section>
        <div className="sec-h"><h2>Hypothetical holdings</h2>{pos.length > 0 && <span className={gain >= 0 ? 'pos' : 'neg'}><Money c={toCur(gain)} cur={cur} sign /> <span className="num">({fmtBps(cost > 0 ? mulDiv(gain, 10_000, cost) : 0, true)})</span></span>}</div>
        {pos.length ? (
          <div className="list">{pos.map(p => (
            <button key={p.holding.id} type="button" className="row" onClick={() => openSheet({ t: 'holding', id: p.holding.id })}>
              <span className="row-i mono">{p.holding.symbol.slice(0, 4)}</span>
              <span className="row-m"><span className="row-t">{p.holding.name}</span><span className="row-s">{fmtQty(p.qty)} × <Money c={p.price} /> · {p.holding.cls}</span></span>
              <span className="row-r"><Money c={p.value} /><small className={p.gain >= 0 ? 'pos' : 'neg'}>{fmtBps(p.gainBps, true)}</small></span>
              <ChevronRight {...IC} size={16} className="chev" />
            </button>
          ))}</div>
        ) : <Empty icon={<TrendingUp {...IC} size={22} />} title="No holdings yet" text="Model a position with your own quantity, price and return assumption. Prices are entered by you and are never live market data." action={<button type="button" className="btn ghost" onClick={() => openSheet({ t: 'trade', mode: 'new' })}>Add a holding</button>} />}
        {pos.length > 0 && <p className="footnote">Unrealised result against average cost. Realised to date: <Money c={toCur(realised)} cur={cur} sign />. All prices are user-entered illustrations.</p>}
      </section>
    </div>
  );
}
