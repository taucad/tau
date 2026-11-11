import { Topic } from '@taucad/events';
import { useSyncExternalStore } from 'react';

export type RemoteComputePlacement =
  | { readonly state: 'local' }
  | {
      readonly state: 'connecting' | 'remote' | 'device-offline' | 'busy' | 'version-mismatch' | 'disconnected';
      readonly deviceId: string;
      readonly message?: string;
    };

let placement: RemoteComputePlacement = { state: 'local' };
let selectionRevision = 0;
const placementTopic = new Topic<void>({ name: 'remote-compute-placement' });

const publish = (next: RemoteComputePlacement): void => {
  placement = next;
  placementTopic.emit();
};

export const getRemoteComputePlacement = (): RemoteComputePlacement => placement;
export const getRemoteComputeSelectionRevision = (): number => selectionRevision;

export const setRemoteComputePlacement = (next: RemoteComputePlacement): void => {
  publish(next);
};

export const selectRemoteComputeDevice = (deviceId: string): void => {
  selectionRevision += 1;
  publish({ state: 'connecting', deviceId });
};

export const selectLocalCompute = (): void => {
  selectionRevision += 1;
  publish({ state: 'local' });
};

export const useRemoteComputePlacement = (): RemoteComputePlacement =>
  useSyncExternalStore(
    (listener) => placementTopic.subscribe(listener),
    getRemoteComputePlacement,
    getRemoteComputePlacement,
  );

export const useRemoteComputeSelectionRevision = (): number =>
  useSyncExternalStore(
    (listener) => placementTopic.subscribe(listener),
    getRemoteComputeSelectionRevision,
    getRemoteComputeSelectionRevision,
  );
