/**
 * Reference machine facts for the printer simulation scene.
 *
 * The scene reads the geometry, chamber and material-system parts of a
 * `MachineManifest`. The viewer draws the followed machine's provider manifest;
 * before a machine is bound, or while its providers load, the X1C reference
 * below stands in so the viewer draws a real enclosure rather than a placeholder box.
 *
 * @module
 */

import type { MachineManifest } from '@taucad/runtime/machine';

/** The manifest facts the scene consumes; a full `MachineManifest` satisfies it. */
export type PrinterManifest = Readonly<{
  identity: Readonly<{ displayName: string }>;
  geometry: MachineManifest['geometry'];
  chamber: Pick<MachineManifest['chamber'], 'enclosed' | 'light' | 'fans'>;
  materialSystem: Pick<MachineManifest['materialSystem'], 'units' | 'slotsPerUnit' | 'externalSpool'>;
}>;

/** Bambu Lab X1 Carbon: 256 mm cube, CoreXY, plate on Z, four-slot AMS on the lid. */
export const x1cReferenceGeometry: PrinterManifest = Object.freeze({
  identity: { displayName: 'Bambu Lab X1 Carbon' },
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
      { id: 'part', label: 'Part cooling fan' },
      { id: 'auxiliary', label: 'Auxiliary fan' },
      { id: 'chamber', label: 'Chamber fan' },
    ],
  },
  materialSystem: { units: 1, slotsPerUnit: 4, externalSpool: true },
});

/**
 * Pick the manifest the scene draws.
 *
 * The directory entry does not carry a manifest yet, so every machine resolves
 * to the X1C reference; the seam exists so the Bambu manifest replaces it
 * without touching the scene.
 */
export const resolvePrinterManifest = (manifest: PrinterManifest | undefined): PrinterManifest =>
  manifest ?? x1cReferenceGeometry;
