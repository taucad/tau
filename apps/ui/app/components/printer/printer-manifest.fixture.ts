/**
 * Reference machine facts for the printer simulation scene.
 *
 * The scene reads a small `PrinterManifest` seam: geometry and chamber from the
 * manifest's FFF process, the light and fans from its `light` and `fan`
 * components, and the material system's feeder units and slots. The viewer
 * draws the followed machine's provider manifest; before a machine is bound,
 * or while its providers load, the X1C reference below stands in so the viewer
 * draws a real enclosure rather than a placeholder box.
 *
 * @module
 */

import { fffProcessOf, millingProcessOf } from '@taucad/runtime/machine';
import type { MachineFffProcess, MachineManifest } from '@taucad/runtime/machine';
import { materialSystemOf } from '#components/print/machine-facts.js';

/** The machine facts the scene consumes, derived from a v3 manifest by {@link printerManifestOf}. */
export type PrinterManifest = Readonly<{
  identity: Readonly<{ displayName: string; model?: string }>;
  geometry: MachineFffProcess['geometry'];
  chamber: Readonly<{
    enclosed: boolean;
    light: boolean;
    fans: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  }>;
  materialSystem: Readonly<{ units: number; slotsPerUnit: number; externalSpool: boolean }>;
}>;

/** Bambu Lab X1 Carbon: 256 mm cube, CoreXY, plate on Z, four-slot AMS on the lid. */
export const x1cReferenceGeometry: PrinterManifest = Object.freeze({
  identity: { displayName: 'Bambu Lab X1 Carbon', model: 'x1c' },
  geometry: {
    unit: 'mm',
    buildVolume: { x: 256, y: 256, z: 256 },
    enclosure: { outer: { x: 389, y: 389, z: 457 }, enclosed: true, doors: ['front', 'top'] },
    kinematics: 'corexy',
    bedMotion: 'z',
    origin: 'front-left',
    // The head parks at the rear centre after homing; the exact park pose is not qualified.
    toolheadHome: { x: 128, y: 256, z: 256 },
    materialSystemMount: 'top',
  },
  chamber: {
    enclosed: true,
    light: true,
    fans: [
      { id: 'part-fan', label: 'Part fan' },
      { id: 'aux-fan', label: 'Auxiliary fan' },
      { id: 'chamber-fan', label: 'Chamber fan' },
    ],
  },
  materialSystem: { units: 1, slotsPerUnit: 4, externalSpool: true },
});

/**
 * A milling machine's work area as an open, gantry-carried box: the scene has no milling hardware, so it draws the
 * declared working volume and nothing it would have to guess.
 */
const workAreaGeometry = ({ x, y, z }: Readonly<{ x: number; y: number; z: number }>): PrinterManifest['geometry'] => ({
  unit: 'mm',
  buildVolume: { x, y, z },
  enclosure: { outer: { x, y, z }, enclosed: false, doors: [] },
  kinematics: 'cartesian-gantry',
  bedMotion: 'none',
  origin: 'front-left',
  toolheadHome: { x: 0, y, z },
  materialSystemMount: 'none',
});

/**
 * The scene's facts for one machine manifest.
 *
 * @param manifest - The followed machine's provider manifest.
 * @returns The scene facts: an FFF printer's process geometry, a milling machine's work area as a plain box, or
 * nothing for a machine that declares neither.
 */
export const printerManifestOf = (manifest: MachineManifest): PrinterManifest | undefined => {
  const fff = fffProcessOf(manifest);
  const workArea = millingProcessOf(manifest)?.workArea;
  const geometry = fff?.geometry ?? (workArea === undefined ? undefined : workAreaGeometry(workArea));
  if (geometry === undefined) {
    return undefined;
  }
  const units = materialSystemOf(manifest)?.units ?? [];
  const feeders = units.filter((unit) => unit.kind === 'feeder');
  return {
    identity: { displayName: manifest.identity.displayName, model: manifest.identity.model },
    geometry,
    chamber: {
      enclosed: fff?.chamber.enclosed ?? false,
      light: manifest.components.some((component) => component.kind === 'light'),
      fans: manifest.components.filter((component) => component.kind === 'fan').map(({ id, label }) => ({ id, label })),
    },
    materialSystem: {
      units: feeders.length,
      slotsPerUnit: feeders[0]?.slots.length ?? 0,
      externalSpool: units.some((unit) => unit.kind === 'external'),
    },
  };
};

/**
 * Pick the facts the scene draws.
 *
 * @param manifest - The followed machine's provider manifest, once the providers load.
 * @returns Its scene facts, or the X1C reference before a machine is known or for one the scene cannot draw.
 */
export const resolvePrinterManifest = (manifest: MachineManifest | undefined): PrinterManifest =>
  // ponytail: a machine with neither an FFF process nor a work area falls back to the reference; draw nothing
  // instead once such a machine can be followed.
  (manifest === undefined ? undefined : printerManifestOf(manifest)) ?? x1cReferenceGeometry;
