import type { DeviceRecord, PersonProfile, ViewerPreferences } from '@taucad/preferences';
import { Heading } from '@taucad/ui/components/heading';
import { Button } from '@taucad/ui/components/button';
import { setupFinishCopy } from '#components/onboarding/setup-copy.js';

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
  onOpenFolder?: () => void;
  onChangeAnswers: () => void;
}>;

/**
 * The screen after Finish. T6.2 adds the summary and the host's actions.
 *
 * @param properties - What to summarise and the leaving actions.
 * @returns The screen.
 */
export function SetupFinish({ headingRef, onStartBuilding }: SetupFinishProps): React.JSX.Element {
  return (
    <div className='mx-auto flex w-full max-w-xl flex-col gap-5 py-6'>
      <Heading ref={headingRef} level={1} variant='section' tabIndex={-1} className='outline-none'>
        {setupFinishCopy.doneHeading}
      </Heading>
      <div className='flex flex-wrap gap-2'>
        <Button onClick={onStartBuilding}>{setupFinishCopy.startBuilding}</Button>
      </div>
    </div>
  );
}
