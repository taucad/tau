import { Check, FolderOpen } from 'lucide-react';
import type { DeviceRecord, PersonProfile, ViewerPreferences } from '@taucad/preferences';
import { Button } from '@taucad/ui/components/button';
import { Heading } from '@taucad/ui/components/heading';
import {
  goalCopy,
  setupFinishCopy,
  summaryMakesText,
  summaryViewerText,
  tourSwitchCopy,
} from '#components/onboarding/setup-copy.js';
import { viewerSummary } from '#components/onboarding/setup-model.js';

/** What the screen after Finish reads. */
export type SetupFinishProps = Readonly<{
  headingRef: React.Ref<HTMLHeadingElement>;
  profile: PersonProfile;
  viewer: ViewerPreferences;
  device: DeviceRecord;
  isTourWanted: boolean;
  /** `tour.ended` is set: the summary says the tour was taken instead of what the switch holds. */
  hasTakenTour: boolean;
  isDesktop: boolean;
  isViewerControlsEnabled: boolean;
  onStartBuilding: () => void;
  /** Desktop only: open a folder of projects. */
  onOpenFolder?: () => Promise<void>;
  /** Open Settings → Viewer; absent while that section does not exist. */
  onOpenViewerSettings?: () => void;
  onChangeAnswers: () => void;
  /** Once the tour has ended: take it again, as a replay. Absent when there is no project to take it in. */
  onReplayTour?: () => void;
}>;

/**
 * The screen after Finish: a summary of three lines (two, and no Settings → Viewer link, while `viewerControls`
 * is off), Start building, and on the desktop Open a folder.
 *
 * @param properties - What to summarise and the leaving actions.
 * @returns The screen.
 */
export function SetupFinish({
  headingRef,
  profile,
  viewer,
  device,
  isTourWanted,
  hasTakenTour,
  isDesktop,
  isViewerControlsEnabled,
  onStartBuilding,
  onOpenFolder,
  onOpenViewerSettings,
  onChangeAnswers,
  onReplayTour,
}: SetupFinishProps): React.JSX.Element {
  const goals =
    profile.goals.length === 0
      ? setupFinishCopy.nothingChosen
      : profile.goals.map((goal) => goalCopy[goal].label.toLowerCase()).join(', ');
  const lines = [
    summaryMakesText(goals),
    ...(isViewerControlsEnabled ? [summaryViewerText(viewerSummary(viewer, profile, device))] : []),
    hasTakenTour ? setupFinishCopy.tourTaken : isTourWanted ? setupFinishCopy.tourOn : setupFinishCopy.tourOff,
  ];
  return (
    <div className='mx-auto flex w-full max-w-xl flex-col gap-5 py-6'>
      <div className='flex flex-col gap-1'>
        <Heading ref={headingRef} level={1} variant='section' tabIndex={-1} className='outline-none'>
          {setupFinishCopy.doneHeading}
        </Heading>
        <p className='text-sm text-muted-foreground'>{setupFinishCopy.doneIntro}</p>
      </div>
      <ul className='flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm' data-testid='setup-summary'>
        {lines.map((line) => (
          <li key={line} className='flex items-start gap-2'>
            <span className='flex h-lh shrink-0 items-center'>
              <Check className='size-4 text-muted-foreground' aria-hidden='true' />
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className='flex flex-wrap gap-2'>
        <Button onClick={onStartBuilding}>{setupFinishCopy.startBuilding}</Button>
        {isDesktop && onOpenFolder !== undefined ? (
          <Button
            variant='outline'
            onClick={() => {
              void onOpenFolder();
            }}
          >
            <FolderOpen />
            {setupFinishCopy.openFolder}
          </Button>
        ) : null}
        {isViewerControlsEnabled && onOpenViewerSettings !== undefined ? (
          <Button variant='outline' onClick={onOpenViewerSettings}>
            {setupFinishCopy.viewerSettings}
          </Button>
        ) : null}
        {hasTakenTour && onReplayTour !== undefined ? (
          <Button variant='outline' onClick={onReplayTour}>
            {tourSwitchCopy.again}
          </Button>
        ) : null}
        <Button variant='ghost' onClick={onChangeAnswers}>
          {setupFinishCopy.changeAnswers}
        </Button>
      </div>
    </div>
  );
}
