import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshState,
  transition as tx,
  boosterQuote,
  boosterUses,
  activeBooster,
  balanceTable,
  parseState,
  BLOCK_ANIMATION_MS,
  SAFE_DURATION_MS,
  type State,
  type BoosterKind,
} from '../src/engine.ts';
import { tapsText, coinsText } from '../src/copy.ts';
const now = Date.parse('2026-09-05T12:00:00Z');
const start = (mode: 'paid' | 'free' = 'paid') =>
  tx(freshState(now), { type: 'start', mode }, 0.99, now, 'round');
const buy = (s: State, kind: BoosterKind, at = now) =>
  tx(
    s,
    {
      type: 'boost',
      kind,
      atStep: s.round!.step,
      price: boosterQuote(s.round!, kind).price,
    },
    0.99,
    at,
  );
const tap = (s: State, at = now, random = 0) =>
  tx(s, { type: 'tap' }, random, at);

test('both modes buy boosters from balance once, without moving the step or payout', () => {
  for (const mode of ['free', 'paid'] as const)
    for (const kind of ['shield', 'safe'] as const) {
      const s = start(mode),
        quote = boosterQuote(s.round!, kind),
        bought = buy(s, kind);
      assert.equal(bought.balance, s.balance - quote.price);
      assert.equal(bought.round!.spent, s.round!.spent + quote.price);
      assert.equal(bought.round!.step, 0);
      assert.equal(bought.round!.payout, 0);
      assert.equal(boosterUses(bought.round!, kind), 1);
      assert.equal(buy(bought, kind), bought);
    }
});
test('shield remains after many safe presses and blocks exactly the next theft', () => {
  let s = buy(start(), 'shield');
  for (let i = 0; i < 15; i++) s = tap(s, now + i * 100, 0.99);
  assert.equal(activeBooster(s.round!, now + 100_000)?.kind, 'shield');
  s = tap(s, now + 100_000);
  assert.equal(s.round!.step, 16);
  assert.equal(s.round!.payout, balanceTable[15].paid);
  assert.equal(s.round!.activeBooster, null);
  s = tap(s, now + 100_000 + BLOCK_ANIMATION_MS);
  assert.equal(s.round!.status, 'caught');
});
test('30-second zone blocks every theft until the exact expiry boundary', () => {
  let s = buy(start(), 'safe');
  for (const seconds of [0, 3, 6, 9, 12, 15, 18, 21, 24, 27])
    s = tap(s, now + seconds * 1000);
  assert.equal(s.round!.step, 10);
  assert.equal(s.round!.blockedSteals, 10);
  assert.equal(s.round!.activeBooster!.expiresAt, now + SAFE_DURATION_MS);
  assert.equal(activeBooster(s.round!, now + 29999)?.kind, 'safe');
  assert.equal(activeBooster(s.round!, now + 30000), null);
  s = tap(s, now + 30000);
  assert.equal(s.round!.status, 'caught');
});
test('expiry is real time and does not extend after reload or background time', () => {
  const bought = buy(start(), 'safe');
  const reloaded = parseState(JSON.stringify(bought), now + 12_000);
  assert.equal(reloaded.round!.activeBooster!.expiresAt, now + 30_000);
  const expired = parseState(JSON.stringify(reloaded), now + 31_000);
  assert.equal(expired.round!.activeBooster, null);
  assert.equal(boosterUses(expired.round!, 'safe'), 1);
  assert.equal(tap(expired, now + 31_000).round!.status, 'caught');
});
test('each booster can be bought three times per round and never a fourth', () => {
  for (const kind of ['shield', 'safe'] as const) {
    let s = { ...start(), balance: 100_000 };
    let at = now;
    for (let i = 0; i < 3; i++) {
      s = buy(s, kind, at);
      assert.equal(boosterUses(s.round!, kind), i + 1);
      if (kind === 'shield') {
        s = tap(s, at);
        at += BLOCK_ANIMATION_MS;
      } else at += SAFE_DURATION_MS;
    }
    assert.equal(buy(s, kind, at), s);
    const other = kind === 'shield' ? 'safe' : 'shield';
    assert.equal(activeBooster(buy(s, other, at).round!, at)?.kind, other);
  }
});
test('new round restores all three purchases, not just closing the page', () => {
  let s = buy(start(), 'shield');
  s = tap(s, now, 0.99);
  s = tx(s, { type: 'cashout' }, 0.99, now);
  s = tx(s, { type: 'start', mode: 'paid' }, 0.99, now + 1, 'next');
  assert.equal(boosterUses(s.round!, 'shield'), 0);
  assert.equal(boosterUses(s.round!, 'safe'), 0);
});
test('block animation locks queued taps and purchases, survives reload, then unlocks', () => {
  let s = tap(buy(start(), 'shield'), now);
  assert.equal(s.round!.lastBlockedAt, now);
  for (let i = 0; i < 10; i++) assert.equal(tap(s, now + i), s);
  assert.equal(buy(s, 'safe', now + 100), s);
  s = parseState(JSON.stringify(s), now + 1000);
  assert.equal(tap(s, now + 1000), s);
  assert.equal(tap(s, now + BLOCK_ANIMATION_MS, 0.99).round!.step, 2);
});
test('cannot stack protection and an expired timer permits a new purchase', () => {
  let s = buy(start(), 'safe');
  assert.equal(buy(s, 'shield'), s);
  const after = buy(s, 'shield', now + 30_000);
  assert.equal(activeBooster(after.round!, now + 30_000)?.kind, 'shield');
});
test('stale price, stale step, wrong round, low balance and finished rounds never debit', () => {
  const s = start(),
    quote = boosterQuote(s.round!, 'safe');
  const action = {
    type: 'boost' as const,
    kind: 'safe' as const,
    atStep: 0,
    price: quote.price,
  };
  assert.equal(tx(s, { ...action, price: quote.price + 5 }, 0.99, now), s);
  assert.equal(tx(s, { ...action, roundId: 'other' }, 0.99, now), s);
  const advanced = tap(s, now, 0.99);
  assert.equal(tx(advanced, action, 0.99, now), advanced);
  const poor = { ...s, balance: 0 };
  assert.equal(buy(poor, 'safe'), poor);
  const caught = tap(s);
  assert.equal(buy(caught, 'shield'), caught);
  const won = tx(advanced, { type: 'cashout' }, 0.99, now);
  assert.equal(buy(won, 'safe'), won);
});
test('legacy shield is preserved and legacy zone finishes its purchased three charges', () => {
  const legacy = start();
  legacy.round!.activeBooster = { kind: 'shield', tapsLeft: 4 };
  delete legacy.round!.boosterPurchases;
  legacy.round!.usedBoosters = ['shield'];
  let s = parseState(JSON.stringify(legacy), now);
  assert.equal(boosterUses(s.round!, 'shield'), 1);
  assert.equal(s.round!.activeBooster!.tapsLeft, undefined);
  legacy.round!.activeBooster = { kind: 'safe', tapsLeft: 2 };
  legacy.round!.usedBoosters = ['safe'];
  s = parseState(JSON.stringify(legacy), now);
  s = tap(s, now);
  s = tap(s, now + BLOCK_ANIMATION_MS);
  assert.equal(s.round!.step, 2);
  assert.equal(s.round!.activeBooster, null);
  s = buy(s, 'safe', now + BLOCK_ANIMATION_MS * 2);
  assert.equal(
    s.round!.activeBooster!.expiresAt,
    now + BLOCK_ANIMATION_MS * 2 + 30_000,
  );
  assert.equal(boosterUses(s.round!, 'safe'), 2);
});
test('old saves without booster fields preserve balance and accept new protection', () => {
  const legacy = start();
  delete legacy.round!.boosterPurchases;
  delete legacy.round!.activeBooster;
  delete legacy.round!.usedBoosters;
  const restored = parseState(JSON.stringify(legacy), now);
  assert.equal(restored.balance, legacy.balance);
  assert.equal(buy(restored, 'shield').round!.activeBooster!.kind, 'shield');
});
test('protected final press credits the source maximum exactly once', () => {
  for (const mode of ['free', 'paid'] as const) {
    let s = { ...start(mode), balance: 100_000 };
    for (let i = 0; i < 119; i++) s = tap(s, now, 0.99);
    s = buy(s, 'safe');
    const balance = s.balance;
    s = tap(s);
    assert.equal(s.round!.status, 'won');
    assert.equal(s.balance, balance + balanceTable[119][mode]);
    assert.equal(tap(s, now + 5000), s);
    assert.equal(tx(s, { type: 'cashout' }, 0.99, now + 5000), s);
  }
});
test('prices reflect first-theft expected payout and repeat purchase count', () => {
  const s = start();
  let probability = 1,
    value = 0;
  for (const row of balanceTable) {
    value += probability * row.risk * row.paid;
    probability *= 1 - row.risk;
  }
  const expected = Math.ceil(Math.max(35, 15 + value * 0.22) / 5) * 5;
  assert.equal(boosterQuote(s.round!, 'shield').price, expected);
  const used = { ...s.round!, boosterPurchases: { shield: 2 } };
  assert.ok(boosterQuote(used, 'shield').price > expected);
});
test('Russian plurals retain correct forms', () => {
  assert.equal(tapsText(1), '1 нажатие');
  assert.equal(tapsText(4), '4 нажатия');
  assert.equal(tapsText(11), '11 нажатий');
  assert.equal(coinsText(132), '132 монеты');
  assert.equal(coinsText(1, true), '1 монету');
});
