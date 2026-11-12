/**
 * The identity fixtures every revisions test records with (blueprint B1).
 *
 * A capture cannot be built without a resolved identity, so a test names one
 * the same way a host does: a person, and an agent on that person's behalf when
 * a run holds the cut.
 */

import type {
  RevisionCaptureIdentity,
  RevisionProvenance,
  RevisionUserActor,
  RevisionVia,
} from '#revision-authority.js';

/** The person a test host records as. */
export const testPerson: RevisionUserActor = Object.freeze({ kind: 'user', id: 'usr_test', name: 'Test Person' });

/**
 * A host's identity over one person: the person, or an agent for them while a run holds the cut.
 *
 * @param person - Who the host records as.
 * @param via - The leg it records through.
 * @returns The identity a host hands `createRevisionActors`.
 */
export const identityOf = (person: RevisionUserActor, via: RevisionVia = 'browser'): RevisionCaptureIdentity =>
  Object.freeze({
    via,
    resolve: ({ runId }) => (runId === undefined ? person : { kind: 'agent', id: 'agent', runId, onBehalfOf: person }),
  });

/** The identity a test host records with. */
export const testIdentity: RevisionCaptureIdentity = identityOf(testPerson);

/**
 * The identity half of a provenance literal, for a fixture that names only an id.
 *
 * @param id - The person's id.
 * @returns A person `actor`, a `save` capture and the browser leg, for spreading into a provenance.
 */
export const recordedBy = (id: string): Pick<RevisionProvenance, 'actor' | 'capture' | 'via'> => ({
  actor: { kind: 'user', id },
  capture: 'save',
  via: 'browser',
});
