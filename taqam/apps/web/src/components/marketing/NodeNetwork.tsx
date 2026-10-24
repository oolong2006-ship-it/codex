'use client';
import { useEffect, useRef } from 'react';

/** The brand's node-network texture: deterministic nodes, nearest links, one saffron node in ten. */
export function NodeNetwork({ className, line = '11,122,107', dot = '11,122,107', density = 9000, link = 130, seed = 7 }:
  { className?: string; line?: string; dot?: string; density?: number; link?: number; seed?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    let pts: { x: number; y: number; p: number; hot: boolean }[] = []; let W = 0, H = 0, t = 0, raf = 0, visible = true;
    const size = () => {
      const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      W = r.width; H = r.height; c.width = W * d; c.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
      s = seed; pts = Array.from({ length: Math.round((W * H) / density) }, () => ({ x: rnd() * W, y: rnd() * H, p: rnd() * 6.28, hot: rnd() < 0.1 }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      const xy = pts.map((q) => [q.x + Math.sin(t + q.p) * 5, q.y + Math.cos(t * 0.8 + q.p) * 5]);
      // Batch links into 4 opacity buckets: one stroke per bucket instead of one per link.
      const buckets: number[][] = [[], [], [], []];
      for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) {
        const dd = Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]);
        if (dd < link) buckets[Math.min(3, Math.floor((dd / link) * 4))].push(i, j);
      }
      ctx.lineWidth = 1;
      buckets.forEach((b, k) => {
        if (!b.length) return;
        ctx.strokeStyle = `rgba(${line},${0.28 * (1 - (k + 0.5) / 4)})`; ctx.beginPath();
        for (let n = 0; n < b.length; n += 2) { ctx.moveTo(xy[b[n]][0], xy[b[n]][1]); ctx.lineTo(xy[b[n + 1]][0], xy[b[n + 1]][1]); }
        ctx.stroke();
      });
      pts.forEach((q, i) => { ctx.fillStyle = q.hot ? '#FFB547' : `rgba(${dot},0.55)`; ctx.beginPath(); ctx.arc(xy[i][0], xy[i][1], q.hot ? 3.2 : 1.9, 0, 6.28); ctx.fill(); });
    };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const loop = () => { t += 0.005; draw(); raf = requestAnimationFrame(loop); };
    const sync = () => { stop(); if (visible && !motion?.matches && !document.hidden) raf = requestAnimationFrame(loop); else draw(); };
    size(); draw(); sync();
    const ro = new ResizeObserver(() => { size(); draw(); }); ro.observe(c);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }); io.observe(c);
    motion?.addEventListener?.('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => { stop(); ro.disconnect(); io.disconnect(); motion?.removeEventListener?.('change', sync); document.removeEventListener('visibilitychange', sync); };
  }, [line, dot, density, link, seed]);
  return <canvas ref={ref} aria-hidden className={className} />;
}
