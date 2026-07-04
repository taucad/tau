// oxlint-disable complexity -- CLI script with deeply nested benchmark comparison logic

/**
 * Terminal benchmark comparison — prints a table comparing the latest
 * benchmark run from each experiment directory.
 *
 * Usage:
 *   pnpm nx compare-benchmarks runtime -- --experiments ../../tarballs/experiments
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { parseArgs } from 'node:util';
import process from 'node:process';

const { values } = parseArgs({
  options: {
    experiments: { type: 'string', short: 'e' },
    compare: { type: 'string', short: 'c', multiple: true },
  },
  strict: true,
  allowPositionals: false,
});

type BenchResult = {
  name: string;
  category: string;
  median: number;
  mean: number;
  p95: number;
};

type BenchmarkRun = {
  timestamp: string;
  results: BenchResult[];
  totalDurationMs: number;
  provenance?: {
    compilation?: { optimization?: string; lto?: boolean };
    postProcessing?: { postOptSize?: number };
  };
};

type Experiment = {
  name: string;
  shortName: string;
  benchmark: BenchmarkRun;
  wasmSizeBytes: number;
};

function stripTimestampPrefix(name: string): string {
  return name.replace(/^\d+T\d+_/, '');
}

function loadExperiment(directory: string): Experiment | undefined {
  const name = basename(directory);
  const benchDirectory = join(directory, 'benchmarks');
  const benchRoot = existsSync(benchDirectory) ? benchDirectory : directory;

  const benchFiles = readdirSync(benchRoot).filter((f) => f.startsWith('benchmark-') && f.endsWith('.json'));

  if (benchFiles.length === 0) {
    return undefined;
  }

  const latestBench = benchFiles.sort().at(-1)!;
  const benchmark = JSON.parse(readFileSync(join(benchRoot, latestBench), 'utf8')) as BenchmarkRun;

  let wasmSizeBytes = 0;
  const unpackedDirectory = join(directory, 'unpacked');
  if (existsSync(unpackedDirectory)) {
    for (const f of readdirSync(unpackedDirectory)) {
      if (f === 'replicad_single.wasm') {
        wasmSizeBytes = statSync(join(unpackedDirectory, f)).size;
        break;
      }
    }
  }

  if (wasmSizeBytes === 0 && benchmark.provenance?.postProcessing?.postOptSize) {
    wasmSizeBytes = benchmark.provenance.postProcessing.postOptSize;
  }

  return {
    name,
    shortName: stripTimestampPrefix(name),
    benchmark,
    wasmSizeBytes,
  };
}

function geometricMean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((accumulator, v) => accumulator * v, 1) ** (1 / values.length);
}

function formatMs(ms: number): string {
  return ms.toFixed(1).padStart(8);
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDelta(current: number, baseline: number): string {
  if (baseline === 0) {
    return '     —';
  }

  const pct = ((current - baseline) / baseline) * 100;
  const sign = pct > 0 ? '+' : '';
  const formatted = `${sign}${pct.toFixed(1)}%`;

  if (Math.abs(pct) < 2) {
    return formatted.padStart(8);
  }

  const color = pct < 0 ? '\u001B[32m' : '\u001B[31m';
  return `${color}${formatted.padStart(8)}\u001B[0m`;
}

function main(): void {
  const experiments: Experiment[] = [];
  let baseline: Experiment | undefined;

  if (values.compare && values.compare.length > 0) {
    for (const directory of values.compare) {
      const fullPath = resolve(directory);
      const exp = loadExperiment(fullPath);
      if (exp) {
        if (basename(fullPath).includes('baseline')) {
          baseline = exp;
        } else {
          experiments.push(exp);
        }
      } else {
        console.warn(`Could not load experiment: ${directory}`);
      }
    }
  } else {
    const experimentDirectory = resolve(values.experiments ?? '../../tarballs/experiments');
    if (!existsSync(experimentDirectory)) {
      console.error(`Experiments directory not found: ${experimentDirectory}`);
      process.exit(1);
    }

    for (const entry of readdirSync(experimentDirectory).sort()) {
      const fullPath = join(experimentDirectory, entry);
      if (!statSync(fullPath).isDirectory()) {
        continue;
      }

      const exp = loadExperiment(fullPath);
      if (!exp) {
        continue;
      }

      if (entry.includes('baseline')) {
        baseline = exp;
      } else {
        experiments.push(exp);
      }
    }
  }

  if (experiments.length === 0) {
    console.error('No experiments found.');
    process.exit(1);
  }

  const benchmarkNames = experiments[0]!.benchmark.results.map((r) => r.name);
  const nameColW = Math.max(20, ...benchmarkNames.map((n) => n.length)) + 2;
  const colW = Math.max(...experiments.map((experiment) => experiment.shortName.length), 10) + 2;

  const header = [
    'Benchmark'.padEnd(nameColW),
    ...(baseline ? [`${baseline.shortName}`.padStart(colW)] : []),
    ...experiments.map((experiment) => experiment.shortName.padStart(colW)),
  ];

  const separator = '─'.repeat(header.join('│').length);

  console.log();
  console.log('\u001B[1m  WASM Build Benchmark Comparison\u001B[0m');
  console.log();

  // WASM sizes
  console.log('\u001B[1m  WASM Size:\u001B[0m');
  const sizeRow = [
    '  wasm size'.padEnd(nameColW),
    ...(baseline ? [formatMb(baseline.wasmSizeBytes).padStart(colW)] : []),
    ...experiments.map((experiment) => formatMb(experiment.wasmSizeBytes).padStart(colW)),
  ];
  console.log(sizeRow.join('│'));

  if (baseline) {
    const deltaRow = [
      '  vs baseline'.padEnd(nameColW),
      '(ref)'.padStart(colW),
      ...experiments.map((experiment) => formatDelta(experiment.wasmSizeBytes, baseline.wasmSizeBytes).padStart(colW)),
    ];
    console.log(deltaRow.join('│'));
  }

  console.log();

  // Benchmark table
  console.log('\u001B[1m  Benchmark Medians (ms):\u001B[0m');
  console.log(`  ${separator}`);
  console.log(`  ${header.join('│')}`);
  console.log(`  ${separator}`);

  const baselineMedians: Record<string, number> = {};
  if (baseline) {
    for (const r of baseline.benchmark.results) {
      baselineMedians[r.name] = r.median;
    }
  }

  let lastCategory = '';
  for (const benchName of benchmarkNames) {
    const category = experiments[0]!.benchmark.results.find((r) => r.name === benchName)?.category;
    if (category && category !== lastCategory) {
      console.log(`  \u001B[90m── ${category} ──\u001B[0m`);
      lastCategory = category;
    }

    const baselineValue = baselineMedians[benchName];
    const row = [
      `  ${benchName}`.padEnd(nameColW),
      ...(baseline && baselineValue !== undefined
        ? [formatMs(baselineValue).padStart(colW)]
        : baseline
          ? ['—'.padStart(colW)]
          : []),
      ...experiments.map((experiment) => {
        const r = experiment.benchmark.results.find((r) => r.name === benchName);
        if (!r) {
          return '—'.padStart(colW);
        }

        return formatMs(r.median).padStart(colW);
      }),
    ];
    console.log(row.join('│'));

    if (baseline && baselineValue) {
      const deltaRow = [
        ''.padEnd(nameColW),
        ''.padStart(colW),
        ...experiments.map((experiment) => {
          const r = experiment.benchmark.results.find((r) => r.name === benchName);
          if (!r) {
            return ''.padStart(colW);
          }

          return formatDelta(r.median, baselineValue).padStart(colW);
        }),
      ];
      console.log(deltaRow.join('│'));
    }
  }

  console.log(`  ${separator}`);

  // Geo-mean summary
  const baselineGeoMean = baseline ? geometricMean(baseline.benchmark.results.map((r) => r.median)) : 0;

  const geoRow = [
    `  \u001B[1mGeo-Mean\u001B[0m`.padEnd(nameColW + 4), // +4 for ANSI codes
    ...(baseline ? [formatMs(baselineGeoMean).padStart(colW)] : []),
    ...experiments.map((experiment) => {
      const gm = geometricMean(experiment.benchmark.results.map((r) => r.median));
      return formatMs(gm).padStart(colW);
    }),
  ];
  console.log(geoRow.join('│'));

  if (baseline) {
    const gmDeltaRow = [
      ''.padEnd(nameColW),
      '(ref)'.padStart(colW),
      ...experiments.map((experiment) => {
        const gm = geometricMean(experiment.benchmark.results.map((r) => r.median));
        return formatDelta(gm, baselineGeoMean).padStart(colW);
      }),
    ];
    console.log(gmDeltaRow.join('│'));
  }

  // Total duration
  const totalRow = [
    `  Total (ms)`.padEnd(nameColW),
    ...(baseline ? [formatMs(baseline.benchmark.totalDurationMs).padStart(colW)] : []),
    ...experiments.map((experiment) => formatMs(experiment.benchmark.totalDurationMs).padStart(colW)),
  ];
  console.log(totalRow.join('│'));
  console.log(`  ${separator}`);

  // Ranking
  console.log();
  console.log('\u001B[1m  Ranking (by Geo-Mean, fastest first):\u001B[0m');
  const allExperiments = baseline ? [baseline, ...experiments] : experiments;
  const ranked = allExperiments
    .map((experiment) => ({
      name: experiment.shortName,
      geoMean: geometricMean(experiment.benchmark.results.map((r) => r.median)),
      size: experiment.wasmSizeBytes,
    }))
    .sort((a, b) => a.geoMean - b.geoMean);

  for (const [index, r] of ranked.entries()) {
    const marker = index === 0 ? ' 🏆' : '';
    console.log(
      `  ${String(index + 1).padStart(2)}. ${r.name.padEnd(25)} ${formatMs(r.geoMean)} ms   ${formatMb(r.size)}${marker}`,
    );
  }

  console.log();
}

main();
