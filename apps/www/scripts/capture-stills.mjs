/**
 * Capture the hero poster and the nine story stills from the shipped scene module, so the
 * no-WebGL and reduced-motion paths show exactly what the live renderer draws.
 * Requires a GPU-capable Chrome (CHROME_CHANNEL=chrome by default).
 */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { loadEsbuild, loadPlaywright, loadSharp, serial } from '#tools/tooling.js';

const app = resolve(import.meta.dirname, '..');
const work = await mkdtemp(join(tmpdir(), 'www-stills-'));
const { build } = await loadEsbuild();
await writeFile(
  join(work, 'entry.mjs'),
  `import { loadAssembly, createScene } from ${JSON.stringify(join(app, 'src/scene.mjs'))};
const assembly = await loadAssembly(new AbortController().signal);
const scene = createScene(assembly);
globalThis.capture = async (view, size) => {
  const host = document.querySelector('#host');
  host.style.width = host.style.height = size + 'px';
  scene.attach(host);
  await new Promise((r) => requestAnimationFrame(r));
  await scene.compile();
  scene.draw(view);
  return scene.canvas.toDataURL('image/png');
};
document.documentElement.dataset.ready = 'true';`,
);
await build({
  entryPoints: [join(work, 'entry.mjs')],
  bundle: true,
  format: 'esm',
  outfile: join(work, 'entry.js'),
  absWorkingDir: app,
});
/** @type {Record<string, string>} */
const types = { '.js': 'text/javascript', '.json': 'application/json', '.gz': 'application/gzip' };
const server = createServer(async (request, response) => {
  const path = new URL(request.url ?? '/', 'http://x').pathname;
  try {
    if (path === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end(
        '<!doctype html><body style="margin:0;background:transparent"><div id="host"></div><script type="module" src="/entry.js"></script>',
      );
      return;
    }
    const file = path === '/entry.js' ? join(work, 'entry.js') : join(app, 'public', path.replace('/_www/assets/', ''));
    response.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    resolve(undefined);
  });
});
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL ?? 'chrome',
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const sharp = await loadSharp();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  page.on('console', (message) => {
    console.log('[page]', message.text());
  });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForSelector('html[data-ready="true"]', { state: 'attached', timeout: 60_000 });
  /** @type {(view: object, size: number) => Promise<Buffer>} */
  const shot = async (view, size) => {
    const url = await page.evaluate(
      async ([v, s]) =>
        /** @type {{capture: (view: object, size: number) => Promise<string>}} */ (
          /** @type {unknown} */ (globalThis)
        ).capture(v, s),
      /** @type {const} */ ([view, size]),
    );
    return Buffer.from(String(url).split(',')[1] ?? '', 'base64');
  };
  // Hero: rest pose at the authored inputAngle 0, before any interaction.
  const hero = await shot({ kind: 'hero', sunAngle: 0, narrow: false }, 1200);
  // Lossless alpha keeps the soft floor shadow free of banding, and costs no more than lossy alpha here.
  await sharp(hero).webp({ quality: 82, alphaQuality: 100, effort: 6 }).toFile(join(app, 'public/hero-gearbox.webp'));
  await sharp(hero)
    .resize(720)
    .webp({ quality: 80, alphaQuality: 100, effort: 6 })
    .toFile(join(app, 'public/hero-gearbox-720.webp'));
  const progress = [0.6, 1.6, 2.75, 3.75, 4.8, 5.9, 6.5, 7.75, 8.6];
  // One page, one canvas: stills render in order.
  await serial([...progress.entries()], async ([index, p]) => {
    const still = await shot({ kind: 'story', progress: p, narrow: false }, 1000);
    await sharp(still)
      .webp({ quality: 80, alphaQuality: 100, effort: 6 })
      .toFile(join(app, `public/story-${index}.webp`));
  });
  console.log('Captured hero and 9 story stills.');
} finally {
  await browser.close();
  server.close();
  await rm(work, { recursive: true, force: true });
}
