import type { TelemetryEntry } from '@taucad/runtime';
import { logLevels } from '@taucad/types/constants';

export type SpanNode = {
  entry: TelemetryEntry;
  children: SpanNode[];
  depth: number;
  selfTime: number;
};

export type TelemetryTraceKind = 'bootstrap' | 'render' | 'export' | 'unattributed';

export type TelemetryTrace = {
  id: string;
  kind: TelemetryTraceKind;
  root: SpanNode;
  spanCount: number;
  absoluteStart: number;
  duration: number;
};

export type PhaseInterval = {
  start: number;
  duration: number;
};

export type PipelineLane = {
  phase: string;
  label: string;
  intervals: PhaseInterval[];
  coveredDuration: number;
};

export type SpanCategory = 'framework' | 'middleware' | 'kernel' | 'fs' | 'deps';

export type DisplaySettings = {
  showLatency: boolean;
  showSelfTime: boolean;
  visibility: 'all' | 'relevant';
};

export type ViewMode = 'trace' | 'timeline';

export type FlatSpanRow = {
  node: SpanNode;
  isLast: boolean;
  ancestorIsLast: boolean[];
  positionInSet: number;
  setSize: number;
  parentId?: string;
};

export const phaseLabels: Record<string, string> = {
  resolvingDeps: 'Resolving Dependencies',
  bundling: 'Bundling',
  extractingParams: 'Extracting Parameters',
  computingGeometry: 'Computing Geometry',
  postProcessing: 'Post-Processing',
};

export const phaseOrder = [
  'resolvingDeps',
  'bundling',
  'extractingParams',
  'computingGeometry',
  'postProcessing',
] as const;

export const logLevelColors: Record<string, string> = {
  [logLevels.error]: 'text-destructive',
  [logLevels.warn]: 'text-warning',
  [logLevels.info]: 'text-primary',
  [logLevels.debug]: 'text-muted-foreground',
  [logLevels.trace]: 'text-muted-foreground/60',
};

export const categoryLabels: Record<SpanCategory, string> = {
  framework: 'Framework',
  kernel: 'Kernel',
  middleware: 'Middleware',
  fs: 'File system',
  deps: 'Dependencies',
};

export const categoryDotColors: Record<SpanCategory, string> = {
  framework: 'bg-primary',
  kernel: 'bg-success',
  middleware: 'bg-warning',
  fs: 'bg-muted-foreground/40',
  deps: 'bg-information',
};

export const categorySvgColors: Record<SpanCategory, string> = {
  framework: 'var(--color-primary)',
  kernel: 'var(--color-success)',
  middleware: 'var(--color-warning)',
  fs: 'var(--color-muted-foreground)',
  deps: 'var(--color-information)',
};

export const defaultDisplaySettings: DisplaySettings = {
  showLatency: true,
  showSelfTime: true,
  visibility: 'all',
};

export const timelineBarHeight = 14;
