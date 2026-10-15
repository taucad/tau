#!/usr/bin/env node

/**
 * Purpose: Spike S28 (native dependency charter, D9/D23): do the preparation host's parallel download streams fill a
 *   consumer link, does progress stay live, and does a cancel leave nothing in `tmp/`?
 * Why: D9 fixes 4–6 parallel streams hashing while streaming; D23's end-to-end budgets assume the link is the
 *   bottleneck at 100 and 25 Mbit/s.
 * Environment: Node 24+; network to the manifest's origins (PBS on GitHub, PyPI). A local CONNECT proxy shapes the
 *   downstream bytes of every tunnel through one shared token bucket, standing in for the consumer link; the host
 *   reaches it through `HTTPS_PROXY` and `NODE_USE_ENV_PROXY=1` (D9's start-up facts).
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/s28-throttled-streams.mts --work <dir>
 *   --out <dir> [--rates 100,25] (internal modes: --mode proxy|prepare)
 * Exit codes: 0 when every leg ran (the verdict is in the summary); 1 on a harness failure.
 */

/* oxlint-disable no-await-in-loop -- legs run one after another on one link. */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, connect } from 'node:net';
import type { Socket } from 'node:net';
import { join } from 'node:path';
import process from 'node:process';

import { createPreparationHost, detectHostIndicators } from '@taucad/runtime/preparation/node';

/* oxlint-disable no-restricted-imports -- spike-only: siblings and the CLI's native roster by relative path; deleted with W21. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- spike-only: the CLI roster is not a public export.
import { nativePreparationPlugins } from '../../../packages/cli/src/native-kernels.ts';
import { hostFacts, parseFlags, requiredFlag } from './spike-common.mts';
import { round1, runTau, Summary, tail } from './store-spike.mts';
/* oxlint-enable no-restricted-imports */

const tickMilliseconds = 5;
const logMilliseconds = 100;

/**
 * A CONNECT proxy whose tunnels share one downstream token bucket of `rate` bit/s. Writes one line per 100 ms to
 * `log`: elapsed ms, downstream bytes in the interval, open tunnels.
 */
const runProxy = (rateMbit: number, portFile: string, log: string): void => {
  const bytesPerTick = (rateMbit * 1e6) / 8 / (1000 / tickMilliseconds);
  const burst = bytesPerTick * 4;
  let tokens = 0;
  const queue: Array<{ chunk: Uint8Array<ArrayBuffer>; client: Socket; upstream: Socket }> = [];
  let open = 0;
  let intervalBytes = 0;
  const started = Date.now();
  writeFileSync(log, '');
  const pump = (): void => {
    while (queue.length > 0 && tokens > 0) {
      const head = queue[0]!;
      const take = Math.min(head.chunk.length, Math.floor(tokens));
      if (take <= 0) {
        break;
      }
      if (!head.client.destroyed) {
        head.client.write(head.chunk.subarray(0, take));
      }
      tokens -= take;
      intervalBytes += take;
      if (take === head.chunk.length) {
        queue.shift();
        if (!queue.some((entry) => entry.upstream === head.upstream)) {
          head.upstream.resume();
        }
      } else {
        head.chunk = head.chunk.subarray(take);
      }
    }
  };
  // Refill by elapsed time, not per tick: timers fire late under load, which would silently lower the link rate.
  const bytesPerMillisecond = (rateMbit * 1e6) / 8 / 1000;
  let refilled = performance.now();
  setInterval(() => {
    const now = performance.now();
    tokens = Math.min(burst, tokens + bytesPerMillisecond * (now - refilled));
    refilled = now;
    pump();
  }, tickMilliseconds);
  setInterval(() => {
    appendFileSync(log, `${String(Date.now() - started)}\t${String(intervalBytes)}\t${String(open)}\n`);
    intervalBytes = 0;
  }, logMilliseconds);
  const server = createServer((client) => {
    client.once('data', (head: Uint8Array<ArrayBuffer>) => {
      const match = /^CONNECT ([^\s:]+):(\d+) HTTP\/1\.[01]\r\n/u.exec(new TextDecoder('latin1').decode(head));
      if (match === null) {
        client.end('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
        return;
      }
      const upstream = connect(Number(match[2]), match[1], () => {
        open += 1;
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        client.pipe(upstream);
        upstream.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
          upstream.pause();
          queue.push({ chunk, client, upstream });
        });
      });
      const close = (): void => {
        if (!upstream.destroyed) {
          upstream.destroy();
        }
        if (!client.destroyed) {
          client.destroy();
        }
      };
      let counted = true;
      upstream.once('close', () => {
        if (counted) {
          counted = false;
          open = Math.max(0, open - 1);
        }
        // Let queued bytes drain before closing the client side.
        const drain = setInterval(() => {
          if (!queue.some((entry) => entry.client === client)) {
            clearInterval(drain);
            client.end();
          }
        }, 20);
      });
      upstream.once('error', close);
      client.once('error', close);
      client.once('close', () => {
        upstream.destroy();
      });
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    writeFileSync(portFile, String(typeof address === 'object' && address !== null ? address.port : 0));
  });
};

/** One host-level preparation of build123d from its origins, with every progress event timestamped. */
const runPrepare = async (store: string, events: string, cancelAt: number | undefined): Promise<void> => {
  const plugins = await nativePreparationPlugins();
  const indicators = detectHostIndicators();
  const host = createPreparationHost({ plugins, store, ...(indicators === undefined ? {} : { indicators }) });
  const controller = new AbortController();
  const started = performance.now();
  writeFileSync(events, '');
  host.on('preparation', ({ selection, state }) => {
    if (selection.package !== '@taucad/build123d') {
      return;
    }
    const row = {
      t: Math.round(performance.now() - started),
      status: state.status,
      ...(state.status === 'preparing'
        ? {
            phase: state.phase,
            payload: state.payload,
            completedBytes: state.completedBytes,
            totalBytes: state.totalBytes,
            completedPayloads: state.completedPayloads,
          }
        : {}),
    };
    appendFileSync(events, `${JSON.stringify(row)}\n`);
    if (
      cancelAt !== undefined &&
      state.status === 'preparing' &&
      state.completedBytes >= cancelAt * state.totalBytes &&
      !controller.signal.aborted
    ) {
      appendFileSync(events, `${JSON.stringify({ t: row.t, cancel: true })}\n`);
      controller.abort(new Error('S28 cancel'));
    }
  });
  try {
    const outcome = await host.prepare({ package: '@taucad/build123d', signal: controller.signal });
    appendFileSync(
      events,
      `${JSON.stringify({ t: Math.round(performance.now() - started), outcome: outcome.status })}\n`,
    );
  } catch (error) {
    appendFileSync(events, `${JSON.stringify({ t: Math.round(performance.now() - started), error: String(error) })}\n`);
  } finally {
    host.dispose();
  }
  appendFileSync(events, `${JSON.stringify({ t: Math.round(performance.now() - started), disposed: true })}\n`);
};

const waitForFile = async (path: string): Promise<string> => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(path) && readFileSync(path, 'utf8').length > 0) {
      return readFileSync(path, 'utf8');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  throw new Error(`${path} never appeared`);
};

const exited = async (child: ChildProcess): Promise<number | undefined> =>
  new Promise((resolve) => {
    child.once('exit', (code) => {
      resolve(code ?? undefined);
    });
  });

type EventRow = {
  readonly t: number;
  readonly status?: string;
  readonly phase?: string;
  readonly completedBytes?: number;
  readonly totalBytes?: number;
  readonly cancel?: boolean;
  readonly outcome?: string;
  readonly error?: string;
};

/** Utilisation, stream and cadence figures of one leg. */
const analyse = (rateMbit: number, proxyLog: string, eventsFile: string): Record<string, unknown> => {
  const intervals = readFileSync(proxyLog, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t').map(Number));
  // Each row: elapsed milliseconds, downstream bytes in the interval, open tunnels.
  const active = intervals.filter((row) => (row[1] ?? 0) > 0);
  const first = active[0]?.[0] ?? 0;
  const last = active.at(-1)?.[0] ?? 0;
  const windowSeconds = (last - first + logMilliseconds) / 1000;
  const bytes = intervals.reduce((total, row) => total + (row[1] ?? 0), 0);
  const capacity = ((rateMbit * 1e6) / 8) * windowSeconds;
  const inWindow = intervals.filter((row) => (row[0] ?? 0) >= first && (row[0] ?? 0) <= last);
  const events = readFileSync(eventsFile, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as EventRow);
  const downloading = events.filter((event) => event.phase === 'downloading' || event.phase === 'verifying');
  const progress = events.filter((event) => event.status === 'preparing');
  // Cadence while bytes flow: the largest gap between consecutive progress events inside the download window.
  const firstDownload = downloading[0]?.t ?? 0;
  const lastDownload = downloading.at(-1)?.t ?? 0;
  const windowEvents = progress.filter((event) => event.t >= firstDownload && event.t <= lastDownload);
  let maxGap = 0;
  for (let index = 1; index < windowEvents.length; index += 1) {
    maxGap = Math.max(maxGap, windowEvents[index]!.t - windowEvents[index - 1]!.t);
  }
  // Seconds of the window that saw no progress event at all.
  const silentSeconds = new Set<number>();
  for (let second = Math.floor(firstDownload / 1000); second <= Math.floor(lastDownload / 1000); second += 1) {
    silentSeconds.add(second);
  }
  for (const event of windowEvents) {
    silentSeconds.delete(Math.floor(event.t / 1000));
  }
  return {
    rateMbit,
    proxyBytes: bytes,
    linkWindowSeconds: round1(windowSeconds),
    utilisation: round1((bytes / capacity) * 100),
    meanMbit: round1((bytes * 8) / windowSeconds / 1e6),
    maxTunnels: Math.max(0, ...inWindow.map((row) => row[2] ?? 0)),
    meanTunnels: round1(inWindow.reduce((total, row) => total + (row[2] ?? 0), 0) / Math.max(1, inWindow.length)),
    idleIntervalsInWindow: inWindow.filter((row) => row[1] === 0).length,
    progressEvents: progress.length,
    downloadWindowSeconds: round1((lastDownload - firstDownload) / 1000),
    progressPerSecond: round1(windowEvents.length / Math.max(0.001, (lastDownload - firstDownload) / 1000)),
    maxProgressGapMilliseconds: maxGap,
    secondsWithoutProgress: silentSeconds.size,
    phases: [...new Set(progress.map((event) => event.phase))],
    outcome: events.find((event) => event.outcome !== undefined)?.outcome ?? events.find((event) => event.error)?.error,
    totalMilliseconds: events.at(-1)?.t,
  };
};

const stagingEntries = (store: string): string[] => {
  const staging = join(store, 'tmp');
  return existsSync(staging) ? readdirSync(staging, { recursive: true }).map(String) : [];
};

/** Start the shaping proxy for one leg; its port and per-100 ms log live under `root`. */
const startProxy = async (
  root: string,
  rate: number,
  leg: string,
): Promise<{ proxy: ChildProcess; port: string; log: string }> => {
  const portFile = join(root, `${leg}.port`);
  const log = join(root, `${leg}-proxy.tsv`);
  const proxy = spawn(
    process.execPath,
    [
      '--import',
      '@oxc-node/core/register',
      import.meta.filename,
      '--mode',
      'proxy',
      '--rate',
      String(rate),
      '--port-file',
      portFile,
      '--log',
      log,
    ],
    { stdio: 'inherit' },
  );
  return { proxy, port: await waitForFile(portFile), log };
};

/** D9's proxy start-up facts for a child: the proxy URL and Node's opt-in to honour it. */
const proxyEnvironment = (port: string): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const name of ['HTTPS_PROXY', 'HTTP_PROXY', 'https_proxy', 'http_proxy']) {
    env[name] = `http://127.0.0.1:${port}`;
  }
  env['NO_PROXY'] = '';
  env['no_proxy'] = '';
  env['NODE_USE_ENV_PROXY'] = '1';
  return env;
};

/** The CLI path: `tau prepare build123d` gets SIGINT once 40 % of the bytes went through. */
const cliSigintLeg = async (rate: number, root: string, summary: Summary): Promise<Record<string, unknown>> => {
  const leg = `${String(rate)}mbit-cli-sigint`;
  const configDirectory = join(root, `${leg}-config`);
  const { proxy, port, log } = await startProxy(root, rate, leg);
  let sent = false;
  let child: ChildProcess | undefined;
  const run = await runTau(['prepare', 'build123d'], {
    configDirectory,
    env: proxyEnvironment(port),
    onStderr: (text) => {
      // "downloading <payload> (12.3 MB of 193.7 MB, ...)"
      const match = /\((?<done>[\d.]+) MB of (?<total>[\d.]+) MB/u.exec(text);
      if (!sent && match !== null && Number(match.groups!['done']) >= 0.4 * Number(match.groups!['total'])) {
        sent = true;
        child?.kill('SIGINT');
      }
    },
    onSpawn: (spawned) => {
      child = spawned;
    },
  });
  proxy.kill('SIGTERM');
  await exited(proxy);
  const leftovers = stagingEntries(join(configDirectory, 'payloads'));
  const record = {
    leg,
    sigintSent: sent,
    exitCode: run.exitCode,
    signal: run.signal,
    milliseconds: run.milliseconds,
    stderrTail: tail(run.stderr, 400),
    tmpLeftovers: leftovers.length,
    tmpSample: leftovers.slice(0, 10),
    progressLines: run.stderr.split('\n').filter((line) => line.includes(' MB of ')).length,
  };
  summary.line(`${leg}: ${JSON.stringify(record).slice(0, 1200)}`);
  rmSync(configDirectory, { recursive: true, force: true });
  return record;
};

const main = async (): Promise<void> => {
  const flags = parseFlags(['work', 'out', 'rates']);
  const work = requiredFlag(flags, 'work');
  const out = requiredFlag(flags, 'out');
  const rates = (flags.get('rates') ?? '100,25').split(',').map(Number);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(out, { recursive: true });
  const root = realpathSync(work);
  const summary = new Summary(join(out, 's28-summary.txt'));
  const host = hostFacts();
  summary.line(
    `S28 host: ${host.cpuModel ?? '?'} x${String(host.parallelism)}, ${host.platform} ${host.productVersion ?? host.osRelease}`,
  );
  const legs: Array<Record<string, unknown>> = [];

  for (const rate of rates) {
    for (const cancel of [undefined, 0.4]) {
      const leg = `${String(rate)}mbit${cancel === undefined ? '' : '-cancel'}`;
      const store = join(root, `${leg}-store`);
      const events = join(root, `${leg}-events.ndjson`);
      const { proxy, port, log } = await startProxy(root, rate, leg);
      const child = spawn(
        process.execPath,
        [
          '--import',
          '@oxc-node/core/register',
          import.meta.filename,
          '--mode',
          'prepare',
          '--store',
          store,
          '--events',
          events,
          ...(cancel === undefined ? [] : ['--cancel-at', String(cancel)]),
        ],
        { stdio: 'inherit', env: { ...process.env, ...proxyEnvironment(port) } },
      );
      const code = await exited(child);
      const leftovers = stagingEntries(store);
      proxy.kill('SIGTERM');
      await exited(proxy);
      const figures = analyse(rate, log, events);
      const record = {
        leg,
        childExit: code,
        tmpLeftovers: leftovers.length,
        tmpSample: leftovers.slice(0, 10),
        ...figures,
      };
      legs.push(record);
      writeFileSync(join(out, `s28-${leg}-events.ndjson`), readFileSync(events));
      writeFileSync(join(out, `s28-${leg}-proxy.tsv`), readFileSync(log));
      summary.line(`${leg}: ${JSON.stringify(record).slice(0, 1400)}`);
      // Keep the disk free for the next leg.
      rmSync(store, { recursive: true, force: true });
    }

    legs.push(await cliSigintLeg(rate, root, summary));
  }
  writeFileSync(join(out, 's28-records.json'), `${JSON.stringify({ host, legs }, undefined, 2)}\n`);
  for (const record of legs.filter(
    (entry) => !String(entry['leg']).endsWith('cancel') && !String(entry['leg']).endsWith('sigint'),
  )) {
    summary.line(
      `S28 ${String(record['leg'])}: utilisation ${String(record['utilisation'])} % (line ≥ 80 %), ${String(record['progressPerSecond'])} progress events/s, max gap ${String(record['maxProgressGapMilliseconds'])} ms (line ≥ 1/s), streams max ${String(record['maxTunnels'])} mean ${String(record['meanTunnels'])}`,
    );
  }
  for (const record of legs.filter(
    (entry) => String(entry['leg']).endsWith('cancel') || String(entry['leg']).endsWith('sigint'),
  )) {
    summary.line(`S28 ${String(record['leg'])}: tmp/ leftovers ${String(record['tmpLeftovers'])} (line 0)`);
  }
};

const modeIndex = process.argv.indexOf('--mode');
const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};
if (modeIndex === -1) {
  await main();
} else if (process.argv[modeIndex + 1] === 'proxy') {
  runProxy(Number(argument('rate')), argument('port-file')!, argument('log')!);
} else {
  const cancelAt = argument('cancel-at');
  await runPrepare(argument('store')!, argument('events')!, cancelAt === undefined ? undefined : Number(cancelAt));
}
