import { loadPlaywright, loadSharp, serial } from '#tools/tooling.js';
/** Rebuild responsive assets from committed Tau sources; no image service is used. */
import { resolve, join } from 'node:path';
import { readFile } from 'node:fs/promises';
const sharp = await loadSharp();
const { chromium } = await loadPlaywright();
const app = resolve(import.meta.dirname, '..');
const sources = {
  workspace: 'apps/ui/app/routes/_index/tau-desktop-light.webp',
  quadcopter: 'libs/tau-examples/src/kernels/openscad/arq5-racing-quadcopter/thumbnail.webp',
  engine: 'libs/tau-examples/src/kernels/replicad/v8-engine/thumbnail.webp',
  'heat-exchanger': 'libs/tau-examples/src/kernels/replicad/heat-exchanger/thumbnail.webp',
};
await Promise.all(
  Object.entries(sources).map(async ([name, source]) => {
    const bytes = await readFile(resolve(app, '../..', source));
    await Promise.all(
      (name === 'workspace' ? [640, 1280] : [480, 768]).map(async (width) => {
        await sharp(bytes)
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toFile(join(app, 'public', `${name}-${width}.webp`));
      }),
    );
  }),
);
await Promise.all(
  ['assembly', 'exploded'].map(async (name) => {
    await sharp(join(app, 'public', `${name}.webp`))
      .resize(640)
      .webp({ quality: 85 })
      .toFile(join(app, 'public', `${name}-640.webp`));
  }),
);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const fontBytes = await readFile(join(app, 'public/geist.woff2'));
  const font = fontBytes.toString('base64');
  const artBytes = await readFile(join(app, 'public/metal-hero.webp'));
  const art = artBytes.toString('base64');
  await page.setContent(
    `<html><head><style>@font-face{font-family:Geist;src:url(data:font/woff2;base64,${font})}body{margin:0;background:#f6f6f6;font-family:Geist,sans-serif;color:#202020}main{padding:58px 72px}p{font-size:24px}h1{font-size:70px;line-height:1.02;letter-spacing:-4px;font-weight:500;margin-top:72px}em{font-style:normal;color:#007e78}img{position:absolute;right:0;top:50px;width:520px;height:520px}footer{font-size:22px;margin-top:48px;color:#555}</style></head><body><main><p>tau</p><h1>Design, verify,<br>print<br><em>everywhere.</em></h1><footer>AI-native CAD · Editable by design</footer><img src="data:image/webp;base64,${art}"></main></body></html>`,
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path: join(app, 'public/social.png') });
} finally {
  await browser.close();
}
