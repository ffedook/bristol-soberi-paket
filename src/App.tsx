import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useGame } from './store';
import {
  canFree,
  ENTRY,
  REPEL,
  MAX_TAPS,
  type Mode,
  type Action,
} from './engine';
import { Effects, emitEffect } from './Effects';
import { sound, vibrate, unlockAudio } from './audio';
const art = (n: string) => import.meta.env.BASE_URL + 'art/' + n;
const fmt = (v: number) => v.toLocaleString('ru-RU');
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
function Coin({ className = '' }: { className?: string }) {
  return (
    <img
      className={'coin ' + className}
      src={art('coin.webp')}
      alt="монет"
      draggable="false"
    />
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useEffectEvent(() => onClose?.());
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    const el = ref.current;
    el?.querySelector<HTMLElement>('button')?.focus();
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
      if (e.key === 'Tab' && el) {
        const list = [
          ...el.querySelectorAll<HTMLElement>('button:not(:disabled),a,input'),
        ];
        const first = list[0],
          last = list.at(-1);
        if (!first) {
          e.preventDefault();
          return;
        }
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('keydown', keys);
      old?.focus();
    };
  }, []);
  return (
    <div className="overlay">
      <section
        className="dialog"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {onClose && (
          <button
            className="dialog-close icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <img src={art('close.svg')} alt="" />
          </button>
        )}
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}
export default function App() {
  const { state, dispatch, storageError } = useGame();
  const r = state.round;
  const [mode, setMode] = useState<Mode>('free'),
    [modal, setModal] = useState<string | null>(null);
  const [scene, setScene] = useState(''),
    [resultReady, setResultReady] = useState(false),
    [toast, setToast] = useState('');
  const [reduced, setReduced] = useState(
    matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [offlineReady, setOfflineReady] = useState(false);
  useEffect(() => {
    let active = true;
    if ('serviceWorker' in navigator)
      void navigator.serviceWorker.ready.then(() => {
        if (active) setOfflineReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const [online, setOnline] = useState(navigator.onLine),
    [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(
    matchMedia('(display-mode: standalone)').matches,
  );
  const [, setDayTick] = useState(0);
  const bag = useRef<HTMLButtonElement>(null),
    shell = useRef<HTMLDivElement>(null);
  const roundId = r?.id,
    roundStatus = r?.status;
  const previousRound = useRef({ id: roundId, status: roundStatus });
  const freeAvailable = canFree(state),
    effectiveMode = mode === 'free' && !freeAvailable ? 'paid' : mode;
  const active = !!r;

  const tier =
    r && r.step >= 90 ? 'high' : r && r.step >= 45 ? 'medium' : 'low';
  const showResult = !!r && r.status !== 'playing' && resultReady;
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const f = () => setReduced(q.matches);
    q.addEventListener('change', f);
    return () => q.removeEventListener('change', f);
  }, []);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine),
      prompt = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e as InstallPrompt);
      },
      installed = () => {
        setInstalled(true);
        setInstallPrompt(null);
      };
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    window.addEventListener('beforeinstallprompt', prompt);
    window.addEventListener('appinstalled', installed);
    const timer = setInterval(() => setDayTick((x) => x + 1), 30000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
      window.removeEventListener('beforeinstallprompt', prompt);
      window.removeEventListener('appinstalled', installed);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const previous = previousRound.current;
    previousRound.current = { id: roundId, status: roundStatus };
    setResultReady(false);
    if (roundId && roundStatus !== 'playing') setModal(null);
    if (previous.id !== roundId) setModal(null);
    if (
      roundStatus === 'lost' &&
      previous.id === roundId &&
      previous.status === 'caught'
    ) {
      setScene('');
      setResultReady(true);
      return;
    }
    if (!roundId) {
      setScene('');
      return;
    }
    if (roundStatus === 'caught' || roundStatus === 'lost') {
      setScene('theft');
      const t = setTimeout(
        () => {
          setScene('');
          setResultReady(true);
        },
        reduced ? 150 : 1550,
      );
      return () => clearTimeout(t);
    }
    if (roundStatus === 'won') {
      setScene('celebrate');
      const t = setTimeout(
        () => {
          setScene('');
          setResultReady(true);
        },
        reduced ? 100 : 650,
      );
      return () => clearTimeout(t);
    }
    setScene('');
  }, [roundId, roundStatus, reduced]);
  const effectPoint = () => {
    const rect = shell.current?.getBoundingClientRect();
    return { x: (rect?.width ?? 428) / 2, y: (rect?.height ?? 820) * 0.58 };
  };
  async function act(a: Action) {
    if (state.sound || (a.type === 'settings' && a.sound)) unlockAudio();
    const { before, after } = await dispatch(a);
    if (after === before) return;
    if (a.type === 'tap') {
      if (after.round?.status === 'caught' || after.round?.status === 'lost') {
        if (state.sound) sound('danger');
        if (state.haptics) vibrate([50, 60, 100]);
      } else {
        const gain = (after.round?.payout ?? 0) - (before.round?.payout ?? 0);
        if (state.sound) sound('tap', after.round?.step);
        if (state.haptics) vibrate(10);
        emitEffect({
          kind: 'tap',
          ...effectPoint(),
          amount: gain,
          progress: after.round?.step,
        });
        if (bag.current && !reduced) {
          bag.current.getAnimations().forEach((a) => a.cancel());
          bag.current.animate(
            [
              { transform: 'scale(.93,1.04) rotate(-2deg)' },
              { transform: 'scale(1.06,.96) rotate(1deg)' },
              { transform: 'scale(1) rotate(0deg)' },
            ],
            { duration: 270, easing: 'cubic-bezier(.2,.8,.3,1)' },
          );
        }
      }
    }
    if (after.round?.status === 'won' && before.round?.status !== 'won') {
      if (state.sound) sound('win');
      if (state.haptics) vibrate([20, 40, 30]);
      emitEffect({ kind: 'win', ...effectPoint() });
    }
    if (a.type === 'repel') {
      if (state.sound) sound('repel');
      if (state.haptics) vibrate([30, 30, 60]);
      emitEffect({ kind: 'repel', ...effectPoint() });
      setToast('Белка убежала. Продолжай!');
    }
  }
  async function start() {
    if (effectiveMode === 'paid' && state.balance < ENTRY) {
      setModal('empty');
      return;
    }
    await act({ type: 'start', mode: effectiveMode });
    setModal(null);
  }
  async function install() {
    if (installPrompt) {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } else setModal('install');
  }
  function tap() {
    if (r?.status === 'playing') void act({ type: 'tap' });
  }
  const closeModal = () => setModal(null);
  return (
    <div className="desktop">
      <div className="ambient" aria-hidden="true" />
      <div
        className={
          'game-shell ' +
          (active ? 'in-game ' : '') +
          'risk-' +
          tier +
          ' scene-' +
          scene
        }
        ref={shell}
        data-testid="game"
        data-status={r?.status ?? 'home'}
      >
        <div
          className={'background ' + (active ? 'core' : 'home')}
          aria-hidden="true"
        />
        <div className="top-shade" aria-hidden="true" />
        <main
          className="surface"
          inert={!!modal || (!!r && r.status !== 'playing')}
        >
          <header className="topbar">
            <div className="top-actions">
              <button
                className="icon-button"
                aria-label={active ? 'Выйти из раунда' : 'Настройки'}
                onClick={() => setModal(active ? 'exit' : 'settings')}
                disabled={!!r && r.status !== 'playing'}
              >
                {active ? (
                  <span className="back-icon">‹</span>
                ) : (
                  <span className="menu-icon">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
              <button
                className={
                  'icon-button sound-button ' + (!state.sound ? 'muted' : '')
                }
                aria-label={state.sound ? 'Выключить звук' : 'Включить звук'}
                onClick={() =>
                  void act({ type: 'settings', sound: !state.sound })
                }
              >
                <img src={art('sound.svg')} alt="" />
              </button>
            </div>
            <button
              className="wallet"
              onClick={() => setModal('history')}
              aria-label={'Баланс ' + fmt(state.balance) + ' монет. История'}
            >
              <span>{fmt(state.balance)}</span>
              <Coin />
            </button>
            <button
              className="icon-button"
              aria-label="Правила игры"
              onClick={() => setModal('rules')}
            >
              <img className="help-icon" src={art('help.svg')} alt="" />
            </button>
          </header>
          {!online && <div className="offline-note">Игра работает офлайн</div>}
          {!active ? (
            <>
              <div className="home-banner">
                <img src={art('bag.webp')} alt="" draggable="false" />
                <div>
                  <h1>
                    Собери
                    <br />
                    пакет!
                  </h1>
                  <p>
                    Ещё тап или забрать?
                    <br />
                    Решать тебе.
                  </p>
                </div>
              </div>
              <div className="home-footer">
                <div
                  className="mode-switch"
                  role="group"
                  aria-label="Выбор попытки"
                >
                  <button
                    className={effectiveMode === 'free' ? 'selected' : ''}
                    disabled={!freeAvailable}
                    onClick={() => setMode('free')}
                  >
                    Бесплатная
                    <small>
                      {freeAvailable ? 'Доступна сегодня' : 'Завтра — снова'}
                    </small>
                  </button>
                  <button
                    className={effectiveMode === 'paid' ? 'selected' : ''}
                    onClick={() => setMode('paid')}
                  >
                    За 100 монет<small>До 5 000 монет</small>
                  </button>
                </div>
                <button
                  className="play-button red-button"
                  onClick={() => void start()}
                >
                  ИГРАТЬ
                  <span className="cost-badge">
                    {effectiveMode === 'free' ? (
                      'БЕСПЛАТНО'
                    ) : (
                      <>
                        100 <Coin />
                      </>
                    )}
                  </span>
                </button>
                <p className="home-caption">
                  {effectiveMode === 'free'
                    ? 'Одна попытка в день · до 2 350 монет'
                    : 'Рискни сотней. Забери больше.'}
                </p>
                <div className="home-links">
                  <button onClick={() => setModal('rules')}>Как играть</button>
                  <span>·</span>
                  <button
                    onClick={() =>
                      installed ? setModal('settings') : void install()
                    }
                  >
                    {installed ? 'Настройки' : 'На главный экран'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <section className="scoreboard" aria-label="Текущий раунд">
                <p className="game-prompt">
                  {r.status === 'playing'
                    ? 'Накликай максимум монет!'
                    : scene === 'theft'
                      ? 'Кажется, у нас гость…'
                      : 'Собери пакет'}
                </p>
                <div className="score" key={r.step}>
                  <span>
                    {fmt(r.status === 'lost' ? r.lostAmount : r.payout)}
                  </span>
                  <Coin />
                </div>
                <div className="step-row">
                  <span>
                    {r.step}{' '}
                    <span className="step-muted">/ {MAX_TAPS} тапов</span>
                  </span>
                  <span className="mode-label">
                    {r.mode === 'free' ? 'Бесплатная игра' : 'Платная игра'}
                  </span>
                </div>
                <div
                  className="progress-track"
                  aria-label={'Прогресс ' + r.step + ' из 120'}
                >
                  <span style={{ width: (r.step / 120) * 100 + '%' }} />
                </div>
                <div className={'risk-label ' + tier}>
                  <span className="risk-dot" />
                  {tier === 'high'
                    ? 'ВЫСОКИЙ РИСК'
                    : tier === 'medium'
                      ? 'БЕЛКА ВСЁ БЛИЖЕ'
                      : 'НЕ ТЕРЯЙ БДИТЕЛЬНОСТЬ'}
                </div>
              </section>
              <div className="bag-stage">
                <div className="bag-halo" aria-hidden="true" />
                <img className="bag-shadow" src={art('shadow.svg')} alt="" />
                <button
                  ref={bag}
                  className={
                    'bag-button ' +
                    (['caught', 'lost'].includes(r.status) ? 'caught-bag' : '')
                  }
                  aria-label="Нажать на пакет"
                  disabled={r.status !== 'playing'}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    tap();
                  }}
                  onClick={(e) => {
                    if (e.detail === 0) tap();
                  }}
                  onKeyDown={(e) => {
                    if (e.repeat) e.preventDefault();
                  }}
                >
                  <img
                    className="bag-character"
                    src={art('bag.webp')}
                    alt="Красный пакет Бристоль"
                    draggable="false"
                  />
                </button>
                {r.step === 0 && r.status === 'playing' && (
                  <span className="tap-hint">Тапай по пакету</span>
                )}
                <img
                  className="stealing-squirrel"
                  src={art('squirrel.webp')}
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="stealing-paw"
                  src={art('paw.webp')}
                  alt=""
                  aria-hidden="true"
                />
                <img
                  className="running-thief"
                  src={art('thief.webp')}
                  alt=""
                  aria-hidden="true"
                />
                <div className="steal-dust" aria-hidden="true" />
              </div>
              <div className="game-footer">
                <button
                  className="cashout-button silver-button"
                  disabled={r.status !== 'playing' || r.step === 0}
                  onClick={() => void act({ type: 'cashout' })}
                >
                  ЗАБРАТЬ МОНЕТЫ
                </button>
                <p className="footer-note">
                  {r.status === 'playing'
                    ? r.step === 0
                      ? 'Первый тап — и игра началась'
                      : r.repelled
                        ? 'Белка вернётся — второго отгона не будет'
                        : 'Можно забрать выигрыш прямо сейчас'
                    : 'Белка добежала до пакета'}
                </p>
              </div>
            </>
          )}
          <div className="bottom-safe" aria-hidden="true" />
        </main>
        <Effects reduced={reduced} />
        {showResult && r && (
          <Dialog
            title={
              r.status === 'caught'
                ? 'Белка схватила пакет!'
                : r.status === 'won'
                  ? r.step === MAX_TAPS
                    ? 'Весь пакет твой!'
                    : 'Монеты твои!'
                  : 'Белка оказалась быстрее'
            }
          >
            <img
              className="result-art"
              src={art(
                r.status === 'won'
                  ? 'coins.webp'
                  : r.status === 'caught'
                    ? 'squirrel.webp'
                    : 'thief.webp',
              )}
              alt=""
            />
            {r.status === 'caught' ? (
              <>
                <p className="dialog-copy">
                  Отгони её, чтобы сохранить пакет. Неудачный тап придётся
                  повторить.
                </p>
                <div className="at-stake">
                  <span>В пакете</span>
                  <strong>
                    {fmt(r.payout)} <Coin />
                  </strong>
                </div>
                <button
                  className="red-button action-button"
                  disabled={state.balance < REPEL}
                  onClick={() => void act({ type: 'repel' })}
                >
                  ОТОГНАТЬ ЗА 100 <Coin />
                </button>
                {state.balance < REPEL ? (
                  <p className="small-copy">
                    Для отгона не хватает {fmt(REPEL - state.balance)} монет.
                  </p>
                ) : (
                  <p className="small-copy">Только один раз за раунд</p>
                )}
                <button
                  className="text-button"
                  onClick={() => void act({ type: 'forfeit' })}
                >
                  Отпустить пакет
                </button>
              </>
            ) : r.status === 'won' ? (
              <>
                <div className="result-amount">
                  +{fmt(r.payout)} <Coin />
                </div>
                <p className="dialog-copy">
                  Забрал вовремя!
                  <br />
                  {r.step} {r.step === 1 ? 'тап' : 'тапов'} — и монеты на
                  балансе.
                </p>
                <div className="receipt">
                  <span>Баланс</span>
                  <strong>
                    {fmt(state.balance)} <Coin />
                  </strong>
                </div>
                <button
                  className="red-button action-button"
                  onClick={() => void act({ type: 'dismiss' })}
                >
                  ДАЛЬШЕ
                </button>
              </>
            ) : (
              <>
                <p className="dialog-copy">
                  Незабранные {fmt(r.lostAmount)} монет
                  <br />
                  остались в пакете.
                </p>
                <div className="receipt">
                  <span>Баланс</span>
                  <strong>
                    {fmt(state.balance)} <Coin />
                  </strong>
                </div>
                <button
                  className="red-button action-button"
                  onClick={() => void act({ type: 'dismiss' })}
                >
                  НА ГЛАВНУЮ
                </button>
                <p className="small-copy">Каждый раунд — новая история</p>
              </>
            )}
          </Dialog>
        )}
        {modal === 'rules' && (
          <Dialog title="Ещё тап или забрать?" onClose={closeModal}>
            <img className="rules-art" src={art('bag.webp')} alt="" />
            <ol className="rules-list">
              <li>
                <b>Тапай по пакету.</b> Каждый успешный тап увеличивает выигрыш.
                Всего 120 шагов.
              </li>
              <li>
                <b>Забирай вовремя.</b> Нажми «Забрать монеты», чтобы перевести
                их на баланс.
              </li>
              <li>
                <b>Берегись белки.</b> Она может прийти на любом тапе. За 100
                монет можно один раз отогнать её и повторить неудачный тап.
              </li>
            </ol>
            <div className="rules-economy">
              <p>
                <b>Бесплатно:</b> раз в день, до 2 350 монет.
              </p>
              <p>
                <b>За 100 монет:</b> до 5 000 монет.
              </p>
              <p>
                Риск растёт с 2,62% до 15,32% на тап. Исход определяется при
                нажатии; анимация показывает уже случившееся событие.
              </p>
            </div>
            <p className="small-copy">
              Монеты только игровые. Обмена на деньги и реальные призы нет.
              Прогресс сохраняется в этом браузере. Бесплатная попытка
              обновляется в 00:00 по Москве.
            </p>
            <button
              className="red-button action-button"
              onClick={() => {
                closeModal();
                void act({ type: 'settings', tutorial: true });
              }}
            >
              ПОНЯТНО
            </button>
          </Dialog>
        )}
        {modal === 'history' && (
          <Dialog title="Мои монеты" onClose={closeModal}>
            <div className="history-balance">
              {fmt(state.balance)} <Coin />
            </div>
            <p className="small-copy">
              Лучший выигрыш: {fmt(state.best)} · Игр: {state.games}
            </p>
            <div className="history-list">
              {state.history.map((e, i) => (
                <div className="history-row" key={e.id + i}>
                  <div>
                    <b>{e.label}</b>
                    <small>
                      {new Date(e.at).toLocaleString('ru-RU', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                  </div>
                  <strong
                    className={
                      e.amount > 0 ? 'positive' : e.amount < 0 ? 'negative' : ''
                    }
                  >
                    {e.amount > 0 ? '+' : ''}
                    {fmt(e.amount)}
                  </strong>
                </div>
              ))}
            </div>
            <p className="small-copy">Последние 100 игровых операций</p>
          </Dialog>
        )}
        {modal === 'settings' && (
          <Dialog title="Настройки" onClose={closeModal}>
            <div className="setting-row">
              <span>Звук</span>
              <button
                role="switch"
                aria-checked={state.sound}
                aria-label="Звук"
                className={'switch ' + (state.sound ? 'on' : '')}
                onClick={() =>
                  void act({ type: 'settings', sound: !state.sound })
                }
              >
                <i />
              </button>
            </div>
            <div className="setting-row">
              <span>Вибрация</span>
              <button
                role="switch"
                aria-checked={state.haptics}
                aria-label="Вибрация"
                className={'switch ' + (state.haptics ? 'on' : '')}
                onClick={() => {
                  void act({ type: 'settings', haptics: !state.haptics });
                  if (!state.haptics) vibrate(20);
                }}
              >
                <i />
              </button>
            </div>
            <p className="small-copy">
              Вибрация доступна на поддерживаемых устройствах. Уменьшение
              движения учитывает настройки телефона.
            </p>
            <button
              className="silver-button action-button"
              onClick={() => void install()}
            >
              {installed ? 'ПРИЛОЖЕНИЕ УСТАНОВЛЕНО' : 'УСТАНОВИТЬ ИГРУ'}
            </button>
            <p className="small-copy">
              Прогресс хранится на этом устройстве. Если очистить данные
              браузера, он будет потерян.
            </p>
          </Dialog>
        )}
        {modal === 'install' && (
          <Dialog title="Играй как в приложении" onClose={closeModal}>
            <img className="rules-art" src={art('bag.webp')} alt="" />
            <p className="dialog-copy">
              Добавь игру на главный экран — она откроется в отдельном окне и
              будет работать офлайн.
            </p>
            <div className="rules-economy">
              <p>
                <b>На iPhone</b>
                <br />В Safari нажми «Поделиться», затем «На экран Домой».
              </p>
              <p>
                <b>На Android</b>
                <br />В меню Chrome выбери «Установить приложение» или «Добавить
                на главный экран».
              </p>
            </div>
            <p className="small-copy">
              {offlineReady
                ? 'Офлайн-режим готов — игра загружена на устройство.'
                : 'Для офлайн-режима открой игру в Safari или Chrome и дождись полной загрузки.'}
            </p>
            <button className="red-button action-button" onClick={closeModal}>
              ПОНЯТНО
            </button>
          </Dialog>
        )}
        {modal === 'empty' && (
          <Dialog title="Монеты закончились" onClose={closeModal}>
            <img className="rules-art" src={art('coins.webp')} alt="" />
            <p className="dialog-copy">
              {freeAvailable
                ? 'Бесплатная попытка уже ждёт. Попробуй пополнить баланс!'
                : 'Новая бесплатная попытка появится в 00:00 по Москве.'}
            </p>
            {freeAvailable && (
              <button
                className="red-button action-button"
                onClick={() => {
                  void act({ type: 'start', mode: 'free' });
                  closeModal();
                }}
              >
                ИГРАТЬ БЕСПЛАТНО
              </button>
            )}
            <button className="text-button" onClick={closeModal}>
              На главную
            </button>
          </Dialog>
        )}
        {modal === 'exit' && (
          <Dialog title="Завершить раунд?" onClose={closeModal}>
            <p className="dialog-copy">
              {r?.step
                ? 'Можешь забрать все накопленные монеты и вернуться на главную.'
                : 'Ты ещё не сделал первый тап. При выходе стоимость платной попытки не возвращается.'}
            </p>
            {!!r?.step && (
              <button
                className="red-button action-button"
                onClick={() => {
                  void act({ type: 'cashout' });
                  closeModal();
                }}
              >
                ЗАБРАТЬ {fmt(r.payout)} <Coin />
              </button>
            )}
            <button
              className="silver-button action-button"
              onClick={closeModal}
            >
              ПРОДОЛЖИТЬ ИГРУ
            </button>
            {!r?.step && (
              <button
                className="text-button"
                onClick={() => {
                  void act({ type: 'forfeit' });
                  closeModal();
                }}
              >
                Закончить попытку
              </button>
            )}
          </Dialog>
        )}
        {(toast || storageError) && (
          <div className="toast" role="status">
            {storageError
              ? 'Браузер не сохраняет прогресс. Не закрывай игру.'
              : toast}
          </div>
        )}
      </div>
      <footer className="desktop-caption">
        <b>Собери пакет</b>
        <span>Игровые монеты · играй в своём темпе</span>
      </footer>
    </div>
  );
}
