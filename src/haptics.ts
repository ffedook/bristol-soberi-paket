export type HapticMode = 'vibration' | 'native-switch' | 'unavailable';

/** Detect APIs, not device model. Native switch support does not prove a motor exists. */
export function hapticMode(): HapticMode {
  if (typeof navigator === 'undefined') return 'unavailable';
  if (typeof navigator.vibrate === 'function') return 'vibration';
  if (
    navigator.maxTouchPoints > 0 &&
    typeof HTMLInputElement !== 'undefined' &&
    'switch' in HTMLInputElement.prototype
  )
    return 'native-switch';
  return 'unavailable';
}

/** Invoke synchronously from a accepted gesture. Native switch haptics are OS-owned. */
export function tapHaptic(
  enabled: boolean,
  nav:
    | { vibrate: (pattern: number | number[]) => boolean }
    | undefined = typeof navigator === 'undefined' ? undefined : navigator,
) {
  if (!enabled || typeof nav?.vibrate !== 'function') return false;
  try {
    return nav.vibrate(24);
  } catch {
    return false;
  }
}

/** Android can play different result patterns; Safari cannot do so through this API. */
export function resultHaptic(
  enabled: boolean,
  kind: 'win' | 'danger' | 'repel',
) {
  if (!enabled || hapticMode() !== 'vibration') return false;
  const patterns = {
    win: [24, 35, 45],
    danger: [35, 45, 80],
    repel: [25, 35, 50],
  };
  try {
    return navigator.vibrate(patterns[kind]);
  } catch {
    return false;
  }
}
