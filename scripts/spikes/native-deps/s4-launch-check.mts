#!/usr/bin/env node

/**
 * Purpose: Spike S4 (native dependency charter, D8): what the per-launch receipt check costs at first-session start
 *   for build123d and PicoGK, and what it catches when a sealed closure is tampered with.
 * Why: D8 keeps the launch check O(1) (the executable and the kernel-named resources against the receipt) and leaves
 *   every other file to full re-verification; this measures the first half and probes where the second half fires.
 * Environment: Node 24+ on darwin-arm64; the built CLI; the build123d seed (`pnpm nx run build123d:seed`);
 *   network for PicoGK's origins; passwordless `sudo purge` for the cold samples.
 * Usage: node --import @oxc-node/core/register scripts/spikes/native-deps/s4-launch-check.mts --work <dir> --out <dir>
 *   (internal: --measure <configDir> prints one timing record as JSON)
 * Exit codes: 0 when every step ran (the verdict is in the summary); 1 on a harness failure.
 */

/* oxlint-disable no-await-in-loop -- samples and tampering cases run one at a time against one store. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

/* oxlint-disable no-restricted-imports -- spike-only: the siblings and the CLI's native composition are imported by relative path; deleted with W21. */
// eslint-disable-next-line @nx/enforce-module-boundaries -- spike-only: the CLI composition is not a public export.
import { composeNativeKernels } from '../../../packages/cli/src/native-kernels.ts';
import { hostFacts, median, parseFlags, requiredFlag } from './spike-common.mts';
import {
  build123dSeed,
  kernels,
  purgePageCache,
  receiptOf,
  round1,
  runTau,
  Summary,
  tail,
  writeModels,
} from './store-spike.mts';
import type { SealedReceipt, TauRun } from './store-spike.mts';
/* oxlint-enable no-restricted-imports */

/** D8's budget on the idle M2 Pro, and the charter's runner allowance (S13: 15 s → 30 s on `macos-15`). */
const m2ProBudgetMilliseconds = 20;
const runnerSlack = 2;
const warmSamples = 7;
const coldSamples = 3;

// The launch check as `verifyResourceDigests` in native-process-session.ts runs it: every file streamed through
// sha256, all at once.
const fileSha256 = async (path: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    stream.once('error', reject);
    stream.once('end', () => {
      resolve(hash.digest('hex'));
    });
  });

const hashAll = async (files: ReadonlyArray<{ path: string; sha256: string }>): Promise<number> => {
  const results = await Promise.all(files.map(async (file) => (await fileSha256(file.path)) === file.sha256));
  if (results.includes(false)) {
    throw new Error('a launch resource failed its digest during measurement');
  }
  return files.reduce((total, file) => total + statSync(file.path).size, 0);
};

/** One first-session sample, in a fresh process: compose both kernels from the receipts, then hash what each checks. */
const measure = async (): Promise<void> => {
  // The composition reads TAU_CONFIG_DIR, which the parent set.
  const cpu = process.cpuUsage();
  const started = performance.now();
  const composition = await composeNativeKernels();
  const composed = performance.now();
  const { build123d, picogk } = composition;
  if (build123d === undefined || picogk === undefined) {
    throw new Error(`both kernels must be prepared: ${JSON.stringify(composition.unavailable)}`);
  }
  const build123dFiles = [
    { path: build123d.pythonExecutable, sha256: build123d.pythonSha256 },
    { path: build123d.workerPath, sha256: build123d.workerSha256 },
    ...build123d.supportFiles,
  ];
  const build123dBytes = await hashAll(build123dFiles);
  const build123dHashed = performance.now();
  const picogkFiles = [
    { path: picogk.workerExecutable, sha256: picogk.workerSha256 },
    ...picogk.resourceFiles.map(({ path, sha256 }) => ({ path, sha256 })),
  ];
  const picogkBytes = await hashAll(picogkFiles);
  const done = performance.now();
  const usage = process.cpuUsage(cpu);
  process.stdout.write(
    `${JSON.stringify({
      composeMilliseconds: composed - started,
      build123d: { files: build123dFiles.length, bytes: build123dBytes, hashMilliseconds: build123dHashed - composed },
      picogk: { files: picogkFiles.length, bytes: picogkBytes, hashMilliseconds: done - build123dHashed },
      totalMilliseconds: done - started,
      cpuMilliseconds: (usage.user + usage.system) / 1000,
    })}\n`,
  );
};

type Sample = {
  readonly composeMilliseconds: number;
  readonly build123d: { readonly files: number; readonly bytes: number; readonly hashMilliseconds: number };
  readonly picogk: { readonly files: number; readonly bytes: number; readonly hashMilliseconds: number };
  readonly totalMilliseconds: number;
  readonly cpuMilliseconds: number;
};

const sampleOnce = (configDirectory: string): Sample => {
  const env: Record<string, string | undefined> = { ...process.env };
  env['TAU_CONFIG_DIR'] = configDirectory;
  env['TAU_PAYLOAD_DIR'] = '';
  const result = spawnSync(
    process.execPath,
    ['--import', '@oxc-node/core/register', import.meta.filename, '--measure', configDirectory],
    { encoding: 'utf8', env },
  );
  if (result.status !== 0) {
    throw new Error(`measurement child failed: ${tail(result.stderr)}`);
  }
  return JSON.parse(result.stdout.trim().split('\n').at(-1)!) as Sample;
};

/** Flip one byte (to 255 minus itself) at `offset`, returning the original byte so the case can restore it. */
const flipByte = (path: string, offset: number): number => {
  const bytes = readFileSync(path);
  const original = bytes[offset]!;
  bytes[offset] = 255 - original;
  writeFileSync(path, bytes);
  return original;
};

const setByte = (path: string, offset: number, value: number): void => {
  const bytes = readFileSync(path);
  bytes[offset] = value;
  writeFileSync(path, bytes);
};

const rowMatching = (receipt: SealedReceipt, pattern: RegExp): SealedReceipt['files'][number] => {
  const row = receipt.files.find((file) => pattern.test(file.path) && file.symlinkTarget === undefined);
  if (row === undefined) {
    throw new Error(`no receipt row matches ${String(pattern)} in ${receipt.package}`);
  }
  return row;
};

// The PE signature offset of a managed assembly (`e_lfanew` at 0x3c), so the corruption breaks the image load.
const peSignatureOffset = (path: string): number => readFileSync(path).readUInt32LE(0x3c);

type CaseRecord = Record<string, unknown> & { readonly name: string };

type CaseInput = {
  readonly summary: Summary;
  readonly records: CaseRecord[];
  readonly name: string;
  readonly expectation: string;
  readonly step: () => Promise<Record<string, unknown>>;
};

/** The `tau prepare --verify --json` result, reduced to each closure's status and named rows, or the refusal. */
const briefReport = (stdout: string): unknown => {
  try {
    const report = JSON.parse(stdout.trim().split('\n').at(-1) ?? '') as {
      kind?: string;
      closures?: ReadonlyArray<{ package: string; status: string; payloads?: unknown[]; files?: unknown[] }>;
      code?: string;
      message?: string;
    };
    if (report.kind === 'verify') {
      return (report.closures ?? []).map((closure) => ({
        package: closure.package,
        status: closure.status,
        payloads: closure.payloads,
        files: closure.files?.slice(0, 5),
      }));
    }
    return { code: report.code, message: report.message?.slice(0, 300) };
  } catch {
    return tail(stdout, 300);
  }
};

// The summary keeps the decisive facts of a case: the last stderr lines and the brief verify report.
const compactCase = (key: string, value: unknown): unknown => {
  if (key === 'stdout') {
    return undefined;
  }
  if (key === 'stderr' && typeof value === 'string') {
    return value.trim().split('\n').slice(-2).join(' | ');
  }
  if (key === 'report' && typeof value === 'string') {
    return briefReport(value);
  }
  return value;
};

const runCase = async ({ summary, records, name, expectation, step }: CaseInput): Promise<void> => {
  try {
    const result = await step();
    records.push({ name, expectation, ...result });
    summary.line(`case ${name}: ${JSON.stringify(result, compactCase).slice(0, 2400)}`);
  } catch (error) {
    records.push({ name, expectation, harnessError: String(error) });
    summary.line(`case ${name}: HARNESS ERROR ${String(error).slice(0, 600)}`);
  }
};

const exportRecord = (run: TauRun): Record<string, unknown> => ({
  exitCode: run.exitCode,
  milliseconds: run.milliseconds,
  stderr: tail(run.stderr, 700),
  stdout: tail(run.stdout, 300),
});

const main = async (): Promise<void> => {
  const flags = parseFlags(['work', 'out']);
  const work = requiredFlag(flags, 'work');
  const out = requiredFlag(flags, 'out');
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(out, { recursive: true });
  const configDirectory = join(realpathSync(work), 'config');
  const store = join(configDirectory, 'payloads');
  const project = join(realpathSync(work), 'project');
  writeModels(project);
  const summary = new Summary(join(out, 's4-summary.txt'));
  const host = hostFacts();
  summary.line(
    `S4 host: ${host.cpuModel ?? '?'} x${String(host.parallelism)}, macOS ${host.productVersion ?? '?'}, load ${host.loadAverage ?? '?'}`,
  );

  // Preparation: build123d from the seed, PicoGK from its origins (seed and store are separate directories).
  const prepared: Record<string, unknown> = {};
  for (const { kernel } of kernels) {
    const run = await runTau(['prepare', kernel, '--json'], {
      configDirectory,
      ...(kernel === 'build123d' ? { seed: build123dSeed } : {}),
    });
    prepared[kernel] = { exitCode: run.exitCode, milliseconds: run.milliseconds };
    summary.line(`prepare ${kernel}: exit ${String(run.exitCode)} in ${String(run.milliseconds)} ms`);
    if (run.exitCode !== 0) {
      throw new Error(`tau prepare ${kernel} failed: ${tail(run.stderr)} ${tail(run.stdout)}`);
    }
  }
  const exportModel = async (extension: string): Promise<TauRun> =>
    runTau(['export', `main.${extension}`, '--ext=glb', `--output=${join(project, `out-${extension}.glb`)}`], {
      configDirectory,
      cwd: project,
      killTimeout: 5 * 60_000,
    });

  // 1. Cost: first-session samples in fresh processes, page cache warm, then purged.
  const warm: Sample[] = [];
  for (let index = 0; index < warmSamples; index += 1) {
    warm.push(sampleOnce(configDirectory));
  }
  const cold: Sample[] = [];
  let purged = true;
  for (let index = 0; index < coldSamples; index += 1) {
    purged = purgePageCache() && purged;
    cold.push(sampleOnce(configDirectory));
  }
  const stats = (samples: readonly Sample[]) => ({
    composeMilliseconds: round1(median(samples.map((sample) => sample.composeMilliseconds))),
    build123dHashMilliseconds: round1(median(samples.map((sample) => sample.build123d.hashMilliseconds))),
    picogkHashMilliseconds: round1(median(samples.map((sample) => sample.picogk.hashMilliseconds))),
    totalMilliseconds: round1(median(samples.map((sample) => sample.totalMilliseconds))),
    cpuMilliseconds: round1(median(samples.map((sample) => sample.cpuMilliseconds))),
    build123dFiles: samples[0]!.build123d.files,
    build123dBytes: samples[0]!.build123d.bytes,
    picogkFiles: samples[0]!.picogk.files,
    picogkBytes: samples[0]!.picogk.bytes,
  });
  const warmStats = stats(warm);
  const coldStats = stats(cold);
  const runnerBudget = m2ProBudgetMilliseconds * runnerSlack;
  // Per kernel: the composition (both receipts) plus that kernel's hash, so each figure over-counts the other receipt.
  const perKernel = (sample: ReturnType<typeof stats>) => ({
    build123d: round1(sample.composeMilliseconds + sample.build123dHashMilliseconds),
    picogk: round1(sample.composeMilliseconds + sample.picogkHashMilliseconds),
  });
  summary.line(`cost warm (n=${String(warmSamples)}, median): ${JSON.stringify(warmStats)}`);
  summary.line(
    `cost purged-cold (n=${String(coldSamples)}, median, purge ${purged ? 'ok' : 'FAILED'}): ${JSON.stringify(coldStats)}`,
  );
  summary.line(
    `cost per kernel (compose + own hash) warm ${JSON.stringify(perKernel(warmStats))}, cold ${JSON.stringify(perKernel(coldStats))}; line ${String(m2ProBudgetMilliseconds)} ms M2 Pro, ${String(runnerBudget)} ms runner`,
  );

  // 2. Tampering. Baseline exports first, so a later failure is attributable to the tampering.
  const records: CaseRecord[] = [];
  for (const { extension } of kernels) {
    const run = await exportModel(extension);
    records.push({ name: `baseline export .${extension}`, expectation: 'exit 0', ...exportRecord(run) });
    summary.line(`baseline export .${extension}: exit ${String(run.exitCode)} in ${String(run.milliseconds)} ms`);
  }
  const build123d = receiptOf(store, '@taucad/build123d', 'engine');
  const picogk = receiptOf(store, '@taucad/picogk', 'runtime');
  // What the composition reads (X29): each closure's launch index and the head of its receipt, not the whole receipt.
  const indexOf = (receipt: SealedReceipt): string => {
    const path = join(receipt.root, 'launch.json');
    if (!existsSync(path)) {
      return `${receipt.package} NO launch index (full receipt ${String(statSync(join(receipt.root, 'receipt.json')).size)} bytes)`;
    }
    const index = JSON.parse(readFileSync(path, 'utf8')) as {
      files: ReadonlyArray<{ path: string; byteLength: number }>;
    };
    const bytes = index.files.reduce((sum, file) => sum + file.byteLength, 0);
    return `${receipt.package} ${String(statSync(path).size)} bytes, ${String(index.files.length)} rows (${index.files.map((file) => file.path).join(', ')}; ${String(Math.round(bytes / 1e5) / 10)} MB hashed), receipt ${String(statSync(join(receipt.root, 'receipt.json')).size)} bytes not parsed`;
  };
  summary.line(`launch indexes read at compose: ${[build123d, picogk].map((receipt) => indexOf(receipt)).join('; ')}`);
  // S30's tar finding: a row whose mode a umask can change does not survive a tar seed.
  const modes = (receipt: SealedReceipt): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const file of receipt.files as ReadonlyArray<{ mode: number; symlinkTarget?: string }>) {
      if (file.symlinkTarget === undefined) {
        const key = file.mode.toString(8);
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }
    return counts;
  };
  summary.line(
    `receipt row modes: ${[build123d, picogk].map((receipt) => `${receipt.package} ${JSON.stringify(modes(receipt))}`).join('; ')}`,
  );
  const verify = async (): Promise<Record<string, unknown>> => {
    const run = await runTau(['prepare', '--verify', '--json'], { configDirectory, killTimeout: 15 * 60_000 });
    return {
      exitCode: run.exitCode,
      milliseconds: run.milliseconds,
      report: run.stdout,
      stderr: tail(run.stderr, 300),
    };
  };

  // Cases a and b: a flipped byte in each executable: the launch check must refuse before anything is spawned.
  for (const [label, receipt, executable, extension] of [
    ['build123d executable', build123d, 'python/bin/python3', 'py'],
    ['picogk executable', picogk, 'dotnet/dotnet', 'cs'],
  ] as const) {
    await runCase({
      summary,
      records,
      name: `${label} flipped`,
      expectation: 'export refused at launch, naming the executable',
      step: async () => {
        const path = realpathSync(join(receipt.root, executable));
        const offset = Math.floor(statSync(path).size / 2);
        const original = flipByte(path, offset);
        try {
          const run = await exportModel(extension);
          return { file: path.slice(receipt.root.length + 1), offset, ...exportRecord(run) };
        } finally {
          setByte(path, offset, original);
        }
      },
    });
  }

  // Case c: a flipped byte in a kernel-named resource (checked at launch).
  await runCase({
    summary,
    records,
    name: 'picogk named resource PicoGK.dll flipped',
    expectation: 'export refused at launch, naming the file',
    step: async () => {
      const path = join(picogk.root, rowMatching(picogk, /^tau-worker\/PicoGK\.dll$/u).path);
      const offset = Math.floor(statSync(path).size / 2);
      const original = flipByte(path, offset);
      try {
        return { ...exportRecord(await exportModel('cs')) };
      } finally {
        setByte(path, offset, original);
      }
    },
  });

  // Cases d and e: a resource the launch check does not hash, corrupted so the worker cannot reach `ready`: does a
  // re-verification follow the handshake failure and name the file? Then `tau prepare --verify` names and repairs it.
  for (const [label, receipt, pattern, offsetOf, extension] of [
    [
      'build123d unnamed resource (build123d/__init__ bytecode) corrupted',
      build123d,
      /site-packages\/build123d\/__pycache__\/__init__\.cpython-\d+\.pyc$/u,
      (): number => 16, // The first marshal type code after the 16-byte header: "bad marshal data"
      'py',
    ],
    [
      'picogk unnamed resource (System.Runtime.dll PE signature) corrupted',
      picogk,
      /^dotnet\/shared\/Microsoft\.NETCore\.App\/[^/]+\/System\.Runtime\.dll$/u,
      peSignatureOffset,
      'cs',
    ],
  ] as const) {
    await runCase({
      summary,
      records,
      name: label,
      expectation: 'handshake fails; re-verification names the file',
      step: async () => {
        const row = rowMatching(receipt, pattern);
        const path = join(receipt.root, row.path);
        const offset = offsetOf(path);
        flipByte(path, offset);
        const run = await exportModel(extension);
        const namedInExport = run.stderr.includes(row.path) || run.stdout.includes(row.path);
        const verified = await verify();
        const after = await verify();
        const exported = await exportModel(extension);
        return {
          file: row.path,
          offset,
          export: exportRecord(run),
          exportNamesFile: namedInExport,
          verifyAndRepair: verified,
          verifyNamesFile: String(verified['report']).includes(row.path),
          verifyAfterRepair: after,
          exportAfterRepair: exportRecord(exported),
        };
      },
    });
  }

  // Case f: a deleted `.pyc` that build123d imports at start.
  await runCase({
    summary,
    records,
    name: 'build123d .pyc deleted',
    expectation: 'launch proceeds from source (-B); --verify names and restores it',
    step: async () => {
      const row = rowMatching(
        build123d,
        /site-packages\/build123d\/__pycache__\/topology\.cpython-\d+\.pyc$|site-packages\/build123d\/__pycache__\/geometry\.cpython-\d+\.pyc$/u,
      );
      const path = join(build123d.root, row.path);
      rmSync(path);
      const run = await exportModel('py');
      const verified = await verify();
      const after = await verify();
      return {
        file: row.path,
        export: exportRecord(run),
        verifyAndRepair: verified,
        verifyNamesFile: String(verified['report']).includes(row.path),
        verifyAfterRepair: after,
      };
    },
  });

  // Seeds (S30, X30): the sealed closures copied into an empty store by APFS clone and by tar, then a full offline
  // re-verification with no blobs to repair from: each must report every closure intact (exit 0).
  for (const [label, seedClosures] of [
    [
      'clone',
      (target: string): void => {
        execFileSync('/bin/cp', ['-c', '-R', join(store, 'closures'), join(target, 'closures')]);
      },
    ],
    [
      'tar',
      (target: string): void => {
        const archive = join(work, 'closures.tar');
        execFileSync('tar', ['-cf', archive, '-C', store, 'closures']);
        execFileSync('tar', ['-xf', archive, '-C', target]);
        rmSync(archive, { force: true });
      },
    ],
  ] as const) {
    await runCase({
      summary,
      records,
      name: `seed by ${label} then verify offline`,
      expectation: 'exit 0, every closure intact',
      step: async () => {
        const seededConfig = join(realpathSync(work), `seed-${label}`);
        rmSync(seededConfig, { recursive: true, force: true });
        mkdirSync(join(seededConfig, 'payloads'), { recursive: true });
        seedClosures(join(seededConfig, 'payloads'));
        const run = await runTau(['prepare', '--verify', '--offline', '--json'], {
          configDirectory: seededConfig,
          killTimeout: 15 * 60_000,
        });
        rmSync(seededConfig, { recursive: true, force: true });
        // The first line is the verify report (statuses and named files), even when the run then refuses.
        return {
          exitCode: run.exitCode,
          milliseconds: run.milliseconds,
          report: run.stdout.trim().split('\n')[0] ?? '',
          outcome: tail(run.stdout, 400),
          stderr: tail(run.stderr, 300),
        };
      },
    });
  }

  writeFileSync(
    join(out, 's4-records.json'),
    `${JSON.stringify({ host, prepared, warm, cold, warmStats, coldStats, cases: records }, undefined, 2)}\n`,
  );
  const within = (value: number): string => (value <= runnerBudget ? 'within' : 'OVER');
  const warmKernel = perKernel(warmStats);
  const coldKernel = perKernel(coldStats);
  summary.line(
    `S4 cost verdict (runner line ${String(runnerBudget)} ms): warm build123d ${String(warmKernel.build123d)} ms ${within(warmKernel.build123d)}, picogk ${String(warmKernel.picogk)} ms ${within(warmKernel.picogk)}; cold build123d ${String(coldKernel.build123d)} ms ${within(coldKernel.build123d)}, picogk ${String(coldKernel.picogk)} ms ${within(coldKernel.picogk)}`,
  );
};

const entry = process.argv.includes('--measure') ? measure : main;
await entry();
