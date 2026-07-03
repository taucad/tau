import type { ShapeConfig, Shape3D } from 'replicad';
import { makeCrankshaft } from '../lib/crankshaft.js';
import { makeDamper } from '../lib/damper.js';
import { makeFlywheel } from '../lib/flywheel.js';
import { crankStations, defaultParams, type Params } from '../lib/params.js';

export { defaultParams };

export default function main(p: Params = defaultParams): ShapeConfig[] {
  const st = crankStations(p);
  return [
    { shape: makeCrankshaft(p), color: '#c3c3cc', name: 'Crankshaft' },
    {
      shape: makeDamper(p).translate([
        st.snoutStart - p.damperThk,
        0,
        0,
      ]) as Shape3D,
      color: '#2b2b2e',
      name: 'Harmonic Damper',
    },
    {
      shape: makeFlywheel(p).translate([
        st.flangeStart + p.flangeThk,
        0,
        0,
      ]) as Shape3D,
      color: '#9a9aa2',
      name: 'Flywheel',
    },
  ];
}
