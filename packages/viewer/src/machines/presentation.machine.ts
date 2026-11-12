/**
 * The GLB presentation of one view: which request its renderer prepares, and how far that preparation got.
 *
 * ```text
 * presentation: idle → preparing → awaitingAnalysis → presented | failed
 * context: request?, host?
 * ```
 *
 * - **idle**: nothing to prepare, or no renderer to prepare it (no host attached).
 * - **preparing**: the host is parsing, annotating and building the request's scene, or the scene is handed to React
 *   and waits for its commit.
 * - **awaitingAnalysis**: the scene is ready to display and waits for its section topology (an armed section view).
 * - **presented**: React attached the request's scene.
 * - **failed**: the request could not be presented; the view keeps whatever it presented before.
 *
 * Graphics owns this actor for the view's lifetime and sends it each GLB request (`present`) or `clear`. The host, a
 * callback actor the mounted GltfMesh builds around its Three.js renderer and hands over as `hostAttached`, owns
 * everything a host holds: the parser, the prepared scenes and their GPU resources (D4). This machine spawns it,
 * hands it each request as `prepare` and stops it when the mesh leaves; a new host (a new backend or section clip)
 * prepares the current request again. The host reports its progress to graphics, which forwards the outcome here.
 *
 * The states are the progress of the request in hand, not what the view shows: a failed replacement is `failed` here
 * while graphics keeps presenting the scene before it (`gltfPresentation`), and a request whose host left is `idle`
 * here while graphics still waits for it.
 *
 * The request holds the GLB's bytes, the same buffer graphics holds in `artifact`, not a copy: a host that attaches
 * later (a new backend or section clip) prepares the request in hand from them. It is the one buffer in this context
 * (MC-R5), and it leaves with the request.
 *
 * Every fact here is ephemeral: it is derived from the artifact and the mounted renderer, and never persisted.
 *
 * @module
 */

import { setup, types } from 'xstate';
import type { ActorRefFrom, AnyActorRef, CallbackActorLogic, EnqueueObject, SystemRegistry } from 'xstate';
import { eventSchemas } from '#machines/machine-schemas.js';
import { describeFault } from '#machines/machine-fault.js';

/**
 * One GLB to present: graphics' request revision and key, the model unit it names and its bytes.
 *
 * @public
 */
export type PresentationRequest = Readonly<{
  revision: number;
  key: string;
  unitId: string;
  sourceFile: string | undefined;
  bytes: Uint8Array<ArrayBuffer>;
}>;

/**
 * Commands the presentation sends its host: prepare a request, superseding any other, drop the one in hand, or
 * analyse the presented scene's section topology if it has not been (a section view armed after the scene was
 * presented). `analyse` leaves the request in hand alone.
 *
 * @public
 */
export type PresentationHostCommand =
  | { type: 'prepare'; request: PresentationRequest }
  | { type: 'cancel' }
  | { type: 'analyse' };

/**
 * A renderer's host: callback logic that prepares each request it is sent and gives everything it holds back when it
 * stops.
 *
 * @public
 */
export type PresentationHostLogic = CallbackActorLogic<PresentationHostCommand, undefined>;

/** The outcome of a request, correlated by its revision and key. */
type RequestOutcome = Readonly<{ revision: number; key: string }>;

/**
 * Events accepted by the presentation.
 *
 * @public
 */
export type PresentationEvent =
  /** A GLB to present, superseding the one in hand. */
  | { type: 'present'; request: PresentationRequest }
  /** The view shows no GLB any more. */
  | { type: 'clear' }
  /** A section view is armed: the host analyses the presented scene's section topology if it has not. */
  | { type: 'analyse' }
  /** A mounted renderer's host; it replaces any other. */
  | { type: 'hostAttached'; hostId: string; host: PresentationHostLogic }
  /** The renderer left. A stale id (a newer host already took the slot) is ignored. */
  | { type: 'hostDetached'; hostId: string }
  /** The host's scene is ready to display; `analysis-ready` waits for its section topology. */
  | ({ type: 'gltfDisplayReady'; barrier: 'display-ready' | 'analysis-ready' } & RequestOutcome)
  | ({ type: 'gltfAnalysisReady' } & RequestOutcome)
  | ({ type: 'gltfPresentationCommitted' } & RequestOutcome)
  | ({ type: 'gltfPresentationFailed' } & RequestOutcome);

/**
 * Every {@link PresentationEvent} type, in the union's order.
 *
 * @public
 */
export const presentationEventTypes = [
  'present',
  'clear',
  'analyse',
  'hostAttached',
  'hostDetached',
  'gltfDisplayReady',
  'gltfAnalysisReady',
  'gltfPresentationCommitted',
  'gltfPresentationFailed',
] as const satisfies ReadonlyArray<PresentationEvent['type']>;

/**
 * The presentation's context: the request in hand and the host preparing it.
 *
 * @public
 */
export type PresentationContext = {
  /** The first defect this actor caught at its root (MC-R12), the likeliest cause of any after it; it keeps its state and answers every event. */
  fault?: string;
  request: PresentationRequest | undefined;
  host: Readonly<{ hostId: string; ref: AnyActorRef }> | undefined;
};

/**
 * The `[state, eventType]` pairs {@link presentationMachine} leaves unanswered (MC-R17): none.
 *
 * @public
 */
export const presentationIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [];

type PresentationEnqueue = EnqueueObject<PresentationEvent, never, SystemRegistry, Record<string, never>>;
type PresentationTarget = '.idle' | '.preparing';
type PresentationArgs<Type extends PresentationEvent['type']> = Readonly<{
  context: PresentationContext;
  event: Extract<PresentationEvent, { type: Type }>;
}>;

const idle: PresentationTarget = '.idle';

const isCurrent = (context: PresentationContext, event: RequestOutcome): boolean =>
  context.request?.revision === event.revision && context.request.key === event.key;

/** Hands the request to the host, if both are there: the presentation prepares, and otherwise waits. */
const prepare = (
  host: PresentationContext['host'],
  request: PresentationRequest | undefined,
  enq: PresentationEnqueue,
): PresentationTarget => {
  if (!host || !request) {
    return idle;
  }
  enq.sendTo(host.ref, { type: 'prepare', request });
  return '.preparing';
};

const present = ({ context, event }: PresentationArgs<'present'>, enq: PresentationEnqueue) => ({
  target: prepare(context.host, event.request, enq),
  context: { request: event.request },
});

const clear = ({ context }: PresentationArgs<'clear'>, enq: PresentationEnqueue) => {
  if (context.host) {
    enq.sendTo(context.host.ref, { type: 'cancel' });
  }
  return { target: idle, context: { request: undefined } };
};

const hostAttached = ({ context, event }: PresentationArgs<'hostAttached'>, enq: PresentationEnqueue) => {
  if (context.host) {
    enq.stop(context.host.ref);
  }
  const host = { hostId: event.hostId, ref: enq.spawn(event.host, { id: `host:${event.hostId}` }) };
  return { target: prepare(host, context.request, enq), context: { host } };
};

const hostDetached = ({ context, event }: PresentationArgs<'hostDetached'>, enq: PresentationEnqueue) => {
  if (context.host?.hostId !== event.hostId) {
    // A replaced host's leave is stale: the newer host keeps the slot.
    return {};
  }
  // Stopping the host gives back the scenes it prepared and cancels the one in hand; the request stays for the next.
  enq.stop(context.host.ref);
  return { target: idle, context: { host: undefined } };
};

const presentationMachineDefinition = setup({
  schemas: {
    context: types<PresentationContext>(),
    events: eventSchemas<PresentationEvent>(),
  },
}).createMachine({
  id: 'presentation',
  // A defect (an effect that threw, a failed child, a send to no child) is recorded, never fatal (MC-R12). The first
  // is kept: the root cause matters more than the defects it sets off.
  onError: ({ context, event }) => ({ context: { fault: context.fault ?? describeFault(event.error) } }),
  version: '1',
  context: { request: undefined, host: undefined },
  exit: ({ context }, enq) => {
    if (context.host) {
      enq.stop(context.host.ref);
    }
  },
  initial: 'idle',
  states: {
    idle: {},
    preparing: {
      on: {
        // A scene ready to display waits here for React, unless it waits for its section topology first; another
        // request's outcome is stale.
        gltfDisplayReady: ({ context, event }) =>
          isCurrent(context, event) && event.barrier === 'analysis-ready' ? { target: 'awaitingAnalysis' } : {},
      },
    },
    awaitingAnalysis: {
      on: {
        // Another request's analysis is stale.
        gltfAnalysisReady: ({ context, event }) => (isCurrent(context, event) ? { target: 'preparing' } : {}),
      },
    },
    presented: {},
    failed: {},
  },
  on: {
    present: (args, enq) => present(args, enq),
    clear: (args, enq) => clear(args, enq),
    // Without a host there is no presented scene to analyse; the next host prepares with the section view in hand.
    analyse: ({ context }, enq) => {
      if (context.host) {
        enq.sendTo(context.host.ref, { type: 'analyse' });
      }
      return {};
    },
    hostAttached: (args, enq) => hostAttached(args, enq),
    hostDetached: (args, enq) => hostDetached(args, enq),
    // Outside `preparing` and `awaitingAnalysis` a readiness report is stale: its request was superseded, cleared or
    // left with its host, or a late section arm analysed a scene already presented.
    gltfDisplayReady: () => ({}),
    gltfAnalysisReady: () => ({}),
    // Another request's outcome, or one that arrives after its host left, is stale.
    gltfPresentationCommitted: ({ context, event }) =>
      isCurrent(context, event) && context.host ? { target: '.presented' } : {},
    gltfPresentationFailed: ({ context, event }) =>
      isCurrent(context, event) && context.host ? { target: '.failed' } : {},
  },
});

type PresentationMachineDefinition = typeof presentationMachineDefinition;

/**
 * The type of {@link presentationMachine}, named so declarations reference it rather than inline it.
 *
 * @public
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference an interface by name and would expand an alias (K-17)
export interface PresentationMachine extends PresentationMachineDefinition {}

/**
 * The GLB presentation of one view.
 *
 * @public
 */
export const presentationMachine: PresentationMachine = presentationMachineDefinition;

/**
 * A running presentation.
 *
 * @public
 */
export type PresentationRef = ActorRefFrom<PresentationMachine>;
