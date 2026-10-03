import { useCallback, useRef, useState } from 'react';
import { FlipHorizontal, Ruler } from 'lucide-react';
import { Button } from '@taucad/ui/components/button';
import { Separator } from '@taucad/ui/components/separator';
import { cn } from '@taucad/ui/utils/cn';
import type { Rendering } from '@taucad/runtime';
import { CaptureViewControl } from '#components/geometry/cad/capture-view-control.js';
import { FitViewControl } from '#components/geometry/cad/fit-view-control.js';
import { FullscreenViewControl } from '#components/geometry/cad/fullscreen-view-control.js';
import { GridSizeIndicator } from '#components/geometry/cad/grid-control.js';
import { MeasureControl } from '#components/geometry/cad/measure-control.js';
import { MeasurementList, MeasureOptions } from '#components/geometry/cad/measure-tool-row.js';
import { SectionViewControl } from '#components/geometry/cad/section-view-control.js';
import {
  SectionEditor,
  SectionOptions,
  SectionStatus,
  focusFirstControl,
  useFocusHandOff,
} from '#components/geometry/cad/section-tool-row.js';
import { ViewerSettings } from '#components/geometry/cad/viewer-settings.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';
import { useViewerShortcuts } from '#hooks/use-viewer-shortcuts.js';

type Tool = 'section' | 'measure';

/** Never the first thing on its line: the grid readout before it renders nothing until the grid has a size. */
const Hairline = ({ className = 'mx-0' }: { readonly className?: string }): React.JSX.Element => (
  <Separator orientation='vertical' className={cn('first:hidden data-[orientation=vertical]:h-4', className)} />
);

/** When a row unmounts holding focus, the keyboard returns to the toggle that started its tool. */
const resolveToolToggle = (row: HTMLElement): HTMLElement | undefined =>
  row.closest('[data-slot="viewer-controls"]')?.querySelector<HTMLElement>(`[data-tool="${row.dataset['toolBar']}"]`) ??
  undefined;

type ToolRowProps = Readonly<{
  tool: Tool;
  /** The tool's name while it runs; the row is named `{name} options`. */
  name: string;
  icon: React.ReactNode;
  /** Unfolds above the row's main line. */
  above?: React.ReactNode;
  children: React.ReactNode;
  onDone: () => void;
}>;

/** A running tool's row inside the bar: its name, its options, then Done. */
function ToolRow({ tool, name, icon, above, children, onDone }: ToolRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null);
  useFocusHandOff(rowRef, resolveToolToggle);
  return (
    <div
      ref={rowRef}
      role='group'
      aria-label={`${name} options`}
      data-tool-bar={tool}
      className='flex max-w-full flex-col gap-1 border-b pb-1'
    >
      {above}
      <div className='flex min-h-7 items-center gap-1'>
        <span className='flex shrink-0 items-center gap-1 px-1 text-xs font-medium'>
          {icon}
          {/* Below 520 px the name gives way to its glyph, as the toggles' labels do, so the row fits. */}
          <span className='hidden @min-[520px]/viewer:inline'>{name}</span>
        </span>
        <Hairline className='mx-1' />
        {children}
        <Button variant='secondary' size='xs' className='h-7' aria-label={`Done with ${tool}`} onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

type ChatViewerControlsProps = Readonly<{
  /** Capture writes to the active chat draft and is unavailable in read-only shared sessions. */
  shouldEnableCapture?: boolean;
  captureRendering?: () => Promise<Rendering>;
}>;

/**
 * The viewer's one bar. A running tool adds its row above the controls row, Section's above Measure's, and the open
 * cut's editor and the section's status unfold above the Section row. The controls row holds the grid readout, the
 * Section and Measure toggles, Fit view and Fullscreen, Capture in its own section, and Viewer settings. Below 520 px of viewer width
 * (`@container/viewer`) the toggles and the grid readout drop to their glyphs. The bar never shrinks below its rows,
 * so a host strip narrower than the bar must start it at its left edge (`items-center-safe`), keeping the grid readout
 * and Section in view. The bar also owns the viewer's keyboard shortcuts, and speaks each one's result in a polite
 * live region.
 */
export function ChatViewerControls({
  shouldEnableCapture = true,
  captureRendering,
}: ChatViewerControlsProps): React.JSX.Element {
  const graphicsRef = useGraphics();
  const barRef = useRef<HTMLDivElement>(null);
  const is2dGeometry = useGraphicsSelector((state) => state.context.artifact?.mimeType === 'image/svg+xml');
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const isMeasureActive = useGraphicsSelector((state) => state.context.isMeasureActive);
  const measurementCount = useGraphicsSelector((state) => state.context.measurements.length);
  const [measurementsExpanded, setMeasurementsExpanded] = useState(false);
  // Counted, so a phrase said twice in a row is a new node and is announced again.
  const [announcement, setAnnouncement] = useState({ phrase: '', count: 0 });
  const announce = useCallback((phrase: string) => {
    setAnnouncement(({ count }) => ({ phrase, count: count + 1 }));
  }, []);
  const keys = useViewerShortcuts(barRef, announce);

  const stopSection = useCallback(() => {
    graphicsRef.send({ type: 'setSectionViewActive', payload: false });
  }, [graphicsRef]);
  const stopMeasure = useCallback(() => {
    setMeasurementsExpanded(false);
    graphicsRef.send({ type: 'setMeasureActive', payload: false });
  }, [graphicsRef]);
  const focusSectionRow = useCallback(() => {
    focusFirstControl(barRef.current?.querySelector('[data-tool-bar="section"]') ?? undefined);
  }, []);
  const focusMeasureRow = useCallback(() => {
    focusFirstControl(barRef.current?.querySelector('[data-tool-bar="measure"]') ?? undefined);
  }, []);

  return (
    <div
      ref={barRef}
      data-slot='viewer-controls'
      className='pointer-events-auto flex max-w-full min-w-min flex-col gap-1 rounded-lg border bg-sidebar p-1 shadow-xs'
    >
      {!is2dGeometry && isSectionViewActive ? (
        <ToolRow
          tool='section'
          name='Section view'
          icon={<FlipHorizontal className='size-4 text-viewer-tool-active' />}
          above={
            <>
              <SectionEditor />
              <SectionStatus />
            </>
          }
          onDone={stopSection}
        >
          <SectionOptions />
        </ToolRow>
      ) : null}
      {!is2dGeometry && isMeasureActive ? (
        <ToolRow
          tool='measure'
          name='Measuring'
          icon={<Ruler className='size-4 -rotate-45 text-viewer-tool-active' />}
          above={
            measurementsExpanded && measurementCount > 0 ? (
              <MeasurementList
                onEmptied={() => {
                  setMeasurementsExpanded(false);
                }}
              />
            ) : null
          }
          onDone={stopMeasure}
        >
          <MeasureOptions expanded={measurementsExpanded} onExpandedChange={setMeasurementsExpanded} />
        </ToolRow>
      ) : null}
      <div
        role='group'
        aria-label='Viewer controls'
        className='flex h-7 items-center gap-1 self-center text-muted-foreground [&_button]:font-normal [&_button:focus-visible]:text-foreground [&_button:hover]:text-foreground [&_button[aria-pressed=true]]:text-foreground [&_button[data-state=open]]:text-foreground'
      >
        <GridSizeIndicator />
        <Hairline />
        {is2dGeometry ? null : (
          <>
            <SectionViewControl shortcut={keys.section} onStart={focusSectionRow} />
            <MeasureControl shortcut={keys.measure} onStart={focusMeasureRow} />
            <Hairline />
          </>
        )}
        <FitViewControl shortcut={keys.fitView} />
        <FullscreenViewControl />
        {shouldEnableCapture ? (
          <>
            <Hairline />
            <CaptureViewControl captureRendering={captureRendering} />
          </>
        ) : null}
        <Hairline />
        <ViewerSettings
          side='top'
          align='end'
          className='size-7 border-0 bg-transparent shadow-none hover:bg-accent/50 dark:hover:bg-accent/80'
        />
      </div>
      <span role='status' className='sr-only'>
        <span key={announcement.count}>{announcement.phrase}</span>
      </span>
    </div>
  );
}
