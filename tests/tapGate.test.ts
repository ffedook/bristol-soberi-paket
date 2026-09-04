import test from 'node:test';
import assert from 'node:assert/strict';
import { TapGate } from '../src/tapGate.ts';
import { tapHaptic } from '../src/haptics.ts';
const touch = (id: number, primary = true) => ({
  pointerId: id,
  isPrimary: primary,
  button: 0,
});

test('three simultaneous fingers all count once, including nonprimary contacts', () => {
  const gate = new TapGate();
  let count = 0;
  for (const id of [1, 2, 3]) {
    gate.down(touch(id, id === 1));
    if (gate.claim(id)) count++;
    assert.equal(gate.claim(id), false);
  }
  assert.equal(count, 3);
  for (const id of [1, 2, 3]) assert.equal(gate.up(id), false);
});

test('one finger stays held while other fingers repeatedly tap', () => {
  const gate = new TapGate();
  gate.down(touch(1));
  assert.equal(gate.claim(1), true);
  for (let i = 0; i < 20; i++) {
    gate.down(touch(2, false));
    assert.equal(gate.claim(2), true);
    gate.up(2);
  }
  assert.equal(gate.claim(1), false);
});

test('native three-finger contact produces three release activations, no click dependency', () => {
  const gate = new TapGate();
  [1, 2, 3].forEach((id) => {
    gate.down(touch(id, id === 1));
    assert.equal(gate.claim(id, true), true);
  });
  assert.equal(gate.up(2), true);
  gate.lostCapture(2);
  assert.equal(gate.up(2), false);
  assert.equal(gate.up(1), true);
  assert.equal(gate.up(3), true);
});

test('native pointer IDs can be reused immediately without dropping or duplicating taps', () => {
  const gate = new TapGate();
  let queued = 0;
  for (let i = 0; i < 50; i++) {
    gate.down(touch(7));
    gate.claim(7, true);
    if (gate.up(7)) queued++;
    assert.equal(gate.up(7), false);
    gate.lostCapture(7);
  }
  assert.equal(queued, 50);
});

test('cancel one native finger only, other fingers remain active', () => {
  const gate = new TapGate();
  [1, 2, 3].forEach((id) => {
    gate.down(touch(id));
    gate.claim(id, true);
  });
  gate.cancel(2);
  assert.equal(gate.up(2), false);
  assert.equal(gate.up(1), true);
  assert.equal(gate.up(3), true);
});

test('premature lostcapture cancels one native finger; normal post-up loss does not duplicate', () => {
  const gate = new TapGate();
  gate.down(touch(1));
  gate.claim(1, true);
  gate.lostCapture(1);
  assert.equal(gate.up(1), false);
  gate.down(touch(1));
  gate.claim(1, true);
  assert.equal(gate.up(1), true);
  gate.lostCapture(1);
  assert.equal(gate.up(1), false);
});

test('contact starting outside target is never claimed or counted just because it ends there', () => {
  const gate = new TapGate();
  gate.down(touch(1));
  assert.equal(gate.up(1), false);
});

test('right mouse button never triggers play', () => {
  const gate = new TapGate();
  gate.down({ ...touch(1), button: 2 });
  assert.equal(gate.claim(1), false);
  assert.equal(gate.up(1), false);
});

test('duplicate down for held pointer is not a new contact', () => {
  const gate = new TapGate();
  gate.down(touch(1));
  gate.claim(1, true);
  gate.down(touch(1));
  assert.equal(gate.claim(1, true), false);
  assert.equal(gate.up(1), true);
});

test('reset forgets interrupted contacts, without disabling future secondary fingers', () => {
  const gate = new TapGate();
  gate.down(touch(1));
  gate.claim(1, true);
  gate.reset();
  assert.equal(gate.up(1), false);
  gate.down(touch(2, false));
  assert.equal(gate.claim(2, true), true);
  assert.equal(gate.up(2), true);
});

test('keyboard is independent from held pointers', () => {
  const gate = new TapGate();
  gate.down(touch(1));
  assert.equal(gate.canKeyboardActivate(), true);
});

test('haptic requests a 24ms pulse synchronously and respects preference', () => {
  const pulses: (number | number[])[] = [];
  const nav = {
    vibrate: (pattern: number | number[]) => {
      pulses.push(pattern);
      return true;
    },
  };
  assert.equal(tapHaptic(false, nav), false);
  assert.deepEqual(pulses, []);
  assert.equal(tapHaptic(true, nav), true);
  assert.deepEqual(pulses, [24]);
  assert.equal(
    tapHaptic(true, {
      vibrate: () => {
        throw Error('Unavailable');
      },
    }),
    false,
  );
});
