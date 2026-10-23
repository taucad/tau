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
 * suspends its durable writes at once (reads stay fine) and asks the user to
 * reload. Answering an older announcement with our own id is what lets the
 * *older* tab find out — the newer tab may have booted first.
 *
 * Newer is not always live: after a rollback the server renders an older build,
 * and a tab still on the replaced newer one would otherwise keep superseding every
 * freshly loaded live tab. So the write stop a peer's announcement causes is
 * provisional until the tab has asked the server (`/health/build`) itself:
 *
 * - The server names this tab's build: the stop is lifted and the tab answers
 *   `{ buildId, live: true }`, so the announcer checks in turn and steps aside.
 * - The server names another build: the tab is superseded by that build. It asks
 *   `serverConfirmations` more times, a `peerRecheckDelay` apart, in case an edge was
 *   answering for a build it is leaving, and resumes if the server then names its build.
 * - No answer: the peer's word stands and the tab is superseded by it, but only
 *   until the server answers. The tab asks again every `peerRecheckDelay` and on the
 *   next announcement; when the server then names this build, the tab resumes.
 * - No build endpoint (desktop and `tau serve` answer with their SPA document): the
 *   newer announcement wins, as it did before, and nothing is asked again.
 *
 * A tab answers older announcements while it still writes, so the older tab stops;
 * once superseded it stays silent and a live tab answers instead.
 *
 * A peer's `live` claim is checked the same way, never taken on trust. Once the
 * server has spoken, its build outranks anything a tab says.
 *
 * A deploy noticed in a lone tab (`#lib/stale-build-recovery`) only offers the
 * reload: no other bundle shares storage, so writes go on until the user reloads.
 */

import { Topic } from '@taucad/events';
import { metaConfig } from '#constants/meta.constants.js';
import { askLiveBuild, readBuildId } from '#lib/build-identity.js';
import type { LiveBuildAnswer } from '#lib/build-identity.js';

const channelName = `${metaConfig.databasePrefix}build-id`;

/** This build's timestamp (`#lib/build-identity`); `0` in a context without one. */
export const buildId: number = readBuildId();

/** Where word of the superseding build came from: another tab, or the server, which is the authority. */
type BuildSource = 'tab' | 'server';

type Superseding = { readonly buildId: number; readonly source: BuildSource };

/**
 * What the server last said about this build, after the confirmation rule: `live` once it named this
 * build, `replaced` once it named another, `unknown` before it said either. `#lib/stale-build-recovery`
 * derives every module load failure's outcome from it, so one answer reaches every consumer at once.
 */
export type ServerVerdict = 'live' | 'replaced' | 'unknown';

/**
 * Where this tab stands. One phase at a time, each with its own timer:
 *
 * - `idle`: this tab writes and offers nothing.
 * - `offered`: a deploy replaced this build in a lone tab; the reload is offered, writes go on.
 * - `provisional`: a peer announced another build; writes stop until the server answers, then the
 *   tab returns to `resumeTo` if the claim does not stand.
 * - `peer-superseded`: only a peer's word supersedes this tab (no server answer). With `recheck`
 *   (the server could not be reached) it asks again every `peerRecheckDelay`.
 * - `server-confirming`: the server's word is changing `towards` another build (`replaced`) or back
 *   to this one (`live`); it asks `checksLeft` more times, a `peerRecheckDelay` apart, because an edge
 *   may answer for a build it is leaving. Entering and leaving supersession follow the same rule.
 * - `server-superseded`: the server's word stands; it is asked again only when a tab on this build
 *   announces itself (a rollback undone).
 *
 * `superseding` is the build the prompt names, kept across phases: the server's word outranks a tab's.
 * `vouches` says whether this tab announces itself live when the server names its build again. It
 * does after a plain announcement or a deploy offer, so the announcer checks in turn, but never in
 * answer to another tab's live claim: two tabs whose edges disagree would otherwise answer each
 * other's claims for ever.
 */
type SkewPhase =
  | { readonly phase: 'idle' }
  | { readonly phase: 'offered' }
  | { readonly phase: 'provisional'; readonly resumeTo: 'idle' | 'offered' }
  | { readonly phase: 'peer-superseded'; readonly claimedBuildId: number; readonly recheck: boolean }
  | { readonly phase: 'server-confirming'; readonly checksLeft: number; readonly towards: 'replaced' | 'live' }
  | { readonly phase: 'server-superseded' };

type SkewState = SkewPhase & {
  readonly superseding: Superseding | undefined;
  readonly vouches: boolean;
  readonly server: ServerVerdict;
  /**
   * A verdict change under way in a phase that keeps writing (a lone tab): the answers still needed,
   * by the same rule as `server-confirming`, before `server` turns `towards`.
   */
  readonly pending: { readonly towards: 'live' | 'replaced'; readonly checksLeft: number } | undefined;
};

/** Something that moves the state: a server answer, a peer's claim or an offer. */
type SkewEvent =
  | { readonly type: 'offer'; readonly buildId: number }
  | { readonly type: 'peer-claim'; readonly isLive: boolean }
  | {
      readonly type: 'answer';
      readonly answer: LiveBuildAnswer;
      /** The build a peer claimed, when a peer's claim prompted the question. */
      readonly claimedBuildId: number | undefined;
    };

/** Milliseconds between server checks while this tab is superseded only on a peer's word. */
export const peerRecheckDelay = 30_000;

/**
 * Milliseconds between the confirmations a lookup asks for itself ({@link queryLiveBuild}): a page
 * whose chunk failed cannot wait the background recheck's 30 s twice, since it may reload on its own
 * only within the first 15 s (`autoReloadWindow`).
 */
export const lookupConfirmDelay = 1000;

/**
 * Further answers needed before the server's word changes: during a deploy or rollback an edge may
 * briefly answer for the build it is leaving, so the tab asks again before the answer stands, in
 * either direction; writes stay stopped meanwhile.
 */
export const serverConfirmations = 2;

let state: SkewState = { phase: 'idle', superseding: undefined, vouches: false, server: 'unknown', pending: undefined };
/** Bumped on each phase change, so a server answer asked for an earlier phase is not applied to this one. */
let epoch = 0;
let phaseTimer: ReturnType<typeof setTimeout> | undefined;

const writeStopTopic = new Topic<void>({ name: 'build-skew' });
const reloadOfferTopic = new Topic<void>({ name: 'build-reload-offer' });
const supersedingBuildTopic = new Topic<void>({ name: 'superseding-build' });
const serverVerdictTopic = new Topic<void>({ name: 'server-verdict' });

/** A verdict change still awaits its confirmations. */
const isConfirming = (current: SkewState): boolean =>
  current.pending !== undefined || current.phase === 'server-confirming';

const stopsWrites = (current: SkewState): boolean => current.phase !== 'idle' && current.phase !== 'offered';

/** Writes have stopped on a word that stands (a peer's unanswered claim, or the server's): not merely provisional. */
const hasStopped = (current: SkewState): boolean =>
  current.phase === 'peer-superseded' || current.phase === 'server-confirming' || current.phase === 'server-superseded';

/** Confirming this build after a peer's claim, with nothing saying another build replaced it. */
const isConfirmingOwnBuild = (current: SkewState): boolean =>
  current.phase === 'server-confirming' && current.towards === 'live' && current.server !== 'replaced';

const offers = (current: SkewState): boolean =>
  current.phase === 'offered' ||
  (current.phase === 'provisional' && current.resumeTo === 'offered') ||
  (hasStopped(current) && !isConfirmingOwnBuild(current));

const supersedingOf = (current: SkewState): number => current.superseding?.buildId ?? buildId;

/** `true` while durable writes must stop: another bundle owns storage, or may (provisionally). Reads are unaffected. */
export const isBuildSuperseded = (): boolean => stopsWrites(state);

/** `true` while the reload is offered: another bundle owns storage, or a deploy replaced this build. */
export const isReloadOffered = (): boolean => offers(state);

/** `true` once writes have stopped on a word that stands: not while a peer's claim awaits the server, nor for an offer alone. */
export const haveWritesStopped = (): boolean => hasStopped(state);

/** What the server last said about this build ({@link ServerVerdict}). */
export const readServerVerdict = (): ServerVerdict => state.server;

/** The superseding build after `source` names `otherBuildId`: the server outranks a tab, a newer tab an earlier one. */
const nameSuperseding = (
  current: Superseding | undefined,
  otherBuildId: number,
  source: BuildSource,
): Superseding | undefined => {
  if (source === 'server') {
    return { buildId: otherBuildId, source };
  }
  return current === undefined || (current.source === 'tab' && otherBuildId > current.buildId)
    ? { buildId: otherBuildId, source }
    : current;
};

/** The single transition function: the next state for `event`, or `current` when nothing changes. */
const reduce = (current: SkewState, event: SkewEvent): SkewState => {
  switch (event.type) {
    case 'offer': {
      const superseding =
        event.buildId === buildId ? current.superseding : nameSuperseding(current.superseding, event.buildId, 'server');
      if (current.phase === 'idle') {
        return { ...current, phase: 'offered', superseding, vouches: true };
      }
      if (current.phase === 'provisional') {
        return { ...current, resumeTo: 'offered', superseding, vouches: true };
      }
      return { ...current, superseding, vouches: true };
    }
    case 'peer-claim': {
      const vouches = current.vouches || !event.isLive;
      if (current.phase === 'idle' || current.phase === 'offered') {
        return { ...commonOf(current), phase: 'provisional', resumeTo: current.phase, vouches };
      }
      return vouches === current.vouches ? current : { ...current, vouches };
    }
    case 'answer': {
      return settle(current, event.answer, event.claimedBuildId);
    }
  }
};

type Common = Pick<SkewState, 'superseding' | 'vouches' | 'server' | 'pending'>;

const commonOf = (current: SkewState): Common => ({
  superseding: current.superseding,
  vouches: current.vouches,
  server: current.server,
  pending: current.pending,
});

/** The server named this build, and the confirmation rule (if any) is met: everything else is void. */
const live = (): SkewState => ({
  phase: 'idle',
  superseding: undefined,
  vouches: false,
  server: 'live',
  pending: undefined,
});

/** Act on the server's answer about which build is live (`#lib/build-identity`). */
const settle = (current: SkewState, answer: LiveBuildAnswer, claimedBuildId: number | undefined): SkewState => {
  const common = commonOf(current);
  if (answer === buildId) {
    if (current.phase === 'server-superseded') {
      // Leaving supersession takes as many answers as entering it did.
      return { ...common, phase: 'server-confirming', towards: 'live', checksLeft: serverConfirmations };
    }
    if (current.phase === 'server-confirming') {
      if (current.towards === 'replaced') {
        return { ...common, phase: 'server-confirming', towards: 'live', checksLeft: serverConfirmations };
      }
      const checksLeft = current.checksLeft - 1;
      return checksLeft > 0 ? { ...common, phase: 'server-confirming', towards: 'live', checksLeft } : live();
    }
    if (current.phase === 'provisional' || current.phase === 'peer-superseded') {
      /* A peer's claim stopped writes: they resume only once the server has named this build as
       * often as it must name another to supersede it (DF20), never on one answer an edge leaving a
       * build may give. */
      return { ...common, phase: 'server-confirming', towards: 'live', checksLeft: serverConfirmations };
    }
    if (current.server === 'replaced') {
      /* The server had named another build: leaving that word takes as many answers as entering
       * it did, writes going on meanwhile (an edge may answer for a build it is leaving). */
      const checksLeft = current.pending?.towards === 'live' ? current.pending.checksLeft - 1 : serverConfirmations;
      if (checksLeft > 0) {
        return { ...common, phase: current.phase, pending: { towards: 'live', checksLeft } };
      }
    }
    // The server named this build live: whatever rested on a peer's word or a deploy offer is void.
    return live();
  }
  if (typeof answer === 'number') {
    // The prompt names the build at once; the verdict turns `replaced` only once confirmed.
    // An answer naming another build puts an earlier `live` in doubt until the confirmations settle it.
    const doubted: Common = { ...common, server: current.server === 'live' ? 'unknown' : current.server };
    const named: Common = { ...doubted, superseding: { buildId: answer, source: 'server' }, pending: undefined };
    const replaced: Common = { ...named, server: 'replaced' };
    switch (current.phase) {
      case 'server-superseded': {
        return { ...replaced, phase: 'server-superseded' };
      }
      case 'server-confirming': {
        if (current.towards === 'live') {
          /* Turning back towards another build follows the same rule as every transition: a
           * supersession already confirmed stands; otherwise the confirmations start again. */
          return current.server === 'replaced'
            ? { ...replaced, phase: 'server-superseded' }
            : { ...named, phase: 'server-confirming', towards: 'replaced', checksLeft: serverConfirmations };
        }
        const checksLeft = current.checksLeft - 1;
        return checksLeft > 0
          ? { ...named, phase: 'server-confirming', towards: 'replaced', checksLeft }
          : { ...replaced, phase: 'server-superseded' };
      }
      case 'provisional':
      case 'peer-superseded': {
        // A peer shares storage: writes stop now; the verdict follows once the confirmations agree.
        return { ...named, phase: 'server-confirming', towards: 'replaced', checksLeft: serverConfirmations };
      }
      case 'idle':
      case 'offered': {
        // A lone tab: entering `replaced` takes the same answers as leaving it, writes going on.
        if (current.server === 'replaced') {
          return { ...replaced, phase: current.phase };
        }
        const checksLeft =
          current.pending?.towards === 'replaced' ? current.pending.checksLeft - 1 : serverConfirmations;
        // Once confirmed, the reload is offered at once, whether or not a failure is waiting for it.
        return checksLeft > 0
          ? { ...doubted, phase: current.phase, pending: { towards: 'replaced', checksLeft } }
          : { ...replaced, phase: 'offered', vouches: true };
      }
    }
  }
  if (current.phase === 'server-superseded') {
    return current;
  }
  if (current.phase === 'server-confirming') {
    /* An unanswered check settles nothing either way: the tab keeps asking, since only a confirmed
     * `replaced` verdict may end in a phase that asks no more. */
    return current;
  }
  if (claimedBuildId === undefined || current.phase === 'idle' || current.phase === 'offered') {
    return current;
  }
  /* Without the server's word only a newer build stops this tab, as before there was a server to
   * ask: a peer claiming an older build is live never does (no endpoint on desktop or `tau serve`,
   * or a server that cannot be reached). */
  if (claimedBuildId < buildId) {
    return current.phase === 'provisional'
      ? { ...common, phase: current.resumeTo, vouches: current.vouches && current.resumeTo === 'offered' }
      : current;
  }
  const claimed =
    current.phase === 'peer-superseded' ? Math.max(current.claimedBuildId, claimedBuildId) : claimedBuildId;
  return {
    ...common,
    phase: 'peer-superseded',
    claimedBuildId: claimed,
    recheck: answer === 'unreachable',
    superseding: nameSuperseding(current.superseding, claimedBuildId, 'tab'),
    // A newer peer while the server says nothing: an earlier `live` is no longer known to hold.
    server: current.server === 'live' ? 'unknown' : current.server,
    pending: undefined,
  };
};

/** A tab whose build the server confirmed live; whoever hears it checks with the server in turn. */
type LiveAnnouncement = { readonly buildId: number; readonly live: true };

const isLiveAnnouncement = (message: unknown): message is LiveAnnouncement =>
  typeof message === 'object' && message !== null && 'live' in message && message.live === true;

const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(channelName);

/** Ask the server which build is live and apply the answer, unless the phase changed while it was asked. */
const askServer = async (claimedBuildId: number | undefined): Promise<void> => {
  const askedIn = epoch;
  const answer = await askLiveBuild();
  if (askedIn === epoch) {
    dispatch({ type: 'answer', answer, claimedBuildId });
  }
};

/** The timer a phase runs while it lasts: rechecks for a peer's unanswered word and for the confirmations. */
const startPhaseTimer = (current: SkewState): void => {
  const isRechecking =
    (current.phase === 'peer-superseded' && current.recheck) ||
    current.phase === 'server-confirming' ||
    current.pending !== undefined;
  if (!isRechecking) {
    return;
  }
  const claimedBuildId = current.phase === 'peer-superseded' ? current.claimedBuildId : undefined;
  phaseTimer = setTimeout(() => {
    phaseTimer = undefined;
    // async-iife: bootstrap -- a timer cannot await; the check acts on its own.
    void askServer(claimedBuildId);
  }, peerRecheckDelay);
};

/** Apply `event`, run the new phase's timer, and tell each subscriber whose derived value changed. */
const dispatch = (event: SkewEvent): void => {
  const before = state;
  const next = reduce(before, event);
  if (next === before) {
    // An answer that changes nothing (no reply while confirming) still owes the next recheck.
    if (event.type === 'answer' && phaseTimer === undefined) {
      startPhaseTimer(state);
    }
    return;
  }
  state = next;
  // A phase entered again (another check, a later unanswered recheck) restarts its timer too.
  if (next.phase !== before.phase || event.type === 'answer') {
    epoch += 1;
    clearTimeout(phaseTimer);
    phaseTimer = undefined;
    startPhaseTimer(next);
  }
  if (supersedingOf(next) !== supersedingOf(before)) {
    supersedingBuildTopic.emit();
  }
  if (stopsWrites(next) !== stopsWrites(before)) {
    writeStopTopic.emit();
  }
  // The offer topic also marks when writes stop for good, which makes an offer urgent (`BrowserUpdate`).
  if (offers(next) !== offers(before) || hasStopped(next) !== hasStopped(before)) {
    reloadOfferTopic.emit();
  }
  /* Writes resumed because the server named this build: tell the peer whose claim stopped them, so
   * it checks in turn (DF20). Keyed on the writes resuming, whatever phase they resume into; never
   * in answer to a live claim (`vouches`), which bounds two tabs behind disagreeing edges. */
  const resumedWrites = stopsWrites(before) && !stopsWrites(next);
  if (resumedWrites && before.vouches && event.type === 'answer' && event.answer === buildId) {
    channel?.postMessage({ buildId, live: true } satisfies LiveAnnouncement);
  } else if (resumedWrites && event.type === 'answer' && typeof event.answer !== 'number') {
    // Resumed without the server, over an older peer's claim: the newer build wins, so say so plainly.
    channel?.postMessage(buildId);
  }
  if (next.server !== before.server) {
    serverVerdictTopic.emit();
  }
};

let inFlightQuery: Promise<void> | undefined;

/** One question, then the confirmations a verdict change under way needs. */
const askAndConfirm = async (): Promise<void> => {
  await askServer(undefined);
  // A verdict change under way is confirmed now, `lookupConfirmDelay` apart, not at the 30 s recheck.
  for (let check = 0; check < serverConfirmations && isConfirming(state); check += 1) {
    // oxlint-disable-next-line no-await-in-loop -- The confirmations are sequential by definition.
    await new Promise((resolve) => {
      setTimeout(resolve, lookupConfirmDelay);
    });
    // oxlint-disable-next-line no-await-in-loop -- The confirmations are sequential by definition.
    await askServer(undefined);
  }
};

/**
 * Ask the server which build is live (`/health/build`) and apply the answer: the single question
 * every consumer shares (`askLiveBuild` coalesces concurrent callers). A bundle without a build id
 * asks nothing.
 *
 * @returns Once the answer is applied; read {@link readServerVerdict} for what it changed.
 */
export const queryLiveBuild = async (): Promise<void> => {
  if (buildId === 0) {
    return;
  }
  // One question and its confirmations at a time, shared by every caller.
  inFlightQuery ??= (async () => {
    try {
      await askAndConfirm();
    } finally {
      inFlightQuery = undefined;
    }
  })();
  await inFlightQuery;
};

/**
 * Offer the reload into a build a deploy put live, without stopping writes: in a
 * lone tab no other bundle shares storage (`#lib/stale-build-recovery`).
 *
 * @param liveBuildId - The server's build id (`/health/build`).
 */
export function offerReload(liveBuildId: number): void {
  dispatch({ type: 'offer', buildId: liveBuildId });
}

/** Settle a peer's claim that another build owns storage, stopping writes until the server answers. */
const checkPeerClaim = async (claimedBuildId: number, isLive: boolean): Promise<void> => {
  if (state.phase === 'server-confirming' || state.phase === 'server-superseded') {
    return;
  }
  dispatch({ type: 'peer-claim', isLive });
  await askServer(claimedBuildId);
};

if (channel) {
  // Node keeps the event loop alive for an open channel; browsers have no unref.
  (channel as { unref?: () => void }).unref?.();
  channel.addEventListener('message', (event: MessageEvent) => {
    const message: unknown = event.data;
    const isLive = isLiveAnnouncement(message);
    const other = Number(isLive ? message.buildId : message);
    if (!Number.isFinite(other)) {
      return;
    }
    if (other === buildId) {
      /* Another tab on this build: after a rollback is undone, it is the only word that this build is
       * live again, and a tab the server superseded asks nothing more on its own. Each such tab leaves
       * `server-superseded` at most once per announcement, so this stays bounded. */
      if (state.phase === 'server-superseded') {
        // async-iife: bootstrap -- a channel listener cannot await; the check acts on its own.
        void askServer(buildId);
      }
      return;
    }
    if (!isLive && other < buildId) {
      /* While this tab still writes, an older tab must hear it and stop, or two bundles write (DF20),
       * even when a deploy already replaced this build. Once its own writes have stopped it is not the
       * build to vouch for; a live tab answers instead. */
      if (!hasStopped(state)) {
        channel.postMessage(buildId);
      }
      return;
    }
    // async-iife: bootstrap -- a channel listener cannot await; the check acts on its own.
    void checkPeerClaim(other, isLive);
  });
  channel.postMessage(buildId);
}

/** Stop listening to other tabs. A page never needs this; tests that load the module afresh do. */
export const closeBuildSkewChannel = (): void => {
  channel?.close();
  clearTimeout(phaseTimer);
  phaseTimer = undefined;
};

/**
 * The build that superseded this one: the build the server named, or else the newest heard
 * from any tab. A rollback names an older build. This tab's own id while nothing superseded it.
 */
export const readSupersedingBuildId = (): number => supersedingOf(state);

/** Subscribe to each change of the superseding build. */
export const subscribeSupersedingBuildId = (listener: () => void): (() => void) => {
  return supersedingBuildTopic.subscribe(listener);
};

/** The prompt shared by every surface that offers the reload. */
export const describeSupersession = (superseding: number): string =>
  superseding < buildId
    ? 'This version of Tau has been replaced. Reload to continue with the current version.'
    : 'A newer version of Tau is available. Reload to continue with the latest version.';

/** Subscribe to each change of the durable write stop ({@link isBuildSuperseded}). */
export const subscribeBuildSkew = (listener: () => void): (() => void) => {
  return writeStopTopic.subscribe(listener);
};

/**
 * Subscribe to each change of the reload offer ({@link isReloadOffered}) and of whether writes have
 * stopped for good ({@link haveWritesStopped}). The offer is withdrawn when the server names this build.
 */
export const subscribeReloadOffer = (listener: () => void): (() => void) => {
  return reloadOfferTopic.subscribe(listener);
};

/** Subscribe to each change of {@link readServerVerdict}. */
export const subscribeServerVerdict = (listener: () => void): (() => void) => {
  return serverVerdictTopic.subscribe(listener);
};
