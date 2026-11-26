/**
 * The external driver answers every request the agent makes of a person, whenever it arrives (launch audit B-1).
 *
 * A Stop aborts the turn and answers the requests waiting then. A request already in flight when the abort lands
 * reaches the driver afterwards: nobody can be asked any more, so it is answered `cancelled` at once. Left waiting, the
 * port never returned, the driver never reported the turn's end, and the run stayed in its stopping state.
 */
import { setTimeout as sleep } from 'node:timers/promises';

import { describe, expect, it } from 'vitest';

import type { DriverReport } from '#host/chat-run-effects.js';
import type { ExternalAgentPort, ExternalAgentTurn } from '#host/external-agent.js';
import { startExternalTurn } from '#host/external-turn.driver.js';
import type { InterruptResolution } from '#waist/ports.js';

const aborted = async (signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    signal.addEventListener(
      'abort',
      () => {
        resolve();
      },
      { once: true },
    );
  });

const start = (
  run: ExternalAgentPort['run'],
): Readonly<{ handle: ReturnType<typeof startExternalTurn>; reports: DriverReport[] }> => {
  const reports: DriverReport[] = [];
  let minted = 0;
  const handle = startExternalTurn({
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the driver calls only `run`.
    port: { run } as ExternalAgentPort,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the driver reads only the agent id.
    turn: { agentId: 'agent' } as Omit<ExternalAgentTurn, 'signal' | 'approve'>,
    createInterruptId: () => {
      minted += 1;
      return `interrupt-${String(minted)}`;
    },
    append: async () => undefined,
    report: (report) => {
      reports.push(report);
    },
  });
  return { handle, reports };
};

describe('the external turn driver', () => {
  it('should answer a request that arrives after the abort as cancelled, and let the turn end', async () => {
    let answer: InterruptResolution | undefined;
    const { handle, reports } = start(async (turn) => {
      await aborted(turn.signal);
      /* The agent's permission request was already in flight when the cancel reached it. */
      answer = await turn.approve({ prompt: 'Allow this command?' });
      return { stopReason: 'cancelled' };
    });

    handle.abort('cancel');
    await sleep(20);

    expect(answer).toMatchObject({ outcome: 'cancelled' });
    expect(reports.map((report) => report.type)).toEqual(['agentEnded']);
    expect(reports[0]).toMatchObject({ outcome: 'aborted' });
  });

  it('should still put a request made before the abort in front of the person, and cancel it on the abort', async () => {
    let answer: InterruptResolution | undefined;
    const { handle, reports } = start(async (turn) => {
      answer = await turn.approve({ prompt: 'Allow this command?' });
      return { stopReason: 'cancelled' };
    });
    await sleep(5);
    expect(reports.map((report) => report.type)).toEqual(['approvalRequested']);

    handle.abort('cancel');
    await sleep(20);

    expect(answer).toEqual({ interruptId: 'interrupt-1', outcome: 'cancelled' });
    expect(reports.map((report) => report.type)).toEqual(['approvalRequested', 'agentEnded']);
  });
});
