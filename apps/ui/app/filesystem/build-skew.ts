/**
 * Build-id skew guard (blueprint DF20).
 *
 * Tabs share one IndexedDB, so a tab left open on an older bundle keeps running
 * its own discovery + garbage-collection logic against state a newer bundle
 * writes. During the Phase-3 flat-layout cutover that produced a silent
 * tug-of-war: the old code deleted configs the new code had just re-minted.
 * `versionchange` only guards schema bumps, not app-logic vintage.
 *
 * Every tab announces its build id on boot; a tab that hears a newer one
 * suspends its durable writes (reads stay fine) and asks the user to reload.
 * Answering an older announcement with our own id is what lets the *older* tab
 * find out — the newer tab may have booted first.
 */

import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

/** Build timestamp injected by `vite.config.ts`; `0` in a context without the define. */
export const buildId: number = typeof tauBuildId === 'number' ? tauBuildId : 0;

let superseded = false;
const supersededTopic = new Topic<void>({ name: 'build-skew' });

const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);

if (channel) {
  // Node keeps the event loop alive for an open channel; browsers have no unref.
  (channel as { unref?: () => void }).unref?.();
  channel.addEventListener('message', (event: MessageEvent) => {
    const other = Number(event.data);
    if (!Number.isFinite(other) || other === buildId) {
      return;
    }
    if (other < buildId) {
      channel.postMessage(buildId);
      return;
    }
    if (!superseded) {
      superseded = true;
      supersededTopic.emit();
    }
  });
  channel.postMessage(buildId);
}

/**
 * `true` once a newer build has been seen in another tab. Durable writes must
 * stop; reads are unaffected.
 */
export const isBuildSuperseded = (): boolean => superseded;

/** Subscribe to the one-way transition into the superseded state. */
export const subscribeBuildSkew = (listener: () => void): (() => void) => {
  return supersededTopic.subscribe(listener);
};
