import { Button } from '@taucad/ui/components/button';
import { Slider } from '@taucad/ui/components/slider';
import { cn } from '@taucad/ui/utils/cn';
import type {
  SceneTimelineArtifactSave,
  SceneTimelineEntry,
  SceneTimelineStreamState,
} from '#machines/scene-timeline.js';

type SceneTimelineControlProperties = {
  readonly entries: readonly SceneTimelineEntry[];
  readonly selectedSequence: number | undefined;
  readonly isFollowingLive: boolean;
  readonly streamState: SceneTimelineStreamState;
  readonly artifactSave?: SceneTimelineArtifactSave;
  readonly isSaveSelectedStageEnabled?: boolean;
  readonly onSelectSequence: (sequence: number) => void;
  readonly onLive: () => void;
  readonly onSaveSelectedStage?: () => void;
  readonly className?: string;
};

const statusLabel = (streamState: SceneTimelineStreamState, followLive: boolean): string => {
  if (streamState === 'recovering') {
    return 'Recovering';
  }
  if (streamState === 'failed') {
    return 'Timeline unavailable';
  }
  if (streamState === 'cancelled') {
    return 'Cancelled';
  }
  if (streamState === 'complete' && followLive) {
    return 'Complete';
  }
  return followLive ? 'Live' : 'Paused';
};

const frameName = (entry: SceneTimelineEntry, index: number): string => entry.label ?? `Frame ${index + 1}`;

const artifactSaveForEntry = (
  artifactSave: SceneTimelineArtifactSave,
  entry: SceneTimelineEntry,
): SceneTimelineArtifactSave =>
  artifactSave.status !== 'idle' && artifactSave.sequence === entry.sequence ? artifactSave : { status: 'idle' };

const artifactStatusMessage = (artifactSave: SceneTimelineArtifactSave): string | undefined => {
  if (artifactSave.status === 'saving') {
    return 'Saving preview stage to the project';
  }
  if (artifactSave.status === 'saved') {
    return `Saved preview stage as ${artifactSave.path}`;
  }
  if (artifactSave.status === 'failed') {
    return `Could not save preview stage: ${artifactSave.message}`;
  }
  return undefined;
};

export const SceneTimelineControl = ({
  entries,
  selectedSequence,
  isFollowingLive,
  streamState,
  artifactSave = { status: 'idle' },
  isSaveSelectedStageEnabled = false,
  onSelectSequence,
  onLive,
  onSaveSelectedStage,
  className,
}: SceneTimelineControlProperties): React.JSX.Element | undefined => {
  if (entries.length < 2) {
    return;
  }

  const selectedIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.sequence === selectedSequence),
  );
  const selectedEntry = entries[selectedIndex] ?? entries.at(-1)!;
  const selectedName = frameName(selectedEntry, selectedIndex);
  const stateLabel = statusLabel(streamState, isFollowingLive);
  const valueText = `Frame ${selectedIndex + 1} of ${entries.length}: ${selectedName}. ${stateLabel}.`;
  const availabilityMessage =
    selectedEntry.availability === 'rehydrating'
      ? `Restoring ${selectedName}`
      : selectedEntry.availability === 'unavailable'
        ? `${selectedName} is unavailable`
        : valueText;
  const selectedArtifactSave = artifactSaveForEntry(artifactSave, selectedEntry);
  const artifactMessage = artifactStatusMessage(selectedArtifactSave);

  return (
    <div
      className={cn(
        'w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border/70 bg-background/92 px-3 py-2 shadow-lg backdrop-blur-md',
        className,
      )}
    >
      <div className='mb-1.5 flex min-w-0 items-center gap-2 text-[11px] leading-none'>
        <span className='shrink-0 font-mono text-muted-foreground'>{`${selectedIndex + 1} / ${entries.length}`}</span>
        <span className='min-w-0 flex-1 truncate font-medium'>{selectedName}</span>
        <span
          className={cn(
            'shrink-0 font-medium',
            isFollowingLive && streamState === 'live'
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground',
          )}
        >
          {stateLabel}
        </span>
      </div>
      <div className='flex items-center gap-2'>
        <Slider
          ref={(root) => {
            const thumb = root?.querySelector<HTMLElement>('[role="slider"]');
            thumb?.setAttribute('aria-label', 'Scene timeline');
            thumb?.setAttribute('aria-valuetext', valueText);
          }}
          min={0}
          max={entries.length - 1}
          step={1}
          value={[selectedIndex]}
          onValueChange={([index]) => {
            const nextEntry = index === undefined ? undefined : entries[index];
            if (nextEntry) {
              onSelectSequence(nextEntry.sequence);
            }
          }}
        />
        <Button
          type='button'
          size='sm'
          variant={isFollowingLive ? 'secondary' : 'outline'}
          aria-label='Return to live scene'
          disabled={isFollowingLive && streamState === 'live'}
          className='h-7 shrink-0 px-2 text-xs'
          onClick={onLive}
        >
          Live
        </Button>
        {onSaveSelectedStage ? (
          <Button
            type='button'
            size='sm'
            variant='outline'
            aria-label='Save selected preview stage to project'
            disabled={!isSaveSelectedStageEnabled || selectedArtifactSave.status === 'saving'}
            className='h-7 shrink-0 px-2 text-xs'
            onClick={onSaveSelectedStage}
          >
            {selectedArtifactSave.status === 'saving' ? 'Saving…' : 'Save stage'}
          </Button>
        ) : null}
      </div>
      <p className='mt-1.5 text-[11px] text-muted-foreground'>
        Preview stage (preview only) — export still uses the final model.
      </p>
      <p
        role='status'
        aria-live='polite'
        aria-atomic='true'
        className={cn(
          artifactMessage ? 'mt-1 text-[11px]' : 'sr-only',
          selectedArtifactSave.status === 'failed' && 'text-destructive',
        )}
      >
        {artifactMessage ?? availabilityMessage}
      </p>
    </div>
  );
};
