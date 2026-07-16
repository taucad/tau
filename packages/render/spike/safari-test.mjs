// S1 Safari leg: serve the harness, open it in the real installed Safari
// (WebGPU-in-worker needs Safari 26+), and wait for the page to POST its
// result back. The second in-worker render probes the known Safari 26
// device-lost bug class (wgpu-style render passes).
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from '#spike/server.mjs';

const outDirectory = fileURLToPath(new URL('out', import.meta.url));
const { server, port, nextResult } = await startServer();
const url = `http://127.0.0.1:${port}/`;

console.log(`opening ${url} in Safari…`);
execFile('open', ['-a', 'Safari', url]);

/** @type {() => Promise<import('./server.mjs').SpikeResult>} */
const timeoutResult = async () =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, error: 'timeout: no result within 120s' });
    }, 120_000);
    timer.unref();
  });

const payload = await Promise.race([nextResult(), timeoutResult()]);
server.close();

const { pngBase64, webpBase64, jpegBase64, ...summary } = payload;
console.log(JSON.stringify(summary, null, 2));
if (pngBase64) {
  await mkdir(outDirectory, { recursive: true });
  await writeFile(`${outDirectory}/safari.png`, Buffer.from(pngBase64, 'base64'));
  console.log('saved spike/out/safari.png');
}
if (webpBase64) {
  await writeFile(`${outDirectory}/safari.webp`, Buffer.from(webpBase64, 'base64'));
}
if (jpegBase64) {
  await writeFile(`${outDirectory}/safari.jpg`, Buffer.from(jpegBase64, 'base64'));
}
console.log('(you can close the Safari tab now)');
process.exitCode = payload.ok ? 0 : 1;
