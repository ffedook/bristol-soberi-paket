import {
  boosterNames,
  boosterQuote,
  type BoosterKind,
  type Round,
  type Action,
} from './engine';
import { tapsText } from './copy';
export function BoosterIcon({ kind }: { kind: BoosterKind }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      {kind === 'shield' ? (
        <>
          <path
            d="M16 3 27 7v8c0 7-6 12-11 14C11 27 5 22 5 15V7L16 3Z"
            fill="currentColor"
            fillOpacity=".18"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="m11 16 3 3 7-8"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <ellipse
            cx="16"
            cy="24"
            rx="12"
            ry="4"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M5 23V16a11 11 0 0 1 22 0v7"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="m16 9 1.8 4.2L22 15l-4.2 1.8L16 21l-1.8-4.2L10 15l4.2-1.8L16 9Z"
            fill="currentColor"
          />
        </>
      )}
    </svg>
  );
}
export function Boosters({
  round,
  balance,
  onBuy,
  onHelp,
}: {
  round: Round;
  balance: number;
  onBuy: (a: Action) => void;
  onHelp: () => void;
}) {
  const active = round.activeBooster;
  return (
    <section className="boosters" aria-label="Бустеры">
      <div className="booster-heading">
        <span>
          {active
            ? `${boosterNames[active.kind]} · ещё ${tapsText(active.tapsLeft)}`
            : 'Бустеры за монеты'}
        </span>
        <button
          className="booster-help"
          onClick={onHelp}
          aria-label="Как работают бустеры"
        >
          ?
        </button>
      </div>
      <div className="booster-options">
        {(['shield', 'safe'] as const).map((kind) => {
          const quote = boosterQuote(round, kind),
            used = round.usedBoosters?.includes(kind),
            enabled = active?.kind === kind;
          const unavailable =
            round.status !== 'playing' ||
            !!active ||
            used ||
            balance < quote.price;
          const detail =
            kind === 'shield'
              ? `От 1 кражи · ${tapsText(quote.taps)}`
              : `${tapsText(quote.taps)} без кражи`;
          return (
            <button
              key={kind}
              className={`booster-card ${kind}${enabled ? ' active' : ''}`}
              disabled={unavailable}
              aria-label={`${boosterNames[kind]}. ${enabled ? 'Активен' : used ? 'Использован' : detail + '. Купить за ' + quote.price + ' монет'}`}
              onClick={() =>
                onBuy({
                  type: 'boost',
                  kind,
                  atStep: round.step,
                  price: quote.price,
                })
              }
            >
              <BoosterIcon kind={kind} />
              <span className="booster-copy">
                <strong>{boosterNames[kind]}</strong>
                <small>
                  {enabled
                    ? 'Защита включена'
                    : used
                      ? 'Использован в раунде'
                      : detail}
                </small>
              </span>
              <span className="booster-price">
                {enabled ? (
                  '✓'
                ) : used ? (
                  '—'
                ) : (
                  <>
                    {quote.price}
                    <small>монет</small>
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
