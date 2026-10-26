/**
 * Shared fixtures for the shell qualification rows (W7, `host:test:shell-qualification`): a controlled network endpoint
 * outside the sandbox, a seeded generator for the interleaving rows, and observations of what is still running.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

/** One request the controlled endpoint saw. */
export type EndpointRequest = Readonly<{ path: string; host: string; authorization: boolean; headers: string }>;

/** The names the endpoint answers for; only {@link grantedName} is ever granted. */
export const grantedName = 'granted.tau-qualification.test';
export const otherName = 'other.tau-qualification.test';

/**
 * A controlled granted endpoint (W7; T10, replacing C04's public origin): an HTTP server on loopback that records every
 * request, and the real sandbox supervisor preloaded with native-process-core's `controlled-endpoint.fixture.ts`, which
 * resolves {@link grantedName} and {@link otherName} to a public stand-in address and connects that address here. The
 * sandbox proxy still admits by granted name and the address guard still judges the address (D26).
 *
 * `/redirect` answers a redirect to {@link otherName}, so a client that follows it asks for an ungranted name.
 *
 * @returns The server, its requests and the supervisor to hand the provider.
 */
export const controlledEndpoint = async (): Promise<
  Readonly<{
    server: Server;
    port: number;
    requests: EndpointRequest[];
    supervisor: Readonly<{ executablePath: string; arguments: readonly string[] }>;
  }>
> => {
  const requests: EndpointRequest[] = [];
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '', 'http://endpoint.invalid').pathname;
    requests.push({
      path,
      host: (request.headers.host ?? '').replace(/:\d+$/u, ''),
      authorization:
        request.headers.authorization !== undefined || request.headers['proxy-authorization'] !== undefined,
      headers: JSON.stringify(request.headers),
    });
    if (path === '/redirect') {
      response.writeHead(302, { location: `http://${otherName}/redirected`, connection: 'close' }).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'text/plain', connection: 'close' }).end(`ENDPOINT:${path}\n`);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  const shellModule = createRequire(import.meta.url).resolve('@taucad/native-process-core/shell');
  const directory = join(dirname(shellModule), 'shell');
  const preload = new URL(`file://${join(directory, 'controlled-endpoint.fixture.ts')}`);
  preload.search = new URLSearchParams({ port: String(port), names: `${grantedName},${otherName}` }).toString();
  return {
    server,
    port,
    requests,
    supervisor: {
      executablePath: process.execPath,
      arguments: ['--import', preload.href, join(directory, 'srt-supervisor.ts')],
    },
  };
};

/**
 * A seeded generator (mulberry32), so an interleaving row replays from the seed in its receipt.
 *
 * @param seed - The recorded seed.
 * @returns A function answering the next number in [0, 1).
 */
/* oxlint-disable no-bitwise -- mulberry32 requires fixed-width bit mixing for reproducible seeds. */
export const seeded = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d_2b_79_f5) >>> 0;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4_294_967_296;
  };
};
/* oxlint-enable no-bitwise */

/**
 * Every process whose command line carries a marker, observed outside the sandbox.
 *
 * @param marker - A string only the row's own commands carry.
 * @returns `pid command` lines.
 */
export const processesWith = (marker: string): string[] =>
  execFileSync('ps', ['-axww', '-o', 'pid=,command='], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.includes(marker) && !line.includes('ps -axww'));

/**
 * A file's digest, judged outside the sandbox.
 *
 * @param path - The file.
 * @returns `sha256:<hex>`.
 */
export const digestOf = (path: string): string =>
  `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;

/**
 * Wait until a condition holds or a deadline passes, polling it.
 *
 * @param condition - Read at each poll.
 * @param milliseconds - The deadline.
 * @returns Whether it held before the deadline.
 */
export const eventually = async (condition: () => boolean, milliseconds: number): Promise<boolean> => {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (condition()) {
      return true;
    }
    // oxlint-disable-next-line no-await-in-loop -- a poll waits between reads.
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  return condition();
};
