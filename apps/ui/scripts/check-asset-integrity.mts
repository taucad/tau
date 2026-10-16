/**
 * Prove the UI's WASM integrity in browsers (charter D26, W19; ruling X31) against a built client directory.
 *
 * 1. Every file `tau-asset-receipt.json` lists hashes to its recorded integrity, and every WASM file is registered by
 *    at least one chunk.
 * 2. The client directory is served same-origin with the isolation headers. In a module worker, as kernels run, the
 *    app's own registration lines fill the registry and `@taucad/runtime`'s WASM loader compiles every WASM module the
 *    build ships. Per module it records:
 *    - that the untampered module compiles;
 *    - that one changed byte is refused with integrity and, as a contrast, what happens without it;
 *    - the median added time of integrity: loader timings with and without a registered value, alternated.
 *    The X31 line is at most 200 ms added per module.
 * Chromium, Firefox and WebKit run when installed (`pnpm exec playwright install --with-deps chromium firefox webkit`).
 *
 * Environment: TAU_INTEGRITY_ENGINES, a comma-separated subset of chromium,firefox,webkit (default: all three);
 * TAU_INTEGRITY_TIMED_ENGINES, the engines held to the overhead line (default: every engine run).
 * Usage: node apps/ui/scripts/check-asset-integrity.mts <client-dir> <evidence-dir> [iterations]
 * Exit codes: 0 pass, 1 an oracle line failed, 2 usage.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from 'playwright';
import type { BrowserType } from 'playwright';

type Receipt = {
  readonly schema: string;
  readonly assets: ReadonlyArray<{ readonly path: string; readonly bytes: number; readonly integrity: string }>;
};
type Outcome = { readonly ok: boolean; readonly error?: string };
type ModuleRow = {
  readonly path: string;
  readonly bytes: number;
  readonly untampered: Outcome;
  readonly tamperedWithIntegrity: Outcome;
  readonly tamperedWithoutIntegrity: Outcome;
  readonly checked: number;
  readonly plain: number;
  /** Diagnostics for large modules: median load with other digests, and buffered (non-streaming) loads. */
  readonly variants?: Readonly<Record<string, number>>;
};
type WorkerModule = {
  readonly path: string;
  readonly bytes: number;
  readonly integrity: string;
  readonly variants?: Readonly<Record<string, string>>;
};
type WorkerInput = {
  readonly modules: readonly WorkerModule[];
  readonly diagnosticIterations: number;
  readonly iterations: number;
};
type WorkerOutput = { readonly crossOriginIsolated: boolean; readonly row?: ModuleRow; readonly time?: number };

/** Milliseconds a module may add to its load under integrity (ruling X31). */
const overheadLimit = 200;
const harness = '/__tau-integrity__';
const [clientDirectory, evidence, iterationsText = '5'] = process.argv.slice(2);
const iterations = Number(iterationsText);
if (clientDirectory === undefined || evidence === undefined || !Number.isInteger(iterations) || iterations < 1) {
  console.error('Usage: node apps/ui/scripts/check-asset-integrity.mts <client-dir> <evidence-dir> [iterations]');
  process.exit(2);
}
mkdirSync(evidence, { recursive: true });
const lines: string[] = [];
let failures = 0;
const record = (pass: boolean, line: string): void => {
  lines.push(`${pass ? 'PASS' : 'FAIL'} ${line}`);
  if (!pass) {
    failures += 1;
  }
};
const sri = (bytes: Uint8Array<ArrayBuffer>): string => `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
const read = (file: string): Uint8Array<ArrayBuffer> => Uint8Array.from(readFileSync(path.join(clientDirectory, file)));

/* 1. The receipt and the registrations. */
const receipt = JSON.parse(readFileSync(path.join(clientDirectory, 'tau-asset-receipt.json'), 'utf8')) as Receipt;
const mismatched = receipt.assets.filter((asset) => {
  const bytes = read(asset.path);
  return bytes.byteLength !== asset.bytes || sri(bytes) !== asset.integrity;
});
record(
  mismatched.length === 0,
  `receipt ${receipt.schema}: ${receipt.assets.length} files re-hashed, ${mismatched.length} differ ${mismatched
    .map((asset) => asset.path)
    .join(' ')}`,
);
const registrationPattern =
  /^\(\(r\)=>\{.*\}\)\(globalThis\[Symbol\.for\("taucad\.assetIntegrity"\)\]\?\?=new Map\(\)\);$/u;
const registrations = receipt.assets
  .filter((asset) => asset.path.endsWith('.js'))
  .map((asset) => ({ chunk: asset.path, line: new TextDecoder().decode(read(asset.path)).split('\n', 1)[0] ?? '' }))
  .filter(({ line }) => registrationPattern.test(line));
const modules = receipt.assets.filter((asset) => asset.path.endsWith('.wasm'));
const unregistered = modules.filter(
  (module) =>
    !registrations.some(({ line }) => line.includes(`${JSON.stringify(`./${path.posix.basename(module.path)}`)}`)),
);
record(
  unregistered.length === 0,
  `${modules.length} WASM files, registered by ${registrations.length} chunks; unregistered: ${
    unregistered.map((module) => module.path).join(' ') || 'none'
  }`,
);

/* Diagnostics, not gated: for the largest modules, also time other digests and buffered (non-streaming) loads. */
const diagnosticIterations = 3;
const workerModules: WorkerModule[] = modules.map((module) => {
  if (module.bytes < 40_000_000) {
    return module;
  }
  const bytes = read(module.path);
  const digest = (algorithm: string): string => `${algorithm}-${createHash(algorithm).update(bytes).digest('base64')}`;
  return { ...module, variants: { sha256: digest('sha256'), sha512: digest('sha512') } };
});

/* 2. The browsers. The registration lines run as the app runs them, resolved against each chunk's own URL. */
const registrationModule = registrations
  .map(({ chunk, line }) =>
    line.replaceAll('import.meta.url', `new URL(${JSON.stringify(`/${chunk}`)},location.href).href`),
  )
  .join('\n');
const loader = await build({
  entryPoints: [path.resolve(import.meta.dirname, '../../../packages/runtime/src/framework/wasm-loader.ts')],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  external: ['node:*'],
  absWorkingDir: path.resolve(import.meta.dirname, '../../../packages/runtime'),
});
const workerSource = `import '${harness}/registrations.js';
import { compileWasmStreaming } from '${harness}/loader.js';
const registry = globalThis[Symbol.for('taucad.assetIntegrity')];
const median = (values) => { const s = values.toSorted((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const outcome = async (run) => { try { await run(); return { ok: true }; } catch (error) { return { ok: false, error: String(error?.message ?? error).slice(0, 200) }; } };
const variant = async ({ module, variant, value, iterations }) => {
  const url = new URL('/' + module.path, location.href).href;
  const load = {
    buffered: (href) => fetch(href).then((response) => response.arrayBuffer()).then((bytes) => WebAssembly.compile(bytes)),
    'buffered-sha384': (href) => fetch(href, { integrity: registry.get(url) }).then((response) => response.arrayBuffer()).then((bytes) => WebAssembly.compile(bytes)),
  }[variant] ?? ((href) => { registry.set(href, value); return compileWasmStreaming(href); });
  const times = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    await load(url + '?' + variant + '=' + index);
    times.push(performance.now() - start);
  }
  return median(times);
};
self.onmessage = async ({ data }) => {
  if (data.variant !== undefined) {
    self.postMessage({ crossOriginIsolated: self.crossOriginIsolated, time: await variant(data) });
    return;
  }
  const rows = [];
  for (const module of [data.module]) {
    const url = new URL('/' + module.path, location.href).href;
    const integrity = registry.get(url);
    const at = (query, registered) => { const href = url + '?' + query; if (registered) registry.set(href, integrity); return href; };
    const untampered = await outcome(() => compileWasmStreaming(at('u', true)));
    const tamperedWithIntegrity = await outcome(() => compileWasmStreaming(at('t=1&r', true)));
    const tamperedWithoutIntegrity = await outcome(() => compileWasmStreaming(at('t=1&n', false)));
    const checked = [];
    const plain = [];
    for (let index = 0; index < data.iterations; index += 1) {
      for (const kind of index % 2 === 0 ? ['plain', 'checked'] : ['checked', 'plain']) {
        const href = at(kind + '=' + index, kind === 'checked');
        const start = performance.now();
        await compileWasmStreaming(href);
        (kind === 'checked' ? checked : plain).push(performance.now() - start);
      }
    }
    rows.push({ path: module.path, bytes: module.bytes, registered: integrity !== undefined, untampered, tamperedWithIntegrity, tamperedWithoutIntegrity, checked: median(checked), plain: median(plain) });
  }
  self.postMessage({ crossOriginIsolated: self.crossOriginIsolated, row: rows[0] });
};
`;

/* Change one byte inside the data section (id 11), so the module still compiles without integrity. */
const tamper = (original: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  const bytes = Uint8Array.from(original);
  const leb = (at: number): [number, number] => {
    let value = 0;
    let shift = 0;
    let position = at;
    for (;;) {
      const byte = bytes[position] ?? 0;
      position += 1;
      // oxlint-disable-next-line no-bitwise -- LEB128 payload bits
      value += (byte & 0x7f) * 2 ** shift;
      // oxlint-disable-next-line no-bitwise -- LEB128 continuation bit
      if ((byte & 0x80) === 0) {
        return [value, position];
      }
      shift += 7;
    }
  };
  let offset = 8;
  let target = bytes.length - 1;
  while (offset < bytes.length) {
    const id = bytes[offset];
    const [size, next] = leb(offset + 1);
    if (id === 11 && size > 16) {
      target = next + size - 8;
      break;
    }
    offset = next + size;
  }
  // oxlint-disable-next-line no-bitwise -- flip the lowest bit of one byte
  bytes[target] = (bytes[target] ?? 0) ^ 0x01;
  return bytes;
};

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};
const generated = new Map<string, { readonly type: string; readonly body: string | Uint8Array<ArrayBuffer> }>([
  [`${harness}/`, { type: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Integrity</title>' }],
  [`${harness}/registrations.js`, { type: 'text/javascript', body: registrationModule }],
  [`${harness}/loader.js`, { type: 'text/javascript', body: loader.outputFiles[0]?.text ?? '' }],
  [`${harness}/worker.js`, { type: 'text/javascript', body: workerSource }],
]);
const tampered = new Map<string, Uint8Array<ArrayBuffer>>();
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const fixed = generated.get(url.pathname);
  if (fixed !== undefined) {
    response.writeHead(200, { ...isolation, 'Content-Type': fixed.type }).end(fixed.body);
    return;
  }
  const file = url.pathname.slice(1);
  if (!modules.some((module) => module.path === file)) {
    response.writeHead(404, isolation).end();
    return;
  }
  let body = read(file);
  if (url.searchParams.has('t')) {
    body = tampered.get(file) ?? tamper(body);
    tampered.set(file, body);
  }
  response.writeHead(200, {
    ...isolation,
    'Content-Type': 'application/wasm',
    'Content-Length': String(body.byteLength),
  });
  response.end(body);
});
await new Promise<void>((resolve) => {
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;

// X44: the overhead line gates each engine only on the platform it ships on; tamper refusal gates every engine.
const timedEngines = process.env['TAU_INTEGRITY_TIMED_ENGINES']?.split(',').filter(Boolean);

const reportRows = (label: string, rows: readonly ModuleRow[]): void => {
  const timed = timedEngines === undefined || timedEngines.includes(label);
  let worst = { path: '', added: Number.NEGATIVE_INFINITY };
  for (const row of rows) {
    const added = row.checked - row.plain;
    if (added > worst.added) {
      worst = { path: row.path, added };
    }
    if (row.variants !== undefined) {
      const timings = Object.entries(row.variants).map(([name, value]) => `${name} ${value.toFixed(1)} ms`);
      lines.push(
        `INFO ${label} ${row.path} streaming plain ${row.plain.toFixed(1)} ms, sha384 ${row.checked.toFixed(1)} ms, ${timings.join(', ')}`,
      );
    }
    record(
      row.untampered.ok && !row.tamperedWithIntegrity.ok && (!timed || added <= overheadLimit),
      `${label} ${row.path} ${(row.bytes / 1e6).toFixed(1)} MB: untampered ${row.untampered.ok ? 'compiles' : `fails ${row.untampered.error ?? ''}`}; tampered+integrity ${row.tamperedWithIntegrity.ok ? 'COMPILED' : 'refused'}; tampered without integrity ${row.tamperedWithoutIntegrity.ok ? 'compiles' : 'fails'}; loader ${row.plain.toFixed(1)} ms plain, ${row.checked.toFixed(1)} ms with integrity, added ${added.toFixed(1)} ms`,
    );
  }
  lines.push(
    `  ${label} worst added: ${worst.added.toFixed(1)} ms (${worst.path}); ${timed ? `line ≤ ${String(overheadLimit)} ms` : 'information only (X44)'}`,
  );
};

const selectedEngines = process.env['TAU_INTEGRITY_ENGINES']?.split(',').filter(Boolean);
const engines = (
  [
    ['chromium', chromium],
    ['firefox', firefox],
    ['webkit', webkit],
  ] as ReadonlyArray<readonly [string, BrowserType]>
).filter(([label]) => selectedEngines === undefined || selectedEngines.includes(label));
const results: unknown[] = [];
/* oxlint-disable no-await-in-loop -- one browser at a time keeps the timings independent */
for (const [label, type] of engines) {
  try {
    const browser = await type.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`${origin}${harness}/`);
      const input: WorkerInput = { modules: workerModules, iterations, diagnosticIterations };
      // One fresh worker per module (and per diagnostic), as a kernel worker would have, so compiled modules never
      // accumulate; a worker that does not answer in five minutes fails the browser rather than the job.
      const measured = await page.evaluate(
        async ({ script, data }) => {
          const run = async (message: unknown): Promise<WorkerOutput> => {
            const worker = new Worker(script, { type: 'module' });
            try {
              return await new Promise<WorkerOutput>((resolve, reject) => {
                const timer = setTimeout(() => {
                  reject(new Error('worker timed out after 300 s'));
                }, 300_000);
                worker.addEventListener('message', (event: MessageEvent<WorkerOutput>) => {
                  clearTimeout(timer);
                  resolve(event.data);
                });
                worker.addEventListener('error', (event) => {
                  clearTimeout(timer);
                  reject(new Error(event.message));
                });
                worker.postMessage(message);
              });
            } finally {
              worker.terminate();
            }
          };
          const rows: ModuleRow[] = [];
          let isolated = true;
          for (const module of data.modules) {
            const output = await run({ module, iterations: data.iterations });
            isolated &&= output.crossOriginIsolated;
            const variants: Record<string, number> = {};
            for (const [name, value] of Object.entries({
              ...module.variants,
              ...(module.variants ? { buffered: '', 'buffered-sha384': '' } : {}),
            })) {
              const timed = await run({ module, variant: name, value, iterations: data.diagnosticIterations });
              variants[name] = timed.time ?? Number.NaN;
            }
            if (output.row !== undefined) {
              rows.push(module.variants === undefined ? output.row : { ...output.row, variants });
            }
          }
          return { crossOriginIsolated: isolated, rows };
        },
        { script: `${harness}/worker.js`, data: input },
      );
      results.push({ browser: label, version: browser.version(), ...measured });
      record(measured.crossOriginIsolated, `${label} ${browser.version()} crossOriginIsolated in the kernel worker`);
      reportRows(label, measured.rows);
      // Written after each browser, so a later browser that hangs still leaves this one's evidence.
      writeFileSync(path.join(evidence, 'summary.txt'), `${lines.join('\n')}\n`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    lines.push(`SKIP ${label}: ${(error instanceof Error ? error.message : String(error)).split('\n')[0] ?? ''}`);
    results.push({ browser: label, error: String(error) });
  }
}
/* oxlint-enable no-await-in-loop */
server.close();
if (!results.some((result) => typeof result === 'object' && result !== null && 'rows' in result)) {
  record(false, 'no browser ran');
}
lines.push(`verdict: ${failures === 0 ? 'pass' : `fail (${String(failures)})`}`);
writeFileSync(
  path.join(evidence, 'asset-integrity.json'),
  `${JSON.stringify({ origin, iterations, results }, undefined, 2)}\n`,
);
writeFileSync(path.join(evidence, 'summary.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(failures === 0 ? 0 : 1);
