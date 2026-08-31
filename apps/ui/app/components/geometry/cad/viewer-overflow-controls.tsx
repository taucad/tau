/**
 * Overflow (dropdown) variants of viewer toolbar controls.
 * These are rendered inside the ViewerSettings dropdown when the
 * toolbar is too narrow to display them inline.
 */
import { useCallback, useMemo } from 'react';
import { FlipHorizontal, Focus, Grid3X3, Ruler } from 'lucide-react';
import type { LengthSymbol } from '@taucad/units';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSliderItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSwitchItem,
} from '#components/ui/dropdown-menu.js';
import { formatNumberEngineeringNotation } from '#utils/number.utils.js';
import { gridUnitOptions, maxGridDigits } from '#components/geometry/cad/grid-unit-options.js';
import { useCameraRig, useCameraSelector, useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

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
        payload: { unit: selectedUnit as LengthSymbol },
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

// ── Reset Camera Overflow Control ─────────────────────────────────────────────

/** Reset camera rendered as a DropdownMenuItem */
export function ResetCameraOverflowControl(): React.JSX.Element {
  const graphicsRef = useGraphics();

  const handleReset = useCallback(() => {
    graphicsRef.send({ type: 'resetCamera' });
  }, [graphicsRef]);

  return (
    <DropdownMenuItem onSelect={handleReset}>
      <Focus />
      Reset Camera
    </DropdownMenuItem>
  );
}
