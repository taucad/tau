/**
 * Compatibility seam for the Home pre-project composer.
 *
 * The record itself is now one member of the composer record family in
 * `#db/composer-record-store.js`. This module survives only until W6 moves
 * `HomeNewProjectComposerProvider` onto `composerRecordMachine`; it adds no
 * behaviour of its own.
 */

import type { CadAgentExecution, MyUIMessage } from '@taucad/chat';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import type { ComposerRecord, ComposerRecordClient, ComposerRecordReadResult } from '#db/composer-record-store.js';

/** Sole Home-workspace record for the pre-project composer. */
export const newProjectComposerFilePath = composerRecordPaths.newProject;

/** Alias of `ComposerRecord`, kept until the Home provider names the record family directly. */
export type NewProjectComposerRecord = ComposerRecord;

/** Alias of `ComposerRecordReadResult`, kept until the Home provider names the record family directly. */
export type NewProjectComposerReadResult = ComposerRecordReadResult;

/** The Home record's store, expressed as `createComposerRecordStore(client, composerRecordPaths.newProject)`. */
export function createNewProjectComposerFileStore(client: ComposerRecordClient): {
  read: () => Promise<ComposerRecordReadResult>;
  patchDraft: (draft: MyUIMessage) => Promise<void>;
  patchExecution: (execution: CadAgentExecution) => Promise<void>;
} {
  const store = createComposerRecordStore(client, composerRecordPaths.newProject);
  return {
    read: store.read,
    patchDraft: async (draft) => store.patch({ draft }),
    patchExecution: async (execution) => store.patch({ execution }),
  };
}
