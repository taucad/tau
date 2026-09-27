/**
 * Overflow (dropdown) variants of viewer toolbar controls.
 * These are rendered inside the ViewerSettings dropdown when the
 * toolbar is too narrow to display them inline.
 */
import { useCallback, useMemo } from 'react';
import { FlipHorizontal, Focus, Grid3X3, Ruler, Shapes } from 'lucide-react';
import type { JSONSchema7 } from '@taucad/json-schema';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
  DropdownMenuToggleGroupItem,
} from '@taucad/ui/components/dropdown-menu';
import { DropdownMenuSliderItem } from '#components/ui/menu-slider-item.js';
import { formatNumberEngineeringNotation } from '#utils/number.utils.js';
import { gridUnitOptions, maxGridDigits } from '#components/geometry/cad/grid-unit-options.js';
import { useCameraRig, useCameraSelector, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';
import { useCad, useCadSelector } from '#hooks/use-cad.js';
import { selectRenderOptions, selectRenderOptionsDefaults, selectRenderOptionsSchema } from '#machines/cad.machine.js';

// ── FOV Overflow Control ──────────────────────────────────────────────────────

/** FOV slider rendered as a DropdownMenuSliderItem */
export function FovOverflowControl(): React.JSX.Element {
  const cameraRig = useCameraRig();
  const fovAngle = useCameraSelector((state) => state.context.view.requestedVerticalFieldOfView);

  const handleFovChange = useCallback(
    (value: number) => {
      cameraRig.actorRef.send({ type: 'setVerticalFieldOfView', verticalFieldOfView: value });
    },
    [cameraRig],
  );

  return (
    <DropdownMenuSliderItem
      value={fovAngle}
      min={0}
      max={90}
      step={1}
      trailingAdornment='°'
      aria-label='Field of View'
      onValueChange={handleFovChange}
    >
      Field of View
    </DropdownMenuSliderItem>
  );
}

// ── Grid Overflow Control ─────────────────────────────────────────────────────

/** Grid unit selector rendered as a DropdownMenuSub */
export function GridOverflowControl(): React.ReactNode {
  const graphicsRef = useGraphics();
  const gridSizes = useGraphicsSelector((state) => state.context.gridSizes);
  const metersPerDisplayUnit = useGraphicsSelector((state) => state.context.displayUnits.length.metersPerUnit);
  const unit = useGraphicsSelector((state) => state.context.displayUnits.length.symbol);

  const handleUnitChange = useCallback(
    (selectedUnit: string) => {
      graphicsRef.send({
        type: 'setGridUnit',
        payload: { unit: selectedUnit },
      });
    },
    [graphicsRef],
  );

  const preventClose = useCallback((event: Event) => {
    event.preventDefault();
  }, []);

  const displaySize = gridSizes.smallSize / metersPerDisplayUnit;
  const localizedSmallGridSize = useMemo(
    () => formatNumberEngineeringNotation(displaySize, maxGridDigits),
    [displaySize],
  );

  if (!gridSizes.smallSize) {
    return null;
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Grid3X3 />
        Grid: {localizedSmallGridSize} {unit}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className='w-48'>
        <DropdownMenuLabel>Unit</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={unit} onValueChange={handleUnitChange}>
          {gridUnitOptions.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              className='flex items-center justify-between gap-2'
              value={option.value}
              onSelect={preventClose}
            >
              <span>{option.label}</span>
              <span className='flex w-8 items-center justify-center rounded-xs bg-neutral/20 px-1 py-0.5 font-mono text-xs'>
                {option.value}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

// ── Section View Overflow Control ─────────────────────────────────────────────

/** Section view toggle rendered as a DropdownMenuSwitchItem */
export function SectionViewOverflowControl(): React.ReactNode {
  const graphicsRef = useGraphics();
  const isSectionViewActive = useGraphicsSelector((state) => state.context.isSectionViewActive);
  const is2dGeometry = useGraphicsSelector((state) => state.context.geometry?.format === 'svg');

  const handleToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({
        type: 'setSectionViewActive',
        payload: checked,
      });
    },
    [graphicsRef],
  );

  if (is2dGeometry) {
    return null;
  }

  return (
    <DropdownMenuSwitchItem isChecked={isSectionViewActive} onIsCheckedChange={handleToggle}>
      <FlipHorizontal />
      Section View
    </DropdownMenuSwitchItem>
  );
}

// ── Measure Overflow Control ──────────────────────────────────────────────────

/** Measure toggle rendered as a DropdownMenuSwitchItem */
export function MeasureOverflowControl(): React.ReactNode {
  const graphicsRef = useGraphics();
  const isMeasureActive = useGraphicsSelector((state) => state.matches({ operational: 'measure' }));
  const is2dGeometry = useGraphicsSelector((state) => state.context.geometry?.format === 'svg');

  const handleToggle = useCallback(
    (checked: boolean) => {
      graphicsRef.send({
        type: 'setMeasureActive',
        payload: checked,
      });
    },
    [graphicsRef],
  );

  if (is2dGeometry) {
    return null;
  }

  return (
    <DropdownMenuSwitchItem isChecked={isMeasureActive} onIsCheckedChange={handleToggle}>
      <Ruler className='-rotate-45' />
      Measure
    </DropdownMenuSwitchItem>
  );
}

// ── Fit View Overflow Control ─────────────────────────────────────────────────

/** Fit view rendered as a DropdownMenuItem */
export function FitViewOverflowControl(): React.JSX.Element {
  const graphicsRef = useGraphics();

  const handleFit = useCallback(() => {
    graphicsRef.send({ type: 'fitView' });
  }, [graphicsRef]);

  return (
    <DropdownMenuItem onSelect={handleFit}>
      <Focus />
      Fit view
    </DropdownMenuItem>
  );
}

// ── Output Overflow Control ───────────────────────────────────────────────────

const emptyRenderOptions: Record<string, unknown> = {};

// Short enum values are initialisms (`3d`, `pcb`); longer ones are words (`schematic`).
const capitalize = (value: string): string =>
  value.length <= 3 ? value.toUpperCase() : value.charAt(0).toUpperCase() + value.slice(1);

type OutputChoices = { readonly values: readonly string[]; readonly defaultValue: unknown };

/** The `output` enum of a kernel's render-option schema, when it declares one. */
function selectOutputChoices(schema: JSONSchema7 | undefined): OutputChoices | undefined {
  const output = schema?.properties?.['output'];
  if (typeof output !== 'object' || !Array.isArray(output.enum)) {
    return undefined;
  }
  const values = output.enum.filter((value): value is string => typeof value === 'string');
  return values.length > 0 ? { values, defaultValue: output.default } : undefined;
}

/**
 * Output-kind selector rendered as a DropdownMenuToggleGroupItem.
 * Driven by the active kernel's `renderOptions.schema.properties.output` enum; hidden when there is none.
 */
export function OutputOverflowControl(): React.ReactNode {
  const cadRef = useCad();
  const schema = useCadSelector(selectRenderOptionsSchema, undefined);
  const defaults = useCadSelector(selectRenderOptionsDefaults, undefined);
  const renderOptions = useCadSelector(selectRenderOptions, emptyRenderOptions);

  const choices = useMemo(() => selectOutputChoices(schema), [schema]);
  const options = useMemo(
    () => choices?.values.map((value) => ({ value, label: capitalize(value), ariaLabel: capitalize(value) })),
    [choices],
  );

  const handleOutputChange = useCallback(
    (output: string) => {
      cadRef?.send({ type: 'setRenderOptions', renderOptions: { output } });
    },
    [cadRef],
  );

  if (!choices || !options) {
    return null;
  }

  const current = renderOptions['output'] ?? defaults?.['output'] ?? choices.defaultValue;
  const value = typeof current === 'string' && choices.values.includes(current) ? current : choices.values[0]!;

  return (
    <DropdownMenuToggleGroupItem value={value} options={options} onValueChange={handleOutputChange}>
      <Shapes />
      Output
    </DropdownMenuToggleGroupItem>
  );
}
