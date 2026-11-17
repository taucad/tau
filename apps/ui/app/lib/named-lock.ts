/**
 * A named lock across this origin's tabs (RV-W11 3), kept out of the hook modules so the runtime can take it (A4b): the
 * project library's create lock and the cloud gestures share one implementation.
 */
import { KeyedMutex } from '@taucad/utils/keyed-mutex';

const documentLocks = new KeyedMutex<string>();

/**
 * Run `task` holding a named Web Lock, so two tabs of this origin never run it
 * at once (RV-W11 3). Without the Locks API (a test document, an old engine)
 * it runs under an in-document queue of the same name.
 *
 * @param name - The lock's name.
 * @param task - The work.
 * @returns What the task answered.
 * @public
 */
export const withNamedLock = async <T>(name: string, task: () => Promise<T>): Promise<T> => {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks !== undefined) {
    return locks.request(name, task);
  }
  return documentLocks.run(name, task);
};
