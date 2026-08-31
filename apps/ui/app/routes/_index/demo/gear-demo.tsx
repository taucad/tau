import { defineRuntime } from '@taucad/runtime/worker';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { jscad } from '@taucad/jscad';
import { parameterCache, geometryCache } from '@taucad/middleware';
import { esbuild } from '@taucad/esbuild';
import { assimp } from '@taucad/assimp';
import gearJscad from '#components/geometry/splash/gear.jscad.js?raw';
import { KernelDemo } from '#routes/_index/demo/kernel-demo.js';
import { VerificationOverlay } from '#routes/_index/demo/verification-overlay.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';

const gearMainFile = 'main.js';

// Pure-JS JSCAD kernel: the primary demo path carries no WASM kernel, keeping
// this lazy chunk light. The gear regenerates near-instantly, so "live
// parameters" actually feels live (OQ3).
const gearRuntime = defineRuntime({
  plugins: [assimp(), jscad(), esbuild()],
  middleware: [parameterCache(), geometryCache()],
});

const gearClientOptions = {
  runtime: gearRuntime,
  transport: inProcessTransport({ runtime: gearRuntime, fileSystem: fromMemoryFs() }),
};

const gearUnits: Units = { length: { sourceSymbol: 'mm', displaySymbol: 'mm' } };

export function GearDemo(): React.JSX.Element {
  return (
    <KernelDemo
      clientOptions={gearClientOptions}
      files={{ [gearMainFile]: gearJscad }}
      mainFile={gearMainFile}
      units={gearUnits}
      exportName='gear'
      isInitialExpanded
      project={{
        name: 'Involute Gear',
        description: 'A parametric involute spur gear built with JSCAD',
        tags: ['jscad', 'parametric', 'gear'],
        forkedFrom: 'demo-gear',
      }}
      renderVerification={(geometry) => <VerificationOverlay geometry={geometry} />}
    />
  );
}
