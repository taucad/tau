import { useEffect, useRef } from 'react';
import { cameraMappings } from '@taucad/viewer/graphics/three/controls/camera-presets';
import type { CameraGesture, CameraMappingId } from '@taucad/viewer/graphics/three/controls/camera-presets';
import { Button } from '@taucad/ui/components/button';
import { cn } from '@taucad/ui/utils/cn';
import { gestureCopy, keyCapCopy, viewerStepCopy } from '#components/onboarding/setup-copy.js';
import type { PreviewFallbackReason } from '#telemetry/onboarding-telemetry.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';

const gestures: ReadonlyArray<Exclude<CameraGesture, 'none'>> = ['orbit', 'pan', 'zoom'];

/** What lights up for one gesture: a mouse button, the wheel, or a trackpad, and the modifiers held with it. */
type GestureInput = Readonly<{
  part: 'left' | 'middle' | 'right' | 'scroll' | 'pinch';
  modifiers: readonly string[];
}>;

/**
 * The first binding a mapping lists for a gesture, as the part of the device it uses. Taken from the preset data, so
 * the diagram is right for all six presets and the trackpad mapping with no per-preset drawing.
 *
 * @param mapping - The mapping in effect.
 * @param gesture - The gesture.
 * @returns What lights up.
 */
export const gestureInput = (mapping: CameraMappingId, gesture: Exclude<CameraGesture, 'none'>): GestureInput => {
  const { drag, wheel } = cameraMappings[mapping];
  const caps = (modifiers: readonly string[]): string[] =>
    modifiers.map((name) => keyCapCopy[name as 'shift' | 'ctrl' | 'alt']);
  const dragged = drag.find((binding) => binding.gesture === gesture);
  if (dragged !== undefined) {
    return { part: dragged.button, modifiers: caps(dragged.modifiers) };
  }
  const wheeled = wheel.find((binding) => binding.gesture === gesture);
  return { part: wheeled?.input === 'pinch' ? 'pinch' : 'scroll', modifiers: caps(wheeled?.modifiers ?? []) };
};

function DeviceDrawing({
  input,
  isTrackpad,
  pulseDelay,
}: {
  readonly input: GestureInput;
  readonly isTrackpad: boolean;
  readonly pulseDelay: string;
}): React.JSX.Element {
  const lit = 'fill-primary motion-safe:animate-pulse';
  const idle = 'fill-muted';
  const style = { animationDelay: pulseDelay };
  if (isTrackpad) {
    return (
      <svg viewBox='0 0 64 48' className='h-12 w-16' aria-hidden='true'>
        <rect x='2' y='2' width='60' height='44' rx='6' className='fill-muted stroke-border' />
        <circle cx='26' cy='24' r='5' className={input.part === 'left' ? idle : lit} style={style} />
        <circle cx='38' cy='24' r='5' className={input.part === 'left' ? lit : idle} style={style} />
      </svg>
    );
  }
  return (
    <svg viewBox='0 0 40 60' className='h-14 w-10' aria-hidden='true'>
      <rect x='2' y='2' width='36' height='56' rx='18' className='fill-card stroke-border' />
      <path d='M2 22 V20 A18 18 0 0 1 19 2 V22 Z' className={input.part === 'left' ? lit : idle} style={style} />
      <path d='M38 22 V20 A18 18 0 0 0 21 2 V22 Z' className={input.part === 'right' ? lit : idle} style={style} />
      <rect
        x='17'
        y='8'
        width='6'
        height='10'
        rx='3'
        className={input.part === 'middle' || input.part === 'scroll' ? lit : 'fill-border'}
        style={style}
      />
    </svg>
  );
}

/**
 * The preview's stand-in when it cannot render (Finding 2, S5 f): a mouse, or a trackpad with the switch on, whose
 * button and modifier light up for orbit, pan and zoom in turn. Under `prefers-reduced-motion` nothing animates and
 * the three gestures stand side by side. It captures `onboarding_preview_fallback_shown` once, with the reason.
 *
 * @param properties - The mapping in effect, why the preview fell back, and a retry for a chunk that failed to load.
 * @returns The diagram.
 */
export function SetupPreviewFallback({
  mapping,
  reason,
  onRetry,
}: {
  readonly mapping: CameraMappingId;
  /** Why the live preview is not shown; absent while there is no live preview to fall back from. */
  readonly reason?: PreviewFallbackReason;
  readonly onRetry?: () => void;
}): React.JSX.Element {
  const telemetry = useOnboardingTelemetry();
  const reported = useRef<PreviewFallbackReason | undefined>(undefined);
  useEffect(() => {
    if (reason !== undefined && reported.current !== reason) {
      reported.current = reason;
      telemetry.previewFallbackShown({ reason });
    }
  }, [reason, telemetry]);
  return (
    <figure className='flex flex-col gap-3' data-testid='setup-preview-fallback' data-reason={reason}>
      <figcaption className='text-xs font-medium'>{viewerStepCopy.fallbackTitle}</figcaption>
      <ol className='grid grid-cols-3 gap-3'>
        {gestures.map((gesture, position) => {
          const input = gestureInput(mapping, gesture);
          return (
            <li key={gesture} className='flex flex-col items-center gap-2 rounded-lg bg-muted/50 p-3 text-xs'>
              <DeviceDrawing input={input} isTrackpad={mapping === 'trackpad'} pulseDelay={`${position * 0.66}s`} />
              <span className='font-medium'>{gestureCopy[gesture]}</span>
              <span className={cn('flex flex-wrap justify-center gap-1', input.modifiers.length === 0 && 'invisible')}>
                {input.modifiers.map((modifier) => (
                  <kbd key={modifier} className='rounded-md border bg-muted px-1.5 py-0.5 font-sans text-xs'>
                    {modifier}
                  </kbd>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
      {onRetry === undefined ? null : (
        <Button variant='outline' size='sm' className='self-start' onClick={onRetry}>
          {viewerStepCopy.fallbackRetry}
        </Button>
      )}
    </figure>
  );
}
