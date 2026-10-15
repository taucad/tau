/**
 * Spike S32 (native-dependency-resolution charter, Q49, Q50, Q52), the cells that run without product changes:
 *   offline  `tau serve --agentPort=0 --relay http://127.0.0.1:1` with no device credential: the descriptor must
 *            answer for 60 s while the daemon warns and stays up.
 *   rung5    a page on a "public" origin (Chromium `--ip-address-space-overrides`) and on a loopback origin, in
 *            Chromium, WebKit and Firefox, fetches the daemon's descriptor and dials `/agent`; a counting TCP proxy in
 *            front of the daemon records which requests reached it, with their Origin and the daemon's answer.
 * Spike code only; nothing ships.
 *
 * Usage: node scripts/spikes/native-deps/linux/s32/run.ts <evidence-dir> [offline|rung5]...
 * Environment: the Tau workspace installed, git and git-lfs on PATH, Playwright browsers for rung5.
 * Exit codes: 0 the cells ran (verdicts in s32.json), 1 a cell could not run, 2 usage.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { connect, createServer as createTcpServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';

import { chromium, firefox, webkit } from 'playwright';
import type { Browser, BrowserType, LaunchOptions } from 'playwright';

const [evidence, ...requested] = process.argv.slice(2);
const cells = requested.length === 0 ? ['offline', 'rung5'] : requested;
if (evidence === undefined || cells.some((cell) => cell !== 'offline' && cell !== 'rung5')) {
  console.error('Usage: run.ts <evidence-dir> [offline|rung5]...');
  process.exit(2);
}
const repoRoot = resolve(import.meta.dirname, '../../../../..');
const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

type Daemon = { readonly child: ChildProcess; readonly url: string; readonly output: () => string };

const startDaemon = async (label: string): Promise<Daemon> => {
  const scratch = mkdtempSync(join(tmpdir(), `tau-s32-${label}-`));
  mkdirSync(join(scratch, 'workspace'));
  const child = spawn(
    process.execPath,
    [
      '--import',
      'tsx',
      join(repoRoot, 'packages/cli/src/bin.ts'),
      'serve',
      '--trust-projects',
      '--agentPort=0',
      `--workspace=${join(scratch, 'workspace')}`,
      '--relay=http://127.0.0.1:1',
      '--no-external-agents',
    ],
    {
      cwd: repoRoot,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- an environment variable name
      env: { ...process.env, TAU_CONFIG_DIR: join(scratch, 'config') },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk: string) => {
    output += chunk;
  });
  const read = (): string => output;
  const deadline = Date.now() + 60_000;
  for (;;) {
    const match = /ready at (?<url>http:\/\/127\.0\.0\.1:\d+)\//u.exec(output);
    const url = match?.groups?.['url'];
    if (url !== undefined) {
      return { child, url, output: read };
    }
    if (child.exitCode !== null || Date.now() > deadline) {
      throw new Error(`tau serve did not report its URL (exit ${String(child.exitCode)}):\n${read()}`);
    }
    // oxlint-disable-next-line no-await-in-loop -- polling the daemon's output
    await delay(200);
  }
};

const stopDaemon = async (daemon: Daemon): Promise<number | undefined> => {
  daemon.child.kill('SIGTERM');
  for (let index = 0; index < 50 && daemon.child.exitCode === null; index += 1) {
    // oxlint-disable-next-line no-await-in-loop -- waiting for exit
    await delay(100);
  }
  return daemon.child.exitCode ?? undefined;
};

const offline = async (): Promise<Record<string, unknown>> => {
  const daemon = await startDaemon('offline');
  const started = Date.now();
  let answered = 0;
  let failedPolls = 0;
  let descriptor: unknown;
  while (Date.now() - started < 60_000) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- one poll per second
      const response = await fetch(`${daemon.url}/.well-known/tau-host`, { signal: AbortSignal.timeout(2000) });
      // oxlint-disable-next-line no-await-in-loop -- ditto
      descriptor = await response.json();
      answered += response.ok ? 1 : 0;
      failedPolls += response.ok ? 0 : 1;
    } catch {
      failedPolls += 1;
    }
    // oxlint-disable-next-line no-await-in-loop -- ditto
    await delay(1000);
  }
  const aliveAfter60 = daemon.child.exitCode === null;
  const warnings = daemon
    .output()
    .split('\n')
    .filter((line) => line.includes('WARN')).length;
  const exitOnTerm = await stopDaemon(daemon);
  writeFileSync(join(evidence, 'offline-serve.log'), daemon.output());
  return {
    cell: 'offline',
    pass: aliveAfter60 && failedPolls === 0 && answered >= 55 && warnings > 0,
    seconds: Math.round((Date.now() - started) / 1000),
    answered,
    failedPolls,
    aliveAfter60,
    warnings,
    exitOnTerm,
    descriptor,
  };
};

type Hit = { readonly line: string; readonly origin: string; readonly status: string };

// A TCP proxy that records the request line, the Origin and the first status line of every connection.
const countingProxy = async (
  target: URL,
): Promise<{ readonly url: string; readonly hits: Hit[]; readonly close: () => void }> => {
  const hits: Hit[] = [];
  const server = createTcpServer((client) => {
    const upstream = connect(Number(target.port), target.hostname);
    let request = '';
    let recorded = false;
    client.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      if (!recorded) {
        request += new TextDecoder('latin1').decode(chunk);
      }
      upstream.write(chunk);
    });
    upstream.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      if (!recorded) {
        recorded = true;
        hits.push({
          line: request.split('\r\n')[0] ?? '',
          origin: /^origin: (?<origin>.*)$/imu.exec(request)?.groups?.['origin']?.trim() ?? '(none)',
          status: new TextDecoder('latin1').decode(chunk).split('\r\n')[0] ?? '',
        });
      }
      client.write(chunk);
    });
    const close = (): void => {
      client.destroy();
      upstream.destroy();
    };
    client.on('close', close);
    upstream.on('close', close);
    client.on('error', close);
    upstream.on('error', close);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
    hits,
    close: () => server.close(),
  };
};

// Runs in the page: the descriptor fetch and two dials, each with its outcome.
const dial = async (input: { readonly daemon: string; readonly token: string }): Promise<Record<string, string>> => {
  const result: Record<string, string> = { origin: location.origin, secure: String(globalThis.isSecureContext) };
  try {
    const response = await fetch(`${input.daemon}/.well-known/tau-host`, { cache: 'no-store' });
    result['descriptor'] = `status ${String(response.status)}`;
  } catch (error) {
    result['descriptor'] = `error ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
  }
  const socket = async (suffix: string): Promise<string> =>
    new Promise((resolve) => {
      const ws = new WebSocket(`${input.daemon.replace('http', 'ws')}/agent${suffix}`);
      const timer = setTimeout(() => {
        resolve('timeout (no open, no close in 10 s)');
      }, 10_000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        ws.close();
        resolve('open');
      });
      ws.addEventListener('close', (event) => {
        clearTimeout(timer);
        resolve(`close ${String(event.code)}`);
      });
    });
  result['agent'] = await socket('');
  result['agentWithQueryToken'] = await socket(`?token=${encodeURIComponent(input.token)}`);
  return result;
};

type Variant = {
  readonly name: string;
  readonly engine: BrowserType;
  readonly launch: LaunchOptions;
  readonly pageUrl: string;
  readonly grant: boolean;
};

const rung5 = async (): Promise<Record<string, unknown>> => {
  const daemon = await startDaemon('rung5');
  const proxy = await countingProxy(new URL(daemon.url));
  const page = new TextEncoder().encode('<!doctype html><meta charset="utf-8"><title>S32</title><p>S32 page</p>');
  const pageServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  await new Promise<void>((resolve) => {
    pageServer.listen(3000, '127.0.0.1', resolve);
  });
  const token = 'fragment-token-the-daemon-cannot-read-today-0123456789';
  const publicFlag = { args: ['--ip-address-space-overrides=127.0.0.1:3000=public'] };
  const variants: Variant[] = [
    { name: 'chromium loopback page', engine: chromium, launch: {}, pageUrl: 'http://localhost:3000/', grant: false },
    {
      name: 'chromium public page',
      engine: chromium,
      launch: publicFlag,
      pageUrl: 'http://127.0.0.1:3000/',
      grant: false,
    },
    {
      name: 'chromium public page + grant',
      engine: chromium,
      launch: publicFlag,
      pageUrl: 'http://127.0.0.1:3000/',
      grant: true,
    },
    { name: 'webkit loopback page', engine: webkit, launch: {}, pageUrl: 'http://localhost:3000/', grant: false },
    { name: 'firefox loopback page', engine: firefox, launch: {}, pageUrl: 'http://localhost:3000/', grant: false },
  ];
  const rows: Array<Record<string, unknown>> = [];
  let failed = false;
  /* oxlint-disable no-await-in-loop -- one browser at a time, so proxy hits attribute to one variant */
  for (const variant of variants) {
    let browser: Browser | undefined;
    const before = proxy.hits.length;
    try {
      browser = await variant.engine.launch(variant.launch);
      const context = await browser.newContext();
      let grant = 'not requested';
      if (variant.grant) {
        try {
          await context.grantPermissions(['local-network-access']);
          grant = 'granted';
        } catch (error) {
          grant = `refused by Playwright: ${error instanceof Error ? (error.message.split('\n')[0] ?? '') : String(error)}`;
        }
      }
      const tab = await context.newPage();
      await tab.goto(`${variant.pageUrl}#token=${token}`);
      const observed = await tab.evaluate(dial, { daemon: proxy.url, token });
      await delay(500);
      rows.push({
        variant: variant.name,
        version: browser.version(),
        grant,
        ...observed,
        reached: proxy.hits.slice(before),
      });
    } catch (error) {
      failed = true;
      rows.push({ variant: variant.name, error: error instanceof Error ? error.message : String(error) });
    } finally {
      await browser?.close();
    }
  }
  /* oxlint-enable no-await-in-loop */
  pageServer.close();
  proxy.close();
  await stopDaemon(daemon);
  return { cell: 'rung5', ran: !failed, daemon: daemon.url, rows };
};

const results: Array<Record<string, unknown>> = [];
let broken = false;
for (const cell of cells) {
  try {
    // oxlint-disable-next-line no-await-in-loop -- cells run one at a time
    results.push(cell === 'offline' ? await offline() : await rung5());
  } catch (error) {
    broken = true;
    results.push({ cell, error: error instanceof Error ? error.message : String(error) });
  }
}
writeFileSync(join(evidence, 's32.json'), `${JSON.stringify(results, undefined, 2)}\n`);
const lines: string[] = [];
for (const result of results) {
  const { rows } = result;
  if (Array.isArray(rows)) {
    lines.push(`rung5 ran=${String(result['ran'])}`);
    for (const row of rows as Array<Record<string, unknown>>) {
      const { reached, ...rest } = row;
      lines.push(`  ${JSON.stringify(rest)}`, `    reached ${JSON.stringify(reached)}`);
    }
  } else {
    lines.push(JSON.stringify(result));
  }
}
writeFileSync(join(evidence, 's32-summary.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(broken ? 1 : 0);
