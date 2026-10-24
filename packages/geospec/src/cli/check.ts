/**
 * `geospec check`: the spec-less front door.
 *
 * It is `geospec run` over one bundled validity spec with the given file as its subject, so a first use needs no
 * `*.geospec.ts` and still takes the same runner, engine and report as any authored suite. No matcher is new and no
 * verdict is decided here: the bundled spec asserts the claims below, and each one passes, fails or refuses exactly as
 * it would in a spec of your own.
 *
 * - No error diagnostics from the load.
 * - For GLB, mesh integrity: finite positions, no degenerate or duplicate triangles, at least one triangle.
 * - For STEP, a valid BRep with closed shells.
 * - Closed edge incidence (`toBeWatertight`).
 * - A bounding box with positive size on every axis.
 * - With `--components <n>`, exactly `n` connected components.
 *
 * @module
 */

import { basename, dirname, extname, isAbsolute, join } from 'node:path';

/** Everything `geospec check` accepts. */
export type GeoSpecCliCheckOptions = {
  /** The STEP or GLB file to check, absolute or relative to the working directory. */
  file: string;
  /** The exact connected-component count to require; omitted, components are not asserted. */
  components?: number;
  json: boolean;
};

/**
 * Project-rooted path the bundled spec is served at. It never touches the disk: the runner reads it from memory, so a
 * file of the same name in the model's folder is never read or written.
 */
export const geoSpecCheckSpecPath = '.geospec-check.geospec.ts';

/** File extensions `geospec check` reads, and the format each loads as. */
const checkFormats: Readonly<Record<string, 'glb' | 'step'>> = { '.glb': 'glb', '.step': 'step', '.stp': 'step' };

/** A check resolved against the working directory: the project it runs in and the spec it runs. */
export type GeoSpecCheckPlan = {
  /** The model's folder, which becomes the project root. */
  projectPath: string;
  /** The model's path from that root. */
  file: string;
  /** The in-memory sources the runner serves, keyed by project-rooted path. */
  sources: Readonly<Record<string, string>>;
};

/**
 * The bundled validity spec for one model file.
 *
 * @param options - The model's project-rooted path, its format and the optional component count.
 * @returns The spec's TypeScript source.
 * @internal
 */
export const validitySpecSource = (options: { file: string; format: 'glb' | 'step'; components?: number }): string => {
  const file = JSON.stringify(options.file);
  // One test per claim, so each verdict is reported on its own; identical loads in a run share one admission.
  const claim = (name: string, ...assertions: string[]): string[] => [
    `  it(${JSON.stringify(name)}, async () => {`,
    `    const model = await loadModel({ source: ${file}, format: '${options.format}' });`,
    ...assertions.map((assertion) => `    expectGeo(model).${assertion};`),
    '  });',
  ];
  return [
    "import { describe, expectGeo, it } from 'geospec';",
    "import { loadModel } from 'geospec/model';",
    '',
    `describe(${file}, () => {`,
    ...claim('loads without error diagnostics', "toHaveNoDiagnostics({ severities: ['error'] })"),
    // A STEP subject's mesh is GeoSpec's own tessellation, so mesh integrity is a GLB claim.
    ...(options.format === 'glb'
      ? claim(
          'has mesh integrity',
          'toHaveMeshIntegrity({ finitePositions: true, degenerateTriangles: { count: 0 }, duplicateFaces: { count: 0 }, triangleCount: { greaterThan: 0 } })',
        )
      : claim('is a valid BRep with closed shells', 'toBeValidBrep({ closedShells: true })')),
    ...claim('is watertight', 'toBeWatertight()'),
    ...claim(
      'has a bounding box with positive size',
      'toHaveBoundingBox({ size: { x: { greaterThan: 0 }, y: { greaterThan: 0 }, z: { greaterThan: 0 } } })',
    ),
    ...(options.components === undefined
      ? []
      : claim(
          `has ${String(options.components)} connected component${options.components === 1 ? '' : 's'}`,
          `toHaveConnectedComponents({ count: ${String(options.components)} })`,
        )),
    '});',
    '',
  ].join('\n');
};

/**
 * Resolve a check: the model's folder is the project, and the bundled spec is served beside the model.
 *
 * @param options - The parsed `geospec check` options.
 * @param cwd - The working directory a relative file resolves against.
 * @returns The plan, or the reason the file cannot be checked.
 * @internal
 */
export const planGeoSpecCheck = (
  options: GeoSpecCliCheckOptions,
  cwd: string,
): GeoSpecCheckPlan | { error: string } => {
  const format = checkFormats[extname(options.file).toLowerCase()];
  if (format === undefined) {
    return { error: `geospec check reads .step, .stp or .glb files, not '${options.file}'.` };
  }
  const absolute = isAbsolute(options.file) ? options.file : join(cwd, options.file);
  const file = basename(absolute);
  return {
    projectPath: dirname(absolute),
    file,
    sources: {
      [geoSpecCheckSpecPath]: validitySpecSource({
        file,
        format,
        ...(options.components === undefined ? {} : { components: options.components }),
      }),
    },
  };
};
