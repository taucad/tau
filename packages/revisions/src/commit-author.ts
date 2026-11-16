/**
 * The git author line of a project linked to a forge (D33), handed to the
 * store beside each revision and never inside it (I3).
 */

import type { RevisionUserActor } from '#revision-authority.js';
import type { RevisionCommitAuthor } from '#revision-headers.js';
import type { RevisionPort, WriteRevisionInput } from '#revision-port.js';

/**
 * A port whose every revision is authored under the forge identity a host holds for its person.
 *
 * The host knows the linked forge's no-reply identity of the person it records
 * for (`setActor`); the machines that write revisions do not, and no record
 * carries it. This hands it to `writeRevision` as `commitAuthor`, read per
 * write, so linking or unlinking changes the next revision only. A write that
 * already names its own `commitAuthor` keeps it.
 *
 * @param port - The store to write through.
 * @param commitAuthorFor - The forge identity for the person a revision is by, or `undefined` for anyone else.
 * @returns The same port, its `writeRevision` given the author line.
 * @public
 *
 * @example <caption>A host that holds the linked identity of its session</caption>
 * ```typescript
 * import { createNativeGitRevisionPort, withCommitAuthor } from '@taucad/revisions';
 *
 * const linked = { name: 'octo', email: '42+octo@users.noreply.github.com' };
 * const port = withCommitAuthor(createNativeGitRevisionPort({ repositoryPath: '/srv/project' }), (person) =>
 *   person.id === 'usr_1' ? linked : undefined,
 * );
 * ```
 */
export const withCommitAuthor = (
  port: RevisionPort,
  commitAuthorFor: (person: RevisionUserActor) => RevisionCommitAuthor | undefined,
): RevisionPort => {
  /*
   * A copy, not a proxy: a port is frozen, and a proxy may not answer a frozen
   * member with another function. Names come from the port and its prototypes,
   * so a class instance keeps the methods it inherits.
   */
  const members = new Map<string, unknown>();
  for (
    let owner: unknown = port;
    owner instanceof Object && owner !== Object.prototype;
    owner = Object.getPrototypeOf(owner)
  ) {
    for (const name of Object.getOwnPropertyNames(owner)) {
      if (name === 'constructor' || members.has(name)) {
        continue;
      }
      const value: unknown = Reflect.get(port, name, port);
      members.set(
        name,
        typeof value === 'function'
          ? (...parameters: unknown[]): unknown =>
              Reflect.apply(value as (...values: unknown[]) => unknown, port, parameters)
          : value,
      );
    }
  }
  members.set('writeRevision', async (input: WriteRevisionInput) => {
    const { actor } = input.provenance;
    const commitAuthor = input.commitAuthor ?? commitAuthorFor(actor.kind === 'agent' ? actor.onBehalfOf : actor);
    return port.writeRevision(commitAuthor === undefined ? input : { ...input, commitAuthor });
  });
  return Object.freeze(Object.fromEntries(members)) as RevisionPort;
};
