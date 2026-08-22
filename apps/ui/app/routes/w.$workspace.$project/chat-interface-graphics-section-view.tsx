import React, { useMemo } from 'react';
import { Box, PenLine, Ruler } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs.js';
import { Switch } from '#components/ui/switch.js';
import { ParametersNumber } from '#components/geometry/parameters/parameters-number.js';
import { InfoTooltip } from '#components/ui/info-tooltip.js';
import { useGraphics, useGraphicsSelector } from '#hooks/use-graphics.js';

function toDegrees(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  return Math.round(degrees);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

type PlaneButtonConfig = {
  id: 'xy' | 'xz' | 'yz' | 'yx' | 'zx' | 'zy';
  dir: 1 | -1;
};

/**
 * Get the plane button configuration for the given up direction.
 * The buttons are ordered semantically: Top, Front, Right, Bottom, Back, Left
 * The IDs map to the correct planes for each coordinate system.
 */
function getPlaneButtonsForUpDirection(upDirection: 'x' | 'y' | 'z'): PlaneButtonConfig[] {
  // Button order: Top, Front, Right, Bottom, Back, Left (2 rows x 3 cols)
  if (upDirection === 'z') {
    // Z-up: XY → Top/Bottom, XZ → Front/Back, YZ → Left/Right
    return [
      { id: 'xy', dir: 1 }, // Top
      { id: 'zx', dir: -1 }, // Front
      { id: 'yz', dir: 1 }, // Right
      { id: 'yx', dir: -1 }, // Bottom
      { id: 'xz', dir: 1 }, // Back
      { id: 'zy', dir: -1 }, // Left
    ];
  }

  if (upDirection === 'y') {
    // Y-up: XZ → Top/Bottom, XY → Front/Back, YZ → Left/Right
    // Labels match 3D selectors:
    // 'zx' shows "Top", 'xz' shows "Bottom"
    // 'xy' shows "Front", 'yx' shows "Back"
    return [
      { id: 'zx', dir: -1 }, // Top
      { id: 'xy', dir: 1 }, // Front
      { id: 'yz', dir: 1 }, // Right
      { id: 'xz', dir: 1 }, // Bottom
      { id: 'yx', dir: -1 }, // Back
      { id: 'zy', dir: -1 }, // Left
    ];
  }

  // X-up: YZ → Top/Bottom, XY → Front/Back, XZ → Left/Right
  // Labels match 3D selectors:
  // 'yz' shows "Top", 'zy' shows "Bottom"
  // 'xy' shows "Front", 'yx' shows "Back"
  // 'xz' shows "Left", 'zx' shows "Right"
  return [
    { id: 'yz', dir: 1 }, // Top
    { id: 'xy', dir: 1 }, // Front
    { id: 'zx', dir: -1 }, // Right
    { id: 'zy', dir: -1 }, // Bottom
    { id: 'yx', dir: -1 }, // Back
    { id: 'xz', dir: 1 }, // Left
  ];
}

export function ChatInterfaceGraphicsSectionView(): React.JSX.Element {
  const graphicsActor = useGraphics();
  const {
    selectedSectionViewId,
    sectionViewTranslation,
    sectionViewRotation,
    sectionViewDirection,
    planeName,
    enableClippingLines,
    enableClippingMesh,
    geometryRadius,
    sceneRadius,
    units,
    upDirection,
  } = useGraphicsSelector((s) => ({
    selectedSectionViewId: s.context.selectedSectionViewId,
    sectionViewTranslation: s.context.sectionViewTranslation,
    sectionViewRotation: s.context.sectionViewRotation,
    sectionViewDirection: s.context.sectionViewDirection,
    planeName: s.context.planeName,
    enableClippingLines: s.context.enableClippingLines,
    enableClippingMesh: s.context.enableClippingMesh,
    geometryRadius: s.context.geometryRadius,
    sceneRadius: s.context.sceneRadius,
    units: s.context.units,
    upDirection: s.context.upDirection,
  }));

  const maxDistance = useMemo(() => {
    const sr = sceneRadius ?? 0;
    const radius = sr > 0 ? sr : geometryRadius;
    // Provide a sensible default range when radius is not yet known
    const base = radius > 0 ? radius * 2 : 100;
    return Math.max(10, base);
  }, [geometryRadius, sceneRadius]);

  const rotationDegrees = useMemo(() => {
    const [rx, ry, rz] = sectionViewRotation;
    return { x: toDegrees(rx), y: toDegrees(ry), z: toDegrees(rz) };
  }, [sectionViewRotation]);

  const rotationDisabled = useMemo(() => {
    if (selectedSectionViewId === 'xy') {
      return { x: false, y: false, z: true } as const;
    }

    if (selectedSectionViewId === 'xz') {
      return { x: false, y: true, z: false } as const;
    }

    if (selectedSectionViewId === 'yz') {
      return { x: true, y: false, z: false } as const;
    }

    return { x: false, y: false, z: false } as const;
  }, [selectedSectionViewId]);

  // oxlint-disable-next-line unicorn-js/prevent-abbreviations -- dir refers to direction vector, not directory
  function getUiLabelFor(base: 'xy' | 'xz' | 'yz', dir: 1 | -1): string {
    type PlaneLabels = Record<'xy' | 'xz' | 'yz', [string, string]>;

    if (planeName === 'cartesian') {
      const cartesianLabels: PlaneLabels = {
        xy: ['XY', 'YX'],
        xz: ['XZ', 'ZX'],
        yz: ['YZ', 'ZY'],
      };
      const labels = cartesianLabels[base];
      return dir === 1 ? labels[0] : labels[1];
    }

    // Face naming - must match getLabelsForUpDirection in section-view-controls.tsx
    // Map: upDirection -> base -> [label for dir=1, label for dir=-1]
    const faceLabels: Record<'x' | 'y' | 'z', PlaneLabels> = {
      z: { xy: ['Top', 'Bottom'], xz: ['Back', 'Front'], yz: ['Right', 'Left'] },
      y: { xz: ['Bottom', 'Top'], xy: ['Front', 'Back'], yz: ['Right', 'Left'] },
      x: { yz: ['Top', 'Bottom'], xy: ['Front', 'Back'], xz: ['Left', 'Right'] },
    };

    const labels = faceLabels[upDirection][base];
    return dir === 1 ? labels[0] : labels[1];
  }

  function getSelectedHeader(): string {
    if (!selectedSectionViewId) {
      return '';
    }

    return getUiLabelFor(selectedSectionViewId, sectionViewDirection);
  }

  return (
    <div className='flex h-full flex-col gap-3'>
      {selectedSectionViewId ? (
        <div className='grid gap-3'>
          <div className='flex flex-wrap items-center justify-between gap-1 px-1 text-xs text-muted-foreground'>
            <div>
              Plane: <span className='font-medium text-foreground'>{getSelectedHeader()}</span>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='ghost'
                size='xs'
                title='Change plane'
                onClick={() => {
                  graphicsActor.send({ type: 'selectSectionView', payload: undefined });
                }}
              >
                Change
              </Button>
              <Button
                variant='outline'
                size='xs'
                title='Flip direction'
                onClick={() => {
                  graphicsActor.send({ type: 'toggleSectionViewDirection' });
                }}
              >
                Flip
              </Button>
            </div>
          </div>
          <div className='grid gap-2'>
            <div className='flex items-center gap-1 px-1 text-xs text-muted-foreground'>
              <span>Translation</span>
              <InfoTooltip className='size-3'>
                Offset along the base plane axis. Stays constant while rotating.
              </InfoTooltip>
            </div>
            <div className='grid grid-cols-[20px_1fr] items-center gap-2'>
              <div className='px-1 text-xs text-muted-foreground'>
                <Ruler className='size-4 -rotate-45' />
              </div>
              <ParametersNumber
                enableContinualOnChange
                units={units}
                value={sectionViewTranslation}
                defaultValue={0}
                descriptor='length'
                step={1}
                min={-maxDistance}
                max={maxDistance}
                onChange={(value) => {
                  graphicsActor.send({ type: 'setSectionViewTranslation', payload: value });
                }}
              />
            </div>
          </div>
          <div className='grid gap-2'>
            <div className='px-1 text-xs text-muted-foreground'>Rotation (degrees)</div>
            <div className='grid gap-2'>
              <div className='grid grid-cols-[20px_1fr] items-center gap-2'>
                <div className='flex h-5 w-5 flex-col items-center justify-center text-sm font-medium text-muted-foreground'>
                  X
                </div>
                <ParametersNumber
                  enableContinualOnChange
                  units={units}
                  value={rotationDegrees.x}
                  defaultValue={0}
                  descriptor='angle'
                  min={-180}
                  max={180}
                  step={1}
                  disabled={rotationDisabled.x}
                  onChange={(value) => {
                    const [, ry, rz] = sectionViewRotation;
                    graphicsActor.send({ type: 'setSectionViewRotation', payload: [toRadians(value), ry, rz] });
                  }}
                />
              </div>
              <div className='grid grid-cols-[20px_1fr] items-center gap-2'>
                <div className='flex h-5 w-5 items-center justify-center text-sm font-medium text-muted-foreground'>
                  Y
                </div>
                <ParametersNumber
                  enableContinualOnChange
                  units={units}
                  value={rotationDegrees.y}
                  defaultValue={0}
                  descriptor='angle'
                  min={-180}
                  max={180}
                  step={1}
                  disabled={rotationDisabled.y}
                  onChange={(value) => {
                    const [rx, , rz] = sectionViewRotation;
                    graphicsActor.send({ type: 'setSectionViewRotation', payload: [rx, toRadians(value), rz] });
                  }}
                />
              </div>
              <div className='grid grid-cols-[20px_1fr] items-center gap-2'>
                <div className='flex h-5 w-5 items-center justify-center text-sm font-medium text-muted-foreground'>
                  Z
                </div>
                <ParametersNumber
                  enableContinualOnChange
                  units={units}
                  value={rotationDegrees.z}
                  defaultValue={0}
                  descriptor='angle'
                  min={-180}
                  max={180}
                  step={1}
                  disabled={rotationDisabled.z}
                  onChange={(value) => {
                    const [rx, ry] = sectionViewRotation;
                    graphicsActor.send({ type: 'setSectionViewRotation', payload: [rx, ry, toRadians(value)] });
                  }}
                />
              </div>
            </div>
          </div>
          <div className='grid gap-2'>
            <div className='flex items-center gap-1 px-1 text-xs text-muted-foreground'>
              <span>Apply to</span>
            </div>
            <div className='grid gap-2'>
              <label className='flex cursor-pointer items-center justify-between rounded-md border bg-card px-2 py-1.5 text-sm select-none'>
                <span className='flex items-center gap-2'>
                  <Box className='size-4 text-muted-foreground' /> Surfaces
                </span>
                <Switch
                  checked={enableClippingMesh}
                  onCheckedChange={(checked) => {
                    graphicsActor.send({ type: 'setClippingMeshEnabled', payload: Boolean(checked) });
                  }}
                />
              </label>
              <label className='flex cursor-pointer items-center justify-between rounded-md border bg-card px-2 py-1.5 text-sm select-none'>
                <span className='flex items-center gap-2'>
                  <PenLine className='size-4 text-muted-foreground' /> Lines
                </span>
                <Switch
                  checked={enableClippingLines}
                  onCheckedChange={(checked) => {
                    graphicsActor.send({ type: 'setClippingLinesEnabled', payload: Boolean(checked) });
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      ) : (
        <div className='grid gap-2'>
          <div className='px-1 text-xs text-muted-foreground'>Select a plane</div>
          <div className='grid grid-cols-2 gap-2'>
            {getPlaneButtonsForUpDirection(upDirection).map((item) => (
              <Button
                key={`${item.id}`}
                variant='outline'
                size='xs'
                onMouseEnter={() => {
                  graphicsActor.send({ type: 'setHoveredSectionView', payload: item.id });
                }}
                onMouseLeave={() => {
                  graphicsActor.send({ type: 'setHoveredSectionView', payload: undefined });
                }}
                onClick={() => {
                  const base =
                    item.id === 'xy' || item.id === 'yx' ? 'xy' : item.id === 'xz' || item.id === 'zx' ? 'xz' : 'yz';
                  graphicsActor.send({ type: 'selectSectionView', payload: base });
                  graphicsActor.send({ type: 'setSectionViewDirection', payload: item.dir });
                }}
              >
                {getUiLabelFor(
                  item.id === 'xy' || item.id === 'yx' ? 'xy' : item.id === 'xz' || item.id === 'zx' ? 'xz' : 'yz',
                  item.dir,
                )}
              </Button>
            ))}
          </div>
          <div className='flex flex-wrap items-center justify-between gap-1 px-1'>
            <span className='text-xs text-muted-foreground'>Plane naming</span>
            <Tabs
              value={planeName}
              onValueChange={(v) => {
                graphicsActor.send({ type: 'setPlaneName', payload: v as 'face' | 'cartesian' });
              }}
            >
              <TabsList className='h-7 [&_[data-slot=tabs-trigger]]:text-xs'>
                <TabsTrigger value='face'>Face</TabsTrigger>
                <TabsTrigger value='cartesian'>Cartesian</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
