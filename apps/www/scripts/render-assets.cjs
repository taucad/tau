/** Offline asset recipe. Tool dependencies are isolated from the shipped app. */
const { createRequire } = require('node:module');
const { join, resolve } = require('node:path');
const { mkdtemp, readFile, writeFile, cp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');
const { createServer } = require('node:http');
const tools = process.env.WWW_RENDER_TOOLS;
if (!tools) {
  throw new Error('Set WWW_RENDER_TOOLS to the isolated tools directory described in README.md.');
}
const toolRequire = createRequire(join(resolve(tools), 'package.json'));
const { chromium } = toolRequire('playwright');
const sharp = toolRequire('sharp');
const app = resolve(__dirname, '..');
(async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'tau-www-assets-'));
  await cp(
    join(app, '../../libs/tau-examples/src/kernels/replicad/planetary-gear-system/main.ts'),
    join(tools, 'model.ts'),
  );
  await writeFile(
    join(tools, 'export.mjs'),
    `import oc from 'replicad-opencascadejs';import {setOC} from 'replicad';import model from './model.ts';import {writeFile} from 'node:fs/promises';setOC(oc);const parts=model();if(parts.length!==34)throw new Error('Assembly source changed: review the illustration');const meshes=parts.map(({name,shape,color})=>{const mesh=shape.mesh({tolerance:0.15,angularTolerance:0.25});return {name,color,vertices:Array.from(mesh.vertices),normals:Array.from(mesh.normals),triangles:Array.from(mesh.triangles)};});await writeFile(${JSON.stringify(join(scratch, 'model.json'))},JSON.stringify(meshes));`,
  );
  const result = spawnSync(
    process.execPath,
    ['--import', join(tools, 'node_modules/tsx/dist/loader.mjs'), join(tools, 'export.mjs')],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    throw new Error('Assembly export failed.');
  }
  const html = await readFile(join(app, 'scripts/illustration.html'));
  const server = createServer(async (request, res) => {
    try {
      const path = request.url.split('?')[0];
      let body;
      if (path === '/render.html') {
        res.setHeader('Content-Type', 'text/html');
        body = html;
      } else if (path === '/model.json') {
        body = await readFile(join(scratch, 'model.json'));
      } else if (path.startsWith('/node_modules/three/') && !path.includes('..')) {
        res.setHeader('Content-Type', 'text/javascript');
        body = await readFile(join(tools, path));
      } else {
        res.writeHead(404).end();
        return;
      }
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
    await page.goto(`http://127.0.0.1:${server.address().port}/render.html`);
    await page.waitForFunction(() => window.ready, { timeout: 60_000 });
    for (const name of ['assembly', 'exploded']) {
      await page.evaluate((n) => window.renderView(n), name);
      await sharp(await page.screenshot())
        .webp({ quality: 88 })
        .toFile(join(app, 'public', `${name}.webp`));
    }
  } finally {
    await browser.close();
    await new Promise((done) => server.close(done));
    await rm(scratch, { recursive: true, force: true });
  }
})();
