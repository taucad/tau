import { warmMonaco } from '#lib/monaco-warmup.js';

let isWarming = false;

/** Start the workspace and editor imports when a project link shows intent. */
export const warmProjectWorkspace = (): void => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent during SSR
  if (globalThis.window === undefined) {
    return;
  }
  warmMonaco();
  if (isWarming) {
    return;
  }
  isWarming = true;
  // async-iife: bootstrap -- link intent warms the chunk; the route owns the actual load and retries after failure.
  void (async () => {
    try {
      await import('#routes/w.$workspace.$project/project-live-sessions.js');
    } catch {
      isWarming = false;
    }
  })();
};
