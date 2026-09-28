/* oxlint-disable jsdoc/no-types, jsdoc-js/no-types -- Plain ESM JavaScript uses JSDoc for parameter and subprocess event types. */
import { plantPublicReport } from '#bench/report-delay';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readSync, rmSync, writeFileSync } from 'node:fs';
import { setTimeout as wait } from 'node:timers/promises';

/** @param {string} name Environment key. @returns {string} Required value. */
const requiredEnvironment = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
};

const directory = `${requiredEnvironment('GEOSPEC_EVENT_CACHE')}/${process.pid}`;
const reportPath = `${directory}/report.json`;
const acknowledgementPath = `${directory}/ack`;
const suitePath = `${directory}/suite.json`;
const statePath = `${directory}/state.json`;
const startPath = `${directory}/start`;
const state = /** @type {import('#bench/worker-state').WorkerState} */ (
  JSON.parse(process.env.GEOSPEC_CAMPAIGN_STATE ?? '{"mode":"cold-process"}')
);
const completePath = `${directory}/complete.json`;
mkdirSync(directory, { recursive: true });
try {
  const child = spawn(
    process.execPath,
    [
      requiredEnvironment('GEOSPEC_EVENT_VITEST_CLI'),
      'run',
      '--config',
      requiredEnvironment('GEOSPEC_EVENT_VITEST_CONFIG'),
      '--silent',
    ],
    {
      cwd: requiredEnvironment('GEOSPEC_EVENT_WORKSPACE'),
      env: {
        ...process.env,
        GEOSPEC_EVENT_REPORT: reportPath,
        GEOSPEC_EVENT_ACK: acknowledgementPath,
        GEOSPEC_EVENT_COMPLETE: completePath,
        GEOSPEC_EVENT_SUITE: suitePath,
        GEOSPEC_EVENT_STATE: statePath,
        GEOSPEC_EVENT_START: startPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (/** @type {string} */ value) => {
    stdout += value;
  });
  child.stderr.setEncoding('utf8').on('data', (/** @type {string} */ value) => {
    stderr += value;
  });
  /** @type {Promise<{code: number | null, signal: NodeJS.Signals | null}>} */
  const completion = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      resolve({ code, signal });
    });
  });
  if (['warm-engine-cold-subject', 'resident-warm', 'incremental-edit'].includes(state.mode)) {
    for (let attempts = 0; attempts < 6000 && !readable(statePath); attempts += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Observe the selected live preparation, without timing it as evaluation.
      await wait(5);
    }
    if (!readable(statePath)) {
      throw new Error('Vitest did not publish its prepared live state.');
    }
    process.stdout.write(
      `${JSON.stringify({ event: 'state-ready', ...JSON.parse(readFileSync(statePath, 'utf8')) })}\n`,
    );
    const start = Buffer.alloc(1);
    if (readSync(0, start, 0, 1, null) !== 1 || start[0] !== 10) {
      throw new Error('Prepared state ACK missing.');
    }
    writeFileSync(startPath, 'start');
  }
  for (let attempts = 0; attempts < 6000 && !readable(reportPath); attempts += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Observe the actual child event without running concurrent polls.
    await wait(5);
  }
  if (!readable(reportPath)) {
    const exit = await completion;
    throw new Error(
      `Vitest consumer exited before its public result event: ${JSON.stringify({ exit, stdout, stderr })}`,
    );
  }
  process.stdout.write(
    `${JSON.stringify({ event: 'first-report', plantedDelayNs: plantPublicReport('firstActionableReportNs'), .../** @type {Record<string, unknown>} */ (JSON.parse(readFileSync(reportPath, 'utf8'))) })}\n`,
  );
  for (let attempts = 0; attempts < 6000 && !readable(suitePath); attempts += 1) {
    // oxlint-disable-next-line no-await-in-loop -- Observe the actual child event without running concurrent polls.
    await wait(5);
  }
  if (!readable(suitePath)) {
    throw new Error('Vitest did not publish its complete public suite.');
  }
  process.stdout.write(
    `${JSON.stringify({ event: 'suite-report', plantedDelayNs: plantPublicReport('suiteReportNs'), .../** @type {Record<string, unknown>} */ (JSON.parse(readFileSync(suitePath, 'utf8'))) })}\n`,
  );
  const acknowledgement = Buffer.alloc(1);
  if (readSync(0, acknowledgement, 0, 1, null) !== 1 || acknowledgement[0] !== 10) {
    throw new Error('Parent did not acknowledge the Vitest public result.');
  }
  writeFileSync(acknowledgementPath, 'ack');
  const exit = await completion;
  if (exit.code !== 0 || !readable(completePath)) {
    throw new Error(`Vitest consumer failed after acknowledgement: ${JSON.stringify({ exit, stdout, stderr })}`);
  }
  const result = /** @type {{cleanup: {close: string}}} */ (JSON.parse(readFileSync(completePath, 'utf8')));
  result.cleanup.close = 'closed-before-wrapper-complete-event';
  process.stdout.write(`${JSON.stringify({ event: 'complete', result })}\n`);
} finally {
  rmSync(directory, { recursive: true, force: true });
}

/** @param {string} path Published event path. @returns {boolean} Whether it is ready. */
function readable(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}
