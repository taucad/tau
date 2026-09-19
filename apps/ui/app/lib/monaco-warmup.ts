/**
 * Start Monaco's configuration ahead of opening a project.
 *
 * Outside the project route the Monaco chunks are not loaded, so this is a
 * dynamic import: it runs only on a signal of intent (a project or chat row is
 * pointed at, focused or pressed), never on idle, so Home does not download the
 * editor for people who never open a project. Configuration itself is shared
 * and idempotent; the project route's editors read the result synchronously.
 */

let isWarming = false;

/** Begin loading and configuring Monaco once; a failure allows a later retry. */
export const warmMonaco = (): void => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- can be undefined in SSR
  if (isWarming || globalThis.window === undefined) {
    return;
  }
  isWarming = true;
  void (async () => {
    try {
      const { configureMonaco } = await import('#lib/monaco.lib.client.js');
      await configureMonaco();
    } catch {
      isWarming = false;
    }
  })();
};
