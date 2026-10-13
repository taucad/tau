import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineActions, machineAlphabet } from '@taucad/formal/drift';
import { createChatMessageQueueStore, chatMessageQueuePath } from '#db/chat-message-queue-store.js';
import type { QueuedChatMessage } from '#db/chat-message-queue-store.js';
import { KeyedMutex } from '#db/keyed-mutex.js';
import { chatMessageQueueMachine } from '#machines/chat-message-queue.machine.js';

const specs = import.meta.dirname;
const workspace = path.resolve(specs, '../../../..');
const item = (id: string): QueuedChatMessage => ({
  id,
  requestId: `req_${id}`,
  message: { id, role: 'user', parts: [{ type: 'text', text: id }] },
});

describe('MessageQueue.tla implementation correspondence', () => {
  it('should require review of the model when the delivery or persistence seam changes', () => {
    expect(
      driftManifestProblems(path.join(specs, 'MessageQueue/drift.json'), {
        alphabet: machineAlphabet([chatMessageQueueMachine]),
        versions: { [chatMessageQueueMachine.id]: chatMessageQueueMachine.version },
        actions: machineActions([chatMessageQueueMachine]),
        tables: hashFiles(specs, [
          'expected.json',
          'MessageQueue.target.cfg',
          'MessageQueue.today.cfg',
          'MessageQueue.duplicate.cfg',
          'MessageQueue.lost-payload.cfg',
          'MessageQueue.follower-lag.cfg',
          'MessageQueue.wrong-cancel.cfg',
          'MessageQueue.early-steer.cfg',
        ]),
        sources: hashFiles(workspace, [
          'apps/ui/app/db/chat-message-queue-store.ts',
          'apps/ui/app/machines/chat-message-queue.machine.ts',
          'apps/ui/app/services/chat-session-store.ts',
          'apps/ui/app/chat-clients/chat-turn-host.tsx',
          'apps/ui/app/components/chat/chat-message-queue.tsx',
          'apps/ui/app/components/chat/chat-message-queue-view.tsx',
          'apps/ui/app/components/chat/chat-textarea.tsx',
          'apps/ui/app/hooks/use-chat.tsx',
        ]),
        specs: hashFiles(specs, ['MessageQueue.tla']),
      }),
    ).toEqual([]);
  });

  it('should retain the prepared command through lost acknowledgement and publish the run barrier to another tab', async () => {
    const files = new Map<string, Uint8Array<ArrayBuffer>>();
    const client = {
      readFile: async (file: string) => {
        const bytes = files.get(file);
        if (bytes === undefined) {
          throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        }
        return bytes;
      },
      writeFile: async (file: string, bytes: Uint8Array<ArrayBuffer>) => {
        files.set(file, bytes);
      },
      unlink: async (file: string) => {
        files.delete(file);
      },
    };
    const mutex = new KeyedMutex<string>();
    const open = () =>
      createChatMessageQueueStore(client, chatMessageQueuePath('project', 'chat'), mutex.run.bind(mutex));
    const first = open();
    const follower = open();
    const one = item('one');
    const two = item('two');
    // Submit(one), Submit(two), Prepare(one). The service owns completion gating.
    await first.enqueue(one);
    await follower.enqueue(two);
    const command = {
      type: 'start',
      commandId: one.requestId,
      payload: {
        chatId: 'chat',
        runId: one.requestId,
        trigger: 'submit',
        message: { id: one.id, role: 'user', content: 'one' },
      },
    } as const;
    await first.update((record) => ({ ...record, items: [{ ...one, command }, two] }));
    const prepared = await first.read();
    const preparedBytes = JSON.stringify(prepared.items[0]?.command);
    // Deliver, LoseAck, Crash, Reopen, Recover: a new store sees the original command.
    const recovered = open();
    const replay = await recovered.read();
    expect(JSON.stringify(replay.items[0]?.command)).toBe(preparedBytes);
    await recovered.acknowledge(one.id, 'unrelated-command');
    const unacknowledged = await follower.read();
    expect(unacknowledged.items.map((entry) => entry.id)).toEqual(['one', 'two']);
    // Acknowledge: deletion and the successor's visibility barrier are one durable write.
    await recovered.acknowledge(one.id, command.commandId);
    expect(await follower.read()).toEqual({ version: 1, items: [two], afterRunId: command.payload.runId });
    expect(await open().read()).toEqual(await follower.read());
    await first.acknowledge(one.id, command.commandId);
    expect(await follower.read()).toEqual({ version: 1, items: [two], afterRunId: command.payload.runId });
  });
});
