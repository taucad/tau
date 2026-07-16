/* oxlint-disable jsdoc-js/no-types -- typed JavaScript spike */
// Codec benchmark, Chrome leg: run the bench sweep (?bench=1) in headless
// Chromium over WebGPU and print the JSON report to stdout. Page console
// goes to stderr so stdout stays machine-readable.
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import { startServer } from '#spike/server.mjs';

const native = /** @type {{ codecConformance: () => string }} */ (createRequire(import.meta.url)('./render-napi.node'));

/** @param {string} json @returns {unknown} */
const parseReport = (json) => /** @type {unknown} */ (JSON.parse(json));

const { server, port, nextResult } = await startServer();
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage();
page.on('console', (message) => {
  console.error(`  [page] ${message.text()}`);
});

/** @type {Promise<import('./server.mjs').SpikeResult>} */
const timeoutResult = new Promise((resolve) => {
  const timer = setTimeout(() => {
    resolve({ ok: false, error: 'timeout: no bench result within 300s' });
  }, 300_000);
  timer.unref();
});

const reported = nextResult();
await page.goto(`http://127.0.0.1:${port}/?bench=1`);
const payload = await Promise.race([reported, timeoutResult]);
await browser.close();
server.close();

if (payload.ok) {
  const nativeConformance = parseReport(native.codecConformance());
  if (JSON.stringify(payload.codecConformance) !== JSON.stringify(nativeConformance)) {
    payload.ok = false;
    payload.error = 'wasm codec bytes differ from native fixed-fixture bytes';
  }
}

console.log(JSON.stringify(payload, null, 2));
process.exitCode = payload.ok ? 0 : 1;
