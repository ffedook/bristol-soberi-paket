import { parseState, type State } from './engine.ts';
/** Keep a coherent session even when private mode or a quota denies writes. */
export class GameStorage {
  private raw: string | null = null;
  failed = false;
  private key: string;
  private backend: () => Pick<Storage, 'getItem' | 'setItem'>;
  constructor(
    key: string,
    backend: () => Pick<Storage, 'getItem' | 'setItem'>,
  ) {
    this.key = key;
    this.backend = backend;
  }
  read(): State {
    if (!this.failed) {
      try {
        this.raw = this.backend().getItem(this.key);
      } catch {
        this.failed = true;
      }
    }
    return parseState(this.raw);
  }
  write(state: State): void {
    this.raw = JSON.stringify(state);
    if (!this.failed) {
      try {
        this.backend().setItem(this.key, this.raw);
      } catch {
        this.failed = true;
      }
    }
  }
}
