import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArmIK } from '../src/ik.ts';

function rig(side = 1) {
  const actor = new THREE.Group();
  const normalized = new THREE.Group();
  const upper = new THREE.Group();
  const forearm = new THREE.Group();
  const hand = new THREE.Group();
  actor.add(normalized);
  normalized.add(upper);
  upper.add(forearm);
  forearm.add(hand);
  upper.position.set(side * 0.46, 1.45, 0);
  forearm.position.set(side * 0.3, -0.39, 0.09);
  hand.position.set(-side * 0.11, -0.28, 0.18);
  actor.position.set(2.1, -0.5, 1.9);
  actor.rotation.set(0.15, -0.57, 0.24);
  actor.scale.set(1.2, 0.8, 1.4); // Also verifies nonuniform parent transformation.
  normalized.scale.setScalar(0.94);
  normalized.rotation.set(0.2, 0.13, -0.09);
  const ik = createArmIK(upper, forearm, hand);
  const worldPoint = (local: THREE.Vector3) => {
    actor.updateMatrixWorld(true);
    return normalized.localToWorld(local.clone().add(upper.position));
  };
  return { actor, normalized, upper, forearm, hand, ik, worldPoint };
}

test('both mirrored wrists reach world targets under translated, rotated, scaled parents', () => {
  for (const side of [-1, 1]) {
    const r = rig(side);
    const target = r.worldPoint(new THREE.Vector3(-side * 0.25, -0.35, 0.42));
    const pole = r.worldPoint(new THREE.Vector3(side * 0.8, -0.4, -0.5));
    const beforeUpperOffset = r.forearm.position.clone();
    const beforeLowerOffset = r.hand.position.clone();
    r.hand.rotation.set(0.3, -0.2, 0.1);
    const handRotation = r.hand.quaternion.clone();
    assert.ok(r.ik.solve(target, pole) < 1e-7);
    assert.ok(
      r.hand.getWorldPosition(new THREE.Vector3()).distanceTo(target) < 1e-7,
    );
    assert.deepEqual(r.forearm.position, beforeUpperOffset);
    assert.deepEqual(r.hand.position, beforeLowerOffset);
    assert.ok(r.hand.quaternion.equals(handRotation));
  }
});

test('upper and forearm scale can change between frames without recreating IK', () => {
  const r = rig();
  for (const scale of [1, 1.25, 1.5, 0.7, 1.4]) {
    r.upper.scale.setScalar(scale);
    r.forearm.scale.setScalar(1.1);
    r.actor.rotation.y += 0.12;
    const target = r.worldPoint(
      new THREE.Vector3(0.1, -0.3, 0.5).multiplyScalar(scale),
    );
    const pole = r.worldPoint(new THREE.Vector3(-0.8, -0.5, 0));
    assert.ok(r.ik.solve(target, pole) < 1e-7);
  }
});

test('pole controls which side of target line contains the elbow', () => {
  const r = rig();
  const target = r.worldPoint(new THREE.Vector3(0, -0.5, 0));
  for (const sign of [-1, 1]) {
    const pole = r.worldPoint(new THREE.Vector3(sign, 0, 0));
    assert.ok(r.ik.solve(target, pole) < 1e-7);
    const localElbow = r.normalized.worldToLocal(
      r.forearm.getWorldPosition(new THREE.Vector3()),
    );
    assert.ok((localElbow.x - r.upper.position.x) * sign > 0.1);
  }
});

test('unreachable target clamps extension; reported error matches actual wrist error', () => {
  const r = rig();
  const target = r.worldPoint(new THREE.Vector3(0, -5, 0));
  const pole = r.worldPoint(new THREE.Vector3(1, 0, 0));
  const error = r.ik.solve(target, pole);
  assert.ok(Number.isFinite(error) && error > 1);
  assert.ok(
    Math.abs(
      error - r.hand.getWorldPosition(new THREE.Vector3()).distanceTo(target),
    ) < 1e-10,
  );
  const wristParent = r.normalized.worldToLocal(
    r.hand.getWorldPosition(new THREE.Vector3()),
  );
  const reach = r.forearm.position.length() + r.hand.position.length();
  assert.ok(Math.abs(wristParent.distanceTo(r.upper.position) - reach) < 1e-7);
});

test('zero-distance and collinear poles stay finite, including equal-length fully folded arms', () => {
  const r = rig();
  for (const equalLength of [false, true]) {
    if (equalLength) r.hand.position.copy(r.forearm.position);
    const shoulder = r.worldPoint(new THREE.Vector3());
    const error = r.ik.solve(shoulder, shoulder);
    assert.ok(Number.isFinite(error));
    for (const v of [
      ...r.upper.quaternion.toArray(),
      ...r.forearm.quaternion.toArray(),
    ])
      assert.ok(Number.isFinite(v));
    if (equalLength) assert.ok(error < 1e-7);
  }
});

test('1000 moving world targets retain precision without rest-pose drift', () => {
  const r = rig(-1);
  for (let i = 0; i < 1000; i++) {
    r.actor.position.x = Math.sin(i * 0.1);
    r.actor.rotation.y = i * 0.02;
    r.upper.scale.setScalar(1.25 + 0.15 * Math.sin(i * 0.07));
    const target = r.worldPoint(
      new THREE.Vector3(Math.sin(i * 0.04) * 0.2, -0.35, 0.5),
    );
    const pole = r.worldPoint(new THREE.Vector3(-0.9, -0.3, -0.5));
    assert.ok(r.ik.solve(target, pole) < 1e-7, `frame ${i}`);
  }
});
