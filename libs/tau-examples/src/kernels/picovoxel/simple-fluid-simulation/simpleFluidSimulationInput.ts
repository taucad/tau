// Port of PicoGK_SimulationExample src/SimpleFluidSimulationInput.cs (CC0-1.0;
// LEAP 71 waived copyright — see the upstream file header).
// Loads a simulation .vdb (bytes, not a path) and retrieves the input data for
// a simple fluid-flow setup: fluid/solid domains plus velocity, viscosity and
// density fields — validated exactly as the C# reader does. Library.Log lines
// are dropped for the headless port.

import type { Pico, ScalarField, VdbFieldType, VectorField, Voxels } from 'picovoxel';

/** C# `SimulationKeyWords`. */
export const simulationKeyWords = {
  fluid: 'fluid',
  solid: 'solid',
  density: 'density',
  viscosity: 'viscosity',
  velocity: 'velocity',
} as const;

export interface SimulationInput {
  fluidDomain: Voxels;
  solidDomain: Voxels;
  /** Flow speeds in m/s. */
  velocityField: VectorField;
  /** Densities in kg/m3. */
  densityField: ScalarField;
  /** Kinematic viscosities in m2/s. */
  viscosityField: ScalarField;
  /** Name + type of every container field, index order. */
  fields: Array<{ name: string; type: VdbFieldType }>;
}

/** C# `SimpleFluidSimulationInput` ctor — load, validate, retrieve. */
export function readSimpleFluidSimulationInput(pk: Pico, bytes: Uint8Array): SimulationInput {
  const vdb = pk.openVdb(bytes);
  const fields = vdb.fields();

  // check if content is as expected: 2x voxels, 2x scalar field, 1x vector field
  if (fields.length !== 5) {
    throw new Error('Five fields are expected. VDB file content is not suitable for this simulation input.');
  }
  let vectorFields = 0;
  let voxelFields = 0;
  let scalarFields = 0;
  for (const field of fields) {
    if (field.type === 'vectorField') vectorFields += 1;
    else if (field.type === 'voxels') voxelFields += 1;
    else if (field.type === 'scalarField') scalarFields += 1;
    else throw new Error('Unsupported field found. VDB file content is not suitable for this simulation input.');
  }
  if (vectorFields !== 1 || voxelFields !== 2 || scalarFields !== 2) {
    throw new Error(
      'One vector field is expected. Two voxel fields are expected. Two scalar fields are expected. ' +
        'VDB file content is not suitable for this simulation input.',
    );
  }

  // retrieve fields by type + keyword-in-name, exactly as upstream
  let fluidDomain: Voxels | undefined;
  let solidDomain: Voxels | undefined;
  let velocityField: VectorField | undefined;
  let densityField: ScalarField | undefined;
  let viscosityField: ScalarField | undefined;
  for (let index = 0; index < fields.length; index += 1) {
    const { name, type } = fields[index]!;
    if (type === 'voxels' && name.includes(simulationKeyWords.fluid)) fluidDomain = vdb.getVoxels(index);
    else if (type === 'voxels' && name.includes(simulationKeyWords.solid)) solidDomain = vdb.getVoxels(index);
    else if (type === 'vectorField' && name.includes(simulationKeyWords.velocity)) velocityField = vdb.getVectorField(index);
    else if (type === 'scalarField' && name.includes(simulationKeyWords.density)) densityField = vdb.getScalarField(index);
    else if (type === 'scalarField' && name.includes(simulationKeyWords.viscosity)) viscosityField = vdb.getScalarField(index);
  }

  // C# MissingFieldException family
  if (!densityField) throw new Error('Missing fluid density field');
  if (!velocityField) throw new Error('Missing fluid velocity field');
  if (!viscosityField) throw new Error('Missing fluid viscosity field');
  if (!fluidDomain) throw new Error('Missing fluid domain voxel field');
  if (!solidDomain) throw new Error('Missing solid domain voxel field');

  return { fluidDomain, solidDomain, velocityField, densityField, viscosityField, fields };
}
