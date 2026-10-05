import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { admitAssemblyDisplay } from '#runtime/assembly-display-admission.js';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import { assimp } from '@taucad/assimp';
import { esbuild } from '@taucad/esbuild';
import { jscad } from '@taucad/jscad';
import { openrscad } from '@taucad/openrscad';
import { geometryCache, gltfEdgeDetection, parameterUnits } from '@taucad/middleware';

const openScadRuntime = defineRuntime({
  plugins: [assimp(), openrscad(), esbuild()],
  middleware: [parameterUnits(), geometryCache(), gltfEdgeDetection()],
});

const gearRuntime = defineRuntime({
  plugins: [assimp(), jscad(), esbuild()],
  middleware: [parameterUnits(), geometryCache()],
});

const splashRuntime = defineRuntime({
  plugins: [jscad(), esbuild()],
  middleware: [parameterUnits(), geometryCache()],
});

const openScadClientOptions = {
  runtime: openScadRuntime,
  transport: inProcessTransport({
    runtime: openScadRuntime,
    fileSystem: fromMemoryFs(),
    admitAssemblyDisplay,
  }),
};
export const heroClientOptions = openScadClientOptions;
export const qrClientOptions = openScadClientOptions;
export const gearClientOptions = {
  runtime: gearRuntime,
  transport: inProcessTransport({
    runtime: gearRuntime,
    fileSystem: fromMemoryFs(),
    admitAssemblyDisplay,
  }),
};
export const splashClientOptions = {
  runtime: splashRuntime,
  transport: inProcessTransport({
    runtime: splashRuntime,
    fileSystem: fromMemoryFs(),
    admitAssemblyDisplay,
  }),
};
