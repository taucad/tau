/**
 * A compute worker for the supervisor tests, run by Node directly (type
 * stripping) on a real `worker_threads` thread. It answers `{ id, method, args }`:
 *
 * - `echo(value)`: answers `value`;
 * - `sleep(ms)`: answers after `ms`;
 * - `hang()`: spins forever, as a wedged inflate would;
 * - `crash()`: exits the thread without answering, as an out-of-memory kill would.
 */
import { parentPort } from 'node:worker_threads';

type Request = { readonly id: number; readonly method: string; readonly args: readonly unknown[] };

parentPort!.on('message', ({ id, method, args }: Request) => {
  if (method === 'echo') {
    parentPort!.postMessage({ id, result: args[0] });
    return;
  }
  if (method === 'sleep') {
    setTimeout(() => {
      parentPort!.postMessage({ id, result: 'slept' });
    }, args[0] as number);
    return;
  }
  if (method === 'hang') {
    for (;;) {
      // Spin: the point is a worker that never returns.
    }
  }
  process.exit(1);
});
