import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createBag, createSquirrel } from './characters';
import { createArmIK } from './ik';
import { createArmStretch } from './armStretch';
import {
  sceneBus,
  theftPose,
  blockPose,
  BLOCK_DURATION,
  type SceneBeat,
} from './motion';
import type { BoosterKind, Round } from './engine';

export type Scene3DProps = {
  roundId: string;
  step: number;
  booster?: BoosterKind | null;
  status: Round['status'];
  reduced: boolean;
  previewTime?: number;
  previewBlockTime?: number;
  onReady?: (ready: boolean) => void;
};
export default function Scene3D(props: Scene3DProps) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer | undefined,
      frame = 0,
      disposed = false;
    let cleanup = () => {};
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.setClearColor(0, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NeutralToneMapping;
      renderer.toneMappingExposure = 0.9;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene(),
        camera = new THREE.PerspectiveCamera(33, 1, 0.1, 60);
      camera.position.set(0, 2.35, 6.7);
      camera.lookAt(0, 1.65, 0);
      const environment = new RoomEnvironment(),
        pmrem = new THREE.PMREMGenerator(renderer);
      const envMap = pmrem.fromScene(environment, 0.035);
      scene.environment = envMap.texture;
      scene.environmentIntensity = 0.45;
      environment.dispose();
      pmrem.dispose();
      const sky = new THREE.HemisphereLight(0xfff6e6, 0x521b2e, 0.75);
      scene.add(sky);
      const key = new THREE.DirectionalLight(0xffecce, 2.4);
      key.position.set(-3.5, 6, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.left = -5;
      key.shadow.camera.right = 5;
      key.shadow.camera.top = 6;
      key.shadow.camera.bottom = -3;
      key.shadow.normalBias = 0.035;
      key.shadow.bias = -0.0003;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xcbe6ff, 0.8);
      fill.position.set(4, 3, 4);
      scene.add(fill);
      const rim = new THREE.PointLight(0xff3c59, 0, 18, 2);
      rim.position.set(1.8, 2.8, -1.6);
      scene.add(rim);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(30, 30),
        new THREE.ShadowMaterial({ opacity: 0.12 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.035;
      floor.receiveShadow = true;
      scene.add(floor);
      const bag = createBag(),
        squirrel = createSquirrel();
      const bagActor = new THREE.Group(),
        thiefActor = new THREE.Group();
      bagActor.add(bag.root);
      thiefActor.add(squirrel.root);
      const carrying = new THREE.Group();
      carrying.add(bagActor, thiefActor);
      scene.add(carrying);
      const normalize = (object: THREE.Group, height: number) => {
        const box = new THREE.Box3().setFromObject(object);
        const factor = height / (box.max.y - box.min.y);
        object.scale.setScalar(factor);
        object.position.y = -box.min.y * factor;
      };
      normalize(bag.root, 3.4);
      normalize(squirrel.root, 3.15);
      const bagScale = bag.root.scale.x;
      const armsIK = {
        left: createArmIK(
          squirrel.arms.left,
          squirrel.forearms.left,
          squirrel.hands.left,
        ),
        right: createArmIK(
          squirrel.arms.right,
          squirrel.forearms.right,
          squirrel.hands.right,
        ),
      };
      const armsStretch = {
        left: createArmStretch(
          squirrel.arms.left,
          squirrel.forearms.left,
          squirrel.hands.left,
        ),
        right: createArmStretch(
          squirrel.arms.right,
          squirrel.forearms.right,
          squirrel.hands.right,
        ),
      };
      const grip = new THREE.Vector3(),
        pole = new THREE.Vector3(),
        neutralWrist = new THREE.Vector3(),
        shoulder = new THREE.Vector3();
      const inverseWrist = new THREE.Quaternion(),
        palmRotation = new THREE.Quaternion();
      const armLength = Object.fromEntries(
        (['left', 'right'] as const).map((k) => [
          k,
          squirrel.forearms[k].position.length() +
            squirrel.hands[k].position.length(),
        ]),
      );
      const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(0.85, 40),
        new THREE.MeshBasicMaterial({
          color: 0x300914,
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
        }),
      );
      shadow.rotation.x = -Math.PI / 2;
      shadow.scale.y = 0.7;
      shadow.position.y = -0.025;
      scene.add(shadow);
      const guard = new THREE.Group();
      scene.add(guard);
      const bubbleMat = new THREE.MeshPhysicalMaterial({
        color: 0x7de6ff,
        transparent: true,
        opacity: 0.08,
        roughness: 0.18,
        metalness: 0.12,
        depthWrite: false,
      });
      const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 20),
        bubbleMat,
      );
      bubble.position.set(0, 1.72, 0.03);
      bubble.scale.set(1.53, 1.76, 0.87);
      guard.add(bubble);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x7de6ff,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.37, 0.022, 8, 64),
        ringMat,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.055;
      guard.add(ring);
      const orbit = new THREE.Group();
      guard.add(orbit);
      for (let i = 0; i < 6; i++) {
        const mote = new THREE.Mesh(
          new THREE.SphereGeometry(0.035, 8, 6),
          ringMat,
        );
        const angle = (i * Math.PI) / 3;
        mote.position.set(
          Math.cos(angle) * 1.35,
          0.17 + i * 0.25,
          Math.sin(angle) * 0.8,
        );
        orbit.add(mote);
      }
      const rippleMat = new THREE.MeshBasicMaterial({
        color: 0xa4edff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const ripple = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.025, 8, 48),
        rippleMat,
      );
      ripple.position.set(0, 1.7, 0.85);
      guard.add(ripple);
      let blockAt = -99999,
        boostAt = -99999,
        checkpointAt = -99999;
      let lastBooster: BoosterKind = 'shield';
      let contextLost = false,
        reportedReady = false;
      let previousId = latest.current.roundId,
        previousStatus = latest.current.status;
      let statusAt = performance.now(),
        tapAt = -99999,
        repelAt = -99999,
        side = 1;
      const beat = (e: Event) => {
        const b = (e as CustomEvent<SceneBeat>).detail;
        if (b.kind === 'tap') {
          tapAt = performance.now();
          side = b.side ?? -side;
        } else if (b.kind === 'block') blockAt = performance.now();
        else if (b.kind === 'boost') boostAt = performance.now();
        else if (b.kind === 'checkpoint') checkpointAt = performance.now();
        else repelAt = performance.now();
      };
      sceneBus.addEventListener('beat', beat);
      const resize = () => {
        if (!renderer || disposed) return;
        const w = el.clientWidth,
          h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const observer = new ResizeObserver(resize);
      observer.observe(el);
      resize();
      const lose = (e: Event) => {
        e.preventDefault();
        contextLost = true;
        reportedReady = false;
        if (renderer) renderer.domElement.style.visibility = 'hidden';
        latest.current.onReady?.(false);
      };
      const restore = () => {
        contextLost = false;
      };
      renderer.domElement.addEventListener('webglcontextlost', lose);
      renderer.domElement.addEventListener('webglcontextrestored', restore);
      const draw = (now: number) => {
        if (disposed || !renderer) return;
        frame = requestAnimationFrame(draw);
        if (document.hidden || contextLost) return;
        const p = latest.current,
          t = now / 1000;
        if (p.roundId !== previousId || p.status !== previousStatus) {
          previousId = p.roundId;
          previousStatus = p.status;
          statusAt = now;
        }
        const elapsed =
            import.meta.env.DEV && p.previewTime !== undefined
              ? p.previewTime
              : (now - statusAt) / 1000,
          danger = Math.min(1, p.step / 110),
          reduced = p.reduced;
        const tapAge = (now - tapAt) / 1000,
          impulse = reduced ? 0 : Math.exp(-tapAge * 8) * Math.sin(tapAge * 27);
        const idle = reduced ? 0 : Math.sin(t * 2.3);
        carrying.position.set(0, 0, 0);
        carrying.rotation.set(0, 0, 0);
        bagActor.visible = true;
        bagActor.position.set(0, 0, 0);
        bagActor.rotation.set(0, 0.06, 0);
        bagActor.scale.set(1, 1, 1);
        bag.root.scale.set(
          bagScale * (1 - impulse * 0.08),
          bagScale * (1 + impulse * 0.11),
          bagScale * (1 - impulse * 0.05),
        );
        bagActor.position.y = Math.max(0, impulse) * 0.13 + idle * 0.024;
        bagActor.rotation.y +=
          (reduced ? 0 : Math.sin(t * 1.1) * 0.065) + impulse * 0.1 * side;
        bagActor.rotation.z = idle * 0.018 + impulse * 0.045 * side;
        camera.position.z = 6.7;
        camera.position.x = 0;
        thiefActor.visible = false;
        thiefActor.rotation.set(0, 0, 0);
        thiefActor.scale.setScalar(1);
        bag.setExpression(
          p.booster
            ? 'relieved'
            : p.step > 85
              ? 'panic'
              : p.step > 42
                ? 'nervous'
                : 'happy',
        );
        const pulse = reduced
          ? 0.6
          : 0.5 + 0.5 * Math.sin(t * (2.8 + danger * 1.3));
        rim.intensity = danger * (2 + 4 * pulse);
        bag.setBlink(
          reduced ? 0 : Math.max(0, 1 - Math.abs((t % 4.1) - 3.9) / 0.09),
        );
        bag.lookAt(reduced ? 0 : Math.sin(t * 0.8) * danger * 0.75, 0);
        bag.arms.left.rotation.x = 0;
        bag.arms.right.rotation.x = 0;
        bag.arms.left.rotation.z = -impulse * 0.2 - idle * 0.035;
        bag.arms.right.rotation.z = impulse * 0.2 + idle * 0.035;
        bag.feet.left.rotation.x = impulse * 0.13;
        bag.feet.right.rotation.x = -impulse * 0.13;
        squirrel.head.rotation.set(0, Math.sin(t * 1.9) * 0.08, 0);
        squirrel.tail.rotation.z = Math.sin(t * 3.5) * 0.08;
        squirrel.arms.left.rotation.set(0, 0, 0);
        squirrel.arms.right.rotation.set(0, 0, 0);
        armsStretch.left.apply(1);
        armsStretch.right.apply(1);
        squirrel.hands.left.scale.setScalar(1);
        squirrel.hands.right.scale.setScalar(1);
        squirrel.hands.left.rotation.set(0, 0, 0.1);
        squirrel.hands.right.rotation.set(0, 0, -0.1);
        squirrel.forearms.left.rotation.set(0, 0, 0);
        squirrel.forearms.right.rotation.set(0, 0, 0);
        squirrel.setBlink(
          reduced ? 0 : Math.max(0, 1 - Math.abs((t % 3.8) - 3.5) / 0.09),
        );
        squirrel.legs.left.rotation.set(0, 0, 0);
        squirrel.legs.right.rotation.set(0, 0, 0);
        squirrel.setExpression('sneaky');
        shadow.position.x = 0;
        shadow.material.opacity = 0.13;
        if (p.status === 'caught' || p.status === 'lost') {
          const q = theftPose(reduced ? 3.2 : elapsed);
          const wideDistance = Math.max(
            6.9,
            5.5 /
              (2 * Math.tan(THREE.MathUtils.degToRad(33 / 2)) * camera.aspect) +
              0.6,
          );
          camera.position.z += q.peek * (wideDistance - 6.7);
          carrying.position.set(q.carryX, q.carryY, 0);
          carrying.rotation.y = -q.run * 0.35;
          thiefActor.visible = q.visible;
          thiefActor.position.set(q.squirrelX, 0, q.squirrelZ);
          thiefActor.rotation.y = -0.25 - q.reach * 0.3;
          const walk =
            Math.sin(elapsed * (q.run > 0 ? 24 : 15)) *
            (q.run > 0 ? 0.65 : 0.15 * (1 - q.reach));
          squirrel.legs.left.rotation.x = walk;
          squirrel.legs.right.rotation.x = -walk;
          squirrel.tail.rotation.z =
            Math.sin(elapsed * 14) * (0.08 + q.run * 0.15);
          squirrel.setExpression(q.grab > 0.1 ? 'gleeful' : 'sneaky');
          squirrel.lookAt(-0.75, -0.2);
          bag.lookAt(0.95, 0.15);
          bag.arms.left.rotation.z = -0.7 * q.grab;
          bag.arms.right.rotation.z = -0.25 * q.grab;
          bag.arms.right.rotation.x = -0.85 * q.grab;
          bag.feet.left.rotation.x = Math.sin(elapsed * 22) * q.grab * 0.22;
          bag.feet.right.rotation.x = -Math.sin(elapsed * 22) * q.grab * 0.22;
          bagActor.position.set(q.bagX, q.bagY, q.bagZ);
          bagActor.rotation.set(0, q.bagTurn, -0.08 * q.grab);
          bagActor.scale.setScalar(q.bagScale);
          bagActor.visible = q.visible;
          shadow.position.x = q.carryX + q.bagX;
          bag.setExpression(q.grab > 0.1 ? 'surprised' : 'panic');
          // Hands target fixed points on the bag, never independently interpolated actors.
          // Once lifted, both characters share the same carrying parent for the escape.
          if (q.reach > 0) {
            carrying.updateWorldMatrix(true, true);
            for (const k of ['left', 'right'] as const) {
              const arm = squirrel.arms[k],
                hand = squirrel.hands[k];
              hand.getWorldPosition(neutralWrist);
              grip.set(
                k === 'left' ? 0.55 : 1.02,
                k === 'left' ? 1.45 : 1.2,
                k === 'left' ? 0.58 : 0.28,
              );
              bag.root.localToWorld(grip);
              grip.lerpVectors(neutralWrist, grip, q.reach);
              arm.getWorldPosition(shoulder);
              const stretch = Math.max(
                1,
                (shoulder.distanceTo(grip) /
                  (armLength[k] * squirrel.root.scale.x)) *
                  1.06,
              );
              armsStretch[k].apply(stretch);
              pole.set(k === 'left' ? -0.6 : 1.8, 0.85, 1.3);
              carrying.localToWorld(pole);
              armsIK[k].solve(grip, pole);
              // The palm faces the bag, fingers curve down its side.
              hand.parent!.getWorldQuaternion(inverseWrist).invert();
              bagActor.getWorldQuaternion(palmRotation);
              hand.quaternion.copy(inverseWrist).multiply(palmRotation);
            }
          }
          rim.intensity = 5 + 3 * pulse;
          camera.position.x =
            0.55 * q.peek +
            (!reduced && elapsed > 1.25 && elapsed < 1.65
              ? Math.sin(elapsed * 70) * 0.025 * (1 - (elapsed - 1.25) / 0.4)
              : 0);
        } else if (p.status === 'won') {
          const victory = reduced
            ? 0
            : Math.sin(Math.min(1, elapsed / 1.1) * Math.PI);
          bagActor.position.y += victory * 0.55;
          bagActor.rotation.y = Math.sin(elapsed * 9) * victory * 0.18;
          bagActor.rotation.z = Math.sin(elapsed * 10) * victory * 0.09;
          bag.arms.left.rotation.z = -0.85 * victory;
          bag.arms.right.rotation.z = 0.85 * victory;
          bag.lookAt(0, 0.15);
          bag.setExpression('relieved');
          rim.color.setHex(0xffcd57);
          rim.intensity = 5;
        } else {
          rim.color.setHex(0xff3c59);
          camera.position.x = 0;
          const repelAge = (now - repelAt) / 1000;
          if (repelAge < 0.9) {
            thiefActor.visible = !reduced;
            thiefActor.position.set(-1.2 - repelAge * 5, repelAge * 0.6, 0.3);
            thiefActor.rotation.z = -repelAge * 2;
            bag.setExpression('relieved');
          }
        }
        if (p.booster) lastBooster = p.booster;
        const blockAge =
            import.meta.env.DEV && p.previewBlockTime !== undefined
              ? p.previewBlockTime
              : (now - blockAt) / 1000,
          boostAge = (now - boostAt) / 1000;
        guard.visible =
          p.status === 'playing' && (!!p.booster || blockAge < BLOCK_DURATION);
        const guardColor = lastBooster === 'safe' ? 0x8df7b2 : 0x7de6ff;
        bubbleMat.color.setHex(guardColor);
        ringMat.color.setHex(guardColor);
        rippleMat.color.setHex(guardColor);
        const guardPulse = reduced ? 0 : Math.sin(t * 2.4) * 0.02;
        bubbleMat.opacity = p.booster
          ? 0.065 + guardPulse
          : Math.max(0, 0.2 * (1 - blockAge / BLOCK_DURATION));
        bubble.visible = lastBooster === 'shield' || blockAge < BLOCK_DURATION;
        ring.scale.setScalar(1 + guardPulse);
        orbit.rotation.y = reduced ? 0 : t * 0.7;
        orbit.visible = !!p.booster;
        ripple.visible =
          !reduced && (blockAge < BLOCK_DURATION || boostAge < 0.7);
        const wave = blockAge < BLOCK_DURATION ? blockAge : boostAge;
        ripple.scale.setScalar(0.25 + Math.min(1, wave / 0.8) * 1.6);
        rippleMat.opacity = Math.max(0, 0.65 * (1 - wave / 0.95));
        if (p.status === 'playing' && blockAge < BLOCK_DURATION) {
          bag.setExpression('relieved');
          rim.color.setHex(guardColor);
          rim.intensity = 4;
          if (!reduced) {
            const q = blockPose(blockAge);
            const distance = Math.max(
              6.7,
              7 /
                (2 *
                  Math.tan(THREE.MathUtils.degToRad(33 / 2)) *
                  camera.aspect) +
                0.6,
            );
            camera.position.z = 6.7 + q.camera * (distance - 6.7);
            camera.position.x = q.camera * 1.1;
            thiefActor.visible = q.visible;
            thiefActor.position.set(q.x, q.y, -0.3);
            thiefActor.rotation.set(0, -0.6, q.tilt);
            squirrel.setExpression('defeated');
            squirrel.arms.left.rotation.x = -0.9;
            squirrel.arms.right.rotation.x = -0.9;
            bagActor.rotation.z +=
              Math.sin(blockAge * 24) * Math.exp(-blockAge * 6) * 0.055;
          }
        }
        const celebrationAge = (now - checkpointAt) / 1000;
        if (
          p.status === 'playing' &&
          celebrationAge < 0.7 &&
          blockAge >= BLOCK_DURATION
        ) {
          bag.setExpression('relieved');
          if (!reduced) {
            const bounce = Math.sin((celebrationAge / 0.7) * Math.PI);
            bagActor.position.y += bounce * 0.25;
            bag.arms.left.rotation.z -= bounce * 0.45;
            bag.arms.right.rotation.z += bounce * 0.45;
          }
        }
        renderer.render(scene, camera);
        if (!reportedReady) {
          renderer.domElement.style.visibility = 'visible';
          reportedReady = true;
          latest.current.onReady?.(true);
        }
      };
      frame = requestAnimationFrame(draw);
      cleanup = () => {
        observer.disconnect();
        sceneBus.removeEventListener('beat', beat);
        renderer?.domElement.removeEventListener('webglcontextlost', lose);
        renderer?.domElement.removeEventListener(
          'webglcontextrestored',
          restore,
        );
        envMap.dispose();
        const geometries = new Set<THREE.BufferGeometry>(),
          materials = new Set<THREE.Material>(),
          textures = new Set<THREE.Texture>();
        scene.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            geometries.add(o.geometry);
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material]) {
              materials.add(m);
              for (const value of Object.values(m)) {
                if (value instanceof THREE.Texture) textures.add(value);
              }
            }
          }
        });
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        textures.forEach((tx) => tx.dispose());
      };
    } catch {
      latest.current.onReady?.(false);
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanup();
      renderer?.dispose();
      renderer?.domElement.remove();
    };
  }, []);
  return <div ref={host} className="scene-3d" aria-hidden="true" />;
}
