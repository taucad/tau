import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ListFilter, Settings2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { CopyButton } from '#components/copy-button.js';
import { HighlightText } from '#components/highlight-text.js';
import { TraceConditionPicker } from '#components/kernel/trace-condition-picker.js';
import type { FilterCondition } from '#components/kernel/trace-condition-picker.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@taucad/ui/components/collapsible';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { PaneButton } from '#components/ui/pane-button.js';
import { Popover, PopoverContent, PopoverTrigger } from '@taucad/ui/components/popover';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import type {
  DisplaySettings,
  FlatSpanRow,
  SpanNode,
  ViewMode,
} from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  categoryDotColors,
  categoryLabels,
  categorySvgColors,
  timelineBarHeight,
} from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  findSpanPath,
  flattenSpanRows,
  formatDuration,
  generateTicks,
  getParentSpanId,
  getSpanCategory,
  getSpanId,
  getSpanKey,
  getVisibleAttributes,
} from '#routes/w.$workspace.$project/chat-kernel-utils.js';
import { cn } from '@taucad/ui/utils/cn';

type ExplorerProperties = {
  readonly spanTree: SpanNode[];
  readonly sourceTree: SpanNode[];
  readonly collapsedSet: Set<string>;
  readonly displaySettings: DisplaySettings;
  readonly query: string;
  readonly selectedSpanId: string | undefined;
  readonly onToggle: (spanId: string) => void;
  readonly onSelect: (spanId: string) => void;
};

const TraceColumnHeader = (): React.JSX.Element => (
  <div className='sticky top-0 z-20 grid h-7 grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center border-b border-border bg-card/95 px-2 text-xs font-medium text-muted-foreground backdrop-blur-sm'>
    <span>Operation</span>
    <span className='text-right'>Total</span>
    <span className='text-right'>Own</span>
  </div>
);

const TraceListFooter = (): React.JSX.Element => (
  <div aria-hidden data-slot='telemetry-scroll-footer' className='h-2' />
);

function getRowElement(container: HTMLElement | undefined, id: string): HTMLElement | undefined {
  return [...(container?.querySelectorAll<HTMLElement>('[data-telemetry-span-row]') ?? [])].find(
    (candidate) => candidate.dataset['telemetrySpanId'] === id,
  );
}

function useTreeNavigation({
  rows,
  collapsedSet,
  onSelect,
  onToggle,
}: {
  readonly rows: FlatSpanRow[];
  readonly collapsedSet: Set<string>;
  readonly onSelect: (spanId: string) => void;
  readonly onToggle: (spanId: string) => void;
}) {
  const [activeId, setActiveId] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useEffect(() => {
    if (rows.length === 0) {
      queueMicrotask(() => {
        setActiveId(undefined);
      });
      return;
    }

    if (!activeId || !rows.some(({ node }) => getSpanKey(node.entry) === activeId)) {
      queueMicrotask(() => {
        setActiveId(getSpanKey(rows[0]!.node.entry));
      });
    }
  }, [activeId, rows]);

  const focusRow = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) {
        return;
      }
      const id = getSpanKey(row.node.entry);
      setActiveId(id);
      virtuosoRef.current?.scrollToIndex({ index, align: 'center' });
      requestAnimationFrame(() => {
        getRowElement(containerRef.current ?? undefined, id)?.focus();
      });
    },
    [rows],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, index: number) => {
      const row = rows[index];
      if (!row) {
        return;
      }
      const id = getSpanKey(row.node.entry);
      const isCollapsed = collapsedSet.has(id);

      switch (event.key) {
        case 'ArrowDown': {
          focusRow(Math.min(rows.length - 1, index + 1));
          break;
        }
        case 'ArrowUp': {
          focusRow(Math.max(0, index - 1));
          break;
        }
        case 'Home': {
          focusRow(0);
          break;
        }
        case 'End': {
          focusRow(rows.length - 1);
          break;
        }
        case 'ArrowRight': {
          if (row.node.children.length === 0) {
            return;
          }
          if (isCollapsed) {
            onToggle(id);
          } else {
            focusRow(Math.min(rows.length - 1, index + 1));
          }
          break;
        }
        case 'ArrowLeft': {
          if (row.node.children.length > 0 && !isCollapsed) {
            onToggle(id);
          } else if (row.parentId) {
            focusRow(rows.findIndex(({ node }) => getSpanKey(node.entry) === row.parentId));
          }
          break;
        }
        case 'Enter':
        case ' ': {
          onSelect(id);
          break;
        }
        default: {
          return;
        }
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [collapsedSet, focusRow, onSelect, onToggle, rows],
  );

  return { activeId, containerRef, virtuosoRef, focusRow, handleKeyDown, setActiveId };
}

function SpanDetails({
  node,
  sourceTree,
  query,
}: {
  readonly node: SpanNode;
  readonly sourceTree: SpanNode[];
  readonly query: string;
}): React.JSX.Element {
  const id = getSpanKey(node.entry);
  const spanId = getSpanId(node.entry);
  const parentSpanId = getParentSpanId(node.entry);
  const category = getSpanCategory(node.entry.name);
  const attributes = getVisibleAttributes(node.entry);
  const path = findSpanPath(sourceTree, id).map(({ entry }) => entry.name);
  const copyText = useCallback(
    () =>
      JSON.stringify(
        {
          operation: node.entry.name,
          path,
          category: categoryLabels[category],
          totalDurationMs: node.entry.duration,
          ownDurationMs: node.selfTime,
          attributes: Object.fromEntries(attributes),
          spanId,
          parentSpanId,
        },
        undefined,
        2,
      ),
    [attributes, category, node.entry.duration, node.entry.name, node.selfTime, parentSpanId, path, spanId],
  );

  return (
    <div className='bg-muted/25 px-2 py-2 text-xs' data-slot='span-details'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0'>
          <p className='font-medium text-foreground'>Span details</p>
          <p className='mt-0.5 truncate text-muted-foreground' title={path.join(' › ')}>
            {path.join(' › ')}
          </p>
        </div>
        <CopyButton getText={copyText} size='icon' className='size-6 shrink-0' aria-label='Copy span details' />
      </div>

      <dl className='mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1'>
        <dt className='text-muted-foreground'>Category</dt>
        <dd>{categoryLabels[category]}</dd>
        <dt className='text-muted-foreground'>Total</dt>
        <dd className='font-mono tabular-nums'>{formatDuration(node.entry.duration)}</dd>
        <dt className='text-muted-foreground'>Own</dt>
        <dd className='font-mono tabular-nums'>{formatDuration(node.selfTime)}</dd>
        {attributes.map(([key, value]) => (
          <div key={key} className='col-span-2 grid grid-cols-subgrid border-t border-border/60 pt-1'>
            <dt className='min-w-0 break-words text-muted-foreground'>
              <HighlightText text={key} searchTerm={query} />
            </dt>
            <dd className='min-w-0 font-mono break-words'>
              <HighlightText text={String(value)} searchTerm={query} />
            </dd>
          </div>
        ))}
      </dl>

      {attributes.length === 0 ? <p className='mt-2 text-muted-foreground'>No recorded attributes.</p> : undefined}

      {(spanId ?? parentSpanId) ? (
        <details className='mt-2 text-muted-foreground'>
          <summary className='cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'>
            Technical IDs
          </summary>
          <dl className='mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono'>
            {spanId ? (
              <>
                <dt>Span</dt>
                <dd className='break-all text-foreground'>{spanId}</dd>
              </>
            ) : undefined}
            {parentSpanId ? (
              <>
                <dt>Parent</dt>
                <dd className='break-all text-foreground'>{parentSpanId}</dd>
              </>
            ) : undefined}
          </dl>
        </details>
      ) : undefined}
    </div>
  );
}

function TreeRow({
  row,
  index,
  options,
}: {
  readonly row: FlatSpanRow;
  readonly index: number;
  readonly options: ExplorerProperties & {
    readonly activeId: string | undefined;
    readonly handleKeyDown: (event: KeyboardEvent<HTMLElement>, index: number) => void;
    readonly setActiveId: (id: string) => void;
  };
}): React.JSX.Element {
  const { node, isLast, ancestorIsLast } = row;
  const id = getSpanKey(node.entry);
  const hasChildren = node.children.length > 0;
  const isCollapsed = options.collapsedSet.has(id);
  const isSelected = options.selectedSpanId === id;
  const category = getSpanCategory(node.entry.name);

  return (
    <Collapsible
      open={isSelected}
      className='group/span mx-1 overflow-hidden rounded-lg transition-colors duration-150 data-[state=open]:border data-[state=open]:border-border data-[state=open]:bg-background motion-reduce:transition-none'
      onOpenChange={() => {
        options.onSelect(id);
      }}
    >
      <CollapsibleTrigger asChild>
        <div
          role='treeitem'
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          aria-selected={isSelected}
          aria-level={node.depth + 1}
          aria-posinset={row.positionInSet}
          aria-setsize={row.setSize}
          aria-label={`${node.entry.name}, total ${formatDuration(node.entry.duration)}, own ${formatDuration(node.selfTime)}`}
          tabIndex={options.activeId === id ? 0 : -1}
          data-telemetry-span-row
          data-telemetry-span-id={id}
          className={cn(
            'group relative grid min-h-7 cursor-default grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center rounded-lg px-1.5 py-0 text-xs outline-none transition-colors data-[state=open]:rounded-b-none',
            'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
            isSelected && 'bg-primary/10',
          )}
          onFocus={() => {
            options.setActiveId(id);
          }}
          onKeyDown={(event) => {
            options.handleKeyDown(event, index);
          }}
        >
          <span className='relative flex min-w-0 items-center self-stretch' style={{ paddingLeft: node.depth * 14 }}>
            {ancestorIsLast.map((ancestorEnded, guideIndex) =>
              ancestorEnded ? undefined : (
                <span
                  // oxlint-disable-next-line react/no-array-index-key -- One immutable hierarchy guide per depth.
                  key={guideIndex}
                  aria-hidden
                  className='absolute inset-y-0 w-px bg-border'
                  style={{ left: guideIndex * 14 + 6 }}
                />
              ),
            )}
            {node.depth > 0 ? (
              <>
                <span
                  aria-hidden
                  className={cn('absolute top-0 w-px bg-border', isLast ? 'h-1/2' : 'h-full')}
                  style={{ left: (node.depth - 1) * 14 + 6 }}
                />
                <span
                  aria-hidden
                  className='absolute top-1/2 h-px w-2 bg-border'
                  style={{ left: (node.depth - 1) * 14 + 6 }}
                />
              </>
            ) : undefined}

            <span className='mr-1.5 flex size-4 shrink-0 items-center justify-center'>
              {hasChildren ? (
                <button
                  type='button'
                  className='flex size-4 items-center justify-center rounded-sm outline-none hover:bg-muted-foreground/10 focus-visible:ring-2 focus-visible:ring-ring'
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} children for ${node.entry.name}`}
                  aria-expanded={!isCollapsed}
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onToggle(id);
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight className='size-3.5' style={{ color: categorySvgColors[category] }} />
                  ) : (
                    <ChevronDown className='size-3.5' style={{ color: categorySvgColors[category] }} />
                  )}
                </button>
              ) : (
                <span className={cn('size-1.5 rounded-full', categoryDotColors[category])} />
              )}
            </span>
            <span className='min-w-0 truncate font-medium text-foreground' title={node.entry.name}>
              <HighlightText text={node.entry.name} searchTerm={options.query} />
            </span>
          </span>
          <span className='text-right font-mono text-muted-foreground tabular-nums'>
            {options.displaySettings.showLatency ? formatDuration(node.entry.duration) : '—'}
          </span>
          <span className='text-right font-mono text-muted-foreground tabular-nums'>
            {options.displaySettings.showSelfTime ? formatDuration(node.selfTime) : '—'}
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className='border-t border-border/70 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none'>
        <SpanDetails node={node} sourceTree={options.sourceTree} query={options.query} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TraceTreeView(properties: ExplorerProperties): React.JSX.Element {
  const flatRows = useMemo(
    () => flattenSpanRows(properties.spanTree, properties.collapsedSet),
    [properties.collapsedSet, properties.spanTree],
  );
  const { containerRef, virtuosoRef, ...navigation } = useTreeNavigation({
    rows: flatRows,
    collapsedSet: properties.collapsedSet,
    onSelect: properties.onSelect,
    onToggle: properties.onToggle,
  });

  const renderSpanItem = useCallback(
    (index: number) => {
      const row = flatRows[index];
      return row ? <TreeRow row={row} index={index} options={{ ...properties, ...navigation }} /> : undefined;
    },
    [flatRows, navigation, properties],
  );

  return (
    <div ref={containerRef} className='min-h-0 flex-1' data-slot='trace-tree'>
      <Virtuoso
        ref={virtuosoRef}
        role='tree'
        aria-label='Telemetry trace operations'
        className='size-full scroll-shadows-y [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
        components={{ Header: TraceColumnHeader, Footer: TraceListFooter }}
        totalCount={flatRows.length}
        itemContent={renderSpanItem}
      />
    </div>
  );
}

function TimelineAxis({ duration }: { readonly duration: number }): React.JSX.Element {
  const ticks = useMemo(() => generateTicks(duration, 320), [duration]);
  return (
    <div className='grid h-7 shrink-0 grid-cols-[minmax(8rem,42%)_1fr] items-center border-b border-border bg-card px-2 text-xs text-muted-foreground'>
      <span className='font-medium'>Operation</span>
      <div className='relative h-full'>
        {ticks.map((tick) => (
          <span
            key={tick}
            className='absolute top-1/2 -translate-x-1/2 -translate-y-1/2 font-mono text-[10px]'
            style={{ left: `${duration > 0 ? (tick / duration) * 100 : 0}%` }}
          >
            {formatDuration(tick)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TimelineRow({
  row,
  index,
  timing,
  options,
}: {
  readonly row: FlatSpanRow;
  readonly index: number;
  readonly timing: { readonly start: number; readonly duration: number };
  readonly options: ExplorerProperties & {
    readonly activeId: string | undefined;
    readonly handleKeyDown: (event: KeyboardEvent<HTMLElement>, index: number) => void;
    readonly setActiveId: (id: string) => void;
  };
}): React.JSX.Element {
  const { node } = row;
  const id = getSpanKey(node.entry);
  const isSelected = options.selectedSpanId === id;
  const isCollapsed = options.collapsedSet.has(id);
  const hasChildren = node.children.length > 0;
  const category = getSpanCategory(node.entry.name);
  const left = timing.duration > 0 ? ((node.entry.startTime - timing.start) / timing.duration) * 100 : 0;
  const width = timing.duration > 0 ? (node.entry.duration / timing.duration) * 100 : 0;
  const clampedLeft = Math.max(0, Math.min(100, left));
  const clampedWidth = Math.max(0.75, Math.min(100 - clampedLeft, width));
  const ticks = generateTicks(timing.duration, 320);

  return (
    <Collapsible
      open={isSelected}
      className='group/span mx-1 overflow-hidden rounded-lg transition-colors duration-150 data-[state=open]:border data-[state=open]:border-border data-[state=open]:bg-background motion-reduce:transition-none'
      onOpenChange={() => {
        options.onSelect(id);
      }}
    >
      <CollapsibleTrigger asChild>
        <div
          role='treeitem'
          aria-expanded={hasChildren ? !isCollapsed : undefined}
          aria-selected={isSelected}
          aria-level={node.depth + 1}
          aria-posinset={row.positionInSet}
          aria-setsize={row.setSize}
          aria-label={`${node.entry.name}, starts ${formatDuration(node.entry.startTime - timing.start)}, lasts ${formatDuration(node.entry.duration)}`}
          tabIndex={options.activeId === id ? 0 : -1}
          data-telemetry-span-row
          data-telemetry-span-id={id}
          className={cn(
            'grid min-h-8 grid-cols-[minmax(8rem,42%)_1fr] items-center rounded-lg px-1.5 py-0 text-xs outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:rounded-b-none',
            isSelected && 'bg-primary/10',
          )}
          onFocus={() => {
            options.setActiveId(id);
          }}
          onKeyDown={(event) => {
            options.handleKeyDown(event, index);
          }}
        >
          <span className='flex min-w-0 items-center' style={{ paddingLeft: node.depth * 12 }}>
            <span className='mr-1.5 flex size-4 shrink-0 items-center justify-center'>
              {hasChildren ? (
                <button
                  type='button'
                  className='flex size-4 items-center justify-center rounded-sm outline-none hover:bg-muted-foreground/10 focus-visible:ring-2 focus-visible:ring-ring'
                  aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} children for ${node.entry.name}`}
                  aria-expanded={!isCollapsed}
                  onClick={(event) => {
                    event.stopPropagation();
                    options.onToggle(id);
                  }}
                >
                  {isCollapsed ? (
                    <ChevronRight className='size-3.5' style={{ color: categorySvgColors[category] }} />
                  ) : (
                    <ChevronDown className='size-3.5' style={{ color: categorySvgColors[category] }} />
                  )}
                </button>
              ) : (
                <span className={cn('size-1.5 rounded-full', categoryDotColors[category])} />
              )}
            </span>
            <span className='min-w-0 truncate font-medium' title={node.entry.name}>
              <HighlightText text={node.entry.name} searchTerm={options.query} />
            </span>
          </span>
          <span className='relative h-full overflow-hidden rounded-md bg-muted/40'>
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden
                className='absolute inset-y-0 border-l border-dashed border-border/50'
                style={{ left: `${timing.duration > 0 ? (tick / timing.duration) * 100 : 0}%` }}
              />
            ))}
            <span
              aria-hidden
              className='absolute top-1/2 -translate-y-1/2 rounded-sm opacity-35'
              style={{
                left: `${clampedLeft}%`,
                width: `${clampedWidth}%`,
                height: timelineBarHeight,
                backgroundColor: categorySvgColors[category],
              }}
            />
            <span className='absolute inset-0 flex items-center justify-end px-1 font-mono text-[10px] tabular-nums'>
              {formatDuration(node.entry.duration)}
            </span>
          </span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className='border-t border-border/70 data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none'>
        <SpanDetails node={node} sourceTree={options.sourceTree} query={options.query} />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TimelineView({
  traceStart,
  traceDuration,
  ...properties
}: ExplorerProperties & {
  readonly traceStart: number;
  readonly traceDuration: number;
}): React.JSX.Element {
  const flatRows = useMemo(
    () => flattenSpanRows(properties.spanTree, properties.collapsedSet),
    [properties.collapsedSet, properties.spanTree],
  );
  const { containerRef, virtuosoRef, ...navigation } = useTreeNavigation({
    rows: flatRows,
    collapsedSet: properties.collapsedSet,
    onSelect: properties.onSelect,
    onToggle: properties.onToggle,
  });
  const renderTimelineItem = useCallback(
    (index: number) => {
      const row = flatRows[index];
      return row ? (
        <TimelineRow
          row={row}
          index={index}
          timing={{ start: traceStart, duration: traceDuration }}
          options={{ ...properties, ...navigation }}
        />
      ) : undefined;
    },
    [flatRows, navigation, properties, traceDuration, traceStart],
  );

  return (
    <div ref={containerRef} className='flex min-h-0 flex-1 flex-col' data-slot='trace-timeline'>
      <TimelineAxis duration={traceDuration} />
      <Virtuoso
        ref={virtuosoRef}
        role='tree'
        aria-label='Telemetry trace timeline'
        className='min-h-0 flex-1 scroll-shadows-y [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'
        components={{ Footer: TraceListFooter }}
        totalCount={flatRows.length}
        itemContent={renderTimelineItem}
      />
    </div>
  );
}

export function TraceToolbar({
  viewMode,
  displaySettings,
  filters,
  isAllCollapsed,
  onViewModeChange,
  onDisplaySettingsChange,
  onFiltersChange,
  onToggleCollapseAll,
}: {
  readonly viewMode: ViewMode;
  readonly displaySettings: DisplaySettings;
  readonly filters: FilterCondition[];
  readonly isAllCollapsed: boolean;
  readonly onViewModeChange: (mode: ViewMode) => void;
  readonly onDisplaySettingsChange: (settings: DisplaySettings) => void;
  readonly onFiltersChange: (filters: FilterCondition[]) => void;
  readonly onToggleCollapseAll: () => void;
}): React.JSX.Element {
  const activeFilterCount = filters.filter(({ value }) => value !== '').length;

  return (
    <div className='flex min-h-7 shrink-0 items-center justify-between gap-1 border-b border-border px-1 py-1'>
      <div className='flex items-center gap-1'>
        <Popover>
          <PopoverTrigger asChild>
            <PaneButton tooltip='Filter spans' className='relative' aria-label='Filter spans'>
              <ListFilter className='size-3.5' />
              {activeFilterCount > 0 ? (
                <span className='absolute -top-0.5 -right-0.5 flex size-3 items-center justify-center rounded-full bg-primary text-[8px] text-primary-foreground'>
                  {activeFilterCount}
                </span>
              ) : undefined}
            </PaneButton>
          </PopoverTrigger>
          <PopoverContent align='start' className='w-auto min-w-80 p-3'>
            <TraceConditionPicker conditions={filters} onChange={onFiltersChange} />
          </PopoverContent>
        </Popover>

        <ToggleGroup
          type='single'
          variant='outline'
          size='sm'
          value={viewMode}
          aria-label='Telemetry view'
          onValueChange={(value) => {
            if (value) {
              onViewModeChange(value as ViewMode);
            }
          }}
        >
          <ToggleGroupItem value='trace' className='h-6 px-2 text-xs'>
            Trace
          </ToggleGroupItem>
          <ToggleGroupItem value='timeline' className='h-6 px-2 text-xs'>
            Timeline
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className='flex items-center gap-0.5'>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <PaneButton tooltip='Display settings' aria-label='Display settings'>
              <Settings2 className='size-3.5' />
            </PaneButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='min-w-44'>
            <DropdownMenuCheckboxItem
              checked={displaySettings.showLatency}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onCheckedChange={(checked) => {
                onDisplaySettingsChange({ ...displaySettings, showLatency: Boolean(checked) });
              }}
            >
              Show Total
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={displaySettings.showSelfTime}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onCheckedChange={(checked) => {
                onDisplaySettingsChange({ ...displaySettings, showSelfTime: Boolean(checked) });
              }}
            >
              Show Own Time
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Visibility</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={displaySettings.visibility}
              onValueChange={(value) => {
                onDisplaySettingsChange({ ...displaySettings, visibility: value as 'all' | 'relevant' });
              }}
            >
              <DropdownMenuRadioItem value='all'>All spans</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value='relevant'>Most relevant</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <PaneButton
          tooltip={isAllCollapsed ? 'Expand all spans' : 'Collapse all spans'}
          aria-label={isAllCollapsed ? 'Expand all spans' : 'Collapse all spans'}
          onClick={onToggleCollapseAll}
        >
          {isAllCollapsed ? <ChevronsUpDown className='size-3.5' /> : <ChevronsDownUp className='size-3.5' />}
        </PaneButton>
      </div>
    </div>
  );
}
