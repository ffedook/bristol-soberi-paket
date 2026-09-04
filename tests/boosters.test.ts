import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshState,
  transition as tx,
  boosterQuote,
  balanceTable,
  parseState,
  type State,
  type BoosterKind,
} from '../src/engine.ts';
import { tapsText, coinsText } from '../src/copy.ts';
const now = Date.parse('2026-09-04T12:00:00Z');
const start = (mode: 'paid' | 'free' = 'paid') =>
  tx(freshState(now), { type: 'start', mode }, 0.99, now, 'boost-round');
const buy = (s: State, kind: BoosterKind) =>
  tx(s, {
    type: 'boost',
    kind,
    atStep: s.round!.step,
    price: boosterQuote(s.round!, kind).price,
  });
const tap = (s: State, random = 0) => tx(s, { type: 'tap' }, random);

test('both modes buy protection from balance, without moving the step or adding payout', () => {
  for (const mode of ['free', 'paid'] as const)
    for (const kind of ['safe', 'shield'] as const) {
      const s = start(mode),
        quote = boosterQuote(s.round!, kind),
        bought = buy(s, kind);
      assert.equal(bought.balance, s.balance - quote.price);
      assert.equal(bought.round!.spent, s.round!.spent + quote.price);
      assert.equal(bought.round!.step, 0);
      assert.equal(bought.round!.payout, 0);
      assert.equal(bought.round!.activeBooster!.tapsLeft, quote.taps);
      assert.equal(bought.history[0].amount, -quote.price);
    }
});
test('safe zone protects three theft outcomes; fourth uses the original catch and repel rules', () => {
  let s = buy(start(), 'safe');
  for (let i = 0; i < 3; i++) s = tap(s);
  assert.equal(s.round!.step, 3);
  assert.equal(s.round!.blockedSteals, 3);
  assert.equal(s.round!.activeBooster, null);
  assert.equal(s.round!.status, 'playing');
  s = tap(s);
  assert.equal(s.round!.step, 3);
  assert.equal(s.round!.status, 'caught');
  const balance = s.balance;
  s = tx(s, { type: 'repel' });
  assert.equal(s.balance, balance - 100);
  assert.equal(s.round!.status, 'playing');
});
test('shield blocks only one theft and the blocked press advances exactly one table row', () => {
  let s = buy(start(), 'shield');
  s = tap(s, 0.99);
  s = tap(s);
  assert.equal(s.round!.step, 2);
  assert.equal(s.round!.payout, balanceTable[1].paid);
  assert.equal(s.round!.blockedSteals, 1);
  assert.equal(s.round!.activeBooster, null);
  s = tap(s);
  assert.equal(s.round!.status, 'caught');
  assert.equal(s.round!.step, 2);
});
test('unused shield expires after five presses and cannot be purchased twice; other booster remains available', () => {
  let s = buy(start(), 'shield');
  for (let i = 0; i < 5; i++) s = tap(s, 0.99);
  assert.equal(s.round!.activeBooster, null);
  assert.equal(buy(s, 'shield'), s);
  const next = buy(s, 'safe');
  assert.equal(next.round!.activeBooster!.kind, 'safe');
  assert.equal(buy(next, 'shield'), next);
  assert.equal(buy(next, 'safe'), next);
});
test('stale price, stale step, other round, insufficient balance and finished round never debit', () => {
  const s = start(),
    quote = boosterQuote(s.round!, 'safe');
  const action = {
    type: 'boost' as const,
    kind: 'safe' as const,
    atStep: 0,
    price: quote.price,
  };
  assert.equal(tx(s, { ...action, price: quote.price + 5 }), s);
  assert.equal(tx(s, { ...action, roundId: 'other' }), s);
  const advanced = tap(s, 0.99);
  assert.equal(tx(advanced, action), advanced);
  const poor = { ...s, balance: 0 };
  assert.equal(tx(poor, action), poor);
  const caught = tap(s);
  assert.equal(buy(caught, 'safe'), caught);
  const won = tx(advanced, { type: 'cashout' });
  assert.equal(buy(won, 'safe'), won);
});
test('reload preserves consumed charges and legacy rounds migrate without losing balance', () => {
  let s = tap(buy(start(), 'safe'));
  s = parseState(JSON.stringify(s));
  assert.equal(s.round!.activeBooster!.tapsLeft, 2);
  s = tap(tap(s));
  assert.equal(s.round!.activeBooster, null);
  assert.equal(s.round!.step, 3);
  const legacy = JSON.parse(JSON.stringify(start()));
  delete legacy.round.activeBooster;
  delete legacy.round.usedBoosters;
  delete legacy.round.blockedSteals;
  const restored = parseState(JSON.stringify(legacy));
  assert.equal(restored.balance, legacy.balance);
  assert.equal(restored.round!.id, legacy.round.id);
  assert.equal(buy(restored, 'shield').round!.activeBooster!.kind, 'shield');
});
test('rapid serialized contacts consume exact charges and cannot reroll a catch', () => {
  let s = buy(start(), 'safe');
  for (let i = 0; i < 10; i++) s = tap(s);
  assert.equal(s.round!.step, 3);
  assert.equal(s.round!.blockedSteals, 3);
  assert.equal(s.round!.status, 'caught');
});
test('near the finish duration shrinks and a protected last press credits maximum once', () => {
  let s = { ...start(), balance: 100000 };
  for (let i = 0; i < 119; i++) s = tap(s, 0.99);
  assert.equal(boosterQuote(s.round!, 'safe').taps, 1);
  s = buy(s, 'safe');
  const before = s.balance;
  s = tap(s);
  assert.equal(s.round!.status, 'won');
  assert.equal(s.balance, before + 5000);
  assert.equal(tap(s), s);
  assert.equal(tx(s, { type: 'cashout' }), s);
});
test('shield pricing uses exactly-one-theft probability, validated by enumerating outcome paths', () => {
  let s = { ...start(), balance: 100000 };
  for (let i = 0; i < 60; i++) s = tap(s, 0.99);
  const risks = balanceTable.slice(60, 65).map((r) => r.risk);
  let one = 0;
  for (let mask = 0; mask < 32; mask++) {
    let probability = 1,
      failures = 0;
    risks.forEach((risk, i) => {
      const fail = !!(mask & (1 << i));
      probability *= fail ? risk : 1 - risk;
      failures += Number(fail);
    });
    if (failures === 1) one += probability;
  }
  const expected =
    Math.ceil(Math.max(25, 10 + one * balanceTable[64].paid * 1.1) / 5) * 5;
  assert.equal(boosterQuote(s.round!, 'shield').price, expected);
  assert.ok(
    boosterQuote(s.round!, 'shield').price >
      boosterQuote(start().round!, 'shield').price,
  );
});
test('Russian plurals cover teens, last digits and formatted coin values', () => {
  assert.equal(tapsText(1), '1 нажатие');
  assert.equal(tapsText(4), '4 нажатия');
  assert.equal(tapsText(11), '11 нажатий');
  assert.equal(tapsText(21), '21 нажатие');
  assert.equal(tapsText(114), '114 нажатий');
  assert.equal(coinsText(132), '132 монеты');
  assert.equal(coinsText(121), '121 монета');
  assert.equal(coinsText(125), '125 монет');
  assert.equal(coinsText(1, true), '1 монету');
});
