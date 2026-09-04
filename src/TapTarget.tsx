import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { TapGate } from './tapGate';
import { hapticMode, tapHaptic } from './haptics';

interface Props {
  children?: ReactNode;
  disabled: boolean;
  haptics: boolean;
  onTap: () => void;
  /** Immediate press animation only; do not settle/disable the native input here. */
  onPress?: () => void;
  className?: string;
  label?: string;
  ref?: Ref<HTMLDivElement>;
}

export function TapTarget({
  children,
  disabled,
  haptics,
  onTap,
  onPress,
  className = '',
  label = 'Нажать на пакет',
  ref,
}: Props) {
  const [gate] = useState(() => new TapGate());
  const [capability] = useState(hapticMode);
  const [pressed, setPressed] = useState(false);
  const pressedIds = useRef(new Set<number>());
  const latest = useRef({ onTap, disabled });
  latest.current = { onTap, disabled };
  const native = haptics && capability === 'native-switch';

  useLayoutEffect(() => {
    gate.reset();
    pressedIds.current.clear();
    setPressed(false);
    let frame = 0;
    let releasedTaps = 0;
    const down = (e: PointerEvent) => {
      if (!disabled) gate.down(e);
    };
    const releaseVisual = (id: number) => {
      pressedIds.current.delete(id);
      setPressed(pressedIds.current.size > 0);
    };
    const flush = () => {
      frame = 0;
      const count = releasedTaps;
      releasedTaps = 0;
      if (latest.current.disabled) return;
      for (let index = 0; index < count; index++) latest.current.onTap();
    };
    const up = (e: PointerEvent) => {
      if (gate.up(e.pointerId)) {
        releasedTaps++;
        // Native WebKit click normally runs during touchend, before the next frame.
        // Keep input enabled through that default action. Physical iPhone verification required.
        if (!frame) frame = requestAnimationFrame(flush);
      }
      releaseVisual(e.pointerId);
    };
    const cancel = (e: PointerEvent) => {
      gate.cancel(e.pointerId);
      releaseVisual(e.pointerId);
    };
    const lost = (e: PointerEvent) => {
      gate.lostCapture(e.pointerId);
      releaseVisual(e.pointerId);
    };
    const reset = () => {
      gate.reset();
      pressedIds.current.clear();
      setPressed(false);
      releasedTaps = 0;
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', cancel, true);
    window.addEventListener('lostpointercapture', lost, true);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('lostpointercapture', lost, true);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
      cancelAnimationFrame(frame);
      gate.reset();
    };
  }, [gate, disabled, native]);

  return (
    <div
      className={`tap-target ${className}${pressed ? ' is-pressed' : ''}`}
      ref={ref}
    >
      <button
        type="button"
        className="tap-target-button"
        aria-label={label}
        disabled={disabled}
        onPointerDown={(e) => {
          e.preventDefault();
          if (disabled || !gate.claim(e.pointerId)) return;
          pressedIds.current.add(e.pointerId);
          setPressed(true);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* Cancelled contact. */
          }
          tapHaptic(haptics);
          onPress?.();
          onTap();
        }}
        onClick={(e) => {
          const nativeEvent = e.nativeEvent as PointerEvent;
          // Pointer taps already settled. Preserve separate keyboard/assistive activation.
          if (e.detail !== 0 || nativeEvent.pointerType || disabled) return;
          tapHaptic(haptics);
          onPress?.();
          onTap();
        }}
        onKeyDown={(e) => {
          if (e.repeat && (e.key === ' ' || e.key === 'Enter'))
            e.preventDefault();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {children}
      </button>
      {native && (
        <input
          type="checkbox"
          ref={(input) => {
            input?.setAttribute('switch', '');
          }}
          className="tap-native-switch"
          aria-hidden="true"
          tabIndex={-1}
          disabled={disabled}
          onPointerDown={(e) => {
            if (disabled || !gate.claim(e.pointerId, true)) {
              e.preventDefault();
              return;
            }
            pressedIds.current.add(e.pointerId);
            setPressed(true);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* Cancelled contact. */
            }
            // All fingers can press. Do not cancel native switch default behavior.
            onPress?.();
          }}
          onClick={(e) => {
            // Native click is for the OS tick only; every finger's valid pointerup owns gameplay.
            if (!e.isTrusted || disabled) e.preventDefault();
          }}
          onContextMenu={(e) => e.preventDefault()}
        />
      )}
    </div>
  );
}
