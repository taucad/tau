import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors, validated } from '@taucad/xstate-testing/inspect';
import { unansweredEvents, unreachedStates } from '@taucad/xstate-testing/paths';
import { describe, expect, it, vi } from 'vitest';
import { createActor, createAsyncLogic, waitFor } from 'xstate';
import type { AnyMachineSnapshot } from 'xstate';
import {
  createChatMessageQueueActor,
  chatMessageQueueMachine,
  chatMessageQueueIgnoredEvents,
} from './chat-message-queue.machine.js';
import type {
  ChatMessageQueueActors,
  ChatMessageQueueMachineInput,
  QueueAdvanceResult,
} from './chat-message-queue.machine.js';

const input = { chatId: 'chat', projectId: 'project' };
const waiting: QueueAdvanceResult = { items: [], status: 'waiting' };
const setupActor = (advance: (signal: AbortSignal, canDeliver: boolean) => Promise<QueueAdvanceResult>) => {
  const cleanup = vi.fn();
  const guard = guardActors({ ignore: { 'chat-message-queue': chatMessageQueueIgnoredEvents } });
  const actor = createChatMessageQueueActor(
    input,
    { advance, watch: () => cleanup },
    { clock: new StepClock(), inspect: guard.inspect },
  );
  actor.start();
  return { actor, cleanup };
};
describe('chat message queue coordination', () => {
  it.each([
    { ...input, chatId: '' },
    { ...input, projectId: '' },
  ])('should reject an empty identity at the validated boundary: %j', (invalidInput) => {
    const guard = guardActors({ ignore: { 'chat-message-queue': chatMessageQueueIgnoredEvents } });
    const errors: unknown[] = [];
    const actor = createActor(validated(chatMessageQueueMachine), {
      input: invalidInput,
      clock: new StepClock(),
      inspect: guard.inspect,
    });
    actor.subscribe({ error: (error) => errors.push(error) });
    actor.start();
    expect(actor.getSnapshot().status).toBe('error');
    expect(errors).toHaveLength(1);
    expect(String(errors[0])).toContain('Invalid input');
    guard.take('fault');
    actor.stop();
  });

  it('should refuse a missing watcher instead of silently losing future queue updates', async () => {
    const guard = guardActors({ ignore: { 'chat-message-queue': chatMessageQueueIgnoredEvents } });
    const actor = createActor(
      validated(
        chatMessageQueueMachine.provide({
          actors: {
            advance: createAsyncLogic<
              QueueAdvanceResult & { revision: number },
              ChatMessageQueueMachineInput & { revision: number }
            >({ run: async () => ({ ...waiting, revision: 0 }) }),
          } satisfies Partial<ChatMessageQueueActors>,
        }),
      ),
      { input, clock: new StepClock(), inspect: guard.inspect },
    );
    actor.start();
    await waitFor(actor, (snapshot) => snapshot.matches('waiting') || snapshot.matches('failed'));
    expect(actor.getSnapshot().context.error).toBe('Error: chatMessageQueueMachine: watch was not provided.');
    guard.take('fault');
    actor.stop();
  });

  it('should serialize refreshes without aborting an in-flight delivery', async () => {
    const first = Promise.withResolvers<QueueAdvanceResult>();
    const advance = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockResolvedValue(waiting);
    const { actor, cleanup } = setupActor(advance);
    actor.send({ type: 'refresh' });
    actor.send({ type: 'refresh' });
    expect(advance).toHaveBeenCalledTimes(1);
    first.resolve(waiting);
    await waitFor(actor, (snapshot) => snapshot.matches('waiting'));
    expect(advance).toHaveBeenCalledTimes(2);
    expect(() => JSON.stringify(actor.getSnapshot().context)).not.toThrow();
    actor.stop();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('should retain a failure until an explicit retry without looping on streamed updates', async () => {
    const advance = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(waiting);
    const { actor } = setupActor(advance);
    await waitFor(actor, (snapshot) => snapshot.matches('failed'));
    expect(actor.getSnapshot().context.error).toBe('disk full');
    actor.send({ type: 'refresh' });
    await waitFor(actor, (snapshot) => snapshot.matches('waiting'));
    expect(advance).toHaveBeenCalledTimes(2);
    expect(advance.mock.calls[1]?.[1]).toBe(false);
    expect(actor.getSnapshot().context.error).toBeUndefined();
    actor.stop();
  });
  it('should abort only when its owning session closes', async () => {
    let signal: AbortSignal | undefined;
    const { actor } = setupActor(async (value) => {
      signal = value;
      return new Promise(() => {
        /* Held until owner closes. */
      });
    });
    actor.stop();
    expect(signal?.aborted).toBe(true);
  });
  it('should answer every event and reach every state', () => {
    const options = {
      input,
      events: [
        { type: 'refresh' },
        { type: 'watchFailed', error: 'Disconnected' },
        { type: 'retry' },
        { type: 'loaded', items: [] },
        { type: 'xstate.done.actor.advance', output: { ...waiting, revision: 0 } },
        { type: 'xstate.error.actor.advance', error: new Error('failed') },
        { type: 'xstate.done.actor.read', output: waiting },
        { type: 'xstate.error.execution', error: new Error('failed') },
      ],
      limit: 100,
      serializeState: (snapshot: AnyMachineSnapshot) => JSON.stringify(snapshot.value),
    };
    expect(unansweredEvents(chatMessageQueueMachine, { ...options, ignore: chatMessageQueueIgnoredEvents })).toEqual(
      [],
    );
    expect(unreachedStates(chatMessageQueueMachine, options)).toEqual([]);
  });
});
