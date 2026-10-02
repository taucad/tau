import { listenLocal, closeServer, loadPlaywright, loadEsbuild, loadSharp } from '#tools/tooling.js';
/** Capture the original TSL chrome at 2×, then downsample for clean silhouettes. */
import { resolve, join } from 'node:path';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
const tools = process.env.WWW_RENDER_TOOLS;
if (!tools) {
  throw new Error('Set WWW_RENDER_TOOLS to the isolated tools directory.');
}
const { build } = await loadEsbuild();
const { chromium } = await loadPlaywright();
const sharp = await loadSharp();
const app = resolve(import.meta.dirname, '..');
const output = resolve(process.env.WWW_CAPTURE_DIR ?? join(app, 'public'));
await mkdir(output, { recursive: true });
const scratch = await mkdtemp(join(tmpdir(), 'tau-metal-hero-'));
await build({
  entryPoints: [join(import.meta.dirname, 'metal-hero-entry.mjs')],
  bundle: true,
  format: 'esm',
  outfile: join(scratch, 'hero.mjs'),
  alias: { '#components': join(app, '../ui/app/components') },
  nodePaths: [join(resolve(tools), 'node_modules')],
});
const server = createServer(async (request, response) => {
  if (request.url === '/hero.mjs') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(await readFile(join(scratch, 'hero.mjs')));
  } else {
    response.end('<body style="margin:0"><script type="module" src="/hero.mjs"></script>');
  }
});
const port = await listenLocal(server);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 2 });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.waitForFunction(() => document.documentElement.dataset.captureReady === 'true', { timeout: 120_000 });
  const buffer = await page.screenshot({ omitBackground: true });
  await sharp(buffer).resize(1100).webp({ quality: 90 }).toFile(join(output, 'metal-hero.webp'));
  await sharp(buffer).resize(640).webp({ quality: 88 }).toFile(join(output, 'metal-hero-640.webp'));
} finally {
  await browser.close();
  await closeServer(server);
  await rm(scratch, { recursive: true, force: true });
}
