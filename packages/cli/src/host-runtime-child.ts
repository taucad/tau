import { parseArgs } from 'node:util';

import { serveHostRuntime } from '@taucad/host/runtime-host';
import type { HostRuntimeHandle } from '@taucad/host/runtime-host';

// eslint-disable-next-line import-x/no-extraneous-dependencies -- package-private import-map alias, not a dependency.
import { loadCliRuntime } from '#runtime-options.js';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    plugin: { type: 'string', multiple: true },
    config: { type: 'string' },
  },
  strict: true,
});

let host: HostRuntimeHandle | undefined;
let messageChain = Promise.resolve();

const handleMessage = async (message: unknown): Promise<void> => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    throw new TypeError('Tau Host runtime child received an invalid IPC message.');
  }
  if (message.type === 'close') {
    await host?.close();
    host = undefined;
    if (process.connected) {
      process.disconnect();
    }
    return;
  }
  if (
    message.type !== 'start' ||
    !('authorizationToken' in message) ||
    typeof message.authorizationToken !== 'string'
  ) {
    throw new TypeError('Tau Host runtime child received an invalid start message.');
  }
  if (host) {
    throw new Error('Tau Host runtime child was started more than once.');
  }
  const runtime = await loadCliRuntime({
    projectRoot: process.cwd(),
    plugin: values.plugin,
    config: values.config,
  });
  host = await serveHostRuntime({ runtime, authorizationToken: message.authorizationToken });
  process.send?.({ type: 'ready', url: host.url.href, runtimeVersion: host.runtimeVersion });
};

const enqueue = (message: unknown): void => {
  const previousMessage = messageChain;
  messageChain = (async () => {
    try {
      await previousMessage;
      await handleMessage(message);
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      /* The parent may already be gone — a SIGTERM closes the IPC channel
       * first — and `send` or `disconnect` on a closed channel emits an
       * unhandled `'error'` that crashes this child while it is already
       * shutting down, drowning the real failure it was trying to report. */
      process.exitCode = 1;
      if (process.connected) {
        process.send?.({ type: 'error', message: normalized.message });
        process.disconnect();
      }
    }
  })();
};

process.on('message', enqueue);
process.once('disconnect', () => {
  enqueue({ type: 'close' });
});
