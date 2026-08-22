import type { RenderPhase, TelemetryEntry } from '@taucad/runtime';
import { logLevels } from '@taucad/types/constants';

export type SpanNode = {
  entry: TelemetryEntry;
  children: SpanNode[];
  depth: number;
  selfTime: number;
};

export type PipelineData = {
  phaseDurations: Map<RenderPhase, number>;
  totalDuration: number;
};

export type SpanCategory = 'framework' | 'middleware' | 'kernel' | 'fs' | 'deps';

export type DisplaySettings = {
  showLatency: boolean;
  showSelfTime: boolean;
  showAttributes: boolean;
  visibility: 'all' | 'relevant';
};

export type ViewMode = 'standard' | 'waterfall';

export type FlatSpanRow = {
  node: SpanNode;
  isLast: boolean;
  ancestorIsLast: boolean[];
};

export const phaseLabels: Record<RenderPhase, string> = {
  resolvingDeps: 'Resolving Dependencies',
  bundling: 'Bundling',
  extractingParams: 'Extracting Parameters',
  computingGeometry: 'Computing Geometry',
  postProcessing: 'Post-Processing',
};

export const phaseOrder: RenderPhase[] = [
  'resolvingDeps',
  'bundling',
  'extractingParams',
  'computingGeometry',
  'postProcessing',
];

export const logLevelColors: Record<string, string> = {
  [logLevels.error]: 'text-destructive',
  [logLevels.warn]: 'text-warning',
  [logLevels.info]: 'text-primary',
  [logLevels.debug]: 'text-muted-foreground',
  [logLevels.trace]: 'text-muted-foreground/60',
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
  showAttributes: false,
  visibility: 'all',
};

export const emptyPipelineData: PipelineData = {
  phaseDurations: new Map(),
  totalDuration: 0,
};

export const waterfallRowHeight = 28;
export const waterfallBarHeight = 14;
export const waterfallLabelOffset = -3;
export const waterfallLeftPadding = 8;
