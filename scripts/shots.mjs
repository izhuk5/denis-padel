import { chromium } from 'playwright';

const sizes = [
  { w: 1440, h: 900 },
  { w: 1280, h: 800 },
  { w: 1024, h: 768 },
  { w: 768, h: 1024 },
  { w: 430, h: 932 },
  { w: 390, h: 844 },
  { w: 360, h: 780 },
];

const browser = await chromium.launch();
const errors = [];

for (const { w, h } of sizes) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('console', m => { if (m.type() === 'error') errors.push(`[${w}] ${m.text()}`); });
  page.on('pageerror', e => errors.push(`[${w}] ${e.message}`));
  await page.goto('http://localhost:4321/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);
  await page.screenshot({ path: `/tmp/hero-${w}.png`, fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  if (overflow) errors.push(`[${w}] horizontal overflow`);
  await page.close();
}

await browser.close();
console.log(errors.length ? errors.join('\n') : 'no errors, no overflow');
