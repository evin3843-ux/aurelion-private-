import { useRef, useState } from 'react';
import { Camera, ChevronRight, Delete, User } from 'lucide-react';
import * as L from '../engine/ledger';
import { CURS, fmt, parseCents } from '../engine/money';
import { act, checkPin, clearPin, exportJson, getSnap, importJson, openSheet, resetAll, setLocked, setPin, setPrefs, toast } from '../store/store';
import { ConfirmBtn, Emblem, Field, IC, Row, Seg, Toggle, useClose, useData } from '../ui/bits';

function resizePhoto(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
      const k = Math.max(n / img.width, n / img.height), w = img.width * k, h = img.height * k;
      c.getContext('2d')!.drawImage(img, (n - w) / 2, (n - h) / 2, w, h);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}

export function SettingsSheet() {
  const { s, now, prefs } = useData();
  const [name, setName] = useState(s.profile.name);
  const [opening, setOpening] = useState(fmt(L.openingAmount(s)).slice(1));
  const [resetAmt, setResetAmt] = useState('20,000,000.00');
  const photo = useRef<HTMLInputElement>(null), imp = useRef<HTMLInputElement>(null);
  const canNotify = typeof Notification !== 'undefined';
  const issues = L.reconcile(s, now);

  const doExport = async () => {
    const name = `aurelion-private-simulation-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([exportJson()], name, { type: 'application/json' });
    try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Aurelion Private — simulation backup' }); return; } } catch (e: any) { if (e?.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Backup exported');
  };
  const doImport = async (f?: File) => { if (!f) return; const r = importJson(await f.text()); toast(r.ok ? 'Backup restored' : r.error, r.ok ? 'ok' : 'warn'); if (r.ok) { setName(getSnap().s!.profile.name); setOpening(fmt(L.openingAmount(getSnap().s!)).slice(1)); } };
  const applyOpening = () => { const c = parseCents(opening); const r = c == null ? { ok: false as const, error: 'Enter a valid amount.' } : act((st, n) => L.setOpening(st, c, n)); toast(r.ok ? 'Scenario updated; balances reconciled' : r.error, r.ok ? 'ok' : 'warn'); };
  const doReset = async () => { const c = parseCents(resetAmt); if (c == null) return toast('Enter a valid opening amount.', 'warn'); await resetAll(c); toast('Simulation reset'); };
  const sysNotif = async (on: boolean) => {
    if (!on) return setPrefs({ notifSystem: false });
    const p = await Notification.requestPermission();
    setPrefs({ notifSystem: p === 'granted' });
    if (p !== 'granted') toast('Notifications are not permitted for this app.', 'warn');
  };
  return (
    <div className="form settings">
      <div className="profile">
        <button type="button" className="avatar big" aria-label="Change profile photo" onClick={() => photo.current?.click()}>{s.profile.photo ? <img src={s.profile.photo} alt="" /> : <User {...IC} size={30} />}<i><Camera size={13} strokeWidth={1.6} /></i></button>
        <input ref={photo} type="file" accept="image/*" hidden onChange={async e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; try { const d = await resizePhoto(f); act(st => L.setProfile(st, { photo: d })); } catch { toast('That image could not be read.', 'warn'); } }} />
        <div><b className="serif">{s.profile.name}</b><span className="muted">{s.profile.tier} · Aurelion Private</span>
          {s.profile.photo && <button type="button" className="link" onClick={() => act(st => L.setProfile(st, { photo: undefined }))}>Remove photo</button>}</div>
      </div>
      <Field label="Preferred name"><input value={name} maxLength={40} onChange={e => setName(e.target.value)} onBlur={() => name.trim() && name !== s.profile.name && act(st => L.setProfile(st, { name }))} /></Field>

      <h3>Display</h3>
      <Field group label="Default currency" hint="Totals convert at your illustrative rates."><Seg label="Default currency" value={prefs.cur} options={CURS} onChange={cur => setPrefs({ cur })} /></Field>
      <Field group label="Theme"><Seg label="Theme" value={prefs.theme} options={[{ v: 'obsidian', l: 'Obsidian' }, { v: 'graphite', l: 'Graphite' }]} onChange={theme => setPrefs({ theme })} /></Field>
      <Field group label="Accent"><Seg label="Accent" value={prefs.accent} options={[{ v: 'champagne', l: 'Champagne' }, { v: 'platinum', l: 'Platinum' }]} onChange={accent => setPrefs({ accent })} /></Field>
      <Field group label="Motion"><Seg label="Motion" value={prefs.motion} options={[{ v: 'system', l: 'System' }, { v: 'reduce', l: 'Reduced' }, { v: 'full', l: 'Full' }]} onChange={motion => setPrefs({ motion })} /></Field>

      <h3>Privacy</h3>
      <div className="list">
        <Row title="Hide balances" sub="Masks every figure until shown again." right={<Toggle on={prefs.hide} label="Hide balances" onChange={hide => setPrefs({ hide })} />} />
        <Row title="Privacy mode" sub="Masks identifiers and veils the app when it is in the background." right={<Toggle on={prefs.privacy} label="Privacy mode" onChange={privacy => setPrefs({ privacy })} />} />
        <Row title="Local app lock" sub={prefs.lock ? 'A passcode is required when the app opens or returns.' : 'Off'} right={prefs.lock ? <ConfirmBtn className="btn ghost small" label="Remove" confirm="Confirm" onConfirm={() => { clearPin(); toast('App lock removed'); }} /> : <button type="button" className="btn ghost small" onClick={() => openSheet({ t: 'pin' })}>Set passcode</button>} />
      </div>
      <p className="footnote">The app lock is local privacy protection for this device only. It is not banking-grade authentication and does not encrypt stored data.</p>

      <h3>Notifications</h3>
      <div className="list">
        <Row title="Payment settled" sub="In-app notice when a pending payment settles." right={<Toggle on={prefs.notifSettle} label="Payment settled notices" onChange={notifSettle => setPrefs({ notifSettle })} />} />
        <Row title="Card purchases" sub="In-app notice for each simulated purchase." right={<Toggle on={prefs.notifCard} label="Card purchase notices" onChange={notifCard => setPrefs({ notifCard })} />} />
        <Row title="System notifications" sub={canNotify ? 'Also show these as device notifications while the app is open.' : 'Not supported in this browser. On iPhone, install to the Home Screen first.'} right={<Toggle on={prefs.notifSystem && canNotify} disabled={!canNotify} label="System notifications" onChange={sysNotif} />} />
      </div>

      <h3>Banking</h3>
      <div className="list">
        <Row title="Recipients" sub={`${s.recipients.length} saved`} right={<ChevronRight {...IC} size={16} />} onClick={() => openSheet({ t: 'recipients' })} />
        <Row title="Currencies and illustrative rates" sub="Converter and editable rates" right={<ChevronRight {...IC} size={16} />} onClick={() => openSheet({ t: 'convert' })} />
      </div>

      <h3>Scenario</h3>
      <Field label="Opening amount (USD)" hint="Rebuilds every balance from the ledger. Refused if existing activity would overdraw an account."><input inputMode="decimal" value={opening} onChange={e => setOpening(e.target.value)} /></Field>
      <button type="button" className="btn ghost" onClick={applyOpening}>Apply and reconcile</button>

      <h3>Data</h3>
      <div className="stack row2"><button type="button" className="btn ghost" onClick={doExport}>Export backup</button><button type="button" className="btn ghost" onClick={() => imp.current?.click()}>Import backup</button></div>
      <input ref={imp} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; doImport(f); }} />
      <p className="footnote">Backups are JSON files that stay with you. Importing validates the file and replaces the current simulation. Nothing is ever sent to a server.</p>
      <dl className="kv"><div><dt>Ledger entries</dt><dd className="num">{s.txns.length}</dd></div><div><dt>Integrity check</dt><dd className={issues.length ? 'neg' : 'pos'}>{issues.length ? issues[0] : 'Balances reconcile'}</dd></div></dl>
      <Field label="Reset with opening amount (USD)"><input inputMode="decimal" value={resetAmt} onChange={e => setResetAmt(e.target.value)} /></Field>
      <ConfirmBtn label="Reset financial simulation" confirm="Tap again to erase all activity" onConfirm={doReset} />

      <h3>About</h3>
      <div className="about"><Emblem size={34} /><div><b className="serif">Aurelion Private</b><span className="muted">Version 1.0.0 · Financial simulation</span></div></div>
      <p className="footnote">Aurelion Private is a fictional institution created for personal entertainment. It is not a bank, holds no licence, and is not affiliated with any real financial institution. Every balance, account, card, rate, price and transaction is simulated and stored only on this device. The app cannot hold, move or verify real money, and nothing shown here is evidence of funds or of any payment.</p>
    </div>
  );
}

export function PinSheet() {
  const close = useClose();
  const [a, setA] = useState(''); const [b, setB] = useState(''); const [err, setErr] = useState('');
  const save = async () => {
    if (!/^\d{4,6}$/.test(a)) return setErr('Use 4 to 6 digits.');
    if (a !== b) return setErr('The passcodes do not match.');
    await setPin(a); toast('App lock enabled'); close();
  };
  return (
    <div className="form">
      <Field label="New passcode"><input type="password" inputMode="numeric" autoComplete="off" maxLength={6} autoFocus value={a} onChange={e => { setA(e.target.value.replace(/\D/g, '')); setErr(''); }} /></Field>
      <Field label="Confirm passcode" error={err}><input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={b} onChange={e => { setB(e.target.value.replace(/\D/g, '')); setErr(''); }} /></Field>
      <p className="footnote">If you forget the passcode, clearing this site’s data in your browser settings removes the lock along with the simulation. Export a backup first.</p>
      <button type="button" className="btn" onClick={save}>Enable app lock</button>
    </div>
  );
}

export function LockScreen() {
  const [pin, setPinV] = useState(''); const [bad, setBad] = useState(false);
  const press = async (d: string) => {
    if (pin.length >= 6) return;
    const next = pin + d; setPinV(next); setBad(false);
    if (next.length >= 4 && (await checkPin(next))) { setLocked(false); return; }
    if (next.length === 6) { setBad(true); setTimeout(() => setPinV(''), 350); }
  };
  return (
    <div className="lock" role="dialog" aria-modal="true" aria-label="App locked">
      <Emblem size={44} /><b className="brandline">AURELION <span>PRIVATE</span></b>
      <p className="muted">{bad ? 'Incorrect passcode' : 'Enter passcode'}</p>
      <div className={'pins' + (bad ? ' shake' : '')} aria-live="polite" aria-label={`${pin.length} digits entered`}>{Array.from({ length: 6 }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      <div className="pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => <button key={d} type="button" onClick={() => press(d)}>{d}</button>)}
        <span /><button type="button" onClick={() => press('0')}>0</button>
        <button type="button" aria-label="Delete digit" onClick={() => setPinV(pin.slice(0, -1))}><Delete {...IC} /></button>
      </div>
      <p className="footnote center">Local privacy lock · Financial simulation</p>
    </div>
  );
}
