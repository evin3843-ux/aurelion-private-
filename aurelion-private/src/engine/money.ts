// Monetary primitives. All amounts are integers in minor units (cents).
// No floating-point arithmetic is used for ledger values.
export const CURS = ['USD', 'AED', 'EUR', 'GBP', 'CHF'] as const;
export type Cur = (typeof CURS)[number];

const SYM: Record<Cur, string> = { USD: '$', EUR: '€', GBP: '£', CHF: 'CHF ', AED: 'AED ' };
const group = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export function fmt(c: number, cur: Cur = 'USD', o: { sign?: boolean; cents?: boolean } = {}): string {
  const a = Math.abs(c);
  const s = c < 0 ? '−' : o.sign && c > 0 ? '+' : '';
  return s + SYM[cur] + group(Math.floor(a / 100)) + (o.cents === false ? '' : '.' + String(a % 100).padStart(2, '0'));
}

/** Compact axis label, e.g. $20.00M. Display only. */
export function fmtCompact(c: number, cur: Cur = 'USD'): string {
  const a = Math.abs(c);
  const units: [number, string][] = [[1e11, 'B'], [1e8, 'M'], [1e5, 'K']];
  for (const [d, u] of units) {
    if (a >= d) {
      const hundredths = mulDiv(a, 100, d);
      return (c < 0 ? '−' : '') + SYM[cur] + Math.floor(hundredths / 100) + '.' + String(hundredths % 100).padStart(2, '0') + u;
    }
  }
  return fmt(c, cur, { cents: false });
}

/** Parse a decimal string into an integer with the given number of decimals. */
export function parseDec(str: string, decimals: number): number | null {
  const t = str.replace(/[,\s]/g, '');
  if (t === '' || t === '.' || !/^\d*(\.\d*)?$/.test(t)) return null;
  const [i, f = ''] = t.split('.');
  if (f.length > decimals) return null;
  const n = Number((i || '0') + f.padEnd(decimals, '0'));
  return Number.isSafeInteger(n) ? n : null;
}
export const parseCents = (s: string) => parseDec(s, 2);

/** Integer a*b/d, rounded half away from zero, computed with BigInt. */
export function mulDiv(a: number, b: number, d: number): number {
  const n = BigInt(a) * BigInt(b);
  const D = BigInt(d);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const q = (abs * 2n + D) / (2n * D);
  return Number(neg ? -q : q);
}

export const RATE_SCALE = 1_000_000; // rates are units of currency per 1 USD, ×1e6
export const QTY_SCALE = 10_000; // holding quantities carry 4 decimals

export type Rates = Record<Cur, number>;
export function convert(amount: number, from: Cur, to: Cur, rates: Rates): number {
  return from === to ? amount : mulDiv(amount, rates[to], rates[from]);
}
export const fmtRate = (r: number) => (r / RATE_SCALE).toFixed(4);
export const fmtQty = (q: number) => {
  const s = (q / QTY_SCALE).toFixed(4).replace(/\.?0+$/, '');
  const [i, f] = s.split('.');
  return group(Number(i)) + (f ? '.' + f : '');
};
/** Basis points → "1.25%" */
export const fmtBps = (b: number, sign = false) =>
  (b < 0 ? '−' : sign && b > 0 ? '+' : '') + Math.floor(Math.abs(b) / 100) + '.' + String(Math.abs(b) % 100).padStart(2, '0') + '%';
