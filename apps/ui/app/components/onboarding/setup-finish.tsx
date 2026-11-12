import { Check, FolderOpen } from 'lucide-react';
import type { DeviceRecord, PersonProfile, ViewerPreferences } from '@taucad/preferences';
import { Button } from '@taucad/ui/components/button';
import { Heading } from '@taucad/ui/components/heading';
import { goalCopy, setupFinishCopy, summaryMakesText, summaryViewerText } from '#components/onboarding/setup-copy.js';
import { viewerSummary } from '#components/onboarding/setup-model.js';

/** What the screen after Finish reads. */
export type SetupFinishProps = Readonly<{
  headingRef: React.Ref<HTMLHeadingElement>;
  profile: PersonProfile;
  viewer: ViewerPreferences;
  device: DeviceRecord;
  isTourWanted: boolean;
  isDesktop: boolean;
  isViewerControlsEnabled: boolean;
  onStartBuilding: () => void;
  /** Desktop only: open a folder of projects. */
  onOpenFolder?: () => Promise<void>;
  /** Open Settings → Viewer; absent while that section does not exist. */
  onOpenViewerSettings?: () => void;
  onChangeAnswers: () => void;
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
  isDesktop,
  isViewerControlsEnabled,
  onStartBuilding,
  onOpenFolder,
  onOpenViewerSettings,
  onChangeAnswers,
}: SetupFinishProps): React.JSX.Element {
  const goals =
    profile.goals.length === 0
      ? setupFinishCopy.nothingChosen
      : profile.goals.map((goal) => goalCopy[goal].label.toLowerCase()).join(', ');
  const lines = [
    summaryMakesText(goals),
    ...(isViewerControlsEnabled ? [summaryViewerText(viewerSummary(viewer, profile, device))] : []),
    isTourWanted ? setupFinishCopy.tourOn : setupFinishCopy.tourOff,
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
            <Check className='mt-0.5 size-4 shrink-0 text-muted-foreground' aria-hidden='true' />
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
        <Button variant='ghost' onClick={onChangeAnswers}>
          {setupFinishCopy.changeAnswers}
        </Button>
      </div>
    </div>
  );
}
