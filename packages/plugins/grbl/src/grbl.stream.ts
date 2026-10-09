/**
 * Streaming a program to a Grbl controller: loaded under a feed hold so only Play at the machine starts it, fed by
 * character counting, paused at each bit change for a person, and held when Grbl refuses a line.
 *
 * @module
 */

import type { MachineCommandReceipt } from '@taucad/runtime/machine';

import { cleanGcodeLine, grblErrorSentence, grblRealtime } from '#grbl.protocol.js';
import type { GrblController, GrblReply, GrblRun, GrblSubmission } from '#grbl.session.js';

type Lines = ReadonlyArray<Readonly<{ number: number; text: string }>>;

const isAborted = (run: Readonly<{ abort: AbortController }>): boolean => run.abort.signal.aborted;

const gate = (): NonNullable<GrblRun['gate']> => {
  let open = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
};

const pauseRun = (controller: GrblController, run: GrblRun, paused: NonNullable<GrblRun['paused']>): void => {
  run.state = 'paused';
  run.paused = paused;
  run.stage = undefined;
  run.gate = gate();
  controller.notify();
};

/**
 * Wait until a report taken after every reply so far shows the planner empty, after Play.
 * @param controller - The live connection.
 * @param run - The run being fed.
 */
const drained = async (controller: GrblController, run: GrblRun): Promise<void> => {
  const sequence = controller.reportSequence;
  await controller.waitFor(
    () =>
      run.abort.signal.aborted ||
      (run.state === 'running' && controller.reportSequence > sequence && controller.status?.state === 'Idle'),
    7 * 24 * 3_600_000,
  );
};

/**
 * Count a program line's reply; an error holds the run, since Grbl would keep running the lines after it.
 * @param controller - The live connection.
 * @param run - The run being fed.
 * @param sent - The line number and its reply.
 * @returns The reply.
 */
const programReply = async (
  controller: GrblController,
  run: GrblRun,
  sent: Readonly<{ line: number; reply: Promise<GrblReply> }>,
): Promise<GrblReply> => {
  const { line } = sent;
  const reply = await sent.reply;
  if (reply.type === 'ok') {
    run.acknowledged += 1;
  } else if (reply.type === 'error' && controller.run === run && controller.streamError === undefined) {
    // Grbl drops the bad line and keeps running the next ones: hold now and let a person decide.
    run.acknowledged += 1;
    controller.realtime(grblRealtime.feedHold);
    controller.streamError = { code: reply.code, line };
    pauseRun(controller, run, { by: 'machine', reason: `Line ${String(line)}: ${grblErrorSentence(reply.code)}` });
  }
  controller.notify();
  return reply;
};

const feed = async (controller: GrblController, run: GrblRun, lines: Lines): Promise<void> => {
  const replies: Array<Promise<GrblReply>> = [];
  let hasMotion = false;
  for (const line of lines) {
    if (run.abort.signal.aborted) {
      return;
    }
    if (run.gate !== undefined) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the stream waits while the run is paused.
      await run.gate.promise;
      run.gate = undefined;
    }
    let { text } = line;
    if (run.state === 'starting' && /M0?[3478](?!\d)/u.test(text)) {
      // A held controller still switches its relays: keep the router and the dust collector off until Play.
      // oxlint-disable-next-line eslint/no-await-in-loop -- the stream waits for the person at the machine.
      await controller.waitFor(() => run.state !== 'starting' || run.abort.signal.aborted, 7 * 24 * 3_600_000);
    }
    if (/M0?6(?!\d)/u.test(text) && !hasMotion) {
      // The first bit was fitted before the start; the person vouched for it.
      controller.tool = Number(/T(\d+)/u.exec(text)?.[1] ?? controller.tool ?? 0);
      text = text.replace(/M0?6(?!\d)/u, '');
    }
    if (/M0?6(?!\d)/u.test(text)) {
      // Grbl rejects M6 (error 20): drain the planner, then a person changes the bit.
      // oxlint-disable-next-line eslint/no-await-in-loop -- the change happens between two program lines.
      await Promise.all(replies);
      // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
      await drained(controller, run);
      const tool = Number(/T(\d+)/u.exec(text)?.[1] ?? controller.tool ?? 0);
      pauseRun(controller, run, { by: 'program', reason: `Tool change: fit bit T${String(tool)}` });
      // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
      const isChanged = await controller.toolChange(tool, { runId: run.runId }).done;
      if (!isChanged) {
        if (!isAborted(run)) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- see above.
          await controller.halt();
        }
        return;
      }
      run.state = 'running';
      run.paused = undefined;
      run.gate = undefined;
      controller.notify();
      text = text.replace(/M0?6(?!\d)/u, '');
    }
    if (text.replace(/T\d+/u, '').length === 0) {
      run.acknowledged += 1;
      continue;
    }
    hasMotion ||= /[XYZ]-?[\d.]/u.test(text);
    const { sent, reply } = controller.transmit(text);
    replies.push(programReply(controller, run, { line: line.number, reply }));
    // oxlint-disable-next-line eslint/no-await-in-loop -- character counting sends a line only when it fits.
    await sent;
  }
  await Promise.all(replies);
  await drained(controller, run);
  if (!run.abort.signal.aborted) {
    controller.endRun('completed');
    controller.notify();
  }
};

const feedOrFail = async (controller: GrblController, run: GrblRun, lines: Lines): Promise<void> => {
  try {
    await feed(controller, run, lines);
  } catch (error) {
    void controller.options.runtime.log({ level: 'error', message: `Grbl stream failed: ${String(error)}` });
    controller.endRun('failed', 'Tau stopped feeding the program.');
    controller.notify();
  }
};

/**
 * Start feeding a program under a feed hold; the person's Play press starts the motion.
 * @param controller - The live connection.
 * @param input - The run id, the program lines and the start form.
 * @returns Once the controller took the first block.
 */
export const startGrblRun = async (
  controller: GrblController,
  input: Readonly<{ runId: string; name: string; text: string; submission: GrblSubmission }>,
): Promise<MachineCommandReceipt> => {
  const lines = input.text
    .split(/\r?\n/u)
    .map((raw, index) => ({ number: index + 1, text: cleanGcodeLine(raw) }))
    .filter((line) => line.text.length > 0);
  const run: GrblRun = {
    runId: input.runId,
    name: input.name,
    total: lines.length,
    acknowledged: 0,
    state: 'starting',
    stage: 'Waiting for Play on the controller',
    abort: new AbortController(),
  };
  controller.run = run;
  controller.streamError = undefined;
  // Hold first: lines fill the planner but nothing moves until a person presses Play at the machine.
  controller.realtime(grblRealtime.feedHold);
  const first = await controller.send(input.submission.workOffset);
  if (first.type !== 'ok') {
    controller.endRun('failed', first.type === 'error' ? grblErrorSentence(first.code) : 'The controller reset.');
    return {
      status: 'rejected',
      code: 'MACHINE_ACTION_PROVIDER_REJECTED',
      message: 'The controller refused the work offset.',
      observedAt: controller.now(),
    };
  }
  void feedOrFail(controller, run, lines);
  return { status: 'accepted', runId: run.runId, observedAt: controller.now() };
};
