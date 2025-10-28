import React, { useMemo } from 'react';
import { useSelector } from '@xstate/react';
import { Box, PenLine, Ruler } from 'lucide-react';
import { Button } from '#components/ui/button.js';
import { Switch } from '#components/ui/switch.js';
import { ChatParametersNumber } from '#routes/builds_.$id/chat-parameters-number.js';
import { graphicsActor } from '#routes/builds_.$id/graphics-actor.js';
import { InfoTooltip } from '#components/ui/info-tooltip.js';

function toDegrees(radians: number): number {
  const degrees = (radians * 180) / Math.PI;
  return Math.round(degrees);
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function ChatInterfaceGraphicsSectionView(): React.JSX.Element {
  const state = useSelector(graphicsActor, (s) => s);

  const {
    availableSectionViews,
    selectedSectionViewId,
    sectionViewTranslation,
    sectionViewRotation,
    sectionViewDirection,
    enableClippingLines,
    enableClippingMesh,
    geometryRadius,
    sceneRadius,
  } = state.context as unknown as {
    availableSectionViews: Array<{ id: 'xy' | 'xz' | 'yz' }>;
    selectedSectionViewId: 'xy' | 'xz' | 'yz' | undefined;
    sectionViewTranslation: number;
    sectionViewRotation: [number, number, number];
    sectionViewDirection: 1 | -1;
    enableClippingLines: boolean;
    enableClippingMesh: boolean;
    geometryRadius: number;
    sceneRadius: number | undefined;
  };

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

  return (
    <div className="flex h-full flex-col gap-3">
      {selectedSectionViewId ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
            <div>
              Plane: <span className="font-medium text-foreground">{selectedSectionViewId.toUpperCase()}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="xs"
                title="Change plane"
                onClick={() => {
                  graphicsActor.send({ type: 'selectSectionView', payload: undefined });
                }}
              >
                Change
              </Button>
              <Button
                variant="outline"
                size="xs"
                title="Flip direction"
                onClick={() => {
                  graphicsActor.send({ type: 'toggleSectionViewDirection' });
                }}
              >
                {sectionViewDirection === 1 ? 'Normal' : 'Reverse'}
              </Button>
            </div>
          </div>
          <div className="grid gap-2">
            <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
              <span>Translation</span>
              <InfoTooltip>Offset along the base plane axis. Stays constant while rotating.</InfoTooltip>
            </div>
            <div className="grid grid-cols-[20px_1fr] items-center gap-2">
              <div className="px-1 text-xs text-muted-foreground">
                <Ruler className="size-4 -rotate-45" />
              </div>
              <ChatParametersNumber
                value={sectionViewTranslation}
                defaultValue={0}
                name="translation"
                min={-maxDistance}
                max={maxDistance}
                onChange={(value) => {
                  graphicsActor.send({ type: 'setSectionViewTranslation', payload: value });
                }}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <div className="px-1 text-xs text-muted-foreground">Rotation (degrees)</div>
            <div className="grid gap-2">
              <div className="grid grid-cols-[20px_1fr] items-center gap-2">
                <div className="flex h-5 w-5 flex-col items-center justify-center text-sm font-medium text-muted-foreground">
                  X
                </div>
                <ChatParametersNumber
                  value={rotationDegrees.x}
                  defaultValue={0}
                  name="rotation-x"
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
              <div className="grid grid-cols-[20px_1fr] items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center text-sm font-medium text-muted-foreground">
                  Y
                </div>
                <ChatParametersNumber
                  value={rotationDegrees.y}
                  defaultValue={0}
                  name="rotation-y"
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
              <div className="grid grid-cols-[20px_1fr] items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center text-sm font-medium text-muted-foreground">
                  Z
                </div>
                <ChatParametersNumber
                  value={rotationDegrees.z}
                  defaultValue={0}
                  name="rotation-z"
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
          <div className="grid gap-2">
            <div className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
              <span>Apply to</span>
            </div>
            <div className="grid gap-2">
              <label className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-2 py-1.5 text-sm select-none">
                <span className="flex items-center gap-2">
                  <Box className="size-4 text-muted-foreground" /> Surfaces
                </span>
                <Switch
                  checked={enableClippingMesh}
                  onCheckedChange={(checked) => {
                    graphicsActor.send({ type: 'setClippingMeshEnabled', payload: Boolean(checked) });
                  }}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-2 py-1.5 text-sm select-none">
                <span className="flex items-center gap-2">
                  <PenLine className="size-4 text-muted-foreground" /> Lines
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
        <div className="grid gap-2">
          <div className="px-1 text-xs text-muted-foreground">Select a plane</div>
          <div className="grid grid-cols-3 gap-2">
            {availableSectionViews.map((p) => (
              <Button
                key={p.id}
                variant="outline"
                size="xs"
                onClick={() => {
                  graphicsActor.send({ type: 'selectSectionView', payload: p.id });
                }}
              >
                {p.id.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
