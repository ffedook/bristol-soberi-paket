export const THEFT_DURATION = 3200;
export const WIN_DURATION = 1250;
export type SceneBeat = {
  kind: 'tap' | 'repel' | 'boost' | 'block' | 'checkpoint';
  side?: number;
};
export const sceneBus = new EventTarget();
export function sceneBeat(beat: SceneBeat) {
  sceneBus.dispatchEvent(new CustomEvent('beat', { detail: beat }));
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};
/** Presentation only. The engine settles the random outcome before this runs. */
export function theftPose(seconds: number) {
  const peek = ease(seconds / 0.65);
  const reach = ease((seconds - 0.65) / 0.6);
  const grab = ease((seconds - 1.25) / 0.5);
  const run = ease((seconds - 1.95) / 1.25);
  return {
    peek,
    reach,
    grab,
    run,
    squirrelX: 3.5 - peek * 1.6 - reach * 1.02,
    squirrelZ: -0.65 + reach * 0.5,
    bagX: 0 - grab * 0.6,
    bagY: grab * 0.64,
    bagZ: grab * 0.72,
    bagScale: 1 - grab * 0.35,
    bagTurn: grab * 0.07,
    carryX: 0 - run * 6,
    carryY: run > 0 ? Math.abs(Math.sin(seconds * 22)) * 0.12 : 0,
    visible: seconds < THEFT_DURATION / 1000,
  };
}

/** Approach the outside of the guard, recoil, then restore the camera. */
export const BLOCK_DURATION = 2.8;
export function blockPose(seconds: number) {
  const approach = ease(seconds / 0.6);
  const recoil = ease((seconds - 1.5) / 0.85);
  return {
    camera: approach * (1 - ease((seconds - 2.35) / 0.45)),
    x: 4.5 - approach * 2.1 + recoil * 4.8,
    y: Math.sin(recoil * Math.PI) * 0.45,
    tilt: -recoil * 0.45,
    reach: ease((seconds - 0.6) / 0.25) * (1 - ease((seconds - 1.4) / 0.25)),
    impact: seconds >= 0.85 && seconds < 1.5,
    visible: seconds >= 0 && seconds < 2.35,
  };
}
