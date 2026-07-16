/* oxlint-disable jsdoc-js/no-types -- typed JavaScript spike */
// Codec benchmark, installed-browser leg: serve the harness, open ?bench=1,
// and print the JSON report once the page POSTs it back. Defaults to Safari;
// BENCH_BROWSER selects another installed browser.
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { startServer } from '#spike/server.mjs';

const native = /** @type {{ codecConformance: () => string }} */ (createRequire(import.meta.url)('./render-napi.node'));
const browserName = process.env.BENCH_BROWSER ?? 'Safari';

/** @param {string} json @returns {unknown} */
const parseReport = (json) => /** @type {unknown} */ (JSON.parse(json));

const { server, port, nextResult } = await startServer();
const url = `http://127.0.0.1:${port}/?bench=1`;

console.error(`opening ${url} in ${browserName}…`);
execFile('open', ['-a', browserName, url]);

/** @type {Promise<import('./server.mjs').SpikeResult>} */
const timeoutResult = new Promise((resolve) => {
  const timer = setTimeout(() => {
    resolve({ ok: false, error: 'timeout: no bench result within 300s' });
  }, 300_000);
  timer.unref();
});

const payload = await Promise.race([nextResult(), timeoutResult]);
server.close();

if (payload.ok) {
  const nativeConformance = parseReport(native.codecConformance());
  if (JSON.stringify(payload.codecConformance) !== JSON.stringify(nativeConformance)) {
    payload.ok = false;
    payload.error = 'wasm codec bytes differ from native fixed-fixture bytes';
  }
}

console.log(JSON.stringify(payload, null, 2));
console.error(`(you can close the ${browserName} tab now)`);
process.exitCode = payload.ok ? 0 : 1;
