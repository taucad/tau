import type { TelemetryEntry } from '@taucad/runtime';
import type { FilterCondition } from '#components/kernel/trace-condition-picker.js';
import type {
  FlatSpanRow,
  PhaseInterval,
  PipelineLane,
  SpanCategory,
  SpanNode,
  TelemetryTrace,
  TelemetryTraceKind,
} from '#routes/w.$workspace.$project/chat-kernel-types.js';
import { categoryLabels, phaseLabels, phaseOrder } from '#routes/w.$workspace.$project/chat-kernel-types.js';

const traceKindsByRootName: Record<string, TelemetryTraceKind> = {
  'kernel.bootstrap': 'bootstrap',
  'kernel.render': 'render',
  'kernel.export': 'export',
  'kernel.transcode': 'transcode',
};

const internalAttributeKeys = new Set(['spanId', 'parentSpanId', 'devtools']);

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

export function getSpanId(entry: TelemetryEntry): string | undefined {
  const spanId = entry.detail?.['spanId'];
  return typeof spanId === 'string' ? spanId : undefined;
}

export function getParentSpanId(entry: TelemetryEntry): string | undefined {
  const parentSpanId = entry.detail?.['parentSpanId'];
  return typeof parentSpanId === 'string' ? parentSpanId : undefined;
}

export function getSpanKey(entry: TelemetryEntry): string {
  return getSpanId(entry) ?? `${entry.workerTimeOrigin}:${entry.startTime}:${entry.duration}:${entry.name}`;
}

function compareEntries(left: TelemetryEntry, right: TelemetryEntry): number {
  return left.startTime - right.startTime || getSpanKey(left).localeCompare(getSpanKey(right));
}

function mergeIntervals(phaseIntervals: PhaseInterval[]): PhaseInterval[] {
  const sorted = [...phaseIntervals].sort((left, right) => left.start - right.start || left.duration - right.duration);
  const merged: PhaseInterval[] = [];

  for (const phaseInterval of sorted) {
    if (phaseInterval.duration <= 0) {
      continue;
    }

    const previous = merged.at(-1);
    const intervalEnd = phaseInterval.start + phaseInterval.duration;
    if (!previous || phaseInterval.start > previous.start + previous.duration) {
      merged.push({ ...phaseInterval });
      continue;
    }

    previous.duration = Math.max(previous.start + previous.duration, intervalEnd) - previous.start;
  }

  return merged;
}

function intervalCoverage(phaseIntervals: PhaseInterval[]): number {
  let total = 0;
  for (const phaseInterval of mergeIntervals(phaseIntervals)) {
    total += phaseInterval.duration;
  }
  return total;
}

function computeSelfTime(node: SpanNode): number {
  const parentStart = node.entry.startTime;
  const parentEnd = parentStart + node.entry.duration;
  const childIntervals = node.children.map(({ entry }) => {
    const start = Math.max(parentStart, entry.startTime);
    const end = Math.min(parentEnd, entry.startTime + entry.duration);
    return { start, duration: Math.max(0, end - start) };
  });

  return Math.max(0, node.entry.duration - intervalCoverage(childIntervals));
}

function finalizeTree(node: SpanNode, depth: number): void {
  node.depth = depth;
  node.children.sort((left, right) => compareEntries(left.entry, right.entry));
  for (const child of node.children) {
    finalizeTree(child, depth + 1);
  }
  node.selfTime = computeSelfTime(node);
}

export function buildSpanTree(entries: TelemetryEntry[]): SpanNode[] {
  const nodes = [...entries].sort(compareEntries).map<SpanNode>((entry) => ({
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
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  roots.sort((left, right) => compareEntries(left.entry, right.entry));
  for (const root of roots) {
    finalizeTree(root, 0);
  }

  return roots;
}

function countSpans(node: SpanNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countSpans(child);
  }
  return count;
}

export function buildTelemetryTraces(entries: TelemetryEntry[]): TelemetryTrace[] {
  return buildSpanTree(entries).map((root) => {
    const kind = traceKindsByRootName[root.entry.name] ?? 'unattributed';
    return {
      id: getSpanKey(root.entry),
      kind,
      root,
      spanCount: countSpans(root),
      absoluteStart: root.entry.workerTimeOrigin + root.entry.startTime,
      duration: root.entry.duration,
    };
  });
}

export function getLatestTrace(traces: TelemetryTrace[]): TelemetryTrace | undefined {
  let latest: TelemetryTrace | undefined;
  for (const trace of traces) {
    if (!latest || trace.absoluteStart > latest.absoluteStart) {
      latest = trace;
    }
  }
  return latest;
}

export function getTraceKindLabel(kind: TelemetryTraceKind): string {
  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
}

export function getPhaseLabel(phase: string): string {
  const knownLabel = phaseLabels[phase];
  if (knownLabel) {
    return knownLabel;
  }

  return phase
    .replaceAll(/([\da-z])([A-Z])/g, '$1 $2')
    .replaceAll(/[_-]/g, ' ')
    .replace(/^./u, (first) => first.toUpperCase());
}

function collectPhaseIntervals(node: SpanNode, trace: TelemetryTrace, byPhase: Map<string, PhaseInterval[]>): void {
  const phase = node.entry.detail?.['phase'];
  if (typeof phase === 'string') {
    const traceStart = trace.root.entry.startTime;
    const traceEnd = traceStart + trace.duration;
    const start = Math.max(traceStart, node.entry.startTime);
    const end = Math.min(traceEnd, node.entry.startTime + node.entry.duration);
    if (end > start) {
      const intervals = byPhase.get(phase) ?? [];
      intervals.push({ start: start - traceStart, duration: end - start });
      byPhase.set(phase, intervals);
    }
  }

  for (const child of node.children) {
    collectPhaseIntervals(child, trace, byPhase);
  }
}

export function buildPipelineLanes(trace: TelemetryTrace): PipelineLane[] {
  if (trace.kind !== 'render' || trace.duration <= 0) {
    return [];
  }

  const byPhase = new Map<string, PhaseInterval[]>();
  collectPhaseIntervals(trace.root, trace, byPhase);
  const knownOrder = new Map<string, number>(phaseOrder.map((phase, index) => [phase, index]));

  return [...byPhase.entries()]
    .map(([phase, intervals]) => {
      const merged = mergeIntervals(intervals);
      return {
        phase,
        label: getPhaseLabel(phase),
        intervals: merged,
        coveredDuration: intervalCoverage(merged),
      };
    })
    .sort(
      (left, right) =>
        (knownOrder.get(left.phase) ?? Number.MAX_SAFE_INTEGER) -
          (knownOrder.get(right.phase) ?? Number.MAX_SAFE_INTEGER) || left.label.localeCompare(right.label),
    );
}

export function getSlowestLeaf(root: SpanNode): SpanNode {
  let slowest = root;

  const visit = (node: SpanNode): void => {
    if (node.children.length === 0 && (slowest.children.length > 0 || node.entry.duration > slowest.entry.duration)) {
      slowest = node;
    }
    for (const child of node.children) {
      visit(child);
    }
  };

  visit(root);
  return slowest;
}

export function getVisibleAttributes(entry: TelemetryEntry): Array<[string, string | number | boolean]> {
  return Object.entries(entry.detail ?? {})
    .filter(
      (attribute): attribute is [string, string | number | boolean] =>
        !internalAttributeKeys.has(attribute[0]) &&
        (typeof attribute[1] === 'string' || typeof attribute[1] === 'number' || typeof attribute[1] === 'boolean'),
    )
    .sort(([left], [right]) => left.localeCompare(right));
}

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

function matchesCondition(node: SpanNode, condition: FilterCondition): boolean {
  if (!condition.value) {
    return true;
  }

  const { field, operator, value } = condition;
  if (field === 'latency' || field === 'selfTime') {
    const target = Number.parseFloat(value);
    if (Number.isNaN(target)) {
      return true;
    }
    return applyNumericOp(field === 'latency' ? node.entry.duration : node.selfTime, operator, target);
  }

  if (field === 'name') {
    return operator === 'contains'
      ? node.entry.name.toLowerCase().includes(value.toLowerCase())
      : node.entry.name === value;
  }

  return getSpanCategory(node.entry.name) === value;
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

function filterTree(roots: SpanNode[], matches: (node: SpanNode) => boolean): SpanNode[] {
  const filterNode = (node: SpanNode): SpanNode | undefined => {
    const children = node.children
      .map((child) => filterNode(child))
      .filter((child): child is SpanNode => child !== undefined);
    return matches(node) || children.length > 0 ? { ...node, children } : undefined;
  };

  return roots.map((root) => filterNode(root)).filter((root): root is SpanNode => root !== undefined);
}

export function filterSpanTree(roots: SpanNode[], conditions: FilterCondition[]): SpanNode[] {
  return conditions.length === 0
    ? roots
    : filterTree(roots, (node) => conditions.every((c) => matchesCondition(node, c)));
}

export function filterSpanTreeByQuery(roots: SpanNode[], query: string): SpanNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return roots;
  }

  return filterTree(roots, (node) => {
    const category = getSpanCategory(node.entry.name);
    const attributes = getVisibleAttributes(node.entry).flatMap(([key, value]) => [key, String(value)]);
    return [node.entry.name, category, categoryLabels[category], ...attributes]
      .join('\n')
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

export function applyVisibility(roots: SpanNode[], visibility: 'all' | 'relevant'): SpanNode[] {
  return visibility === 'all' ? roots : filterTree(roots, (node) => node.entry.duration >= 1);
}

export function flattenSpanTree(roots: SpanNode[], collapsedSet: Set<string>): SpanNode[] {
  const result: SpanNode[] = [];
  const walk = (node: SpanNode): void => {
    result.push(node);
    if (!collapsedSet.has(getSpanKey(node.entry))) {
      for (const child of node.children) {
        walk(child);
      }
    }
  };

  for (const root of roots) {
    walk(root);
  }
  return result;
}

export function flattenSpanRows(roots: SpanNode[], collapsedSet: Set<string>): FlatSpanRow[] {
  const result: FlatSpanRow[] = [];

  const walk = (
    node: SpanNode,
    options: { isLast: boolean; ancestorIsLast: boolean[]; position: number; setSize: number; parentId?: string },
  ): void => {
    result.push({
      node,
      isLast: options.isLast,
      ancestorIsLast: options.ancestorIsLast,
      positionInSet: options.position,
      setSize: options.setSize,
      parentId: options.parentId,
    });

    if (collapsedSet.has(getSpanKey(node.entry))) {
      return;
    }

    for (const [index, child] of node.children.entries()) {
      walk(child, {
        isLast: index === node.children.length - 1,
        ancestorIsLast: [...options.ancestorIsLast, options.isLast],
        position: index + 1,
        setSize: node.children.length,
        parentId: getSpanKey(node.entry),
      });
    }
  };

  for (const [index, root] of roots.entries()) {
    walk(root, {
      isLast: index === roots.length - 1,
      ancestorIsLast: [],
      position: index + 1,
      setSize: roots.length,
    });
  }
  return result;
}

export function collectAllSpanIds(roots: SpanNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (node: SpanNode): void => {
    if (node.children.length > 0) {
      ids.add(getSpanKey(node.entry));
    }
    for (const child of node.children) {
      walk(child);
    }
  };

  for (const root of roots) {
    walk(root);
  }
  return ids;
}

export function findSpanPath(roots: SpanNode[], targetId: string): SpanNode[] {
  const visit = (node: SpanNode, path: SpanNode[]): SpanNode[] | undefined => {
    const nextPath = [...path, node];
    if (getSpanKey(node.entry) === targetId) {
      return nextPath;
    }
    for (const child of node.children) {
      const found = visit(child, nextPath);
      if (found) {
        return found;
      }
    }
    return undefined;
  };

  for (const root of roots) {
    const found = visit(root, []);
    if (found) {
      return found;
    }
  }
  return [];
}

export function generateTicks(duration: number, availableWidth: number): number[] {
  if (duration <= 0) {
    return [0];
  }

  const targetTickCount = Math.max(2, Math.min(6, Math.floor(availableWidth / 80)));
  const rawInterval = duration / targetTickCount;
  const magnitudes = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000] as const;
  const tickInterval = magnitudes.find((magnitude) => magnitude >= rawInterval) ?? magnitudes.at(-1)!;
  const ticks: number[] = [];

  for (let tick = 0; tick <= duration + tickInterval * 0.1; tick += tickInterval) {
    ticks.push(tick);
  }
  return ticks;
}
