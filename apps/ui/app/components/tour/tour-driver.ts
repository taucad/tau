/**
 * The tour's host side, outside React: it connects the tour actor to the editor's signals, writes what the tour emits
 * to the person and device records, reports it to telemetry, announces it, and keeps a replay in step with the page's
 * tour session. It runs as a callback actor beside the tour, so it opens when the tour does and closes with it.
 */

import { createCallbackLogic } from 'xstate';
import type { DeviceRecord, LeafPatch, OnboardingDelta, TourStepId } from '@taucad/preferences';
import { tourStepIds } from '@taucad/preferences';
import { tourChromeCopy, tourTipTitle } from '#components/tour/tour-copy.js';
import type { TourSessionSnapshot } from '#components/tour/tour-session.js';
import { connectTourSignals } from '#components/tour/tour-signals.js';
import type { TourSignalSources } from '#components/tour/tour-signals.js';
import type { TourArrival, TourMachineEmitted, TourMachineEvent } from '#machines/tour.machine.js';
import type { OnboardingTelemetry } from '#telemetry/onboarding-telemetry.js';

/** The part of the tour actor the driver uses. */
export type DrivenTour = Readonly<{
  send: (event: TourMachineEvent) => void;
  on: (type: '*', handler: (emitted: TourMachineEmitted) => void) => Readonly<{ unsubscribe: () => void }>;
  getSnapshot: () => Readonly<{
    matches: (state: 'replay') => boolean;
    context: Readonly<{ arrival: TourArrival | undefined }>;
  }>;
}>;

/** Where the driver writes and reports. */
export type TourDriverPorts = Readonly<{
  writeOnboarding: (delta: OnboardingDelta) => unknown;
  writeDevice: (patch: LeafPatch<DeviceRecord>) => unknown;
  telemetry: Pick<
    OnboardingTelemetry,
    'tourStarted' | 'tourStepShown' | 'tourStepSeen' | 'tourPaused' | 'tourResumed' | 'tourDismissed' | 'tourCompleted'
  >;
  session: Readonly<{
    read: () => TourSessionSnapshot;
    subscribe: (listener: () => void) => () => void;
    endReplay: () => void;
    announce: (text: string) => void;
  }>;
}>;

/** What the driver is started with. */
export type TourDriverInput = Readonly<{
  tour: DrivenTour;
  sources: TourSignalSources;
  ports: TourDriverPorts;
}>;

const tipNumber = (step: TourStepId): number => tourStepIds.indexOf(step) + 1;

const selectArrival = (tour: DrivenTour): TourArrival => tour.getSnapshot().context.arrival ?? 'empty';

const selectIsReplaying = (tour: DrivenTour): boolean => tour.getSnapshot().matches('replay');

/**
 * Start driving the tour. Emitted events are heard before the signals send the first report of the facts, which is
 * when the tour first shows or reports anything.
 *
 * @param input - The tour, the editor's owners and the ports.
 * @returns The cleanup, which closes every subscription.
 */
export const startTourDriver = ({ tour, sources, ports }: TourDriverInput): (() => void) => {
  const { telemetry, session } = ports;
  /* Set while the tour itself ends a replay, so the session change that follows is not read as a close. */
  let isEndingReplay = false;

  const onEmitted = (emitted: TourMachineEmitted): void => {
    switch (emitted.type) {
      case 'started': {
        telemetry.tourStarted({ mode: emitted.mode });
        return;
      }
      case 'shown': {
        telemetry.tourStepShown({ mode: emitted.mode, step: emitted.step });
        const title = tourTipTitle(emitted.step, { mode: emitted.mode, arrival: selectArrival(tour) });
        session.announce(tourChromeCopy.announceTip(tipNumber(emitted.step) - 1, title, emitted.mode));
        return;
      }
      case 'seen': {
        if (emitted.mode === 'guided') {
          ports.writeOnboarding({ seenAdd: [emitted.step] });
        }
        /* A tip passed over was never seen by anyone, so it is stored but not reported. */
        if (emitted.by !== 'passedOver') {
          telemetry.tourStepSeen({ mode: emitted.mode, step: emitted.step, by: emitted.by });
        }
        return;
      }
      case 'pausedChanged': {
        ports.writeDevice({ tourPaused: emitted.paused });
        if (emitted.paused) {
          telemetry.tourPaused({ mode: 'guided', step: emitted.step });
          session.announce(tourChromeCopy.paused(tipNumber(emitted.step)));
        } else {
          telemetry.tourResumed({ mode: 'guided', step: emitted.step });
        }
        return;
      }
      case 'ended': {
        ports.writeOnboarding({ ended: emitted.ending });
        if (emitted.ending === 'completed') {
          telemetry.tourCompleted({ mode: 'guided' });
          session.announce(tourChromeCopy.finished);
        } else {
          telemetry.tourDismissed({ mode: 'guided', step: emitted.step ?? 'build' });
          session.announce(tourChromeCopy.skipped);
        }
        return;
      }
      case 'replayEnded': {
        if (emitted.completed) {
          telemetry.tourCompleted({ mode: 'replay' });
          session.announce(tourChromeCopy.finished);
        } else {
          telemetry.tourDismissed({ mode: 'replay', step: emitted.step ?? 'ask' });
          session.announce(tourChromeCopy.replayClosed);
        }
        isEndingReplay = true;
        session.endReplay();
        isEndingReplay = false;
      }
    }
  };

  const emittedSubscription = tour.on('*', onEmitted);
  /* A replay asked for, or closed, from Help or the palette while the tour is loaded. */
  const stopSession = session.subscribe(() => {
    if (isEndingReplay) {
      return;
    }
    const { isReplay } = session.read();
    const isInReplay = selectIsReplaying(tour);
    if (isReplay && !isInReplay) {
      tour.send({ type: 'replayStarted' });
    } else if (!isReplay && isInReplay) {
      tour.send({ type: 'replayClosed' });
    }
  });
  const stopSignals = connectTourSignals(sources, (event) => {
    tour.send(event);
  });

  return () => {
    stopSignals();
    stopSession();
    emittedSubscription.unsubscribe();
  };
};

/** {@link startTourDriver} as a callback actor, for `useActorRef` beside the tour. */
export const tourDriverLogic = createCallbackLogic<{ type: 'never' }, TourDriverInput>(({ input }) =>
  startTourDriver(input),
);
