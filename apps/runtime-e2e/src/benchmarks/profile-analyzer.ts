/**
 * CPU Profile Analyzer
 *
 * Post-processes V8 CPU profiles to compute per-function self/total time,
 * classify functions into time categories (kernel, framework, bundler, etc.),
 * and produce an aggregate analysis suitable for report generation.
 */

import type { CpuProfile, ProfileNode } from '#benchmarks/cpu-profiler.js';
import type { TelemetryEntry } from '@taucad/runtime/types';

// =============================================================================
// Types
// =============================================================================

/** Classification buckets for profiled time. */
export type TimeCategory = 'kernel' | 'framework' | 'bundler' | 'wasm' | 'runtime-node' | 'gc' | 'idle' | 'other';

/** Per-function timing computed from a CPU profile. */
export type FunctionTiming = {
  functionName: string;
  url: string;
  lineNumber: number;
  category: TimeCategory;
  /** Time where this function was the leaf (deepest) frame, in microseconds. */
  selfTimeUs: number;
  /** Time where this function appeared anywhere in the call chain, in microseconds. */
  totalTimeUs: number;
  /** Number of samples where this function was the leaf. */
  selfSamples: number;
};

/** Aggregate time per category. */
export type CategoryBreakdown = Record<TimeCategory, number>;

/** Telemetry span summary for phase-level timing. */
export type SpanSummary = {
  name: string;
  durationMs: number;
  count: number;
};

/** Complete analysis result for a single CPU profile. */
export type ProfileAnalysis = {
  /** Total profiled wall time in microseconds. */
  totalTimeUs: number;
  /** Number of samples collected. */
  totalSamples: number;
  /** Time per category in microseconds. Self-time attribution (leaf frames only). */
  categoryBreakdown: CategoryBreakdown;
  /** Top functions sorted by self time descending. */
  topFunctions: FunctionTiming[];
  /** Telemetry span summaries from RuntimeTracer, sorted by duration descending. */
  spanSummaries: SpanSummary[];
  /** Percentage of time attributable to Tau framework overhead (vs kernel work). */
  frameworkOverheadPct: number;
};

// =============================================================================
// Classification
// =============================================================================

const categoryColors: Record<TimeCategory, string> = {
  kernel: '#8B5CF6',
  framework: '#3B82F6',
  bundler: '#F59E0B',
  wasm: '#EC4899',
  'runtime-node': '#6B7280',
  gc: '#EF4444',
  idle: '#D1D5DB',
  other: '#9CA3AF',
};

/**
 * Returns the display color for a time category.
 *
 * @param category - the time category to look up
 * @returns hex color string for the category
 */
export function getCategoryColor(category: TimeCategory): string {
  return categoryColors[category];
}

/** All category keys in display order. */
export const allCategories: TimeCategory[] = [
  'kernel',
  'framework',
  'bundler',
  'wasm',
  'runtime-node',
  'gc',
  'idle',
  'other',
];

const syntheticNames = new Map<string, TimeCategory>([
  ['(garbage collector)', 'gc'],
  ['(idle)', 'idle'],
  ['(program)', 'other'],
  ['(root)', 'other'],
]);

const kernelPatterns = ['kernels/replicad', 'opencascade.js', 'replicad', 'node_modules/replicad'];
const bundlerPatterns = ['bundler/', 'esbuild', 'node_modules/esbuild'];
const frameworkPatterns = ['framework/', 'transport/', 'client/', 'plugins/'];

function classifyNode(node: ProfileNode): TimeCategory {
  const { url, functionName, scriptId } = node.callFrame;

  if (scriptId === '0' || scriptId === '') {
    return syntheticNames.get(functionName) ?? 'other';
  }

  if (url.startsWith('node:')) {
    return 'runtime-node';
  }

  if (url === '' && functionName !== '') {
    return 'wasm';
  }

  if (kernelPatterns.some((pattern) => url.includes(pattern))) {
    return 'kernel';
  }

  if (bundlerPatterns.some((pattern) => url.includes(pattern))) {
    return 'bundler';
  }

  if (frameworkPatterns.some((pattern) => url.includes(pattern))) {
    return 'framework';
  }

  return 'other';
}

// =============================================================================
// Analysis
// =============================================================================

/**
 * Builds a parent-pointer map for efficient ancestor walks.
 * V8 profiles use `children` arrays; we need `parent` pointers.
 *
 * @param profile - the CPU profile to extract parent pointers from
 * @returns map from child node ID to parent node ID
 */
function buildParentMap(profile: CpuProfile): Map<number, number> {
  const parentMap = new Map<number, number>();
  for (const node of profile.nodes) {
    if (node.children) {
      for (const childId of node.children) {
        parentMap.set(childId, node.id);
      }
    }
  }

  return parentMap;
}

/**
 * Deduplication key for grouping profile nodes that represent the same function.
 * Groups by (functionName, url, lineNumber) to merge nodes from different
 * call-stack positions into a single entry.
 *
 * @param node - profile node to derive a key from
 * @returns null-separated composite key string
 */
function functionKey(node: ProfileNode): string {
  return `${node.callFrame.functionName}\0${node.callFrame.url}\0${node.callFrame.lineNumber}`;
}

type SampleAttribution = {
  selfTimeByNode: Map<number, number>;
  totalTimeByNode: Map<number, number>;
  selfSamplesByNode: Map<number, number>;
};

function attributeSamples(profile: CpuProfile, parentMap: Map<number, number>): SampleAttribution {
  const selfTimeByNode = new Map<number, number>();
  const totalTimeByNode = new Map<number, number>();
  const selfSamplesByNode = new Map<number, number>();

  for (let i = 0; i < profile.samples.length; i++) {
    const delta = profile.timeDeltas[i] ?? 0;
    const leafId = profile.samples[i]!;

    selfTimeByNode.set(leafId, (selfTimeByNode.get(leafId) ?? 0) + delta);
    selfSamplesByNode.set(leafId, (selfSamplesByNode.get(leafId) ?? 0) + 1);

    let currentId: number | undefined = leafId;
    while (currentId !== undefined) {
      totalTimeByNode.set(currentId, (totalTimeByNode.get(currentId) ?? 0) + delta);
      currentId = parentMap.get(currentId);
    }
  }

  return { selfTimeByNode, totalTimeByNode, selfSamplesByNode };
}

function groupFunctions(profile: CpuProfile, attribution: SampleAttribution): FunctionTiming[] {
  const { selfTimeByNode, totalTimeByNode, selfSamplesByNode } = attribution;

  const grouped = new Map<
    string,
    { node: ProfileNode; selfTimeUs: number; totalTimeUs: number; selfSamples: number }
  >();

  for (const node of profile.nodes) {
    const selfTime = selfTimeByNode.get(node.id) ?? 0;
    const totalTime = totalTimeByNode.get(node.id) ?? 0;
    const selfSamples = selfSamplesByNode.get(node.id) ?? 0;

    if (selfTime === 0 && totalTime === 0) {
      continue;
    }

    const key = functionKey(node);
    const existing = grouped.get(key);
    if (existing) {
      existing.selfTimeUs += selfTime;
      existing.totalTimeUs = Math.max(existing.totalTimeUs, totalTime);
      existing.selfSamples += selfSamples;
    } else {
      grouped.set(key, { node, selfTimeUs: selfTime, totalTimeUs: totalTime, selfSamples });
    }
  }

  const result: FunctionTiming[] = [];
  for (const entry of grouped.values()) {
    result.push({
      functionName: entry.node.callFrame.functionName || '(anonymous)',
      url: entry.node.callFrame.url,
      lineNumber: entry.node.callFrame.lineNumber,
      category: classifyNode(entry.node),
      selfTimeUs: entry.selfTimeUs,
      totalTimeUs: entry.totalTimeUs,
      selfSamples: entry.selfSamples,
    });
  }

  result.sort((a, b) => b.selfTimeUs - a.selfTimeUs);
  return result;
}

function computeCategoryBreakdown(profile: CpuProfile, nodeMap: Map<number, ProfileNode>): CategoryBreakdown {
  const breakdown: CategoryBreakdown = {
    kernel: 0,
    framework: 0,
    bundler: 0,
    wasm: 0,
    'runtime-node': 0,
    gc: 0,
    idle: 0,
    other: 0,
  };

  for (let i = 0; i < profile.samples.length; i++) {
    const delta = profile.timeDeltas[i] ?? 0;
    const leafId = profile.samples[i]!;
    const node = nodeMap.get(leafId);
    if (!node) {
      continue;
    }

    breakdown[classifyNode(node)] += delta;
  }

  return breakdown;
}

/**
 * Analyzes a raw CPU profile and produces per-function timings and category breakdowns.
 *
 * @param profile - V8 CPU profile from the inspector
 * @param telemetry - Optional telemetry span entries from RuntimeTracer for phase correlation
 * @returns Complete profile analysis with category breakdown and top functions
 */
export function analyzeProfile(profile: CpuProfile, telemetry?: TelemetryEntry[][]): ProfileAnalysis {
  const nodeMap = new Map<number, ProfileNode>();
  for (const node of profile.nodes) {
    nodeMap.set(node.id, node);
  }

  const parentMap = buildParentMap(profile);
  const attribution = attributeSamples(profile, parentMap);
  const topFunctions = groupFunctions(profile, attribution);
  const categoryBreakdown = computeCategoryBreakdown(profile, nodeMap);
  const totalTimeUs = profile.endTime - profile.startTime;
  const spanSummaries = aggregateSpans(telemetry);

  const overheadUs = categoryBreakdown.framework + categoryBreakdown.bundler;
  const workUs = categoryBreakdown.kernel + categoryBreakdown.wasm;
  const attributableUs = overheadUs + workUs;
  const frameworkOverheadPct = attributableUs > 0 ? (overheadUs / attributableUs) * 100 : 0;

  return {
    totalTimeUs,
    totalSamples: profile.samples.length,
    categoryBreakdown,
    topFunctions,
    spanSummaries,
    frameworkOverheadPct,
  };
}

// =============================================================================
// Telemetry span aggregation
// =============================================================================

function aggregateSpans(telemetry?: TelemetryEntry[][]): SpanSummary[] {
  if (!telemetry || telemetry.length === 0) {
    return [];
  }

  const byName = new Map<string, { totalMs: number; count: number }>();
  for (const batch of telemetry) {
    for (const entry of batch) {
      if (entry.name === 'oc.summary') {
        continue;
      }

      const existing = byName.get(entry.name);
      if (existing) {
        existing.totalMs += entry.duration;
        existing.count++;
      } else {
        byName.set(entry.name, { totalMs: entry.duration, count: 1 });
      }
    }
  }

  const summaries: SpanSummary[] = [];
  for (const [name, stats] of byName) {
    summaries.push({ name, durationMs: stats.totalMs, count: stats.count });
  }

  summaries.sort((a, b) => b.durationMs - a.durationMs);
  return summaries;
}
