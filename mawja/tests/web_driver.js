// Headless-browser driver for tests/test_web.py (Playwright for Node, pre-installed Chromium).
// Usage: node web_driver.js '<json config>'
// config: {url, viewport?, actions: [{click: sel} | {wait: ms} | {waitFor: jsExpr, timeout?}],
//          evals: {name: jsExpr}, screenshot?: path}
// Prints one JSON line: {console_errors, page_errors, blocked, evals}.
// Every request to a host other than localhost / 127.0.0.1 is aborted and recorded, so the
// page is proven to work offline.
const { chromium } = require('playwright');

(async () => {
  const cfg = JSON.parse(process.argv[2]);
  const out = { console_errors: [], page_errors: [], blocked: [], evals: {} };
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport: cfg.viewport || { width: 1440, height: 900 },
      deviceScaleFactor: cfg.dpr || 1,
    });
    await context.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.protocol === 'data:' || u.protocol === 'blob:' ||
          u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return route.continue();
      }
      out.blocked.push(route.request().url());
      return route.abort();
    });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') out.console_errors.push(m.text()); });
    page.on('pageerror', (e) => out.page_errors.push(String(e)));
    await page.goto(cfg.url, { waitUntil: 'load' });
    for (const a of cfg.actions || []) {
      if (a.click) await page.click(a.click);
      else if (a.wait) await page.waitForTimeout(a.wait);
      else if (a.waitFor) await page.waitForFunction(a.waitFor, null, { timeout: a.timeout || 30000 });
    }
    for (const [name, expr] of Object.entries(cfg.evals || {})) {
      out.evals[name] = await page.evaluate(expr);
    }
    if (cfg.screenshot) await page.screenshot({ path: cfg.screenshot, fullPage: !!cfg.fullPage });
  } finally {
    await browser.close();
  }
  process.stdout.write(JSON.stringify(out) + '\n');
})().catch((e) => { process.stderr.write(String(e && e.stack || e) + '\n'); process.exit(1); });
