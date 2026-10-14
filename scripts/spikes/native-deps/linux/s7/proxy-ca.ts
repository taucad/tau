/**
 * Spike S7 (native-dependency-resolution charter, D9/D25): does Node 24's global `fetch` honour
 * proxy and private-CA variables only in the documented combinations, and does a `tau prepare`-shaped
 * child fail fast on a non-mirror origin without a new dependency?
 *
 * Spike code only. Usage:
 *   node scripts/spikes/native-deps/linux/s7/proxy-ca.ts certs <dir>   # private CA + leaf (openssl)
 *   node scripts/spikes/native-deps/linux/s7/proxy-ca.ts run <dir>     # matrix + mirror scenarios, JSON on stdout
 * Environment: S7_SYSTEM_CA_INSTALLED=1 when <dir>/ca.pem was added to the OS trust store.
 * Every child runs with a scrubbed environment (PATH and HOME plus the row's variables), so an
 * ambient proxy on the host cannot distort a row. Exit codes: 0 every check passed, 1 otherwise, 2 usage.
 */

/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are the subject of this spike. */

import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { connect } from 'node:net';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import process from 'node:process';

type Environment = Record<string, string>;
type Observed = 'success' | 'tls' | 'direct';
type FetchOutcome = {
  ok: boolean;
  status?: number;
  body?: string;
  name?: string;
  message?: string;
  cause?: string;
  causeMessage?: string;
};
type ProbeResult = {
  name: string;
  outcome: string;
  code?: string;
  detail?: Record<string, unknown> | string;
  ms?: number;
};

const [mode, directory] = process.argv.slice(2);
if (directory === undefined || (mode !== 'certs' && mode !== 'run')) {
  process.stderr.write('Usage: proxy-ca.ts certs|run <dir>\n');
  process.exit(2);
}
const originHost = 'origin.s7.invalid';

if (mode === 'certs') {
  mkdirSync(directory, { recursive: true });
  const openssl = (...arguments_: string[]): void => {
    execFileSync('openssl', arguments_, { cwd: directory, stdio: 'pipe' });
  };
  openssl(
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-days',
    '2',
    '-keyout',
    'ca.key',
    '-out',
    'ca.pem',
    '-subj',
    '/CN=Tau S7 spike CA',
    '-addext',
    'basicConstraints=critical,CA:TRUE',
    '-addext',
    'keyUsage=critical,keyCertSign,cRLSign',
  );
  openssl(
    'req',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    'leaf.key',
    '-out',
    'leaf.csr',
    '-subj',
    `/CN=${originHost}`,
  );
  writeFileSync(join(directory, 'leaf.ext'), `subjectAltName=DNS:${originHost}\nextendedKeyUsage=serverAuth\n`);
  openssl(
    'x509',
    '-req',
    '-in',
    'leaf.csr',
    '-CA',
    'ca.pem',
    '-CAkey',
    'ca.key',
    '-CAcreateserial',
    '-days',
    '2',
    '-out',
    'leaf.pem',
    '-extfile',
    'leaf.ext',
  );
  process.stdout.write(`certs written to ${directory}\n`);
  process.exit(0);
}

const listen = async (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });

// The origin: HTTPS with a leaf signed by the private CA, reachable only through the proxy's mapping.
const origin = createHttpsServer(
  { key: readFileSync(join(directory, 'leaf.key')), cert: readFileSync(join(directory, 'leaf.pem')) },
  (_request, response) => {
    response.end('s7-ok');
  },
);
const originPort = await listen(origin);

// A CONNECT proxy that counts hits and tunnels only origin.s7.invalid (to the loopback origin).
const proxyHits: Array<{ method: string; target: string }> = [];
const proxy = createServer((request, response) => {
  proxyHits.push({ method: request.method ?? '?', target: request.url ?? '' });
  response.writeHead(502).end();
});
proxy.on('connect', (request: { url?: string }, socket: Duplex, head: Uint8Array<ArrayBuffer>) => {
  const target = request.url ?? '';
  proxyHits.push({ method: 'CONNECT', target });
  if (target.split(':')[0] !== originHost) {
    socket.end('HTTP/1.1 403 Forbidden\r\n\r\n');
    return;
  }
  const upstream = connect(originPort, '127.0.0.1', () => {
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});
const proxyUrl = `http://127.0.0.1:${String(await listen(proxy))}`;

const probe = `fetch(process.argv[1], { signal: AbortSignal.timeout(8000) })
  .then(async (r) => console.log(JSON.stringify({ ok: true, status: r.status, body: await r.text() })))
  .catch((e) => console.log(JSON.stringify({ ok: false, name: e.name, message: e.message, cause: e.cause?.code ?? e.cause?.name, causeMessage: e.cause?.message })));`;

const runChild = async (
  arguments_: string[],
  environment: Environment,
): Promise<{ code: number | undefined; stdout: string; stderr: string; ms: number }> =>
  new Promise((resolve) => {
    const started = performance.now();
    const child = spawn(process.execPath, arguments_, {
      env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...environment },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stdout += Buffer.from(chunk).toString('utf8');
    });
    child.stderr.on('data', (chunk: Uint8Array<ArrayBuffer>) => {
      stderr += Buffer.from(chunk).toString('utf8');
    });
    child.on('exit', (code) => {
      resolve({ code: code ?? undefined, stdout, stderr, ms: Math.round(performance.now() - started) });
    });
  });

const url = `https://${originHost}/`;
const ca = join(directory, 'ca.pem');
const systemCa = process.env['S7_SYSTEM_CA_INSTALLED'] === '1';
// Expected: success (proxy hit + 200), tls (proxy hit + TLS failure), direct (no proxy hit, DNS failure).
const rows: Array<{
  id: string;
  core: boolean;
  label: string;
  env: Environment;
  flags?: string[];
  expected: Observed;
}> = [
  {
    id: 'R1',
    core: true,
    label: 'HTTPS_PROXY (+ NODE_EXTRA_CA_CERTS), no NODE_USE_ENV_PROXY',
    env: { HTTPS_PROXY: proxyUrl, NODE_EXTRA_CA_CERTS: ca },
    expected: 'direct',
  },
  {
    id: 'R2',
    core: true,
    label: 'HTTPS_PROXY + NODE_USE_ENV_PROXY=1, no CA variable',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1' },
    expected: 'tls',
  },
  {
    id: 'R3',
    core: true,
    label: 'HTTPS_PROXY + NODE_USE_ENV_PROXY=1 + NODE_EXTRA_CA_CERTS',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: ca },
    expected: 'success',
  },
  {
    id: 'R4',
    core: true,
    label: 'HTTPS_PROXY + NODE_USE_ENV_PROXY=1 + SSL_CERT_FILE only',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', SSL_CERT_FILE: ca },
    expected: 'tls',
  },
  {
    id: 'R5',
    core: systemCa,
    label: 'HTTPS_PROXY + NODE_USE_ENV_PROXY=1 + NODE_USE_SYSTEM_CA=1 (CA in the OS store)',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', NODE_USE_SYSTEM_CA: '1' },
    expected: systemCa ? 'success' : 'tls',
  },
  {
    id: 'R6',
    core: true,
    label: 'HTTPS_PROXY + NODE_USE_ENV_PROXY=1 + NODE_EXTRA_CA_CERTS + NO_PROXY=<origin host>',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: ca, NO_PROXY: originHost },
    expected: 'direct',
  },
  {
    id: 'X1',
    core: false,
    label: '--use-env-proxy flag + HTTPS_PROXY + NODE_EXTRA_CA_CERTS',
    flags: ['--use-env-proxy'],
    env: { HTTPS_PROXY: proxyUrl, NODE_EXTRA_CA_CERTS: ca },
    expected: 'success',
  },
  {
    id: 'X2',
    core: false,
    label: 'lowercase https_proxy + NODE_USE_ENV_PROXY=1 + NODE_EXTRA_CA_CERTS',
    env: { https_proxy: proxyUrl, NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: ca },
    expected: 'success',
  },
  {
    id: 'X3',
    core: false,
    label: 'NODE_OPTIONS=--use-openssl-ca + SSL_CERT_FILE (+ proxy variables)',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', SSL_CERT_FILE: ca, NODE_OPTIONS: '--use-openssl-ca' },
    expected: 'success',
  },
  {
    id: 'X4',
    core: false,
    label: 'NODE_USE_SYSTEM_CA=1 with SSL_CERT_FILE=/nonexistent (+ proxy variables)',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', NODE_USE_SYSTEM_CA: '1', SSL_CERT_FILE: '/nonexistent' },
    expected: systemCa ? 'success' : 'tls',
  },
  {
    id: 'X5',
    core: false,
    label: 'NO_PROXY=* + NODE_USE_ENV_PROXY=1',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', NODE_EXTRA_CA_CERTS: ca, NO_PROXY: '*' },
    expected: 'direct',
  },
];

const redact = (environment: Environment): Environment =>
  Object.fromEntries(Object.entries(environment).map(([key, value]) => [key, value.replace(directory, '<dir>')]));

const matrix = [];
for (const row of rows) {
  const before = proxyHits.length;
  // oxlint-disable-next-line no-await-in-loop -- rows run one at a time so proxy hits attribute to one row.
  const result = await runChild([...(row.flags ?? []), '-e', probe, url], row.env);
  const hits = proxyHits.slice(before);
  const lastLine = result.stdout.trim().split('\n').at(-1) ?? '';
  const fetched = (lastLine === '' ? { ok: false, name: 'no-output' } : JSON.parse(lastLine)) as FetchOutcome;
  const observed: Observed =
    fetched.ok && fetched.body === 's7-ok' && hits.length > 0 ? 'success' : hits.length > 0 ? 'tls' : 'direct';
  matrix.push({
    ...row,
    env: redact(row.env),
    observed,
    match: observed === row.expected,
    proxyHits: hits,
    fetch: fetched,
    ms: result.ms,
    stderr: result.stderr.trim().slice(0, 400),
  });
}

// Mirror scenarios: payload A is mirrored, payload B is not; B's canonical origin is a real HTTPS URL.
const blobs = join(directory, 'mirror', 'blobs', 'sha256');
mkdirSync(blobs, { recursive: true });
const bytes = randomBytes(64 * 1024);
const digestA = createHash('sha256').update(bytes).digest('hex');
writeFileSync(join(blobs, digestA), bytes);
const mirrorLog: string[] = [];
const mirrorServer = createServer((request, response) => {
  mirrorLog.push(request.url ?? '');
  const match = /^\/blobs\/sha256\/([0-9a-f]{64})$/u.exec(request.url ?? '');
  try {
    const body = match?.[1] === undefined ? undefined : readFileSync(join(blobs, match[1]));
    response.writeHead(body ? 200 : 404).end(body);
  } catch {
    response.writeHead(404).end();
  }
});
const mirrorBase = `http://127.0.0.1:${String(await listen(mirrorServer))}/`;
const canonical = 'https://github.com/astral-sh/python-build-standalone/releases/download/20260901/SHA256SUMS';
const payloads = JSON.stringify([
  { name: 'A-mirrored', sha256: digestA, url: 'https://example.invalid/a.bin' },
  { name: 'B-not-mirrored', sha256: createHash('sha256').update('s7-not-mirrored').digest('hex'), url: canonical },
]);
const unreachable = 'http://127.0.0.1:9';
const scenarios: Array<{ id: string; label: string; env: Environment }> = [
  {
    id: 'M1',
    label: 'mirror + canonical unreachable (HTTPS_PROXY=:9, NODE_USE_ENV_PROXY=1), fallback allowed',
    env: { HTTPS_PROXY: unreachable, NODE_USE_ENV_PROXY: '1', TAU_PAYLOAD_MIRROR: mirrorBase },
  },
  {
    id: 'M2',
    label: 'as M1 with TAU_PAYLOAD_MIRROR_NO_FALLBACK=1',
    env: {
      HTTPS_PROXY: unreachable,
      NODE_USE_ENV_PROXY: '1',
      TAU_PAYLOAD_MIRROR: mirrorBase,
      TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
    },
  },
  {
    id: 'M3',
    label: 'no-fallback through the counting deny-all proxy (proves zero canonical attempts)',
    env: {
      HTTPS_PROXY: proxyUrl,
      NODE_USE_ENV_PROXY: '1',
      TAU_PAYLOAD_MIRROR: mirrorBase,
      TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
    },
  },
  {
    id: 'M4',
    label: 'fallback allowed through the counting deny-all proxy (the canonical attempt is visible and refused)',
    env: { HTTPS_PROXY: proxyUrl, NODE_USE_ENV_PROXY: '1', TAU_PAYLOAD_MIRROR: mirrorBase },
  },
  {
    id: 'M5',
    label: 'HTTPS_PROXY=:9 WITHOUT NODE_USE_ENV_PROXY, fallback allowed (is the switch load-bearing?)',
    env: { HTTPS_PROXY: unreachable, TAU_PAYLOAD_MIRROR: mirrorBase },
  },
  {
    id: 'M6',
    label: 'HTTP_PROXY=:9 + NODE_USE_ENV_PROXY=1, no NO_PROXY (does a loopback http mirror bypass the proxy?)',
    env: {
      HTTP_PROXY: unreachable,
      HTTPS_PROXY: unreachable,
      NODE_USE_ENV_PROXY: '1',
      TAU_PAYLOAD_MIRROR: mirrorBase,
      TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
    },
  },
  {
    id: 'M7',
    label: 'as M6 with NO_PROXY=127.0.0.1',
    env: {
      HTTP_PROXY: unreachable,
      HTTPS_PROXY: unreachable,
      NO_PROXY: '127.0.0.1',
      NODE_USE_ENV_PROXY: '1',
      TAU_PAYLOAD_MIRROR: mirrorBase,
      TAU_PAYLOAD_MIRROR_NO_FALLBACK: '1',
    },
  },
];
const mirrorRuns: Array<{
  id: string;
  label: string;
  env: Environment;
  exit: number | undefined;
  ms: number;
  results: ProbeResult[];
  proxyHits: Array<{ method: string; target: string }>;
  mirrorRequests: string[];
  stderr: string;
}> = [];
for (const scenario of scenarios) {
  const hitsBefore = proxyHits.length;
  const logBefore = mirrorLog.length;
  // oxlint-disable-next-line no-await-in-loop -- scenarios share the counting proxy and the mirror log.
  const result = await runChild([join(import.meta.dirname, 'prepare-probe.ts'), payloads], scenario.env);
  mirrorRuns.push({
    ...scenario,
    env: { ...scenario.env, TAU_PAYLOAD_MIRROR: '<loopback mirror>' },
    exit: result.code,
    ms: result.ms,
    results: result.stdout
      .trim()
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as ProbeResult),
    proxyHits: proxyHits.slice(hitsBefore),
    mirrorRequests: mirrorLog.slice(logBefore),
    stderr: result.stderr.trim().slice(0, 400),
  });
}

const resultOf = (id: string, name: string): ProbeResult | undefined =>
  mirrorRuns.find((run) => run.id === id)?.results.find((result) => result.name === name);
const runOf = (id: string): { exit: number | undefined; proxyHits: unknown[] } | undefined =>
  mirrorRuns.find((run) => run.id === id);
const detailOf = (result: ProbeResult | undefined): Record<string, unknown> =>
  typeof result?.detail === 'object' ? result.detail : {};
const m1b = resultOf('M1', 'B-not-mirrored');
const checks = {
  coreRowsMatch: matrix.filter((row) => row.core).every((row) => row.match),
  sslCertFileAloneFailsTls: matrix.find((row) => row.id === 'R4')?.observed === 'tls',
  m1MirrorVerified: resultOf('M1', 'A-mirrored')?.outcome === 'verified',
  m1CanonicalTypedFailureNamesUrl: m1b?.code === 'DOWNLOAD_FAILED' && detailOf(m1b)['url'] === canonical,
  m1CanonicalFailsWithin2s: Number(detailOf(m1b)['ms'] ?? Number.POSITIVE_INFINITY) < 2000,
  m2NoFallbackRefusesTyped: resultOf('M2', 'B-not-mirrored')?.code === 'OFFLINE_MISS' && runOf('M2')?.exit === 3,
  m3NoFallbackZeroCanonicalAttempts: runOf('M3')?.proxyHits.length === 0,
};
const summary = {
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  systemCa,
  checks,
  pass: Object.values(checks).every(Boolean),
};
process.stdout.write(`${JSON.stringify({ summary, matrix, mirrorRuns }, undefined, 2)}\n`);
origin.close();
proxy.close();
mirrorServer.close();
process.exitCode = summary.pass ? 0 : 1;
