import { Check, ChevronDown } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { FilterCondition } from '#components/kernel/trace-condition-picker.js';
import { ComboBoxResponsive } from '#components/ui/combobox-responsive.js';
import { CollectionEmptyState } from '#components/ui/collection-empty-state.js';
import { Button } from '@taucad/ui/components/button';
import type { cadMachine } from '#machines/cad.machine.js';
import type {
  DisplaySettings,
  PipelineLane,
  TelemetryTrace,
  ViewMode,
} from '#routes/w.$workspace.$project/chat-kernel-types.js';
import { defaultDisplaySettings } from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  applyVisibility,
  buildPipelineLanes,
  buildTelemetryTraces,
  collectAllSpanIds,
  filterSpanTree,
  filterSpanTreeByQuery,
  flattenSpanTree,
  formatDuration,
  formatTimestamp,
  getLatestTrace,
  getPhaseLabel,
  getSlowestLeaf,
  getSpanKey,
  getTraceKindLabel,
  getVisibleAttributes,
} from '#routes/w.$workspace.$project/chat-kernel-utils.js';
import { TimelineView, TraceToolbar, TraceTreeView } from '#routes/w.$workspace.$project/chat-kernel-traces.js';

type TraceSelectionItem = {
  id: string;
  label: string;
  description: string;
};

function getLatestLifecycleTrace(traces: TelemetryTrace[]): TelemetryTrace | undefined {
  return getLatestTrace(traces.filter(({ kind }) => kind !== 'unattributed')) ?? getLatestTrace(traces);
}

function getTraceDescription(trace: TelemetryTrace): string {
  const attributes = new Map(getVisibleAttributes(trace.root.entry));
  const context = [
    attributes.get('fileName') ?? attributes.get('entryPath'),
    attributes.has('from') && attributes.has('to')
      ? `${String(attributes.get('from'))} → ${String(attributes.get('to'))}`
      : undefined,
    attributes.get('format'),
    attributes.get('kernelId') ?? attributes.get('kernel'),
  ].filter(Boolean);

  return [formatDuration(trace.duration), `${String(trace.spanCount)} spans`, ...context.map(String)].join(' · ');
}

function TraceHistorySelector({
  traces,
  selectedId,
  onSelect,
}: {
  readonly traces: TelemetryTrace[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}): React.JSX.Element {
  const items = useMemo<TraceSelectionItem[]>(
    () => [
      { id: 'latest', label: 'Latest', description: 'Follow the newest completed trace' },
      ...[...traces]
        .sort((left, right) => right.absoluteStart - left.absoluteStart)
        .map((trace) => ({
          id: trace.id,
          label: `${getTraceKindLabel(trace.kind)} · ${formatTimestamp(trace.absoluteStart)}`,
          description: getTraceDescription(trace),
        })),
    ],
    [traces],
  );
  const selectedItem = items.find(({ id }) => id === selectedId) ?? items[0]!;

  return (
    <ComboBoxResponsive
      title='Telemetry trace'
      description='Choose a completed telemetry trace'
      groupedItems={[{ name: 'Trace history', items }]}
      getValue={(item) => item.id}
      value={selectedItem}
      searchPlaceHolder='Filter traces...'
      isSearchEnabled={items.length > 8}
      renderLabel={(item, selected) => (
        <span className='flex w-full items-center justify-between gap-3'>
          <span className='min-w-0'>
            <span className='block truncate text-xs font-medium'>{item.label}</span>
            <span className='block truncate text-xs text-muted-foreground'>{item.description}</span>
          </span>
          {selected?.id === item.id ? <Check className='size-3.5 shrink-0' /> : undefined}
        </span>
      )}
      onSelect={onSelect}
    >
      <Button
        variant='ghost'
        size='sm'
        className='h-7 max-w-52 min-w-0 justify-between gap-2 rounded-lg px-2 text-xs hover:bg-muted'
        aria-label={`Selected trace: ${selectedItem.label}`}
      >
        <span className='truncate'>{selectedItem.label}</span>
        <ChevronDown className='size-3.5 shrink-0 text-muted-foreground' />
      </Button>
    </ComboBoxResponsive>
  );
}

function TraceMetric({
  label,
  value,
  title,
}: {
  readonly label: string;
  readonly value: string;
  readonly title?: string;
}): React.JSX.Element {
  return (
    <div className='min-w-0 px-2 py-1.5'>
      <dt className='text-xs text-muted-foreground'>{label}</dt>
      <dd className='truncate font-mono text-xs font-medium text-foreground tabular-nums' title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}

function PipelineLanes({
  lanes,
  duration,
}: {
  readonly lanes: PipelineLane[];
  readonly duration: number;
}): React.JSX.Element {
  return (
    <section aria-label='Render pipeline' className='shrink-0 rounded-lg border border-border bg-muted/15 p-2'>
      <div className='mb-1 flex items-center justify-between text-xs'>
        <h3 className='font-medium text-foreground'>Render pipeline</h3>
        <span className='font-mono text-muted-foreground'>0 → {formatDuration(duration)}</span>
      </div>
      <div className='flex flex-col gap-1.5'>
        {lanes.map((lane) => (
          <div key={lane.phase} className='grid grid-cols-[minmax(5rem,8rem)_1fr_3.5rem] items-center gap-2 text-xs'>
            <span className='truncate text-muted-foreground' title={lane.label}>
              {lane.label}
            </span>
            <span className='relative h-3 overflow-hidden rounded-sm bg-muted'>
              {lane.intervals.map((phaseInterval) => (
                <span
                  key={`${phaseInterval.start}:${phaseInterval.duration}`}
                  className='absolute inset-y-0 rounded-sm bg-primary/60'
                  style={{
                    left: `${duration > 0 ? (phaseInterval.start / duration) * 100 : 0}%`,
                    width: `${duration > 0 ? Math.max(0.75, (phaseInterval.duration / duration) * 100) : 0}%`,
                  }}
                />
              ))}
            </span>
            <span className='text-right font-mono text-muted-foreground tabular-nums'>
              {formatDuration(lane.coveredDuration)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export const GeometryUnitTiming = memo(function GeometryUnitTiming({
  cadRef,
  query,
}: {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly query: string;
}): React.JSX.Element {
  const renderPhase = useSelector(cadRef, (state) => state.context.renderPhase);
  const telemetryEntries = useSelector(cadRef, (state) => state.context.telemetryEntries);
  const traces = useMemo(() => buildTelemetryTraces(telemetryEntries), [telemetryEntries]);
  const latestTrace = useMemo(() => getLatestLifecycleTrace(traces), [traces]);

  const [selectedTraceId, setSelectedTraceId] = useState('latest');
  const [selectedSpanId, setSelectedSpanId] = useState<string>();
  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('trace');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(defaultDisplaySettings);

  useEffect(() => {
    setSelectedTraceId('latest');
    setSelectedSpanId(undefined);
    setCollapsedSpans(new Set());
  }, [cadRef]);

  const selectedTrace =
    selectedTraceId === 'latest' ? latestTrace : (traces.find(({ id }) => id === selectedTraceId) ?? latestTrace);
  const sourceTree = useMemo(() => (selectedTrace ? [selectedTrace.root] : []), [selectedTrace]);
  const hasActiveStructuredFilters = filters.some(({ value }) => value !== '');
  const isFiltering = query.trim() !== '' || hasActiveStructuredFilters;

  const processedTree = useMemo(() => {
    let tree = filterSpanTreeByQuery(sourceTree, query);
    tree = filterSpanTree(tree, filters);
    return applyVisibility(tree, displaySettings.visibility);
  }, [displaySettings.visibility, filters, query, sourceTree]);
  const effectiveCollapsedSpans = useMemo(
    () => (isFiltering ? new Set<string>() : collapsedSpans),
    [collapsedSpans, isFiltering],
  );
  const pipelineLanes = useMemo(() => (selectedTrace ? buildPipelineLanes(selectedTrace) : []), [selectedTrace]);
  const slowestLeaf = useMemo(() => (selectedTrace ? getSlowestLeaf(selectedTrace.root) : undefined), [selectedTrace]);

  useEffect(() => {
    if (
      selectedSpanId &&
      !flattenSpanTree(processedTree, new Set()).some(({ entry }) => getSpanKey(entry) === selectedSpanId)
    ) {
      setSelectedSpanId(undefined);
    }
  }, [processedTree, selectedSpanId]);

  const toggleSpan = useCallback((spanId: string) => {
    setCollapsedSpans((previous) => {
      const next = new Set(previous);
      if (next.has(spanId)) {
        next.delete(spanId);
      } else {
        next.add(spanId);
      }
      return next;
    });
  }, []);
  const toggleSelectedSpan = useCallback((spanId: string) => {
    setSelectedSpanId((selected) => (selected === spanId ? undefined : spanId));
  }, []);

  const allCollapsibleIds = useMemo(() => collectAllSpanIds(processedTree), [processedTree]);
  const isAllCollapsed =
    allCollapsibleIds.size > 0 && [...allCollapsibleIds].every((spanId) => collapsedSpans.has(spanId));
  const toggleCollapseAll = useCallback(() => {
    setCollapsedSpans(isAllCollapsed ? new Set() : allCollapsibleIds);
  }, [allCollapsibleIds, isAllCollapsed]);

  return (
    <div className='flex size-full min-h-0 flex-col overflow-hidden p-2' data-slot='telemetry-unit-content'>
      <div className='flex shrink-0 items-center justify-between gap-2'>
        <TraceHistorySelector traces={traces} selectedId={selectedTraceId} onSelect={setSelectedTraceId} />
        <span
          role='status'
          aria-live='polite'
          aria-busy={Boolean(renderPhase)}
          className={renderPhase ? 'truncate text-xs font-medium text-primary' : 'text-xs text-muted-foreground'}
        >
          {renderPhase ? `${getPhaseLabel(renderPhase)}…` : 'Idle'}
        </span>
      </div>

      {selectedTrace ? (
        <>
          <dl className='mt-2 grid shrink-0 grid-cols-3 divide-x divide-border overflow-hidden rounded-lg border border-border bg-muted/15'>
            <TraceMetric label='Total' value={formatDuration(selectedTrace.duration)} />
            <TraceMetric label='Spans' value={String(selectedTrace.spanCount)} />
            <TraceMetric
              label='Slowest'
              value={slowestLeaf ? formatDuration(slowestLeaf.entry.duration) : '—'}
              title={
                slowestLeaf ? `${slowestLeaf.entry.name} · ${formatDuration(slowestLeaf.entry.duration)}` : undefined
              }
            />
          </dl>

          {selectedTrace.kind === 'unattributed' ? (
            <p
              role='alert'
              className='mt-2 shrink-0 rounded-lg border border-warning/40 bg-warning/10 px-2 py-1.5 text-xs'
            >
              This telemetry has no recognized lifecycle root. It remains available for instrumentation diagnosis.
            </p>
          ) : undefined}

          {pipelineLanes.length > 0 ? (
            <div className='mt-2 shrink-0'>
              <PipelineLanes lanes={pipelineLanes} duration={selectedTrace.duration} />
            </div>
          ) : undefined}

          <div className='mt-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card'>
            <TraceToolbar
              viewMode={viewMode}
              displaySettings={displaySettings}
              filters={filters}
              isAllCollapsed={isAllCollapsed}
              onViewModeChange={setViewMode}
              onDisplaySettingsChange={setDisplaySettings}
              onFiltersChange={setFilters}
              onToggleCollapseAll={toggleCollapseAll}
            />

            {processedTree.length === 0 ? (
              <CollectionEmptyState className='min-h-20 flex-1'>No matching telemetry</CollectionEmptyState>
            ) : viewMode === 'trace' ? (
              <TraceTreeView
                spanTree={processedTree}
                sourceTree={sourceTree}
                collapsedSet={effectiveCollapsedSpans}
                displaySettings={displaySettings}
                query={query}
                selectedSpanId={selectedSpanId}
                onToggle={toggleSpan}
                onSelect={toggleSelectedSpan}
              />
            ) : (
              <TimelineView
                spanTree={processedTree}
                sourceTree={sourceTree}
                traceStart={selectedTrace.root.entry.startTime}
                traceDuration={selectedTrace.duration}
                collapsedSet={effectiveCollapsedSpans}
                displaySettings={displaySettings}
                query={query}
                selectedSpanId={selectedSpanId}
                onToggle={toggleSpan}
                onSelect={toggleSelectedSpan}
              />
            )}
          </div>
        </>
      ) : (
        <CollectionEmptyState className='min-h-24 flex-1'>
          {renderPhase ? 'Recording telemetry for the current render…' : 'No telemetry recorded yet'}
        </CollectionEmptyState>
      )}
    </div>
  );
});

export const GeometryUnitSummary = memo(function GeometryUnitSummary({
  cadRef,
}: {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
}): React.JSX.Element {
  const renderPhase = useSelector(cadRef, (state) => state.context.renderPhase);
  const telemetryEntries = useSelector(cadRef, (state) => state.context.telemetryEntries);
  const latestTrace = useMemo(
    () => getLatestLifecycleTrace(buildTelemetryTraces(telemetryEntries)),
    [telemetryEntries],
  );

  if (renderPhase) {
    return <span className='shrink-0 text-xs text-primary'>{getPhaseLabel(renderPhase)}…</span>;
  }
  if (latestTrace) {
    return (
      <span className='shrink-0 font-mono text-xs text-muted-foreground'>{formatDuration(latestTrace.duration)}</span>
    );
  }
  return <span className='shrink-0 text-xs text-muted-foreground'>Idle</span>;
});
