import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  theftPose,
  THEFT_DURATION,
  blockPose,
  BLOCK_DURATION,
} from '../src/motion.ts';
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

test('blocked thief stays outside the bag and camera returns after recoil', () => {
  for (let t = 0; t <= BLOCK_DURATION; t += 0.01) {
    const p = blockPose(t);
    assert.ok(p.x >= 2.4 - 1e-8);
    assert.ok(p.camera >= 0 && p.camera <= 1);
  }
  assert.equal(blockPose(0).camera, 0);
  assert.equal(blockPose(0.8).camera, 1);
  assert.ok(blockPose(2).x > blockPose(1).x);
  assert.equal(blockPose(BLOCK_DURATION).visible, false);
  assert.equal(blockPose(BLOCK_DURATION).camera, 0);
});

test('shield contact lasts long enough to read before the recoil', () => {
  assert.equal(blockPose(0.5).impact, false);
  assert.equal(blockPose(1.1).impact, true);
  assert.equal(blockPose(1.1).reach, 1);
  assert.equal(blockPose(1.9).impact, false);
  assert.ok(blockPose(1.9).x > blockPose(1.1).x);
});
