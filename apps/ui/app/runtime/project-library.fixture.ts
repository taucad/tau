/**
 * A root file facade for tests of the app's project library: files-ui's `testRootFiles`, typed by the app's facade.
 */
import { testRootFiles as testLibraryRootFiles } from '@taucad/files-ui/runtime/project-library.fixture';
import type { TestRootFiles as TestLibraryRootFiles } from '@taucad/files-ui/runtime/project-library.fixture';
import type { ProjectLibraryFacade } from '#runtime/file-manager-facade.js';

/** A root file facade whose value a test sets. @public */
export type TestRootFiles = TestLibraryRootFiles<ProjectLibraryFacade>;

/**
 * A root file facade over a test's file manager double.
 *
 * @param fileManager - The double: the parts of the facade the test's rows reach.
 * @returns The facade, and its replacement.
 * @public
 */
export const testRootFiles = (fileManager: unknown): TestRootFiles =>
  testLibraryRootFiles<ProjectLibraryFacade>(fileManager);
