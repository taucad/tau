import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';

type WorkerResult = {
  /** The chat's raw `events.jsonl`, kept for field trace validation (`agent-host:formal:logs`). */
  readonly log?: string | undefined;
  readonly origin?: string | undefined;
  readonly eventTypes?: readonly string[] | undefined;
  readonly state?: string | undefined;
  readonly failures?: readonly string[] | undefined;
  readonly final?: unknown;
  readonly error?: string | undefined;
};

const runInWorker = async (mode: 'run' | 'attachment'): Promise<WorkerResult> => {
  const worker = new Worker(new URL('tau-agent-host.browser.fixture.ts', import.meta.url), { type: 'module' });
  const result = await new Promise<WorkerResult>((resolve, reject) => {
    const workerTimeout = setTimeout(() => {
      reject(new Error('Agent-host worker did not respond'));
    }, 20_000);
    worker.addEventListener(
      'message',
      (message: MessageEvent<WorkerResult>) => {
        clearTimeout(workerTimeout);
        resolve(message.data);
      },
      { once: true },
    );
    worker.addEventListener(
      'error',
      (error) => {
        clearTimeout(workerTimeout);
        reject(new Error(error.message));
      },
      { once: true },
    );
    worker.postMessage(mode);
  });
  worker.terminate();
  return result;
};

it('boots the complete host in a worker and persists a tool turn to OPFS', async () => {
  const result = await runInWorker('run');
  if (result.log !== undefined) {
    /* Vitest's browser command resolves from the project root; retain the repository output convention. */
    await commands.writeFile(
      '../../out/test-results/chat-logs/agent-host/tau-agent-host.browser.test.ts/host-worker-smoke.jsonl',
      result.log,
    );
  }

  expect(result.error).toBeUndefined();
  expect(result.origin).not.toBe('null');
  expect(result.eventTypes).toContain('turn.history-projection-committed');
  expect(result.eventTypes).toContain('message.appended');
  expect(result.eventTypes).toContain('run.lifecycle');
  expect(result.final).toEqual([{ type: 'text', text: 'Read main.ts and completed the first turn.' }]);
});

it('runs a turn with a photo-sized attachment inside the worker', async () => {
  /* A worker's stack is far smaller than the page's. Materializing a user attachment spread 65 535 bytes per
   * `String.fromCodePoint` call, which throws `Maximum call stack size exceeded` there, so every run of a chat with an
   * image or PDF in its history failed before its first model request. */
  const result = await runInWorker('attachment');

  expect(result.error).toBeUndefined();
  expect(result.failures).toEqual([]);
  expect(result.state).toBe('completed');
  expect(result.final).toEqual([{ type: 'text', text: 'Read main.ts and completed the first turn.' }]);
});
