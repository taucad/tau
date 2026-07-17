// S1 Firefox leg: serve the harness and probe the wasm renderer in real
// Firefox twice — first the user's default profile (what the field actually
// has), then, only if that lacks WebGPU, a clean temp profile with the WebGPU
// prefs force-enabled (readiness probe: does wgpu work once Mozilla flips the
// default?). The page double-reports when page-level WebGPU is missing
// (pre-check + worker failure), so each leg drains extra reports briefly to
// capture the worker-context error too. Exit code reflects the DEFAULT
// profile only; the forced-prefs leg is informational.
/* oxlint-disable jsdoc-js/no-types -- This standalone JavaScript probe uses JSDoc as its type surface. */
import { execFile, spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '#spike/server.mjs';

const firefoxBinary = '/Applications/Firefox.app/Contents/MacOS/firefox';
const outDirectory = fileURLToPath(new URL('out', import.meta.url));

/**
 * @param {number} duration Milliseconds.
 * @param {import('./server.mjs').SpikeResult | undefined} value
 * @returns {Promise<import('./server.mjs').SpikeResult | undefined>}
 */
const timeout = async (duration, value) =>
  new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve(value);
    }, duration);
    timer.unref();
  });

/**
 * Run one browser attempt against a fresh harness server and collect every
 * result the page posts (first + drained extras).
 *
 * @param {string} label
 * @param {(url: string) => import('node:child_process').ChildProcess | undefined} launch
 */
const collectLeg = async (label, launch) => {
  const { server, port, nextResult } = await startServer();
  const url = `http://127.0.0.1:${port}/?presentation=1`;
  console.log(`[${label}] opening ${url} in Firefox…`);
  const child = launch(url);

  const first = await Promise.race([
    nextResult(),
    timeout(120_000, { ok: false, error: 'timeout: no result within 120s' }),
  ]);
  const results = [first];
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- sequential drain of a single report queue
    const extra = await Promise.race([nextResult(), timeout(5000, undefined)]);
    if (!extra) {
      break;
    }
    results.push(extra);
  }

  server.close();
  child?.kill();
  return results;
};

/** @param {import('./server.mjs').SpikeResult[]} results */
const summarize = (results) => results.map(({ pngBase64, webpBase64, jpegBase64, ...summary }) => summary);

// Degraded-environment leg (`--degraded`): force WebGPU OFF in a clean
// profile and record the exact failure signal — this is what the thumbnail
// pipeline's availability gate keys on in browsers without WebGPU, so the
// signal itself deserves a measurement, not an assumption.
if (process.argv.includes('--degraded')) {
  const profile = await mkdtemp(join(tmpdir(), 'render-spike-firefox-nogpu-'));
  await writeFile(
    join(profile, 'user.js'),
    [
      'user_pref("dom.webgpu.enabled", false);',
      'user_pref("dom.webgpu.workers.enabled", false);',
      'user_pref("browser.aboutwelcome.enabled", false);',
      'user_pref("browser.shell.checkDefaultBrowser", false);',
    ].join('\n'),
  );
  const degradedResults = await collectLeg('webgpu-disabled-profile', (url) =>
    spawn(firefoxBinary, ['--profile', profile, '--no-remote', '--new-instance', url], { stdio: 'ignore' }),
  );
  console.log(JSON.stringify({ leg: 'webgpu-disabled-profile', results: summarize(degradedResults) }, null, 2));
  await rm(profile, { recursive: true, force: true });
  const cleanSignal = degradedResults.some(
    (result) =>
      result.ok === false &&
      typeof result.error === 'string' &&
      (result.error.includes('navigator.gpu missing') || result.error.includes('navigator.gpu: missing')),
  );
  console.log(JSON.stringify({ verdict: { degradedSignalClean: cleanSignal } }, null, 2));
  // oxlint-disable-next-line unicorn/no-process-exit -- This CLI leg must stop before the default-profile probe starts.
  process.exit(cleanSignal ? 0 : 1);
}

const defaultResults = await collectLeg('default-profile', (url) => {
  execFile('open', ['-a', 'Firefox', url]);
  return undefined; // `open` exits immediately; the user's Firefox stays open, like the Safari leg.
});
const defaultOk = defaultResults.find((result) => result.ok);
console.log(JSON.stringify({ leg: 'default-profile', results: summarize(defaultResults) }, null, 2));

/** @type {import('./server.mjs').SpikeResult[]} */
let forcedResults = [];
if (!defaultOk) {
  const profile = await mkdtemp(join(tmpdir(), 'render-spike-firefox-'));
  await writeFile(
    join(profile, 'user.js'),
    [
      'user_pref("dom.webgpu.enabled", true);',
      'user_pref("dom.webgpu.workers.enabled", true);',
      'user_pref("gfx.webgpu.ignore-blocklist", true);',
      'user_pref("browser.aboutwelcome.enabled", false);',
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("datareporting.policy.firstRunURL", "");',
    ].join('\n'),
  );
  forcedResults = await collectLeg('forced-prefs-profile', (url) =>
    spawn(firefoxBinary, ['--profile', profile, '--no-remote', '--new-instance', url], { stdio: 'ignore' }),
  );
  console.log(JSON.stringify({ leg: 'forced-prefs-profile', results: summarize(forcedResults) }, null, 2));
  await rm(profile, { recursive: true, force: true });
}

const winner = defaultOk ?? forcedResults.find((result) => result.ok);
if (winner?.pngBase64) {
  await mkdir(outDirectory, { recursive: true });
  await writeFile(`${outDirectory}/firefox.png`, Buffer.from(winner.pngBase64, 'base64'));
  console.log('saved spike/out/firefox.png');
  if (winner.webpBase64) {
    await writeFile(`${outDirectory}/firefox.webp`, Buffer.from(winner.webpBase64, 'base64'));
  }
  if (winner.jpegBase64) {
    await writeFile(`${outDirectory}/firefox.jpg`, Buffer.from(winner.jpegBase64, 'base64'));
  }
}

console.log(
  JSON.stringify(
    {
      verdict: {
        defaultProfile: Boolean(defaultOk),
        forcedPrefsProfile: defaultOk ? 'not-attempted' : Boolean(forcedResults.find((result) => result.ok)),
      },
    },
    null,
    2,
  ),
);
console.log('(you can close the Firefox tab now)');
process.exitCode = defaultOk ? 0 : 1;
