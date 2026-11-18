/**
 * A cold open's local import, from the catalogue to the last local pack
 * written (STO-25 SP6-import).
 *
 * Not a test: a node harness whose numbers are a property of this machine. It
 * serves a bare repository's one pack, its index and a head listing of `main`
 * as a catalogue and a files host with no latency, and runs
 * {@link coldOpenFromCatalogue} into a fresh store on disk, the compute inline.
 * With no network to wait on, what is left is the import the browser runs
 * between the last pack byte and the sync's "Connecting" ending.
 *
 * It reports, per run, milliseconds from the open's start to the last Range
 * byte and to the open's end, the import after that last byte, and the time
 * spent inside each compute call and each store write (summed over calls that
 * may overlap, so a share of the wall clock rather than a part of it); the
 * longest the event loop went without a turn (`longestBlock`); and, per
 * written pack, the time the store took to close it (`finish`: the entries'
 * CRCs, the pack's bytes and its trailer) and to index it.
 *
 * Run from `packages/revisions`, the repository packed as the host packs it
 * (`git repack -adf`), `--worker` to run the compute on a worker thread as a
 * browser does, `BENCH_TRACE=1` to print each Range read and each keep:
 * `node --import @oxc-node/core/register src/test/cold-open-bench.ts --store=<repo .git> --runs=5`
 *
 * @internal
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import type { Transferable as NodeTransferable } from 'node:worker_threads';
import { gzipSync } from 'node:zlib';
import { NodeFsProvider } from '@taucad/filesystem/backend/node';
import { createInlineCompute, serveComputeWorker } from '#compute-worker/compute-worker.js';
import type { ComputePort, ComputeWorker } from '#compute-worker/compute-worker.js';
import { createSupervisedComputeWorker } from '#compute-worker/supervisor.js';
import { coldOpenFromCatalogue } from '#object-store/cold-open.js';
import { createObjectStore, gitFilesOf } from '#object-store/object-store.js';
import type { GitFiles } from '#object-store/object-store.js';

/* Node's ports speak `on('message')`; the seam takes the DOM shape. */
const domPort = (port: NonNullable<typeof parentPort> | Worker): ComputePort => ({
  postMessage: (message, transfer) => {
    port.postMessage(message, transfer as unknown as readonly NodeTransferable[]);
  },
  addEventListener: (_type, listener) => {
    port.on('message', (data: unknown) => {
      listener({ data } as MessageEvent);
    });
  },
});

if (!isMainThread) {
  /* `--worker`: this file again, serving the compute seam as the browser's dedicated worker does. */
  serveComputeWorker(domPort(parentPort!));
  await new Promise(() => {
    /* Served until the harness exits. */
  });
}

const argument = (name: string, fallback: string): string => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit === undefined ? fallback : hit.slice(name.length + 3);
};
const store = argument('store', '');
const runs = Number(argument('runs', '5'));
/*
 * `--worker`: the compute on a worker thread under the supervisor the browser uses (its defaults: four calls in
 * flight), each call's bytes cloned across as the browser's are; inline otherwise.
 */
const worker = process.argv.includes('--worker')
  ? new Worker(new URL(import.meta.url), { execArgv: ['--import', '@oxc-node/core/register'] })
  : undefined;
const supervised =
  worker === undefined
    ? undefined
    : createSupervisedComputeWorker({
        spawn: () => {
          const port = domPort(worker);
          return {
            postMessage: port.postMessage,
            addEventListener: (type, listener) => {
              if (type === 'message') {
                port.addEventListener('message', listener as (event: MessageEvent) => void);
              }
            },
            terminate: () => undefined,
          };
        },
      });

const git = (...args: string[]): string => execFileSync('git', ['--git-dir', store, ...args], { encoding: 'utf8' });
const packDirectory = join(store, 'objects', 'pack');
const packFiles = await readdir(packDirectory);
const packFile = packFiles.find((name) => name.endsWith('.pack'))!;
const pack = new Uint8Array(await readFile(join(packDirectory, packFile)));
const index = new Uint8Array(await readFile(join(packDirectory, packFile.replace(/\.pack$/u, '.idx'))));
const packName = `pack-${Buffer.from(pack.subarray(-20)).toString('hex')}-bench`;
const main = git('rev-parse', 'refs/heads/main').trim();
const listed = git('ls-tree', '-r', '-l', main)
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => {
    const [meta = '', path = ''] = line.split('\t');
    const [mode = '', , oid = '', size = ''] = meta.split(/\s+/u);
    return `${mode}\t${oid}\t${size}\t\t\t${path}`;
  });
const header = `tau-head-listing\t1\t${main}\t${git('rev-parse', `${main}^{tree}`).trim()}`;
const listing = new Uint8Array(gzipSync(`${[header, ...listed].join('\n')}\n`));

const catalogueUrl = 'https://api.test/v1/projects/bench/git/catalogue';
const files = 'https://files.test/v1/git/bench';
const packHref = `${files}/packs/${packName}.pack`;
const indexHref = `${files}/packs/${packName}.idx`;
const listingHref = `${files}/listings/${main}.tsv.gz`;

type Sample = {
  lastByte: number;
  end: number;
  compute: Record<string, number>;
  writes: number;
  fileOps: Record<string, number>;
  fileCalls: Record<string, number>;
  longestBlock: number;
  /* Milliseconds each thread's event loop was busy during the open. */
  busy: Readonly<{ main: number; worker: number }>;
  packs: number;
};

const once = async (): Promise<Sample> => {
  const root = await mkdtemp(join(tmpdir(), 'tau-cold-open-bench-'));
  try {
    let started = 0;
    let lastByte = 0;
    const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.startsWith(catalogueUrl)) {
        return Response.json({
          format: 1,
          generation: 1,
          refs: [{ ref: 'refs/heads/main', oid: main }],
          listings: [{ commit: main, href: listingHref, bytes: listing.byteLength }],
          packs: [
            {
              key: `packs/${packName}.pack`,
              bytes: pack.byteLength,
              index: { href: indexHref, bytes: index.byteLength },
              pack: { href: packHref, bytes: pack.byteLength },
            },
          ],
          complete: true,
          expiresAt: Math.floor(Date.now() / 1000) + 900,
        });
      }
      if (href === indexHref) {
        return new Response(index, { status: 200 });
      }
      if (href === listingHref) {
        return new Response(listing, { status: 200 });
      }
      const [, start = '0', end = '0'] =
        /^bytes=(\d+)-(\d+)$/u.exec(new Headers(init?.headers).get('range') ?? '') ?? [];
      const body = pack.slice(Number(start), Number(end) + 1);
      lastByte = performance.now() - started;
      if (process.env['BENCH_TRACE'] === '1') {
        console.log(
          `range ${String(Math.round((Number(end) + 1 - Number(start)) / 1024))} KiB at ${String(Math.round(lastByte))} ms`,
        );
      }
      return new Response(body, { status: 206 });
    };
    /* Time inside each compute call and each file call, summed. */
    const inline = supervised ?? createInlineCompute();
    const computeTimes: Record<string, number> = {};
    const timed = <Call extends (...args: never[]) => Promise<unknown>>(name: string, call: Call): Call =>
      (async (...args: Parameters<Call>) => {
        const from = performance.now();
        try {
          return await call(...args);
        } finally {
          computeTimes[name] = (computeTimes[name] ?? 0) + performance.now() - from;
        }
      }) as Call;
    const compute: ComputeWorker = Object.fromEntries(
      Object.entries(inline).map(([name, call]) => [name, timed(name, call as () => Promise<unknown>)]),
    ) as unknown as ComputeWorker;
    const fileTimes: Record<string, number> = {};
    const fileCalls: Record<string, number> = {};
    const raw = gitFilesOf(new NodeFsProvider(root), '.git');
    const counted = Object.fromEntries(
      Object.entries(raw).map(([name, call]) => [
        name,
        typeof call === 'function'
          ? async (...args: unknown[]) => {
              const from = performance.now();
              try {
                return await (call as (...inner: unknown[]) => Promise<unknown>)(...args);
              } finally {
                fileTimes[name] = (fileTimes[name] ?? 0) + performance.now() - from;
                fileCalls[name] = (fileCalls[name] ?? 0) + 1;
              }
            }
          : call,
      ]),
    ) as GitFiles;
    const inner = createObjectStore({ files: counted, gitdir: '.git', compute, fenceName: 'bench' });
    /* Each keep's interval, when `BENCH_TRACE=1`: where the import waits on its own writes. */
    const objects: typeof inner = {
      ...inner,
      importObjects: async (kept) => {
        const from = performance.now() - started;
        const list = [...kept];
        try {
          return await inner.importObjects(list);
        } finally {
          if (process.env['BENCH_TRACE'] === '1') {
            const bytes = list.reduce((sum, object) => sum + object.data.byteLength, 0);
            const deflated = list.filter((object) => object.compressed === undefined);
            const stored = list.reduce((sum, object) => sum + (object.compressed?.byteLength ?? 0), 0);
            console.log(
              `keep ${String(list.length)} objects ${String(Math.round(bytes / 1024))} KiB (${String(Math.round(stored / 1024))} KiB stored, ${String(deflated.length)} to deflate: ${String(Math.round(deflated.reduce((sum, object) => sum + object.data.byteLength, 0) / 1024))} KiB) ${String(Math.round(from))}+${String(Math.round(performance.now() - started - from))} ms`,
            );
          }
        }
      },
    };
    const loop = monitorEventLoopDelay({ resolution: 5 });
    loop.enable();
    const mainBusy = performance.eventLoopUtilization();
    const workerBusy = worker?.performance.eventLoopUtilization();
    started = performance.now();
    const opened = await coldOpenFromCatalogue({ catalogueUrl, fetch, store: objects, compute });
    const end = performance.now() - started;
    loop.disable();
    const mainUse = performance.eventLoopUtilization(mainBusy);
    const workerUse = worker === undefined ? undefined : worker.performance.eventLoopUtilization(workerBusy);
    if (opened === undefined) {
      throw new Error('The cold open did not take.');
    }
    return {
      lastByte,
      end,
      compute: computeTimes,
      writes: fileTimes['writeFile'] ?? 0,
      fileOps: fileTimes,
      fileCalls,
      longestBlock: loop.max / 1e6,
      busy: { main: mainUse.active, worker: workerUse?.active ?? 0 },
      packs: opened.report.packsWritten,
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

const round = (value: number): number => Math.round(value);
const median = (samples: readonly number[]): number =>
  round([...samples].toSorted((left, right) => left - right)[Math.floor(samples.length / 2)]!);
const samples: Sample[] = [];
for (let run = 0; run < runs; run += 1) {
  // oxlint-disable-next-line no-await-in-loop -- one open at a time, so runs never share the CPU.
  const sample = await once();
  samples.push(sample);
  console.log(
    JSON.stringify({
      run,
      lastByte: round(sample.lastByte),
      end: round(sample.end),
      afterLastByte: round(sample.end - sample.lastByte),
      longestBlock: round(sample.longestBlock),
      busy: { main: round(sample.busy.main), worker: round(sample.busy.worker) },
      packs: sample.packs,
      compute: Object.fromEntries(Object.entries(sample.compute).map(([name, ms]) => [name, round(ms)])),
      files: Object.fromEntries(Object.entries(sample.fileOps).map(([name, ms]) => [name, round(ms)])),
      fileCalls: sample.fileCalls,
    }),
  );
}
console.log(
  JSON.stringify({
    median: true,
    lastByte: median(samples.map((sample) => sample.lastByte)),
    end: median(samples.map((sample) => sample.end)),
    afterLastByte: median(samples.map((sample) => sample.end - sample.lastByte)),
    longestBlock: median(samples.map((sample) => sample.longestBlock)),
    mainBusy: median(samples.map((sample) => sample.busy.main)),
    workerBusy: median(samples.map((sample) => sample.busy.worker)),
  }),
);
/* The worker serves until the harness ends. */
// oxlint-disable-next-line unicorn/no-process-exit -- a harness ends once its numbers are printed.
process.exit(0);
