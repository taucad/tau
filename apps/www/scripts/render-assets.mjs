import { listenLocal, closeServer, serial, loadPlaywright, loadSharp } from '#tools/tooling.js';
/** Offline asset recipe. Tool dependencies are isolated from the shipped app. */
import { join, resolve } from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
const tools = process.env.WWW_RENDER_TOOLS;
if (!tools) {
  throw new Error('Set WWW_RENDER_TOOLS to the isolated tools directory described in README.md.');
}
const { chromium } = await loadPlaywright();
const sharp = await loadSharp();
const app = resolve(import.meta.dirname, '..');
const output = resolve(process.env.WWW_CAPTURE_DIR ?? join(app, 'public'));
await mkdir(output, { recursive: true });
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
const server = createServer(async (request, response) => {
  try {
    const path = request.url.split('?')[0];
    let body;
    if (path === '/render.html') {
      response.setHeader('Content-Type', 'text/html');
      body = html;
    } else if (path === '/model.json') {
      body = await readFile(join(scratch, 'model.json'));
    } else if (path.startsWith('/node_modules/three/') && !path.includes('..')) {
      response.setHeader('Content-Type', 'text/javascript');
      body = await readFile(join(tools, path));
    } else {
      response.writeHead(404).end();
      return;
    }
    response.end(body);
  } catch {
    response.writeHead(404).end();
  }
});
const port = await listenLocal(server);
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
  await page.goto(`http://127.0.0.1:${port}/render.html`);
  await page.waitForFunction(() => document.documentElement.dataset.captureReady === 'true', { timeout: 60_000 });
  await serial(['assembly', 'exploded'], async (name) => {
    await page.evaluate((name) => {
      document.dispatchEvent(new CustomEvent('tau-render-view', { detail: name }));
    }, name);
    await sharp(await page.screenshot())
      .webp({ quality: 88 })
      .toFile(join(output, `${name}.webp`));
  });
} finally {
  await browser.close();
  await closeServer(server);
  await rm(scratch, { recursive: true, force: true });
}
