// Port of PicoGK_SimulationExample src/SimulationTask.cs (CC0-1.0; LEAP 71
// waived copyright — see the upstream file header).
// Headless write→read: writeTask builds the SimpleFlowDevice and serialises
// the 5-field simulation container to bytes; readTask loads the bytes back as
// typed fields and probes the fluid domain on the C# 2 mm grid. The path-based
// Sh export plumbing, Library.Log and Preview* calls are dropped.

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { createSimpleFlowDevice } from './simpleFlowDevice.ts';
import { readSimpleFluidSimulationInput, type SimulationInput } from './simpleFluidSimulationInput.ts';
import { createSimpleFluidSimulationOutput } from './simpleFluidSimulationOutput.ts';

export interface WriteTaskResult {
  /** The serialised 5-field .vdb container. */
  bytes: Uint8Array;
  fluidDomain: Voxels;
  solidDomain: Voxels;
  inletPatch: Voxels;
}

/** C# `SimulationSetup.WriteTask`. */
export function writeTask(pk: Pico): WriteTaskResult {
  // physical inputs
  const fluidDensity = 1000; // kg/m3
  const fluidViscosity = 0.00000897; // m2/s
  const fluidInletVelocity = 1.5; // m/s

  // geometric inputs
  const { fluidDomain, solidDomain, inletPatch } = createSimpleFlowDevice(pk);

  // create the VDB container from the input data
  const { bytes } = createSimpleFluidSimulationOutput(
    pk,
    fluidDensity,
    fluidViscosity,
    fluidInletVelocity,
    fluidDomain,
    solidDomain,
    inletPatch,
  );
  return { bytes, fluidDomain, solidDomain, inletPatch };
}

export interface ProbeResult {
  /** Grid positions visited (2 mm steps over the fluid-domain bounding box). */
  samples: number;
  /** Values where the probe landed on an active voxel — one entry per hit. */
  density: number[];
  viscosity: number[];
  velocity: Vec3[];
}

export interface ReadTaskResult {
  input: SimulationInput;
  probe: ProbeResult;
}

/** C# `SimulationSetup.ReadTask` — typed read-back plus the 2 mm probe grid. */
export function readTask(pk: Pico, bytes: Uint8Array): ReadTaskResult {
  const input = readSimpleFluidSimulationInput(pk, bytes);

  // get bounding box and probe fluid domain values (C# fStep = 2f)
  const bounds = input.fluidDomain.bounds();
  const step = 2;
  const probe: ProbeResult = { samples: 0, density: [], viscosity: [], velocity: [] };
  for (let z = bounds.min[2]; z <= bounds.max[2]; z += step) {
    for (let x = bounds.min[0]; x <= bounds.max[0]; x += step) {
      for (let y = bounds.min[1]; y <= bounds.max[1]; y += step) {
        probe.samples += 1;
        const position: Vec3 = [x, y, z];
        const density = input.densityField.get(position);
        if (density !== null) probe.density.push(density);
        const viscosity = input.viscosityField.get(position);
        if (viscosity !== null) probe.viscosity.push(viscosity);
        const velocity = input.velocityField.get(position);
        if (velocity !== null) probe.velocity.push(velocity);
      }
    }
  }
  return { input, probe };
}
