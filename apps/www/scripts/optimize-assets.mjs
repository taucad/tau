import { loadPlaywright, loadSharp, serial } from '#tools/tooling.js';
import { heroDrafting } from '#www/hero-view.js';
import { wordmark } from '#www/wordmark.js';
/** Rebuild responsive assets from committed Tau sources; no image service is used. */
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
const sharp = await loadSharp();
const { chromium } = await loadPlaywright();
const app = resolve(import.meta.dirname, '..');
const sources = {
  workspace: 'docs/assets/tau-desktop-light.webp',
  'workspace-dark': 'docs/assets/tau-desktop-dark.webp',
  quadcopter: 'libs/tau-examples/src/kernels/openscad/arq5-racing-quadcopter/thumbnail.webp',
  engine: 'libs/tau-examples/src/kernels/replicad/v8-engine/thumbnail.webp',
  'heat-exchanger': 'libs/tau-examples/src/kernels/replicad/heat-exchanger/thumbnail.webp',
};
await Promise.all(
  Object.entries(sources).map(async ([name, source]) => {
    const bytes = await readFile(resolve(app, '../..', source));
    // The workspace capture is small UI text shown about 1260 CSS px wide, so it needs retina widths and a
    // higher quality without chroma subsampling to stay sharp.
    const workspace = name.startsWith('workspace');
    await Promise.all(
      (workspace ? [640, 1280, 1920, 2560] : [480, 768]).map(async (width) => {
        await sharp(bytes)
          .resize({ width, withoutEnlargement: true })
          .webp(workspace ? { quality: 90, smartSubsample: true } : { quality: 80 })
          .toFile(join(app, 'public', `${name}-${width}.webp`));
      }),
    );
  }),
);
const browser = await chromium.launch({
  ...(process.env.CHROME_CHANNEL
    ? { channel: process.env.CHROME_CHANNEL }
    : { executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium' }),
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const fontBytes = await readFile(join(app, 'public/geist.woff2'));
  const font = fontBytes.toString('base64');
  const artBytes = await readFile(join(app, 'public/hero-gearbox.webp'));
  const art = artBytes.toString('base64');
  // The floor dial is projected with the hero camera, so it registers with the poster beneath it.
  const drafting = heroDrafting();
  await page.setContent(
    `<html><head><style>@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font})}body{margin:0;background:#fff;font-family:Geist,sans-serif;color:#1c1c1c}.frame{position:absolute;inset:0 40px;border-left:1px solid #e3e3e3;border-right:1px solid #e3e3e3}.rule{position:absolute;left:0;right:0;top:86px;border-top:1px solid #e3e3e3}main{position:absolute;left:84px;top:132px}p{margin:0;font:500 16px/1 monospace;letter-spacing:2px;color:#6b6b6b;text-transform:uppercase}h1{font-size:112px;line-height:.9;letter-spacing:-6px;font-weight:600;margin:28px 0 0}em{font-style:normal;color:#0f7f78}.mark{position:absolute;left:84px;top:28px;height:32px;width:auto;fill:#1c1c1c}.mark .symbol{fill:#0f7f78}.dial{position:absolute;right:56px;top:96px;width:520px;height:520px;fill:none;stroke:#e3e3e3}.dial *{vector-effect:non-scaling-stroke}.dial .ring,.dial .long{stroke:#c9c9c9}img{position:absolute;right:86px;top:126px;width:460px;height:460px}</style></head><body><div class="frame"></div><div class="rule"></div><svg class="mark" viewBox="${wordmark.viewBox}"><path class="symbol" fill-rule="evenodd" d="${wordmark.symbol}"/><path fill-rule="evenodd" d="${wordmark.letters}"/></svg><main><p>AI-native CAD</p><h1>Design<br>Verify<br><em>Print.</em></h1></main><svg class="dial" viewBox="-65.2 -65.2 1130.4 1130.4"><path d="${drafting.axes}"/><path class="ring" d="${drafting.ring}"/><path d="${drafting.ticks}"/><path class="long" d="${drafting.longTicks}"/></svg><img src="data:image/webp;base64,${art}"></body></html>`,
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: join(app, 'public/social.png') });
} finally {
  await browser.close();
}
