import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import * as L from '../engine/ledger';
import { clearAll, loadState, saveState } from './db';

const T0 = Date.UTC(2026, 0, 1);
describe('persistence', () => {
  it('survives a reload with identical balances', async () => {
    await clearAll();
    let s = L.createInitial(T0);
    await saveState(s);
    const next = L.transfer(s, { key: 'k', from: 'A1', to: 'A2', amount: 12345 }, T0 + 1);
    await saveState(next, s);
    const { state, recovered } = await loadState(T0 + 2);
    expect(recovered).toBe(false);
    expect(L.balances(state!, T0 + 2)).toEqual(L.balances(next, T0 + 2));
  });
  it('recovers from the backup when the main record is corrupted', async () => {
    await clearAll();
    const s = L.createInitial(T0);
    const bad: any = JSON.parse(JSON.stringify(s));
    bad.txns[0].postings[0].amount = 'x';
    await saveState(bad, s);
    const { state, recovered } = await loadState(T0 + 1);
    expect(recovered).toBe(true);
    expect(L.wealthAt(state!, T0 + 1)).toBe(2_000_000_000);
  });
  it('starts clean when nothing is stored', async () => {
    await clearAll();
    expect(await loadState(T0)).toEqual({ state: null, recovered: false });
  });
});
