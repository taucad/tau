/* oxlint-disable jsdoc-js/no-types -- typed JavaScript spike */
// Codec benchmark, napi leg: sweep the standard sizes through the native
// addon and print the JSON report to stdout (progress on stderr).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** @param {string} json @returns {unknown} */
const parseReport = (json) => /** @type {unknown} */ (JSON.parse(json));
const native =
  /** @type {{ benchCodecs: (glb: Buffer, width: number, height: number) => string, benchMultiView: (glb: Buffer, width: number, height: number) => string, codecConformance: () => string, describeAdapter: () => string }} */ (
    createRequire(import.meta.url)('./render-napi.node')
  );

const glb = readFileSync(join(here, 'fixtures', 'gear-12.glb'));
const results = [];
for (const [width, height] of [
  [640, 360],
  [768, 576],
  [1280, 720],
  [1920, 1080],
  [2560, 1440],
  [3840, 2160],
]) {
  console.error(`${width}x${height}…`);
  results.push(parseReport(native.benchCodecs(glb, width, height)));
}
const multiView = parseReport(native.benchMultiView(glb, 768, 432));
const codecConformance = parseReport(native.codecConformance());
console.log(JSON.stringify({ adapter: native.describeAdapter(), codecConformance, results, multiView }, null, 2));
