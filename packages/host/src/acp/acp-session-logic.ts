/**
 * The effects `acpSession` runs (W10 EA-S5).
 *
 * {@link provideAcpSession} gives the pure machine its four actors. The turn's
 * seams are looked up by request id through `seams`, so no function enters the
 * machine's context (MC-R5); the log projection (`createTurnProjection`, whose
 * text checkpoint is E23) lives inside the `lentTurn` actor for exactly one lend.
 */

import { createAsyncLogic, createCallbackLogic } from 'xstate';

import type { ExternalAgentLogEvent, ProviderMessage } from '@taucad/agent-host';
import type { ExternalAgentTurn } from '@taucad/agent-host/launcher';

import type { AcpSessionEvent } from '#acp/acp-machine-schemas.js';
import { acpSessionMachine, failureOfError } from '#acp/acp-session.machine.js';
import type {
  AcpFailure,
  AcpLentTurnCommand,
  AcpLentTurnInput,
  AcpPresentationInput,
  AcpVendorAnswer,
} from '#acp/acp-session.machine.js';
import { createAskId, recordAsk, settleAsk, waitForAnswers } from '@taucad/chat/rpc';
import type { QuestionRecordFileSystem } from '@taucad/chat/rpc';
import { askOutcomeOf } from '@taucad/chat';

import { createAdapterConnection } from '#acp/adapter-connection.js';
import { askOfElicitation, elicitationResponseOf } from '#acp/elicitation-questions.js';
import {
  asJson,
  chooseOption,
  createTurnProjection,
  readSessionTextFile,
  urlLoginOf,
  writeSessionTextFile,
} from '#acp/session.js';
import type { AcpPromptTurn, AcpSessionPresentation } from '#acp/session.js';
import type { AcpWireFrame } from '#acp/spawn.js';

/** A lent turn's seams: the prompt seams, and the record writer when the turn has one. */
export type AcpLentSeams = AcpPromptTurn & {
  readonly remember?: ExternalAgentTurn['remember'] | undefined;
  /** Where this turn's chat records questions, so form elicitations reach the person (agent questions blueprint D6). */
  readonly questions?: { readonly chatId: string; readonly fileSystem: QuestionRecordFileSystem } | undefined;
};

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

    /**
     * One form elicitation, asked through the chat's question record (agent questions blueprint D6).
     *
     * The person answers on the same card a Tau `ask_questions` call uses; a
     * question tool's form adopts its recommended options at its deadline. A
     * form Tau cannot present, or a turn with no record, is declined as before.
     */
    const serveForm = (
      params: Extract<AcpLentTurnCommand, { readonly type: 'serve'; readonly method: 'elicitation/create' }>['params'],
      answered: (answer: AcpVendorAnswer) => void,
    ): void => {
      const { questions } = seams;
      const elicitation =
        questions === undefined
          ? undefined
          : askOfElicitation(params, { agentId: input.adapter.id, askId: createAskId(), now: Date.now() });
      if (questions === undefined || elicitation === undefined) {
        answered({ result: { action: 'decline' } });
        return;
      }
      const { chatId, fileSystem } = questions;
      track(background, async () => {
        let answer: AcpVendorAnswer = { result: { action: 'cancel' } };
        try {
          await recordAsk(fileSystem, chatId, elicitation.ask);
          const answers = await waitForAnswers(fileSystem, { chatId, ask: elicitation.ask, signal: seams.signal });
          const response = elicitationResponseOf(elicitation, answers);
          await settleAsk(fileSystem, {
            chatId,
            askId: elicitation.ask.id,
            outcome: askOutcomeOf(elicitation.ask, answers),
          });
          answer = { result: response };
        } catch {
          /* The turn stopped or the record failed: nobody decided. */
          try {
            await settleAsk(fileSystem, { chatId, askId: elicitation.ask.id, outcome: 'cancelled' });
          } catch {
            /* The cancel answer below is what the agent needs. */
          }
        }
        answered(answer);
      });
    };

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
            serveForm(command.params, answered);
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
