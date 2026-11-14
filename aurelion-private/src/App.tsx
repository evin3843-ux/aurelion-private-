import { useEffect } from 'react';
import { ChartNoAxesColumn, CreditCard, House, ListOrdered, WalletCards } from 'lucide-react';
import { closeSheet, go, useApp, reducedMotion, type SheetSpec, type Tab } from './store/store';
import { Emblem, IC } from './ui/bits';
import { Sheet } from './ui/Sheet';
import Home from './screens/Home';
import Accounts from './screens/Accounts';
import Cards from './screens/Cards';
import Wealth from './screens/Wealth';
import Activity from './screens/Activity';
import { ConvertSheet, MoveSheet, RecipientSheet, RecipientsSheet, TransferSheet } from './sheets/MoneySheets';
import { AccountSheet, NewAccountSheet, TxnSheet } from './sheets/DetailSheets';
import { CardSettingsSheet, CardSpendSheet, HoldingSheet, TradeSheet } from './sheets/AssetSheets';
import { LockScreen, PinSheet, SettingsSheet } from './sheets/Settings';

const TABS: { id: Tab; l: string; i: typeof House }[] = [
  { id: 'home', l: 'Home', i: House }, { id: 'accounts', l: 'Accounts', i: WalletCards }, { id: 'cards', l: 'Cards', i: CreditCard },
  { id: 'wealth', l: 'Wealth', i: ChartNoAxesColumn }, { id: 'activity', l: 'Activity', i: ListOrdered },
];
const SCREENS: Record<Tab, () => React.ReactElement> = { home: Home, accounts: Accounts, cards: Cards, wealth: Wealth, activity: Activity };

function sheetOf(spec: SheetSpec, s: NonNullable<ReturnType<typeof useApp>['s']>): [string, React.ReactNode, boolean?] {
  switch (spec.t) {
    case 'transfer': return ['Transfer', <TransferSheet spec={spec} />];
    case 'move': return [spec.mode === 'deposit' ? 'Add funds' : 'Withdraw', <MoveSheet spec={spec} />];
    case 'convert': return ['Currency', <ConvertSheet />, true];
    case 'newAccount': return ['New account', <NewAccountSheet />];
    case 'settings': return ['Settings', <SettingsSheet />, true];
    case 'recipients': return ['Recipients', <RecipientsSheet />];
    case 'recipient': return [spec.id ? 'Edit recipient' : 'New recipient', <RecipientSheet spec={spec} />];
    case 'account': return [s.accounts.find(a => a.id === spec.id)?.name ?? 'Account', <AccountSheet spec={spec} />, true];
    case 'txn': return ['Transaction', <TxnSheet spec={spec} />];
    case 'cardSettings': return ['Card settings', <CardSettingsSheet spec={spec} />];
    case 'cardSpend': return ['Simulate purchase', <CardSpendSheet spec={spec} />];
    case 'holding': return [s.holdings.find(h => h.id === spec.id)?.name ?? 'Holding', <HoldingSheet spec={spec} />, true];
    case 'trade': return [spec.mode === 'new' ? 'New holding' : spec.mode === 'buy' ? 'Buy' : 'Sell', <TradeSheet spec={spec} />];
    case 'pin': return ['App lock', <PinSheet />];
  }
}

export default function App() {
  const app = useApp();
  const { prefs, tab } = app;
  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = prefs.theme; r.dataset.accent = prefs.accent;
    r.toggleAttribute('data-rm', reducedMotion());
  }, [prefs.theme, prefs.accent, prefs.motion]);
  useEffect(() => { document.querySelector('.view')?.scrollTo(0, 0); }, [tab]);

  if (!app.ready || !app.s) return (
    <div className="boot" aria-busy="true" aria-label="Loading Aurelion Private">
      <Emblem size={40} />
      <div className="skel w40" /><div className="skel w70 tall" /><div className="skel w100 block" /><div className="skel w100" /><div className="skel w100" />
    </div>
  );
  const Screen = SCREENS[tab];
  const modal = app.sheets.length > 0 || app.locked;
  return (
    <>
      <div className="shell" inert={modal || undefined}>
        <main className="view" key={tab}><Screen /></main>
        <nav className="tabs" aria-label="Primary">
          <span className="tab-ind" style={{ ['--i' as any]: TABS.findIndex(t => t.id === tab) }} aria-hidden="true" />
          {TABS.map(t => <button key={t.id} type="button" aria-current={t.id === tab ? 'page' : undefined} onClick={() => go(t.id)}><t.i {...IC} size={21} /><span>{t.l}</span></button>)}
        </nav>
      </div>
      {app.sheets.map(({ id, spec }) => { const [title, body, tall] = sheetOf(spec, app.s!); return <Sheet key={id} title={title} tall={tall} onClose={() => closeSheet(id)}>{body}</Sheet>; })}
      <div className="toasts" role="status" aria-live="polite">{app.toasts.map(t => <div key={t.id} className={'toast ' + (t.tone ?? '')}>{t.text}</div>)}</div>
      {app.locked && <LockScreen />}
      <div className="veil" aria-hidden="true"><Emblem size={44} /></div>
    </>
  );
}
