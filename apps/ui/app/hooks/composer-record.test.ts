/**
 * The record seam (blueprint §"The seam"): what `draftPersistenceFor` hands the
 * draft machine must reach the record as a patch, and nothing else.
 */

import { createActor } from 'xstate';
import type { MyUIMessage } from '@taucad/chat';
import { describe, expect, it, vi } from 'vitest';

import type { ComposerRecordPatch, ComposerRecordReadResult } from '#db/composer-record-store.js';
import { composerRecordPaths, createComposerRecordStore } from '#db/composer-record-store.js';
import { createComposerRecordActor, draftPersistenceFor } from '#hooks/composer-record.js';
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
  it('should hand a selection change to the record as one patch of exactly the touched fields', async () => {
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

  /* The rest of the seam, each against a real store: a removed or miswired actor fails its row (S18). */
  describe('against a real record', () => {
    const notFound = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
    const path = composerRecordPaths.chat('project_1', 'chat_2');
    const open = () => {
      const files = new Map<string, Uint8Array<ArrayBuffer>>();
      const client = {
        readFile: async (file: string) => {
          const bytes = files.get(file);
          if (bytes === undefined) {
            throw notFound(file);
          }
          return bytes;
        },
        writeFile: async (file: string, data: Uint8Array<ArrayBuffer>) => {
          files.set(file, data);
        },
        exists: async (file: string) => files.has(file),
        readdir: async (file: string) => {
          throw notFound(file);
        },
        unlink: async (file: string) => {
          files.delete(file);
        },
        rmdir: async () => undefined,
      };
      const realStore = createComposerRecordStore(client, path);
      const record = createComposerRecordActor(realStore);
      record.start();
      const actors = draftPersistenceFor(record, realStore);
      const onDisk = async () => realStore.read();
      return { files, realStore, record, actors, onDisk };
    };
    const message = (text: string): MyUIMessage => ({
      id: 'draft',
      role: 'user',
      metadata: { createdAt: 1, status: 'pending' },
      parts: [{ type: 'text', text }],
    });

    it('should write the draft through persistDraftActor', async () => {
      const { record, actors, onDisk } = open();
      createActor(actors.persistDraftActor, { input: { draft: message('typed') } }).start();

      await expect.poll(onDisk).toMatchObject({ status: 'valid', record: { draft: message('typed') } });
      record.stop();
    });

    it('should write one edit through persistEditDraftActor', async () => {
      const { record, actors, onDisk } = open();
      createActor(actors.persistEditDraftActor, { input: { messageId: 'msgOne', draft: message('revised') } }).start();

      await expect.poll(onDisk).toMatchObject({
        status: 'valid',
        record: { messageEdits: { msgOne: message('revised') } },
      });
      record.stop();
    });

    it('should drop one edit through clearMessageEditActor', async () => {
      const { record, actors, onDisk, realStore } = open();
      await realStore.patch({ messageEdits: { msgOne: message('revised'), msgTwo: message('kept') } });
      createActor(actors.clearMessageEditActor, { input: { messageId: 'msgOne' } }).start();

      await expect.poll(onDisk).toEqual({
        status: 'valid',
        record: { version: 1, messageEdits: { msgTwo: message('kept') } },
      });
      record.stop();
    });

    it('should store bytes beside the record through storeAttachmentActor', async () => {
      const { record, actors, files } = open();
      const png = new Uint8Array([137, 80, 78, 71]);
      const done = Promise.withResolvers<unknown>();
      createActor(actors.storeAttachmentActor, { input: { bytes: png, mediaType: 'image/png' } })
        .start()
        .subscribe({
          complete: () => {
            done.resolve(undefined);
          },
        });
      await done.promise;

      expect([...files.keys()].filter((file) => file.includes('/attachments/'))).toHaveLength(1);
      record.stop();
    });
  });

  it("should root each pre-project surface's attachments in a directory of its own", () => {
    expect(composerRecordPaths.surfaceAttachments('marketing')).toBe('/.tau/composers/marketing/attachments');
    expect(composerRecordPaths.surfaceAttachments('library')).toBe('/.tau/composers/library/attachments');
  });
});
