/*
 * The lent turn `provideAcpSession` gives `acpSession` (W10-F1): its opening record and its final one are
 * written in order, even when a cancel ends the turn while it is still binding.
 */

import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';

import { flush } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors, createFakeParent } from '@taucad/xstate-testing/fakes';

import { provideAcpSession } from '#acp/acp-session-logic.js';
import type { AcpLentSeams } from '#acp/acp-session-logic.js';
import type { AcpAdapter } from '#acp/registry.js';
import { protocolVersion } from '#acp/session.js';

const adapter: AcpAdapter = {
  id: 'fake',
  displayName: 'Fake',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath: '/nonexistent',
};

describe('provideAcpSession', () => {
  it('should write the final record only after the opening record a binding cancel overtook', async () => {
    const opening = Promise.withResolvers<void>();
    const settled: string[] = [];
    const remember = vi.fn<NonNullable<AcpLentSeams['remember']>>(async () => {
      const which = remember.mock.calls.length === 1 ? 'opening' : 'final';
      if (which === 'opening') {
        await opening.promise;
      }
      settled.push(which);
    });
    const seams: AcpLentSeams = {
      append: async () => undefined,
      approve: async () => ({ interruptId: 'unused', outcome: 'denied' }),
      signal: new AbortController().signal,
      remember,
    };
    const fakes = createFakeCallbackActors();
    const parent = createFakeParent();
    const machine = provideAcpSession({
      createId: () => crypto.randomUUID(),
      seams: () => seams,
      publishSkills: async () => [],
    }).provide({ actors: { adapterConnection: fakes.actor('connection') } });
    const actor = createActor(machine, {
      input: {
        key: 'fake:chat-1',
        opening: {
          adapter,
          cwd: '/work',
          mcpServers: [],
          sessionMessageId: 'session-message',
          sessionCommitted: false,
          notices: true,
        },
        lend: { requestId: 'run-1:0', prompt: { fresh: [{ type: 'text', text: 'hi' }] } },
        parentRef: parent.ref,
      },
    });
    actor.start();
    const answer = (result: unknown): void => {
      const call = fakes.deliveries
        .filter((delivery) => delivery.name === 'connection')
        .map((delivery) => delivery.event)
        .findLast((event) => event.type === 'call');
      fakes.sendBack('connection', {
        type: 'callSettled',
        id: String(call?.['id']),
        at: 0,
        answer: { method: String(call?.['method']), result },
      });
    };
    await flush();
    answer({ protocolVersion, agentCapabilities: {} });
    answer({ sessionId: 'acp-1' });
    await flush();
    expect(actor.getSnapshot().matches({ busy: 'binding' })).toBe(true);
    expect(remember).toHaveBeenCalledOnce();

    actor.send({ type: 'cancel' });
    await flush();
    await flush();

    /* The final record waits for the opening one it would otherwise overwrite with a stale envelope. */
    expect(remember).toHaveBeenCalledOnce();
    opening.resolve();
    await vi.waitFor(() => {
      expect(settled).toEqual(['opening', 'final']);
    });
    expect(parent.events.filter((event) => event.type === 'turnEnded')).toMatchObject([
      { requestId: 'run-1:0', resting: true, outcome: { ok: false, failure: { code: 'EXTERNAL_AGENT_CANCELLED' } } },
    ]);
    actor.stop();
    parent.stop();
  });
});
