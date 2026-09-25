import { expect, it } from 'vitest';
import { commands } from 'vitest/browser';

type WorkerResult = {
  /** The chat's raw `events.jsonl`, kept for field trace validation (`agent-host:formal:logs`). */
  readonly log?: string | undefined;
  readonly origin?: string | undefined;
  readonly eventTypes?: readonly string[] | undefined;
  readonly final?: unknown;
  readonly error?: string | undefined;
};

it('boots the complete host in a worker and persists a tool turn to OPFS', async () => {
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
    worker.postMessage('run');
  });
  worker.terminate();
  if (result.log !== undefined) {
    /* Resolved against this file: out/test-results/chat-logs/<project>/<spec>/<chatId>.jsonl. */
    await commands.writeFile(
      '../../../../out/test-results/chat-logs/agent-host/tau-agent-host.browser.test.ts/host-worker-smoke.jsonl',
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
