import type { RevisionClient } from '#types/revision-client.types.js';

type ClientState = {
  readonly client: RevisionClient;
  /** The worker the client's channel was opened on; a new one is a new client. */
  readonly worker: Worker;
};

/**
 * One client per project, for the life of the document.
 *
 * A module singleton for the same reason the file-manager's own worker handle
 * is one: two connections for one project would mean two ports the worker keeps
 * the root alive for, and a close from either would be a lie.
 */
export const revisionClients = new Map<string, ClientState>();

/**
 * This project's client if one already exists, without opening one (W20).
 *
 * The sidebar reads every live project's `RevisionStatus`, and it is not inside
 * any project's route, so it must not be the thing that creates a connection:
 * a project with no client has nothing to say about branches or sync, and A29
 * says such a row shows nothing at all.
 *
 * @param projectId - The project the row is about.
 * @returns Its client, when its route subtree already opened one.
 * @public
 */
export const peekRevisionClient = (projectId: string): RevisionClient | undefined =>
  revisionClients.get(projectId)?.client;
