/**
 * The desktop's native kernel preparation (charter W6 phase 2, desktop first-use download blueprint DS-C).
 *
 * The app ships no kernel closure: a native kernel refuses with `KERNEL_NOT_PREPARED` until main prepares it here, the
 * first time a model needs it. Main prepares through `openNativePreparation`, the same preparation `tau mcp` and
 * `tau serve` run behind `prepare_kernel`: pinned, digest-checked payloads from each package's `tau-plugin.json`,
 * the package's seal step, and the channel's payload store, in this process with its own `fetch` (D4). It never
 * downloads through Electron's download manager, which would quarantine every file (Gatekeeper assesses quarantined
 * files only). The renderer and the services utility ask by kernel name; a ready kernel binds on its next operation,
 * since the kernel utility reads the store for every kernel its launch frame has no closure for.
 *
 * @module
 */
import { mkdir, realpath } from 'node:fs/promises';

import { openNativePreparation, UnknownNativeKernelError } from '@taucad/native-process-core/store';
import type { NativeKernelDeployment } from '@taucad/native-process-core/adopter';
import type { NativePreparation } from '@taucad/native-process-core/store';
import { readManagedPreparation } from '@taucad/runtime/preparation/node';
import type { DesktopKernelPreparation, DesktopKernelProgress } from '@taucad/types/desktop-native-kernels';

import { desktopNativeDeployments } from '#tau/desktop-native-deployments.js';

/** Prepares the desktop's native kernels, one preparation per kernel at a time. */
export type DesktopKernelPreparer = {
  /**
   * Prepare a kernel by name. A second call for a kernel already preparing joins the first.
   * @param kernel - The kernel a `KERNEL_NOT_PREPARED` issue names.
   * @param onProgress - This caller's progress, beside the preparer's own; the agent's `prepare_kernel` reports it.
   * @returns Its outcome; a kernel no bundled package declares fails with `UNKNOWN_KERNEL`.
   */
  readonly prepare: (
    kernel: string,
    onProgress?: (progress: DesktopKernelProgress) => void,
  ) => Promise<DesktopKernelPreparation>;
  /** Cancel a kernel's preparation, for every caller waiting on it. */
  readonly cancel: (kernel: string) => void;
  /** Cancel every preparation and release the store. */
  readonly dispose: () => Promise<void>;
};

/**
 * Open the desktop's preparation over the channel's payload store.
 * @param input - The store root (the one main inspects at startup), the installation its link names (the app's
 *   executable, as the startup collection reads it), the environment the managed profile is read from, where progress
 *   goes, a log, and for tests the deployments and transport.
 * @returns The preparer.
 */
export const createDesktopKernelPreparer = (input: {
  readonly store: string;
  readonly hostPath: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly onProgress: (progress: DesktopKernelProgress) => void;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail: unknown) => void;
  readonly deployments?: readonly NativeKernelDeployment[];
  readonly fetch?: typeof fetch;
}): DesktopKernelPreparer => {
  let opened: Promise<NativePreparation> | undefined;
  const open = async (): Promise<NativePreparation> => {
    /* The native sandbox grants a closure by its real path, as `startNativeStore` composes it. */
    await mkdir(input.store, { recursive: true });
    return openNativePreparation({
      store: await realpath(input.store),
      managed: readManagedPreparation(input.environment),
      hostPath: input.hostPath,
      deployments: input.deployments ?? desktopNativeDeployments,
      ...(input.fetch === undefined ? {} : { fetch: input.fetch }),
    });
  };
  type Running = {
    readonly controller: AbortController;
    readonly listeners: Set<(progress: DesktopKernelProgress) => void>;
    readonly outcome: Promise<DesktopKernelPreparation>;
  };
  const running = new Map<string, Running>();

  const run = async (
    kernel: string,
    signal: AbortSignal,
    listeners: ReadonlySet<(progress: DesktopKernelProgress) => void>,
  ): Promise<DesktopKernelPreparation> => {
    try {
      opened ??= open();
      const opening = opened;
      let preparation: NativePreparation;
      try {
        preparation = await opening;
      } catch (error) {
        /* A store that failed to open is opened again by the next preparation rather than failing it too. */
        if (opened === opening) {
          opened = undefined;
        }
        throw error;
      }
      input.log('info', 'native.prepare', { kernel });
      const outcome = await preparation.prepare(kernel, {
        signal,
        onProgress: (progress) => {
          const report = { kernel, ...progress };
          input.onProgress(report);
          for (const listener of listeners) {
            listener(report);
          }
        },
      });
      input.log(outcome.status === 'ready' ? 'info' : 'warn', 'native.prepared', outcome);
      return outcome.status === 'ready' ? { status: 'ready', kernel, byteLength: outcome.byteLength } : outcome;
    } catch (error) {
      input.log('error', 'native.prepare', error);
      return {
        status: 'failed',
        kernel,
        code: error instanceof UnknownNativeKernelError ? error.code : 'PREPARE_KERNEL_FAILED',
        message: error instanceof Error ? error.message : String(error),
      };
    } finally {
      running.delete(kernel);
    }
  };

  return {
    // oxlint-disable-next-line typescript/promise-function-async -- Promise identity is the join contract.
    prepare: (kernel, onProgress) => {
      const existing = running.get(kernel);
      if (existing !== undefined) {
        if (onProgress !== undefined) {
          existing.listeners.add(onProgress);
        }
        return existing.outcome;
      }
      const controller = new AbortController();
      const listeners = new Set(onProgress === undefined ? [] : [onProgress]);
      const outcome = run(kernel, controller.signal, listeners);
      running.set(kernel, { controller, listeners, outcome });
      return outcome;
    },
    cancel: (kernel) => {
      running.get(kernel)?.controller.abort();
    },
    dispose: async () => {
      for (const { controller } of running.values()) {
        controller.abort();
      }
      await Promise.allSettled([...running.values()].map(async ({ outcome }) => outcome));
      if (opened !== undefined) {
        try {
          const preparation = await opened;
          await preparation.dispose();
        } catch {
          /* The store never opened, so there is nothing to release. */
        }
      }
    },
  };
};
