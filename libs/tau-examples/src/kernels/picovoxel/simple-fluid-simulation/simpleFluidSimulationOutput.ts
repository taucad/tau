// Port of PicoGK_SimulationExample src/SimpleFluidSimulationOutput.cs (CC0-1.0;
// LEAP 71 waived copyright — see the upstream file header).
// Builds the 5-field simulation container from physical + geometric inputs:
// inlet velocities extracted from the patch's top-cap surface normals, merged
// over a zero default; density/viscosity as constant fields sharing the
// velocity field's structure. Serialises to .vdb bytes instead of a file path.

import type { Pico, ScalarField, VectorField, Voxels } from 'picovoxel';
import { surfaceNormalFieldExtractor, vectorFieldMerge } from 'picovoxel';
import { simulationKeyWords } from './simpleFluidSimulationInput.ts';

export interface SimulationOutput {
  /** The serialised 5-field .vdb container. */
  bytes: Uint8Array;
  velocityField: VectorField;
  densityField: ScalarField;
  viscosityField: ScalarField;
}

/** C# `SimpleFluidSimulationOutput` ctor. */
export function createSimpleFluidSimulationOutput(
  pk: Pico,
  fluidDensity: number,
  fluidViscosity: number,
  fluidInletVelocity: number,
  fluidDomain: Voxels,
  solidDomain: Voxels,
  inletPatchBound: Voxels,
): SimulationOutput {
  // inlet velocity vector field: flow dir is -Z, so the extractor filters the
  // +Z surface normals and the negative scale flips them into the flow.
  const inletPatch = fluidDomain.intersect(inletPatchBound);
  const inletField = surfaceNormalFieldExtractor(pk, inletPatch, {
    surfaceThresholdVx: 0.5,
    directionFilter: [0, 0, 1],
    directionFilterTolerance: 0,
    scaleBy: [-fluidInletVelocity, -fluidInletVelocity, -fluidInletVelocity],
  });

  // velocity vector field: zero default over the fluid domain, inlet merged in
  const velocityField = pk.createVectorField({ from: fluidDomain, value: [0, 0, 0] });
  vectorFieldMerge(inletField, velocityField);

  // density + viscosity scalar fields from the velocity field's structure
  const densityField = constScalarField(pk, velocityField, fluidDensity);
  const viscosityField = constScalarField(pk, velocityField, fluidViscosity);

  // write the container with the C# metadata naming
  const vdb = pk.createVdb();
  vdb.add(fluidDomain, `Simulation.Domain_${simulationKeyWords.fluid}`);
  vdb.add(solidDomain, `Simulation.Domain_${simulationKeyWords.solid}`);
  vdb.add(velocityField, `Simulation.Field_${simulationKeyWords.velocity}`);
  vdb.add(densityField, `Simulation.Field_${simulationKeyWords.density}`);
  vdb.add(viscosityField, `Simulation.Field_${simulationKeyWords.viscosity}`);
  return { bytes: vdb.toBytes(), velocityField, densityField, viscosityField };
}

/**
 * C# `ScalarUtil.oGetConstScalarField` — a constant value over the input
 * field's active structure, with the upstream read-back check. Fields store
 * float32, so the check compares against `Math.fround` of the constant (the
 * C# comparison is float==float and passes by construction).
 */
export function constScalarField(pk: Pico, inputField: VectorField, constValue: number): ScalarField {
  const expected = Math.fround(constValue);
  const output = pk.createScalarField();
  inputField.traverse((x, y, z) => {
    output.set([x, y, z], constValue);
    const check = output.get([x, y, z]);
    if (check === null) throw new Error(`const scalar value did not activate at [${x}, ${y}, ${z}]`);
    if (check !== expected) throw new Error(`const scalar value read back ${check}, expected ${expected}`);
  });
  return output;
}
