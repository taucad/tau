import type { PersonProfile } from '@taucad/preferences';

/** What step 4 reads and writes. */
export type SetupHowStepProps = Readonly<{
  profile: PersonProfile;
  isDesktop: boolean;
  isWarehouseEnabled: boolean;
  hasTakenTour: boolean;
  isTourWanted: boolean;
  onTourWantedChange: (isWanted: boolean) => void;
  onReplayTour?: () => void;
}>;

/**
 * Step 4, how Tau works. T6.2 fills it in.
 *
 * @param _properties - The profile, host facts and the tour switch.
 * @returns Nothing yet.
 */
export function SetupHowStep(_properties: SetupHowStepProps): React.JSX.Element | undefined {
  return undefined;
}
