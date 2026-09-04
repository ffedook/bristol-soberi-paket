import * as THREE from 'three';

/** Lengthens two arm segments along their neutral bone axes, without widening fur or hands. */
export function createArmStretch(
  upper: THREE.Object3D,
  forearm: THREE.Object3D,
  hand: THREE.Object3D,
) {
  if (forearm.parent !== upper || hand.parent !== forearm)
    throw new Error(
      'Arm stretch requires upper → forearm → hand direct children.',
    );

  const upperOffset = forearm.position.clone();
  const lowerOffset = hand.position.clone();
  const upperAxis = upperOffset.clone().normalize();
  const lowerAxis = lowerOffset.clone().normalize();
  const stretch = new THREE.Matrix4();
  const capture = (joint: THREE.Object3D) =>
    joint.children
      .filter(
        (child): child is THREE.Mesh => (child as THREE.Mesh).isMesh === true,
      )
      .map((mesh) => {
        if (mesh.matrixAutoUpdate) mesh.updateMatrix();
        const base = mesh.matrix.clone();
        // Projection stretch may contain shear, which position/rotation/scale cannot represent.
        mesh.matrixAutoUpdate = false;
        return { mesh, base };
      });
  const upperMeshes = capture(upper);
  const lowerMeshes = capture(forearm);

  const stretchMeshes = (
    meshes: typeof upperMeshes,
    axis: THREE.Vector3,
    factor: number,
  ) => {
    const k = factor - 1;
    const { x, y, z } = axis;
    stretch.set(
      1 + k * x * x,
      k * x * y,
      k * x * z,
      0,
      k * y * x,
      1 + k * y * y,
      k * y * z,
      0,
      k * z * x,
      k * z * y,
      1 + k * z * z,
      0,
      0,
      0,
      0,
      1,
    );
    for (let index = 0; index < meshes.length; index++) {
      const item = meshes[index];
      item.mesh.matrix.multiplyMatrices(stretch, item.base);
      item.mesh.matrixWorldNeedsUpdate = true;
    }
  };

  return {
    /** Call before IK each frame. apply(1) restores rest geometry/offsets; invalid factors use 1. */
    apply(factor: number) {
      const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
      // Bone length comes from offsets and mesh matrices, never inherited uniform enlargement.
      upper.scale.setScalar(1);
      forearm.scale.setScalar(1);
      hand.scale.setScalar(1);
      forearm.position.copy(upperOffset).multiplyScalar(safeFactor);
      hand.position.copy(lowerOffset).multiplyScalar(safeFactor);
      stretchMeshes(upperMeshes, upperAxis, safeFactor);
      stretchMeshes(lowerMeshes, lowerAxis, safeFactor);
    },
  };
}
