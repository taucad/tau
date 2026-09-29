import type { Scheduler } from 'fast-check';
import type { RunOutcome, SeamFault, TraceEntry, TraceLine } from '#seam/simulator.js';
import { createSeamSimulator } from '#seam/simulator.js';

/** ToySeam (`tools/formal/specs/ToySeam.tla`) run on the simulator: the kernel's own fixture. */
type ToyMessage = { readonly type: 'request' | 'answer'; readonly id: string };

export type ToySeamOptions = {
  readonly requests?: readonly string[];
  /** The server applies an effect only for a request it has not served (the spec's `Dedupe`). */
  readonly dedupe?: boolean;
  /** The server answers; off, a command is left unanswered. */
  readonly answer?: boolean;
  /** The client re-sends an unanswered request every `retryMilliseconds`. */
  readonly retry?: boolean;
  readonly faults?: ReadonlyArray<readonly [SeamFault, string]>;
  readonly maxSteps?: number;
};

export type ToySeamRun = { readonly outcome: RunOutcome; readonly trace: readonly TraceLine[] };

const retryMilliseconds = 50;

export const runToySeam = async (scheduler: Scheduler, options: ToySeamOptions = {}): Promise<ToySeamRun> => {
  const requests = options.requests ?? ['r1', 'r2'];
  const received = new Set<string>();
  const served = new Set<string>();
  // The spec actions the current step performed; the simulator drains them into its trace.
  const actions: TraceEntry[] = [];
  const simulator = createSeamSimulator(scheduler, () => actions.splice(0));
  const client = simulator.process('client', { stop: () => undefined });
  simulator.process('server', { stop: () => undefined });
  const [clientPort, serverPort] = simulator.port<ToyMessage>('client', 'server');

  serverPort.onMessage((message) => {
    if (message.type === 'request') {
      const effect = !(options.dedupe ?? true) || !served.has(message.id);
      served.add(message.id);
      actions.push({ kind: 'serve', actor: 'server', id: message.id, effect });
      if (options.answer ?? true) {
        serverPort.postMessage({ type: 'answer', id: message.id });
      }
    }
  });
  clientPort.onMessage((message) => {
    if (message.type === 'answer') {
      received.add(message.id);
      actions.push({ kind: 'receive', actor: 'client', id: message.id });
    }
  });
  const armRetry = (id: string): void => {
    client.clock.setTimeout(() => {
      if (!received.has(id)) {
        actions.push({ kind: 'retry', actor: 'client', id });
        clientPort.postMessage({ type: 'request', id });
        armRetry(id);
      }
    }, retryMilliseconds);
  };
  client.clock.setTimeout(() => {
    for (const id of requests) {
      actions.push({ kind: 'send', actor: 'client', id });
      clientPort.postMessage({ type: 'request', id });
      if (options.retry ?? true) {
        armRetry(id);
      }
    }
  }, 0);
  for (const [kind, target] of options.faults ?? []) {
    simulator.fault(kind, target);
  }
  // `done()` is `EveryRequestAnswered`'s quiescence predicate, `Quiescent` (FM-R17).
  const outcome = await simulator.run({
    maxSteps: options.maxSteps ?? 200,
    done: () => requests.every((id) => received.has(id)),
  });
  return { outcome, trace: simulator.trace() };
};

/** NDJSON, one line per trace line, as committed under `specs/ToySeam/traces/`. */
export const traceText = (trace: readonly TraceLine[]): string =>
  `${trace.map((line) => JSON.stringify(line)).join('\n')}\n`;
