// Pixel confetti: a short burst of square specks when something is cleared
// (a learner finishes a lesson, a maker clears their own). Bump `burst` to
// fire it. Respects reduced motion.

import React from 'react';

const COLORS = ['#e05555', '#f0c050', '#9bb070', '#6dbcdb', '#d4541e', '#e6e1d4', '#b07ad4'];
const DURATION = 1700;

export function Confetti({ burst }: { burst: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const [live, setLive] = React.useState(false);

  React.useEffect(() => {
    if (!burst) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    setLive(true);
  }, [burst]);

  React.useEffect(() => {
    if (!live) return;
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const specks = Array.from({ length: 140 }, () => ({
      x: c.width * (0.3 + Math.random() * 0.4),
      y: c.height * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -6 - Math.random() * 10,
      size: 4 + Math.floor(Math.random() * 3) * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
    const t0 = performance.now();
    let raf = 0;
    const frame = (t: number) => {
      const age = t - t0;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - DURATION * 0.6) / (DURATION * 0.4));
      for (const s of specks) {
        s.vy += 0.45;
        s.vx *= 0.99;
        s.x += s.vx;
        s.y += s.vy;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x / 2) * 2, Math.round(s.y / 2) * 2, s.size, s.size);
      }
      if (age < DURATION) raf = requestAnimationFrame(frame);
      else setLive(false);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [live, burst]);

  if (!live) return null;
  return <canvas ref={ref} aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 200 }} />;
}
