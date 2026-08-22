import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, ListFilter, Settings2 } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import type { RenderPhase, TelemetryEntry } from '@taucad/runtime';
import { PaneButton } from '#components/ui/pane-button.js';
import { ToggleGroup, ToggleGroupItem } from '#components/ui/toggle-group.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { Popover, PopoverContent, PopoverTrigger } from '#components/ui/popover.js';
import { TraceConditionPicker } from '#components/kernel/trace-condition-picker.js';
import type { FilterCondition } from '#components/kernel/trace-condition-picker.js';
import { cn } from '#utils/ui.utils.js';
import type {
  SpanNode,
  FlatSpanRow,
  DisplaySettings,
  ViewMode,
} from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  phaseLabels,
  categoryDotColors,
  categorySvgColors,
  waterfallRowHeight,
  waterfallBarHeight,
  waterfallLabelOffset,
  waterfallLeftPadding,
} from '#routes/w.$workspace.$project/chat-kernel-types.js';
import {
  formatDuration,
  getSpanId,
  getSpanCategory,
  flattenSpanTree,
  flattenForStandardView,
  generateTicks,
} from '#routes/w.$workspace.$project/chat-kernel-utils.js';

// ---------------------------------------------------------------------------
// Pipeline Timing Bar
// ---------------------------------------------------------------------------

export function PipelineTimingBar({
  phase,
  duration,
  maxDuration,
}: {
  readonly phase: RenderPhase;
  readonly duration: number;
  readonly maxDuration: number;
}): React.JSX.Element {
  const widthPercent = maxDuration > 0 ? Math.max(2, (duration / maxDuration) * 100) : 0;

  return (
    <div className='flex items-center gap-2 text-xs'>
      <span className='w-32 shrink-0 truncate text-muted-foreground'>{phaseLabels[phase]}</span>
      <div className='relative h-4 flex-1 overflow-hidden rounded-sm bg-muted'>
        <div
          className='h-full rounded-sm bg-primary/60 transition-all duration-300'
          style={{ width: `${widthPercent}%` }}
        />
      </div>
      <span className='w-14 shrink-0 text-right font-mono text-muted-foreground'>{formatDuration(duration)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Span Attribute Badges
// ---------------------------------------------------------------------------

function SpanAttributeBadges({ entry }: { readonly entry: TelemetryEntry }): React.JSX.Element | undefined {
  const attributes = entry.detail;
  if (!attributes) {
    return undefined;
  }

  const displayKeys = Object.keys(attributes).filter((k) => !['spanId', 'parentSpanId', 'devtools'].includes(k));

  if (displayKeys.length === 0) {
    return undefined;
  }

  return (
    <span className='inline-flex min-w-0 shrink gap-1 overflow-hidden'>
      {displayKeys.slice(0, 2).map((key) => (
        <span key={key} className='shrink-0 rounded bg-muted/80 px-1 py-px text-[10px] text-muted-foreground'>
          {String(attributes[key]).length > 20 ? `${key}` : `${key}=${String(attributes[key])}`}
        </span>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Standard Tree View
// ---------------------------------------------------------------------------

function StandardSpanRow({
  row,
  collapsedSet,
  onToggle,
  displaySettings,
}: {
  readonly row: FlatSpanRow;
  readonly collapsedSet: Set<string>;
  readonly onToggle: (spanId: string) => void;
  readonly displaySettings: DisplaySettings;
}): React.JSX.Element {
  const { node, isLast, ancestorIsLast } = row;
  const spanId = getSpanId(node.entry);
  const hasChildren = node.children.length > 0;
  const isCollapsed = spanId ? collapsedSet.has(spanId) : false;
  const category = getSpanCategory(node.entry.name);

  return (
    <div>
      <div
        className={cn('group relative flex items-center py-[3px] pr-2 text-xs', hasChildren && 'cursor-pointer')}
        onClick={
          hasChildren && spanId
            ? () => {
                onToggle(spanId);
              }
            : undefined
        }
      >
        {Array.from({ length: node.depth }, (_, i) => (
          <span key={String(i)} className='relative flex h-full w-5 shrink-0 items-center justify-center'>
            {ancestorIsLast[i] ? undefined : <span className='absolute inset-y-0 left-2.5 w-px bg-border' />}
          </span>
        ))}

        {node.depth > 0 && (
          <span className='absolute flex items-center' style={{ left: (node.depth - 1) * 20 + 10 }}>
            <span
              className={cn('inline-block w-px bg-border', isLast ? 'h-1/2 self-start' : 'h-full')}
              style={{
                position: 'absolute',
                top: 0,
                height: isLast ? '50%' : '100%',
              }}
            />
            <span
              className='inline-block h-px bg-border'
              style={{ position: 'absolute', top: '50%', left: 0, width: 10 }}
            />
          </span>
        )}

        <span className='inline-flex w-5 shrink-0 items-center justify-center'>
          {hasChildren ? (
            isCollapsed ? (
              <ChevronRight className='size-3.5' style={{ color: categorySvgColors[category] }} />
            ) : (
              <ChevronDown className='size-3.5' style={{ color: categorySvgColors[category] }} />
            )
          ) : (
            <span className={cn('inline-block size-1.5 rounded-full', categoryDotColors[category])} />
          )}
        </span>

        <span className='min-w-0 flex-1 truncate font-medium text-foreground' title={node.entry.name}>
          {node.entry.name}
        </span>

        {displaySettings.showLatency ? (
          <span className='ml-2 shrink-0 font-mono text-muted-foreground'>{formatDuration(node.entry.duration)}</span>
        ) : undefined}

        {displaySettings.showSelfTime && hasChildren && node.selfTime < node.entry.duration * 0.95 ? (
          <span className='ml-1 shrink-0 font-mono text-muted-foreground/50' title='Self time'>
            ({formatDuration(node.selfTime)})
          </span>
        ) : undefined}
      </div>

      {displaySettings.showAttributes ? (
        <div className='flex items-center pb-0.5 text-xs'>
          {Array.from({ length: node.depth }, (_, i) => (
            <span key={String(i)} className='w-5 shrink-0' />
          ))}
          <span className='w-5 shrink-0' />
          <SpanAttributeBadges entry={node.entry} />
        </div>
      ) : undefined}
    </div>
  );
}

export function StandardTreeView({
  spanTree,
  collapsedSet,
  onToggle,
  displaySettings,
}: {
  readonly spanTree: SpanNode[];
  readonly collapsedSet: Set<string>;
  readonly onToggle: (spanId: string) => void;
  readonly displaySettings: DisplaySettings;
}): React.JSX.Element {
  const flatRows = useMemo(() => flattenForStandardView(spanTree, collapsedSet), [spanTree, collapsedSet]);

  const renderSpanItem = useCallback(
    (index: number) => {
      const row = flatRows[index];
      if (!row) {
        return undefined;
      }

      return (
        <StandardSpanRow row={row} collapsedSet={collapsedSet} displaySettings={displaySettings} onToggle={onToggle} />
      );
    },
    [flatRows, collapsedSet, displaySettings, onToggle],
  );

  return (
    <Virtuoso
      totalCount={flatRows.length}
      itemContent={renderSpanItem}
      style={{ height: Math.min(384, flatRows.length * 22) }}
    />
  );
}

// ---------------------------------------------------------------------------
// Waterfall View
// ---------------------------------------------------------------------------

function WaterfallAxisBar({ renderDuration }: { readonly renderDuration: number }): React.JSX.Element {
  const ticks = useMemo(() => generateTicks(renderDuration, 400), [renderDuration]);

  return (
    <div className='relative border-b border-border' style={{ height: waterfallRowHeight }}>
      {ticks.map((tick) => {
        const xPercent = renderDuration > 0 ? (tick / renderDuration) * 100 : 0;
        return (
          <span
            key={tick}
            className='absolute -translate-x-1/2 text-[10px] text-muted-foreground'
            style={{ left: `${String(xPercent)}%`, top: 4 }}
          >
            {formatDuration(tick)}
          </span>
        );
      })}
    </div>
  );
}

function WaterfallGridLines({ renderDuration }: { readonly renderDuration: number }): React.JSX.Element {
  const ticks = useMemo(() => generateTicks(renderDuration, 400), [renderDuration]);

  return (
    <div className='pointer-events-none absolute inset-0 z-10'>
      {ticks.map((tick) => {
        const xPercent = renderDuration > 0 ? (tick / renderDuration) * 100 : 0;
        return (
          <div
            key={tick}
            className='absolute top-0 bottom-0 border-l border-dashed border-border/30'
            style={{ left: `${String(xPercent)}%` }}
          />
        );
      })}
    </div>
  );
}

function WaterfallHtmlRow({
  node,
  renderStart,
  renderDuration,
  hasChildren,
  isCollapsed,
  spanId,
  onToggle,
  displaySettings,
}: {
  readonly node: SpanNode;
  readonly renderStart: number;
  readonly renderDuration: number;
  readonly hasChildren: boolean;
  readonly isCollapsed: boolean;
  readonly spanId: string | undefined;
  readonly onToggle: (spanId: string) => void;
  readonly displaySettings: DisplaySettings;
}): React.JSX.Element {
  const leftPercent = renderDuration > 0 ? ((node.entry.startTime - renderStart) / renderDuration) * 100 : 0;
  const widthPercent = renderDuration > 0 ? (node.entry.duration / renderDuration) * 100 : 0;
  const clampedLeft = Math.max(0, leftPercent);
  const clampedWidth = Math.max(0.5, Math.min(100 - clampedLeft, widthPercent));
  const category = getSpanCategory(node.entry.name);
  const fillColor = categorySvgColors[category];
  const barTop = (waterfallRowHeight - waterfallBarHeight) / 2;
  const depthPad = node.depth * 12 + waterfallLeftPadding;

  const labelParts = [node.entry.name];
  if (displaySettings.showLatency) {
    labelParts.push(formatDuration(node.entry.duration));
  }

  const label = labelParts.join('  ');

  return (
    <div
      className={cn('group/row relative hover:bg-muted/30', hasChildren && 'cursor-pointer')}
      style={{ height: waterfallRowHeight }}
      onClick={
        hasChildren && spanId
          ? () => {
              onToggle(spanId);
            }
          : undefined
      }
    >
      <div
        className='absolute rounded-sm'
        style={{
          left: `${String(clampedLeft)}%`,
          width: `${String(clampedWidth)}%`,
          top: barTop,
          height: waterfallBarHeight,
          backgroundColor: fillColor,
          opacity: 0.35,
        }}
      />
      <div
        className='absolute rounded-sm'
        style={{
          left: `${String(clampedLeft)}%`,
          width: `${String(clampedWidth)}%`,
          top: barTop,
          height: waterfallBarHeight,
          border: `1px solid ${fillColor}`,
          opacity: 0.6,
        }}
      />
      <span
        className='absolute truncate font-mono text-[11px] text-foreground'
        style={{
          left: depthPad,
          top: waterfallLabelOffset + barTop,
          maxWidth: `${String(clampedLeft - 1)}%`,
        }}
      >
        {label}
      </span>
      {hasChildren && spanId ? (
        <span
          className='absolute right-2 text-[10px] text-muted-foreground'
          style={{ top: waterfallRowHeight / 2 - 5 }}
        >
          {isCollapsed ? '▸' : '▾'}
        </span>
      ) : undefined}
    </div>
  );
}

export function WaterfallView({
  spanTree,
  renderStart,
  renderDuration,
  collapsedSet,
  onToggle,
  displaySettings,
}: {
  readonly spanTree: SpanNode[];
  readonly renderStart: number;
  readonly renderDuration: number;
  readonly collapsedSet: Set<string>;
  readonly onToggle: (spanId: string) => void;
  readonly displaySettings: DisplaySettings;
}): React.JSX.Element {
  const flatNodes = useMemo(() => flattenSpanTree(spanTree, collapsedSet), [spanTree, collapsedSet]);

  const renderWaterfallItem = useCallback(
    (index: number) => {
      const node = flatNodes[index];
      if (!node) {
        return undefined;
      }

      const spanId = getSpanId(node.entry);
      return (
        <WaterfallHtmlRow
          node={node}
          renderStart={renderStart}
          renderDuration={renderDuration}
          hasChildren={node.children.length > 0}
          isCollapsed={spanId ? collapsedSet.has(spanId) : false}
          spanId={spanId}
          displaySettings={displaySettings}
          onToggle={onToggle}
        />
      );
    },
    [flatNodes, renderStart, renderDuration, collapsedSet, displaySettings, onToggle],
  );

  return (
    <div className='flex flex-col'>
      <WaterfallAxisBar renderDuration={renderDuration} />
      <div className='relative'>
        <WaterfallGridLines renderDuration={renderDuration} />
        <Virtuoso
          totalCount={flatNodes.length}
          itemContent={renderWaterfallItem}
          fixedItemHeight={waterfallRowHeight}
          style={{
            height: Math.min(384, flatNodes.length * waterfallRowHeight),
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trace Toolbar
// ---------------------------------------------------------------------------

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
  const hasActiveFilters = filters.some((f) => f.value !== '');

  return (
    <div className='flex items-center justify-between gap-1'>
      <div className='flex items-center gap-1'>
        <Popover>
          <PopoverTrigger asChild>
            <PaneButton tooltip='Filter spans' className='relative'>
              <ListFilter className='size-3.5' />
              {hasActiveFilters ? (
                <span className='absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary' />
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
          onValueChange={(value) => {
            if (value) {
              onViewModeChange(value as ViewMode);
            }
          }}
        >
          <ToggleGroupItem value='standard' className='h-6 px-2 text-[11px]'>
            Standard
          </ToggleGroupItem>
          <ToggleGroupItem value='waterfall' className='h-6 px-2 text-[11px]'>
            Waterfall
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className='flex items-center gap-0.5'>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <PaneButton tooltip='Display settings'>
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
                onDisplaySettingsChange({
                  ...displaySettings,
                  showLatency: Boolean(checked),
                });
              }}
            >
              Show Latency
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={displaySettings.showSelfTime}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onCheckedChange={(checked) => {
                onDisplaySettingsChange({
                  ...displaySettings,
                  showSelfTime: Boolean(checked),
                });
              }}
            >
              Show Self Time
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={displaySettings.showAttributes}
              onSelect={(event) => {
                event.preventDefault();
              }}
              onCheckedChange={(checked) => {
                onDisplaySettingsChange({
                  ...displaySettings,
                  showAttributes: Boolean(checked),
                });
              }}
            >
              Show Attributes
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Visibility</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={displaySettings.visibility}
              onValueChange={(value) => {
                onDisplaySettingsChange({
                  ...displaySettings,
                  visibility: value as 'all' | 'relevant',
                });
              }}
            >
              <DropdownMenuRadioItem
                value='all'
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                All
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value='relevant'
                onSelect={(event) => {
                  event.preventDefault();
                }}
              >
                Most relevant
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <PaneButton tooltip={isAllCollapsed ? 'Expand all' : 'Collapse all'} onClick={onToggleCollapseAll}>
          {isAllCollapsed ? <ChevronsUpDown className='size-3.5' /> : <ChevronsDownUp className='size-3.5' />}
        </PaneButton>
      </div>
    </div>
  );
}
