// Builds taqam/marketing/Shuoon-Profile-A4.pdf from profile.template.html + the website's own content (data.ts).
// Run from taqam/apps/web: node ../../marketing/build/build.cjs  (needs the web app's node_modules + Playwright)
const fs = require('fs');
const path = require('path');
const esbuild = require(path.resolve('node_modules/esbuild'));
const { chromium } = require('playwright');

const M = path.resolve(__dirname, '..');
const load = (file) => {
  const out = esbuild.buildSync({ entryPoints: [file], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['lucide-react'] });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, (n) => (n === 'lucide-react' ? new Proxy({}, { get: () => null }) : require(n)));
  return mod.exports;
};
const data = load(path.resolve('src/components/marketing/data.ts'));
const wm = load(path.resolve('src/components/ui/wordmark.ts'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const SYMBOL = `<defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1EDBC9"/><stop offset="1" stop-color="#10C4BA"/></linearGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0C93D6"/><stop offset="1" stop-color="#0377BE"/></linearGradient><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A8FD3"/><stop offset=".55" stop-color="#0378C0"/><stop offset="1" stop-color="#143A7A"/></linearGradient></defs><circle cx="100" cy="21" r="19" fill="url(#b)"/><circle cx="37" cy="45" r="17" fill="url(#t)"/><circle cx="163" cy="45" r="17" fill="url(#t)"/><path d="M13 97C20 130 50 142 72 125C86 114 92 94 100 78C108 94 114 114 128 124C150 142 180 130 187 97C178 112 160 118 146 108C128 92 118 56 100 56C82 56 72 92 54 108C40 118 22 112 13 97Z" fill="url(#w)"/><circle cx="37" cy="95" r="25" fill="url(#t)"/><circle cx="163" cy="95" r="25" fill="url(#t)"/>`;
const mark = (w) => `<svg viewBox="0 0 200 140" width="${w}" height="${(w * 140) / 200}">${SYMBOL}</svg>`;
const word = (o, color, h) => `<svg viewBox="${o.viewBox}" style="height:${h};width:auto;display:block;align-self:flex-end"><path d="${o.d}" fill="${color}"/></svg>`;

const TOC = [ // [title, english, page]
  ['عن شؤون وفكرتها', 'About', 3], ['التحدي والحل', 'Challenge', 4], ['ثلاث واجهات… منظومة واحدة', 'Platform', 5], ['الوحدات الـ12', 'Modules', 6],
  ['الفروع والموظفون والمستندات', 'Core HR', 7], ['الحضور والورديات', 'Attendance', 8], ['الإجازات والطلبات والسلف', 'Leave & requests', 9],
  ['الرواتب وحماية الأجور ونهاية الخدمة', 'Payroll', 10], ['السعودة والأداء والتوظيف', 'Talent', 11], ['تطبيق الموظف', 'Employee app', 12],
  ['التقارير والصلاحيات والأمان', 'Control', 13], ['الامتثال والأدوات المجانية', 'Compliance', 14], ['حلول القطاعات', 'Industries', 15],
  ['التشغيل والدعم', 'Onboarding', 17], ['الباقات ومقارنتها', 'Pricing', 18], ['أسئلة شائعة', 'FAQ', 20], ['تواصل معنا والنسخة التجريبية', 'Contact', 21],
];
const toc = TOC.map(([ar, en, pg]) => `<div style="display:flex;align-items:center;gap:4mm;padding:2.6mm 0;border-bottom:1px dashed var(--line)"><span class="num" style="font-size:15pt;min-width:11mm">${String(pg).padStart(2, '0')}</span><span class="kufi" style="font-size:10.5pt;font-weight:600;color:var(--navy);flex:1">${ar}</span><span class="en" style="font-size:8pt;color:var(--soft)">${en}</span></div>`).join('');

const sectorHtml = (list) => list.map((s) => `<div class="service" style="padding:3.6mm 5.5mm;gap:5mm">
  <div class="ar"><h4 style="font-size:11.5pt;margin-bottom:.6mm">${esc(s.name[0])}</h4><p style="font-size:8.6pt;color:var(--cyan);margin-bottom:1.2mm">${esc(s.tagline[0])}</p><ul>${s.features.map((f) => `<li style="font-size:8.6pt;line-height:1.55"><b style="color:var(--navy)">${esc(f.title[0])}:</b> ${esc(f.body[0])}</li>`).join('')}</ul></div>
  <div class="en"><h4 style="font-size:9.5pt">${esc(s.name[1])}</h4><ul>${s.features.map((f) => `<li style="font-size:7.8pt">${esc(f.title[1])}</li>`).join('')}</ul></div></div>`).join('');
const sectorsA = sectorHtml(data.SECTORS.slice(0, 3));
const sectorsB = sectorHtml(data.SECTORS.slice(3));

const cell = (v) => (v === true ? '<td class="yes" style="padding:1.6mm 2mm">✓</td>' : v === false ? '<td class="no" style="padding:1.6mm 2mm">—</td>' : `<td class="c" style="font-size:8.4pt;padding:1.6mm 2mm">${esc(v[0])}</td>`);
const comparison = `<table style="line-height:1.35"><tr><th style="width:30%">المزايا</th><th class="en" style="width:24%;text-align:left">Features</th>${data.TIERS.map((t) => `<th class="c">${esc(t.name[0])}<span class="en">${esc(t.name[1])}</span></th>`).join('')}</tr>${data.COMPARISON.map((g) => `<tr class="group"><td colspan="5">${esc(g.group[0])} · <span style="font-weight:400;color:var(--soft)">${esc(g.group[1])}</span></td></tr>${g.rows.map((r) => `<tr><td style="padding:1.6mm 3mm">${esc(r.label[0])}</td><td style="padding:1.6mm 3mm;font-size:7.8pt;color:var(--soft)" class="en">${esc(r.label[1])}</td>${r.values.map(cell).join('')}</tr>`).join('')}`).join('')}</table>`;

const tierFeatures = `<div class="grid3">${data.TIERS.map((t) => `<div class="card${t.highlight ? ' mint' : ''}"><h4>${esc(t.name[0])}: ما تشمله</h4><ul class="dots">${t.features.map((f) => `<li>${esc(f[0])}</li>`).join('')}</ul><div class="en">${t.features.map((f) => esc(f[1])).join(' · ')}</div></div>`).join('')}</div>
<div class="card hl" style="flex-direction:row;align-items:center;gap:6mm"><div style="flex:1"><h4>مثال: منشأة بـ 40 موظفاً على باقة النمو</h4><p>40 موظفاً × 29 ريالاً = 1,160 ريالاً شهرياً، أو 986 ريالاً شهرياً عند الاشتراك السنوي (خصم 15%)، قبل ضريبة القيمة المضافة.</p></div><div class="num" style="font-size:24pt">1,160</div></div>`;
const faqs = [...data.HOME_FAQ, ...data.PRICING_FAQ];
const faq = `<div class="grid2" style="gap:3mm 5mm">${faqs.map((f) => `<div style="background:#fff;border:1px solid var(--line);border-radius:3mm;padding:3mm 4mm"><p class="q">${esc(f.q[0])}</p><p class="a">${esc(f.a[0])}</p></div>`).join('')}</div>`;
const testimonials = `<div class="grid3" style="gap:3mm">${data.TESTIMONIALS.map((t) => `<div><p style="font-size:9pt;color:var(--navy);line-height:1.7">«${esc(t.quote[0])}»</p><p style="font-size:8pt;color:var(--soft);margin-top:1mm">${esc(t.name[0])} — ${esc(t.role[0])}، ${esc(t.company[0])}</p></div>`).join('')}</div>`;

let n = 1; // cover is page 1
let html = fs.readFileSync(path.join(__dirname, 'profile.template.html'), 'utf8')
  .replace('{{TOC}}', toc).replace('{{SECTORS_A}}', sectorsA).replace('{{SECTORS_B}}', sectorsB).replace('{{TIER_FEATURES}}', tierFeatures).replace('{{COMPARISON}}', comparison).replace('{{FAQ}}', faq).replace('{{TESTIMONIALS}}', testimonials)
  .replace('{{MARK_160}}', mark(150)).replace('{{MARK_80}}', mark(84))
  .replace('{{WM_AR_WHITE_H}}', word(wm.WORDMARK_AR, '#FFFFFF', '30mm')).replace('{{WM_LA_TEAL}}', word(wm.WORDMARK_LATIN, '#14D1C3', '4.2mm'))
  .replace('{{WM_AR_WHITE_S}}', word(wm.WORDMARK_AR, '#FFFFFF', '15mm')).replace('{{WM_LA_TEAL_S}}', word(wm.WORDMARK_LATIN, '#14D1C3', '2.4mm'))
  .replace(/\{\{FOOTER\}\}/g, () => { n += 1; return `<div class="footer"><span class="brand">${mark(22)}<b style="color:var(--navy)">شؤون</b> · SHUOON — كل شؤون موظفيك، في مكان واحد</span><span>${String(n).padStart(2, '0')}</span></div>`; });
html = html.replace(/<section class="page dark"([\s\S]*?)<div class="footer"><span class="brand">([\s\S]*?)<b style="color:var\(--navy\)">/g, (m) => m.replace('<b style="color:var(--navy)">', '<b style="color:#fff">'));

const htmlPath = path.join(M, 'shuoon-profile.html');
fs.writeFileSync(htmlPath, html);
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + htmlPath, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  const over = await p.evaluate(() => [...document.querySelectorAll('.page')].map((s, i) => {
    const f = s.querySelector('.footer'); const limit = f ? f.getBoundingClientRect().top : s.getBoundingClientRect().bottom;
    const kids = [...s.children].filter((c) => !c.classList.contains('footer') && getComputedStyle(c).position !== 'absolute');
    const bottom = Math.max(...kids.map((c) => c.getBoundingClientRect().bottom));
    return bottom > limit - 2 ? `page ${i + 1} overflows by ${Math.round(bottom - limit + 2)}px` : null;
  }).filter(Boolean));
  if (over.length) console.log('OVERFLOW:', over.join('; '));
  await p.pdf({ path: path.join(M, 'Shuoon-Profile-A4.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
  console.log('pages:', await p.evaluate(() => document.querySelectorAll('.page').length));
  await b.close();
})();
