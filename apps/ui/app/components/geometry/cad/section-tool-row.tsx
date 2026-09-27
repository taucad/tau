import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { flushSync } from 'react-dom';
import { useSelector } from '@xstate/react';
import { ArrowLeftRight, CircleAlert, FlipHorizontal, PieChart, Plus, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SnapshotFrom } from 'xstate';
import { Button } from '@taucad/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@taucad/ui/components/dropdown-menu';
import { nestedActionVariants } from '@taucad/ui/components/nested-action.variants';
import { ToggleGroup, ToggleGroupItem } from '@taucad/ui/components/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import { cn } from '@taucad/ui/utils/cn';
import { maxGridDigits } from '#components/geometry/cad/grid-unit-options.js';
import {
  applySectionCutPatch,
  describeSectionCut,
  maxSectionCuts,
  maxSectionSweep,
  minSectionSweep,
  resolveSectionPlaneFlip,
  sectionPlaneAxes,
} from '#components/geometry/graphics/section-cuts.js';
import type {
  SectionAxis,
  SectionCut,
  SectionCutPatch,
  SectionPlane,
} from '#components/geometry/graphics/section-cuts.js';
import { SliderInput } from '#components/ui/slider-input.js';
import { axesColors } from '#constants/color.constants.js';
import { useCameraRig, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';
import type { AddSectionCutPayload, graphicsMachine } from '#machines/graphics.machine.js';
import { formatNumberEngineeringNotation } from '#utils/number.utils.js';

type GraphicsState = SnapshotFrom<typeof graphicsMachine>;
type GraphicsContext = GraphicsState['context'];
type CutProps = Readonly<{ cutId: string }>;
type CutPatcher = (cut: SectionCut, context: GraphicsContext) => SectionCutPatch | undefined;

// ---------------------------------------------------------------------------
// Focus
// ---------------------------------------------------------------------------

/**
 * What Tab reaches first. A toggle group is reached at its checked item: its roving tab stop is only settled once the
 * group has mounted, which is after a row that just opened is asked for its first control.
 */
const firstControlSelector =
  'button:not(:disabled):not([tabindex="-1"]),input:not(:disabled),[tabindex="0"],[role="radio"][aria-checked="true"]';

/** Focuses the first control a keyboard user would reach inside `container`. */
export const focusFirstControl = (container: Element | undefined): void => {
  container?.querySelector<HTMLElement>(firstControlSelector)?.focus();
};

/**
 * When the element under `ref` unmounts holding focus, focus moves to what `resolveTarget` finds from it, so the
 * keyboard never drops to the page. `resolveTarget` runs while the element is still attached and must be stable.
 */
export const useFocusHandOff = (
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- required by React
  ref: RefObject<HTMLElement | null>,
  resolveTarget: (element: HTMLElement) => HTMLElement | undefined,
): void => {
  useLayoutEffect(() => {
    const element = ref.current;
    return () => {
      if (element?.contains(document.activeElement)) {
        resolveTarget(element)?.focus();
      }
    };
  }, [ref, resolveTarget]);
};

/** After a chip goes: the next chip, else the Add button that follows the last chip. */
const resolveNextChip = (chip: HTMLElement): HTMLElement | undefined => {
  const next = chip.nextElementSibling;
  return next instanceof HTMLButtonElement ? next : (next?.querySelector('button') ?? undefined);
};

/** After an editor folds away: the chip that opened it. */
const resolveEditorChip = (editor: HTMLElement): HTMLElement | undefined =>
  editor
    .closest('[data-tool-bar]')
    ?.querySelector<HTMLElement>(`[data-section-chip="${editor.dataset['sectionEditor']}"] > button`) ?? undefined;

/** Enter commits and Escape reverts in a field, which then blurs; the open cut's chip takes focus once it has. */
const returnToChipAfterField = (event: React.KeyboardEvent<HTMLDivElement>): void => {
  if (!(event.target instanceof HTMLInputElement) || (event.key !== 'Enter' && event.key !== 'Escape')) {
    return;
  }
  const editor = event.currentTarget;
  queueMicrotask(() => {
    resolveEditorChip(editor)?.focus();
  });
};

// ---------------------------------------------------------------------------
// Cut values
// ---------------------------------------------------------------------------

const sectionPlanes = ['xy', 'xz', 'yz'] as const satisfies readonly SectionPlane[];
const sectionAxes = ['x', 'y', 'z'] as const satisfies readonly SectionAxis[];
const sectionIcons: Record<SectionCut['kind'], LucideIcon> = { plane: FlipHorizontal, revolution: PieChart };
const sectionKindNames: Record<SectionCut['kind'], string> = { plane: 'Plane', revolution: 'Revolution cutaway' };

const sectionAxisOf = (cut: SectionCut): SectionAxis => (cut.kind === 'plane' ? sectionPlaneAxes[cut.plane] : cut.axis);
const findCut = (cuts: readonly SectionCut[], id: string): SectionCut | undefined => cuts.find((cut) => cut.id === id);
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const angleStep = (shift: boolean): number => (shift ? 15 : 1);

const readPlane = (cut: SectionCut): SectionPlane | undefined => (cut.kind === 'plane' ? cut.plane : undefined);
const readOffset = (cut: SectionCut): number | undefined => (cut.kind === 'plane' ? cut.offset : undefined);
const readIsFlipped = (cut: SectionCut): boolean | undefined => (cut.kind === 'plane' ? cut.isFlipped : undefined);
const readAxis = (cut: SectionCut): SectionAxis | undefined => (cut.kind === 'revolution' ? cut.axis : undefined);
const readSweep = (cut: SectionCut): number | undefined => (cut.kind === 'revolution' ? cut.sweep : undefined);
const readStart = (cut: SectionCut): number | undefined => (cut.kind === 'revolution' ? cut.start : undefined);

/** One value of one cut. `read` returns a primitive, so a drag re-renders only the fields whose value moved. */
const useCutValue = <T,>(cutId: string, read: (cut: SectionCut) => T): T | undefined =>
  useGraphicsSelector((state) => {
    const cut = findCut(state.context.sectionCuts, cutId);
    return cut ? read(cut) : undefined;
  });

/**
 * A stable writer for one cut. `toPatch` reads the cut as it is when the event fires, and a patch that changes no
 * value is never sent.
 */
const useCutUpdate = (cutId: string): ((toPatch: CutPatcher) => void) => {
  const graphicsRef = useGraphics();
  return useCallback(
    (toPatch: CutPatcher) => {
      const { context } = graphicsRef.getSnapshot();
      const cut = findCut(context.sectionCuts, cutId);
      const patch = cut ? toPatch(cut, context) : undefined;
      if (cut && patch && applySectionCutPatch(cut, patch, context.geometryCenter) !== cut) {
        graphicsRef.send({ type: 'updateSectionCut', payload: { id: cutId, patch } });
      }
    },
    [cutId, graphicsRef],
  );
};

/** Lengths in the display unit with a true minus: `12.3 mm`, `−12.3 mm`. */
const useFormatLength = (): ((metres: number) => string) => {
  const metersPerUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const symbol = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);
  return useCallback(
    (metres: number) => {
      // Rounded first, so float noise about zero reads `0`, not a signed exponent.
      const value = Math.round((metres / metersPerUnit) * 1000) / 1000;
      return `${value < 0 ? '−' : ''}${formatNumberEngineeringNotation(Math.abs(value), maxGridDigits)} ${symbol}`;
    },
    [metersPerUnit, symbol],
  );
};

/**
 * The offset field's range: the bounds centre ± 2 × radius along the plane's axis, open until the bounds are known.
 */
export function resolveSectionTranslationControl({
  geometryCenterMeters,
  geometryRadiusMeters,
  selectedPlaneId,
}: {
  readonly geometryCenterMeters: readonly [number, number, number];
  readonly geometryRadiusMeters: number;
  readonly selectedPlaneId: 'xy' | 'xz' | 'yz' | undefined;
}): { readonly minMeters: number | undefined; readonly maxMeters: number | undefined } {
  if (!(geometryRadiusMeters > 0) || !selectedPlaneId) {
    return { minMeters: undefined, maxMeters: undefined };
  }

  const axisIndex = selectedPlaneId === 'xy' ? 2 : selectedPlaneId === 'xz' ? 1 : 0;
  const centerMeters = geometryCenterMeters[axisIndex];
  const marginMeters = geometryRadiusMeters * 2;
  return {
    minMeters: centerMeters - marginMeters,
    maxMeters: centerMeters + marginMeters,
  };
}

/**
 * A plane's offset from a value in display units: kept to 1 mm in every unit, as the handles do, and within the
 * offset field's range once the bounds are known.
 */
const toPlaneOffset = (units: number, plane: SectionPlane, context: GraphicsContext): number => {
  const metres = Math.round(units * context.displayUnits.length.metersPerUnit * 1000) / 1000;
  const { minMeters, maxMeters } = resolveSectionTranslationControl({
    geometryCenterMeters: context.geometryCenter,
    geometryRadiusMeters: context.geometryRadius,
    selectedPlaneId: plane,
  });
  return minMeters === undefined || maxMeters === undefined ? metres : clamp(metres, minMeters, maxMeters);
};

// ---------------------------------------------------------------------------
// Chips and Add
// ---------------------------------------------------------------------------

/**
 * One cut as a chip: its axis-coloured glyph, its reading and ×. Pressing it opens its editor; pressing it again
 * folds the editor away. Ghost at rest, tinted while it or its handles are hovered, bordered while open.
 */
const SectionChip = memo(function SectionChip({ cutId }: CutProps): React.ReactNode {
  const graphicsRef = useGraphics();
  const formatLength = useFormatLength();
  const cut = useGraphicsSelector((state) => findCut(state.context.sectionCuts, cutId));
  const isSelected = useGraphicsSelector((state) => state.context.selectedSectionCutId === cutId);
  const isHovered = useGraphicsSelector((state) => state.context.hoveredSectionCutId === cutId);
  const chipRef = useRef<HTMLDivElement>(null);
  useFocusHandOff(chipRef, resolveNextChip);

  const hover = useCallback(
    (id: string | undefined) => {
      graphicsRef.send({ type: 'hoverSectionCut', payload: id });
    },
    [graphicsRef],
  );

  if (!cut) {
    return null;
  }

  const Icon = sectionIcons[cut.kind];
  const label = describeSectionCut(cut, formatLength);
  const kindName = sectionKindNames[cut.kind];

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const isOpening = !isSelected;
    // Synchronous, so the editor exists when a keyboard press moves focus into it.
    flushSync(() => {
      graphicsRef.send({ type: 'selectSectionCut', payload: isOpening ? cutId : undefined });
    });
    // `detail` is 0 for a click made by Enter or Space.
    if (isOpening && event.detail === 0) {
      focusFirstControl(
        event.currentTarget.closest('[data-tool-bar]')?.querySelector('[data-section-editor]') ?? undefined,
      );
    }
  };

  return (
    <div
      ref={chipRef}
      data-section-chip={cutId}
      data-selected={isSelected}
      data-hovered={isHovered}
      className={cn(
        'group/chip flex h-7 shrink-0 items-center rounded-md border border-transparent text-xs transition-colors',
        'data-[hovered=true]:bg-accent/70',
        'data-[selected=true]:border-border data-[selected=true]:bg-background data-[selected=true]:shadow-xs',
      )}
      onPointerEnter={() => {
        hover(cutId);
      }}
      onPointerLeave={() => {
        hover(undefined);
      }}
    >
      <button
        type='button'
        aria-expanded={isSelected}
        aria-label={`${kindName} ${label}`}
        className='flex h-full items-center gap-1 rounded-md pr-1 pl-2 outline-none focus-visible:focus-outline'
        onClick={handleToggle}
        // Keyboard focus previews the cut as hover does; a click's focus does not keep it lit.
        onFocus={(event) => {
          if (event.currentTarget.matches(':focus-visible')) {
            hover(cutId);
          }
        }}
        // Leaving clears only this chip's own preview, never a hover the pointer or a scene handle has set since.
        onBlur={() => {
          if (graphicsRef.getSnapshot().context.hoveredSectionCutId === cutId) {
            hover(undefined);
          }
        }}
      >
        <Icon className='size-3.5' style={{ color: axesColors[sectionAxisOf(cut)] }} />
        <span
          className={cn('font-mono tabular-nums', isSelected ? 'font-medium text-foreground' : 'text-muted-foreground')}
        >
          {label}
        </span>
      </button>
      <Button
        variant='ghost'
        size='icon-xs'
        aria-label={`Remove ${kindName.toLowerCase()} ${label}`}
        className={cn(
          nestedActionVariants(),
          'text-muted-foreground',
          // The × shows on the open or hovered chip, and for keyboard focus and touch.
          'opacity-0 group-hover/chip:opacity-100 group-data-[selected=true]/chip:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100',
        )}
        onClick={() => {
          graphicsRef.send({ type: 'removeSectionCut', payload: cutId });
        }}
      >
        <X />
      </Button>
    </div>
  );
});

/** Adds a plane or a revolution cutaway; the new cut opens. Refused, with the reason, at the cut limit. */
const AddSectionMenu = memo(function AddSectionMenu(): React.JSX.Element {
  const graphicsRef = useGraphics();
  const cameraRig = useCameraRig();
  const isFull = useGraphicsSelector((state) => state.context.sectionCuts.length >= maxSectionCuts);
  const upDirection = useGraphicsSelector((state) => state.context.upDirection);
  const [isOpen, setIsOpen] = useState(false);

  const addCut = (payload: AddSectionCutPayload): void => {
    graphicsRef.send({
      type: 'addSectionCut',
      payload: { ...payload, viewDirection: cameraRig.actorRef.getSnapshot().context.view.direction },
    });
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open && !isFull);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant='ghost'
              size='icon-xs'
              aria-label='Add section'
              // `aria-disabled` rather than `disabled`, so the reason stays reachable by hover and focus.
              aria-disabled={isFull || undefined}
              className='size-7 aria-disabled:cursor-not-allowed aria-disabled:opacity-50'
            >
              <Plus />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side='top'>
          {isFull ? `Up to ${maxSectionCuts} cuts` : 'Add a section; they cut together'}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side='top' align='start' className='w-60'>
        <DropdownMenuLabel>Plane</DropdownMenuLabel>
        {sectionPlanes.map((plane) => (
          <DropdownMenuItem
            key={plane}
            onSelect={() => {
              addCut({ kind: 'plane', plane });
            }}
          >
            <FlipHorizontal style={{ color: axesColors[sectionPlaneAxes[plane]] }} />
            {plane.toUpperCase()} plane
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>About an axis</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => {
            addCut({ kind: 'revolution' });
          }}
        >
          <PieChart style={{ color: axesColors[upDirection] }} />
          <div className='flex flex-col'>
            Revolution cutaway
            <span className='text-xs text-muted-foreground'>Remove a wedge about the axis</span>
          </div>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

const selectCutIds = (state: GraphicsState): string[] => state.context.sectionCuts.map((cut) => cut.id);
const areIdsEqual = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

/** The cuts in play, one chip each, then Add. Re-renders only when a cut comes or goes. */
export function SectionOptions(): React.JSX.Element {
  const cutIds = useSelector(useGraphics(), selectCutIds, areIdsEqual);
  return (
    <div role='group' aria-label='Sections' className='flex min-w-0 flex-wrap items-center gap-1'>
      {cutIds.map((id) => (
        <SectionChip key={id} cutId={id} />
      ))}
      <AddSectionMenu />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

const sliderField =
  'h-7 rounded-md bg-muted px-2 text-xs tabular-nums [&_[data-slot=slider-input-leading]]:text-muted-foreground';

const adornment = (text: string): React.JSX.Element => (
  <span aria-hidden='true' className='ml-1 text-muted-foreground'>
    {text}
  </span>
);
// The degree sign sits on its figure, as the chips write it.
const degreeAdornment = (
  <span aria-hidden='true' className='text-muted-foreground'>
    °
  </span>
);

const PlaneToggle = memo(function PlaneToggle({ cutId }: CutProps): React.JSX.Element {
  const plane = useCutValue(cutId, readPlane);
  const cameraRig = useCameraRig();
  const update = useCutUpdate(cutId);
  const handleChange = useCallback(
    (value: string) => {
      const next = sectionPlanes.find((candidate) => candidate === value);
      // A new plane, like an added one: through the bounds centre, flipped to remove the side facing the camera.
      if (next) {
        update((cut) =>
          cut.kind === 'plane' && cut.plane !== next
            ? {
                plane: next,
                isFlipped: resolveSectionPlaneFlip(next, cameraRig.actorRef.getSnapshot().context.view.direction),
              }
            : undefined,
        );
      }
    },
    [cameraRig, update],
  );
  return (
    <ToggleGroup
      type='single'
      variant='outline'
      size='sm'
      aria-label='Plane'
      value={plane ?? ''}
      onValueChange={handleChange}
    >
      {sectionPlanes.map((candidate) => (
        <ToggleGroupItem key={candidate} value={candidate} className='h-7 min-w-9 px-2 font-mono text-xs'>
          {candidate.toUpperCase()}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
});

const OffsetField = memo(function OffsetField({ cutId }: CutProps): React.JSX.Element {
  const offset = useCutValue(cutId, readOffset) ?? 0;
  const plane = useCutValue(cutId, readPlane);
  const symbol = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);
  const metersPerUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const geometryRadius = useGraphicsSelector((state) => state.context.geometryRadius);
  const geometryCenter = useGraphicsSelector((state) => state.context.geometryCenter);
  const update = useCutUpdate(cutId);

  const { minMeters, maxMeters } = resolveSectionTranslationControl({
    geometryCenterMeters: geometryCenter,
    geometryRadiusMeters: geometryRadius,
    selectedPlaneId: plane,
  });
  // Until the bounds are known the field advertises none, and only typing and the arrows move it.
  const hasBounds = minMeters !== undefined && maxMeters !== undefined;
  const value = Number((offset / metersPerUnit).toFixed(3));

  const handleChange = useCallback(
    (units: number) => {
      update((cut, context) =>
        cut.kind === 'plane' ? { offset: toPlaneOffset(units, cut.plane, context) } : undefined,
      );
    },
    [update],
  );
  // The arrows step one display unit, as scrubbing does.
  const handleStep = useCallback(
    (direction: -1 | 1) => {
      update((cut, context) =>
        cut.kind === 'plane'
          ? {
              offset: toPlaneOffset(
                Math.round(cut.offset / context.displayUnits.length.metersPerUnit) + direction,
                cut.plane,
                context,
              ),
            }
          : undefined,
      );
    },
    [update],
  );

  return (
    <SliderInput
      value={value}
      min={hasBounds ? minMeters / metersPerUnit : value}
      max={hasBounds ? maxMeters / metersPerUnit : value}
      hasMinimum={hasBounds}
      hasMaximum={hasBounds}
      step={1}
      stepBase={0}
      leadingContent={<span>Offset</span>}
      trailingAdornment={adornment(symbol)}
      className={cn(sliderField, 'w-36')}
      aria-label={`Offset in ${symbol}`}
      onScrubChange={handleChange}
      onInputCommit={handleChange}
      onStep={handleStep}
    />
  );
});

const FlipButton = memo(function FlipButton({ cutId }: CutProps): React.JSX.Element {
  const isFlipped = useCutValue(cutId, readIsFlipped) ?? false;
  const update = useCutUpdate(cutId);
  const handleFlip = useCallback(() => {
    update((cut) => (cut.kind === 'plane' ? { isFlipped: !cut.isFlipped } : undefined));
  }, [update]);
  return (
    <Button
      variant='ghost'
      size='xs'
      className='h-7 aria-pressed:bg-accent'
      aria-pressed={isFlipped}
      onClick={handleFlip}
    >
      <ArrowLeftRight />
      Flip
    </Button>
  );
});

function PlaneFields({ cutId }: CutProps): React.JSX.Element {
  const plane = useCutValue(cutId, readPlane) ?? 'xz';
  return (
    <div role='group' aria-label={`${plane.toUpperCase()} plane`} className='flex flex-wrap items-center gap-1'>
      <PlaneToggle cutId={cutId} />
      <OffsetField cutId={cutId} />
      <FlipButton cutId={cutId} />
    </div>
  );
}

/**
 * An axis's letter in the text colour, after a mark in the axis's colour. The mark takes 40% of the text colour, which
 * keeps it above 3:1 on every surface the letter reads on, in every theme.
 */
export function AxisLabel({ axis }: Readonly<{ axis: SectionAxis }>): React.JSX.Element {
  return (
    <span className='inline-flex items-center gap-1'>
      <span
        aria-hidden='true'
        className='size-1.5 shrink-0 rounded-full'
        // ponytail: scene axis colours mixed toward the text colour; theme-aware axis tokens are the upgrade path.
        style={{ backgroundColor: `color-mix(in oklch, ${axesColors[axis]} 60%, currentColor)` }}
      />
      {axis.toUpperCase()}
    </span>
  );
}

const AxisToggle = memo(function AxisToggle({ cutId }: CutProps): React.JSX.Element {
  const axis = useCutValue(cutId, readAxis);
  const update = useCutUpdate(cutId);
  const handleChange = useCallback(
    (value: string) => {
      const next = sectionAxes.find((candidate) => candidate === value);
      if (next) {
        update(() => ({ axis: next }));
      }
    },
    [update],
  );
  return (
    <ToggleGroup
      type='single'
      variant='outline'
      size='sm'
      aria-label='Axis'
      value={axis ?? ''}
      onValueChange={handleChange}
    >
      {sectionAxes.map((candidate) => (
        <ToggleGroupItem
          key={candidate}
          value={candidate}
          aria-label={`${candidate.toUpperCase()} axis`}
          className='h-7 min-w-7 px-2 font-mono text-xs font-semibold'
        >
          <AxisLabel axis={candidate} />
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
});

const clampSweep = (degrees: number): number => clamp(Math.round(degrees), minSectionSweep, maxSectionSweep);

const SweepField = memo(function SweepField({ cutId }: CutProps): React.JSX.Element {
  const sweep = useCutValue(cutId, readSweep) ?? minSectionSweep;
  const update = useCutUpdate(cutId);
  const handleChange = useCallback(
    (degrees: number) => {
      update(() => ({ sweep: clampSweep(degrees) }));
    },
    [update],
  );
  const handleStep = useCallback(
    (direction: -1 | 1, { shift }: { shift: boolean }) => {
      update((cut) =>
        cut.kind === 'revolution'
          ? { sweep: clampSweep(Math.round(cut.sweep) + direction * angleStep(shift)) }
          : undefined,
      );
    },
    [update],
  );
  return (
    <SliderInput
      value={Math.round(sweep)}
      min={minSectionSweep}
      max={maxSectionSweep}
      step={1}
      leadingContent={<span>Sweep</span>}
      trailingAdornment={degreeAdornment}
      className={cn(sliderField, 'w-28')}
      aria-label='Sweep in degrees'
      onScrubChange={handleChange}
      onInputCommit={handleChange}
      onStep={handleStep}
    />
  );
});

const StartField = memo(function StartField({ cutId }: CutProps): React.JSX.Element {
  const start = useCutValue(cutId, readStart) ?? 0;
  const update = useCutUpdate(cutId);
  const handleChange = useCallback(
    (degrees: number) => {
      update(() => ({ start: clamp(Math.round(degrees), 0, 359) }));
    },
    [update],
  );
  // Arrows wrap around the circle; scrubbing and typing stop at its ends.
  const handleStep = useCallback(
    (direction: -1 | 1, { shift }: { shift: boolean }) => {
      update((cut) =>
        cut.kind === 'revolution'
          ? { start: (Math.round(cut.start) + direction * angleStep(shift) + 360) % 360 }
          : undefined,
      );
    },
    [update],
  );
  return (
    <SliderInput
      value={Math.round(start)}
      min={0}
      max={359}
      step={1}
      leadingContent={<span>From</span>}
      trailingAdornment={degreeAdornment}
      className={cn(sliderField, 'w-26')}
      aria-label='Start angle in degrees'
      onScrubChange={handleChange}
      onInputCommit={handleChange}
      onStep={handleStep}
    />
  );
});

function RevolutionFields({ cutId }: CutProps): React.JSX.Element {
  return (
    <div role='group' aria-label='Revolution cutaway' className='flex flex-wrap items-center gap-1'>
      <AxisToggle cutId={cutId} />
      <SweepField cutId={cutId} />
      <StartField cutId={cutId} />
    </div>
  );
}

/** The open cut's fields, unfolding above the chips. The scene's handles make the same edits by drag. */
function SectionCutEditor({ cutId, kind }: Readonly<{ cutId: string; kind: SectionCut['kind'] }>): React.JSX.Element {
  const editorRef = useRef<HTMLDivElement>(null);
  useFocusHandOff(editorRef, resolveEditorChip);
  return (
    <div
      ref={editorRef}
      data-section-editor={cutId}
      className='flex animate-in flex-wrap items-center gap-1 border-b pb-1 duration-150 fade-in-0 slide-in-from-bottom-1'
      onKeyDownCapture={returnToChipAfterField}
    >
      {kind === 'plane' ? <PlaneFields cutId={cutId} /> : <RevolutionFields cutId={cutId} />}
    </div>
  );
}

const selectOpenCut = (state: GraphicsState): SectionCut | undefined =>
  state.context.selectedSectionCutId === undefined
    ? undefined
    : findCut(state.context.sectionCuts, state.context.selectedSectionCutId);

/** The selected cut's editor, or nothing while no cut is open. */
export function SectionEditor(): React.ReactNode {
  const cutId = useGraphicsSelector((state) => selectOpenCut(state)?.id);
  const kind = useGraphicsSelector((state) => selectOpenCut(state)?.kind);
  return cutId && kind ? <SectionCutEditor key={cutId} cutId={cutId} kind={kind} /> : null;
}

/**
 * Says so when the caps refuse the latest cuts, while the view keeps the last section they drew. It stays mounted
 * with the row, so the words are announced when they arrive, and takes no room while there is nothing to say.
 */
export function SectionStatus(): React.JSX.Element {
  const isRejected = useGraphicsSelector((state) => state.context.sectionCertification === 'rejected');
  return (
    <p role='status' className={isRejected ? 'flex items-center gap-1 px-1 text-xs text-muted-foreground' : 'sr-only'}>
      {isRejected ? (
        <>
          <CircleAlert aria-hidden='true' className='size-3.5 shrink-0 text-feature' />
          Section unavailable for this model; showing the last section
        </>
      ) : null}
    </p>
  );
}
