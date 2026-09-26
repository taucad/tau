/**
 * The effects `acpSession` runs, and `openAcpSession` over one child (W10 EA-S5).
 *
 * {@link provideAcpSession} gives the pure machine its four actors. The turn's
 * seams are looked up by request id through `seams`, so no function enters the
 * machine's context (MC-R5); the log projection (`createTurnProjection`, whose
 * text checkpoint is E23) lives inside the `lentTurn` actor for exactly one lend.
 */

import { createActor, createAsyncLogic, createCallbackLogic } from 'xstate';
import type { ContentBlock } from '@agentclientprotocol/sdk';

import type { ExternalAgentLogEvent, ProviderMessage } from '@taucad/agent-host';
import type { ExternalAgentTurn } from '@taucad/agent-host/launcher';

import { acpSessionMachine, failureError, failureOfError } from '#acp/acp-session.machine.js';
import type { AcpSessionEvent } from '#acp/acp-machine-schemas.js';
import type {
  AcpFailure,
  AcpLentTurnCommand,
  AcpLentTurnInput,
  AcpPresentationInput,
  AcpTurnResult,
  AcpVendorAnswer,
} from '#acp/acp-session.machine.js';
import { createAdapterConnection } from '#acp/adapter-connection.js';
import {
  asJson,
  chooseOption,
  confirmedConfiguration,
  createTurnProjection,
  modelChoice,
  readSessionTextFile,
  urlLoginOf,
  writeSessionTextFile,
} from '#acp/session.js';
import type {
  AcpPromptTurn,
  AcpSession,
  AcpSessionPresentation,
  AcpTurnOutcome,
  OpenAcpSessionOptions,
} from '#acp/session.js';
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

type SessionWriter = (events: readonly ExternalAgentLogEvent[]) => Promise<void>;

const errorAnswer = (error: unknown): AcpVendorAnswer => {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  return {
    error: {
      message: error instanceof Error ? error.message : String(error),
      code: typeof code === 'string' ? code : 'EXTERNAL_AGENT_FAILED',
    },
  };
};

/**
 * The child machine with its effects.
 *
 * @param effects - Ids, the wire tap, the seams lookup, the MCP binding and the skill publication.
 * @returns `acpSessionMachine` provided with its actors.
 * @internal
 */
export const provideAcpSession = (effects: AcpSessionEffects): typeof acpSessionMachine => {
  /* Envelopes already in the log, so the next write replaces rather than appends. */
  const committed = new Set<string>();
  /* The last lent turn's session writer per key: a presentation between turns belongs to it (`session.ts` V6). */
  const writers = new Map<string, SessionWriter>();

  const persist = async (
    write: SessionWriter,
    input: Pick<AcpPresentationInput, 'agentId' | 'sessionMessageId' | 'sessionCommitted'>,
    state: AcpSessionPresentation,
  ): Promise<void> => {
    const id = input.sessionMessageId;
    if (input.sessionCommitted) {
      committed.add(id);
    }
    const message: ProviderMessage = {
      id,
      role: 'assistant',
      content: [
        asJson({
          type: 'acp-session',
          agentId: input.agentId,
          commands: state.commands,
          configOptions: state.configOptions,
          ...(state.sessionId === undefined ? {} : { sessionId: state.sessionId }),
          ...(state.title === undefined ? {} : { title: state.title }),
          ...(state.plan === undefined ? {} : { plan: state.plan }),
          ...(state.modeId === undefined ? {} : { modeId: state.modeId }),
          ...(state.modes === undefined ? {} : { modes: state.modes }),
        }),
      ],
      metadata: { tauInternal: { kind: 'external-agent-session', origin: 'external', agentId: input.agentId } },
    };
    await write([
      committed.has(id)
        ? { type: 'message.envelope-replaced', messageId: id, replacement: message }
        : { type: 'message.appended', message },
    ]);
    committed.add(id);
  };

  /* Drop a tracked effect from its set once it settles; each effect answers its own failure. */
  const forget = async (into: Set<Promise<void>>, running: Promise<void>): Promise<void> => {
    try {
      await running;
    } catch {
      /* Reported by the effect itself. */
    } finally {
      into.delete(running);
    }
  };

  const lentTurn = createCallbackLogic<AcpLentTurnCommand, AcpLentTurnInput>(({ input, sendBack, receive }) => {
    const send = (event: AcpSessionEvent): void => {
      sendBack(event);
    };
    const seams = effects.seams(input.requestId);
    if (!seams) {
      send({
        type: 'lentFailed',
        failure: { code: 'EXTERNAL_AGENT_FAILED', message: `No turn is lent under ${input.requestId}.` },
      });
      return () => undefined;
    }
    if (seams.appendSession) {
      writers.set(input.key, seams.appendSession);
    }
    const agent = { id: input.adapter.id, displayName: input.adapter.displayName };
    const projection = createTurnProjection({
      turn: seams,
      createId: effects.createId,
      agentId: input.adapter.id,
      ...(input.adapter.nativeToolName ? { nativeToolName: input.adapter.nativeToolName } : {}),
      ...(input.priorUsage === undefined ? {} : { priorUsage: input.priorUsage }),
      ...(input.tauMcp ? { tauMcpServerName: 'tau' } : {}),
      publishSessionState: async (state) =>
        persist(
          seams.appendSession ?? seams.append,
          {
            agentId: input.adapter.id,
            sessionMessageId: input.sessionMessageId,
            sessionCommitted: input.sessionCommitted,
          },
          state,
        ),
    });
    let release: (() => void | Promise<void>) | undefined;
    let released = false;
    const releaseBinding = async (): Promise<void> => {
      if (!released) {
        released = true;
        await release?.();
      }
    };
    /*
     * Every effect in flight is held in a set, never fire-and-forget: file and login answers are
     * drained before the turn flushes; approvals are answered `cancelled` by the machine instead.
     */
    const draining = new Set<Promise<void>>();
    const background = new Set<Promise<void>>();
    const track = (into: Set<Promise<void>>, work: () => Promise<void>): void => {
      const running = work();
      into.add(running);
      void forget(into, running);
    };
    const logins = new Set<string>();

    /* The machine waits in `busy.binding` for `lentReady` or `lentFailed`. `flush` awaits it too: a cancel while
     * binding must not let the final record overtake the opening one it would replace (W10-F1). */
    const binding = (async () => {
      try {
        release = effects.bind?.(input.requestId, input.capabilityToken);
        projection.sessionState(input.presentation);
        if (input.opening) {
          /* Whole, at every open (EA-R9). */
          await seams.remember?.(input.opening.record);
          if (input.opening.notice !== undefined) {
            /* Never a silent fresh start: the reader has to see why the agent stopped remembering. */
            await seams.append([
              {
                type: 'message.appended',
                message: {
                  id: effects.createId(),
                  role: 'assistant',
                  content: [{ type: 'text', text: input.opening.notice }],
                  metadata: { tauInternal: { origin: 'external', agentId: input.adapter.id } },
                },
              },
            ]);
          }
        }
        send({ type: 'lentReady' });
      } catch (error) {
        send({ type: 'lentFailed', failure: failureOfError(error, agent) });
      }
    })();
    background.add(binding);
    void forget(background, binding);

    /* One vendor request of this turn; its answer arrives as `vendorAnswered`. */
    const serveRequest = (command: Extract<AcpLentTurnCommand, { readonly type: 'serve' }>): void => {
      const { id } = command;
      const answered = (answer: AcpVendorAnswer, permission = false): void => {
        send({ type: 'vendorAnswered', id, permission, answer });
      };
      switch (command.method) {
        case 'session/request_permission': {
          const { params } = command;
          /* The person may take minutes; a cancel answers the vendor first. */
          track(background, async () => {
            let answer: AcpVendorAnswer = { result: { outcome: { outcome: 'cancelled' } } };
            try {
              const resolution = await projection.approve({
                prompt: params.toolCall.title ?? `Allow ${params.toolCall.toolCallId}?`,
                payload: asJson({ toolCall: params.toolCall, options: params.options }),
              });
              const optionId = chooseOption(params.options, resolution);
              if (optionId !== undefined) {
                answer = { result: { outcome: { outcome: 'selected', optionId } } };
              }
            } catch {
              /* Nobody decided: `cancelled`. */
            }
            answered(answer, true);
          });
          return;
        }
        case 'elicitation/create': {
          const login = urlLoginOf(input.adapter.id, command.params);
          if (!login?.elicitationId) {
            /* A form Tau has no surface for: declining is the honest answer. */
            answered({ result: { action: 'decline' } });
            return;
          }
          const { elicitationId } = login;
          const reason = command.params.message;
          track(draining, async () => {
            try {
              await seams.append([
                {
                  type: 'interrupt.recorded',
                  interruptId: elicitationId,
                  phase: 'requested',
                  reason,
                  payload: asJson(login),
                },
              ]);
              logins.add(elicitationId);
              /* Answered at once: the agent polls its own verification endpoint. */
              answered({ result: { action: 'accept' } });
            } catch (error) {
              answered(errorAnswer(error));
            }
          });
          return;
        }
        case 'fs/read_text_file': {
          const { params } = command;
          track(draining, async () => {
            try {
              const content = await readSessionTextFile(input.cwd, params);
              answered({ result: { content } });
            } catch (error) {
              answered(errorAnswer(error));
            }
          });
          return;
        }
        case 'fs/write_text_file': {
          const { params } = command;
          track(draining, async () => {
            try {
              await writeSessionTextFile(input.cwd, params);
              answered({ result: {} });
            } catch (error) {
              answered(errorAnswer(error));
            }
          });
        }
      }
    };

    receive((command) => {
      switch (command.type) {
        case 'update': {
          projection.update(command.update);
          return;
        }
        case 'sessionState': {
          projection.sessionState(command.presentation);
          return;
        }
        case 'serve': {
          serveRequest(command);
          return;
        }
        case 'loginComplete': {
          if (logins.delete(command.elicitationId)) {
            /* The agent is telling us, not asking; the turn goes on either way. */
            track(background, async () => {
              try {
                await seams.append([
                  {
                    type: 'interrupt.recorded',
                    interruptId: command.elicitationId,
                    phase: 'resolved',
                    reason: 'approved',
                    payload: { outcome: 'approved' },
                  },
                ]);
              } catch {
                /* The banner clears with the turn's terminal row. */
              }
            });
          }
          return;
        }
        case 'flush': {
          const { report } = command;
          track(background, async () => {
            await Promise.allSettled([binding, ...draining]);
            if (report) {
              projection.report(report);
            }
            let failure: AcpFailure | undefined;
            try {
              await projection.flush();
            } catch {
              /* A stable final message identity makes one transient storage failure retryable. */
              try {
                await projection.flush();
              } catch (error) {
                failure = failureOfError(error, agent);
              }
            }
            /* Released before the turn ends, so no tool effect lands after its terminal row (EA-R6). */
            try {
              await releaseBinding();
            } catch {
              /* The binding is gone either way. */
            }
            send({ type: 'flushed', title: projection.title, failure });
          });
          return;
        }
        case 'record': {
          const { record, required } = command;
          track(background, async () => {
            try {
              await seams.remember?.(record);
              send({ type: 'recorded', failure: undefined });
            } catch (error) {
              /* A record that cannot be written does not replace the turn's own failure. */
              send({ type: 'recorded', failure: required ? failureOfError(error, agent) : undefined });
            }
          });
        }
      }
    });

    return () => {
      track(background, async () => {
        try {
          await releaseBinding();
        } catch {
          /* The binding is gone either way. */
        }
      });
    };
  });

  return acpSessionMachine.provide({
    actors: {
      adapterConnection: createAdapterConnection(effects.onFrame),
      lentTurn,
      publishSkills: createAsyncLogic<readonly string[], undefined>({
        run: async ({ signal }) => effects.publishSkills(signal),
      }),
      persistPresentation: createAsyncLogic<void, AcpPresentationInput>({
        run: async ({ input }) => {
          const write = writers.get(input.key);
          if (write) {
            await persist(write, input, input.presentation);
          }
        },
      }),
    },
  });
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
