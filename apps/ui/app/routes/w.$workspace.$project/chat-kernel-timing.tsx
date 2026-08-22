import { memo, useCallback, useMemo, useState } from 'react';
import { useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { FilterCondition } from '#components/kernel/trace-condition-picker.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { DisplaySettings, ViewMode } from '#routes/w.$workspace.$project/chat-kernel-types.js';
import { phaseLabels, phaseOrder, defaultDisplaySettings } from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  formatDuration,
  buildSpanTree,
  selectPipelineData,
  filterSpanTree,
  applyVisibility,
  collectAllSpanIds,
} from '#routes/w.$workspace.$project/chat-kernel-utils.js';
import {
  PipelineTimingBar,
  StandardTreeView,
  WaterfallView,
  TraceToolbar,
} from '#routes/w.$workspace.$project/chat-kernel-traces.js';

// ---------------------------------------------------------------------------
// GeometryUnitTiming (orchestrator)
// ---------------------------------------------------------------------------

export const GeometryUnitTiming = memo(function GeometryUnitTiming({
  cadRef,
}: {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
}): React.JSX.Element {
  const renderPhase = useSelector(cadRef, (state) => state.context.renderPhase);
  const pipelineData = useSelector(cadRef, selectPipelineData);
  const telemetryEntries = useSelector(cadRef, (state) => state.context.telemetryEntries);

  const [collapsedSpans, setCollapsedSpans] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>('standard');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(defaultDisplaySettings);

  const { phaseDurations, totalDuration } = pipelineData;
  const maxDuration = Math.max(...phaseDurations.values(), 1);
  const visiblePhases = phaseOrder.filter((p) => phaseDurations.has(p));

  const spanTree = useMemo(() => {
    if (telemetryEntries.length === 0) {
      return [];
    }

    return buildSpanTree(telemetryEntries);
  }, [telemetryEntries]);

  const processedTree = useMemo(() => {
    let tree = spanTree;
    tree = filterSpanTree(tree, filters);
    tree = applyVisibility(tree, displaySettings.visibility);
    return tree;
  }, [spanTree, filters, displaySettings.visibility]);

  const { renderStart, renderDuration } = useMemo(() => {
    if (telemetryEntries.length === 0) {
      return { renderStart: 0, renderDuration: 0 };
    }

    let minStart = Infinity;
    let maxEnd = -Infinity;
    for (const entry of telemetryEntries) {
      if (entry.startTime < minStart) {
        minStart = entry.startTime;
      }

      const end = entry.startTime + entry.duration;
      if (end > maxEnd) {
        maxEnd = end;
      }
    }

    return { renderStart: minStart, renderDuration: maxEnd - minStart };
  }, [telemetryEntries]);

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

  const isAllCollapsed = useMemo(() => {
    const allIds = collectAllSpanIds(processedTree);
    if (allIds.size === 0) {
      return false;
    }

    for (const id of allIds) {
      if (!collapsedSpans.has(id)) {
        return false;
      }
    }

    return true;
  }, [processedTree, collapsedSpans]);

  const toggleCollapseAll = useCallback(() => {
    if (isAllCollapsed) {
      setCollapsedSpans(new Set());
    } else {
      setCollapsedSpans(collectAllSpanIds(processedTree));
    }
  }, [isAllCollapsed, processedTree]);

  return (
    <div className='flex flex-col gap-2 p-2'>
      <div className='flex items-center justify-between'>
        <span className='text-xs font-medium tracking-wider text-muted-foreground uppercase'>Render Pipeline</span>
        {renderPhase ? (
          <span className='rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary'>
            {phaseLabels[renderPhase]}
          </span>
        ) : (
          <span className='text-xs text-muted-foreground'>Idle</span>
        )}
      </div>

      {visiblePhases.length > 0 ? (
        <div className='flex flex-col gap-1.5'>
          {visiblePhases.map((phase) => (
            <PipelineTimingBar
              key={phase}
              phase={phase}
              duration={phaseDurations.get(phase) ?? 0}
              maxDuration={maxDuration}
            />
          ))}
          <div className='mt-1 flex items-center justify-between border-t border-border pt-1.5'>
            <span className='text-xs font-medium text-muted-foreground'>Total</span>
            <span className='font-mono text-xs font-medium text-foreground'>{formatDuration(totalDuration)}</span>
          </div>
        </div>
      ) : (
        <p className='text-xs text-muted-foreground'>No render data yet.</p>
      )}

      {spanTree.length > 0 && (
        <div className='mt-1 flex flex-col gap-1.5'>
          <div className='flex items-center justify-between'>
            <span className='text-xs font-medium tracking-wider text-muted-foreground uppercase'>Telemetry</span>
            <div className='flex items-center gap-2 text-[10px] text-muted-foreground'>
              <span className='flex items-center gap-1'>
                <span className='inline-block size-1.5 rounded-full bg-primary' />
                framework
              </span>
              <span className='flex items-center gap-1'>
                <span className='inline-block size-1.5 rounded-full bg-success' />
                kernel
              </span>
              <span className='flex items-center gap-1'>
                <span className='inline-block size-1.5 rounded-full bg-warning' />
                middleware
              </span>
            </div>
          </div>

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

          {viewMode === 'standard' ? (
            <StandardTreeView
              spanTree={processedTree}
              collapsedSet={collapsedSpans}
              displaySettings={displaySettings}
              onToggle={toggleSpan}
            />
          ) : (
            <WaterfallView
              spanTree={processedTree}
              renderStart={renderStart}
              renderDuration={renderDuration}
              collapsedSet={collapsedSpans}
              displaySettings={displaySettings}
              onToggle={toggleSpan}
            />
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// GeometryUnitSummary (collapsed header badge)
// ---------------------------------------------------------------------------

export const GeometryUnitSummary = memo(function GeometryUnitSummary({
  cadRef,
}: {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
}): React.JSX.Element {
  const renderPhase = useSelector(cadRef, (state) => state.context.renderPhase);
  const { totalDuration } = useSelector(cadRef, selectPipelineData);

  if (renderPhase) {
    return <span className='shrink-0 text-xs text-primary'>{phaseLabels[renderPhase]}...</span>;
  }

  if (totalDuration > 0) {
    return <span className='shrink-0 font-mono text-xs text-muted-foreground'>{formatDuration(totalDuration)}</span>;
  }

  return <span className='shrink-0 text-xs text-muted-foreground'>Idle</span>;
});
