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
 *
 * Newer is not always live: after a rollback the server renders an older build,
 * and a tab still on the replaced newer one would otherwise keep superseding every
 * freshly loaded live tab. So a tab that hears a newer build first asks the server
 * (`/health/build`). When the server names this tab's build, the tab stays and
 * answers `{ buildId, live: true }`, which supersedes the announcer instead; when
 * it names another build, that build is the one to reload into. Without an answer
 * the newer announcement wins, as before.
 */

import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';
import { fetchLiveBuildId, readBuildId } from '#lib/build-identity.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

/** This build's timestamp (`#lib/build-identity`); `0` in a context without one. */
export const buildId: number = readBuildId();

let superseded = false;
let supersedingBuildId = buildId;
const supersededTopic = new Topic<void>({ name: 'build-skew' });
const supersedingBuildTopic = new Topic<void>({ name: 'superseding-build' });

/** Where word of the superseding build came from: another tab, or the server, which is the authority. */
export type BuildSource = 'tab' | 'server';

const recordSupersedingBuild = (otherBuildId: number, source: BuildSource): void => {
  const isFirstRollback = otherBuildId < buildId && supersedingBuildId === buildId;
  const isAuthoritative = source === 'server' && otherBuildId !== supersedingBuildId;
  if (otherBuildId > supersedingBuildId || isFirstRollback || isAuthoritative) {
    supersedingBuildId = otherBuildId;
    supersedingBuildTopic.emit();
  }
};

/**
 * Record the build the server renders pages for, as soon as it is known, so the
 * prompt names it (a rollback included) before anything is superseded.
 *
 * @param liveBuildId - The server's build id (`/health/build`).
 */
export function recordLiveBuild(liveBuildId: number): void {
  if (liveBuildId !== buildId) {
    recordSupersedingBuild(liveBuildId, 'server');
  }
}

/**
 * Mark this build superseded by another one: a newer tab announced it, or the
 * server answered with a different build after a deploy (`#lib/stale-build-recovery`).
 * A rollback serves an older build, which supersedes this one without being newer;
 * a newer tab heard later still outranks it, but the server's word always stands.
 *
 * @param otherBuildId - The superseding build's id.
 * @param source - Who said so; defaults to another tab.
 */
export function markBuildSuperseded(otherBuildId: number, source: BuildSource = 'tab'): void {
  recordSupersedingBuild(otherBuildId, source);
  if (!superseded) {
    superseded = true;
    supersededTopic.emit();
  }
}

/** A tab whose build the server confirmed live; it supersedes whoever hears it. */
type LiveAnnouncement = { readonly buildId: number; readonly live: true };

const isLiveAnnouncement = (message: unknown): message is LiveAnnouncement =>
  typeof message === 'object' && message !== null && 'live' in message && message.live === true;

const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);

if (channel) {
  // Node keeps the event loop alive for an open channel; browsers have no unref.
  (channel as { unref?: () => void }).unref?.();
  const resolveNewerAnnouncement = async (other: number): Promise<void> => {
    let liveBuildId: number | undefined;
    try {
      liveBuildId = await fetchLiveBuildId();
    } catch {
      liveBuildId = undefined;
    }
    if (liveBuildId === buildId) {
      channel.postMessage({ buildId, live: true } satisfies LiveAnnouncement);
      return;
    }
    if (liveBuildId === undefined) {
      markBuildSuperseded(other);
      return;
    }
    markBuildSuperseded(liveBuildId, 'server');
  };
  channel.addEventListener('message', (event: MessageEvent) => {
    const message: unknown = event.data;
    const isLive = isLiveAnnouncement(message);
    const other = Number(isLive ? message.buildId : message);
    if (!Number.isFinite(other) || other === buildId) {
      return;
    }
    if (isLive) {
      markBuildSuperseded(other, 'server');
      return;
    }
    if (other < buildId) {
      channel.postMessage(buildId);
      return;
    }
    // async-iife: bootstrap -- a channel listener cannot await; the answer acts on its own.
    void resolveNewerAnnouncement(other);
  });
  channel.postMessage(buildId);
}

/**
 * `true` once a newer build has been seen in another tab, or a deploy replaced
 * this one. Durable writes must stop; reads are unaffected.
 */
export const isBuildSuperseded = (): boolean => superseded;

/**
 * The build that superseded this one: the newest heard from any tab, or the build a
 * rollback serves (older than this one). This tab's own id while nothing superseded it.
 */
export const readSupersedingBuildId = (): number => supersedingBuildId;

/** Subscribe to each change of the superseding build. */
export const subscribeSupersedingBuildId = (listener: () => void): (() => void) => {
  return supersedingBuildTopic.subscribe(listener);
};

/** The prompt shared by every surface that offers the reload. */
export const describeSupersession = (superseding: number): string =>
  superseding < buildId
    ? 'This version of Tau has been replaced. Reload to continue with the current version.'
    : 'A newer version of Tau is available. Reload to continue with the latest version.';

/** Subscribe to the one-way transition into the superseded state. */
export const subscribeBuildSkew = (listener: () => void): (() => void) => {
  return supersededTopic.subscribe(listener);
};
