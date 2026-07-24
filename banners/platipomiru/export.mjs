#!/usr/bin/env node
/**
 * Export all banner sizes to PNG.
 * Requires: npm install puppeteer (run from banners/platipomiru)
 *
 * Usage: node export.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'export');

const SIZES = [
  { w: 1000, h: 120, layout: 'hz-ultra' },
  { w: 1080, h: 450, layout: 'billboard' },
  { w: 1280, h: 256, layout: 'hz-ultra' },
  { w: 160, h: 600, layout: 'vert' },
  { w: 1706, h: 184, layout: 'hz-ultra' },
  { w: 240, h: 400, layout: 'vert' },
  { w: 240, h: 600, layout: 'vert' },
  { w: 300, h: 250, layout: 'mrect' },
  { w: 300, h: 300, layout: 'square' },
  { w: 300, h: 500, layout: 'vert' },
  { w: 300, h: 600, layout: 'vert' },
  { w: 320, h: 100, layout: 'hz-std' },
  { w: 320, h: 480, layout: 'mport' },
  { w: 320, h: 50, layout: 'hz-std' },
  { w: 336, h: 280, layout: 'mrect' },
  { w: 480, h: 320, layout: 'mland' },
  { w: 728, h: 90, layout: 'hz-std' },
  { w: 940, h: 1524, layout: 'mport' },
  { w: 970, h: 250, layout: 'billboard' },
];

function bannerHtml(s) {
  return `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="UTF-8"/>
<link rel="stylesheet" href="styles.css"/>
<style>html,body{margin:0;padding:0;overflow:hidden;background:#050810}</style>
</head><body>
<article class="banner banner--${s.layout}" style="width:${s.w}px;height:${s.h}px">
  <div class="banner__bg"></div>
  <div class="banner__grid"></div>
  <div class="banner__glow banner__glow--cyan"></div>
  <div class="banner__glow banner__glow--purple"></div>
  <div class="banner__content">
    <span class="banner__chip">Плати по миру</span>
    <h2 class="banner__title">Оплачивайте любимые игры</h2>
    <p class="banner__subtitle">Виртуальная карта для зарубежных игровых сервисов</p>
    <ul class="banner__bullets">
      <li>оформление онлайн</li>
      <li>пополнение рублями через СБП</li>
      <li>подходит для оплаты цифровых покупок</li>
      <li>быстрое получение карты</li>
    </ul>
    <div class="banner__row">
      <div class="banner__promo">
        <span class="banner__promo-code">LG2026</span>
        <span class="banner__promo-bonus">500 ₽ на открытие карты</span>
      </div>
      <span class="banner__cta">Получить карту</span>
    </div>
    <p class="banner__footer">Подробные условия — на сайте platipomiru.com</p>
  </div>
</article>
</body></html>`;
}

async function main() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.error('Установите puppeteer: npm install puppeteer');
    console.error('Или откройте index.html в браузере и сделайте скриншоты вручную.');
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.default.launch({ headless: 'new' });
  const page = await browser.newPage();

  for (const s of SIZES) {
    const tmp = path.join(__dirname, '_tmp.html');
    fs.writeFileSync(tmp, bannerHtml(s));
    const fileUrl = `file://${tmp}`;
    await page.setViewport({ width: s.w, height: s.h, deviceScaleFactor: 2 });
    await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const outFile = path.join(OUT, `platipomiru_${s.w}x${s.h}.png`);
    await page.screenshot({ path: outFile, type: 'png' });
    console.log('✓', outFile);
  }

  fs.unlinkSync(path.join(__dirname, '_tmp.html'));
  await browser.close();
  console.log(`\nГотово: ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
