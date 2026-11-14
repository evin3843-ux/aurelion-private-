import type { Cur, Rates } from './money';

export type AccountKind = 'current' | 'reserve' | 'investment' | 'multi' | 'portfolio' | 'custom';
export interface Account {
  id: string; name: string; kind: AccountKind; currency: Cur; ident: string;
  archived: boolean; createdAt: number; primary?: boolean;
}
export type TxnType =
  | 'opening' | 'deposit' | 'withdrawal' | 'transfer' | 'payment'
  | 'card' | 'refund' | 'buy' | 'sell';
export interface Posting { accountId: string; amount: number }
export interface Txn {
  id: string; key: string; ts: number; type: TxnType;
  description: string; category: string; note?: string;
  postings: Posting[];
  settleAt?: number; cancelledAt?: number;
  cardId?: string; recipientId?: string; refundOf?: string;
  holding?: { id: string; qty: number; price: number };
  fx?: { from: Cur; to: Cur; rate: number };
  sent?: { cur: Cur; amount: number };
}
export type TxnStatus = 'completed' | 'pending' | 'cancelled';
export interface Card {
  id: string; product: string; nickname: string; ident: string;
  accountId: string; frozen: boolean; limit: number; // monthly limit, USD cents
}
export interface Recipient { id: string; name: string; institution: string; ident: string; currency: Cur }
export const ASSET_CLASSES = ['Equities', 'Fixed Income', 'Real Assets', 'Alternatives', 'Cash Equivalents'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];
export interface Holding {
  id: string; name: string; symbol: string; cls: AssetClass;
  prices: { ts: number; price: number }[]; // user-entered illustrative prices, USD cents
  assumptionBps: number; // assumed annual return, basis points
}
export interface State {
  schema: 1; seq: number; inception: number;
  profile: { name: string; photo?: string; tier: string };
  accounts: Account[]; txns: Txn[]; cards: Card[]; recipients: Recipient[]; holdings: Holding[];
  rates: Rates;
}
export const CATEGORIES = [
  'Transfer', 'Income', 'Dining', 'Travel', 'Aviation', 'Shopping', 'Residences',
  'Art & Collectibles', 'Wellness', 'Philanthropy', 'Services', 'Investment', 'Other',
] as const;
export const SPEND_CATEGORIES = CATEGORIES.filter(c => !['Transfer', 'Income', 'Investment'].includes(c));
