import type { PluginFactory, PluginInstance } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';
import { cliZooCloseErrors } from '#zoo-proxy.js';
import type { Acquisition } from '#acquisition.js';

/** A plugin factory whose default invocation is valid for `--plugin`. @public */
export type DefaultInvocablePluginFactory = {
  readonly meta: PluginFactory['meta'];
  (): PluginInstance;
};

/** Loaded plugin inputs composed into the CLI runtime. @public */
export type CliRuntimeOptions = {
  readonly explicitFactories?: readonly DefaultInvocablePluginFactory[];
  readonly configuredPlugins?: readonly PluginInstance[];
  /** The Zoo proxy the KCL kernel connects to; defaults to Tau Cloud's (see `cliZooProxyUrl`). */
  readonly zooProxyUrl?: string;
  /** `locked` (`TAU_ACQUISITION=locked`): the bundler refuses every import it would download (`package-not-locked`). */
  readonly acquisition?: Acquisition;
};

/**
 * The CLI runtime's plugin list: built-ins, configured instances in place of or after them, then default-invoked
 * `--plugin` factories.
 *
 * @param options - Explicit and config-module plugins loaded from the invoking project.
 * @returns The invoked plugins, in kernel-selection precedence.
 */
export const createCliPlugins = async (options: CliRuntimeOptions = {}): Promise<readonly PluginInstance[]> => {
  /*
   * Array order is kernel-selection precedence. Extensions and routes stay owned by the packages.
   */
  const [middlewareModule, esbuildModule, ...kernelModules] = await Promise.all([
    import('@taucad/middleware'),
    import('@taucad/esbuild'),
    import('@taucad/replicad'),
    import('@taucad/opencascade'),
    import('@taucad/openrscad'),
    import('@taucad/jscad'),
    import('@taucad/manifold'),
    import('@taucad/picovoxel'),
    import('@taucad/smlib'),
    import('@taucad/gltf'),
    import('@taucad/brep'),
    import('@taucad/rhino'),
    import('@taucad/slicer'),
    import('@taucad/tscircuit'),
  ]);
  const [{ assimp }, { image }, { zoo }, { smlibpy }, { build123d }, { picogk }] = await Promise.all([
    import('@taucad/assimp'),
    import('@taucad/image'),
    import('@taucad/zoo'),
    import('@taucad/smlibpy'),
    import('@taucad/build123d'),
    import('@taucad/picogk'),
  ]);
  const builtIns = [
    middlewareModule.plugin(),
    esbuildModule.plugin(
      options.acquisition === 'locked' ? { bundlers: { default: { acquisition: 'locked' } } } : undefined,
    ),
    ...kernelModules.map(({ plugin }) => plugin()),
    /* The credential rides the WebSocket upgrade (`#zoo-proxy.ts`), never these options. */
    zoo({
      kernels: {
        default: {
          baseUrl: options.zooProxyUrl ?? 'wss://api.tau.new/v1/kernels/zoo',
          closeErrors: { ...cliZooCloseErrors },
        },
      },
    }),
    /*
     * Native kernels bind to their sealed closures themselves, and refuse with `KERNEL_NOT_PREPARED` until then.
     * SMLibPy comes before Build123d: it claims only a `.py` entry that imports smlibpy, and the rest falls through.
     */
    smlibpy(),
    build123d(),
    picogk(),
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

  return plugins;
};

/**
 * Build the CLI runtime from built-ins, configured instances, and default-invoked `--plugin` factories.
 *
 * @param options - Explicit and config-module plugins loaded from the invoking project.
 * @returns The CLI's complete runtime definition.
 */
export const createCliRuntime = async (options: CliRuntimeOptions = {}): Promise<AnyRuntimeDefinition> =>
  defineRuntime({ plugins: await createCliPlugins(options) });
