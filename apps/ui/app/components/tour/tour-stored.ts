import { deviceRecordStore, personRecordStores } from '#preferences/person-record.store.js';
import type { StoredTour } from '#machines/tour.machine.js';

/** The guided tour as this browser profile and this device store it. */
export type TourStoredState = Readonly<{ stored: StoredTour; wanted: boolean; paused: boolean }>;

/**
 * Read the stored guided tour: the tips seen and how it ended from the person record, whether one was asked for, and
 * the device's pause.
 *
 * @returns What is stored now.
 */
export const readTourStored = (): TourStoredState => {
  const { tour } = personRecordStores.onboarding.read();
  return {
    stored: tour.ended === undefined ? { seen: tour.seen } : { seen: tour.seen, ended: tour.ended },
    wanted: tour.wanted === true,
    paused: deviceRecordStore.read().tourPaused === true,
  };
};

/**
 * Wake when the stored tour or the device's pause changes, in this tab or another.
 *
 * @param listener - Called on each change.
 * @returns The unsubscribe.
 */
export const subscribeTourStored = (listener: () => void): (() => void) => {
  const stopOnboarding = personRecordStores.onboarding.subscribe(listener);
  const stopDevice = deviceRecordStore.subscribe(listener);
  return () => {
    stopOnboarding();
    stopDevice();
  };
};
