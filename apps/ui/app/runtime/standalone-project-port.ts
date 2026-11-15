/**
 * The standalone project the app shows outside the session registry (the owned preview route), as a runtime-level
 * port (A11, programme-control ruling 2026-11-15 20:42Z). Its host publishes the project's file manager and runtime
 * here, so the shell's readers (Settings) find it without provider ancestry above the shell. Each app runtime has its
 * own port, so a server request's runtime never sees another's.
 */
import { Topic } from '@taucad/events';
import type { AppRuntime } from '#runtime/app-runtime.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { ProjectRuntimeViewSource } from '#runtime/project-runtime.session.js';

/** A project the shell can read: its id, its file manager and its runtime. */
export type StandaloneProject = Readonly<{
  projectId: string;
  fileManagerRef: FileManagerRef | undefined;
  runtime: ProjectRuntimeViewSource | undefined;
}>;

/** One runtime's port: the project published now, and who hears a change. */
export type StandaloneProjectPort = Readonly<{
  get: () => StandaloneProject | undefined;
  subscribe: (listener: () => void) => () => void;
  /** Publish a project; the returned call withdraws it, unless another has been published since. */
  publish: (project: StandaloneProject) => () => void;
}>;

const ports = new WeakMap<AppRuntime, StandaloneProjectPort>();

function createPort(): StandaloneProjectPort {
  let current: StandaloneProject | undefined;
  const changes = new Topic<void>({ name: 'standalone-project' });
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    publish: (project) => {
      current = project;
      changes.emit();
      return () => {
        if (current === project) {
          current = undefined;
          changes.emit();
        }
      };
    },
  };
}

/**
 * The standalone-project port of an app runtime, created on first use.
 *
 * @param runtime - The app runtime.
 * @returns Its port.
 */
export function standaloneProjectPortOf(runtime: AppRuntime): StandaloneProjectPort {
  let port = ports.get(runtime);
  if (port === undefined) {
    port = createPort();
    ports.set(runtime, port);
  }
  return port;
}
