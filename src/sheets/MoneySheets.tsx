import { useEffect, useState } from 'react';
import { ArrowDown, Pencil, Plus, Trash2, Users } from 'lucide-react';
import * as L from '../engine/ledger';
import { convert, CURS, fmt, fmtRate, mulDiv, parseCents, parseDec, RATE_SCALE, type Cur } from '../engine/money';
import { CATEGORIES, SPEND_CATEGORIES } from '../engine/types';
import { act, getSnap, openSheet, toast, type SheetSpec } from '../store/store';
import { AmountInput, ConfirmBtn, Empty, Field, IC, Money, Row, Seg, Sim, useClose, useData, useKey } from '../ui/bits';

const SYM: Record<Cur, string> = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF', AED: 'AED' };

export function Success({ title, lines, onDone, txnKey }: { title: string; lines: [string, React.ReactNode][]; onDone: () => void; txnKey?: string }) {
  const id = txnKey && getSnap().s?.txns.find(t => t.key === txnKey)?.id;
  // A double-tap on the confirm button must not land on these buttons.
  const [armed, setArmed] = useState(false);
  useEffect(() => { const t = setTimeout(() => setArmed(true), 650); return () => clearTimeout(t); }, []);
  return (
    <div className="success" role="status">
      <svg viewBox="0 0 80 80" className="seal" aria-hidden="true"><circle cx="40" cy="40" r="36" pathLength={1} /><path d="M26 41.5 36 51l19-21" pathLength={1} /></svg>
      <h3 className="serif">{title}</h3>
      <Sim>Financial simulation · No real funds have moved</Sim>
      <dl className="kv">{lines.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <div className="stack">
        <button type="button" className="btn" onClick={() => armed && onDone()}>Done</button>
        {id && <button type="button" className="btn ghost" onClick={() => { if (!armed) return; onDone(); openSheet({ t: 'txn', id }); }}>View entry</button>}
      </div>
    </div>
  );
}

export function TransferSheet({ spec }: { spec: Extract<SheetSpec, { t: 'transfer' }> }) {
  const { s, bal } = useData();
  const close = useClose(), k = useKey();
  const accts = s.accounts.filter(a => !a.archived);
  const [ext, setExt] = useState(!!spec.external);
  const [from, setFrom] = useState(spec.from ?? (accts.find(a => a.primary) ?? accts[0]).id);
  const [to, setTo] = useState(spec.to ?? accts.find(a => a.id !== (spec.from ?? accts[0].id))?.id ?? '');
  const [rid, setRid] = useState(s.recipients[0]?.id ?? '');
  const [amt, setAmt] = useState('');
  const [ref, setRef] = useState('');
  const [cat, setCat] = useState('Services');
  const A = accts.find(a => a.id === from) ?? accts[0], B = accts.find(a => a.id === to), R = s.recipients.find(r => r.id === rid) ?? s.recipients[0];
  const [curSel, setCur] = useState<Cur | null>(null);
  const cur: Cur = ext ? curSel ?? R?.currency ?? A.currency : A.currency;
  const [step, setStep] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const cents = parseCents(amt);
  const debit = cents == null ? 0 : ext ? convert(cents, cur, A.currency, s.rates) : cents;
  const credit = cents == null || ext || !B ? 0 : convert(cents, A.currency, B.currency, s.rates);
  const cross = ext ? cur !== A.currency : !!B && B.currency !== A.currency;

  const review = () => {
    if (cents == null || cents <= 0) return setErr('Enter an amount greater than zero.');
    if (ext && !R) return setErr('Add a recipient first.');
    if (!ext && (!B || B.id === A.id)) return setErr('Choose two different accounts.');
    if (debit > bal[A.id].available) return setErr(`Insufficient available funds in ${A.name}.`);
    setErr(''); setStep(1);
  };
  const confirm = () => {
    if (busy) return;
    setBusy(true);
    const r = ext
      ? act((st, now) => L.pay(st, { key: k.key(), from: A.id, recipientId: R!.id, amount: cents!, cur, description: ref || undefined, category: cat }, now))
      : act((st, now) => L.transfer(st, { key: k.key(), from: A.id, to: B!.id, amount: cents!, description: ref || undefined }, now));
    setBusy(false);
    if (r.ok) setStep(2); else { setErr(r.error); setStep(0); }
  };
  const lines: [string, React.ReactNode][] = [
    ['From', A.name],
    ['To', ext ? `${R?.name} · ${R?.institution}` : B?.name],
    ['Amount', fmt(cents ?? 0, cur)],
    ...(cross ? [[ext ? 'Debited' : 'Credited', fmt(ext ? debit : credit, ext ? A.currency : B!.currency)], ['Illustrative rate', `1 ${A.currency} = ${fmtRate(mulDiv(s.rates[ext ? cur : B!.currency], RATE_SCALE, s.rates[A.currency]))} ${ext ? cur : B!.currency}`]] as [string, React.ReactNode][] : []),
    ...(ref ? [['Reference', ref] as [string, React.ReactNode]] : []),
    ['Settlement', ext ? 'Pending for about two minutes; cancellable until settled' : 'Immediate'],
  ];

  if (step === 2) return <Success title={ext ? 'Payment instructed' : 'Transfer complete'} lines={lines} onDone={close} txnKey={k.key()} />;
  if (step === 1) return (
    <div className="form">
      <div className="review-amt"><span className="eyebrow">{ext ? 'You are sending' : 'You are moving'}</span><span className="wealth sm num">{fmt(cents!, cur)}</span><Sim /></div>
      <dl className="kv">{lines.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
      <div className="stack"><button type="button" className="btn" disabled={busy} onClick={confirm}>Confirm {ext ? 'payment' : 'transfer'}</button><button type="button" className="btn ghost" onClick={() => setStep(0)}>Edit</button></div>
    </div>
  );
  return (
    <div className="form">
      <Seg label="Transfer type" value={ext ? 'ext' : 'own'} options={[{ v: 'own', l: 'Between my accounts' }, { v: 'ext', l: 'To a recipient' }]} onChange={v => { setExt(v === 'ext'); setErr(''); }} />
      <Field label="From" hint={<>Available <Money c={bal[A.id].available} cur={A.currency} /></>}>
        <select value={A.id} onChange={e => setFrom(e.target.value)}>{accts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select>
      </Field>
      <div className="flow-arrow" aria-hidden="true"><ArrowDown {...IC} size={16} /></div>
      {ext ? (s.recipients.length ? (
        <Field label="Recipient" hint={<button type="button" className="link" onClick={() => openSheet({ t: 'recipients' })}>Manage recipients</button>}>
          <select value={R?.id} onChange={e => { setRid(e.target.value); setCur(null); }}>{s.recipients.map(r => <option key={r.id} value={r.id}>{r.name} · {r.currency}</option>)}</select>
        </Field>
      ) : <Empty icon={<Users {...IC} size={22} />} title="No recipients yet" text="Add a fictional recipient to simulate an outgoing payment." action={<button type="button" className="btn ghost" onClick={() => openSheet({ t: 'recipient' })}>Add recipient</button>} />
      ) : (
        <Field label="To"><select value={B?.id ?? ''} onChange={e => setTo(e.target.value)}>{accts.filter(a => a.id !== A.id).map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></Field>
      )}
      {ext && <Seg small label="Payment currency" value={cur} options={CURS} onChange={c => setCur(c)} />}
      <AmountInput value={amt} onChange={v => { setAmt(v); setErr(''); }} prefix={SYM[cur]} />
      {cross && cents != null && cents > 0 && <p className="footnote center">{ext ? <>Debits <b className="num">{fmt(debit, A.currency)}</b> from {A.name}</> : <>Arrives as <b className="num">{fmt(credit, B!.currency)}</b></>} at your illustrative rate.</p>}
      <Field label="Reference"><input value={ref} maxLength={60} placeholder="Optional" onChange={e => setRef(e.target.value)} /></Field>
      {ext && <Field label="Category"><select value={cat} onChange={e => setCat(e.target.value)}>{SPEND_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>}
      {err && <p className="err" role="alert">{err}</p>}
      <button type="button" className="btn" onClick={review} disabled={ext && !R}>Review</button>
    </div>
  );
}

export function MoveSheet({ spec }: { spec: Extract<SheetSpec, { t: 'move' }> }) {
  const { s, bal } = useData();
  const close = useClose(), k = useKey();
  const dep = spec.mode === 'deposit';
  const accts = s.accounts.filter(a => !a.archived);
  const [id, setId] = useState(spec.accountId ?? (accts.find(a => a.primary) ?? accts[0]).id);
  const [amt, setAmt] = useState(''); const [desc, setDesc] = useState(''); const [note, setNote] = useState('');
  const [cat, setCat] = useState(dep ? 'Income' : 'Other');
  const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const A = accts.find(a => a.id === id) ?? accts[0];
  const cents = parseCents(amt);
  const submit = () => {
    if (cents == null || cents <= 0) return setErr('Enter an amount greater than zero.');
    const i = { key: k.key(), accountId: A.id, amount: cents, description: desc || undefined, category: cat, note: note || undefined };
    const r = act((st, now) => (dep ? L.deposit(st, i, now) : L.withdraw(st, i, now)));
    if (r.ok) setDone(true); else setErr(r.error);
  };
  if (done) return <Success title={dep ? 'Funds added' : 'Withdrawal recorded'} lines={[['Account', A.name], ['Amount', fmt(cents!, A.currency)], ['Description', desc || (dep ? 'Funds received' : 'Withdrawal')]]} onDone={close} txnKey={k.key()} />;
  return (
    <div className="form">
      <Field label="Account" hint={<>Available <Money c={bal[A.id].available} cur={A.currency} /></>}>
        <select value={A.id} onChange={e => setId(e.target.value)}>{accts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select>
      </Field>
      <AmountInput value={amt} onChange={v => { setAmt(v); setErr(''); }} prefix={SYM[A.currency]} />
      <Field label="Description"><input value={desc} maxLength={60} placeholder={dep ? 'Funds received' : 'Withdrawal'} onChange={e => setDesc(e.target.value)} /></Field>
      <Field label="Category"><select value={cat} onChange={e => setCat(e.target.value)}>{CATEGORIES.filter(c => c !== 'Transfer' && c !== 'Investment').map(c => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Note"><input value={note} maxLength={120} placeholder="Optional" onChange={e => setNote(e.target.value)} /></Field>
      {err && <p className="err" role="alert">{err}</p>}
      <button type="button" className="btn" onClick={submit}>{dep ? 'Add simulated funds' : 'Record withdrawal'}</button>
      <p className="footnote center">Entries exist only in this simulation on this device.</p>
    </div>
  );
}

export function ConvertSheet() {
  const { s } = useData();
  const close = useClose();
  const [amt, setAmt] = useState('1,000.00'); const [a, setA] = useState<Cur>('USD'); const [b, setB] = useState<Cur>('EUR');
  const [edit, setEdit] = useState<Partial<Record<Cur, string>>>({});
  const cents = parseCents(amt) ?? 0;
  const save = (c: Cur) => {
    const v = edit[c]; if (v == null) return;
    const rate = parseDec(v, 6);
    const r = rate == null ? { ok: false as const, error: 'Enter a rate with up to six decimals.' } : act(st => L.setRate(st, c, rate));
    if (r.ok) { setEdit(e => ({ ...e, [c]: undefined })); toast(`${c} rate updated`); } else toast(r.error, 'warn');
  };
  return (
    <div className="form">
      <AmountInput value={amt} onChange={setAmt} prefix={SYM[a]} label="Amount to convert" />
      <div className="grid2">
        <Field label="From"><select value={a} onChange={e => setA(e.target.value as Cur)}>{CURS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="To"><select value={b} onChange={e => setB(e.target.value as Cur)}>{CURS.map(c => <option key={c}>{c}</option>)}</select></Field>
      </div>
      <div className="result"><span className="eyebrow">Converts to</span><span className="wealth sm num">{fmt(convert(cents, a, b, s.rates), b)}</span>
        <span className="muted num">1 {a} = {fmtRate(mulDiv(s.rates[b], RATE_SCALE, s.rates[a]))} {b}</span></div>
      <button type="button" className="btn ghost" onClick={() => { close(); openSheet({ t: 'transfer' }); }}>Move funds between currencies</button>
      <div className="sec-h"><h2>Illustrative rates</h2><span className="muted">per 1 USD</span></div>
      <div className="list">{CURS.filter(c => c !== 'USD').map(c => (
        <div key={c} className="row"><span className="row-i mono">{c}</span>
          <span className="row-m"><input className="inline" inputMode="decimal" aria-label={`${c} per USD`} value={edit[c] ?? fmtRate(s.rates[c])} onChange={e => setEdit(x => ({ ...x, [c]: e.target.value }))} onKeyDown={e => e.key === 'Enter' && save(c)} /></span>
          <button type="button" className="btn ghost small" disabled={edit[c] == null} onClick={() => save(c)}>Save</button></div>
      ))}</div>
      <p className="footnote">These rates are entered by you for illustration. They are not live market rates and are applied to every conversion and to totals shown in your default currency.</p>
      <ConfirmBtn className="link block" label="Restore default illustrative rates" confirm="Tap again to restore" onConfirm={() => { CURS.filter(c => c !== 'USD').forEach(c => act(st => L.setRate(st, c, L.DEFAULT_RATES[c]))); setEdit({}); }} />
    </div>
  );
}

export function RecipientsSheet() {
  const { s, prefs } = useData();
  return (
    <div className="form">
      {s.recipients.length ? <div className="list">{s.recipients.map(r => (
        <Row key={r.id} icon={<span className="mono">{r.currency}</span>} title={r.name} sub={`${r.institution} · ${prefs.privacy ? 'RCP-SIM-••••' : r.ident}`}
          right={<span className="acts"><button type="button" className="icon-btn" aria-label={`Edit ${r.name}`} onClick={() => openSheet({ t: 'recipient', id: r.id })}><Pencil {...IC} size={16} /></button>
            <ConfirmBtn className="icon-btn" ariaLabel={`Remove ${r.name}`} label={<Trash2 {...IC} size={16} />} confirm="Remove?" onConfirm={() => act(st => L.removeRecipient(st, r.id))} /></span>} />
      ))}</div> : <Empty icon={<Users {...IC} size={22} />} title="No recipients" text="Recipients are fictional counterparties for simulated outgoing payments." />}
      <button type="button" className="btn" onClick={() => openSheet({ t: 'recipient' })}><Plus {...IC} size={18} /> Add recipient</button>
      <p className="footnote center">Past entries keep their description if a recipient is removed.</p>
    </div>
  );
}
export function RecipientSheet({ spec }: { spec: Extract<SheetSpec, { t: 'recipient' }> }) {
  const { s } = useData();
  const close = useClose();
  const r = s.recipients.find(x => x.id === spec.id);
  const [name, setName] = useState(r?.name ?? ''); const [inst, setInst] = useState(r?.institution ?? ''); const [cur, setCur] = useState<Cur>(r?.currency ?? 'USD');
  const [err, setErr] = useState('');
  const save = () => { const res = act(st => L.saveRecipient(st, { id: r?.id, name, institution: inst, currency: cur })); if (res.ok) close(); else setErr(res.error); };
  return (
    <div className="form">
      <Field label="Recipient name" error={err}><input value={name} maxLength={40} autoFocus onChange={e => { setName(e.target.value); setErr(''); }} /></Field>
      <Field label="Institution" hint="A fictional institution name."><input value={inst} maxLength={40} placeholder="Fictional institution" onChange={e => setInst(e.target.value)} /></Field>
      <Seg label="Recipient currency" value={cur} options={CURS} onChange={setCur} />
      <p className="footnote">A simulation-only identifier is generated automatically. No real account details are stored or needed.</p>
      <button type="button" className="btn" onClick={save}>{r ? 'Save recipient' : 'Add recipient'}</button>
    </div>
  );
}
