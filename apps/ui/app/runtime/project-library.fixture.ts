/**
 * A root file facade for tests of the project library (A4b): a fixed value a test can replace, as `rootFiles` publishes
 * a new record client when its worker is replaced.
 */
import { Topic } from '@taucad/events';
import type { ProjectLibraryRootFiles } from '#runtime/project-library.js';
import type { ProjectLibraryFileManager } from '#runtime/project-library-storage.js';

/** A root file facade whose value a test sets. @public */
export type TestRootFiles = ProjectLibraryRootFiles & Readonly<{ replace: (fileManager: unknown) => void }>;

/**
 * A root file facade over a test's file manager double.
 *
 * @param fileManager - The double: the parts of the facade the test's rows reach.
 * @returns The facade, and its replacement.
 * @public
 */
export const testRootFiles = (fileManager: unknown): TestRootFiles => {
  let current = fileManager as ProjectLibraryFileManager;
  const changes = new Topic<void>({ name: 'test-root-files' });
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    replace: (next) => {
      current = next as ProjectLibraryFileManager;
      changes.emit(undefined);
    },
  };
};
