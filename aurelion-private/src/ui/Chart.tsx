import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fmt, fmtCompact, type Cur } from '../engine/money';
import type { Pt } from '../engine/ledger';
import { fmtDate, fmtShort, fmtTime } from './bits';
import { useApp } from '../store/store';

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(340);
  useEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el); setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Area chart over ledger-derived points with touch scrubbing. */
export function AreaChart({ pts, cur = 'USD', height = 190, animKey, label }: { pts: Pt[]; cur?: Cur; height?: number; animKey?: string; label: string }) {
  const [ref, W] = useWidth();
  const { prefs } = useApp();
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const padT = 18, padB = 24, padR = 54, H = height;
  const g = useMemo(() => {
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    let lo = Infinity, hi = -Infinity;
    for (const p of pts) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
    const pad = hi === lo ? Math.max(Math.abs(hi) * 0.002, 100) : (hi - lo) * 0.18;
    lo -= pad; hi += pad;
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * (W - padR);
    const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
    const area = `${line}L${x(t1).toFixed(1)} ${H - padB}L0 ${H - padB}Z`;
    const ticks = [0.12, 0.5, 0.88].map(k => { const v = Math.round(lo + (hi - lo) * k); return { v, y: y(v) }; });
    return { t0, t1, x, y, line, area, ticks };
  }, [pts, W, H]);
  const at = (clientX: number, el: Element) => {
    const r = el.getBoundingClientRect();
    const t = g.t0 + (Math.min(Math.max(0, clientX - r.left), W - padR) / (W - padR)) * (g.t1 - g.t0);
    let i = 0;
    for (let k = 0; k < pts.length; k++) if (pts[k].t <= t) i = k;
    setHover(i);
  };
  const hp = hover != null ? pts[Math.min(hover, pts.length - 1)] : null;
  const span = g.t1 - g.t0;
  const last = pts[pts.length - 1];
  const tipX = hp ? Math.min(Math.max(g.x(hp.t), 74), W - 74) : 0;
  return (
    <div ref={ref} className="chart" style={{ height: H }}>
      <svg width={W} height={H} role="img" aria-label={`${label}. Latest value ${prefs.hide ? 'hidden' : fmt(last.v, cur)}.`}
        onPointerDown={e => at(e.clientX, e.currentTarget)} onPointerMove={e => (e.pointerType === 'mouse' || e.buttons || e.pressure) && at(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)} onPointerUp={e => e.pointerType !== 'mouse' && setHover(null)} onPointerCancel={() => setHover(null)}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--gold)" stopOpacity=".26" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {g.ticks.map((t, i) => (
          <g key={i}>
            <line x1="0" x2={W - padR + 6} y1={t.y} y2={t.y} className="grid" />
            <text x={W} y={t.y + 3.5} textAnchor="end" className="axis">{prefs.hide ? '•••' : fmtCompact(t.v, cur)}</text>
          </g>
        ))}
        <g key={animKey} className="chart-anim">
          <path d={g.area} fill={`url(#${id})`} className="chart-area" />
          <path d={g.line} fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="chart-line" />
          {!hp && <circle cx={g.x(last.t)} cy={g.y(last.v)} r="3.2" fill="var(--gold-hi)" className="chart-dot" />}
        </g>
        {[0, 0.5, 1].map(k => (
          <text key={k} x={k * (W - padR)} y={H - 6} textAnchor={k === 0 ? 'start' : k === 1 ? 'end' : 'middle'} className="axis">{fmtShort(g.t0 + span * k, span)}</text>
        ))}
        {hp && (<g>
          <line x1={g.x(hp.t)} x2={g.x(hp.t)} y1={padT - 6} y2={H - padB} className="cursor" />
          <circle cx={g.x(hp.t)} cy={g.y(hp.v)} r="4.5" fill="var(--bg)" stroke="var(--gold-hi)" strokeWidth="1.6" />
        </g>)}
      </svg>
      {hp && (
        <div className="tip" style={{ left: tipX }} aria-hidden="true">
          <b className="num">{prefs.hide ? '••••••' : fmt(hp.v, cur)}</b>
          <span>{fmtDate(hp.t)} · {fmtTime(hp.t)}</span>
        </div>
      )}
    </div>
  );
}

export interface Slice { label: string; value: number; color: string }
export function Donut({ slices, size = 148, children }: { slices: Slice[]; size?: number; children?: React.ReactNode }) {
  const total = slices.reduce((n, s) => n + s.value, 0);
  const r = 44, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" role="img" aria-label={'Allocation: ' + slices.map(s => `${s.label} ${total ? Math.round((s.value / total) * 100) : 0}%`).join(', ')}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeWidth="5" />
        {total > 0 && slices.filter(s => s.value > 0).map(s => {
          const len = (s.value / total) * C, gap = slices.filter(x => x.value > 0).length > 1 ? 1.2 : 0;
          const el = <circle key={s.label} cx="50" cy="50" r={r} fill="none" stroke={s.color} strokeWidth="5" strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-off} transform="rotate(-90 50 50)" className="donut-arc" />;
          off += len;
          return el;
        })}
      </svg>
      <div className="donut-c">{children}</div>
    </div>
  );
}

/** Paired monthly bars (inflow above the axis, outflow below). */
export function FlowBars({ items, cur = 'USD' }: { items: { label: string; a: number; b: number }[]; cur?: Cur }) {
  const max = Math.max(1, ...items.map(i => Math.max(i.a, i.b)));
  const { prefs } = useApp();
  return (
    <div className="bars" role="img" aria-label={'Monthly movement: ' + items.map(i => `${i.label} in ${prefs.hide ? 'hidden' : fmt(i.a, cur)} out ${prefs.hide ? 'hidden' : fmt(i.b, cur)}`).join('; ')}>
      {items.map(i => (
        <div key={i.label} className="bar-col">
          <div className="bar-up"><span style={{ height: `${(i.a / max) * 100}%` }} /></div>
          <div className="bar-dn"><span style={{ height: `${(i.b / max) * 100}%` }} /></div>
          <small>{i.label}</small>
        </div>
      ))}
    </div>
  );
}
export const PALETTE = ['#c9b384', '#8c8f96', '#9a7b62', '#6f8088', '#b9b3a6', '#5c655f', '#7d6f8a'];
