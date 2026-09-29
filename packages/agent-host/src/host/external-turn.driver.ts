/**
 * The external driver (W7 RA-S14): W10's `ExternalAgentPort` adapted to M1's driver reports with a plain handle, so
 * M1 has no child (D18 condition 9). M1 reaches it only through `abortDriver` and `decideApproval`; `approve` resolves
 * only after M1 made the resolution durable (I18).
 */

import { codedFailureDetail } from '#harness/coded-failure.js';
import type { DriverHandle, DriverReport } from '#host/chat-run-effects.js';
import { externalRefusalOf, externalStopDetail, externalStopStates } from '#host/run-history.js';
import type { ExternalAgentLogEvent, ExternalAgentPort, ExternalAgentTurn } from '#host/tau-agent-host.js';
import type { InterruptResolution } from '#waist/ports.js';

/** What starting one external attempt takes. */
export type ExternalTurnInput = Readonly<{
  port: ExternalAgentPort;
  /** The turn as the port receives it, less the capabilities the driver supplies. */
  turn: Omit<ExternalAgentTurn, 'signal' | 'approve'>;
  /** Mints the id of one request the agent asks a person to decide. */
  createInterruptId: () => string;
  /** Appends the driver's own rows: a login affordance before a refused turn ends. */
  append: (events: readonly ExternalAgentLogEvent[]) => Promise<void>;
  report: (report: DriverReport) => void;
}>;

/**
 * Start one external attempt.
 *
 * @param input - The port, the turn, and the driver's report channel.
 * @returns The handle M1's effects abort and decide through.
 */
export const startExternalTurn = (input: ExternalTurnInput): DriverHandle => {
  const controller = new AbortController();
  const waiting = new Map<string, (resolution: InterruptResolution) => void>();
  const approve: ExternalAgentTurn['approve'] = async (request) =>
    new Promise<InterruptResolution>((resolve) => {
      const interruptId = input.createInterruptId();
      waiting.set(interruptId, resolve);
      input.report({
        type: 'approvalRequested',
        interruptId,
        request: {
          prompt: request.prompt,
          agentId: input.turn.agentId,
          ...(request.payload === undefined ? {} : { payload: request.payload }),
        },
      });
    });
  const turn: ExternalAgentTurn = { ...input.turn, signal: controller.signal, approve };
  const failed = async (error: unknown): Promise<void> => {
    if (!controller.signal.aborted) {
      /* A refusal is a fact the person can act on: the login it carried is recorded first, settled in the same
       * breath because nothing answers a login (V11/VSC4). */
      const { login } = externalRefusalOf(error);
      if (login !== undefined) {
        const interruptId = input.createInterruptId();
        try {
          await input.append([
            { ...login, interruptId },
            {
              type: 'interrupt.recorded',
              interruptId,
              phase: 'resolved',
              reason: 'cancelled',
              payload: { outcome: 'cancelled' },
            },
          ]);
        } catch {
          /* The ending row still follows; a lost login affordance is not a lost outcome. */
        }
      }
    }
    input.report({
      type: 'agentEnded',
      outcome: controller.signal.aborted ? 'aborted' : 'failed',
      failure: codedFailureDetail(error),
    });
  };
  /* A synchronous throw from the port becomes a failed attempt, never an escaped rejection (RV3-F3). */
  const run = async (): Promise<void> => {
    let outcome: Awaited<ReturnType<ExternalAgentPort['run']>>;
    try {
      outcome = await input.port.run(turn);
    } catch (error) {
      await failed(error);
      return;
    }
    const stopReason = outcome?.stopReason;
    const state = controller.signal.aborted
      ? 'cancelled'
      : ((stopReason === undefined ? undefined : externalStopStates.get(stopReason)) ?? 'completed');
    const message = stopReason === undefined ? undefined : externalStopDetail.get(stopReason);
    input.report({
      type: 'agentEnded',
      outcome: state === 'completed' ? 'completed' : state === 'cancelled' ? 'aborted' : 'failed',
      ...(state === 'failed'
        ? { failure: { message: message ?? `The agent stopped: ${stopReason ?? 'unknown'}.` } }
        : {}),
      ...(stopReason === undefined ? {} : { stopReason }),
    });
  };
  void run();
  return {
    steer: () => undefined,
    abort: (reason) => {
      controller.abort(reason);
      /* A request the agent is suspended on is answered by the abort: nothing else will (V8). */
      for (const [interruptId, resolve] of waiting) {
        resolve({ interruptId, outcome: 'cancelled' });
      }
      waiting.clear();
    },
    decide: (resolution) => {
      const resolve = waiting.get(resolution.interruptId);
      waiting.delete(resolution.interruptId);
      resolve?.(resolution);
    },
  };
};
