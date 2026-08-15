#!/usr/bin/env node
/** Reproduce the GeoSpec Wave-1 five-pair V8 performance report. */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { cpus, release, totalmem } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
// oxlint-disable-next-line import/no-unassigned-import -- The benchmark executes the real registered engine.
import '#register-node.js';
import { discoverGeoSpecFiles } from 'geospec/runner';
import { flushEvidenceStore } from '#cache/evidence-cache.js';
import { installNodeEvidenceStore } from '#cache/node-evidence-store.js';
import { createModelLoader } from '#model/load-model.js';
import { createNodeVmFileSystem } from '#runner/node/node-vm-filesystem.js';
import { createGeoSpecRunProfile } from '#runner/profile.js';
import { createSerialGeoSpecRunner } from '#runner/serial.js';

type Diagnostic = { code: string };
type Assertion = { kind: string; passed?: boolean; durationMs?: number; diagnostics?: Diagnostic[] };
type Test = {
  suite: string[];
  name: string;
  status: string;
  durationMs?: number;
  diagnostics: Diagnostic[];
  assertions: Assertion[];
};
type Suite = { file: string; durationMs?: number; tests: Test[] };
type Forensic = {
  file?: string;
  name: string;
  value: number;
  unit: 'milliseconds' | 'count';
};
type ChildReport = {
  passed: number;
  failed: number;
  selectedTests: number;
  /** Milliseconds. */
  processWall: number;
  /** Milliseconds. */
  runnerWall: number;
  peakRssBytes: number;
  suites: Suite[];
  forensic: Forensic[];
  profile: ReturnType<typeof createGeoSpecRunProfile>;
};

const repoRoot = resolve(import.meta.dirname, '../../..');
const scriptPath = fileURLToPath(import.meta.url);
const verificationRoot = resolve(repoRoot, 'packages/geospec-engine/verification');
const defaultOutput = resolve(verificationRoot, 'wave1-performance-report.json');
const sourceProject = resolve(repoRoot, 'libs/tau-examples/src/kernels/replicad/v8-engine-rev2');
const parityVerifier = resolve(repoRoot, 'packages/geospec-engine/scripts/wave1-parity.mts');
const inputManifestPath = resolve(verificationRoot, 'wave1-input-manifest-v2.json');
const parityLedgerPath = resolve(verificationRoot, 'wave1-parity-ledger.json');

const sha256 = (bytes: string | Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');
const seconds = (milliseconds: number): number => Math.round(milliseconds) / 1000;
const median = (values: readonly number[]): number => {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
};
const statistics = (values: readonly number[]): { samples: number[]; median: number; max: number } => ({
  samples: [...values],
  median: median(values),
  max: Math.max(...values),
});

const sanitizedTest = (test: {
  suite: string[];
  name: string;
  status: string;
  durationMs?: number;
  diagnostics: Diagnostic[];
  assertions: Assertion[];
}): Test => ({
  suite: test.suite,
  name: test.name,
  status: test.status,
  ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
  diagnostics: [...test.diagnostics, ...test.assertions.flatMap((assertion) => assertion.diagnostics ?? [])].map(
    ({ code }) => {
      if (typeof code !== 'string') {
        throw new TypeError('A benchmark diagnostic is missing its string code.');
      }
      return { code };
    },
  ),
  assertions: test.assertions.map((assertion) => ({
    kind: assertion.kind,
    ...(assertion.passed === undefined ? {} : { passed: assertion.passed }),
    ...(assertion.durationMs === undefined ? {} : { durationMs: assertion.durationMs }),
  })),
});

const child = async (projectPath: string, cacheDirectory: string, output: string): Promise<void> => {
  const started = performance.now();
  installNodeEvidenceStore({ projectPath, cacheDirectory });
  const profile = createGeoSpecRunProfile();
  const runner = createSerialGeoSpecRunner({
    filesystem: createNodeVmFileSystem(projectPath),
    modelLoader: createModelLoader({ projectPath }),
    internalProfile: profile,
  });
  const forensic: Forensic[] = [];
  let activeFile: string | undefined;
  const unsubscribers = [
    runner.on('file-start', ({ file }) => {
      activeFile = file;
    }),
    runner.on('forensic', ({ name, value, unit }) => {
      forensic.push({ ...(activeFile === undefined ? {} : { file: activeFile }), name, value, unit });
    }),
    runner.on('file-complete', () => {
      activeFile = undefined;
    }),
  ];
  try {
    const discovery = await discoverGeoSpecFiles({
      filesystem: {
        readdir: async (path) => readdir(path),
        stat: async (path) => {
          const entry = await stat(path);
          return { kind: entry.isDirectory() ? 'directory' : 'file' };
        },
      },
      projectPath,
    });
    const result = await runner.run({ files: discovery.files, testTimeout: 600_000, forensic: true });
    const suites = result.files.map(({ file, durationMs, result: moduleResult }): Suite => {
      if (!moduleResult.success) {
        throw new Error(`${file}: benchmark module failed to execute: ${JSON.stringify(moduleResult.issues)}`);
      }
      return {
        file,
        ...(durationMs === undefined ? {} : { durationMs }),
        tests: moduleResult.tests.map(sanitizedTest),
      };
    });
    writeFileSync(
      output,
      JSON.stringify({
        passed: result.passed,
        failed: result.failed,
        selectedTests: result.selectedTests,
        processWall: performance.now() - started,
        runnerWall: result.durationMs ?? 0,
        peakRssBytes: process.resourceUsage().maxRSS * 1024,
        suites,
        forensic,
        profile,
      } satisfies ChildReport),
    );
  } finally {
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
    await runner.close();
    await flushEvidenceStore();
  }
};

const parityView = (report: ChildReport): { passed: number; failed: number; files: unknown[] } => ({
  passed: report.passed,
  failed: report.failed,
  files: report.suites.map((suite) => ({ file: suite.file, durationMs: suite.durationMs, tests: suite.tests })),
});

const runChild = (projectPath: string, cacheDirectory: string, output: string): ChildReport => {
  const environment: Record<string, string | undefined> = { ...process.env };
  environment['NODE_COMPILE_CACHE'] = resolve(repoRoot, 'node_modules/.cache/geospec-compile-cache');
  execFileSync(process.execPath, ['--import', 'tsx', scriptPath, '--child', projectPath, cacheDirectory, output], {
    cwd: repoRoot,
    env: environment,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  return JSON.parse(readFileSync(output, 'utf8')) as ChildReport;
};

const phaseTotals = (report: ChildReport): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const event of report.forensic) {
    if (event.unit === 'milliseconds') {
      totals[event.name] = (totals[event.name] ?? 0) + event.value / 1000;
    }
  }
  return totals;
};

const matcherTotals = (report: ChildReport): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const assertion of report.suites.flatMap((suite) => suite.tests.flatMap((test) => test.assertions))) {
    totals[assertion.kind] = (totals[assertion.kind] ?? 0) + (assertion.durationMs ?? 0) / 1000;
  }
  return totals;
};

const persistentCache = (report: ChildReport): Record<string, number> => {
  const count = (name: string): number => report.forensic.filter((event) => event.name === name).length;
  const xdeLookups = count('load.step.peek');
  const xdeMisses = count('load.step.read');
  const overlapLookups = count('overlap.step.peek');
  const overlapMisses = count('overlap.step.intersection');
  return {
    xdeLookups,
    xdeHits: xdeLookups - xdeMisses,
    xdeMisses,
    overlapLookups,
    overlapHits: overlapLookups - overlapMisses,
    overlapMisses,
  };
};

const testId = (suite: Suite, test: Test): string =>
  `${basename(suite.file)}::${[...test.suite, test.name].join(' > ')}`;

const summaryByKey = (
  reports: readonly ChildReport[],
  values: (report: ChildReport) => Record<string, number>,
): Record<string, ReturnType<typeof statistics>> => {
  const keys = [...new Set(reports.flatMap((report) => Object.keys(values(report))))].sort();
  return Object.fromEntries(keys.map((key) => [key, statistics(reports.map((report) => values(report)[key] ?? 0))]));
};

const runValues = (report: ChildReport): Record<string, number> => {
  const tests = Object.fromEntries(
    report.suites.flatMap((suite) => suite.tests.map((test) => [testId(suite, test), seconds(test.durationMs ?? 0)])),
  );
  return {
    process: seconds(report.processWall),
    runner: seconds(report.runnerWall),
    ...Object.fromEntries(
      report.suites.map((suite) => [`suite:${basename(suite.file)}`, seconds(suite.durationMs ?? 0)]),
    ),
    ...Object.fromEntries(Object.entries(tests).map(([key, value]) => [`test:${key}`, value])),
  };
};

const suiteSeconds = (report: ChildReport, suffix: string): number => {
  const suite = report.suites.find(({ file }) => file.endsWith(suffix));
  if (!suite) {
    throw new Error(`Benchmark report has no '${suffix}' suite.`);
  }
  return seconds(suite.durationMs ?? 0);
};

const parseParentArguments = (): { iterations: number; output: string } => {
  const arguments_ = process.argv.slice(2);
  let iterations = 5;
  let output = defaultOutput;
  for (let index = 0; index < arguments_.length; index += 1) {
    if (arguments_[index] === '--iterations') {
      iterations = Number(arguments_[++index]);
    } else if (arguments_[index] === '--output') {
      output = resolve(arguments_[++index] ?? '');
    } else {
      throw new Error(`Unknown argument '${arguments_[index]}'.`);
    }
  }
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error('--iterations must be a positive integer.');
  }
  return { iterations, output };
};

const parent = (): void => {
  const { iterations, output } = parseParentArguments();
  const temporary = mkdtempSync(join(process.env['TMPDIR'] ?? '/tmp', 'geospec-wave1-benchmark-'));
  const runs: Array<{ iteration: number; cold: ChildReport; hot: ChildReport }> = [];
  try {
    for (let iteration = 1; iteration <= iterations; iteration += 1) {
      const pairRoot = join(temporary, `pair-${iteration}`);
      const projectPath = join(pairRoot, 'v8-engine-rev2');
      const cacheDirectory = join(temporary, `evidence-${iteration}`);
      mkdirSync(pairRoot, { recursive: true });
      cpSync(sourceProject, projectPath, {
        recursive: true,
        filter: (source) => !source.split(sep).includes('.tau') && basename(source) !== '.DS_Store',
      });
      const coldPath = join(pairRoot, 'cold.json');
      const hotPath = join(pairRoot, 'hot.json');
      process.stderr.write(`Wave 1 benchmark ${iteration}/${iterations}: cold\n`);
      const cold = runChild(projectPath, cacheDirectory, coldPath);
      process.stderr.write(`Wave 1 benchmark ${iteration}/${iterations}: hot\n`);
      const hot = runChild(projectPath, cacheDirectory, hotPath);
      for (const [name, report] of [
        ['cold', cold],
        ['hot', hot],
      ] as const) {
        const parityPath = join(pairRoot, `${name}-parity.json`);
        writeFileSync(parityPath, JSON.stringify(parityView(report)));
        execFileSync(process.execPath, [parityVerifier, '--verify', parityPath], { cwd: repoRoot, stdio: 'inherit' });
      }
      runs.push({ iteration, cold, hot });
      writeFileSync(join(temporary, 'checkpoint.json'), JSON.stringify(runs));
    }

    const cold = runs.map((run) => run.cold);
    const hot = runs.map((run) => run.hot);
    const inputManifest = JSON.parse(readFileSync(inputManifestPath, 'utf8')) as {
      sourceRevision: string;
      categories: Record<string, { rootSha256: string }>;
    };
    const barResults = {
      fullCold: {
        ...statistics(cold.map((report) => seconds(report.processWall))),
        medianLimitSeconds: 180,
        maxLimitSeconds: 200,
      },
      fullHot: {
        ...statistics(hot.map((report) => seconds(report.processWall))),
        medianLimitSeconds: 25,
        maxLimitSeconds: 30,
      },
      flowCold: {
        ...statistics(cold.map((report) => suiteSeconds(report, 'flow-paths.geospec.ts'))),
        medianLimitSeconds: 25,
        maxLimitSeconds: 30,
      },
      flowHot: {
        ...statistics(hot.map((report) => suiteSeconds(report, 'flow-paths.geospec.ts'))),
        medianLimitSeconds: 8,
        maxLimitSeconds: 10,
      },
      interferenceCold: {
        ...statistics(cold.map((report) => matcherTotals(report)['componentInterference'] ?? 0)),
        maxLimitSeconds: 20,
      },
    };
    const barFailures = Object.entries(barResults).filter(([, bar]) => {
      const medianLimit = 'medianLimitSeconds' in bar ? bar.medianLimitSeconds : undefined;
      return bar.max > bar.maxLimitSeconds || (medianLimit !== undefined && bar.median > medianLimit);
    });
    const result = {
      schemaVersion: 2,
      capturedOn: new Date().toISOString(),
      scope: 'GeoSpec v2 Wave 1 canonical-engine closeout',
      inputs: {
        inputManifest: {
          path: 'packages/geospec-engine/verification/wave1-input-manifest-v2.json',
          sha256: sha256(Uint8Array.from(readFileSync(inputManifestPath))),
        },
        parityLedger: {
          path: 'packages/geospec-engine/verification/wave1-parity-ledger.json',
          sha256: sha256(Uint8Array.from(readFileSync(parityLedgerPath))),
        },
        roots: Object.fromEntries(
          Object.entries(inputManifest.categories).map(([name, category]) => [name, category.rootSha256]),
        ),
        corpusShape: { matcherCount: 23, fileCount: 9, testCount: 105, expectedPassed: 32, expectedFailed: 73 },
      },
      machine: {
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
        memoryBytes: totalmem(),
        os: `${process.platform} ${release()} ${process.arch}`,
        node: process.version,
        sourceRevision: inputManifest.sourceRevision,
      },
      method: {
        iterations,
        pairing:
          'Each cold run copied final V8 source without any .tau directory and used a unique authenticated out-of-tree evidence root; its immediate hot run reused that exact state.',
        execution:
          'New Node process per serial run, one OCCT singleton per process, explicit 600000 ms test callback timeout, structured forensics enabled, no ambient legacy GeoSpec controls.',
        parity: 'Every cold and hot report is verified against all 105 immutable parity rows.',
        cacheAccounting:
          'Run-dedupe and overlap counters are direct. Persistent XDE/overlap hits are lookups minus native read/intersection spans; project artifact temperature is disclosed by pair protocol and export-phase spans.',
      },
      runs: runs.map(({ iteration, cold: coldRun, hot: hotRun }) => ({
        iteration,
        cold: {
          ...coldRun,
          phaseTotalsSeconds: phaseTotals(coldRun),
          matcherTotalsSeconds: matcherTotals(coldRun),
          persistentCache: persistentCache(coldRun),
          paritySha256: sha256(JSON.stringify(parityView(coldRun))),
        },
        hot: {
          ...hotRun,
          phaseTotalsSeconds: phaseTotals(hotRun),
          matcherTotalsSeconds: matcherTotals(hotRun),
          persistentCache: persistentCache(hotRun),
          paritySha256: sha256(JSON.stringify(parityView(hotRun))),
        },
      })),
      summaries: {
        coldWallSeconds: summaryByKey(cold, runValues),
        hotWallSeconds: summaryByKey(hot, runValues),
        coldMatcherSeconds: summaryByKey(cold, matcherTotals),
        hotMatcherSeconds: summaryByKey(hot, matcherTotals),
        coldPhaseSeconds: summaryByKey(cold, phaseTotals),
        hotPhaseSeconds: summaryByKey(hot, phaseTotals),
      },
      bars: Object.fromEntries(
        Object.entries(barResults).map(([name, bar]) => [
          name,
          { ...bar, status: barFailures.some(([failed]) => failed === name) ? 'NOT_MET' : 'MET' },
        ]),
      ),
    };
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(result, undefined, 2)}\n`);
    if (barFailures.length > 0) {
      throw new Error(`Wave-1 performance bars not met: ${barFailures.map(([name]) => name).join(', ')}`);
    }
    process.stdout.write(`Wrote ${output}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
};

const [mode, projectPath, cacheDirectory, output] = process.argv.slice(2);
if (mode === '--child') {
  if (!projectPath || !cacheDirectory || !output) {
    throw new Error('--child requires project, cache, and output paths.');
  }
  await child(projectPath, cacheDirectory, output);
} else {
  parent();
}
