import table from './balance.json' with { type: 'json' };
export const INITIAL_BALANCE = 1000,
  ENTRY = 100,
  REPEL = 100,
  MAX_TAPS = 120;
export const balanceTable = table as {
  tap: number;
  free: number;
  paid: number;
  risk: number;
}[];
export type Mode = 'free' | 'paid';
export type Round = {
  id: string;
  mode: Mode;
  step: number;
  payout: number;
  spent: number;
  repelled: boolean;
  status: 'playing' | 'caught' | 'won' | 'lost';
  lostAmount: number;
};
export type Entry = {
  id: string;
  at: number;
  label: string;
  amount: number;
  balance: number;
};
export type State = {
  version: 1;
  revision: number;
  balance: number;
  freeDay: string;
  round: Round | null;
  history: Entry[];
  sound: boolean;
  haptics: boolean;
  tutorial: boolean;
  games: number;
  best: number;
};
export type Action = (
  | { type: 'start'; mode: Mode }
  | { type: 'tap' }
  | { type: 'cashout' }
  | { type: 'repel' }
  | { type: 'forfeit' }
  | { type: 'dismiss' }
  | { type: 'settings'; sound?: boolean; haptics?: boolean; tutorial?: boolean }
) & { roundId?: string };
export const dayKey = (now: number) =>
  new Date(now + 3 * 3600000).toISOString().slice(0, 10);
export function freshState(now = Date.now()): State {
  return {
    version: 1,
    revision: 0,
    balance: INITIAL_BALANCE,
    freeDay: '',
    round: null,
    history: [
      {
        id: 'welcome',
        at: now,
        label: 'Стартовые монеты',
        amount: INITIAL_BALANCE,
        balance: INITIAL_BALANCE,
      },
    ],
    sound: true,
    haptics: true,
    tutorial: false,
    games: 0,
    best: 0,
  };
}
export function canFree(s: State, now = Date.now()) {
  return s.freeDay !== dayKey(now);
}
export function transition(
  state: State,
  action: Action,
  random = 0.5,
  now = Date.now(),
  id = 'round-' + now,
): State {
  if (action.roundId !== undefined && action.roundId !== state.round?.id)
    return state;
  const s = structuredClone(state),
    r = s.round;
  const record = (label: string, amount: number) => {
    s.balance += amount;
    s.history.unshift({
      id: id + '-' + s.revision + '-' + s.history.length,
      at: now,
      label,
      amount,
      balance: s.balance,
    });
    s.history = s.history.slice(0, 100);
  };
  const finish = (win: boolean) => {
    if (!r) return;
    r.status = win ? 'won' : 'lost';
    r.lostAmount = win ? 0 : r.payout;
    if (win) {
      record('Выигрыш · ' + r.step + ' тапов', r.payout);
      s.best = Math.max(s.best, r.payout);
    } else {
      r.payout = 0;
      record('Белка забрала пакет', 0);
    }
  };
  switch (action.type) {
    case 'start':
      if (r && ['playing', 'caught'].includes(r.status)) return state;
      if (action.mode === 'free') {
        if (!canFree(s, now)) return state;
        s.freeDay = dayKey(now);
        record('Бесплатная попытка', 0);
      } else {
        if (s.balance < ENTRY) return state;
        record('Платная попытка', -ENTRY);
      }
      s.round = {
        id,
        mode: action.mode,
        step: 0,
        payout: 0,
        spent: action.mode === 'paid' ? ENTRY : 0,
        repelled: false,
        status: 'playing',
        lostAmount: 0,
      };
      s.games++;
      break;
    case 'tap':
      if (!r || r.status !== 'playing' || r.step >= MAX_TAPS) return state;
      if (random < balanceTable[r.step].risk) {
        if (r.repelled) finish(false);
        else r.status = 'caught';
      } else {
        r.step++;
        r.payout = balanceTable[r.step - 1][r.mode];
        if (r.step === MAX_TAPS) finish(true);
      }
      break;
    case 'cashout':
      if (!r || r.status !== 'playing' || r.step === 0) return state;
      finish(true);
      break;
    case 'repel':
      if (!r || r.status !== 'caught' || r.repelled || s.balance < REPEL)
        return state;
      record('Отгон белки', -REPEL);
      r.spent += REPEL;
      r.repelled = true;
      r.status = 'playing';
      break;
    case 'forfeit':
      if (!r || !['playing', 'caught'].includes(r.status)) return state;
      finish(false);
      break;
    case 'dismiss':
      if (r && ['playing', 'caught'].includes(r.status)) return state;
      s.round = null;
      break;
    case 'settings':
      if (action.sound !== undefined) s.sound = action.sound;
      if (action.haptics !== undefined) s.haptics = action.haptics;
      if (action.tutorial !== undefined) s.tutorial = action.tutorial;
      break;
  }
  s.revision++;
  return s;
}
export function parseState(raw: string | null, now = Date.now()): State {
  if (!raw) return freshState(now);
  try {
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      !Number.isSafeInteger(s.balance) ||
      s.balance < 0 ||
      !Number.isSafeInteger(s.revision) ||
      !Array.isArray(s.history)
    )
      return freshState(now);
    if (
      s.round &&
      (!['playing', 'caught', 'won', 'lost'].includes(s.round.status) ||
        !['free', 'paid'].includes(s.round.mode) ||
        !Number.isInteger(s.round.step) ||
        s.round.step < 0 ||
        s.round.step > 120 ||
        !Number.isSafeInteger(s.round.payout) ||
        s.round.payout < 0)
    )
      s.round = null;
    return { ...freshState(now), ...s, history: s.history.slice(0, 100) };
  } catch {
    return freshState(now);
  }
}
