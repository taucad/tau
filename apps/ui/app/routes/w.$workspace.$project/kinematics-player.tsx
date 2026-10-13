/**
 * The Kinematics pane's player, pinned at the top of each file panel above the joints that scroll under it.
 * Design: docs/research/kinematics-pane-ux-blueprint.md § Refinement round.
 */
import { useMemo } from 'react';
import { ChevronDown, Pause, Play } from 'lucide-react';
import type { ActorRefFrom } from 'xstate';
import { useSelector } from '@xstate/react';
import type { DegreeOfFreedom, Mechanism } from '@taucad/kinematics';
import { Button } from '@taucad/ui/components/button';
import { ComboBoxResponsive } from '@taucad/ui/components/combobox-responsive';
import { Slider } from '@taucad/ui/components/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@taucad/ui/components/tooltip';
import {
  getKinematicsAnimation,
  getKinematicsClipTime,
  getKinematicsUnitState,
  sweepAnimationId,
} from '@taucad/viewer/machines/kinematics.machine';
import type { KinematicsUnitState, kinematicsMachine } from '@taucad/viewer/machines/kinematics.machine';
import { PaneButton } from '#components/ui/pane-button.js';
import { useReducedMotion } from '#components/geometry/loader/metal-morph-playback-gates.js';
import { LoopGlyph, ProgressRing } from '#routes/w.$workspace.$project/kinematics-instruments.js';

/** The kinematics actor a graphics actor owns. */
export type KinematicsRef = ActorRefFrom<typeof kinematicsMachine>;

/**
 * Selects one value of one unit's state, so a component re-renders only when that value changes.
 * @param unitId - The unit.
 * @param select - Reads the value from the unit's state.
 * @returns A selector for `useSelector` on the kinematics actor.
 */
export const unitSelector =
  <T,>(unitId: string, select: (unit: KinematicsUnitState) => T) =>
  (state: { context: Parameters<typeof getKinematicsUnitState>[0] }): T =>
    select(getKinematicsUnitState(state.context, unitId));

const playbackSpeeds = [0.25, 0.5, 1, 2, 4] as const;

type PickerItem = Readonly<{ id: string; label: string }>;

const getPickerValue = (item: PickerItem): string => item.id;

const playbackSpeedGroups = [
  { name: 'Speed', items: playbackSpeeds.map((speed): PickerItem => ({ id: String(speed), label: `${speed}×` })) },
];

const renderAnimationItem = (item: PickerItem): React.JSX.Element => (
  <span
    data-testid={`kinematics-animation-${item.id === sweepAnimationId ? 'sweep' : item.id}`}
    className='truncate text-sm'
  >
    {item.label}
  </span>
);

const renderSpeedItem = (item: PickerItem): React.JSX.Element => (
  <span className='text-sm tabular-nums'>{item.label}</span>
);

/**
 * The player pinned at the top of the file panel, above the list that scrolls under it: a round outlined Play whose
 * border carries the clip's progress, the clip and speed pickers, the time and the loop glyph, then a scrub strip.
 * Dragging the strip seeks and pauses there, so a clip can be inspected without playing it first.
 * @param props - The unit's actor and id, its mechanism and degrees of freedom.
 * @returns The player.
 */
export function KinematicsPlayer({
  kinematicsRef,
  unitId,
  mechanism,
  dofs,
}: {
  readonly kinematicsRef: KinematicsRef;
  readonly unitId: string;
  readonly mechanism: Mechanism;
  readonly dofs: readonly DegreeOfFreedom[];
}): React.JSX.Element {
  const status = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.status),
  );
  const animationId = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.animationId),
  );
  const speed = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.speed),
  );
  const time = useSelector(
    kinematicsRef,
    unitSelector(unitId, (unit) => unit.playback.time),
  );
  const isReducedMotion = useReducedMotion();
  const isPlaying = status === 'playing';
  // The driver sweep needs a driver, so a mechanism with neither drivers nor clips has nothing to play.
  const hasMotion = (mechanism.animations?.length ?? 0) > 0 || dofs.some((dof) => dof.role === 'driver');
  const animations = useMemo<PickerItem[]>(
    () => [
      ...(mechanism.animations ?? []).map(({ id, name }) => ({ id, label: name ?? id })),
      { id: sweepAnimationId, label: 'Sweep drivers' },
    ],
    [mechanism],
  );
  const animationGroups = useMemo(() => [{ name: 'Animations', items: animations }], [animations]);
  const selectedAnimation = animations.find(({ id }) => id === (animationId ?? sweepAnimationId));
  const clip = useMemo(
    () => getKinematicsAnimation({ mechanism, degreesOfFreedom: dofs, animationId }),
    [animationId, dofs, mechanism],
  );
  const clipTime = clip === undefined ? 0 : getKinematicsClipTime(clip, time);
  const duration = clip?.duration ?? 1;
  const playLabel = isPlaying ? 'Pause' : 'Play';

  return (
    <div data-slot='kinematics-player' className='shrink-0 border-b border-border bg-card px-2.5 pt-2 pb-1.5'>
      <div role='group' aria-label='Playback' className='flex min-w-0 flex-wrap items-center gap-1'>
        <ProgressRing phase={clipTime / duration} isVisible={status !== 'stopped'}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant='outline'
                size='icon-sm'
                className='rounded-full'
                aria-label={playLabel}
                data-testid={isPlaying ? 'kinematics-pause' : 'kinematics-play'}
                disabled={!hasMotion}
                onClick={() => {
                  kinematicsRef.send(isPlaying ? { type: 'pause', unitId } : { type: 'play', unitId });
                }}
              >
                {isPlaying ? <Pause aria-hidden /> : <Play aria-hidden className='ml-0.5' />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{playLabel}</TooltipContent>
          </Tooltip>
        </ProgressRing>
        <ComboBoxResponsive
          groupedItems={animationGroups}
          renderLabel={renderAnimationItem}
          getValue={getPickerValue}
          value={selectedAnimation}
          title='Animation'
          description='Choose the motion to play.'
          isSearchEnabled={animations.length > 5}
          popoverProperties={{ align: 'start', className: 'w-56' }}
          onSelect={(next) => {
            // Under reduced motion a choice only selects the clip; Play stays the explicit start.
            kinematicsRef.send(
              isReducedMotion
                ? { type: 'selectAnimation', unitId, animationId: next }
                : { type: 'play', unitId, animationId: next },
            );
          }}
        >
          <PaneButton
            size='label'
            aria-label={`Animation: ${selectedAnimation?.label ?? ''}`}
            className='min-w-0'
            disabled={!hasMotion}
          >
            <span className='truncate'>{selectedAnimation?.label}</span>
            <ChevronDown aria-hidden className='size-3 opacity-60' />
          </PaneButton>
        </ComboBoxResponsive>
        <ComboBoxResponsive
          groupedItems={playbackSpeedGroups}
          renderLabel={renderSpeedItem}
          getValue={getPickerValue}
          value={playbackSpeedGroups[0]!.items.find(({ id }) => Number(id) === speed)}
          title='Playback speed'
          description='Choose how fast animations play.'
          isSearchEnabled={false}
          popoverProperties={{ align: 'start', className: 'w-28' }}
          onSelect={(next) => {
            kinematicsRef.send({ type: 'setPlaybackSpeed', unitId, speed: Number(next) });
          }}
        >
          <PaneButton size='label' aria-label={`Playback speed: ${speed}×`} className='tabular-nums'>
            {speed}×
            <ChevronDown aria-hidden className='size-3 opacity-60' />
          </PaneButton>
        </ComboBoxResponsive>
        <span className='ml-auto flex shrink-0 items-center gap-1'>
          <span className='text-xs text-muted-foreground tabular-nums'>
            {clipTime.toFixed(1)} / {duration.toFixed(1)} s
          </span>
          <LoopGlyph loop={clip?.loop} />
        </span>
      </div>
      <Slider
        aria-label='Time'
        value={[clipTime]}
        min={0}
        max={duration}
        step={0.1}
        disabled={clip === undefined}
        className='mt-1.5 h-4 [&_[data-slot=slider-thumb]]:size-3'
        onValueChange={([next]) => {
          if (next !== undefined) {
            kinematicsRef.send({ type: 'seek', unitId, time: next });
          }
        }}
      />
    </div>
  );
}
