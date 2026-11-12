import type { PersonProfile } from '@taucad/preferences';
import { Button } from '@taucad/ui/components/button';
import { Switch } from '@taucad/ui/components/switch';
import { HowTauWorks } from '#components/onboarding/how-tau-works.js';
import { tourSwitchCopy } from '#components/onboarding/setup-copy.js';

/** What step 4 reads and writes. */
export type SetupHowStepProps = Readonly<{
  profile: PersonProfile;
  isDesktop: boolean;
  isWarehouseEnabled: boolean;
  /** `tour.ended` is set, so the switch could never start a guided tour again. */
  hasTakenTour: boolean;
  isTourWanted: boolean;
  onTourWantedChange: (isWanted: boolean) => void;
  onReplayTour?: () => void;
}>;

/**
 * Step 4: Design, Verify, Build and the tour switch (Finding 2, S6). Finish stores the switch in `tour.wanted`. Once
 * the tour has ended the switch is replaced by "You have taken the tour" and "Take it again".
 *
 * @param properties - The profile, the host facts and the tour switch.
 * @returns The step's content.
 */
export function SetupHowStep({
  profile,
  isDesktop,
  isWarehouseEnabled,
  hasTakenTour,
  isTourWanted,
  onTourWantedChange,
  onReplayTour,
}: SetupHowStepProps): React.JSX.Element {
  return (
    <>
      <HowTauWorks profile={profile} isDesktop={isDesktop} isWarehouseEnabled={isWarehouseEnabled} />
      {hasTakenTour ? (
        <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5'>
          <span className='text-sm font-medium'>{tourSwitchCopy.taken}</span>
          <Button variant='outline' size='sm' onClick={onReplayTour} disabled={onReplayTour === undefined}>
            {tourSwitchCopy.again}
          </Button>
        </div>
      ) : (
        <label className='flex items-center justify-between gap-4 rounded-lg border bg-card px-3 py-2.5'>
          <span className='flex min-w-0 flex-col gap-0.5'>
            <span className='text-sm font-medium'>{tourSwitchCopy.title}</span>
            <span className='text-xs text-muted-foreground'>{tourSwitchCopy.hint}</span>
          </span>
          <Switch checked={isTourWanted} onCheckedChange={onTourWantedChange} aria-label={tourSwitchCopy.title} />
        </label>
      )}
    </>
  );
}
