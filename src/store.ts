import { useEffect, useRef, useState } from 'react';
import { transition, type State, type Action } from './engine';
import { GameStorage } from './persistence';
export const STORAGE_KEY = 'bristol.soberi-paket.v1';
const storage = new GameStorage(STORAGE_KEY, () => localStorage);
export function readState(): State {
  return storage.read();
}
export function useGame() {
  const [state, setState] = useState(readState),
    current = useRef(state),
    [storageError, setStorageError] = useState(false);
  const channel = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    current.current = state;
  }, [state]);
  useEffect(() => {
    const sync = () => {
      const next = readState();
      current.current = next;
      setState(next);
    };
    window.addEventListener('storage', sync);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel(STORAGE_KEY);
      channel.current.onmessage = sync;
    }
    const focus = () => {
      sync();
    };
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', focus);
      channel.current?.close();
    };
  }, []);
  async function dispatch(
    action: Action,
  ): Promise<{ before: State; after: State }> {
    if (!['start', 'settings'].includes(action.type))
      action = { ...action, roundId: state.round?.id ?? 'none' };
    const apply = () => {
      const before = readState();
      const value = new Uint32Array(1);
      crypto.getRandomValues(value);
      const after = transition(
        before,
        action,
        value[0] / 4294967296,
        Date.now(),
        crypto.randomUUID(),
      );
      if (after !== before) {
        storage.write(after);
        if (storage.failed) setStorageError(true);
        current.current = after;
        setState(after);
        channel.current?.postMessage(after.revision);
      }
      return { before, after };
    };
    return navigator.locks
      ? navigator.locks.request(STORAGE_KEY, apply)
      : apply();
  }
  return { state, dispatch, storageError };
}
