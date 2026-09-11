import { chromium } from 'playwright';

const browser = await chromium.launch();

for (const w of [992, 1024, 1100, 1279, 1280, 1440]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, reducedMotion: 'reduce' });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) window.scrollTo(0, y);
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);

  const out = await page.evaluate((vw) => {
    const rows = [];
    const doc = document.documentElement.scrollWidth;
    if (doc > vw + 1) rows.push(`PAGE OVERFLOW scrollWidth=${doc}`);

    // real overflow, ignoring anything clipped by a scroll/hidden container
    const clipped = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'hidden' || o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };
    document.querySelectorAll('body *').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
        const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : el.tagName;
        rows.push(`overflow .${c} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
    });

    const m = (sel, label) => {
      const el = document.querySelector(sel);
      if (!el) return `${label} MISSING`;
      const r = el.getBoundingClientRect();
      return `${label} ${Math.round(r.width)}x${Math.round(r.height)}`;
    };
    rows.push([
      m('.tournament-card', 'tourn-card'),
      m('.tournament-card .card-title', 'tourn-title'),
      m('.training-card', 'train-card'),
      m('.founder-photo', 'founder-photo'),
      m('.journal-panel', 'jrnl-panel'),
      m('.journal-article .article-photo', 'jrnl-photo'),
      m('.event-badge', 'ev-badge'),
      m('.footer-cta-right', 'cta-right'),
    ].join(' | '));
    return [...new Set(rows)];
  }, w);

  console.log(`=== ${w} ===\n  ${out.join('\n  ')}${errs.length ? '\n  ERR ' + errs.join('|') : ''}`);
  await page.close();
}

await browser.close();
