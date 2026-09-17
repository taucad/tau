import { Topic } from '@taucad/events';
import { useSyncExternalStore } from 'react';

export type ComputeReuseMode = 'off' | 'memory' | 'durable';

const storageKey = 'tau-compute-reuse-mode';
const topic = new Topic<void>({ name: 'compute-reuse-preference' });
/**
 * Reuse is opt-in: the durable store costs more than it saves on a cold open
 * (charter D3), so an unset preference bypasses it. Every kernel-options path
 * derives its mode from here — no caller carries its own default.
 */
const defaultMode: ComputeReuseMode = 'off';

const read = (): ComputeReuseMode => {
  try {
    const value = globalThis.localStorage.getItem(storageKey);
    return value === 'off' || value === 'memory' || value === 'durable' ? value : defaultMode;
  } catch {
    return defaultMode;
  }
};

let mode = read();
let revision = 0;

export const getComputeReuseMode = (): ComputeReuseMode => mode;
export const getComputeReuseRevision = (): number => revision;

export const setComputeReuseMode = (next: ComputeReuseMode): void => {
  if (next === mode) {
    return;
  }
  mode = next;
  revision += 1;
  try {
    globalThis.localStorage.setItem(storageKey, next);
  } catch {
    // The in-memory preference still applies when storage is unavailable.
  }
  topic.emit();
};

const subscribe = (listener: () => void): (() => void) => topic.subscribe(listener);
export const useComputeReuseMode = (): ComputeReuseMode =>
  useSyncExternalStore(subscribe, getComputeReuseMode, getComputeReuseMode);
export const useComputeReuseRevision = (): number =>
  useSyncExternalStore(subscribe, getComputeReuseRevision, getComputeReuseRevision);
