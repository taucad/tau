import { viewerTouchContext, useViewerControlSize } from '#cad/viewer-control-size.js';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { FlipHorizontal, Ruler } from 'lucide-react';
import { useIsMobile } from '@taucad/ui/hooks/use-mobile';
import { Separator } from '@taucad/ui/components/separator';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { FitViewControl } from '#cad/fit-view-control.jsx';
import { FullscreenViewControl } from '#cad/fullscreen-view-control.jsx';
import { GridSizeIndicator } from '#cad/grid-control.jsx';
import { MeasureControl } from '#cad/measure-control.jsx';
import { MeasurementList, MeasureOptions } from '#cad/measure-tool-row.jsx';
import { SectionViewControl } from '#cad/section-view-control.jsx';
import { SectionEditor, SectionOptions, focusFirstControl, useFocusHandOff } from '#cad/section-tool-row.jsx';
import { ViewerSettings } from '#cad/viewer-settings.jsx';
import type { ViewerOperationTimeout } from '#cad/viewer-settings.jsx';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.jsx';
import { useViewerShortcuts } from '#hooks/use-viewer-shortcuts.js';

type Tool = 'section' | 'measure';

/**
 * Never the first thing on its line: the grid readout before it renders nothing until the grid has a size. Nor after
 * an empty leading group.
 */
const Hairline = ({ className = 'mx-0' }: { readonly className?: string }): React.JSX.Element => (
  <Separator
    orientation='vertical'
    className={cn(
      'first:hidden data-[orientation=vertical]:h-4 [[data-slot=viewer-leading]:empty+&]:hidden',
      className,
    )}
  />
);

/** The bar's padding and border, and the gaps and hairline between the leading group and the controls. */
const leadingSpacingPx = 10 + 9;

/**
 * Whether the leading group must take its own line: true when it and the controls together are wider than the strip
 * the bar sits in. Measured from the groups' children, so a stacked group can unstack when the strip widens.
 */
function useStackedLeading(
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  barRef: React.RefObject<HTMLElement | null>,
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  leadingRef: React.RefObject<HTMLElement | null>,
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  controlsRef: React.RefObject<HTMLElement | null>,
): boolean {
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const strip = barRef.current?.parentElement;
    const leading = leadingRef.current;
    const controls = controlsRef.current;
    if (!strip || !leading || !controls || typeof ResizeObserver === 'undefined') {
      return;
    }
    const contentWidth = (group: HTMLElement): number => {
      const children = [...group.children] as HTMLElement[];
      const gap = Number.parseFloat(getComputedStyle(group).columnGap) || 0;
      return (
        children.reduce((width, child) => width + child.offsetWidth, 0) +
        gap * Math.max(0, children.filter((child) => child.offsetWidth > 0).length - 1)
      );
    };
    const measure = (): void => {
      const leadingWidth = contentWidth(leading);
      setStacked(leadingWidth > 0 && leadingWidth + contentWidth(controls) + leadingSpacingPx > strip.clientWidth);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    observer.observe(leading);
    observer.observe(controls);
    // A stacked group keeps the strip's width, so its content changes are watched directly.
    const mutations = new MutationObserver(measure);
    mutations.observe(leading, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [barRef, leadingRef, controlsRef]);
  return stacked;
}

/** The gap a constrained bar keeps from the top of the viewer frame, matching the stage's inset below it. */
const barTopInsetPx = 8;

/**
 * The tallest a constrained bar may grow: from its bottom edge up to the viewer frame's top inset, less whatever sits
 * above it in the stage's controls slot. The slot is anchored to the frame's bottom and has no height of its own, so
 * `max-h-full` alone cannot bound the bar; the measured height lets the tool rows scroll inside the stage instead of
 * running off its top.
 * @param barRef - The element whose height is bounded, in the stage's controls slot.
 * @returns The bar's maximum height in pixels; undefined outside a viewer frame.
 */
function useViewerBarMaxHeight(
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  barRef: React.RefObject<HTMLElement | null>,
): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number>();
  useLayoutEffect(() => {
    const bar = barRef.current;
    const frame = bar?.closest<HTMLElement>('[data-viewer-frame]');
    const slot = bar?.parentElement;
    if (!bar || !frame || !slot || typeof ResizeObserver === 'undefined') {
      setMaxHeight(undefined);
      return;
    }
    const measure = (): void => {
      const above = bar.getBoundingClientRect().top - slot.getBoundingClientRect().top;
      const space = bar.getBoundingClientRect().bottom - frame.getBoundingClientRect().top - barTopInsetPx - above;
      setMaxHeight(Math.max(0, Math.floor(space)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(slot);
    return () => {
      observer.disconnect();
    };
  }, [barRef]);
  return maxHeight;
}

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
  const isTouch = useViewerControlSize() === 'icon-touch';
  const isMobile = useIsMobile();
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
      {/* Narrow panes wrap whole option groups and Done in reading order, with room for every target. */}
      <div className={cn('flex min-h-7 items-center gap-1 @max-[20rem]/viewer:flex-wrap', isMobile && 'flex-wrap')}>
        <span className='flex shrink-0 items-center gap-1 px-1 text-xs font-medium'>
          {icon}
          {/* Below 520 px the name gives way to its glyph, as the toggles' labels do, so the row fits. */}
          <span className='hidden @min-[520px]/viewer:inline'>{name}</span>
        </span>
        <Hairline className='mx-1' />
        <div className='contents @max-[20rem]/viewer:block @max-[20rem]/viewer:min-w-0 @max-[20rem]/viewer:basis-full'>
          {children}
        </div>
        <Button
          variant='secondary'
          size={isTouch ? 'touch' : 'xs'}
          className={isTouch ? undefined : 'h-7'}
          aria-label={`Done with ${tool}`}
          onClick={onDone}
        >
          Done
        </Button>
      </div>
    </div>
  );
}

/**
 * What a host adds to the {@link ViewerControls} bar.
 *
 * @public
 */
export type ViewerControlsProps = Readonly<{
  /** The capture control, in its own section after Fullscreen; hosts without capture leave it out. */
  capture?: React.ReactNode;
  /** Capability-gated host action, such as AR: after Fit view on phones, after Fullscreen in the desktop layout. */
  mobileAction?: React.ReactNode;
  /** Request touch targets in an embedded mobile surface; defaults to compact controls. */
  enableTouchTargets?: boolean;
  /** The pane's kernel settings, shown in Viewer settings. */
  kernelSettings?: React.ReactNode;
  /** The render timeout Viewer settings offers, when the host runs a kernel. */
  operationTimeout?: ViewerOperationTimeout;
  /** The view and instance menus and the build status segment, at the start of the controls line. */
  leading?: React.ReactNode;
  /** A row directly above the controls line, below any running tool's row: the open issues list. */
  aboveControls?: React.ReactNode;
  /** The host's own actions, in their own section at the end of the controls line. */
  actions?: React.ReactNode;
}>;

/**
 * The viewer's one bar, shared by the Tau app and the agent plugin viewer. A running tool adds its row above the controls row, Section's above Measure's, and the open
 * cut's editor and the section's status unfold above the Section row. The controls row holds the grid readout, the
 * Section and Measure toggles, Fit view and Fullscreen, Capture in its own section, and Viewer settings. Below 520 px of viewer width
 * (`@container/viewer`) the toggles and the grid readout drop to their glyphs. The bar never shrinks below its rows,
 * so a host strip narrower than the bar must start it at its left edge (`items-center-safe`), keeping the grid readout
 * and Section in view. The bar also owns the viewer's keyboard shortcuts, and speaks each one's result in a polite
 * live region.
 *
 * `leading` starts the controls line with the view menus and the build status; when it and the controls do not fit
 * the strip together, it takes its own line above them. `aboveControls` sits directly above the controls line, so the
 * issues list unfolds next to the segment that opened it. `actions` closes the line with the host's own buttons.
 *
 * @param props - What the host adds to the bar.
 * @returns The bar.
 * @public
 */
export function ViewerControls(props: ViewerControlsProps): React.JSX.Element {
  return (
    <viewerTouchContext.Provider value={props.enableTouchTargets}>
      <ViewerControlsBody {...props} />
    </viewerTouchContext.Provider>
  );
}

/**
 * The bar's layout classes. On a phone the bar fits the space it is given, wraps its controls and scrolls its tool
 * rows; a desktop pane's bar never shrinks below its rows, so a narrow strip keeps them whole, but a pane under 20rem
 * wraps its controls line rather than cut off its last controls.
 * @param isMobile - Whether the viewport is a phone's.
 * @param isTouch - Whether the controls take touch targets.
 * @returns The classes of the bar, its tool rows and its controls line.
 */
function barLayout(isMobile: boolean, isTouch: boolean): { bar: string; toolRows: string; controls: string } {
  return {
    bar: cn(
      'pointer-events-auto flex max-w-full flex-col gap-1 rounded-lg border bg-sidebar p-1 shadow-xs',
      // `max-h-full` is the fallback for a phone bar outside a viewer frame, in a parent of bounded height; inside a
      // frame the measured max height replaces it. Every section may shrink, so the issues list scrolls beside the tool
      // rows instead of squeezing them out; the controls line holds its height (`shrink-0`).
      // A desktop pane narrower than its controls line (from 768px with the sidebar and a lane open, D12) wraps the
      // line as a phone does instead of running it past the pane's edge.
      isMobile
        ? 'max-h-full min-h-0 min-w-0 *:min-h-0'
        : 'min-w-min @max-[20rem]/viewer:max-h-(--viewer-controls-max-height) @max-[20rem]/viewer:min-h-0 @max-[20rem]/viewer:min-w-0 @max-[20rem]/viewer:*:min-h-0',
    ),
    toolRows: cn(
      'flex flex-col gap-1 @max-[20rem]/viewer:min-h-0 @max-[20rem]/viewer:overflow-y-auto',
      isMobile && 'min-h-0 overflow-y-auto',
    ),
    controls: cn(
      'flex items-center',
      isMobile && 'max-w-full flex-wrap justify-center',
      !isMobile && '@max-[20rem]/viewer:max-w-full @max-[20rem]/viewer:flex-wrap @max-[20rem]/viewer:justify-center',
      isTouch ? 'gap-0' : 'gap-1',
      !isMobile && !isTouch && 'h-7 @max-[20rem]/viewer:h-auto',
    ),
  };
}

function ViewerControlsBody({
  capture,
  mobileAction,
  kernelSettings,
  operationTimeout,
  leading,
  aboveControls,
  actions,
}: ViewerControlsProps): React.JSX.Element {
  const controlSize = useViewerControlSize();
  const isMobile = useIsMobile();
  const layout = barLayout(isMobile, controlSize === 'icon-touch');
  const graphicsRef = useGraphics();
  const barRef = useRef<HTMLDivElement>(null);
  const leadingRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const isLeadingStacked = useStackedLeading(barRef, leadingRef, controlsRef);
  const barMaxHeight = useViewerBarMaxHeight(barRef);
  const barStyle =
    barMaxHeight === undefined
      ? undefined
      : {
          maxHeight: isMobile ? barMaxHeight : undefined,
          '--viewer-controls-max-height': `${barMaxHeight}px`,
        };
  const is2dGeometry = useGraphicsSelector((state) => state.context.artifact?.mimeType === 'image/svg+xml');
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const isMeasureActive = useGraphicsSelector((state) => state.context.isMeasureActive);
  const isMeasureInputReady = useGraphicsSelector((state) => state.context.isMeasureInputReady);
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
    <div ref={barRef} data-slot='viewer-controls' className={layout.bar} style={barStyle}>
      {!is2dGeometry && (isSectionViewActive || isMeasureActive) ? (
        <div data-slot='viewer-tool-rows' className={layout.toolRows}>
          {isSectionViewActive ? (
            <ToolRow
              tool='section'
              name='Section view'
              icon={<FlipHorizontal className='size-4 text-viewer-tool-active' />}
              above={<SectionEditor />}
              onDone={stopSection}
            >
              <SectionOptions />
            </ToolRow>
          ) : null}
          {isMeasureActive ? (
            <ToolRow
              tool='measure'
              name={isMeasureInputReady ? 'Measuring' : 'Measure'}
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
              {isMeasureInputReady ? (
                <MeasureOptions expanded={measurementsExpanded} onExpandedChange={setMeasurementsExpanded} />
              ) : (
                <span
                  role='status'
                  aria-label='Preparing measurement'
                  aria-busy='true'
                  className='px-1 text-xs text-muted-foreground'
                >
                  Preparing measurement…
                </span>
              )}
            </ToolRow>
          ) : null}
        </div>
      ) : null}
      {aboveControls}
      <div
        role='group'
        aria-label='Viewer controls'
        className='flex shrink-0 flex-wrap items-center justify-center gap-1 self-center text-muted-foreground [&_button]:font-normal [&_button:focus-visible]:text-foreground [&_button:hover]:text-foreground [&_button[aria-expanded=true]]:text-foreground [&_button[aria-pressed=true]]:text-foreground [&_button[data-state=open]]:text-foreground'
      >
        {leading === undefined ? null : (
          <>
            <div
              ref={leadingRef}
              data-slot='viewer-leading'
              className={cn(
                'flex min-w-0 items-center gap-1 empty:hidden',
                controlSize === 'icon-touch' ? 'min-h-11' : 'h-7',
                isLeadingStacked && 'h-8 basis-full justify-center border-b pb-1',
              )}
            >
              {leading}
            </div>
            {isLeadingStacked ? null : <Hairline />}
          </>
        )}
        <div ref={controlsRef} className={layout.controls}>
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
          {/* A capability-gated host action such as AR; tablets in the desktop layout show it after Fullscreen (D12). */}
          {isMobile ? (
            mobileAction
          ) : (
            <>
              <FullscreenViewControl />
              {mobileAction}
            </>
          )}
          {capture === undefined ? null : (
            <>
              <Hairline />
              {capture}
            </>
          )}
          <Hairline />
          <ViewerSettings
            side='top'
            align='end'
            kernelSettings={kernelSettings}
            operationTimeout={operationTimeout}
            className='border-0 bg-transparent shadow-none hover:bg-accent/50 dark:hover:bg-accent/80'
          />
          {actions === undefined ? null : (
            <>
              <Hairline />
              {actions}
            </>
          )}
        </div>
      </div>
      <span role='status' className='sr-only'>
        <span key={announcement.count}>{announcement.phrase}</span>
      </span>
    </div>
  );
}
