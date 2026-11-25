/**
 * A root file facade for tests of the project library (A4b): a fixed value a test can replace, as `rootFiles` publishes
 * a new record client when its worker is replaced.
 */
import { Topic } from '@taucad/events';
import type { ProjectLibraryRootFiles } from '#runtime/project-library.js';
import type { ProjectLibraryRootFacade } from '#types/project-library-io.types.js';

/** A root file facade whose value a test sets. @public */
export type TestRootFiles<Facade extends ProjectLibraryRootFacade = ProjectLibraryRootFacade> =
  ProjectLibraryRootFiles<Facade> & Readonly<{ replace: (fileManager: unknown) => void }>;

/**
 * A root file facade over a test's file manager double.
 *
 * @param fileManager - The double: the parts of the facade the test's rows reach.
 * @returns The facade, and its replacement.
 * @public
 */
export const testRootFiles = <Facade extends ProjectLibraryRootFacade = ProjectLibraryRootFacade>(
  fileManager: unknown,
): TestRootFiles<Facade> => {
  let current = fileManager as Facade;
  const changes = new Topic<void>({ name: 'test-root-files' });
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    replace: (next) => {
      current = next as Facade;
      changes.emit(undefined);
    },
  };
};
