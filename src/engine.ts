import { tapsText } from './copy.ts';
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
export type BoosterKind = 'shield' | 'safe';
export const boosterNames = { shield: 'Щит', safe: 'Безопасная зона' };
export const BOOSTER_LIMIT = 3;
export const SAFE_DURATION_MS = 3_000;
export const BLOCK_ANIMATION_MS = 2800;
export type ActiveBooster = {
  kind: BoosterKind;
  expiresAt?: number;
  tapsLeft?: number;
};
export type Round = {
  id: string;
  mode: Mode;
  step: number;
  payout: number;
  spent: number;
  repelled: boolean;
  status: 'playing' | 'caught' | 'won' | 'lost';
  lostAmount: number;
  activeBooster?: ActiveBooster | null;
  boosterPurchases?: Partial<Record<BoosterKind, number>>;
  blockUntil?: number;
  lastBlockedAt?: number;
  lastBlockedKind?: BoosterKind;
  usedBoosters?: BoosterKind[];
  blockedSteals?: number;
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
  | { type: 'boost'; kind: BoosterKind; atStep: number; price: number }
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
export function activeBooster(
  round: Round,
  now = Date.now(),
): ActiveBooster | null {
  const a = round.activeBooster;
  if (!a || round.status !== 'playing') return null;
  if (a.kind === 'shield') return a;
  if (a.expiresAt !== undefined) return now < a.expiresAt ? a : null;
  // Finish already purchased v1.2 zones under their original three-press rule.
  return (a.tapsLeft ?? 0) > 0 ? a : null;
}
export function boosterUses(round: Round, kind: BoosterKind) {
  return (
    round.boosterPurchases?.[kind] ??
    (round.usedBoosters?.includes(kind) ? 1 : 0)
  );
}
/** Cost is based on the current stake, risk and purchase number; not an RTP claim. */
export function boosterQuote(round: Round, kind: BoosterKind) {
  const remaining = MAX_TAPS - round.step;
  if (remaining <= 0) return { price: 0 };
  let reach = 1,
    saved = 0;
  for (const row of balanceTable.slice(round.step)) {
    saved += reach * row.risk * row[round.mode];
    reach *= 1 - row.risk;
  }
  const uses = boosterUses(round, kind);
  // A shield saves the next theft. Timed protection allows many presses, so it costs more.
  const value = kind === 'shield' ? 15 + saved * 0.22 : 35 + saved * 0.42;
  return {
    price:
      Math.ceil(
        (Math.max(kind === 'shield' ? 35 : 60, value) * (1 + uses * 0.2)) / 5,
      ) * 5,
  };
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
      record('Выигрыш · ' + tapsText(r.step), r.payout);
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
        activeBooster: null,
        usedBoosters: [],
        blockedSteals: 0,
        boosterPurchases: { shield: 0, safe: 0 },
        blockUntil: 0,
      };
      s.games++;
      break;
    case 'boost': {
      if (
        !r ||
        r.status !== 'playing' ||
        r.step >= MAX_TAPS ||
        !['safe', 'shield'].includes(action.kind) ||
        activeBooster(r, now) ||
        now < (r.blockUntil ?? 0) ||
        boosterUses(r, action.kind) >= BOOSTER_LIMIT ||
        action.atStep !== r.step
      )
        return state;
      const quote = boosterQuote(r, action.kind);
      if (quote.price !== action.price || s.balance < quote.price) return state;
      record('Бустер · ' + boosterNames[action.kind], -quote.price);
      r.spent += quote.price;
      r.boosterPurchases = {
        shield: boosterUses(r, 'shield'),
        safe: boosterUses(r, 'safe'),
        [action.kind]: boosterUses(r, action.kind) + 1,
      };
      r.activeBooster =
        action.kind === 'shield'
          ? { kind: 'shield' }
          : { kind: 'safe', expiresAt: now + SAFE_DURATION_MS };
      break;
    }
    case 'tap': {
      if (
        !r ||
        r.status !== 'playing' ||
        r.step >= MAX_TAPS ||
        now < (r.blockUntil ?? 0)
      )
        return state;
      const theft = random < balanceTable[r.step].risk;
      const active = activeBooster(r, now);
      const protectedTap = !!active;
      r.activeBooster = active;
      if (
        active?.kind === 'safe' &&
        active.expiresAt === undefined &&
        active.tapsLeft !== undefined
      ) {
        active.tapsLeft--;
        if (active.tapsLeft <= 0) r.activeBooster = null;
      }
      if (theft && active) {
        r.blockedSteals = (r.blockedSteals ?? 0) + 1;
        r.lastBlockedAt = now;
        r.lastBlockedKind = active.kind;
        r.blockUntil = now + BLOCK_ANIMATION_MS;
        if (active.kind === 'shield') r.activeBooster = null;
      }
      if (theft && !protectedTap) {
        if (r.repelled) finish(false);
        else r.status = 'caught';
      } else {
        r.step++;
        r.payout = balanceTable[r.step - 1][r.mode];
        if (r.step === MAX_TAPS) finish(true);
      }
      break;
    }
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
    if (s.round) {
      const r = s.round;
      r.usedBoosters = Array.isArray(r.usedBoosters)
        ? [
            ...new Set(
              r.usedBoosters.filter((k: string) =>
                ['safe', 'shield'].includes(k),
              ),
            ),
          ]
        : [];
      r.blockedSteals =
        Number.isSafeInteger(r.blockedSteals) && r.blockedSteals >= 0
          ? r.blockedSteals
          : 0;
      const counts = r.boosterPurchases ?? {};
      r.boosterPurchases = Object.fromEntries(
        (['shield', 'safe'] as const).map((kind) => [
          kind,
          Number.isInteger(counts[kind])
            ? Math.max(0, Math.min(BOOSTER_LIMIT, counts[kind]))
            : r.usedBoosters.includes(kind)
              ? 1
              : 0,
        ]),
      );
      const a = r.activeBooster;
      r.activeBooster =
        a?.kind === 'shield'
          ? { kind: 'shield' }
          : a?.kind === 'safe' &&
              Number.isFinite(a.expiresAt) &&
              a.expiresAt > now
            ? { kind: 'safe', expiresAt: a.expiresAt }
            : a?.kind === 'safe' &&
                a.expiresAt === undefined &&
                Number.isInteger(a.tapsLeft) &&
                a.tapsLeft > 0 &&
                a.tapsLeft <= 3
              ? { kind: 'safe', tapsLeft: a.tapsLeft }
              : null;
      if (r.activeBooster)
        r.boosterPurchases[r.activeBooster.kind] = Math.max(
          1,
          r.boosterPurchases[r.activeBooster.kind],
        );
      r.blockUntil = Number.isFinite(r.blockUntil) ? r.blockUntil : 0;
      if (!Number.isFinite(r.lastBlockedAt)) delete r.lastBlockedAt;
      if (!['shield', 'safe'].includes(r.lastBlockedKind))
        delete r.lastBlockedKind;
    }
    return { ...freshState(now), ...s, history: s.history.slice(0, 100) };
  } catch {
    return freshState(now);
  }
}
