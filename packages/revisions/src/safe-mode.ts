/**
 * Safe mode makes no Tau Cloud read or write (W9 report R5, operator and Principal rulings). A host learns safe mode
 * once, when it is created (the browser's revisions worker, the desktop's native project host), and wraps each
 * project's port with this gate: every network leg that addresses
 * the project's Tau Cloud remote is refused before any request, with a code the sync machine treats as terminal (no
 * retry) and states as "Tau Cloud is off in safe mode". Other Git remotes and local history are untouched.
 */
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort, RevisionRemoteAddress } from '#revision-port.js';
import { tauRemoteName } from '#remotes.js';

/** The sentence the refusal carries, which the Sync region shows. */
const tauCloudOffInSafeMode = 'Tau Cloud is off in safe mode.';

/**
 * The refusal every Tau Cloud leg gets in safe mode.
 *
 * @returns The error.
 * @public
 */
export const safeModeRefusal = (): RevisionPortError =>
  new RevisionPortError('REMOTE_SAFE_MODE', tauCloudOffInSafeMode);

/**
 * Wrap a project's port so that, in safe mode, nothing reaches its Tau Cloud remote.
 *
 * A remote is Tau Cloud's by its name, as git's config records it (`remoteKindOf`).
 *
 * @param port - The project's port.
 * @returns The gated port.
 * @public
 */
export const withoutTauCloud = (port: RevisionPort): RevisionPort => {
  const refuseTau = async (remote: string | RevisionRemoteAddress): Promise<void> => {
    await Promise.resolve();
    if ((typeof remote === 'string' ? remote : remote.name) === tauRemoteName) {
      throw safeModeRefusal();
    }
  };
  const { fetchLargeObjects } = port;
  return {
    ...port,
    listRemoteRefs: async (remote, options) => {
      await refuseTau(remote);
      return port.listRemoteRefs(remote, options);
    },
    fetch: async (input) => {
      await refuseTau(input.remote);
      return port.fetch(input);
    },
    push: async (input) => {
      await refuseTau(input.remote);
      return port.push(input);
    },
    /* Large objects come from the project's Tau Cloud remote when it has one and no other remote. */
    ...(fetchLargeObjects === undefined
      ? {}
      : {
          fetchLargeObjects: async (pointers, options) => {
            const remotes = await port.listRemotes();
            if (remotes.length > 0 && remotes.every((entry) => entry.kind === 'tau')) {
              throw safeModeRefusal();
            }
            return fetchLargeObjects.call(port, pointers, options);
          },
        }),
  };
};
