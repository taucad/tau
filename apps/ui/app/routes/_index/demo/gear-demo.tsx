import gearJscad from '#components/geometry/splash/gear.jscad.js?raw';
import { KernelDemo } from '#routes/_index/demo/kernel-demo.js';
import { VerificationOverlay } from '#routes/_index/demo/verification-overlay.js';
import type { Units } from '#components/geometry/parameters/rjsf-context.js';
import { gearClientOptions } from '#runtime/demo-client-options.js';

const gearMainFile = 'main.js';

// Pure-JS JSCAD kernel: the primary demo path carries no WASM kernel, keeping
// this lazy chunk light. The gear regenerates near-instantly, so "live
// parameters" actually feels live (OQ3).
const gearUnits: Units = { length: { displaySymbol: 'mm' } };

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
