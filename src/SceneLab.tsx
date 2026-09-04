import { useState } from 'react';
import Scene3D from './Scene3D';
import { sceneBeat } from './motion';
import type { Round } from './engine';
/** Imported only by Vite dev mode; never included in the deployed application. */
export default function SceneLab() {
  const [status, setStatus] = useState<Round['status']>('playing'),
    [step, setStep] = useState(0),
    [id, setId] = useState(0),
    [time, setTime] = useState<number | undefined>(),
    [ready, setReady] = useState(false);
  return (
    <div style={{ padding: 20, color: 'white', fontFamily: 'Arial' }}>
      <p>Проверка 3D · {ready ? 'готово' : 'загрузка'}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          [0, 'Спокойный'],
          [60, 'Тревога'],
          [105, 'Паника'],
        ].map(([s, label]) => (
          <button
            key={s}
            onClick={() => {
              setStep(Number(s));
              setStatus('playing');
              setTime(undefined);
            }}
          >
            {label}
          </button>
        ))}
        <button onClick={() => sceneBeat({ kind: 'tap' })}>Тап</button>
        <button
          onClick={() => {
            setId((x) => x + 1);
            setStatus('caught');
            setTime(undefined);
          }}
        >
          Кража целиком
        </button>
        {[
          [0.5, 'Подкралась'],
          [1.8, 'Схватила'],
          [2.35, 'Убегает'],
        ].map(([s, label]) => (
          <button
            key={s}
            onClick={() => {
              setStatus('caught');
              setTime(Number(s));
            }}
          >
            {label}
          </button>
        ))}
        <button
          onClick={() => {
            setId((x) => x + 1);
            setStatus('won');
            setTime(undefined);
          }}
        >
          Победа
        </button>
      </div>
      <div
        className="game-shell in-game"
        style={{
          width: 420,
          maxWidth: '100%',
          height: 580,
          minHeight: 0,
          marginTop: 20,
        }}
      >
        <div className="background core" />
        <div style={{ position: 'absolute', inset: 0 }}>
          <Scene3D
            roundId={String(id)}
            step={step}
            status={status}
            reduced={false}
            previewTime={time}
            onReady={setReady}
          />
        </div>
      </div>
    </div>
  );
}
