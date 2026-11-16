import { Topic } from '@taucad/events';
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
const clientTopic = new Topic<void>({ name: 'revision-clients' });

/* A map that says when a project's client is set or removed, so a wait can follow a client that arrives later. */
class ClientRegistry extends Map<string, ClientState> {
  public override set(projectId: string, state: ClientState): this {
    super.set(projectId, state);
    notifyClientListeners();
    return this;
  }

  public override delete(projectId: string): boolean {
    const deleted = super.delete(projectId);
    notifyClientListeners();
    return deleted;
  }

  public override clear(): void {
    super.clear();
    notifyClientListeners();
  }
}

const notifyClientListeners = (): void => {
  clientTopic.emit();
};

export const revisionClients = new ClientRegistry();

/**
 * Hear each change of which client a project has (SP2h review): a held turn follows the one that arrives or replaces
 * the client it started with.
 *
 * @param listener - Called after each set, removal or reset.
 * @returns The unsubscription.
 * @public
 */
export const subscribeRevisionClients = (listener: () => void): (() => void) => clientTopic.subscribe(listener);

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
