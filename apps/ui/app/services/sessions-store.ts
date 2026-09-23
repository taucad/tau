/**
 * The app's one sessions registry (S44, A38).
 *
 * Created with `createActor` in a module, never with `useActorRef`, so React
 * Strict Mode's mount → stop → rehydrate cycle cannot double-start every live
 * project. `SessionsProvider` hands it down; every reader is a selector over
 * its snapshot (the `ChatSessionStore` precedent).
 *
 * The registry owns *liveness*. Two of a session's four startup regions own a
 * resource outright here — compute admission and the agent-host attachment —
 * and the other two are reported by the subtree that holds the file-manager,
 * project and editor actors, because those are built from React-context
 * handles (the shared worker, the file pool, the query client, the project
 * manager's closures). The session still decides when they exist: the project
 * route renders a project's resources iff the registry says it is live, and
 * `closing` completes — flush, lease release — before the registry drops it.
 */

import { Topic } from '@taucad/events';
import { randomUuid } from '@taucad/utils/id';
import { createActor, createCallbackLogic } from 'xstate';
import type { Actor, ActorRefFrom, EventObject } from 'xstate';
import { isDesktopTarget } from '#filesystem/desktop-bridge.js';
import { browserLiveProjectBudget, sessionsMachine } from '#machines/sessions.machine.js';
import type { SessionsMachineContext, SessionsProjectStatus } from '#machines/sessions.machine.js';
import { projectSessionMachine } from '#machines/project-session.machine.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';
import { chatHostBinding, chatTurnAdmission, chatTurnSettlement } from '#chat-clients/_internal/chat-host-binding.js';
import type { ProjectSessionActorRef, ProjectSessionRegion } from '#machines/project-session.machine.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { inspect } from '#machines/inspector.js';
import { registerProjectAgentHost } from '#services/project-agent-host-registration.js';
import type { ProjectAgentHostRegistration } from '#services/project-agent-host-registration.js';

/**
 * One project session's flush and lease work, supplied by the subtree that
 * owns the project's resources.
 *
 * The registry imports no worker and no port: the project route registers
 * these when its session opens and unregisters when it closes, so `closing`
 * calls the live implementation and does nothing when the subtree never came
 * up. `flushSync` is W13's `awaitSyncSettled` seam through the revision
 * client — never a second copy of it.
 */
export type ProjectSessionServices = Readonly<{
  flushProducers: () => Promise<void>;
  flushSync: (boundMilliseconds: number) => Promise<void>;
  cancelRuns: (chatIds: readonly string[]) => Promise<void>;
  releaseLeases: () => Promise<void>;
}>;

const noServices: ProjectSessionServices = {
  flushProducers: async () => undefined,
  flushSync: async () => undefined,
  cancelRuns: async () => undefined,
  releaseLeases: async () => undefined,
};

const services = new Map<string, ProjectSessionServices>();

/**
 * Register the live implementations for one project session.
 *
 * @param projectId - The project whose subtree is registering.
 * @param implementation - What `closing` and `opening.pulling` call.
 * @returns The unregistration, for the subtree's effect cleanup.
 */
export const registerProjectSessionServices = (
  projectId: string,
  implementation: ProjectSessionServices,
): (() => void) => {
  services.set(projectId, implementation);
  return () => {
    if (services.get(projectId) === implementation) {
      services.delete(projectId);
    }
  };
};

const servicesFor = (projectId: string): ProjectSessionServices => services.get(projectId) ?? noServices;

// ---------------------------------------------------------------------------
// Region readiness
// ---------------------------------------------------------------------------

type RegionOutcome = Readonly<{ ready: true } | { ready: false; reason: string }>;

const regionKey = (projectId: string, region: ProjectSessionRegion): string => `${projectId}:${region}`;
const regionOutcomes = new Map<string, RegionOutcome>();
/* One fan-out for every region of every project; the key rides on the event so
 * a session's relay child filters to its own (event-fanout policy). */
const regionTopic = new Topic<{
  readonly key: string;
  readonly outcome: RegionOutcome;
}>({
  name: 'sessions.regions',
});

const publishRegion = (projectId: string, region: ProjectSessionRegion, outcome: RegionOutcome): void => {
  const key = regionKey(projectId, region);
  regionOutcomes.set(key, outcome);
  regionTopic.emit({ key, outcome });
};

/** The project's views (file manager) or runtime (project + editor) are up. @public */
export const reportRegionReady = (projectId: string, region: ProjectSessionRegion): void => {
  publishRegion(projectId, region, { ready: true });
};

/** That region could not come up, with the reason the failed row shows. @public */
export const reportRegionFailed = (projectId: string, region: ProjectSessionRegion, reason: string): void => {
  publishRegion(projectId, region, { ready: false, reason });
};

/** Forget what a closed project's subtree last said. @public */
export const forgetProjectRegions = (projectId: string): void => {
  for (const region of ['views', 'runtime', 'agentHost', 'compute'] as const) {
    regionOutcomes.delete(regionKey(projectId, region));
  }
};

/*
 * Ponytail: one relay, four regions — not an abstraction with one caller.
 *
 * A region whose resource is built from React context reports through
 * `reportRegionReady`; this child turns that report into the machine event and
 * holds the region open for the session's life, so stopping the child is what
 * ends it. Upgrade path: when a region's resource can be constructed without a
 * React handle, provide a child that builds it here instead of relaying.
 */
const relayRegion = (region: ProjectSessionRegion) =>
  createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
    const key = regionKey(input.projectId, region);
    const deliver = (outcome: RegionOutcome): void => {
      sendBack(
        outcome.ready ? { type: 'childReady', region } : { type: 'childFailed', region, reason: outcome.reason },
      );
    };
    const unsubscribe = regionTopic.subscribe({
      handler: (event) => {
        deliver(event.outcome);
      },
      interestedIn: (event) => event.key === key,
    });
    const known = regionOutcomes.get(key);
    if (known !== undefined) {
      deliver(known);
    }
    return unsubscribe;
  });

// ---------------------------------------------------------------------------
// Cross-process identity
// ---------------------------------------------------------------------------

/**
 * This document's session epoch (W3c-R4, P31).
 *
 * One id per client session, carried on every `revisionsConnect` so the worker
 * can tell whose revisions actor system owns a project's leases. A second
 * window of the same workspace gets a different epoch, which is the whole
 * point: only the session that owns a project's revisions actor system may
 * sweep its leases.
 *
 * @public
 */
export const sessionEpoch: string = randomUuid();

// ---------------------------------------------------------------------------
// Compute admission
// ---------------------------------------------------------------------------

let sharedFileManagerWorker: Worker | undefined;

/** The shared file-manager worker, mirrored in by `SessionsProvider`. @public */
export const setSharedFileManagerWorker = (worker: Worker | undefined): void => {
  sharedFileManagerWorker = worker;
};

/**
 * Compute admission, per live project (brief item 4).
 *
 * The worker holds a *set* of admitted ids; a project's channels are disposed
 * on its own close, never on another project's open. The session is what says
 * "this project is live", so it is what admits and releases.
 */
const computeRegion = createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
  sharedFileManagerWorker?.postMessage({
    type: 'computeStoreAdmission',
    projectId: input.projectId,
  });
  sendBack({ type: 'childReady', region: 'compute' });
  return () => {
    sharedFileManagerWorker?.postMessage({
      type: 'computeStoreRelease',
      projectId: input.projectId,
    });
  };
});

const agentHostRegistrations = new Map<string, Promise<ProjectAgentHostRegistration>>();

/** The real browser probe or desktop launcher attachment owned by one session. */
const agentHostRegion = createCallbackLogic<EventObject, { projectId: string }>(({ input, sendBack }) => {
  const registration = registerProjectAgentHost(input.projectId, `${sessionEpoch}:${input.projectId}`);
  agentHostRegistrations.set(input.projectId, registration);
  // async-iife: bootstrap -- `createCallbackLogic` is synchronous; the registration settles through `sendBack`.
  void (async () => {
    try {
      await registration;
      sendBack({ type: 'childReady', region: 'agentHost' });
    } catch (error) {
      sendBack({
        type: 'childFailed',
        region: 'agentHost',
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  return () => {
    if (agentHostRegistrations.get(input.projectId) !== registration) {
      return;
    }
    agentHostRegistrations.delete(input.projectId);
    // async-iife: bootstrap -- teardown is synchronous and a failed release has nobody to report to.
    void (async () => {
      try {
        const registered = await registration;
        await registered.release();
      } catch {
        // The registration never came up; there is nothing left to release.
      }
    })();
  };
});

// ---------------------------------------------------------------------------
// The registry actor
// ---------------------------------------------------------------------------

const projectSession = projectSessionMachine.provide({
  actors: {
    cancelRuns: fromSafeAsync<void, { projectId: string; runs: readonly string[] }>(async ({ input }) => {
      await servicesFor(input.projectId).cancelRuns(input.runs);
    }),
    flushProducers: fromSafeAsync<void, { projectId: string }>(async ({ input }) => {
      await servicesFor(input.projectId).flushProducers();
    }),
    flushSync: fromSafeAsync<void, { projectId: string; boundMilliseconds: number }>(async ({ input }) => {
      await servicesFor(input.projectId).flushSync(input.boundMilliseconds);
    }),
    releaseLeases: fromSafeAsync<void, { projectId: string }>(async ({ input }) => {
      await servicesFor(input.projectId).releaseLeases();
    }),
    releaseAgentHost: fromSafeAsync<void, { projectId: string }>(async ({ input }) => {
      const registration = agentHostRegistrations.get(input.projectId);
      if (registration !== undefined) {
        const registered = await registration;
        await registered.release();
        agentHostRegistrations.delete(input.projectId);
      }
    }),
    fileManager: relayRegion('views'),
    project: relayRegion('runtime'),
    agentHost: agentHostRegion,
    compute: computeRegion,
    /* The chat's agent-host binding, injected here for the same reason every
     * other resource is: the machines import no transport, no DOM and no React
     * so their own rows run headless (policy §16 puts the binding on the chat
     * session; this is where the real one is supplied). */
    /* The chat session's three owned resources, bound to the route's published
     * services: one host registration, one admission and one settlement per
     * chat (policy §16). */
    chatSession: chatSessionMachine.provide({
      actors: { hostBinding: chatHostBinding, admitTurn: chatTurnAdmission, settleTurn: chatTurnSettlement },
    }),
  },
});

/**
 * The registry actor.
 *
 * Desktop is bounded by memory rather than a count (A35): its budget is the
 * absence of one, and the idle window still applies.
 */
export const sessionsActor: Actor<typeof sessionsMachine> = createActor(
  sessionsMachine.provide({ actors: { projectSession } }),
  {
    input: {
      budget: isDesktopTarget ? Number.POSITIVE_INFINITY : browserLiveProjectBudget,
    },
    inspect,
  },
);

let started = false;

/**
 * Start the registry once, from the provider that hands it down.
 *
 * The flag is the only honest test: a `createActor` that has never run already
 * reports `status: 'active'` on its initial snapshot, so asking the snapshot
 * whether to start means never starting.
 *
 * @returns The one registry actor, running.
 * @public
 */
export const startSessionsActor = (): ActorRefFrom<typeof sessionsMachine> => {
  if (!started) {
    started = true;
    sessionsActor.start();
  }
  return sessionsActor;
};

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** Which projects are live right now, in open order. @public */
export const selectLiveProjectIds = (context: SessionsMachineContext): readonly string[] => Object.keys(context.refs);

/** One project's session actor, or `undefined` when it is closed. @public */
export const selectProjectSession = (
  context: SessionsMachineContext,
  projectId: string,
): ProjectSessionActorRef | undefined => context.refs[projectId];

/**
 * The coalesced per-project status object W20's `use-sidebar-status.ts` reads.
 *
 * One object per project (S46) — never four machine snapshots per row. W20
 * joins the worker's `RevisionStatus` projection and the chat sessions'
 * `statusChanged` onto this shape; it is named here so the sidebar has one
 * seam rather than a second derivation of the same facts.
 *
 * @public
 */
export type ProjectLivenessStatus = Readonly<{
  projectId: string;
  live: boolean;
  status: SessionsProjectStatus | undefined;
  /** Why it closed, when it is closed: `Closed to save memory`, and so on. */
  closedReason: string | undefined;
  /** What stopped a policy from closing it, when one tried (I24, I25). */
  policyRefusal: string | undefined;
}>;

/**
 * The registry's half of one project's sidebar row.
 *
 * @param context - The registry snapshot's context.
 * @param projectId - The project the row is about.
 * @returns The coalesced liveness facts for that project.
 * @public
 */
export const selectProjectLiveness = (context: SessionsMachineContext, projectId: string): ProjectLivenessStatus => ({
  projectId,
  live: context.refs[projectId] !== undefined,
  status: context.status[projectId],
  closedReason: context.closed[projectId]?.reason,
  policyRefusal: context.refusals[projectId],
});
