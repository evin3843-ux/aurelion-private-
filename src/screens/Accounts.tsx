import { useState } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { holdingsValueAt } from '../engine/ledger';
import { convert } from '../engine/money';
import type { Account } from '../engine/types';
import { openSheet } from '../store/store';
import { AnimatedMoney, IC, Money, Sim, useData } from '../ui/bits';

export default function Accounts() {
  const { s, now, bal, cur, prefs } = useData();
  const [showArchived, setShowArchived] = useState(false);
  const hv = holdingsValueAt(s, now);
  const live = s.accounts.filter(a => !a.archived), archived = s.accounts.filter(a => a.archived);
  const groups: [string, Account[]][] = [
    ['Cash accounts', live.filter(a => ['current', 'reserve', 'investment', 'custom'].includes(a.kind))],
    ['Multi-Currency Account', live.filter(a => a.kind === 'multi')],
    ['Wealth', live.filter(a => a.kind === 'portfolio')],
  ];
  const sum = (as: Account[]) => as.reduce((n, a) => n + convert(bal[a.id].balance + (a.kind === 'portfolio' ? hv : 0), a.currency, cur, s.rates), 0);
  const hasPortfolio = live.some(a => a.kind === 'portfolio');
  const total = sum(live) + (hasPortfolio ? 0 : convert(hv, 'USD', cur, s.rates));
  const row = (a: Account) => (
    <button key={a.id} type="button" className="row acct" onClick={() => openSheet({ t: 'account', id: a.id })}>
      <span className="row-i mono">{a.currency}</span>
      <span className="row-m"><span className="row-t">{a.name}{a.primary && <em className="tag">Primary</em>}</span><span className="row-s">{prefs.privacy ? 'AUR-SIM-••••' : a.ident}{a.kind === 'portfolio' && hv > 0 ? ' · incl. holdings' : ''}</span></span>
      <span className="row-r"><Money c={bal[a.id].balance + (a.kind === 'portfolio' ? hv : 0)} cur={a.currency} />{bal[a.id].available !== bal[a.id].balance && <small className="muted"><Money c={bal[a.id].available} cur={a.currency} /> avail.</small>}</span>
      <ChevronRight {...IC} size={16} className="chev" />
    </button>
  );
  return (
    <div className="screen">
      <header className="title"><h1>Accounts</h1><button type="button" className="icon-btn ring" aria-label="New account" onClick={() => openSheet({ t: 'newAccount' })}><Plus {...IC} /></button></header>
      <section className="hero compact">
        <div className="eyebrow">Across all accounts <Sim /></div>
        <AnimatedMoney c={total} cur={cur} className="wealth sm" />
        {!hasPortfolio && hv > 0 && <p className="footnote">Includes holdings of <Money c={convert(hv, 'USD', cur, s.rates)} cur={cur} />.</p>}
      </section>
      {groups.filter(([, as]) => as.length).map(([name, as]) => (
        <section key={name}>
          <div className="sec-h"><h2>{name}</h2><Money c={sum(as)} cur={cur} className="muted" /></div>
          <div className="list">{as.map(row)}</div>
        </section>
      ))}
      {archived.length > 0 && (
        <section>
          <button type="button" className="link block" aria-expanded={showArchived} onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide' : 'Show'} archived ({archived.length})</button>
          {showArchived && <div className="list dim">{archived.map(row)}</div>}
        </section>
      )}
    </div>
  );
}
