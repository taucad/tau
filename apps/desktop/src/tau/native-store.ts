/**
 * The desktop's side of the native payload store (charter W6, D5, D21; desktop first-use download blueprint).
 *
 * The app ships no kernel closure. At startup main reads which native kernels the store already holds sealed, posts
 * each one's closure to the kernel utilities, and collects the store's garbage. A kernel the store lacks is left out
 * of the frame: the utility reads the store for it on every bind, so once main prepares it
 * (`native-preparation.ts`) it binds on its next operation. Nothing here downloads.
 *
 * @module
 */
import { mkdir, realpath } from 'node:fs/promises';

import { nativeKernelIdsSupportedOn, preparationPluginsOf } from '@taucad/native-process-core/store';
import { createPreparationHost, detectHostIndicators, readManagedPreparation } from '@taucad/runtime/preparation/node';
import type {
  GarbageReport,
  ManagedPreparation,
  PreparationHost,
  PreparationPlugin,
} from '@taucad/runtime/preparation/node';

import { desktopNativeDeployments } from '#tau/desktop-native-deployments.js';
import { nativeKernelsFrameType } from '#tau/native-kernels-frame.js';
import type { NativeKernelsFrame, NativeKernelSlot } from '#tau/native-kernels-frame.js';

/**
 * The native packages the desktop lists: each deployment's `tau-plugin.json` rows with its launch set, without its
 * seal step or package directory. Startup only reads launch indexes and collects garbage; preparation, which seals,
 * opens its own host over the full deployments (`native-preparation.ts`).
 */
export const desktopNativePlugins: readonly PreparationPlugin[] = preparationPluginsOf(desktopNativeDeployments).map(
  ({ seal: _seal, directory: _directory, ...plugin }) => plugin,
);

/**
 * The native kernels this machine can run, advertised to the renderer's product catalog: every listed kernel whose
 * required dependencies declare a variant for this host.
 * @returns Kernel names, in list order; none when the host cannot be identified.
 */
export const desktopNativeKernelIds = (): readonly string[] => {
  const indicators = detectHostIndicators();
  return indicators === undefined ? [] : nativeKernelIdsSupportedOn(desktopNativeDeployments, indicators);
};

/**
 * Open the preparation host main inspects the store and collects its garbage through. It never downloads, and the
 * managed profile's seed and selection apply as they do for every other host.
 * @param input - The store root, this installation's path (its GC root) and the managed profile.
 * @returns The host.
 */
export const openDesktopPreparationHost = (input: {
  readonly store: string;
  readonly hostPath: string;
  readonly managed: ManagedPreparation;
  readonly plugins?: readonly PreparationPlugin[];
}): PreparationHost =>
  createPreparationHost({
    plugins: input.plugins ?? desktopNativePlugins,
    store: input.store,
    hostPath: input.hostPath,
    ...(input.managed.seed === undefined ? {} : { seed: input.managed.seed }),
    selection: input.managed.selection,
  });

/**
 * The frame main posts to the kernel utilities: each declared native kernel the store holds a sealed closure for,
 * read from its launch index, and the store it read them from. A kernel the store lacks, or that no declared variant
 * fits this host, is left out; the utility reads the store for it, which says why it cannot run yet.
 * @param input - The host, the store's real path and its plugins.
 * @returns The frame.
 */
export const composeDesktopNativeKernels = async (input: {
  readonly host: PreparationHost;
  readonly store: string;
  readonly plugins?: readonly PreparationPlugin[];
}): Promise<NativeKernelsFrame> => {
  const kernels: NativeKernelSlot[] = [];
  for (const plugin of input.plugins ?? desktopNativePlugins) {
    for (const [kernel, { requires, extensions }] of Object.entries(plugin.deployment.kernels)) {
      // oxlint-disable-next-line no-await-in-loop -- a few small launch indexes, read in list order
      const state = await input.host.inspectLaunch({ package: plugin.package, dependencies: requires });
      const closure = state.status === 'ready' ? state.closures[requires[0]] : undefined;
      if (closure !== undefined) {
        kernels.push({ kernel, package: plugin.package, extensions, closure });
      }
    }
  }
  return { type: nativeKernelsFrameType, store: input.store, kernels };
};

/** What main does with the store once per launch, for its log. */
export type NativeStoreReport = {
  readonly store: string;
  readonly kernels: readonly string[];
  readonly garbage?: GarbageReport;
};

/**
 * Main's startup work on the payload store: post the native composition to the kernel utilities (always exactly
 * once, with every kernel refused when the store cannot be opened, so no utility waits for ever), then collect the
 * store's garbage (D21). Never rejects.
 * @param input - The store root, this installation's path, the managed profile's environment, where to post the
 *   frame, a log and cancellation.
 * @returns What happened.
 */
export const startNativeStore = async (input: {
  readonly store: string;
  readonly hostPath: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly post: (frame: NativeKernelsFrame) => void;
  readonly log: (level: 'info' | 'warn' | 'error', event: string, detail: unknown) => void;
  readonly signal: AbortSignal;
  readonly plugins?: readonly PreparationPlugin[];
}): Promise<NativeStoreReport | undefined> => {
  const plugins = input.plugins ?? desktopNativePlugins;
  let host: PreparationHost | undefined;
  let posted = false;
  try {
    /* The native sandbox grants a closure by its real path, so the store is composed by its real path too. */
    await mkdir(input.store, { recursive: true });
    const store = await realpath(input.store);
    host = openDesktopPreparationHost({
      store,
      hostPath: input.hostPath,
      managed: readManagedPreparation(input.environment),
      plugins,
    });
    const frame = await composeDesktopNativeKernels({ host, store, plugins });
    input.post(frame);
    posted = true;
    const kernels = frame.kernels.map(({ kernel }) => kernel);
    input.log('info', 'native.store', { store, kernels });
    /* Every closure this installation uses is now linked, so a collection keeps them. */
    const garbage = await host.collectGarbage({ signal: input.signal });
    input.log('info', 'native.gc', garbage);
    return { store, kernels, garbage };
  } catch (error) {
    input.log('error', 'native.store', error);
    if (!posted) {
      const message = `Tau could not open its payload store at ${input.store}: ${error instanceof Error ? error.message : String(error)}`;
      input.post({
        type: nativeKernelsFrameType,
        store: input.store,
        kernels: plugins.flatMap((plugin) =>
          Object.entries(plugin.deployment.kernels).map(([kernel, { extensions }]) => ({
            kernel,
            package: plugin.package,
            extensions,
            refusal: message,
          })),
        ),
      });
    }
    return undefined;
  } finally {
    host?.dispose();
  }
};
