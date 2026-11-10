/**
 * This tab's `sessionStorage`, or `undefined` where reading it throws (a sandboxed frame, storage
 * blocked by the browser) or it does not exist (a worker, the server).
 *
 * @returns The storage, when the page may use it.
 */
export const readSessionStorage = (): Storage | undefined => {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined;
  }
};
