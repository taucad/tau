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
import { readBuildId } from '#lib/build-identity.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

/** This build's timestamp (`#lib/build-identity`); `0` in a context without one. */
export const buildId: number = readBuildId();

let superseded = false;
let newestBuildId = buildId;
const supersededTopic = new Topic<void>({ name: 'build-skew' });
const newestBuildTopic = new Topic<void>({ name: 'newest-build' });

/**
 * Mark this build superseded by another one: a newer tab announced it, or the
 * server answered with a different build after a deploy (`#lib/stale-build-recovery`).
 * A rollback serves an older build, which supersedes this one without being newer.
 *
 * @param otherBuildId - The superseding build's id.
 */
export function markBuildSuperseded(otherBuildId: number): void {
  if (otherBuildId > newestBuildId) {
    newestBuildId = otherBuildId;
    newestBuildTopic.emit();
  }
  if (!superseded) {
    superseded = true;
    supersededTopic.emit();
  }
}

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
    markBuildSuperseded(other);
  });
  channel.postMessage(buildId);
}

/**
 * `true` once a newer build has been seen in another tab, or a deploy replaced
 * this one. Durable writes must stop; reads are unaffected.
 */
export const isBuildSuperseded = (): boolean => superseded;

/** The newest build id heard from any tab, or this tab's own when none is newer. */
export const readNewestBuildId = (): number => newestBuildId;

/** Subscribe to each newer build id heard after boot. */
export const subscribeNewestBuildId = (listener: () => void): (() => void) => {
  return newestBuildTopic.subscribe(listener);
};

/** Subscribe to the one-way transition into the superseded state. */
export const subscribeBuildSkew = (listener: () => void): (() => void) => {
  return supersededTopic.subscribe(listener);
};
