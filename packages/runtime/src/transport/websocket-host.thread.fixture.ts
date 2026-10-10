/**
 * Worker-thread entry for the thread-per-connection tests, written exactly as an
 * application-owned entry is: build a kernel worker, host it with `nodeWorkerHost`.
 *
 * @internal
 */

import { nodeWorkerHost } from '#transport/node-worker-host.js';
import { threadFixtureRuntime } from '#transport/websocket-host.thread.fixture-runtime.js';
import { createRuntimeWorker } from '#worker/create-runtime-worker.js';

await nodeWorkerHost({ worker: createRuntimeWorker({ runtime: threadFixtureRuntime }) }).open();
