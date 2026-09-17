/**
 * The record seam (blueprint §"The seam"): what `draftPersistenceFor` hands the
 * draft machine must reach the record as a patch, and nothing else.
 */

import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';

import type { ComposerRecordPatch, ComposerRecordReadResult } from '#db/composer-record-store.js';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import { draftPersistenceFor } from '#hooks/composer-record.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { composerRecordMachine } from '#machines/composer-record.machine.js';

const unused = async (): Promise<never> => {
  throw new Error('The selection hand-off never touches the store.');
};

// Typed as the whole event: a union-typed const would narrow to `absent` and stop matching the actor.
const recordRead: { type: 'recordRead'; result: ComposerRecordReadResult } = {
  type: 'recordRead',
  result: { status: 'absent' },
};

const store = createComposerRecordStore(
  { readFile: unused, writeFile: unused, exists: unused, readdir: unused, unlink: unused, rmdir: unused },
  composerRecordPaths.chat('project_1', 'chat_1'),
);

describe('draftPersistenceFor', () => {
  it('hands a selection change to the record as one patch of exactly the touched fields', async () => {
    const writes: ComposerRecordPatch[] = [];
    const record = createActor(
      composerRecordMachine.provide({
        actors: {
          readRecordActor: fromSafeAsync(async () => recordRead),
          writePatchActor: fromSafeAsync(async ({ input }: { input: ComposerRecordPatch }) => {
            writes.push(input);
          }),
          removeRecordActor: fromSafeAsync(async () => {
            await unused().catch(() => undefined);
          }),
        },
      }),
      { input: {} },
    ).start();
    const send = vi.spyOn(record, 'send');

    createActor(draftPersistenceFor(record, store).persistSelectionActor, { input: { mode: 'plan' } }).start();
    await vi.waitFor(() => {
      expect(writes).toEqual([{ mode: 'plan' }]);
    });

    expect(send.mock.calls).toEqual([[{ type: 'patch', fields: { mode: 'plan' } }]]);
    record.stop();
  });
});
