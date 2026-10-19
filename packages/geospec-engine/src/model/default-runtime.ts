import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';
import { brep } from '@taucad/brep';
import { esbuild } from '@taucad/esbuild';
import { gltf } from '@taucad/gltf';
import { image } from '@taucad/image';
import { jscad } from '@taucad/jscad';
import { manifold } from '@taucad/manifold';
import { middleware } from '@taucad/middleware';
import { opencascade } from '@taucad/opencascade';
import { openrscad } from '@taucad/openrscad';
import { picovoxel } from '@taucad/picovoxel';
import { replicad } from '@taucad/replicad';
import { rhino } from '@taucad/rhino';
import { smlib } from '@taucad/smlib';
import { tscircuit } from '@taucad/tscircuit';
import type { PluginInstance } from '@taucad/runtime/plugin';

/**
 * An optional peer's plugin, or none when the package is not installed.
 * @param load - Imports the package and invokes its plugin factory.
 * @returns The plugin instance, or an empty list.
 */
const optionalPlugin = async (load: () => Promise<PluginInstance>): Promise<readonly PluginInstance[]> => {
  try {
    return [await load()];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return [];
    }
    throw error;
  }
};

/*
 * The native kernels are optional peers: listed when installed, each binds its own sealed closure from the payload
 * store when it initialises (`tau prepare <kernel>`) and refuses with `KERNEL_NOT_PREPARED` until then.
 */
const [smlibpyPlugins, build123dPlugins, picogkPlugins] = await Promise.all([
  optionalPlugin(async () => {
    const { smlibpy } = await import('@taucad/smlibpy');
    return smlibpy();
  }),
  optionalPlugin(async () => {
    const { build123d } = await import('@taucad/build123d');
    return build123d();
  }),
  optionalPlugin(async () => {
    const { picogk } = await import('@taucad/picogk');
    return picogk();
  }),
]);

export const defaultRuntime = defineRuntime({
  plugins: [
    esbuild(),
    middleware(),
    replicad(),
    opencascade(),
    openrscad(),
    jscad(),
    manifold(),
    // Serial, not 'auto': Node reports cross-origin isolated, and GeoSpec evidence must come from
    // the single-threaded build (blueprint D34). Exact exports run serial regardless.
    picovoxel({ kernels: { default: { wasm: 'serial' } } }),
    smlib(),
    gltf(),
    brep(),
    rhino(),
    image(),
    assimp({ preset: 'all' }),
    // SMLibPy precedes Build123d: it claims only a `.py` entry that imports smlibpy, and the rest falls through.
    ...smlibpyPlugins,
    ...build123dPlugins,
    ...picogkPlugins,
    tscircuit(),
  ],
});
