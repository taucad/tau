import type { RenderPhase, TelemetryEntry } from '@taucad/runtime';
import type {
  SpanNode,
  PipelineData,
  SpanCategory,
  FlatSpanRow,
} from '#routes/w.$workspace.$project/chat-kernel-types.js';
import { emptyPipelineData } from '#routes/w.$workspace.$project/chat-kernel-types.js';
import type { FilterCondition } from '#components/kernel/trace-condition-picker.js';

export function formatDuration(ms: number): string {
  if (ms < 1) {
    return '<1ms';
  }

  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
}

// ---------------------------------------------------------------------------
// Span tree construction
// ---------------------------------------------------------------------------

export function getSpanId(entry: TelemetryEntry): string | undefined {
  return entry.detail?.['spanId'] as string | undefined;
}

export function getParentSpanId(entry: TelemetryEntry): string | undefined {
  return entry.detail?.['parentSpanId'] as string | undefined;
}

function computeSelfTime(node: SpanNode): number {
  const childrenTotal = node.children.reduce((sum, child) => sum + child.entry.duration, 0);
  return Math.max(0, node.entry.duration - childrenTotal);
}

function assignDepths(node: SpanNode, depth: number): void {
  node.depth = depth;
  for (const child of node.children) {
    assignDepths(child, depth + 1);
  }
}

export function buildSpanTree(entries: TelemetryEntry[]): SpanNode[] {
  const nodes: SpanNode[] = entries.map((entry) => ({
    entry,
    children: [],
    depth: 0,
    selfTime: 0,
  }));

  const byId = new Map<string, SpanNode>();
  for (const node of nodes) {
    const spanId = getSpanId(node.entry);
    if (spanId) {
      byId.set(spanId, node);
    }
  }

  const roots: SpanNode[] = [];
  for (const node of nodes) {
    const parentId = getParentSpanId(node.entry);
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const root of roots) {
    assignDepths(root, 0);
  }

  for (const node of nodes) {
    node.selfTime = computeSelfTime(node);
  }

  return roots;
}

// ---------------------------------------------------------------------------
// Pipeline phase derivation
// ---------------------------------------------------------------------------

function derivePhaseDurations(entries: TelemetryEntry[]): PipelineData {
  if (entries.length === 0) {
    return emptyPipelineData;
  }

  let renderDuration = 0;
  const phaseDurations = new Map<RenderPhase, number>();

  for (const entry of entries) {
    if (entry.name === 'kernel.render') {
      renderDuration = entry.duration;
    }

    const phase = entry.detail?.['phase'] as RenderPhase | undefined;
    if (phase) {
      phaseDurations.set(phase, (phaseDurations.get(phase) ?? 0) + entry.duration);
    }
  }

  if (renderDuration === 0) {
    return emptyPipelineData;
  }

  const classified = [...phaseDurations.values()].reduce((sum, d) => sum + d, 0);
  const postProcessing = Math.max(0, renderDuration - classified);
  if (postProcessing > 0) {
    phaseDurations.set('postProcessing', postProcessing);
  }

  return { phaseDurations, totalDuration: renderDuration };
}

const pipelineMemoCache = new WeakMap<TelemetryEntry[], PipelineData>();

export function selectPipelineData(state: { context: { telemetryEntries: TelemetryEntry[] } }): PipelineData {
  const entries = state.context.telemetryEntries;
  if (entries.length === 0) {
    return emptyPipelineData;
  }

  const cached = pipelineMemoCache.get(entries);
  if (cached) {
    return cached;
  }

  const result = derivePhaseDurations(entries);
  pipelineMemoCache.set(entries, result);
  return result;
}

// ---------------------------------------------------------------------------
// Span categories
// ---------------------------------------------------------------------------

export function getSpanCategory(name: string): SpanCategory {
  if (name.startsWith('kernel.') || name.startsWith('wasm.')) {
    return 'framework';
  }

  if (name.startsWith('middleware.')) {
    return 'middleware';
  }

  if (name.startsWith('fs.')) {
    return 'fs';
  }

  if (name.startsWith('deps.')) {
    return 'deps';
  }

  return 'kernel';
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

function matchesCondition(node: SpanNode, condition: FilterCondition): boolean {
  if (!condition.value) {
    return true;
  }

  const { field, operator, value } = condition;

  switch (field) {
    case 'latency': {
      const ms = node.entry.duration;
      const target = Number.parseFloat(value);
      if (Number.isNaN(target)) {
        return true;
      }

      return applyNumericOp(ms, operator, target);
    }

    case 'selfTime': {
      const target = Number.parseFloat(value);
      if (Number.isNaN(target)) {
        return true;
      }

      return applyNumericOp(node.selfTime, operator, target);
    }

    case 'name': {
      if (operator === 'contains') {
        return node.entry.name.toLowerCase().includes(value.toLowerCase());
      }

      return node.entry.name === value;
    }

    case 'category': {
      return getSpanCategory(node.entry.name) === value;
    }

    default: {
      return true;
    }
  }
}

function applyNumericOp(actual: number, operator: string, target: number): boolean {
  switch (operator) {
    case '>': {
      return actual > target;
    }

    case '>=': {
      return actual >= target;
    }

    case '<': {
      return actual < target;
    }

    case '<=': {
      return actual <= target;
    }

    case '=': {
      return Math.abs(actual - target) < 0.5;
    }

    default: {
      return true;
    }
  }
}

export function filterSpanTree(roots: SpanNode[], conditions: FilterCondition[]): SpanNode[] {
  if (conditions.length === 0) {
    return roots;
  }

  function nodeMatches(node: SpanNode): boolean {
    return conditions.every((c) => matchesCondition(node, c));
  }

  function filterNode(node: SpanNode): SpanNode | undefined {
    const filteredChildren = node.children.map((child) => filterNode(child)).filter(Boolean) as SpanNode[];

    if (nodeMatches(node) || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }

    return undefined;
  }

  return roots.map((root) => filterNode(root)).filter(Boolean) as SpanNode[];
}

export function applyVisibility(roots: SpanNode[], visibility: 'all' | 'relevant'): SpanNode[] {
  if (visibility === 'all') {
    return roots;
  }

  function filterRelevant(node: SpanNode): SpanNode | undefined {
    const filteredChildren = node.children.map((child) => filterRelevant(child)).filter(Boolean) as SpanNode[];

    if (node.entry.duration >= 1 || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }

    return undefined;
  }

  return roots.map((root) => filterRelevant(root)).filter(Boolean) as SpanNode[];
}

// ---------------------------------------------------------------------------
// Flatten tree
// ---------------------------------------------------------------------------

export function flattenSpanTree(roots: SpanNode[], collapsedSet: Set<string>): SpanNode[] {
  const result: SpanNode[] = [];

  function walk(node: SpanNode): void {
    result.push(node);
    const spanId = getSpanId(node.entry);
    const isCollapsed = spanId ? collapsedSet.has(spanId) : false;
    if (!isCollapsed) {
      for (const child of node.children) {
        walk(child);
      }
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return result;
}

export function flattenForStandardView(roots: SpanNode[], collapsedSet: Set<string>): FlatSpanRow[] {
  const result: FlatSpanRow[] = [];

  function walk(node: SpanNode, isLast: boolean, ancestorIsLast: boolean[]): void {
    result.push({ node, isLast, ancestorIsLast });
    const spanId = getSpanId(node.entry);
    const isCollapsed = spanId ? collapsedSet.has(spanId) : false;
    if (!isCollapsed) {
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i]!, i === node.children.length - 1, [...ancestorIsLast, isLast]);
      }
    }
  }

  for (let i = 0; i < roots.length; i++) {
    walk(roots[i]!, i === roots.length - 1, []);
  }

  return result;
}

export function collectAllSpanIds(roots: SpanNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(node: SpanNode): void {
    const spanId = getSpanId(node.entry);
    if (spanId && node.children.length > 0) {
      ids.add(spanId);
    }

    for (const child of node.children) {
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return ids;
}

// ---------------------------------------------------------------------------
// Waterfall ticks
// ---------------------------------------------------------------------------

/**
 * Generate evenly-spaced tick marks for waterfall charts.
 *
 * @param duration - Duration in milliseconds.
 * @param availableWidth - Available width in pixels for the tick row.
 */
export function generateTicks(duration: number, availableWidth: number): number[] {
  if (duration <= 0) {
    return [0];
  }

  const targetTickCount = Math.max(2, Math.min(6, Math.floor(availableWidth / 80)));
  const rawInterval = duration / targetTickCount;

  const magnitudes = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000] as const;
  let tickInterval = 1;
  for (const m of magnitudes) {
    if (m >= rawInterval) {
      tickInterval = m;
      break;
    }
  }

  const ticks: number[] = [];
  for (let t = 0; t <= duration + tickInterval * 0.1; t += tickInterval) {
    ticks.push(t);
  }

  return ticks;
}
