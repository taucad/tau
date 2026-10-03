/**
 * Open one ACP session over the child machine (W10 EA-S5).
 */

import { createActor, waitFor } from 'xstate';
import type { ContentBlock, SessionConfigOption } from '@agentclientprotocol/sdk';

import type { ExternalAgentTurn } from '@taucad/agent-host/launcher';

import { provideAcpSession } from '#acp/acp-session-logic.js';
import { failureError, failureOfError } from '#acp/acp-session.machine.js';
import type { AcpFailure, AcpTurnResult } from '#acp/acp-session.machine.js';
import { confirmedConfiguration, modelChoice } from '#acp/session.js';
import type { AcpPromptTurn, AcpSession, AcpTurnOutcome, OpenAcpSessionOptions } from '#acp/session.js';
import type { AcpWireFrame } from '#acp/spawn.js';

/** A lent turn's seams: the prompt seams, and the record writer when the turn has one. */
export type AcpLentSeams = AcpPromptTurn & { readonly remember?: ExternalAgentTurn['remember'] | undefined };

/** What {@link provideAcpSession} needs from its owner. */
export type AcpSessionEffects = {
  readonly createId: () => string;
  readonly onFrame?: ((frame: AcpWireFrame) => void) | undefined;
  /** The seams of the turn lent under this request id. */
  readonly seams: (requestId: string) => AcpLentSeams | undefined;
  /** Activate the MCP binding for this turn; the returned function releases it (EA-R6). */
  readonly bind?:
    | ((requestId: string, token: string | undefined) => (() => void | Promise<void>) | undefined)
    | undefined;
  /** The skill publication's directories, named on every session open (D-040). */
  readonly publishSkills: (signal: AbortSignal) => Promise<readonly string[]>;
};

const sessionClosed: AcpFailure = { code: 'EXTERNAL_AGENT_FAILED', message: 'The ACP session is closed.' };

/**
 * Open — or restore — one ACP session, and keep it alive until it is closed.
 *
 * One `acpSession` child with no parent: every turn is one lend, and `close`
 * runs the close ladder (EA-R7).
 *
 * @param options - Adapter, working directory, MCP servers and the session to restore.
 * @returns The live session: its id, its options, and the seams to prompt and close it.
 * @public
 *
 * @example <caption>One session, two turns</caption>
 * ```typescript
 * import { openAcpSession } from '@taucad/host';
 * import type { AcpAdapter } from '@taucad/host';
 *
 * declare const adapter: AcpAdapter;
 * declare const turn: Parameters<Awaited<ReturnType<typeof openAcpSession>>['prompt']>[1];
 * const session = await openAcpSession({ adapter, cwd: process.cwd(), createId: () => '1' });
 * await session.prompt('Model a bracket.', turn);
 * await session.prompt('Now fillet it.', turn);
 * await session.close();
 * ```
 */
export const openAcpSession = async (options: OpenAcpSessionOptions): Promise<AcpSession> => {
  const turns = new Map<string, AcpPromptTurn>();
  const logic = provideAcpSession({
    createId: options.createId,
    ...(options.onFrame ? { onFrame: options.onFrame } : {}),
    seams: (requestId) => turns.get(requestId),
    publishSkills: async () => [...(options.additionalDirectories ?? [])],
  });
  const actor = createActor(logic, {
    input: {
      key: options.adapter.id,
      opening: {
        adapter: options.adapter,
        cwd: options.cwd,
        mcpServers: [...(options.mcpServers ?? [])],
        ...(options.acpSessionId === undefined ? {} : { acpSessionId: options.acpSessionId }),
        ...(options.priorUsage === undefined ? {} : { priorUsage: options.priorUsage }),
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        sessionMessageId: options.sessionMessageId ?? options.createId(),
        sessionCommitted: options.sessionMessageId !== undefined,
        notices: false,
      },
    },
  });
  const closed = Promise.withResolvers<AcpFailure | undefined>();
  actor.on('closed', (event) => {
    closed.resolve(event.failure);
  });
  /* The transport is gone once the adapter has exited, which may precede `closed` while a cancelled turn drains. */
  const exited = Promise.withResolvers<void>();
  actor.subscribe((snapshot) => {
    if (snapshot.context.exited || snapshot.status !== 'active') {
      exited.resolve();
    }
  });
  actor.subscribe({
    error: (error) => {
      closed.resolve(failureOfError(error, options.adapter));
    },
  });
  /* A turn still waiting when the session closes ends with the reason it closed. */
  const closedTurn = async (): Promise<AcpTurnResult> => {
    const failure = await closed.promise;
    return { ok: false, failure: failure ?? sessionClosed };
  };
  const ended = new Map<string, (outcome: AcpTurnResult) => void>();
  actor.on('turnEnded', (event) => {
    ended.get(event.requestId)?.(event.outcome);
  });
  const opened = Promise.withResolvers<void>();
  actor.on('opened', () => {
    opened.resolve();
  });
  // async-iife: bootstrap -- an open that closes first rejects with the reason it closed.
  void (async () => {
    const failure = await closed.promise;
    opened.reject(failureError(failure ?? sessionClosed));
  })();
  const onBootstrapAbort = (): void => {
    actor.send({ type: 'cancel' });
  };
  options.signal?.addEventListener('abort', onBootstrapAbort, { once: true });
  actor.start();
  if (options.signal?.aborted) {
    onBootstrapAbort();
  }
  try {
    await opened.promise;
  } finally {
    options.signal?.removeEventListener('abort', onBootstrapAbort);
  }

  const context = () => actor.getSnapshot().context;
  let sequence = 0;
  return {
    acpSessionId: context().acpSessionId ?? '',
    contextLost: context().contextLost,
    agent: context().facts,
    get configOptions() {
      return context().configOptions;
    },
    probeModel: async (model: string): Promise<readonly SessionConfigOption[] | undefined> => {
      await waitFor(actor, (snapshot) => snapshot.matches({ idle: 'resting' }));
      const requestId = `probe-${String(sequence++)}`;
      const result = Promise.withResolvers<readonly SessionConfigOption[] | undefined>();
      const subscription = actor.on('modelProbed', (event) => {
        if (event.requestId !== requestId) {
          return;
        }
        if (event.failure === undefined) {
          result.resolve(event.configOptions);
        } else {
          result.reject(failureError(event.failure));
        }
      });
      try {
        actor.send({ type: 'probeModel', requestId, model });
        return await Promise.race([
          result.promise,
          closed.promise.then((failure) => {
            throw failureError(failure ?? sessionClosed);
          }),
        ]);
      } finally {
        subscription.unsubscribe();
      }
    },
    get modeId() {
      return context().presentation.modeId;
    },
    get usage() {
      return context().priorUsage;
    },
    get limit() {
      return context().limit;
    },
    get title() {
      return context().presentation.title;
    },
    closed: (async (): Promise<void> => {
      await Promise.race([exited.promise, closed.promise]);
    })(),
    close: async () => {
      actor.send({ type: 'close' });
      await closed.promise;
    },
    // oxlint-disable-next-line eslint/max-params -- Mirrors the public ACP session port without a second options wrapper.
    prompt: async (prompt, turn, model, configuration): Promise<AcpTurnOutcome> => {
      if (actor.getSnapshot().status !== 'active') {
        throw failureError(sessionClosed);
      }
      const requestId = `prompt-${String(sequence++)}`;
      const blocks: readonly ContentBlock[] = typeof prompt === 'string' ? [{ type: 'text', text: prompt }] : prompt;
      const outcome = Promise.withResolvers<AcpTurnResult>();
      ended.set(requestId, outcome.resolve);
      turns.set(requestId, turn);
      /* Cancellation stops the *prompt* (D12): the session stays up for the next turn. */
      const onAbort = (): void => {
        actor.send({ type: 'cancel' });
      };
      turn.signal.addEventListener('abort', onAbort, { once: true });
      try {
        actor.send({
          type: 'lend',
          lend: {
            requestId,
            ...(model === undefined ? {} : { model }),
            ...(configuration === undefined ? {} : { configuration }),
            prompt: { reattached: blocks, fresh: blocks },
          },
        });
        if (turn.signal.aborted) {
          onAbort();
        }
        const result = await Promise.race([outcome.promise, closedTurn()]);
        if (!result.ok) {
          throw failureError(result.failure);
        }
        const settled = context();
        return {
          stopReason: result.stopReason as AcpTurnOutcome['stopReason'],
          acpSessionId: settled.acpSessionId ?? '',
          model: modelChoice(settled.configOptions)?.currentValue ?? model,
          title: result.title,
          ...(settled.priorUsage === undefined ? {} : { usage: settled.priorUsage }),
          configuration: confirmedConfiguration(settled.configOptions),
        };
      } finally {
        turn.signal.removeEventListener('abort', onAbort);
        ended.delete(requestId);
        turns.delete(requestId);
      }
    },
  };
};
