import { useRef } from 'react';
import type { Card } from '../engine/types';
import { reducedMotion } from '../store/store';
import { Emblem } from './bits';

const VARIANT: Record<string, string> = { 'Aurelion Obsidian': 'obsidian', 'Aurelion Reserve': 'reserve', 'Aurelion Private': 'private' };

/** Original fictional card artwork with pointer-driven tilt and sheen. */
export function CardArt({ card, holder, active }: { card: Card; holder: string; active?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (reducedMotion() || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    ref.current.style.setProperty('--rx', `${(0.5 - py) * 10}deg`);
    ref.current.style.setProperty('--ry', `${(px - 0.5) * 14}deg`);
    ref.current.style.setProperty('--sx', `${px * 100}%`);
  };
  const rest = () => { const el = ref.current; if (!el) return; el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); el.style.setProperty('--sx', '30%'); };
  return (
    <div className="card-stage">
      <div ref={ref} className={`pcard ${VARIANT[card.product] ?? 'obsidian'}${card.frozen ? ' frozen' : ''}${active ? ' active' : ''}`}
        onPointerMove={move} onPointerLeave={rest} onPointerUp={rest} onPointerCancel={rest}
        role="img" aria-label={`${card.product}, ${card.frozen ? 'frozen' : 'active'}. Fictional card, not a payment instrument.`}>
        <div className="pcard-sheen" />
        <div className="pcard-top"><span className="pcard-brand"><Emblem size={26} /><span>AURELION<i>PRIVATE</i></span></span><span className="pcard-prod">{card.product.replace('Aurelion ', '')}</span></div>
        <svg className="pcard-chip" viewBox="0 0 40 30" aria-hidden="true"><rect x=".5" y=".5" width="39" height="29" rx="5" /><path d="M0 10h13M0 20h13M27 10h13M27 20h13M13 0v30M27 0v30" /></svg>
        <div className="pcard-id">{card.ident}</div>
        <div className="pcard-bot"><span>{holder}</span><span className="pcard-sim">Financial simulation · Not a payment card</span></div>
        {card.frozen && <div className="pcard-frost"><span>Frozen</span></div>}
      </div>
    </div>
  );
}
