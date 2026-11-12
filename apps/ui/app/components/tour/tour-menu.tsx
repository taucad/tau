/**
 * Help's one tour item, which changes with the tour's state, and the replay that Help, the command palette and setup's
 * "Take it again" share. In the main bundle: nothing here loads the tour.
 */

import { useCallback, useSyncExternalStore } from 'react';
import { Compass, Pause, Play, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { tourStepIds } from '@taucad/preferences';
import type { TourStepId } from '@taucad/preferences';
import { DropdownMenuItem } from '@taucad/ui/components/dropdown-menu';
import { tourChromeCopy, tourMenuCopy } from '#components/tour/tour-copy.js';
import { tourSession } from '#components/tour/tour-session.js';
import { useFeature } from '#flags/use-feature.js';
import { useProjects } from '#hooks/use-projects.js';
import { nextGuidedTipNumber } from '#machines/tour.machine.js';
import { personRecordStores } from '#preferences/person-record.store.js';
import { useDeviceRecord } from '#preferences/use-device-record.js';
import { usePersonRecord } from '#preferences/use-person-record.js';
import { useOnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';
import { projectUrl } from '#utils/project-url.utils.js';

/** What Help's tour item does now. */
export type TourMenuItem = Readonly<{
  kind: 'pause' | 'resume' | 'close' | 'take';
  label: string;
  run: () => void;
}>;

/**
 * Start a replay. On a project page it starts there; elsewhere it opens the most recently active project first.
 *
 * @returns The action, or `undefined` when there is no project to take the tour in.
 */
export const useTourReplay = (): (() => void) | undefined => {
  const parameters = useParams();
  const navigate = useNavigate();
  const { projects } = useProjects();
  const isInProject = parameters['workspace'] !== undefined && parameters['project'] !== undefined;
  let latest: (typeof projects)[number] | undefined;
  for (const project of projects) {
    if (project.slugs !== undefined && (latest === undefined || project.lastActivityAt > latest.lastActivityAt)) {
      latest = project;
    }
  }
  const slugs = latest?.slugs;
  const replayInLatest = useCallback(() => {
    if (slugs === undefined) {
      return;
    }
    tourSession.requestReplay();
    void navigate(projectUrl(slugs));
  }, [navigate, slugs]);
  if (isInProject) {
    return tourSession.requestReplay;
  }
  return slugs === undefined ? undefined : replayInLatest;
};

/**
 * Help's tour item by state: Close tour during a replay, Pause tour while a guided tour runs, Resume tour while it is
 * paused on this device, and Take the tour otherwise. Pause and resume write the device record, which the tour, loaded
 * or not, follows.
 *
 * @param replay - What Take the tour does, or `undefined` when there is no project to take it in.
 * @returns The item, or `undefined` with the flag off or no project to take the tour in.
 */
export const useTourMenuItem = (replay: (() => void) | undefined): TourMenuItem | undefined => {
  const isOnboardingEnabled = useFeature('onboarding');
  const { onboarding } = usePersonRecord();
  const { device, writeDevice } = useDeviceRecord();
  const telemetry = useOnboardingTelemetry();
  const session = useSyncExternalStore(tourSession.subscribe, tourSession.read, tourSession.readInitial);
  if (!isOnboardingEnabled) {
    return undefined;
  }
  if (session.isReplay) {
    return { kind: 'close', label: tourMenuCopy.close, run: tourSession.endReplay };
  }
  const { tour } = onboarding;
  if (tour.wanted === true && tour.ended === undefined) {
    /* Read at the press, so a palette entry registered earlier reports the tip the tour is on now. */
    const currentTip = (): Readonly<{ number: number; step: TourStepId }> => {
      const number = nextGuidedTipNumber({ seen: personRecordStores.onboarding.read().tour.seen });
      return { number, step: tourStepIds[number - 1] ?? 'build' };
    };
    return device.tourPaused === true
      ? {
          kind: 'resume',
          label: tourMenuCopy.resume(nextGuidedTipNumber({ seen: tour.seen })),
          run: () => {
            writeDevice({ tourPaused: false });
            telemetry.tourResumed({ mode: 'guided', step: currentTip().step });
          },
        }
      : {
          kind: 'pause',
          label: tourMenuCopy.pause,
          run: () => {
            const tip = currentTip();
            writeDevice({ tourPaused: true });
            telemetry.tourPaused({ mode: 'guided', step: tip.step });
            tourSession.announce(tourChromeCopy.paused(tip.number));
          },
        };
  }
  return replay === undefined ? undefined : { kind: 'take', label: tourMenuCopy.take, run: replay };
};

/** Each state's icon, shared by Help and the command palette. */
export const tourMenuIcons = { pause: Pause, resume: Play, close: X, take: Compass } as const;

/**
 * Help's tour item.
 *
 * @returns The menu item, or nothing.
 */
export function TourHelpMenuItem(): React.JSX.Element | undefined {
  const item = useTourMenuItem(useTourReplay());
  if (item === undefined) {
    return undefined;
  }
  const Icon = tourMenuIcons[item.kind];
  return (
    <DropdownMenuItem data-testid='help-tour-item' onSelect={item.run}>
      <Icon />
      {item.label}
    </DropdownMenuItem>
  );
}
