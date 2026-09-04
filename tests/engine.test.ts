import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshState,
  transition as tx,
  balanceTable,
  dayKey,
  parseState,
  type State,
} from '../src/engine.ts';
import { GameStorage } from '../src/persistence.ts';
const now = Date.parse('2026-09-04T12:00:00Z');
const start = (mode: 'free' | 'paid' = 'paid') =>
  tx(freshState(now), { type: 'start', mode }, 0.5, now, 'round');
const tap = (s: State, random = 0.99) => tx(s, { type: 'tap' }, random, now);
test('paid entry debits exactly once; a live round cannot be replaced', () => {
  const s = start();
  assert.equal(s.balance, 900);
  assert.equal(s.games, 1);
  assert.equal(tx(s, { type: 'start', mode: 'paid' }), s);
});
test('daily free attempt resets at midnight Moscow, not after reload', () => {
  assert.equal(dayKey(Date.parse('2026-09-04T20:59:59Z')), '2026-09-04');
  assert.equal(dayKey(Date.parse('2026-09-04T21:00:00Z')), '2026-09-05');
  let s = start('free');
  assert.equal(s.balance, 1000);
  s = tx(s, { type: 'forfeit' });
  assert.equal(tx(s, { type: 'start', mode: 'free' }, 0.5, now), s);
  assert.equal(
    tx(s, { type: 'start', mode: 'free' }, 0.5, now + 86400000).games,
    2,
  );
});
test('payout is cumulative table value; cashout settles only once', () => {
  let s = tap(tap(start()));
  assert.equal(s.round?.payout, balanceTable[1].paid);
  const won = tx(s, { type: 'cashout' });
  assert.equal(won.balance, 900 + balanceTable[1].paid);
  assert.equal(tx(won, { type: 'cashout' }), won);
  assert.equal(tap(won), won);
});
test('failure locks cashout; repel costs 100 and repeats the same step', () => {
  let s = tap(tap(start()), 0);
  assert.equal(s.round?.status, 'caught');
  assert.equal(s.round?.step, 1);
  assert.equal(tx(s, { type: 'cashout' }), s);
  s = tx(s, { type: 'repel' });
  assert.equal(s.balance, 800);
  assert.equal(s.round?.step, 1);
  assert.equal(s.round?.payout, balanceTable[0].paid);
  assert.equal(tx(s, { type: 'repel' }), s);
  s = tap(s);
  assert.equal(s.round?.payout, balanceTable[1].paid);
  const lost = tap(s, 0);
  assert.equal(lost.round?.status, 'lost');
  assert.equal(lost.balance, 800);
  assert.equal(lost.round?.lostAmount, balanceTable[1].paid);
  assert.equal(tx(lost, { type: 'repel' }), lost);
});
test('insufficient coins cannot buy entry or repel; balances never go negative', () => {
  const s = { ...freshState(now), balance: 99 };
  assert.equal(tx(s, { type: 'start', mode: 'paid' }), s);
  const caught = tap(tx(s, { type: 'start', mode: 'free' }, 0.5, now), 0);
  assert.equal(tx(caught, { type: 'repel' }), caught);
  assert.equal(caught.balance, 99);
});
test('tap 120 automatically settles the exact maximum in each mode', () => {
  for (const mode of ['free', 'paid'] as const) {
    let s = start(mode);
    for (let i = 0; i < 120; i++) s = tap(s);
    assert.equal(s.round?.status, 'won');
    assert.equal(s.round?.step, 120);
    assert.equal(
      s.balance,
      (mode === 'free' ? 1000 : 900) + balanceTable[119][mode],
    );
    assert.equal(tap(s), s);
  }
});
test('forfeit loses unclaimed payout only; dismiss cannot erase a live round', () => {
  const s = tap(start());
  assert.equal(tx(s, { type: 'dismiss' }), s);
  const lost = tx(s, { type: 'forfeit' });
  assert.equal(lost.balance, 900);
  assert.equal(lost.round?.payout, 0);
  assert.equal(tx(lost, { type: 'dismiss' }).round, null);
});
test('save restores a caught event and cannot reroll on reload', () => {
  const s = tap(start(), 0);
  const restored = parseState(JSON.stringify(s));
  assert.deepEqual(restored, s);
  assert.equal(tap(restored), restored);
  assert.equal(parseState('{broken', now).balance, 1000);
});
test('all 120 spreadsheet rows have valid probabilities and increasing cumulative prizes', () => {
  assert.equal(balanceTable.length, 120);
  balanceTable.forEach((r, i) => {
    assert.equal(r.tap, i + 1);
    assert.ok(r.risk > 0 && r.risk < 1);
    assert.ok(r.free > 0 && r.paid > 0);
    if (i) {
      assert.ok(r.free >= balanceTable[i - 1].free);
      assert.ok(r.paid >= balanceTable[i - 1].paid);
    }
  });
  assert.equal(balanceTable[119].paid, 5000);
  assert.equal(balanceTable[119].free, 2350);
});
test('quota denied writes retain every transaction for the session', () => {
  const storage = new GameStorage('test', () => ({
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  }));
  const s = start();
  storage.write(s);
  assert.equal(storage.failed, true);
  assert.deepEqual(storage.read(), s);
  const won = tx(tap(storage.read()), { type: 'cashout' });
  storage.write(won);
  assert.deepEqual(storage.read(), won);
});
test('normal storage restores transactions through a second instance', () => {
  let raw: string | null = null;
  const backend = () => ({
    getItem: () => raw,
    setItem: (_key: string, value: string) => {
      raw = value;
    },
  });
  const first = new GameStorage('test', backend);
  first.write(start());
  assert.deepEqual(new GameStorage('test', backend).read(), start());
});

test('stale actions cannot alter a different round', () => {
  const first = start();
  const ended = tx(first, { type: 'forfeit' });
  const next = tx(ended, { type: 'start', mode: 'paid' }, 0.5, now, 'round-2');
  assert.equal(tx(next, { type: 'forfeit', roundId: 'round' }), next);
  assert.equal(tx(next, { type: 'dismiss', roundId: 'round' }), next);
});
