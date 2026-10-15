/**
 * Spike S31 (native-dependency-resolution charter): `fetch(url, { integrity })` + `WebAssembly.compileStreaming`,
 * same-origin under COEP `require-corp`, in Chromium, WebKit and Firefox (Playwright). An untampered module compiles;
 * a module with one byte changed is refused as a network error; the integrity overhead is measured against compile
 * time. Spike code only; nothing ships.
 *
 * Usage: node scripts/spikes/native-deps/linux/s31/run.ts <evidence-dir> <iterations> <module.wasm>...
 * Environment: Playwright browsers installed (`pnpm exec playwright install --with-deps chromium firefox webkit`).
 * Exit codes: 0 every browser ran (verdict in s31.json), 1 a browser could not run, 2 usage.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename } from 'node:path';
import process from 'node:process';

import { chromium, firefox, webkit } from 'playwright';
import type { Browser, BrowserType } from 'playwright';

type Entry = {
  readonly name: string;
  readonly byteLength: number;
  readonly url: string;
  readonly tamperedUrl: string;
  readonly tamperedOffset: number;
  readonly integrity: string;
};
type Outcome = { readonly ok: true } | { readonly ok: false; readonly name: string; readonly message: string };
type Measured = {
  readonly crossOriginIsolated: boolean;
  readonly userAgent: string;
  readonly rows: ReadonlyArray<{
    readonly name: string;
    readonly byteLength: number;
    readonly untampered: Outcome;
    readonly tamperedFetchWithIntegrity: Outcome;
    readonly tamperedStreamingWithIntegrity: Outcome;
    readonly tamperedStreamingWithoutIntegrity: Outcome;
    readonly medians: {
      readonly compile: number;
      readonly streamingPlain: number;
      readonly streamingIntegrity: number;
    };
    readonly samples: Readonly<Record<'compile' | 'plain' | 'checked', readonly number[]>>;
  }>;
};

const [evidence, iterationsText, ...modules] = process.argv.slice(2);
const iterations = Number(iterationsText);
if (evidence === undefined || !Number.isInteger(iterations) || iterations < 1 || modules.length === 0) {
  console.error('Usage: run.ts <evidence-dir> <iterations> <module.wasm>...');
  process.exit(2);
}

const leb = (bytes: Uint8Array<ArrayBuffer>, offset: number): { readonly value: number; readonly next: number } => {
  let value = 0;
  let shift = 0;
  let position = offset;
  for (;;) {
    const byte = bytes[position] ?? 0;
    position += 1;
    // oxlint-disable-next-line no-bitwise -- LEB128 payload bits
    value += (byte & 0x7f) * 2 ** shift;
    // oxlint-disable-next-line no-bitwise -- LEB128 continuation bit
    if ((byte & 0x80) === 0) {
      return { value, next: position };
    }
    shift += 7;
  }
};

// Change one byte inside the data section (id 11), so the tampered module still compiles without integrity and only
// the integrity check can refuse it. Falls back to the last byte when a module has no data section.
const tamper = (
  original: Uint8Array<ArrayBuffer>,
): { readonly bytes: Uint8Array<ArrayBuffer>; readonly target: number } => {
  const bytes = new Uint8Array(original);
  let offset = 8;
  let target = bytes.length - 1;
  while (offset < bytes.length) {
    const id = bytes[offset];
    const { value: size, next } = leb(bytes, offset + 1);
    if (id === 11 && size > 16) {
      target = next + size - 8;
      break;
    }
    offset = next + size;
  }
  // oxlint-disable-next-line no-bitwise -- flip the lowest bit of one byte
  bytes[target] = (bytes[target] ?? 0) ^ 0x01;
  return { bytes, target };
};

const sri = (bytes: Uint8Array<ArrayBuffer>): string => `sha384-${createHash('sha384').update(bytes).digest('base64')}`;

const assets = new Map<string, Uint8Array<ArrayBuffer>>();
const catalog: Entry[] = modules.map((path) => {
  const name = basename(path, '.wasm');
  const bytes = new Uint8Array(readFileSync(path));
  const { bytes: tampered, target } = tamper(bytes);
  assets.set(`/wasm/${name}.wasm`, bytes);
  assets.set(`/wasm/${name}.tampered.wasm`, tampered);
  return {
    name,
    byteLength: bytes.length,
    url: `/wasm/${name}.wasm`,
    tamperedUrl: `/wasm/${name}.tampered.wasm`,
    tamperedOffset: target,
    integrity: sri(bytes),
  };
});
const page = new TextEncoder().encode('<!doctype html><meta charset="utf-8"><title>S31</title><p>S31</p>');
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'no-store',
};
const server = createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  const body = path === '/' ? page : assets.get(path);
  if (body === undefined) {
    response.writeHead(404, isolation).end();
    return;
  }
  response.writeHead(200, {
    ...isolation,
    'Content-Type': path === '/' ? 'text/html; charset=utf-8' : 'application/wasm',
    'Content-Length': String(body.length),
  });
  response.end(body);
});
await new Promise<void>((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

// Runs in the page. Alternates the two streaming timings per iteration so neither order nor warm-up favours one.
/* oxlint-disable no-await-in-loop -- measurements run one at a time by design */
const probe = async (input: { readonly catalog: readonly Entry[]; readonly iterations: number }): Promise<Measured> => {
  const now = (): number => performance.now();
  const median = (values: readonly number[]): number => {
    const sorted = values.toSorted((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  };
  const outcome = async (run: () => Promise<unknown>): Promise<Outcome> => {
    try {
      await run();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        name: error instanceof Error ? error.constructor.name : typeof error,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  };
  const rows: Array<Measured['rows'][number]> = [];
  for (const entry of input.catalog) {
    const compile: number[] = [];
    const plain: number[] = [];
    const checked: number[] = [];
    for (let index = 0; index < input.iterations; index += 1) {
      const response = await fetch(entry.url, { cache: 'no-store' });
      const buffer = await response.arrayBuffer();
      let start = now();
      await WebAssembly.compile(buffer);
      compile.push(now() - start);
      for (const kind of index % 2 === 0 ? ['plain', 'checked'] : ['checked', 'plain']) {
        start = now();
        await WebAssembly.compileStreaming(
          fetch(
            entry.url,
            kind === 'checked' ? { cache: 'no-store', integrity: entry.integrity } : { cache: 'no-store' },
          ),
        );
        (kind === 'checked' ? checked : plain).push(now() - start);
      }
    }
    rows.push({
      name: entry.name,
      byteLength: entry.byteLength,
      untampered: await outcome(async () =>
        WebAssembly.compileStreaming(fetch(entry.url, { cache: 'no-store', integrity: entry.integrity })),
      ),
      tamperedFetchWithIntegrity: await outcome(async () =>
        fetch(entry.tamperedUrl, { cache: 'no-store', integrity: entry.integrity }),
      ),
      tamperedStreamingWithIntegrity: await outcome(async () =>
        WebAssembly.compileStreaming(fetch(entry.tamperedUrl, { cache: 'no-store', integrity: entry.integrity })),
      ),
      tamperedStreamingWithoutIntegrity: await outcome(async () =>
        WebAssembly.compileStreaming(fetch(entry.tamperedUrl, { cache: 'no-store' })),
      ),
      medians: { compile: median(compile), streamingPlain: median(plain), streamingIntegrity: median(checked) },
      samples: { compile, plain, checked },
    });
  }
  return { crossOriginIsolated: globalThis.crossOriginIsolated, userAgent: navigator.userAgent, rows };
};

const refusedAsNetworkError = (value: Outcome): boolean => !value.ok && value.name === 'TypeError';

type Result =
  | { readonly browser: string; readonly error: string }
  | (Measured & {
      readonly browser: string;
      readonly version: string;
      readonly rows: ReadonlyArray<
        Measured['rows'][number] & {
          readonly overhead: number;
          readonly overheadOfCompilePercent: number;
          readonly overheadOfStreamingPercent: number;
          readonly pass: boolean;
        }
      >;
    });

const engines: ReadonlyArray<readonly [string, BrowserType]> = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
];
const results: Result[] = [];
let failed = false;
for (const [label, type] of engines) {
  let browser: Browser | undefined;
  try {
    browser = await type.launch();
    const context = await browser.newContext();
    const tab = await context.newPage();
    await tab.goto(`${origin}/`);
    const measured = await tab.evaluate(probe, { catalog, iterations });
    results.push({
      browser: label,
      version: browser.version(),
      ...measured,
      rows: measured.rows.map((row) => {
        const { compile, streamingPlain, streamingIntegrity } = row.medians;
        return {
          ...row,
          overhead: streamingIntegrity - streamingPlain,
          overheadOfCompilePercent: (100 * (streamingIntegrity - streamingPlain)) / compile,
          overheadOfStreamingPercent: (100 * (streamingIntegrity - streamingPlain)) / streamingPlain,
          pass:
            row.untampered.ok &&
            refusedAsNetworkError(row.tamperedFetchWithIntegrity) &&
            refusedAsNetworkError(row.tamperedStreamingWithIntegrity),
        };
      }),
    });
  } catch (error) {
    failed = true;
    results.push({ browser: label, error: error instanceof Error ? (error.stack ?? error.message) : String(error) });
  } finally {
    await browser?.close();
  }
}
/* oxlint-enable no-await-in-loop */
server.close();

const measuredRows = results.flatMap((row) => ('error' in row ? [] : row.rows));
const verdict = {
  browsers: results.filter((row) => !('error' in row)).length,
  isolation: results.every((row) => !('error' in row) && row.crossOriginIsolated),
  refusals: !failed && measuredRows.every((entry) => entry.pass),
  maximumOverheadOfCompilePercent: Math.max(...measuredRows.map((entry) => entry.overheadOfCompilePercent)),
};
writeFileSync(
  `${evidence}/s31.json`,
  `${JSON.stringify({ origin, iterations, catalog, verdict, results }, undefined, 2)}\n`,
);
const lines = [`verdict ${JSON.stringify(verdict)}`];
for (const row of results) {
  if ('error' in row) {
    lines.push(`${row.browser} ERROR ${row.error.split('\n')[0] ?? ''}`);
    continue;
  }
  lines.push(`${row.browser} ${row.version} crossOriginIsolated=${String(row.crossOriginIsolated)}`);
  for (const entry of row.rows) {
    const m = entry.medians;
    lines.push(
      `  ${entry.name} ${(entry.byteLength / 1e6).toFixed(1)} MB pass=${String(entry.pass)} compile=${m.compile.toFixed(1)}ms streaming=${m.streamingPlain.toFixed(1)}ms streaming+integrity=${m.streamingIntegrity.toFixed(1)}ms overhead=${entry.overhead.toFixed(1)}ms (${entry.overheadOfCompilePercent.toFixed(2)}% of compile, ${entry.overheadOfStreamingPercent.toFixed(2)}% of streaming)`,
      `    untampered=${JSON.stringify(entry.untampered)} tampered+integrity fetch=${JSON.stringify(entry.tamperedFetchWithIntegrity)} streaming=${JSON.stringify(entry.tamperedStreamingWithIntegrity)} tampered-no-integrity=${JSON.stringify(entry.tamperedStreamingWithoutIntegrity)}`,
    );
  }
}
writeFileSync(`${evidence}/s31-summary.txt`, `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(failed ? 1 : 0);
