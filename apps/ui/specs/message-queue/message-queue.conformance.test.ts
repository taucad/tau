import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { driftManifestProblems, hashFiles, machineActions, machineAlphabet } from '@taucad/formal/drift';
import { createChatMessageQueueStore, chatMessageQueuePath } from '#db/chat-message-queue-store.js';
import type { QueuedChatMessage } from '#db/chat-message-queue-store.js';
import { KeyedMutex } from '#db/keyed-mutex.js';
import { chatMessageQueueMachine } from '#machines/chat-message-queue.machine.js';
import { chatSessionMachine } from '#machines/chat-session.machine.js';

const specs = import.meta.dirname;
const workspace = path.resolve(specs, '../../../..');
const item = (id: string): QueuedChatMessage => ({
  id,
  requestId: `req_${id}`,
  message: { id, role: 'user', parts: [{ type: 'text', text: id }] },
});

const queueFixture = () => {
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
  return { open };
};

describe('MessageQueue.tla implementation correspondence', () => {
  it('should require review of the model when the delivery or persistence seam changes', () => {
    expect(
      driftManifestProblems(path.join(specs, 'MessageQueue/drift.json'), {
        alphabet: machineAlphabet([chatMessageQueueMachine, chatSessionMachine]),
        versions: {
          [chatMessageQueueMachine.id]: chatMessageQueueMachine.version,
          [chatSessionMachine.id]: chatSessionMachine.version,
        },
        actions: machineActions([chatMessageQueueMachine, chatSessionMachine]),
        tables: hashFiles(specs, [
          'expected.json',
          'MessageQueue.target.cfg',
          'MessageQueue.today.cfg',
          'MessageQueue.duplicate.cfg',
          'MessageQueue.lost-payload.cfg',
          'MessageQueue.follower-lag.cfg',
          'MessageQueue.wrong-cancel.cfg',
          'MessageQueue.early-steer.cfg',
          'MessageQueue.release-stopped.cfg',
          'MessageQueue.late-terminal-capture.cfg',
        ]),
        sources: hashFiles(workspace, [
          'apps/ui/app/db/chat-message-queue-store.ts',
          'apps/ui/app/machines/chat-message-queue.machine.ts',
          'apps/ui/app/machines/chat-session.machine.ts',
          'apps/ui/app/services/chat-session-store.ts',
          'apps/ui/app/chat-clients/chat-turn-host.tsx',
          'apps/ui/app/chat-clients/_internal/use-turn-admission.ts',
          'apps/ui/app/chat-clients/use-cad-chat-client.ts',
          'apps/ui/app/components/chat/chat-message-queue.tsx',
          'apps/ui/app/components/chat/chat-message-queue-view.tsx',
          'apps/ui/app/components/chat/chat-textarea.tsx',
          'apps/ui/app/hooks/use-chat.tsx',
        ]),
        specs: hashFiles(specs, ['MessageQueue.tla']),
      }),
    ).toEqual([]);
  });

  it('should preserve gesture-time terminal permission without granting it to an older queued head on reopen', async () => {
    const { open } = queueFixture();
    const beforeStop = item('before-stop');
    const afterStop = { ...item('after-stop'), afterTerminalRunId: 'stopped-run' };
    const first = open();
    await first.enqueue(beforeStop);
    await first.enqueue(afterStop);
    const reopened = await open().read();
    expect(reopened.items).toEqual([beforeStop, afterStop]);
    // Persistence preserves intent and FIFO; the service, not this store, decides eligibility.
    await open().change(afterStop.id, (entry) => ({
      ...entry,
      message: { ...entry.message, parts: [{ type: 'text', text: 'edited' }] },
    }));
    const edited = await open().read();
    expect(edited.items.map((entry) => entry.id)).toEqual([beforeStop.id, afterStop.id]);
    expect(edited.items[0]).toEqual(beforeStop);
    expect(edited.items[1]).toMatchObject({ afterTerminalRunId: 'stopped-run' });
  });

  it('should retain the prepared command through lost acknowledgement and publish the run barrier to another tab', async () => {
    const { open } = queueFixture();
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
