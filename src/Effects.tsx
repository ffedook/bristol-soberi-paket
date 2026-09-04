import { useEffect, useRef } from 'react';
import { Application, Assets, Sprite, Text } from 'pixi.js';
export type Effect = {
  kind: 'tap' | 'win' | 'repel';
  x: number;
  y: number;
  amount?: number;
  progress?: number;
};
export const effectBus = new EventTarget();
export function emitEffect(effect: Effect) {
  effectBus.dispatchEvent(new CustomEvent('effect', { detail: effect }));
}
export function Effects({ reduced }: { reduced: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = host.current;
    if (!el || reduced) return;
    let disposed = false,
      app: Application | undefined,
      cleanup = () => {};
    void (async () => {
      try {
        const p = new Application();
        await p.init({
          resizeTo: el,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(devicePixelRatio, 2),
          autoDensity: true,
          preference: 'webgl',
        });
        if (disposed) {
          p.destroy(true);
          return;
        }
        app = p;
        el.appendChild(p.canvas);
        const names = ['coin', 'bottle', 'chips'];
        const textures = await Promise.all(
          names.map((n) =>
            Assets.load(import.meta.env.BASE_URL + 'art/' + n + '.webp'),
          ),
        );
        if (disposed) return;
        const particles: {
          node: Sprite | Text;
          vx: number;
          vy: number;
          age: number;
          life: number;
          spin: number;
          size: number;
          tx?: number;
          ty?: number;
          x0: number;
          y0: number;
        }[] = [];
        const receive = (event: Event) => {
          const e = (event as CustomEvent<Effect>).detail;
          const count = e.kind === 'tap' ? 5 : e.kind === 'win' ? 35 : 18;
          for (let i = 0; i < count; i++) {
            const t = new Sprite(
              textures[e.kind === 'tap' && i > 1 ? 1 + (i % 2) : 0],
            );
            t.anchor.set(0.5);
            const size =
              e.kind === 'tap'
                ? 20 + Math.random() * 24
                : 26 + Math.random() * 26;
            t.width = t.height = size;
            t.x = e.x;
            t.y = e.y;
            p.stage.addChild(t);
            particles.push({
              node: t,
              vx: (Math.random() - 0.5) * 350,
              vy: -180 - Math.random() * 220,
              age: 0,
              life:
                e.kind === 'win'
                  ? 1.15 + Math.random() * 0.5
                  : 0.65 + Math.random() * 0.35,
              spin: (Math.random() - 0.5) * 9,
              size,
              x0: e.x,
              y0: e.y,
              ...(e.kind === 'win' ? { tx: p.screen.width - 55, ty: 42 } : {}),
            });
          }
          if (e.kind === 'tap' && e.amount) {
            const text = new Text({
              text: '+' + e.amount,
              style: {
                fontFamily: 'Montserrat Variable',
                fontSize: 32,
                fontWeight: '800',
                fill: '#ffffff',
                stroke: { color: '#572317', width: 4 },
                dropShadow: { alpha: 0.2, blur: 2, distance: 2 },
              },
            });
            text.anchor.set(0.5);
            text.x = e.x;
            text.y = e.y - 45;
            p.stage.addChild(text);
            particles.push({
              node: text,
              vx: (Math.random() - 0.5) * 60,
              vy: -100,
              age: 0,
              life: 0.7,
              spin: 0,
              size: 0,
              x0: e.x,
              y0: e.y,
            });
          }
          while (particles.length > 160) {
            particles.shift()?.node.destroy();
          }
        };
        effectBus.addEventListener('effect', receive);
        cleanup = () => effectBus.removeEventListener('effect', receive);
        p.ticker.add((t) => {
          const dt = Math.min(t.deltaMS / 1000, 0.04);
          for (let i = particles.length - 1; i >= 0; i--) {
            const v = particles[i];
            v.age += dt;
            const f = v.age / v.life;
            if (f >= 1) {
              v.node.destroy();
              particles.splice(i, 1);
              continue;
            }
            if (v.tx !== undefined && f > 0.36) {
              const q = (f - 0.36) / 0.64;
              v.node.x += (v.tx - v.node.x) * q * 0.22;
              v.node.y += (v.ty! - v.node.y) * q * 0.22;
              v.node.alpha = Math.min(1, (1 - f) * 6);
            } else {
              v.node.x += v.vx * dt;
              v.node.y += v.vy * dt;
              v.vy += 460 * dt;
              v.node.alpha = Math.min(1, (1 - f) * 3);
            }
            v.node.rotation += v.spin * dt;
          }
        });
      } catch {
        /* The complete game remains available without decorative WebGL. */
      }
    })();
    return () => {
      disposed = true;
      cleanup();
      if (app) app.destroy(true, { children: true, texture: false });
    };
  }, [reduced]);
  return <div className="effects" ref={host} aria-hidden="true" />;
}
