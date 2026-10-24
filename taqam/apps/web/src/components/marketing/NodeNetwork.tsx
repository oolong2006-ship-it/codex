'use client';
import { useEffect, useRef } from 'react';

/** The brand's node-network texture: deterministic nodes, nearest links, one saffron node in ten. */
export function NodeNetwork({ className, line = '11,122,107', dot = '11,122,107', density = 9000, link = 130, seed = 7 }:
  { className?: string; line?: string; dot?: string; density?: number; link?: number; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    let pts: { x: number; y: number; p: number; hot: boolean }[] = []; let W = 0, H = 0, t = 0, raf = 0;
    const size = () => {
      const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      W = r.width; H = r.height; c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      s = seed; pts = Array.from({ length: Math.round((W * H) / density) }, () => ({ x: rnd() * W, y: rnd() * H, p: rnd() * 6.28, hot: rnd() < 0.1 }));
    };
    const pos = (q: { x: number; y: number; p: number }) => [q.x + Math.sin(t + q.p) * 5, q.y + Math.cos(t * 0.8 + q.p) * 5];
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pos(pts[i]);
        for (let j = i + 1; j < pts.length; j++) {
          const [bx, by] = pos(pts[j]); const dd = Math.hypot(ax - bx, ay - by);
          if (dd < link) { ctx.strokeStyle = `rgba(${line},${0.28 * (1 - dd / link)})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); }
        }
      }
      for (const q of pts) { const [x, y] = pos(q); ctx.fillStyle = q.hot ? '#FFB547' : `rgba(${dot},0.55)`; ctx.beginPath(); ctx.arc(x, y, q.hot ? 3.2 : 1.9, 0, 6.28); ctx.fill(); }
    };
    const loop = () => { t += 0.005; draw(); raf = requestAnimationFrame(loop); };
    size(); draw(); if (!reduce) raf = requestAnimationFrame(loop);
    const onResize = () => { size(); draw(); };
    window.addEventListener('resize', onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [line, dot, density, link, seed]);
  return <canvas ref={ref} aria-hidden className={className} />;
}
