import { describe, expect, it, vi } from 'vitest';

import { createCommandOwner } from '#channel/command-owner.js';
import { emptyChatLedger } from '#log/chat-ledger.js';
import type { ChatLedger } from '#log/chat-ledger.js';
import type { HostCommand } from '#wire/commands.schema.js';

const steer = (commandId: string): HostCommand => ({
  type: 'steer',
  commandId,
  payload: { chatId: 'c', runId: 'r', message: 'thicker' },
});

const cancel = (commandId: string): HostCommand => ({
  type: 'cancel',
  commandId,
  payload: { chatId: 'c', runId: 'r' },
});

describe('createCommandOwner (SC-R4, SC-R7–SC-R9)', () => {
  it('should run a re-sent steer once, and answer the re-send as the original (L2b HD-13)', async () => {
    const effect = vi.fn(async () => ({ delivery: 'queued' }));
    const execute = createCommandOwner({ ledger: async () => emptyChatLedger, effect });

    const first = await execute(steer('k1'));
    const again = await execute(steer('k1'));

    expect(effect).toHaveBeenCalledTimes(1);
    expect(again).toEqual(first);
    expect(first).toMatchObject({ status: 'applied', effect: 'not-applied', details: { delivery: 'queued' } });
  });

  it('should answer from the applied set before deciding', async () => {
    const ledger: ChatLedger = { ...emptyChatLedger, maxEpoch: 3, applied: { k1: { cursor: 7, runId: 'r' } } };
    const effect = vi.fn(async () => undefined);
    const execute = createCommandOwner({ ledger: async () => ledger, effect });

    await expect(execute(cancel('k1'))).resolves.toEqual({
      commandId: 'k1',
      generation: 3,
      status: 'replayed',
      effect: 'durable',
      cursor: 7,
    });
    expect(effect).not.toHaveBeenCalled();
  });

  it('should give a duplicate in flight the original answer, marked replayed (SC-R8)', async () => {
    let ledger: ChatLedger = emptyChatLedger;
    const gate = Promise.withResolvers<void>();
    const effect = vi.fn(async () => {
      await gate.promise;
      ledger = { ...ledger, applied: { k1: { cursor: 0 } } };
      return undefined;
    });
    const execute = createCommandOwner({ ledger: async () => ledger, effect });

    const original = execute(cancel('k1'));
    const duplicate = execute(cancel('k1'));
    gate.resolve();

    await expect(original).resolves.toMatchObject({ status: 'applied', effect: 'durable', cursor: 0 });
    await expect(duplicate).resolves.toMatchObject({ status: 'replayed', effect: 'durable', cursor: 0 });
    expect(effect).toHaveBeenCalledTimes(1);
  });

  it('should refuse an unreadable payload without running it (SC-R4)', async () => {
    const effect = vi.fn(async () => undefined);
    const execute = createCommandOwner({ ledger: async () => emptyChatLedger, effect });

    const answer = await execute({
      type: 'cancel',
      commandId: 'k1',
      payload: { chatId: 'c' },
    } as unknown as HostCommand);

    expect(answer).toMatchObject({ status: 'refused', effect: 'not-applied', code: 'COMMAND_UNREADABLE' });
    expect(effect).not.toHaveBeenCalled();
  });

  it('should answer a coded refusal as data, and a possibly-landed write as effect unknown', async () => {
    const refusing = createCommandOwner({
      ledger: async () => emptyChatLedger,
      effect: async () => {
        throw Object.assign(new Error('busy'), { code: 'CHAT_RUN_LIVE', details: { state: 'running' } });
      },
    });
    await expect(refusing(cancel('k1'))).resolves.toMatchObject({
      status: 'refused',
      effect: 'not-applied',
      code: 'CHAT_RUN_LIVE',
      details: { state: 'running' },
    });

    const shortWrite = createCommandOwner({
      ledger: async () => emptyChatLedger,
      effect: async () => {
        throw Object.assign(new Error('short'), { code: 'STORAGE_SHORT_WRITE' });
      },
    });
    await expect(shortWrite(cancel('k2'))).resolves.toMatchObject({ status: 'refused', effect: 'unknown' });
  });

  it('should refuse a resume of a run that is not current, and a model change it cannot make', async () => {
    const ledger: ChatLedger = { ...emptyChatLedger, currentRunId: 'r2' };
    const execute = createCommandOwner({ ledger: async () => ledger, effect: async () => undefined });

    await expect(
      execute({ type: 'resume', commandId: 'k1', payload: { chatId: 'c', runId: 'r1' } }),
    ).resolves.toMatchObject({ status: 'refused', code: 'RESUME_UNAVAILABLE' });
    await expect(
      execute({
        type: 'resume',
        commandId: 'k2',
        payload: { chatId: 'c', runId: 'r2', selection: { id: 'm', providerKind: 'anthropic', contextWindow: 1 } },
      }),
    ).resolves.toMatchObject({ status: 'refused', code: 'COMMAND_UNSUPPORTED' });
  });

  it('should rethrow an uncoded failure as a defect', async () => {
    const execute = createCommandOwner({
      ledger: async () => emptyChatLedger,
      effect: async () => {
        throw new Error('bug');
      },
    });
    await expect(execute(cancel('k1'))).rejects.toThrow('bug');
  });
});
