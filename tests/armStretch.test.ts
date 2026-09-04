import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArmStretch } from '../src/armStretch.ts';
import { createArmIK } from '../src/ik.ts';

function rig() {
  const actor = new THREE.Group();
  const upper = new THREE.Group();
  const forearm = new THREE.Group();
  const hand = new THREE.Group();
  actor.add(upper);
  upper.add(forearm);
  forearm.add(hand);
  actor.position.set(0.3, 1.2, -0.7);
  actor.rotation.set(0.12, 0.4, -0.2);
  actor.scale.setScalar(0.95);
  upper.position.set(0.46, 1.45, 0);
  forearm.position.set(0.3, -0.39, 0.09);
  hand.position.set(-0.11, -0.28, 0.18);
  return { actor, upper, forearm, hand };
}

test('stretch preserves transverse fur offsets with nonidentity mesh transform and resets exactly', () => {
  const r = rig();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry());
  mesh.position.set(0.07, 0.04, -0.02);
  mesh.rotation.set(0.2, -0.35, 0.11);
  mesh.scale.set(0.9, 1.1, 0.8);
  mesh.updateMatrix();
  const base = mesh.matrix.clone();
  r.upper.add(mesh);
  const axis = r.forearm.position.clone().normalize();
  const transverse = new THREE.Vector3(1, 0, 0).cross(axis).normalize();
  const restPoint = axis
    .clone()
    .multiplyScalar(0.25)
    .addScaledVector(transverse, 0.13);
  const vertex = restPoint.clone().applyMatrix4(base.clone().invert());
  const stretch = createArmStretch(r.upper, r.forearm, r.hand);
  for (const factor of [1.8, 1.2, 2, 0.9, 1]) {
    stretch.apply(factor);
    const deformed = vertex.clone().applyMatrix4(mesh.matrix);
    assert.ok(Math.abs(deformed.dot(axis) - 0.25 * factor) < 1e-10);
    assert.ok(Math.abs(deformed.dot(transverse) - 0.13) < 1e-10);
  }
  assert.deepEqual(mesh.matrix.elements, base.elements);
});

test('segment endpoints stay attached to stretched joints, hand size stays fixed, IK reaches stretched targets', () => {
  const r = rig();
  const upperEnd = r.forearm.position.clone();
  const lowerEnd = r.hand.position.clone();
  const upperMesh = new THREE.Mesh(new THREE.BufferGeometry());
  const lowerMesh = new THREE.Mesh(new THREE.BufferGeometry());
  const pawMesh = new THREE.Mesh(new THREE.SphereGeometry(0.1));
  pawMesh.position.set(0.02, 0.01, -0.03);
  pawMesh.updateMatrix();
  const pawBase = pawMesh.matrix.clone();
  r.upper.add(upperMesh);
  r.forearm.add(lowerMesh);
  r.hand.add(pawMesh);
  const stretch = createArmStretch(r.upper, r.forearm, r.hand);
  const ik = createArmIK(r.upper, r.forearm, r.hand);
  for (const factor of [1.8, 1.3, 1]) {
    r.upper.scale.setScalar(1.8); // Removes the old inherited arm-thickness inflation.
    stretch.apply(factor);
    assert.equal(r.upper.scale.x, 1);
    assert.equal(r.hand.scale.x, 1);
    assert.ok(
      Math.abs(r.forearm.position.length() - upperEnd.length() * factor) <
        1e-10,
    );
    assert.ok(
      Math.abs(r.hand.position.length() - lowerEnd.length() * factor) < 1e-10,
    );
    r.actor.updateMatrixWorld(true);
    const target = r.actor.localToWorld(
      new THREE.Vector3(0.25, -0.35, 0.48)
        .multiplyScalar(factor)
        .add(r.upper.position),
    );
    const pole = r.actor.localToWorld(
      new THREE.Vector3(-0.8, -0.5, -0.2).add(r.upper.position),
    );
    assert.ok(ik.solve(target, pole) < 1e-7);
    r.actor.updateMatrixWorld(true);
    const upperVertexWorld = upperEnd
      .clone()
      .applyMatrix4(upperMesh.matrixWorld);
    const lowerVertexWorld = lowerEnd
      .clone()
      .applyMatrix4(lowerMesh.matrixWorld);
    assert.ok(
      upperVertexWorld.distanceTo(
        r.forearm.getWorldPosition(new THREE.Vector3()),
      ) < 1e-7,
    );
    assert.ok(
      lowerVertexWorld.distanceTo(
        r.hand.getWorldPosition(new THREE.Vector3()),
      ) < 1e-7,
    );
    assert.deepEqual(pawMesh.matrix.elements, pawBase.elements);
    assert.equal(pawMesh.matrixAutoUpdate, true);
  }
  assert.deepEqual(r.forearm.position, upperEnd);
  assert.deepEqual(r.hand.position, lowerEnd);
});
