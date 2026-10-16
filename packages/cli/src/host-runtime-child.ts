import { parseArgs } from 'node:util';

import { createRuntimeChildWorkerLauncher, serveHostRuntime } from '@taucad/host/runtime-host';
import type { HostRuntimeHandle } from '@taucad/host/runtime-host';
import { installNativeWorkerLauncher } from '@taucad/native-process-core';
import { installZooProxyCredential, zooProxyCredentialFrameType } from '@taucad/zoo/proxy';

import type { NativeComposition } from '#native-kernels.js';
import { acquisitionOf } from '#acquisition.js';
import { loadCliRuntime } from '#runtime-options.js';
import { installSandboxModuleHooks } from '#sandbox-modules.js';

/* Before `start`: the CLI runtime imports its plugins, and with them their native addons, only when it loads. */
installSandboxModuleHooks();

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    plugin: { type: 'string', multiple: true },
    config: { type: 'string' },
    'zoo-proxy-url': { type: 'string' },
    /* The daemon starts this child with a minimal environment, so `tau serve` passes the profile as an argument. */
    acquisition: { type: 'string' },
  },
  strict: true,
});

/* This process runs project code, so it never holds the session: the daemon
 * sends a Zoo-scoped token, and again whenever it refreshes it. */
installZooProxyCredential((listener) => {
  process.on('message', listener);
});

let host: HostRuntimeHandle | undefined;
let messageChain = Promise.resolve();

const handleMessage = async (message: unknown): Promise<void> => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    throw new TypeError('Tau Host runtime child received an invalid IPC message.');
  }
  /* Credential frames and native worker frames have listeners of their own. */
  if (
    message.type === zooProxyCredentialFrameType ||
    (typeof message.type === 'string' && message.type.startsWith('native-worker:'))
  ) {
    return;
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
  /* The daemon composed the native kernels from the payload store, which this child never reads, and starts their
   * workers on its behalf: this child may not spawn (D37, North Star S2). */
  const native =
    'native' in message && typeof message.native === 'object' && message.native !== null
      ? (message.native as NativeComposition)
      : undefined;
  if (native !== undefined) {
    installNativeWorkerLauncher(createRuntimeChildWorkerLauncher());
  }
  const runtime = await loadCliRuntime({
    projectRoot: process.cwd(),
    plugin: values.plugin,
    config: values.config,
    ...(values['zoo-proxy-url'] ? { zooProxyUrl: values['zoo-proxy-url'] } : {}),
    acquisition: acquisitionOf(values.acquisition),
    ...(native?.build123d === undefined ? {} : { build123d: native.build123d }),
    ...(native?.picogk === undefined ? {} : { picogk: native.picogk }),
    ...(native === undefined ? {} : { unavailableKernels: native.unavailable }),
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
