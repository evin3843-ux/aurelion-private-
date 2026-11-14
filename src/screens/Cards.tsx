import { useEffect, useRef, useState } from 'react';
import { CreditCard, Settings2, ShoppingBag, Snowflake } from 'lucide-react';
import { addMonths, cardSpent, monthStart, spending, updateCard } from '../engine/ledger';
import { fmt } from '../engine/money';
import { act, openSheet, toast } from '../store/store';
import { Empty, IC, Money, Sim, TxnRow, useData } from '../ui/bits';
import { CardArt } from '../ui/CardArt';
import { PALETTE } from '../ui/Chart';

export default function Cards() {
  const { s, now, prefs } = useData();
  const [i, setI] = useState(0);
  const rail = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rail.current!;
    const on = () => setI(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  const c = s.cards[Math.min(i, s.cards.length - 1)];
  const spent = cardSpent(s, c.id, now), pct = c.limit > 0 ? Math.min(100, (spent / c.limit) * 100) : 0;
  const acct = s.accounts.find(a => a.id === c.accountId);
  const cat = spending(s, monthStart(now), addMonths(now, 1), now, { cardId: c.id });
  const tx = s.txns.filter(t => t.cardId === c.id).sort((a, b) => b.ts - a.ts);
  const freeze = () => { const r = act(st => updateCard(st, c.id, { frozen: !c.frozen })); if (r.ok) toast(c.frozen ? `${c.nickname} is active again` : `${c.nickname} frozen`); };
  const jump = (n: number) => rail.current?.scrollTo({ left: n * rail.current.clientWidth, behavior: 'smooth' });
  return (
    <div className="screen">
      <header className="title"><h1>Cards</h1><Sim /></header>
      <div className="card-rail" ref={rail} aria-label="Cards" role="group">
        {s.cards.map((x, n) => <div className="card-slide" key={x.id}><CardArt card={x} holder={s.profile.name} active={n === i} /></div>)}
      </div>
      <div className="dots" role="tablist" aria-label="Select card">
        {s.cards.map((x, n) => <button key={x.id} type="button" role="tab" aria-selected={n === i} aria-label={x.nickname} className={n === i ? 'on' : ''} onClick={() => jump(n)} />)}
      </div>

      <section className="swap" key={c.id}>
        <div className="card-h"><div><h2 className="serif">{c.nickname}</h2><p className="muted">{c.product} · linked to {acct?.name}</p></div><em className={'tag ' + (c.frozen ? 'pending' : 'ok')}>{c.frozen ? 'Frozen' : 'Active'}</em></div>
        <nav className="quick three" aria-label="Card actions">
          <button type="button" onClick={freeze} aria-pressed={c.frozen}><span className={c.frozen ? 'on' : ''}><Snowflake {...IC} /></span>{c.frozen ? 'Unfreeze' : 'Freeze'}</button>
          <button type="button" onClick={() => openSheet({ t: 'cardSpend', id: c.id })}><span><ShoppingBag {...IC} /></span>Simulate purchase</button>
          <button type="button" onClick={() => openSheet({ t: 'cardSettings', id: c.id })}><span><Settings2 {...IC} /></span>Settings</button>
        </nav>
        <div className="panel">
          <div className="sec-h tight"><span className="eyebrow">Spent this month</span><span className="eyebrow">Limit {prefs.hide ? '••••' : fmt(c.limit, 'USD', { cents: false })}</span></div>
          <Money c={spent} className="fig" />
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label="Monthly limit used"><span style={{ width: pct + '%' }} /></div>
          <p className="footnote"><Money c={Math.max(0, c.limit - spent)} /> remaining of the monthly limit.</p>
        </div>
        {cat.rows.length > 0 && (
          <div className="panel">
            <span className="eyebrow">Categories this month</span>
            <div className="cats">{cat.rows.map((r, n) => (
              <div key={r.category} className="cat"><span>{r.category}</span><Money c={r.amount} /><i><b style={{ width: `${(r.amount / cat.total) * 100}%`, background: PALETTE[n % PALETTE.length] }} /></i></div>
            ))}</div>
          </div>
        )}
        <div className="sec-h"><h2>Card activity</h2></div>
        {tx.length ? <div className="list">{tx.slice(0, 30).map(t => <TxnRow key={t.id} s={s} t={t} now={now} accountId={t.postings[0].accountId} onClick={() => openSheet({ t: 'txn', id: t.id })} />)}</div>
          : <Empty icon={<CreditCard {...IC} size={22} />} title="No card activity" text="Simulated purchases on this card will appear here." action={<button type="button" className="btn ghost" disabled={c.frozen} onClick={() => openSheet({ t: 'cardSpend', id: c.id })}>Simulate a purchase</button>} />}
      </section>
    </div>
  );
}
