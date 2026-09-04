export const THEFT_DURATION = 3200;
export const WIN_DURATION = 1250;
export type SceneBeat = { kind: 'tap' | 'repel'; side?: number };
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
