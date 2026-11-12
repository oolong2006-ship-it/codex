// Mawja offline demo page: replays two SUMO runs side by side and summarises results.json.
// No network access beyond the page's own data/ folder; no external libraries.
'use strict';

const DATA = 'data/';
const PEAK_START_S = 16 * 3600;

// Controller labels used when a label does not come from a replay's meta.label_ar.
const CONTROLLER_AR = {
  fixed: 'توقيت ثابت منسّق (موجة خضراء)',
  actuated: 'تحكم متكيف تقليدي',
  max_pressure: 'خوارزمية الضغط الأقصى',
  rl: 'وكيل تعلم معزز',
};

const COLORS = {
  road: '#263a4a',
  roadEdge: '#2f4759',
  junction: '#2d4456',
  vehicles: ['#5fd08f', '#f5bd47', '#f2645f'],
  signal: { G: '#5fd08f', Y: '#f5bd47', R: '#f2645f' },
  label: '#c9c2b2',
  labelDim: '#7f8c95',
};

// ------------------------------------------------------------------ formatting helpers

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function fmtInt(v) { return nf0.format(Math.round(v)); }
function fmtWait(s) { return `${nf1.format(s)} ث`; }
function fmtMetres(m) { return `${fmtInt(m)} م`; }
function fmtPct(p) { const a = Math.abs(p); return `${a < 1 ? nf1.format(a) : nf0.format(a)}%`; }

function clockText(simSeconds) {
  const s = Math.max(0, Math.floor(PEAK_START_S + simSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('data-')) n.setAttribute(k, v);
    else n[k] = v;
  }
  for (const c of [].concat(children)) n.append(c);
  return n;
}

function controllerLabel(key) { return CONTROLLER_AR[key] || key; }

/** Key of results.runs matching a numeric scale (keys are strings such as "1.0"). */
function scaleKey(runs, scale) {
  return Object.keys(runs).find((k) => Math.abs(parseFloat(k) - scale) < 1e-9);
}

function sortedScaleKeys(runs) {
  return Object.keys(runs).sort((a, b) => parseFloat(a) - parseFloat(b));
}

function scaleText(key) { return `${nf0.format(parseFloat(key) * 100)}%`; }

// ------------------------------------------------------------------ data loading

class LoadError extends Error {}

async function fetchJson(name) {
  let res;
  try {
    res = await fetch(DATA + name, { cache: 'no-cache' });
  } catch (e) {
    if (location.protocol === 'file:') {
      throw new LoadError('تعذّر قراءة ملفات البيانات مباشرة من القرص لأن المتصفح يمنع ذلك. '
        + 'افتح الصفحة عبر خادم محلي: شغّل الأمر  python -m http.server  داخل مجلد web ثم افتح http://localhost:8000');
    }
    throw new LoadError(`تعذّر تحميل الملف data/${name}.`);
  }
  if (!res.ok) throw new LoadError(`تعذّر العثور على الملف data/${name} (رمز ${res.status}).`);
  try {
    return await res.json();
  } catch (e) {
    throw new LoadError(`الملف data/${name} ليس ملف JSON صالحاً.`);
  }
}

/** Reasons (Arabic) why two replays cannot be compared; empty when they match. */
function replayMismatches(a, b) {
  const out = [];
  const ma = a.meta || {}, mb = b.meta || {};
  if (ma.seed !== mb.seed) out.push(`البذرة العشوائية (seed) مختلفة: ${ma.seed} مقابل ${mb.seed}`);
  if (ma.demand_hash !== mb.demand_hash) {
    out.push(`حجم المرور (demand_hash) مختلف: ${ma.demand_hash} مقابل ${mb.demand_hash}`);
  }
  if ((ma.scale ?? 1) !== (mb.scale ?? 1)) out.push(`مقياس حجم المرور مختلف: ${ma.scale} مقابل ${mb.scale}`);
  if (ma.duration !== mb.duration) out.push(`مدة المحاكاة مختلفة: ${ma.duration} مقابل ${mb.duration} ثانية`);
  if (ma.frame_step_s !== mb.frame_step_s) out.push('الفاصل الزمني بين اللقطات مختلف');
  return out;
}

function resultsMismatches(results, replay) {
  const out = [];
  const rm = results.meta || {}, pm = replay.meta || {};
  const key = scaleKey(results.runs || {}, pm.scale ?? 1);
  const hash = (rm.demand_hash_by_scale && key !== undefined && rm.demand_hash_by_scale[key])
    || rm.demand_hash;
  if (rm.seed !== pm.seed) out.push(`البذرة العشوائية في results.json (${rm.seed}) لا تطابق ملفات العرض (${pm.seed})`);
  if (hash !== pm.demand_hash) out.push(`حجم المرور في results.json (${hash}) لا يطابق ملفات العرض (${pm.demand_hash})`);
  if (key === undefined) out.push('لا توجد في results.json نتائج لمقياس حجم المرور المعروض');
  return out;
}

function showError(title, details = []) {
  const box = document.getElementById('error');
  box.replaceChildren(el('strong', { text: title }));
  if (details.length) box.append(el('ul', {}, details.map((d) => el('li', { text: d }))));
  box.hidden = false;
  document.getElementById('loading').hidden = true;
  const play = document.getElementById('play');
  if (play) play.disabled = true;
  document.body.dataset.state = 'error';
}

// ------------------------------------------------------------------ map rendering

/** Projection that turns the corridor so Olaya runs bottom (south) to top (north). */
function makeProjection(replay) {
  const tls = replay.tls;
  const a = tls[0], b = tls[tls.length - 1];
  let dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len; dy /= len;
  // along = component on the corridor axis (northwards), across = to its right (east-ish)
  const rot = (x, y) => ({ across: x * dy - y * dx, along: x * dx + y * dy });
  let minA = Infinity, maxA = -Infinity, minL = Infinity, maxL = -Infinity;
  for (const lane of replay.network.lanes) {
    for (const [x, y] of lane) {
      const r = rot(x, y);
      minA = Math.min(minA, r.across); maxA = Math.max(maxA, r.across);
      minL = Math.min(minL, r.along); maxL = Math.max(maxL, r.along);
    }
  }
  return { rot, minA, maxA, minL, maxL, dir: [dx, dy], axis: rot(a.x, a.y).across };
}

class MapView {
  constructor(canvas, replay, proj) {
    this.canvas = canvas;
    this.replay = replay;
    this.proj = proj;
    this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.layout();
  }

  layout() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(200, Math.round(rect.width)), h = Math.max(200, Math.round(rect.height));
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.bg.width = this.canvas.width;
    this.bg.height = this.canvas.height;
    this.dpr = dpr; this.w = w; this.h = h;
    const p = this.proj;
    const padTop = 64, padBottom = 44, labelRoom = Math.min(250, w * 0.42);
    const spanA = p.maxA - p.minA, spanL = p.maxL - p.minL;
    // Schematic (straight-line diagram) view: the along-street scale fits the 3.5 km corridor
    // to the height; the across-street scale is enlarged (at most 5x) so both directions and
    // the cross-street queues are readable. The canvas states this in its corner.
    this.scale = (h - padTop - padBottom) / spanL;
    this.sx = Math.max(this.scale, Math.min(5 * this.scale, (w - labelRoom - 48) / spanA));
    this.exaggeration = this.sx / this.scale;
    const contentW = spanA * this.sx + labelRoom;
    const left = Math.max(24, (w - contentW) / 2);
    this.ox = left - p.minA * this.sx;
    this.oy = padTop + p.maxL * this.scale;
    this.drawBackground();
  }

  toScreen(x, y) {
    const r = this.proj.rot(x, y);
    return [this.ox + r.across * this.sx, this.oy - r.along * this.scale];
  }

  drawBackground() {
    const g = this.bg.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.w, this.h);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const laneW = Math.max(1.4, 3.3 * this.sx);
    for (const [width, color] of [[laneW + 2.5, COLORS.roadEdge], [laneW, COLORS.road]]) {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      for (const lane of this.replay.network.lanes) {
        lane.forEach(([x, y], i) => {
          const [sx, sy] = this.toScreen(x, y);
          if (i === 0) g.moveTo(sx, sy); else g.lineTo(sx, sy);
        });
      }
      g.stroke();
    }
    // Junction boxes and their names.
    g.font = `600 ${this.w < 420 ? 11 : 13}px "Noto Kufi Arabic","Segoe UI","SF Arabic","Geeza Pro",Tahoma,"DejaVu Sans",sans-serif`;
    g.direction = 'rtl';
    g.textBaseline = 'middle';
    for (const t of this.replay.tls) {
      const [sx, sy] = this.toScreen(t.x, t.y);
      g.fillStyle = COLORS.junction;
      g.beginPath();
      g.arc(sx, sy, Math.max(5, 16 * this.sx), 0, Math.PI * 2);
      g.fill();
      const name = String(t.name_ar).replace(/^تقاطع العليا مع\s*/, '');
      const lx = this.ox + this.proj.maxA * this.sx + 18;
      g.strokeStyle = 'rgba(201,194,178,0.25)';
      g.lineWidth = 1;
      g.setLineDash([2, 3]);
      g.beginPath(); g.moveTo(sx + 12, sy); g.lineTo(lx - 4, sy); g.stroke();
      g.setLineDash([]);
      g.fillStyle = COLORS.label;
      g.textAlign = 'left';
      g.fillText(name, lx, sy);
    }
    this.drawCompass(g);
  }

  drawCompass(g) {
    // Screen-up is the corridor axis (south -> north, bearing about 346 deg), so "up" is
    // roughly north; the across-street direction is enlarged, which the note states.
    const x = this.w - 18, y = this.h - 22;
    g.font = '600 11px "Noto Kufi Arabic","Segoe UI",Tahoma,"DejaVu Sans",sans-serif';
    g.fillStyle = COLORS.labelDim;
    g.textAlign = 'right';
    const lenKm = (this.proj.maxL - this.proj.minL) / 1000;
    let note = `↑ الشمال تقريباً. مخطط تقريبي بطول ${lenKm.toFixed(1)} كم`;
    if (this.exaggeration > 1.05) note += `، والعرض مكبّر ×${Math.round(this.exaggeration)} للتوضيح`;
    g.fillText(note, x, y);
  }

  /** Draw the background, one or two vehicle frames (cross-faded), and signal states. */
  draw(frameA, frameB, mix) {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const size = Math.max(2.6, Math.min(4.2, 3 * this.sx + 1.2));
    this.drawVehicles(frameA.v, 1 - mix, size);
    if (frameB && mix > 0) this.drawVehicles(frameB.v, mix, size);
    this.drawSignals(mix > 0.5 && frameB ? frameB.s : frameA.s);
  }

  drawVehicles(vs, alpha, size) {
    if (alpha <= 0.01) return;
    const c = this.ctx;
    const half = size / 2;
    for (let bucket = 0; bucket < 3; bucket++) {
      c.globalAlpha = alpha;
      c.fillStyle = COLORS.vehicles[bucket];
      c.beginPath();
      for (const v of vs) {
        if (v[2] !== bucket) continue;
        const [sx, sy] = this.toScreen(v[0], v[1]);
        c.rect(sx - half, sy - half, size, size);
      }
      c.fill();
    }
    c.globalAlpha = 1;
  }

  drawSignals(states) {
    const c = this.ctx;
    for (const t of this.replay.tls) {
      const st = (states && states[t.id]) || 'R';
      const [sx, sy] = this.toScreen(t.x, t.y);
      const x = sx + 9, y = sy;
      c.fillStyle = 'rgba(15,27,38,0.9)';
      c.beginPath(); c.arc(x, y, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = COLORS.signal[st] || COLORS.signal.R;
      c.globalAlpha = 0.28;
      c.beginPath(); c.arc(x, y, 9.5, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
      c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
    }
  }
}

// ------------------------------------------------------------------ KPI cards

const LIVE_KPIS = [
  { key: 'avg_wait_s', label: 'متوسط الانتظار', fmt: fmtWait, better: 'lower' },
  { key: 'max_queue_m', label: 'أطول طابور', fmt: fmtMetres, better: 'lower' },
  { key: 'throughput', label: 'السيارات العابرة', fmt: fmtInt, better: 'higher' },
];

function buildKpiCards(container, withDelta) {
  const refs = {};
  for (const k of LIVE_KPIS) {
    const value = el('span', { class: 'kpi-value', 'data-kpi-value': k.key, text: '—' });
    const delta = el('span', { class: 'kpi-delta', text: '' });
    container.append(el('div', { class: 'kpi' }, [
      el('span', { class: 'kpi-label' }, [k.label, el('small', { text: ' حتى الآن' })]),
      value, withDelta ? delta : '',
    ]));
    refs[k.key] = { value, delta };
  }
  return refs;
}

/** Relative change of b against a, with whether it is better (+1), worse (-1) or same (0). */
function compare(a, b, better) {
  if (!(a > 0)) return { pct: 0, dir: b === a ? 0 : (better === 'lower' ? (b < a ? 1 : -1) : (b > a ? 1 : -1)) };
  const pct = ((b - a) / a) * 100;
  if (Math.abs(pct) < 0.5) return { pct, dir: 0 };
  const improved = better === 'lower' ? b < a : b > a;
  return { pct, dir: improved ? 1 : -1 };
}

function deltaText(cmp) {
  if (cmp.dir === 0) return 'مماثل للتوقيت الثابت';
  return `${cmp.pct < 0 ? 'أقل' : 'أعلى'} بـ ${fmtPct(cmp.pct)} من التوقيت الثابت`;
}

// ------------------------------------------------------------------ summary

const LEDGER = [
  { key: 'avg_wait_s', label: 'متوسط الانتظار', fmt: fmtWait, better: 'lower' },
  { key: 'max_queue_m', label: 'أطول طابور', fmt: fmtMetres, better: 'lower' },
  { key: 'throughput', label: 'السيارات العابرة', fmt: fmtInt, better: 'higher', abs: 'سيارة' },
  { key: 'pending_insertion', label: 'سيارات لم تتمكن من دخول الشارع', fmt: fmtInt, better: 'lower', abs: 'سيارة' },
  { key: 'fuel_l', label: 'الوقود المستهلك', fmt: (v) => `${fmtInt(v)} لتر`, better: 'lower' },
  { key: 'cost_sar', label: 'الكلفة التقديرية بالريال', fmt: (v) => `${fmtInt(v)} ريال`, better: 'lower' },
];

function ledgerDelta(item, a, b) {
  const cmp = compare(a, b, item.better);
  let text;
  if (item.abs) {
    const d = b - a;
    text = d === 0 ? 'بلا فرق' : `${d > 0 ? '+' : '−'}${fmtInt(Math.abs(d))} ${item.abs}`;
    if (a > 0 && d !== 0) text += ` (${fmtPct(cmp.pct)})`;
  } else {
    text = cmp.dir === 0 ? 'بلا فرق يُذكر' : `${cmp.pct < 0 ? 'أقل' : 'أعلى'} بـ ${fmtPct(cmp.pct)}`;
  }
  return { text, dir: cmp.dir };
}

/** Honest verdict of controller k against the fixed-time baseline at one scale. */
function verdict(base, k) {
  const wait = compare(base.avg_wait_s, k.avg_wait_s, 'lower');
  const fewerThrough = k.throughput < base.throughput;
  const morePending = k.pending_insertion > base.pending_insertion;
  if (wait.dir === 1 && !fewerThrough && !morePending) {
    const queue = compare(base.max_queue_m, k.max_queue_m, 'lower');
    const caveat = queue.dir === -1 ? `، لكن أطول طابور أعلى بـ ${fmtPct(queue.pct)}` : '';
    return { cls: 'good', text: `تحسّن: انتظار أقل بـ ${fmtPct(wait.pct)} دون خسارة في السيارات العابرة${caveat}` };
  }
  const issues = [];
  if (fewerThrough) issues.push(`عبور ${fmtInt(base.throughput - k.throughput)} سيارة أقل`);
  if (morePending) issues.push(`${fmtInt(k.pending_insertion - base.pending_insertion)} سيارة إضافية لم تدخل الشارع`);
  if (wait.dir === -1) issues.unshift(`انتظار أعلى بـ ${fmtPct(wait.pct)}`);
  if (wait.dir === 1) {
    return { cls: 'mixed', text: `نتيجة مختلطة: انتظار أقل بـ ${fmtPct(wait.pct)}، لكن ${issues.join(' و')}` };
  }
  if (!issues.length) return { cls: 'mixed', text: 'لا فرق يُذكر' };
  return { cls: 'bad', text: `أسوأ من التوقيت الثابت: ${issues.join(' و')}` };
}

function renderScalesTable(tbody, results, mawjaKey, opts = {}) {
  const runs = results.runs;
  tbody.replaceChildren();
  for (const sk of sortedScaleKeys(runs)) {
    const base = runs[sk].fixed;
    const ctrls = Object.keys(runs[sk]).sort((a, b) => (a === 'fixed' ? -1 : b === 'fixed' ? 1 : 0));
    ctrls.forEach((ck, i) => {
      const k = runs[sk][ck];
      const v = ck === 'fixed' || !base ? { cls: 'base', text: 'خط الأساس' } : verdict(base, k);
      const name = el('td', {}, [controllerLabel(ck)]);
      if (ck === mawjaKey) name.append(el('span', { class: 'tag', text: 'موجة' }));
      const cells = [
        i === 0 ? el('th', { scope: 'row', rowSpan: ctrls.length, class: 'scale', text: scaleText(sk) }) : null,
        name,
        el('td', { class: 'num', text: fmtWait(k.avg_wait_s) }),
      ];
      if (opts.full) cells.push(el('td', { class: 'num', text: fmtMetres(k.max_queue_m) }));
      cells.push(
        el('td', { class: 'num', text: fmtInt(k.throughput) }),
        el('td', { class: 'num', text: fmtInt(k.pending_insertion) }),
      );
      if (opts.full) {
        cells.push(
          el('td', { class: 'num', text: fmtInt(k.unfinished) }),
          el('td', { class: 'num', text: fmtInt(k.teleports) }),
          el('td', { class: 'num', text: fmtInt(k.fuel_l) }),
        );
      }
      cells.push(el('td', { class: 'num', text: fmtInt(k.cost_sar) }));
      cells.push(el('td', { class: `verdict ${v.cls}`, text: v.text }));
      const tr = el('tr', { 'data-scale': sk, 'data-controller': ck, class: i === 0 ? 'group-start' : '' },
        cells.filter(Boolean));
      if (ck === mawjaKey) tr.classList.add('is-mawja');
      tbody.append(tr);
    });
  }
}

function renderSummary(results, sk, mawjaKey, mawjaLabel) {
  const base = results.runs[sk].fixed, m = results.runs[sk][mawjaKey];
  document.getElementById('summary-sub').textContent =
    `حجم المرور المرجعي (${scaleText(sk)})، نفس السيارات ونفس البذرة العشوائية للطريقتين. `
    + `«موجة» هنا تعمل بـ${mawjaLabel}.`;
  const tbody = document.querySelector('#ledger tbody');
  tbody.replaceChildren();
  for (const item of LEDGER) {
    const d = ledgerDelta(item, base[item.key], m[item.key]);
    tbody.append(el('tr', {}, [
      el('th', { scope: 'row', text: item.label }),
      el('td', { class: 'num', text: item.fmt(base[item.key]) }),
      el('td', { class: 'num', text: item.fmt(m[item.key]) }),
      el('td', { class: `num delta d${d.dir}`, text: d.text }),
    ]));
  }
  // Headline: the two numbers that matter, each with its honest direction.
  const v = verdict(base, m);
  const wait = compare(base.avg_wait_s, m.avg_wait_s, 'lower');
  const cost = compare(base.cost_sar, m.cost_sar, 'lower');
  const head = document.getElementById('headline');
  head.replaceChildren(
    el('div', { class: `hl ${wait.dir === 1 ? 'good' : wait.dir === -1 ? 'bad' : ''}` }, [
      el('span', { class: 'hl-num', text: wait.dir === 0 ? '≈' : `${wait.pct < 0 ? '−' : '+'}${fmtPct(wait.pct)}` }),
      el('span', { class: 'hl-label', text: 'متوسط الانتظار' }),
      el('span', { class: 'hl-detail', text: `${fmtWait(base.avg_wait_s)} ← ${fmtWait(m.avg_wait_s)}` }),
    ]),
    el('div', { class: `hl ${cost.dir === 1 ? 'good' : cost.dir === -1 ? 'bad' : ''}` }, [
      el('span', { class: 'hl-num', text: cost.dir === 0 ? '≈' : `${cost.pct < 0 ? '−' : '+'}${fmtPct(cost.pct)}` }),
      el('span', { class: 'hl-label', text: 'الكلفة التقديرية بالريال' }),
      el('span', { class: 'hl-detail', text: `${fmtInt(base.cost_sar)} ← ${fmtInt(m.cost_sar)} ريال خلال ساعتي الذروة` }),
    ]),
    el('p', { class: `hl-verdict ${v.cls}`, text: v.text }),
  );
  renderScalesTable(document.querySelector('#scales-table tbody'), results, mawjaKey);
}

// ------------------------------------------------------------------ trend chart

class Trend {
  constructor(canvas, fixed, mawja) {
    this.canvas = canvas;
    this.series = [
      { frames: fixed.frames, color: '#b9b0a0', name: 'التوقيت الثابت' },
      { frames: mawja.frames, color: '#7cc4ff', name: 'موجة' },
    ];
    this.duration = fixed.meta.duration;
    this.max = Math.max(1, ...this.series.flatMap((s) => s.frames.map((f) => f.k.avg_wait_s)));
    this.layout();
  }

  layout() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(240, r.width); this.h = Math.max(140, r.height);
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr);
    this.dpr = dpr;
  }

  draw(t) {
    const c = this.canvas.getContext('2d');
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);
    const padL = 16, padR = 44, padT = 12, padB = 26;
    const W = this.w - padL - padR, H = this.h - padT - padB;
    // Time runs right-to-left to match the RTL page and the range slider.
    const X = (s) => padL + W - (s / this.duration) * W;
    const Y = (v) => padT + H - (v / this.max) * H;
    c.font = '11px "Noto Kufi Arabic","Segoe UI",Tahoma,"DejaVu Sans",sans-serif';
    c.fillStyle = '#7f8c95';
    c.strokeStyle = 'rgba(201,194,178,0.12)';
    c.lineWidth = 1;
    const stepV = this.max > 120 ? 60 : 20;
    c.textAlign = 'left';
    c.textBaseline = 'middle';
    for (let v = 0; v <= this.max; v += stepV) {
      c.beginPath(); c.moveTo(padL, Y(v)); c.lineTo(padL + W, Y(v)); c.stroke();
      c.fillText(String(v), padL + W + 6, Y(v));
    }
    c.textAlign = 'center';
    c.textBaseline = 'top';
    for (let s = 0; s <= this.duration; s += 1800) c.fillText(clockText(s).slice(0, 5), X(s), padT + H + 8);
    for (const s of this.series) {
      c.strokeStyle = s.color;
      c.globalAlpha = 0.35;
      c.lineWidth = 1.5;
      c.beginPath();
      s.frames.forEach((f, i) => (i ? c.lineTo(X(f.t), Y(f.k.avg_wait_s)) : c.moveTo(X(f.t), Y(f.k.avg_wait_s))));
      c.stroke();
      c.globalAlpha = 1;
      c.lineWidth = 2.5;
      c.beginPath();
      let started = false;
      for (const f of s.frames) {
        if (f.t > t) break;
        if (!started) { c.moveTo(X(f.t), Y(f.k.avg_wait_s)); started = true; } else c.lineTo(X(f.t), Y(f.k.avg_wait_s));
      }
      c.stroke();
    }
    c.strokeStyle = 'rgba(234,223,200,0.5)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(X(t), padT); c.lineTo(X(t), padT + H); c.stroke();
  }
}

// ------------------------------------------------------------------ player

function frameIndexAt(frames, t) {
  // Last frame with frames[i].t <= t (or 0).
  let lo = 0, hi = frames.length - 1;
  if (t < frames[0].t) return 0;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frames[mid].t <= t) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function smoothstep(x) { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); }

class Player {
  constructor(fixed, mawja) {
    this.runs = { fixed, mawja };
    this.duration = fixed.meta.duration;
    this.step = fixed.meta.frame_step_s || 1;
    this.t = 0;
    this.speed = 60;
    this.playing = false;
    this.last = null;
    const proj = makeProjection(fixed);
    this.views = {
      fixed: new MapView(document.getElementById('canvas-fixed'), fixed, proj),
      mawja: new MapView(document.getElementById('canvas-mawja'), mawja, proj),
    };
    this.cards = {
      fixed: buildKpiCards(document.querySelector('.kpis[data-panel="fixed"]'), false),
      mawja: buildKpiCards(document.querySelector('.kpis[data-panel="mawja"]'), true),
    };
    this.trend = new Trend(document.getElementById('trend'), fixed, mawja);
    this.clock = document.getElementById('clock');
    this.scrub = document.getElementById('scrub');
    this.playBtn = document.getElementById('play');
    this.scrub.max = String(this.duration);
    this.scrub.step = String(this.step);
    this.bind();
    this.render();
  }

  bind() {
    this.playBtn.disabled = false;
    this.scrub.disabled = false;
    this.playBtn.addEventListener('click', () => this.toggle());
    for (const b of document.querySelectorAll('[data-speed]')) {
      b.addEventListener('click', () => {
        this.speed = Number(b.dataset.speed);
        for (const o of document.querySelectorAll('[data-speed]')) o.setAttribute('aria-pressed', String(o === b));
      });
    }
    this.scrub.addEventListener('input', () => { this.t = Number(this.scrub.value); this.render(); });
    let pending = false;
    window.addEventListener('resize', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        Object.values(this.views).forEach((v) => v.layout());
        this.trend.layout();
        this.render();
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); this.toggle(); }
    });
  }

  toggle() {
    if (!this.playing && this.t >= this.duration) this.t = 0;
    this.playing = !this.playing;
    this.playBtn.querySelector('.play-icon').textContent = this.playing ? '⏸' : '▶︎';
    this.playBtn.querySelector('.play-text').textContent = this.playing ? 'إيقاف مؤقت' : 'تشغيل';
    this.playBtn.setAttribute('aria-label', this.playing ? 'إيقاف مؤقت' : 'تشغيل');
    document.body.classList.toggle('is-playing', this.playing);
    if (this.playing) { this.last = null; requestAnimationFrame((ts) => this.tick(ts)); }
  }

  tick(ts) {
    if (!this.playing) return;
    if (this.last !== null) this.t = Math.min(this.duration, this.t + ((ts - this.last) / 1000) * this.speed);
    this.last = ts;
    this.render();
    if (this.t >= this.duration) {
      this.toggle();
      document.body.classList.add('is-finished');
      return;
    }
    requestAnimationFrame((n) => this.tick(n));
  }

  render() {
    const t = this.t;
    const kNow = {};
    for (const [name, run] of Object.entries(this.runs)) {
      const frames = run.frames;
      const i = frameIndexAt(frames, t);
      const a = frames[i], b = frames[i + 1];
      // Real data only exists every frame_step_s seconds; vehicles carry no ids, so instead of
      // inventing in-between positions the next snapshot fades in over the last third.
      const mix = b && t >= a.t ? smoothstep(((t - a.t) / (b.t - a.t) - 0.66) / 0.34) : 0;
      this.views[name].draw(a, b, mix);
      kNow[name] = t < frames[0].t ? null : a.k;
    }
    for (const k of LIVE_KPIS) {
      for (const name of ['fixed', 'mawja']) {
        const v = kNow[name];
        this.cards[name][k.key].value.textContent = v ? k.fmt(v[k.key]) : '—';
      }
      const d = this.cards.mawja[k.key].delta;
      if (kNow.fixed && kNow.mawja) {
        const cmp = compare(kNow.fixed[k.key], kNow.mawja[k.key], k.better);
        d.textContent = deltaText(cmp);
        d.className = `kpi-delta d${cmp.dir}`;
      } else {
        d.textContent = '';
      }
    }
    this.clock.textContent = clockText(t);
    this.scrub.value = String(Math.round(t / this.step) * this.step);
    this.scrub.style.setProperty('--p', `${(t / this.duration) * 100}%`);
    this.trend.draw(t);
  }
}

// ------------------------------------------------------------------ pages

async function initDemo() {
  let manifest, results, fixed, mawja, mawjaKey;
  try {
    [manifest, results] = await Promise.all([fetchJson('manifest.json'), fetchJson('results.json')]);
    mawjaKey = manifest && manifest.mawja;
    if (!mawjaKey || !/^[a-z_]+$/.test(mawjaKey)) {
      throw new LoadError('الملف data/manifest.json لا يحدد طريقة التحكم التي تمثّل «موجة».');
    }
    const mawjaFile = `replay_${mawjaKey}.json`;
    [fixed, mawja] = await Promise.all([
      fetchJson('replay_fixed.json'),
      fetchJson(mawjaFile).catch((e) => {
        throw new LoadError(`تعذّر العثور على ملف العرض data/${mawjaFile} الذي يحدده data/manifest.json لـ«موجة». `
          + 'صدّر هذا الملف أولاً ثم أعد تحميل الصفحة.');
      }),
    ]);
  } catch (e) {
    showError(e instanceof LoadError ? e.message : 'تعذّر تحميل بيانات المحاكاة.');
    return;
  }

  const mismatch = replayMismatches(fixed, mawja);
  if (mismatch.length) {
    showError('لا يمكن تشغيل المقارنة: ملفا المحاكاة لم يُولَّدا بنفس حجم المرور والبذرة العشوائية، '
      + 'فالمقارنة بينهما لن تكون عادلة. أعد تصدير الملفين بالأمر نفسه.', mismatch);
    return;
  }
  const resMismatch = resultsMismatches(results, fixed);
  if (resMismatch.length) {
    showError('لا يمكن تشغيل المقارنة: ملف النتائج results.json لا يطابق ملفات العرض. '
      + 'أعد تشغيل المقارنة والتصدير بنفس البذرة وحجم المرور.', resMismatch);
    return;
  }

  const mawjaLabel = (mawja.meta && mawja.meta.label_ar) || controllerLabel(mawjaKey);
  document.getElementById('algo-fixed').textContent = (fixed.meta && fixed.meta.label_ar) || controllerLabel('fixed');
  document.getElementById('algo-mawja').textContent = mawjaLabel;
  document.getElementById('title-mawja').textContent = 'موجة';

  document.getElementById('loading').hidden = true;
  document.body.dataset.state = 'ready';
  const sk = scaleKey(results.runs, fixed.meta.scale ?? 1);
  if (results.runs[sk] && results.runs[sk].fixed && results.runs[sk][mawjaKey]) {
    renderSummary(results, sk, mawjaKey, mawjaLabel);
  } else {
    document.getElementById('summary').hidden = true;
  }
  window.mawjaPlayer = new Player(fixed, mawja);
}

async function initMethodology() {
  const tbody = document.querySelector('#results-table tbody');
  let results, manifest;
  try {
    [results, manifest] = await Promise.all([fetchJson('results.json'), fetchJson('manifest.json')]);
  } catch (e) {
    showError(e instanceof LoadError ? e.message : 'تعذّر تحميل ملف النتائج.');
    return;
  }
  renderScalesTable(tbody, results, manifest.mawja, { full: true });
  const meta = results.meta || {};
  const info = document.getElementById('results-meta');
  if (info) {
    info.textContent = `البذرة العشوائية ${meta.seed}، مدة كل تشغيل ${fmtInt((meta.duration || 7200) / 60)} دقيقة، `
      + `تاريخ التوليد ${String(meta.generated_at || '').slice(0, 10)}.`;
  }
  const algo = document.getElementById('mawja-algo');
  if (algo) algo.textContent = controllerLabel(manifest.mawja);
  document.body.dataset.state = 'ready';
}

if (document.getElementById('player')) initDemo();
else if (document.getElementById('results-table')) initMethodology();
