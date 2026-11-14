import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Briefcase, Building2, CreditCard, Gem, HandHeart, HeartPulse,
  Landmark, Plane, RotateCcw, Send, ShoppingBag, Sparkles, TrendingUp, Utensils, Wallet,
} from 'lucide-react';
import { fmt, type Cur } from '../engine/money';
import { balances, statusOf } from '../engine/ledger';
import type { State, Txn } from '../engine/types';
import { newKey, reducedMotion, useApp } from '../store/store';

export const IC = { size: 20, strokeWidth: 1.5 } as const;

/** Non-null view of the store for screens rendered after boot. */
export function useData() {
  const a = useApp();
  const s = a.s as State;
  return { s, now: a.now, prefs: a.prefs, bal: balances(s, a.now), cur: a.prefs.cur };
}

export function Emblem({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" className="emblem">
      <path d="M24 3 45 24 24 45 3 24Z" />
      <path d="M14.5 30.5 24 12l9.5 18.5" strokeLinejoin="round" />
      <path d="M18.6 24h10.8" />
      <circle cx="24" cy="36.2" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
export const Sim = ({ children = 'Financial simulation' }: { children?: ReactNode }) => <span className="sim">{children}</span>;

export function Money({ c, cur = 'USD', sign, className }: { c: number; cur?: Cur; sign?: boolean; className?: string }) {
  const { prefs } = useApp();
  return <span className={'num ' + (className ?? '')}>{prefs.hide ? '••••••' : fmt(c, cur, { sign })}</span>;
}
export function useTween(target: number) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reducedMotion() || from.current === target) { from.current = target; setV(target); return; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      const cur = Math.round(a + (target - a) * e);
      from.current = cur; setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
export function AnimatedMoney({ c, cur, className }: { c: number; cur?: Cur; className?: string }) {
  const v = useTween(c);
  const { prefs } = useApp();
  if (prefs.hide) return <span className={'num ' + (className ?? '')}>••••••••</span>;
  const text = fmt(v, cur), dot = text.lastIndexOf('.');
  return <span className={'num ' + (className ?? '')} aria-label={fmt(c, cur)}>{text.slice(0, dot)}<span className="cents">{text.slice(dot)}</span></span>;
}

export function Seg<T extends string>({ value, options, onChange, label, small }: { value: T; options: readonly (T | { v: T; l: string })[]; onChange: (v: T) => void; label: string; small?: boolean }) {
  const opts = options.map(o => (typeof o === 'string' ? { v: o, l: o } : o));
  const i = Math.max(0, opts.findIndex(o => o.v === value));
  return (
    <div className={'seg' + (small ? ' small' : '')} role="radiogroup" aria-label={label} style={{ ['--n' as any]: opts.length, ['--i' as any]: i }}>
      <span className="seg-ind" aria-hidden="true" />
      {opts.map(o => (
        <button key={o.v} type="button" role="radio" aria-checked={o.v === value} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}
export function Field({ label, hint, error, children, group }: { label: string; hint?: ReactNode; error?: string; children: ReactNode; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={'field' + (error ? ' bad' : '')}>
      <span className="field-l">{label}</span>
      {children}
      {error ? <span className="field-e" role="alert">{error}</span> : hint ? <span className="field-h">{hint}</span> : null}
    </Tag>
  );
}
export function AmountInput({ value, onChange, prefix, autoFocus, label = 'Amount' }: { value: string; onChange: (v: string) => void; prefix: string; autoFocus?: boolean; label?: string }) {
  return (
    <div className="amount">
      <span className="amount-p" aria-hidden="true">{prefix}</span>
      <input inputMode="decimal" autoComplete="off" aria-label={label} placeholder="0.00" value={value} autoFocus={autoFocus}
        onChange={e => { const v = e.target.value.replace(/[^\d.,]/g, ''); if ((v.match(/\./g) || []).length <= 1) onChange(v); }}
        onFocus={e => setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250)} />
    </div>
  );
}
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="toggle" onClick={() => onChange(!on)}><span /></button>;
}
export function Row({ icon, title, sub, right, onClick, danger }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; danger?: boolean }) {
  const inner = (<>
    {icon && <span className="row-i">{icon}</span>}
    <span className="row-m"><span className={'row-t' + (danger ? ' neg' : '')}>{title}</span>{sub && <span className="row-s">{sub}</span>}</span>
    {right && <span className="row-r">{right}</span>}
  </>);
  return onClick ? <button type="button" className="row" onClick={onClick}>{inner}</button> : <div className="row">{inner}</div>;
}
export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-i">{icon}</span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
/** Button that asks for a second tap before a destructive action. */
export function ConfirmBtn({ label, confirm, onConfirm, className = 'btn ghost danger', ariaLabel }: { label: ReactNode; confirm: ReactNode; onConfirm: () => void; className?: string; ariaLabel?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  return <button type="button" aria-label={ariaLabel} className={className + (armed ? ' armed' : '')} onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}>{armed ? confirm : label}</button>;
}
/** One idempotency key per form instance; renew after a successful submit. */
export function useKey() {
  const r = useRef(newKey());
  return { key: () => r.current, renew: () => { r.current = newKey(); } };
}

const CAT: Record<string, typeof Wallet> = {
  Transfer: ArrowLeftRight, Income: ArrowDownLeft, Dining: Utensils, Travel: Plane, Aviation: Send, Shopping: ShoppingBag,
  Residences: Building2, 'Art & Collectibles': Gem, Wellness: HeartPulse, Philanthropy: HandHeart, Services: Briefcase,
  Investment: TrendingUp, Other: Sparkles,
};
export function TxnIcon({ t }: { t: Txn }) {
  const I = t.type === 'opening' ? Landmark : t.type === 'refund' ? RotateCcw : t.type === 'withdrawal' ? ArrowUpRight : t.type === 'card' && !CAT[t.category] ? CreditCard : CAT[t.category] ?? Wallet;
  return <I {...IC} size={18} />;
}

const D = (ts: number) => new Date(ts);
export const fmtDate = (ts: number) => D(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtTime = (ts: number) => D(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
export const fmtMonth = (ts: number) => D(ts).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
export const fmtShort = (ts: number, span: number) =>
  span < 6e5 ? D(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : span < 2 * 864e5 ? fmtTime(ts) : D(ts).toLocaleDateString('en-GB', span > 300 * 864e5 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' });
export function dayLabel(ts: number, now: number) {
  const a = new Date(ts).setHours(0, 0, 0, 0), b = new Date(now).setHours(0, 0, 0, 0);
  return a === b ? 'Today' : b - a === 864e5 ? 'Yesterday' : fmtDate(ts);
}

/** How a transaction reads in a feed: signed for one account, neutral for internal transfers. */
export function txnView(s: State, t: Txn, accountId?: string) {
  const cur = (id: string) => s.accounts.find(a => a.id === id)?.currency ?? 'USD';
  const p = (accountId && t.postings.find(x => x.accountId === accountId)) || t.postings[0];
  const neutral = !accountId && t.type === 'transfer';
  return { amount: neutral ? Math.abs(p.amount) : p.amount, cur: cur(p.accountId) as Cur, neutral, account: s.accounts.find(a => a.id === p.accountId) };
}
export function TxnRow({ s, t, now, accountId, onClick }: { s: State; t: Txn; now: number; accountId?: string; onClick: () => void }) {
  const v = txnView(s, t, accountId), st = statusOf(t, now);
  return (
    <Row onClick={onClick} icon={<TxnIcon t={t} />} title={t.description}
      sub={<>{st !== 'completed' && <em className={'tag ' + st}>{st}</em>}{fmtTime(t.ts)} · {accountId ? t.category : v.account?.name}</>}
      right={<Money c={v.amount} cur={v.cur} sign={!v.neutral} className={st === 'cancelled' ? 'struck' : v.neutral ? 'muted' : v.amount > 0 ? 'pos' : ''} />} />
  );
}

export const SheetCtx = createContext<() => void>(() => {});
export const useClose = () => useContext(SheetCtx);
