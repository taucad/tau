import type { PluginFactory, PluginInstance } from '@taucad/runtime/plugin';
import { defineRuntime } from '@taucad/runtime/worker';
import type { AnyRuntimeDefinition } from '@taucad/runtime/worker';

/** A plugin factory whose default invocation is valid for `--plugin`. @public */
export type DefaultInvocablePluginFactory = {
  readonly meta: PluginFactory['meta'];
  (): PluginInstance;
};

/** Loaded plugin inputs composed into the CLI runtime. @public */
export type CliRuntimeOptions = {
  readonly explicitFactories?: readonly DefaultInvocablePluginFactory[];
  readonly configuredPlugins?: readonly PluginInstance[];
};

/**
 * Build the CLI runtime from built-ins, configured instances, and default-invoked `--plugin` factories.
 *
 * @param options - Explicit and config-module plugins loaded from the invoking project.
 * @returns The CLI's complete runtime definition.
 */
export const createCliRuntime = async (options: CliRuntimeOptions = {}): Promise<AnyRuntimeDefinition> => {
  /*
   * Array order is kernel-selection precedence. Zoo is deliberately absent because it
   * needs credential configuration. Extensions and routes stay owned by the packages.
   */
  const [
    middlewareModule,
    esbuildModule,
    replicadModule,
    opencascadeModule,
    openrscadModule,
    jscadModule,
    manifoldModule,
    picovoxelModule,
    gltfModule,
    brepModule,
    rhinoModule,
  ] = await Promise.all([
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
  ]);
  const [{ assimp }, { image }] = await Promise.all([import('@taucad/assimp'), import('@taucad/image')]);
  const builtIns = [
    middlewareModule.plugin(),
    esbuildModule.plugin(),
    replicadModule.plugin(),
    opencascadeModule.plugin(),
    openrscadModule.plugin(),
    jscadModule.plugin(),
    manifoldModule.plugin(),
    picovoxelModule.picovoxel({ kernels: { default: { wasm: 'multi' } } }),
    gltfModule.plugin(),
    brepModule.plugin(),
    rhinoModule.plugin(),
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
