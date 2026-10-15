import type { PluginFactory, PluginInstance } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import type { Build123dClosureOptions } from '@taucad/build123d';
import type { PicogkKernelOptions } from '@taucad/picogk';
import { cliZooCloseErrors } from '#zoo-proxy.js';
import { unavailableKernelsPlugin } from '#unprepared-kernels.js';
import type { UnavailableNativeKernel } from '#unprepared-kernels.js';

/** A plugin factory whose default invocation is valid for `--plugin`. @public */
export type DefaultInvocablePluginFactory = {
  readonly meta: PluginFactory['meta'];
  (): PluginInstance;
};

/** Loaded plugin inputs composed into the CLI runtime. @public */
export type CliRuntimeOptions = {
  readonly explicitFactories?: readonly DefaultInvocablePluginFactory[];
  readonly configuredPlugins?: readonly PluginInstance[];
  readonly picogk?: PicogkKernelOptions;
  /** Build123d's options from the closure `tau prepare build123d` sealed; absent, no Build123d kernel is composed. */
  readonly build123d?: Build123dClosureOptions;
  /**
   * Native kernels declared but not composed (not prepared, or no runtime for this host); their files answer the
   * typed refusal instead of "no kernel handles this extension" (D7).
   */
  readonly unavailableKernels?: readonly UnavailableNativeKernel[];
  /** The Zoo proxy the KCL kernel connects to; defaults to Tau Cloud's (see `cliZooProxyUrl`). */
  readonly zooProxyUrl?: string;
};

/**
 * Build the CLI runtime from built-ins, configured instances, and default-invoked `--plugin` factories.
 *
 * @param options - Explicit and config-module plugins loaded from the invoking project.
 * @returns The CLI's complete runtime definition.
 */
export const createCliRuntime = async (options: CliRuntimeOptions = {}): Promise<AnyRuntimeDefinition> => {
  /*
   * Array order is kernel-selection precedence. Extensions and routes stay owned by the packages.
   */
  const modules = await Promise.all([
    import('@taucad/middleware'),
    import('@taucad/esbuild'),
    import('@taucad/replicad'),
    import('@taucad/opencascade'),
    import('@taucad/openrscad'),
    import('@taucad/jscad'),
    import('@taucad/manifold'),
    import('@taucad/picovoxel'),
    import('@taucad/gltf'),
    import('@taucad/brep'),
    import('@taucad/rhino'),
    import('@taucad/slicer'),
    import('@taucad/tscircuit'),
  ]);
  const [{ assimp }, { image }, { zoo }, picogkModule, build123dModule] = await Promise.all([
    import('@taucad/assimp'),
    import('@taucad/image'),
    import('@taucad/zoo'),
    options.picogk ? import('@taucad/picogk') : undefined,
    options.build123d ? import('@taucad/build123d') : undefined,
  ]);
  const unavailable = unavailableKernelsPlugin(options.unavailableKernels ?? []);
  const builtIns = [
    ...modules.map(({ plugin }) => plugin()),
    /* The credential rides the WebSocket upgrade (`#zoo-proxy.ts`), never these options. */
    zoo({
      kernels: {
        default: {
          baseUrl: options.zooProxyUrl ?? 'wss://api.tau.new/v1/kernels/zoo',
          closeErrors: { ...cliZooCloseErrors },
        },
      },
    }),
    ...(picogkModule && options.picogk ? [picogkModule.picogk({ kernels: { default: options.picogk } })] : []),
    ...(build123dModule && options.build123d
      ? [build123dModule.build123d({ kernels: { default: options.build123d } })]
      : []),
    ...(unavailable ? [unavailable] : []),
    assimp({ preset: 'all' }),
    image(),
  ];
  const builtInNames = new Set(builtIns.map(({ meta }) => meta.name));
  const plugins: PluginInstance[] = [...builtIns];
  const indexByName = new Map(plugins.map(({ meta }, index) => [meta.name, index]));

  for (const configured of options.configuredPlugins ?? []) {
    const index = indexByName.get(configured.meta.name);
    if (index === undefined) {
      indexByName.set(configured.meta.name, plugins.length);
      plugins.push(configured);
    } else {
      plugins[index] = configured;
    }
  }

  for (const factory of options.explicitFactories ?? []) {
    if (builtInNames.has(factory.meta.name)) {
      throw new Error(
        `Tau plugin "${factory.meta.name}" from --plugin collides with a built-in. Use --config to replace or configure built-ins.`,
      );
    }

    let instance: PluginInstance;
    try {
      instance = factory();
    } catch (error) {
      throw new Error(
        `Tau plugin "${factory.meta.name}" could not be invoked with defaults for --plugin. --plugin calls plugin() with no options; use --config to export an invoked plugin instance.`,
        { cause: error },
      );
    }
    if (indexByName.has(instance.meta.name)) {
      throw new Error(`Tau plugin "${instance.meta.name}" is configured more than once.`);
    }
    indexByName.set(instance.meta.name, plugins.length);
    plugins.push(instance);
  }

  return defineRuntime({ plugins });
};
