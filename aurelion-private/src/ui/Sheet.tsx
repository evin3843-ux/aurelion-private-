import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { reducedMotion } from '../store/store';
import { IC, SheetCtx } from './bits';

/** Bottom sheet with drag-to-dismiss, Escape, focus return and a labelled dialog role. */
export function Sheet({ title, onClose, children, tall }: { title: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  const [out, setOut] = useState(false);
  const [dy, setDy] = useState(0);
  const start = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => { if (out) return; setOut(true); setTimeout(onClose, reducedMotion() ? 0 : 230); };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    const el = ref.current!;
    el.addEventListener('keydown', k);
    return () => { el.removeEventListener('keydown', k); prev?.focus?.(); };
  }, []);
  return (
    <div className={'sheet-wrap' + (out ? ' out' : '')}>
      <div className="backdrop" onClick={close} />
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={'sheet' + (tall ? ' tall' : '')}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-head"
          onPointerDown={e => { if ((e.target as HTMLElement).closest('button')) return; start.current = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
          onPointerMove={e => { if (start.current != null) setDy(Math.max(0, e.clientY - start.current)); }}
          onPointerUp={() => { if (start.current == null) return; start.current = null; if (dy > 110) close(); setDy(0); }}
          onPointerCancel={() => { start.current = null; setDy(0); }}>
          <span className="grab" aria-hidden="true" />
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}><X {...IC} /></button>
        </div>
        <div className="sheet-body"><SheetCtx.Provider value={close}>{children}</SheetCtx.Provider></div>
      </div>
    </div>
  );
}
