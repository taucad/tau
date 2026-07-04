/**
 * Build Matrix Report Generator
 *
 * Generates a self-contained HTML dashboard comparing multiple WASM build
 * experiments. Shows size vs speed scatter plots, configuration matrices,
 * per-benchmark heatmaps, and size breakdown charts.
 *
 * Usage:
 *   pnpm nx build-matrix runtime -- --experiments ../../tarballs/experiments/
 *   pnpm nx build-matrix runtime -- --experiments ../../tarballs/experiments/ --baseline ../../tarballs/baselines/v8-rc4-O2-single
 *   pnpm nx build-matrix runtime -- --compare ../../tarballs/experiments/exp1 ../../tarballs/experiments/exp2
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { parseArgs } from 'node:util';
import type { BenchmarkRunResult, BuildProvenance } from '#benchmarks/benchmark-runner.js';
import { benchmarkSuite } from '#benchmarks/benchmark-suite.js';
import process from 'node:process';

const { values } = parseArgs({
  options: {
    experiments: { type: 'string', short: 'e' },
    compare: { type: 'string', short: 'c', multiple: true },
    baseline: { type: 'string', short: 'b' },
    output: {
      type: 'string',
      short: 'o',
      default: '../../tarballs/comparisons',
    },
    help: { type: 'boolean', short: 'h', default: false },
  },
  strict: true,
  allowPositionals: false,
});

if (values.help) {
  console.log(`
Build Matrix Report Generator

Usage:
  pnpm nx build-matrix runtime [-- options]

Options:
  -e, --experiments <dir>   Directory containing experiment subdirectories
  -c, --compare <dirs>      Compare specific experiment directories (multiple)
  -b, --baseline <dir>      Baseline experiment directory for delta calculation
  -o, --output <dir>        Output directory (default: ../../tarballs/comparisons)
  -h, --help                Show this help message
`);
  process.exit(0);
}

type ExperimentData = {
  name: string;
  directory: string;
  provenance?: BuildProvenance;
  benchmark?: BenchmarkRunResult;
  wasmSizeBytes: number;
};

function loadExperiment(directory: string): ExperimentData | undefined {
  if (!existsSync(directory)) {
    return undefined;
  }

  const name = basename(directory);
  const data: ExperimentData = { name, directory, wasmSizeBytes: 0 };

  const provPath = join(directory, 'provenance.json');
  if (existsSync(provPath)) {
    data.provenance = JSON.parse(readFileSync(provPath, 'utf8')) as BuildProvenance;
  }

  const benchDirectory = join(directory, 'benchmarks');
  if (!existsSync(benchDirectory)) {
    return data;
  }

  const benchFiles = readdirSync(benchDirectory).filter(
    (f) => f.startsWith('benchmark-') && f.endsWith('.json') && !f.includes('comparison'),
  );

  if (benchFiles.length > 0) {
    const latestBench = benchFiles.sort().at(-1)!;
    data.benchmark = JSON.parse(readFileSync(join(benchDirectory, latestBench), 'utf8')) as BenchmarkRunResult;
  }

  const unpackedDirectory = join(directory, 'unpacked');
  if (existsSync(unpackedDirectory)) {
    const { exceptions } = data.provenance?.compilation ?? {};
    const variantPrefix = exceptions === 'wasm-native' ? 'replicad_with_exceptions' : 'replicad_single';

    for (const f of readdirSync(unpackedDirectory)) {
      if (f.endsWith('.wasm') && f.startsWith(variantPrefix)) {
        data.wasmSizeBytes += statSync(join(unpackedDirectory, f)).size;
      }
    }
  }

  if (data.wasmSizeBytes === 0 && data.provenance) {
    const { postOptSize } = data.provenance.postProcessing as {
      postOptSize?: number;
    };
    if (typeof postOptSize === 'number' && postOptSize > 0) {
      data.wasmSizeBytes = postOptSize;
    }
  }

  return data;
}

function discoverExperiments(directory: string): ExperimentData[] {
  const experiments: ExperimentData[] = [];
  if (!existsSync(directory)) {
    return experiments;
  }

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      const experiment = loadExperiment(fullPath);
      if (experiment) {
        experiments.push(experiment);
      }
    }
  }

  return experiments.sort((a, b) => a.name.localeCompare(b.name));
}

function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function totalTime(input: number[]): number {
  return input.reduce((accumulator, v) => accumulator + v, 0);
}

function stripTimestampPrefix(name: string): string {
  return name.replace(/^\d+T\d+_/, '');
}

type DataPoint = { name: string; sizeMb: number; medianMs: number };

function isDominated(candidate: DataPoint, points: DataPoint[]): boolean {
  for (const other of points) {
    if (
      other.sizeMb <= candidate.sizeMb &&
      other.medianMs <= candidate.medianMs &&
      (other.sizeMb < candidate.sizeMb || other.medianMs < candidate.medianMs)
    ) {
      return true;
    }
  }

  return false;
}

function computeParetoFrontier(points: DataPoint[]): Set<string> {
  const paretoNames = new Set<string>();
  for (const candidate of points) {
    if (!isDominated(candidate, points)) {
      paretoNames.add(candidate.name);
    }
  }

  return paretoNames;
}

function generateSizeSpeedChart(experiments: ExperimentData[]): string {
  const dataPoints = experiments
    .filter((experiment) => experiment.benchmark && experiment.wasmSizeBytes > 0)
    .map((experiment) => ({
      name: experiment.name,
      sizeMb: experiment.wasmSizeBytes / (1024 * 1024),
      medianMs: totalTime(experiment.benchmark!.results.map((r) => r.median)),
    }));

  if (dataPoints.length === 0) {
    return '<p>No experiments with both WASM size and benchmark data.</p>';
  }

  const minSize = Math.min(...dataPoints.map((d) => d.sizeMb)) * 0.95;
  const maxSize = Math.max(...dataPoints.map((d) => d.sizeMb)) * 1.05;
  const minTime = Math.min(...dataPoints.map((d) => d.medianMs)) * 0.9;
  const maxTime = Math.max(...dataPoints.map((d) => d.medianMs)) * 1.1;

  const chartW = 700;
  const chartH = 400;
  const padL = 70;
  const padR = 20;
  const padT = 20;
  const padB = 50;
  const plotW = chartW - padL - padR;
  const plotH = chartH - padT - padB;

  const scaleX = (v: number): number => padL + ((v - minSize) / (maxSize - minSize)) * plotW;
  const scaleY = (v: number): number => padT + plotH - ((v - minTime) / (maxTime - minTime)) * plotH;

  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'];
  const paretoSet = computeParetoFrontier(dataPoints);

  const paretoPoints = dataPoints.filter((dp) => paretoSet.has(dp.name)).sort((a, b) => a.sizeMb - b.sizeMb);

  let frontierLine = '';
  if (paretoPoints.length > 1) {
    const segments: string[] = [];
    for (let index = 0; index < paretoPoints.length; index++) {
      const current = paretoPoints[index]!;
      const cx = scaleX(current.sizeMb);
      const cy = scaleY(current.medianMs);
      if (index === 0) {
        segments.push(`M ${cx} ${cy}`);
      } else {
        const previousY = scaleY(paretoPoints[index - 1]!.medianMs);
        segments.push(`L ${cx} ${previousY}`, `L ${cx} ${cy}`);
      }
    }

    frontierLine = `<path d="${segments.join(' ')}" fill="none" stroke="#F59E0B" stroke-width="2" stroke-dasharray="6 3" opacity="0.6"/>`;
  }

  let dots = '';
  let index = 0;
  for (const dp of dataPoints) {
    const x = scaleX(dp.sizeMb);
    const y = scaleY(dp.medianMs);
    const color = colors[index % colors.length]!;
    const isPareto = paretoSet.has(dp.name);
    dots += `<circle cx="${x}" cy="${y}" r="6" fill="${color}" stroke="white" stroke-width="2"/>`;
    if (isPareto) {
      dots += `<polygon points="${x},${y - 10} ${x - 6},${y - 2} ${x - 4},${y + 8} ${x + 4},${y + 8} ${x + 6},${y - 2}" class="pareto-star"/>`;
    }

    dots += `<text x="${x + 10}" y="${y + 4}" font-size="10" fill="#374151">${escapeHtml(stripTimestampPrefix(dp.name))}${isPareto ? ' ★' : ''}</text>`;
    index++;
  }

  const axes = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="#D1D5DB" stroke-width="1"/>
    <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="#D1D5DB" stroke-width="1"/>
    <text x="${padL + plotW / 2}" y="${chartH - 5}" text-anchor="middle" font-size="12" fill="#6B7280">WASM Size (MB)</text>
    <text x="15" y="${padT + plotH / 2}" text-anchor="middle" font-size="12" fill="#6B7280" transform="rotate(-90, 15, ${padT + plotH / 2})">Total Wall Time (ms)</text>
  `;

  const gridLines: string[] = [];
  const xSteps = 5;
  const ySteps = 5;
  for (let index = 0; index <= xSteps; index++) {
    const xValue = minSize + ((maxSize - minSize) * index) / xSteps;
    const x = scaleX(xValue);
    gridLines.push(
      `<line x1="${x}" y1="${padT}" x2="${x}" y2="${padT + plotH}" stroke="#F3F4F6" stroke-width="1"/>`,
      `<text x="${x}" y="${padT + plotH + 18}" text-anchor="middle" font-size="10" fill="#9CA3AF">${xValue.toFixed(1)}</text>`,
    );
  }

  for (let index = 0; index <= ySteps; index++) {
    const yValue = minTime + ((maxTime - minTime) * index) / ySteps;
    const y = scaleY(yValue);
    gridLines.push(
      `<line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="#F3F4F6" stroke-width="1"/>`,
      `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#9CA3AF">${yValue.toFixed(1)}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chartW}" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}">
    <rect width="${chartW}" height="${chartH}" fill="white" rx="8"/>
    ${gridLines.join('\n')}
    ${axes}
    ${frontierLine}
    ${dots}
  </svg>`;
}

type EmbeddedExperiment = {
  name: string;
  shortName: string;
  wasmSizeBytes: number;
  optimization: string;
  lto: boolean;
  exceptions: string;
  threading: string;
  wasmOptLevel: string;
  emccCompileFlags: string[];
  boundSymbols: number | undefined;
  emscripten: string;
  medians: Record<string, number>;
  categories: Record<string, string>;
};

type ReportData = {
  experiments: EmbeddedExperiment[];
  baseline: EmbeddedExperiment | undefined;
  benchmarks: string[];
  categories: string[];
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function buildExperimentRecord(experiment: ExperimentData): EmbeddedExperiment {
  const compilation = experiment.provenance?.compilation ?? {};
  const linking = experiment.provenance?.linking ?? {};
  const toolchain = experiment.provenance?.toolchain ?? {};

  const medians: Record<string, number> = {};
  const categories: Record<string, string> = {};
  if (experiment.benchmark) {
    for (const r of experiment.benchmark.results) {
      medians[r.name] = r.median;
      categories[r.name] = r.category;
    }
  }

  const flags = compilation['emccCompileFlags'];
  const symbols = linking['boundSymbols'];

  return {
    name: experiment.name,
    shortName: stripTimestampPrefix(experiment.name),
    wasmSizeBytes: experiment.wasmSizeBytes,
    optimization: asString(compilation['optimization']),
    lto: Boolean(compilation['lto']),
    exceptions: asString(compilation['exceptions'], 'none'),
    threading: asString(compilation['threading']),
    wasmOptLevel: asString(compilation['wasmOptLevel']),
    emccCompileFlags: Array.isArray(flags) ? (flags as string[]) : [],
    boundSymbols: typeof symbols === 'number' ? symbols : undefined,
    emscripten: asString(toolchain['emscripten']),
    medians,
    categories,
  };
}

function buildReportData(experiments: ExperimentData[], baseline?: ExperimentData): ReportData {
  const benchmarkSet = new Set<string>();
  const categorySet = new Set<string>();

  const allExperiments = baseline ? [...experiments, baseline] : experiments;
  for (const experiment of allExperiments) {
    if (experiment.benchmark) {
      for (const r of experiment.benchmark.results) {
        benchmarkSet.add(r.name);
        categorySet.add(r.category);
      }
    }
  }

  const suiteOrder = benchmarkSuite.map((c) => c.name);
  const orderedBenchmarks = suiteOrder.filter((name) => benchmarkSet.has(name));
  for (const name of benchmarkSet) {
    if (!orderedBenchmarks.includes(name)) {
      orderedBenchmarks.push(name);
    }
  }

  const maxBenchCount = Math.max(...experiments.map((experiment) => experiment.benchmark?.results.length ?? 0));
  const minRequired = Math.ceil(maxBenchCount * 0.8);
  const withBenchmarks = experiments.filter(
    (experiment) => experiment.benchmark && experiment.benchmark.results.length >= minRequired,
  );

  return {
    experiments: withBenchmarks.map((experiment) => buildExperimentRecord(experiment)),
    baseline: baseline ? buildExperimentRecord(baseline) : undefined,
    benchmarks: orderedBenchmarks,
    categories: [...categorySet].sort(),
  };
}

function generateSizeBreakdown(experiments: ExperimentData[]): string {
  const barWidth = 200;
  const barGap = 60;
  const maxHeight = 300;
  const padL = 70;
  const padB = 140;
  const padT = 30;
  const padR = 30;

  const chartW = padL + (barWidth + barGap) * experiments.length + padR;
  const chartH = maxHeight + padT + padB;

  const maxSize = Math.max(...experiments.map((experiment) => experiment.wasmSizeBytes), 1);

  let bars = '';
  let index = 0;
  for (const experiment of experiments) {
    const x = padL + index * (barWidth + barGap);
    const sizePx = (experiment.wasmSizeBytes / maxSize) * maxHeight;
    const y = padT + maxHeight - sizePx;

    const postProcessing = experiment.provenance?.postProcessing ?? {};
    const compilation = experiment.provenance?.compilation ?? {};
    const toolchain = experiment.provenance?.toolchain ?? {};
    const preOpt = Number(postProcessing['preOptSize'] ?? 0);
    const postOpt = Number(postProcessing['postOptSize'] ?? experiment.wasmSizeBytes);

    if (preOpt > 0 && preOpt !== postOpt) {
      const preOptPx = (preOpt / maxSize) * maxHeight;
      const preY = padT + maxHeight - preOptPx;
      bars += `<rect x="${x}" y="${preY}" width="${barWidth}" height="${preOptPx}" fill="#E5E7EB" rx="4"/>`;
    }

    bars += `<rect x="${x}" y="${y}" width="${barWidth}" height="${sizePx}" fill="#3B82F6" rx="4"/>`;
    bars += `<text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="13" font-weight="600" fill="#374151">${formatMb(experiment.wasmSizeBytes)}</text>`;

    if (preOpt > 0 && preOpt > postOpt) {
      const reduction = ((1 - postOpt / preOpt) * 100).toFixed(1);
      bars += `<text x="${x + barWidth / 2}" y="${y - 24}" text-anchor="middle" font-size="11" fill="#10B981">-${reduction}%</text>`;
    }

    const labelX = x + barWidth / 2;
    const labelY = padT + maxHeight + 18;
    const lineHeight = 16;

    const shortName = stripTimestampPrefix(experiment.name);
    bars += `<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="12" font-weight="600" fill="#1F2937">${escapeHtml(shortName)}</text>`;

    const opt = asString(compilation['optimization'], '?');
    const lto = compilation['lto'] ? 'LTO' : 'noLTO';
    const exc = asString(compilation['exceptions'], 'none');
    const wasmOpt = asString(compilation['wasmOptLevel'], '?');
    const emscriptenVersion = asString(toolchain['emscripten'], '?');
    const symbols =
      typeof experiment.provenance?.linking['boundSymbols'] === 'number'
        ? `${experiment.provenance.linking['boundSymbols']} symbols`
        : '';

    bars += `<text x="${labelX}" y="${labelY + lineHeight}" text-anchor="middle" font-size="11" fill="#6B7280">compile: ${opt} | ${lto} | exc: ${exc}</text>`;
    bars += `<text x="${labelX}" y="${labelY + lineHeight * 2}" text-anchor="middle" font-size="11" fill="#6B7280">wasm-opt: ${wasmOpt} | em: ${emscriptenVersion}</text>`;
    if (symbols) {
      bars += `<text x="${labelX}" y="${labelY + lineHeight * 3}" text-anchor="middle" font-size="11" fill="#9CA3AF">${symbols}</text>`;
    }

    index++;
  }

  const yAxis = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + maxHeight}" stroke="#D1D5DB"/>`;
  const gridSteps = 5;
  let gridLines = '';
  for (let index = 0; index <= gridSteps; index++) {
    const gridValue = (maxSize * index) / gridSteps;
    const gridY = padT + maxHeight - (gridValue / maxSize) * maxHeight;
    gridLines += `<line x1="${padL}" y1="${gridY}" x2="${chartW - padR}" y2="${gridY}" stroke="#F3F4F6"/>`;
    gridLines += `<text x="${padL - 8}" y="${gridY + 4}" text-anchor="end" font-size="10" fill="#9CA3AF">${formatMb(gridValue)}</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${chartW}" height="${chartH}" viewBox="0 0 ${chartW} ${chartH}">
    <rect width="${chartW}" height="${chartH}" fill="white" rx="8"/>
    ${gridLines}
    ${yAxis}
    ${bars}
  </svg>`;
}

function generateAlpineScript(): string {
  return `<script>
document.addEventListener('alpine:init', function() {
  var D = window.__DATA__;
  Alpine.store('data', D);
  Alpine.store('filter', { category: 'all' });

  window._fmt = {
    mb: function(bytes) { return (bytes / (1024 * 1024)).toFixed(2) + ' MB'; },
    ms: function(v) { if (v < 1) return (v * 1000).toFixed(0) + 'µs'; if (v >= 1000) return (v / 1000).toFixed(2) + 's'; return v.toFixed(1) + 'ms'; },
    pct: function(v) { return (v > 0 ? '+' : '') + v.toFixed(1) + '%'; },
    deltaColor: function(d) {
      if (d === null) return '';
      var a = Math.abs(d);
      if (a < 2) return '#F9FAFB';
      var t = Math.min(a, 50) / 50;
      if (d < 0) {
        var l = 95 - t * 45;
        var s = 60 + t * 20;
        return 'hsl(152,' + s + '%,' + l + '%)';
      }
      var l = 95 - t * 40;
      var s = 70 + t * 15;
      return 'hsl(0,' + s + '%,' + l + '%)';
    },
    deltaTextColor: function(d) {
      if (d === null) return '#6B7280';
      if (Math.abs(d) < 2) return '#6B7280';
      return d < 0 ? '#10B981' : '#EF4444';
    },
    totalTime: function(exp, category) {
      var vals = Object.keys(exp.medians)
        .filter(function(b) { return category === 'all' || exp.categories[b] === category; })
        .map(function(b) { return exp.medians[b]; })
        .filter(function(v) { return v > 0; });
      if (vals.length === 0) return 0;
      return vals.reduce(function(a, b) { return a + b; }, 0);
    }
  };

  Alpine.data('configMatrix', function() {
    return {
      sortCol: null,
      sortAsc: true,

      toggleSort: function(col) {
        if (this.sortCol === col) { this.sortAsc = !this.sortAsc; }
        else { this.sortCol = col; this.sortAsc = true; }
      },

      sortArrow: function(col) {
        if (this.sortCol !== col) return '▲▼';
        return this.sortAsc ? '▲' : '▼';
      },

      tt: function(exp) {
        return _fmt.totalTime(exp, this.$store.filter.category);
      },

      getValue: function(exp, col) {
        switch (col) {
          case 'name': return exp.shortName;
          case 'optimization': return exp.optimization;
          case 'lto': return exp.lto ? 'Yes' : 'No';
          case 'exceptions': return exp.exceptions;
          case 'threading': return exp.threading;
          case 'wasmOptLevel': return exp.wasmOptLevel;
          case 'flags': return exp.emccCompileFlags.join(' ');
          case 'symbols': return exp.boundSymbols || 0;
          case 'emscripten': return exp.emscripten;
          case 'wasmSize': return exp.wasmSizeBytes;
          case 'totalTime': return this.tt(exp);
          case 'sizeDelta': { var d = this.sizeDelta(exp); return d !== null ? d : 0; }
          case 'speedDelta': { var d = this.speedDelta(exp); return d !== null ? d : 0; }
          default: return '';
        }
      },

      sorted: function() {
        var exps = this.$store.data.experiments.slice();
        if (!this.sortCol) return exps;
        var col = this.sortCol;
        var dir = this.sortAsc ? 1 : -1;
        var self = this;
        return exps.sort(function(a, b) {
          var va = self.getValue(a, col);
          var vb = self.getValue(b, col);
          if (typeof va === 'string') return dir * va.localeCompare(vb);
          return dir * ((va || 0) - (vb || 0));
        });
      },

      sizeDelta: function(exp) {
        var bl = this.$store.data.baseline;
        if (!bl || bl.wasmSizeBytes === 0) return null;
        return ((exp.wasmSizeBytes - bl.wasmSizeBytes) / bl.wasmSizeBytes) * 100;
      },

      speedDelta: function(exp) {
        var bl = this.$store.data.baseline;
        if (!bl) return null;
        var blTt = _fmt.totalTime(bl, this.$store.filter.category);
        if (blTt === 0) return null;
        return ((this.tt(exp) - blTt) / blTt) * 100;
      },

      benchWins: function(exp) {
        var bl = this.$store.data.baseline;
        if (!bl) return { faster: 0, slower: 0 };
        var cat = this.$store.filter.category;
        var faster = 0; var slower = 0;
        var benchmarks = Object.keys(exp.medians);
        for (var i = 0; i < benchmarks.length; i++) {
          var b = benchmarks[i];
          if (cat !== 'all' && exp.categories[b] !== cat) continue;
          var refVal = bl.medians[b];
          var expVal = exp.medians[b];
          if (!refVal || !expVal) continue;
          var d = ((expVal - refVal) / refVal) * 100;
          if (d < -2) faster++;
          else if (d > 2) slower++;
        }
        return { faster: faster, slower: slower };
      }
    };
  });

  Alpine.data('heatmap', function() {
    return {
      refIndex: -1,
      display: 'both',

      setRef: function(index) {
        this.refIndex = (this.refIndex === index) ? -1 : index;
      },

      ref: function() {
        if (this.refIndex >= 0) return this.$store.data.experiments[this.refIndex];
        return this.$store.data.baseline || this.$store.data.experiments[0];
      },

      refLabel: function() {
        var r = this.ref();
        return r ? r.shortName : '';
      },

      isRef: function(index) {
        if (this.refIndex >= 0) return index === this.refIndex;
        return false;
      },

      refTime: function(bench) {
        var r = this.ref();
        if (!r || r.medians[bench] === undefined) return null;
        return r.medians[bench];
      },

      expTime: function(exp, bench) {
        if (exp.medians[bench] === undefined) return null;
        return exp.medians[bench];
      },

      delta: function(exp, bench) {
        var r = this.ref();
        if (!r || !r.medians[bench]) return null;
        var refVal = r.medians[bench];
        var expVal = exp.medians[bench];
        if (expVal === undefined || refVal === 0) return null;
        return ((expVal - refVal) / refVal) * 100;
      },

      showPct: function() { return this.display === 'both' || this.display === 'percentage'; },
      showTime: function() { return this.display === 'both' || this.display === 'time'; },

      cellHtml: function(exp, bench) {
        var d = this.delta(exp, bench);
        var t = this.expTime(exp, bench);
        if (d === null && t === null) return '\u2014';
        var parts = [];
        if (this.showPct() && d !== null) parts.push('<span style="font-weight:600">' + _fmt.pct(d) + '</span>');
        if (this.showTime() && t !== null) parts.push('<span style="opacity:0.7">' + _fmt.ms(t) + '</span>');
        return parts.join('<br>');
      },

      benchmarks: function() {
        var cat = this.$store.filter.category;
        var exps = this.$store.data.experiments;
        return this.$store.data.benchmarks.filter(function(b) {
          if (cat === 'all') return true;
          for (var i = 0; i < exps.length; i++) {
            if (exps[i].categories[b] === cat) return true;
          }
          return false;
        });
      }
    };
  });
});
${'</'}script>`;
}

function generateMatrixReport(experiments: ExperimentData[], baseline?: ExperimentData): string {
  const now = new Date().toISOString();
  const reportData = buildReportData(experiments, baseline);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WASM Build Matrix Report</title>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js">${'</'}script>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1F2937; background: #F9FAFB; padding: 2rem; max-width: 1400px; margin: 0 auto; }
  h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 1rem; border-bottom: 1px solid #E5E7EB; padding-bottom: 0.5rem; }
  .meta { color: #6B7280; font-size: 0.875rem; margin-bottom: 1.5rem; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 1.5rem; font-size: 0.8rem; }
  th, td { padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid #E5E7EB; }
  th { background: #F3F4F6; font-weight: 600; color: #374151; position: sticky; top: 0; }
  tr:hover { background: #F9FAFB; }
  .chart-container { margin: 1.5rem 0; overflow-x: auto; }
  code { background: #F3F4F6; padding: 1px 4px; border-radius: 3px; font-size: 0.8rem; }
  .section { margin: 2rem 0; }
  .legend { display: flex; gap: 1rem; margin: 0.5rem 0; font-size: 0.75rem; color: #6B7280; }
  .legend-item { display: flex; align-items: center; gap: 4px; }
  .legend-swatch { width: 12px; height: 12px; border-radius: 2px; }
  .footer { margin-top: 3rem; color: #9CA3AF; font-size: 0.75rem; border-top: 1px solid #E5E7EB; padding-top: 1rem; }
  .explanation { color: #6B7280; font-size: 0.8rem; margin: 0.5rem 0 1rem; line-height: 1.5; max-width: 80ch; }
  .sortable-th { cursor: pointer; user-select: none; }
  .sortable-th:hover { background: #E5E7EB; }
  .sort-arrow { font-size: 0.65rem; margin-left: 3px; opacity: 0.5; }
  .filter-bar { display: flex; flex-wrap: wrap; gap: 0.4rem; margin: 0.75rem 0 1rem; }
  .filter-btn { padding: 0.3rem 0.7rem; border: 1px solid #D1D5DB; border-radius: 6px; background: white; font-size: 0.75rem; cursor: pointer; transition: all 0.15s; }
  .filter-btn:hover { border-color: #9CA3AF; }
  .filter-btn.active { background: #3B82F6; color: white; border-color: #3B82F6; }
  .compile-flags { max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.7rem; display: inline-block; }
  .compile-flags:hover { white-space: normal; overflow: visible; }
  .pareto-star { fill: #F59E0B; stroke: #D97706; stroke-width: 1; }
  .ref-th { background: #DBEAFE !important; }
  .heatmap-th { cursor: pointer; user-select: none; transition: background 0.15s; }
  .heatmap-th:hover { background: #E5E7EB; }
</style>
<script>window.__DATA__=${JSON.stringify(reportData)};${'</'}script>
${generateAlpineScript()}
</head>
<body>
  <h1>WASM Build Matrix Report</h1>
  <p class="meta">Generated ${escapeHtml(now)} &bull; ${experiments.length} experiments${baseline ? ` &bull; Baseline: <strong>${escapeHtml(stripTimestampPrefix(baseline.name))}</strong>` : ''}</p>

  <div class="section">
    <h2>Size vs Speed</h2>
    <p class="explanation">Each point represents a build experiment. The ideal position is the <strong>lower-left corner</strong> (smaller binary AND faster execution). Experiments marked with a ★ star lie on the <strong>Pareto frontier</strong> &mdash; no other experiment is both smaller AND faster. The dashed gold line connects these optimal points. Any experiment above or to the right of the frontier is &ldquo;dominated&rdquo; by at least one frontier experiment.</p>
    <div class="chart-container">
      ${generateSizeSpeedChart(experiments)}
    </div>
  </div>

  <div class="section">
    <h2>Configuration Matrix</h2>
    <p class="explanation">Click any column header to sort. <strong>WASM Size</strong> is the post-optimization binary size. <strong>Total Time</strong> is the sum of all benchmark median times &mdash; it represents the total wall-clock time to execute the entire suite. Use the category filter below to recalculate the Total Time for a subset of benchmarks.</p>
    <div x-data="configMatrix()">
      <div class="filter-bar">
        <button class="filter-btn" :class="{ 'active': $store.filter.category === 'all' }" @click="$store.filter.category = 'all'">All</button>
        <template x-for="cat in $store.data.categories" :key="cat">
          <button class="filter-btn" :class="{ 'active': $store.filter.category === cat }" @click="$store.filter.category = cat" x-text="cat"></button>
        </template>
      </div>
      <table id="config-matrix">
        <thead>
          <tr>
            <th class="sortable-th" @click="toggleSort('name')">Experiment <span class="sort-arrow" x-text="sortArrow('name')"></span></th>
            <th class="sortable-th" @click="toggleSort('optimization')">Compile <span class="sort-arrow" x-text="sortArrow('optimization')"></span></th>
            <th class="sortable-th" @click="toggleSort('lto')">LTO <span class="sort-arrow" x-text="sortArrow('lto')"></span></th>
            <th class="sortable-th" @click="toggleSort('exceptions')">Exceptions <span class="sort-arrow" x-text="sortArrow('exceptions')"></span></th>
            <th class="sortable-th" @click="toggleSort('threading')">Threading <span class="sort-arrow" x-text="sortArrow('threading')"></span></th>
            <th class="sortable-th" @click="toggleSort('wasmOptLevel')">wasm-opt <span class="sort-arrow" x-text="sortArrow('wasmOptLevel')"></span></th>
            <th class="sortable-th" @click="toggleSort('flags')">Compile Flags <span class="sort-arrow" x-text="sortArrow('flags')"></span></th>
            <th class="sortable-th" @click="toggleSort('symbols')">Symbols <span class="sort-arrow" x-text="sortArrow('symbols')"></span></th>
            <th class="sortable-th" @click="toggleSort('emscripten')">Emscripten <span class="sort-arrow" x-text="sortArrow('emscripten')"></span></th>
            <th class="sortable-th" @click="toggleSort('wasmSize')">WASM Size <span class="sort-arrow" x-text="sortArrow('wasmSize')"></span></th>
            <th class="sortable-th" @click="toggleSort('totalTime')">Total Time <span class="sort-arrow" x-text="sortArrow('totalTime')"></span></th>
            <th class="sortable-th" @click="toggleSort('sizeDelta')">Size Δ <span class="sort-arrow" x-text="sortArrow('sizeDelta')"></span></th>
            <th class="sortable-th" @click="toggleSort('speedDelta')">Time Δ <span class="sort-arrow" x-text="sortArrow('speedDelta')"></span></th>
            <th>Faster / Slower</th>
          </tr>
        </thead>
        <tbody>
          <template x-for="exp in sorted()" :key="exp.name">
            <tr>
              <td><strong x-text="exp.shortName"></strong></td>
              <td><code x-text="exp.optimization"></code></td>
              <td x-text="exp.lto ? 'Yes' : 'No'"></td>
              <td x-text="exp.exceptions"></td>
              <td x-text="exp.threading"></td>
              <td><code x-text="exp.wasmOptLevel || '—'"></code></td>
              <td :title="exp.emccCompileFlags.join(' ')"><span class="compile-flags" x-text="exp.emccCompileFlags.length > 0 ? exp.emccCompileFlags.join(' ') : '—'"></span></td>
              <td x-text="exp.boundSymbols !== null ? exp.boundSymbols : '—'"></td>
              <td x-text="exp.emscripten || '—'"></td>
              <td x-text="exp.wasmSizeBytes > 0 ? _fmt.mb(exp.wasmSizeBytes) : '—'"></td>
              <td x-text="tt(exp) > 0 ? _fmt.ms(tt(exp)) : '—'"></td>
              <td :style="'color:' + _fmt.deltaTextColor(sizeDelta(exp))" x-text="sizeDelta(exp) !== null ? _fmt.pct(sizeDelta(exp)) : '—'"></td>
              <td :style="'color:' + _fmt.deltaTextColor(speedDelta(exp))" x-text="speedDelta(exp) !== null ? _fmt.pct(speedDelta(exp)) : '—'"></td>
              <td><span style="color:#10B981" x-text="benchWins(exp).faster + '↑'"></span> / <span style="color:#EF4444" x-text="benchWins(exp).slower + '↓'"></span></td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
    <p class="explanation"><strong>Delta columns:</strong> <strong>Size &Delta;</strong> compares WASM binary size (positive = larger). <strong>Time &Delta;</strong> compares total wall-clock execution time (positive = slower). <strong>Faster/Slower</strong> shows how many individual benchmarks improved (&gt;2% faster) vs regressed (&gt;2% slower) compared to the baseline. <span style="color:#10B981">Green = improvement</span>, <span style="color:#EF4444">red = regression</span>. Deltas within &plusmn;2% are shown in gray.</p>
  </div>

  <div class="section">
    <h2>Per-Benchmark Heatmap</h2>
    <div x-data="heatmap()">
      <p class="explanation">Each cell shows the change in median time relative to the reference. <span style="color:#10B981">Green = faster</span>, <span style="color:#EF4444">red = slower</span>. <strong>Click any experiment column header</strong> to set it as the reference. Currently comparing against: <strong x-text="refLabel()"></strong></p>
      <div style="display:flex;align-items:center;gap:1.5rem;margin:0.75rem 0 1rem;flex-wrap:wrap">
        <div class="legend" style="margin:0;align-items:center">
          <span style="font-size:0.75rem;color:#6B7280">50%+ faster</span>
          <span style="display:inline-block;width:200px;height:14px;border-radius:3px;background:linear-gradient(to right,hsl(152,80%,50%),hsl(152,65%,75%),hsl(152,60%,93%),#F9FAFB,hsl(0,73%,93%),hsl(0,78%,75%),hsl(0,85%,55%))"></span>
          <span style="font-size:0.75rem;color:#6B7280">50%+ slower</span>
        </div>
        <div class="filter-bar" style="margin:0">
          <button class="filter-btn" :class="{ 'active': display === 'both' }" @click="display = 'both'">Both</button>
          <button class="filter-btn" :class="{ 'active': display === 'time' }" @click="display = 'time'">Time</button>
          <button class="filter-btn" :class="{ 'active': display === 'percentage' }" @click="display = 'percentage'">Percentage</button>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table id="heatmap-table">
          <thead>
            <tr>
              <th>Benchmark</th>
              <th class="ref-th" style="text-align:center" x-text="refLabel() + ' (ref)'"></th>
              <template x-for="(exp, index) in $store.data.experiments" :key="exp.name">
                <th class="heatmap-th" :class="{ 'ref-th': isRef(index) }" @click="setRef(index)" x-text="exp.shortName"></th>
              </template>
            </tr>
          </thead>
          <tbody>
            <template x-for="bench in benchmarks()" :key="bench">
              <tr>
                <td><strong x-text="bench"></strong></td>
                <td style="text-align:center;font-size:0.8rem;background:#F3F4F6;font-weight:500" x-text="refTime(bench) !== null ? _fmt.ms(refTime(bench)) : '—'"></td>
                <template x-for="(exp, index) in $store.data.experiments" :key="exp.name + '-' + bench">
                  <td style="text-align:center;font-size:0.8rem;line-height:1.3"
                      :style="'background:' + _fmt.deltaColor(delta(exp, bench))"
                      x-html="cellHtml(exp, bench)"></td>
                </template>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="section">
    <h2>Size Breakdown</h2>
    <div class="legend">
      <span class="legend-item"><span class="legend-swatch" style="background:#3B82F6"></span> Post wasm-opt</span>
      <span class="legend-item"><span class="legend-swatch" style="background:#E5E7EB"></span> Pre wasm-opt</span>
    </div>
    <div class="chart-container">
      ${generateSizeBreakdown(experiments)}
    </div>
  </div>

  <div class="footer">
    Generated by Tau WASM Build Matrix Reporter &bull; ${experiments.length} experiments &bull; ${escapeHtml(now)}
  </div>
</body>
</html>`;
}

function main(): void {
  let experiments: ExperimentData[] = [];
  let baseline: ExperimentData | undefined;

  if (values.experiments) {
    const experimentDirectory = resolve(values.experiments);
    experiments = discoverExperiments(experimentDirectory);
    console.log(`Discovered ${experiments.length} experiments in ${experimentDirectory}`);
  }

  if (values.compare && values.compare.length > 0) {
    for (const directory of values.compare) {
      const experiment = loadExperiment(resolve(directory));
      if (experiment) {
        experiments.push(experiment);
      } else {
        console.warn(`Could not load experiment: ${directory}`);
      }
    }
  }

  if (values.baseline) {
    baseline = loadExperiment(resolve(values.baseline));
    if (baseline) {
      console.log(`Using baseline: ${baseline.name}`);
    } else {
      console.warn(`Baseline not found: ${values.baseline}`);
    }
  }

  if (!baseline) {
    const baselineIndex = experiments.findIndex((experiment) => experiment.name.includes('baseline'));
    if (baselineIndex !== -1) {
      baseline = experiments.splice(baselineIndex, 1)[0];
      console.log(`Auto-detected baseline: ${baseline!.name}`);
    }
  }

  if (experiments.length === 0) {
    console.error('No experiments found. Use --experiments <dir> or --compare <dir1> <dir2>.');
    process.exit(1);
  }

  const outputDirectory = resolve(values.output);
  if (!existsSync(outputDirectory)) {
    mkdirSync(outputDirectory, { recursive: true });
  }

  const timestamp = new Date().toISOString().replaceAll(/[.:]/g, '-');
  const htmlPath = join(outputDirectory, `build-matrix-${timestamp}.html`);
  writeFileSync(htmlPath, generateMatrixReport(experiments, baseline));

  console.log(`\nBuild matrix report written to: ${htmlPath}`);
  console.log(`\nExperiments included:`);
  for (const experiment of experiments) {
    const sizeMb = experiment.wasmSizeBytes > 0 ? formatMb(experiment.wasmSizeBytes) : 'no WASM';
    const benchCount = experiment.benchmark?.results.length ?? 0;
    console.log(`  ${experiment.name}: ${sizeMb}, ${benchCount} benchmarks`);
  }
}

main();
