import type * as ProjectWorkspace from '#routes/w.$workspace.$project/project-live-sessions.js';

type ProjectWorkspaceModule = typeof ProjectWorkspace;

/**
 * The workspace shell import, tagged with the `status`/`value` fields React's `use` reads. Once it
 * has settled, `use` returns the module in the same render instead of suspending, so a project that
 * becomes live after the chunk arrived mounts without committing a Suspense fallback. A committed
 * fallback makes React hold the next reveal for its 300 ms fallback throttle, which is what a
 * direct open spent between route access and the project's providers mounting.
 */
type ProjectWorkspaceLoad = Promise<ProjectWorkspaceModule> & {
  status?: 'pending' | 'fulfilled' | 'rejected';
  value?: ProjectWorkspaceModule;
  reason?: unknown;
};

let load: ProjectWorkspaceLoad | undefined;

const importProjectWorkspace = async (): Promise<ProjectWorkspaceModule> =>
  import('#routes/w.$workspace.$project/project-live-sessions.js');

const tagSettlement = async (pending: ProjectWorkspaceLoad): Promise<void> => {
  try {
    const module = await pending;
    pending.status = 'fulfilled';
    pending.value = module;
  } catch (error) {
    pending.status = 'rejected';
    pending.reason = error;
    // A failed import is forgotten so the next caller retries it.
    if (load === pending) {
      load = undefined;
    }
  }
};

/** The one workspace shell import, shared by link warming, the project route and `use`. */
// oxlint-disable-next-line @typescript-eslint/promise-function-async -- `use` must receive the tagged promise itself, which an async function would wrap.
export const loadProjectWorkspace = (): Promise<ProjectWorkspaceModule> => {
  if (load) {
    return load;
  }
  const pending: ProjectWorkspaceLoad = importProjectWorkspace();
  pending.status = 'pending';
  load = pending;
  void tagSettlement(pending);
  return pending;
};

/** Start the workspace shell import when a project link shows intent or a project route mounts. */
export const warmProjectWorkspace = (): void => {
  // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- absent during SSR
  if (globalThis.window === undefined) {
    return;
  }
  // async-iife: bootstrap -- warming only starts the import; the route owns the load and shows its failure.
  void (async () => {
    try {
      await loadProjectWorkspace();
    } catch {
      // The route's `use` reports it and retries with a fresh import.
    }
  })();
};
