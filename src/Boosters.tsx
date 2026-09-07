import {
  activeBooster,
  boosterNames,
  boosterQuote,
  boosterUses,
  BOOSTER_LIMIT,
  SAFE_DURATION_MS,
  type BoosterKind,
  type Round,
  type Action,
} from './engine';
import { tapsText } from './copy';
export function BoosterIcon({ kind }: { kind: BoosterKind }) {
  return (
    <img
      className="booster-art"
      src={
        import.meta.env.BASE_URL +
        'art/booster-' +
        (kind === 'shield' ? 'shield' : 'timer') +
        '.webp'
      }
      alt=""
      draggable={false}
    />
  );
}
export function Boosters({
  round,
  balance,
  now,
  onBuy,
  onHelp,
}: {
  round: Round;
  balance: number;
  now: number;
  onBuy: (a: Action) => void;
  onHelp: () => void;
}) {
  const active = activeBooster(round, now);
  const seconds = active?.expiresAt
    ? Math.max(0, Math.ceil((active.expiresAt - now) / 1000))
    : 0;
  const busy = now < (round.blockUntil ?? 0);
  return (
    <section className="boosters" aria-label="Бустеры">
      <div className="booster-heading">
        <span>
          {busy
            ? 'Белка не пройдёт!'
            : active
              ? active.kind === 'shield'
                ? 'Щит готов · до одной кражи'
                : active.expiresAt
                  ? `Безопасная зона · ${seconds} сек.`
                  : `Защита · ещё ${tapsText(active.tapsLeft ?? 0)}`
              : 'Усиль свой пакет'}
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
            uses = boosterUses(round, kind),
            selected = active?.kind === kind,
            exhausted = uses >= BOOSTER_LIMIT;
          const unavailable =
            round.status !== 'playing' ||
            !!active ||
            busy ||
            exhausted ||
            balance < quote.price;
          const detail =
            kind === 'shield' ? 'Блокирует одну кражу' : '3 секунды без кражи';
          const status = selected
            ? kind === 'safe' && active.expiresAt
              ? `${seconds} сек`
              : 'Включён'
            : exhausted
              ? 'Лимит за раунд'
              : 'За ' + quote.price + ' монет';
          return (
            <button
              key={kind}
              className={`booster-card ${kind}${selected ? ' active' : ''}${exhausted && !selected ? ' exhausted' : ''}`}
              disabled={unavailable}
              aria-label={`${boosterNames[kind]}. ${detail}. ${status}. Куплено ${uses} из ${BOOSTER_LIMIT}`}
              onClick={() =>
                onBuy({
                  type: 'boost',
                  kind,
                  atStep: round.step,
                  price: quote.price,
                })
              }
            >
              <div className="booster-medallion">
                <BoosterIcon kind={kind} />
              </div>
              <span className="booster-copy">
                <strong>{kind === 'shield' ? 'Щит' : 'Сейф-зона'}</strong>
                <small>{detail}</small>
              </span>
              <span className="booster-slots" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <i key={i} className={i < uses ? 'spent' : ''} />
                ))}
              </span>
              <span className="booster-price">
                {selected ? (
                  kind === 'safe' && active.expiresAt ? (
                    <>
                      <b>{seconds}</b>
                      <small>сек.</small>
                    </>
                  ) : (
                    'АКТИВЕН'
                  )
                ) : exhausted ? (
                  '3 / 3'
                ) : (
                  <>
                    <img
                      src={import.meta.env.BASE_URL + 'art/coin.webp'}
                      alt=""
                    />
                    {quote.price}
                  </>
                )}
              </span>
              {selected && active.expiresAt && (
                <span className="booster-time-track" aria-hidden="true">
                  <i
                    style={{
                      transform: `scaleX(${Math.max(0, (active.expiresAt - now) / SAFE_DURATION_MS)})`,
                    }}
                  />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
