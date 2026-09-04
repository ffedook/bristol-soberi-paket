let context: AudioContext | null = null;
export function unlockAudio() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch {
    /* Audio is optional. */
  }
}
export function sound(kind: 'tap' | 'win' | 'danger' | 'repel', progress = 0) {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    const ctx = context;
    const notes =
      kind === 'win'
        ? [523, 659, 784, 1047]
        : kind === 'danger'
          ? [160, 120, 80]
          : kind === 'repel'
            ? [220, 440, 880]
            : [400 + Math.min(progress, 120) * 5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      const t = ctx.currentTime + i * 0.08;
      osc.type = kind === 'danger' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(
        freq * (kind === 'tap' ? 1.35 : 0.8),
        t + 0.14,
      );
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(
        kind === 'tap' ? 0.045 : 0.075,
        t + 0.008,
      );
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  } catch {
    /* Sound is optional. */
  }
}
export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* Not available on every device. */
  }
}
