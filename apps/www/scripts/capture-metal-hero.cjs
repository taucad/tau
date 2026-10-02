/** Capture the original TSL chrome at 2×, then downsample for clean silhouettes. */
const { createRequire } = require('node:module');
const { resolve, join } = require('node:path');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { createServer } = require('node:http');
const tools = process.env.WWW_RENDER_TOOLS;
if (!tools) {
  throw new Error('Set WWW_RENDER_TOOLS to the isolated tools directory.');
}
const requireTools = createRequire(join(resolve(tools), 'package.json'));
const { build } = requireTools('esbuild');
const { chromium } = requireTools('playwright');
const sharp = requireTools('sharp');
const app = resolve(__dirname, '..');
(async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'tau-metal-hero-'));
  await build({
    entryPoints: [join(__dirname, 'metal-hero-entry.mjs')],
    bundle: true,
    format: 'esm',
    outfile: join(scratch, 'hero.mjs'),
    alias: { '#components': join(app, '../ui/app/components') },
    nodePaths: [join(resolve(tools), 'node_modules')],
  });
  const server = createServer(async (request, res) => {
    if (request.url === '/hero.mjs') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(await readFile(join(scratch, 'hero.mjs')));
    } else {
      res.end('<body style="margin:0"><script type="module" src="/hero.mjs"></script>');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1100 }, deviceScaleFactor: 2 });
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.ready, { timeout: 120_000 });
    const buffer = await page.screenshot({ omitBackground: true });
    await sharp(buffer).resize(1100).webp({ quality: 90 }).toFile(join(app, 'public/metal-hero.webp'));
    await sharp(buffer).resize(640).webp({ quality: 88 }).toFile(join(app, 'public/metal-hero-640.webp'));
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
    await rm(scratch, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
