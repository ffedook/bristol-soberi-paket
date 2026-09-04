import { test } from 'node:test';
import assert from 'node:assert/strict';
import { theftPose, THEFT_DURATION } from '../src/motion.ts';
test('squirrel visibly approaches before the bag is touched', () => {
  const pose = theftPose(0.55);
  assert.ok(pose.peek > 0.9);
  assert.equal(pose.grab, 0);
  assert.equal(pose.bagX, 0);
  assert.equal(pose.bagY, 0);
});
test('bag is lifted only after reach, and travels with the thief', () => {
  const held = theftPose(1.8);
  assert.equal(held.grab, 1);
  assert.ok(held.bagY > 0);
  assert.equal(held.run, 0);
  const running = theftPose(2.3);
  assert.ok(running.run > 0);
  assert.equal(running.bagX, held.bagX);
  assert.equal(running.bagY, held.bagY);
  assert.equal(running.bagZ, held.bagZ);
  assert.ok(running.carryX < held.carryX);
  assert.equal(theftPose(THEFT_DURATION / 1000).visible, false);
});
