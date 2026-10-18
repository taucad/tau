import { parseArgs } from 'node:util';

import {
  createRuntimeChildRuntimeVerifier,
  createRuntimeChildWorkerLauncher,
  serveHostRuntime,
} from '@taucad/host/runtime-host';
import type { HostRuntimeHandle } from '@taucad/host/runtime-host';
import { installNativeRuntimeVerifier, installNativeWorkerLauncher } from '@taucad/native-process-core';
import {
  installNativeClosureResolver,
  inspectionResolver,
  nativeClosureAnswerSchema,
  reportNativeDeployments,
} from '@taucad/native-process-core/store';
import type { NativeClosureAnswer, NativeClosureResolver } from '@taucad/native-process-core/store';
import { resolveRuntimeDefinition } from '@taucad/runtime/worker';
import { installZooProxyCredential, zooProxyCredentialFrameType } from '@taucad/zoo/proxy';

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

/**
 * A closure resolver that asks the daemon: this child cannot read the payload store, so each kernel's request goes
 * over the IPC channel with its package's unparsed `tau-plugin.json` and root (no kernel code), and the daemon answers
 * from the store's launch index. An answer that does not parse, or a daemon that could not answer, is not prepared.
 * @returns The resolver.
 */
const daemonClosureResolver = (): NativeClosureResolver => {
  const pending = new Map<string, (answer: NativeClosureAnswer) => void>();
  let requests = 0;
  const notPrepared: NativeClosureAnswer = { status: 'unavailable', reason: 'not-prepared', byteLength: 0 };
  process.on('message', (message: unknown) => {
    if (typeof message !== 'object' || message === null || Reflect.get(message, 'type') !== 'native-closure:answer') {
      return;
    }
    const id: unknown = Reflect.get(message, 'id');
    const settle = typeof id === 'string' ? pending.get(id) : undefined;
    if (settle === undefined) {
      return;
    }
    pending.delete(id as string);
    const answer = nativeClosureAnswerSchema.safeParse(Reflect.get(message, 'answer'));
    settle(answer.success ? answer.data : notPrepared);
  });
  return async ({ package: name, kernel, dependencies, deployment }) => {
    if (!process.connected) {
      return notPrepared;
    }
    requests += 1;
    const id = `closure-${String(requests)}`;
    const answered = new Promise<NativeClosureAnswer>((resolve) => {
      pending.set(id, resolve);
    });
    process.send?.({
      type: 'native-closure:inspect',
      id,
      request: {
        package: name,
        kernel,
        dependencies: [...dependencies],
        manifest: deployment.manifest,
        packageRoot: deployment.packageRoot,
      },
    });
    return answered;
  };
};

let host: HostRuntimeHandle | undefined;
let messageChain = Promise.resolve();

const handleMessage = async (message: unknown): Promise<void> => {
  if (typeof message !== 'object' || message === null || !('type' in message)) {
    throw new TypeError('Tau Host runtime child received an invalid IPC message.');
  }
  /* Credential frames, native worker frames and closure answers have listeners of their own. */
  if (
    message.type === zooProxyCredentialFrameType ||
    (typeof message.type === 'string' &&
      (message.type.startsWith('native-worker:') || message.type.startsWith('native-closure:')))
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
  /* This child never reads the payload store and may not spawn (D37, North Star S2): with `native`, the daemon answers
   * each native kernel's closure request, starts its workers on this child's behalf and re-verifies a closure whose
   * worker exited before its handshake (D8, X35). Without it, every native kernel refuses as not prepared. */
  const native = 'native' in message && message.native === true;
  if (native) {
    installNativeWorkerLauncher(createRuntimeChildWorkerLauncher());
    installNativeRuntimeVerifier(createRuntimeChildRuntimeVerifier());
  }
  installNativeClosureResolver(native ? daemonClosureResolver() : inspectionResolver([]));
  const runtime = await loadCliRuntime({
    projectRoot: process.cwd(),
    plugin: values.plugin,
    config: values.config,
    ...(values['zoo-proxy-url'] ? { zooProxyUrl: values['zoo-proxy-url'] } : {}),
    acquisition: acquisitionOf(values.acquisition),
  });
  /* What `prepare_kernel` names and prepares: the native deployments this runtime lists, as data. */
  if (native) {
    process.send?.({
      type: 'native-deployments',
      report: reportNativeDeployments(await resolveRuntimeDefinition(runtime, undefined)),
    });
  }
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
