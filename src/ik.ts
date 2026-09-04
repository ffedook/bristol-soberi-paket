import * as THREE from 'three';

/**
 * Analytic two-bone IK. `bendWorld` is an absolute pole point: the elbow bends
 * toward its projection perpendicular to shoulder → target.
 *
 * Call after setting actor transforms / uniform upper-arm scale. The helper
 * owns upper + forearm rotation, preserves translations and hand orientation,
 * and allocates nothing in solve(). Parent transforms may include scaling;
 * upper-arm scale must be positive and uniform. No temporary vectors needed
 * at call sites: reuse your target and pole vectors.
 */
export function createArmIK(
  upper: THREE.Object3D,
  forearm: THREE.Object3D,
  hand: THREE.Object3D,
) {
  if (forearm.parent !== upper || hand.parent !== forearm)
    throw new Error('Arm IK requires upper → forearm → hand direct children.');

  const inverseParent = new THREE.Matrix4();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const pole = new THREE.Vector3();
  const upperRest = new THREE.Vector3();
  const lowerRest = new THREE.Vector3();
  const elbow = new THREE.Vector3();
  const wrist = new THREE.Vector3();
  const lowerDirection = new THREE.Vector3();
  const actualWrist = new THREE.Vector3();
  const inverseUpperRotation = new THREE.Quaternion();
  const epsilon = 1e-9;

  return {
    /** Returns world-space wrist distance from the requested (unclamped) target. */
    solve(targetWorld: THREE.Vector3, bendWorld: THREE.Vector3): number {
      // Rendering has not necessarily updated world matrices after choreography.
      if (upper.parent) {
        upper.parent.updateWorldMatrix(true, false);
        inverseParent.copy(upper.parent.matrixWorld).invert();
      } else inverseParent.identity();

      const scale = upper.scale.x;
      if (
        !(scale > epsilon) ||
        Math.abs(upper.scale.y - scale) > epsilon ||
        Math.abs(upper.scale.z - scale) > epsilon
      )
        return Infinity;

      // Local offsets remain unchanged. Scale is read afresh each frame.
      upperRest.copy(forearm.position);
      lowerRest.copy(hand.position).multiply(forearm.scale);
      const upperLength = upperRest.length() * scale;
      const lowerLength = lowerRest.length() * scale;
      if (!(upperLength > epsilon && lowerLength > epsilon)) return Infinity;
      upperRest.normalize();
      lowerRest.normalize();

      target.copy(targetWorld).applyMatrix4(inverseParent).sub(upper.position);
      const requestedDistance = target.length();
      if (!Number.isFinite(requestedDistance)) return Infinity;
      if (requestedDistance > epsilon)
        direction.copy(target).divideScalar(requestedDistance);
      else
        direction.copy(upperRest).applyQuaternion(upper.quaternion).normalize();

      pole.copy(bendWorld).applyMatrix4(inverseParent).sub(upper.position);
      pole.addScaledVector(direction, -pole.dot(direction));
      if (!Number.isFinite(pole.lengthSq())) return Infinity;
      if (pole.lengthSq() < epsilon * epsilon) {
        // A collinear pole has no bend plane. Choose a deterministic safe one.
        if (Math.abs(direction.x) < 0.8) pole.set(1, 0, 0);
        else pole.set(0, 1, 0);
        pole.addScaledVector(direction, -pole.dot(direction));
      }
      pole.normalize();

      const distance = THREE.MathUtils.clamp(
        requestedDistance,
        Math.max(epsilon, Math.abs(upperLength - lowerLength)),
        upperLength + lowerLength,
      );
      const cosine = THREE.MathUtils.clamp(
        (upperLength * upperLength +
          distance * distance -
          lowerLength * lowerLength) /
          (2 * upperLength * distance),
        -1,
        1,
      );
      const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));

      // Elbow and wrist are shoulder-relative vectors in the parent's space.
      elbow
        .copy(direction)
        .multiplyScalar(upperLength * cosine)
        .addScaledVector(pole, upperLength * sine);
      wrist.copy(direction).multiplyScalar(distance);
      lowerDirection.copy(elbow).divideScalar(upperLength);
      upper.quaternion.setFromUnitVectors(upperRest, lowerDirection);

      inverseUpperRotation.copy(upper.quaternion).invert();
      lowerDirection
        .copy(wrist)
        .sub(elbow)
        .applyQuaternion(inverseUpperRotation)
        .normalize();
      forearm.quaternion.setFromUnitVectors(lowerRest, lowerDirection);

      hand.updateWorldMatrix(true, false);
      actualWrist.setFromMatrixPosition(hand.matrixWorld);
      return actualWrist.distanceTo(targetWorld);
    },
  };
}
