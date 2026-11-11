/**
 * A capture cannot be built without a resolved identity (blueprint B1, I1).
 *
 * Each `@ts-expect-error` below is a capture the compiler refuses: no identity,
 * an identity that may be `undefined`, a provenance with no actor, capture or
 * leg, and an agent that names no person. The `actorId` default is gone, so no
 * fallback id can stand in for any of them.
 */

import { expectTypeOf } from 'vitest';

import type {
  RevisionAgentIdentity,
  RevisionCaptureIdentity,
  RevisionIdentity,
  RevisionProvenance,
  RevisionUserActor,
} from '#revision-authority.js';
import { createRevisionActors } from '#revision-effects.js';
import type { RevisionActorsOptions } from '#revision-effects.types.js';
import type { WriteRevisionInput } from '#revision-port.js';

declare const base: Omit<RevisionActorsOptions, 'identity'>;
declare const person: RevisionUserActor;
declare const identity: RevisionCaptureIdentity;

/* The options carry an identity, and it is required. */
expectTypeOf<RevisionActorsOptions['identity']>().toEqualTypeOf<RevisionCaptureIdentity>();
expectTypeOf<undefined>().not.toExtend<RevisionActorsOptions['identity']>();
expectTypeOf<RevisionActorsOptions>().not.toHaveProperty('actorId');
expectTypeOf<RevisionActorsOptions>().not.toHaveProperty('actor');

createRevisionActors({ ...base, identity });

// @ts-expect-error -- no identity: the capture cannot be built.
createRevisionActors({ ...base });

// @ts-expect-error -- an undefined identity is not an identity.
createRevisionActors({ ...base, identity: undefined });

createRevisionActors({
  ...base,
  // @ts-expect-error -- a resolver that may answer `undefined` would record a fallback.
  identity: { via: 'browser', resolve: (): RevisionIdentity | undefined => undefined },
});

// @ts-expect-error -- a capture names its leg.
createRevisionActors({ ...base, identity: { resolve: () => person } });

/* A resolver answers an identity, never `undefined`. */
expectTypeOf<ReturnType<RevisionCaptureIdentity['resolve']>>().toEqualTypeOf<RevisionIdentity>();

/* Provenance: identity, capture and leg are required (trailer version 2). */
expectTypeOf<RevisionProvenance['actor']>().toEqualTypeOf<RevisionIdentity>();
expectTypeOf<RevisionProvenance>().not.toHaveProperty('actorId');
expectTypeOf<RevisionProvenance>().not.toHaveProperty('trigger');

const recorded: RevisionProvenance = { source: 'user', actor: person, capture: 'save', via: 'browser', createdAt: 0 };
expectTypeOf(recorded).toExtend<WriteRevisionInput['provenance']>();

// @ts-expect-error -- no actor.
const unattributed: RevisionProvenance = { source: 'user', capture: 'save', via: 'browser', createdAt: 0 };
// @ts-expect-error -- an undefined actor.
const undefinedActor: RevisionProvenance = {
  source: 'user',
  actor: undefined,
  capture: 'save',
  via: 'browser',
  createdAt: 0,
};
// @ts-expect-error -- no capture.
const uncaptured: RevisionProvenance = { source: 'user', actor: person, via: 'browser', createdAt: 0 };
// @ts-expect-error -- no leg.
const noLeg: RevisionProvenance = { source: 'user', actor: person, capture: 'save', createdAt: 0 };
// @ts-expect-error -- the bare id of version 1 is gone.
const legacy: RevisionProvenance = {
  source: 'user',
  actorId: 'tau-host',
  capture: 'save',
  via: 'browser',
  createdAt: 0,
};

/* An agent always names its run and the person it ran for. */
expectTypeOf<RevisionAgentIdentity['onBehalfOf']>().toEqualTypeOf<RevisionUserActor>();
expectTypeOf<RevisionAgentIdentity['runId']>().toEqualTypeOf<string>();
// @ts-expect-error -- an agent with no person.
const unowned: RevisionAgentIdentity = { kind: 'agent', id: 'agent', runId: 'run-1' };

expectTypeOf([unattributed, undefinedActor, uncaptured, noLeg, legacy, unowned]).toBeArray();
