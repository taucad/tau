/* eslint-disable unicorn/no-process-exit, no-restricted-imports, no-bitwise, tau-lint/no-time-unit-suffix -- Opt-in benchmark harness, not library source: it is a CLI (exit codes are its gate contract), it imports its sibling workload table by relative path because `bench/` is outside the package `imports` map, and its JSON schema field names are fixed by `ocjs/merge-results.mjs`. */
/**
 * The ten canonical frontier workloads, expressed through the
 * `@taucad/opencascade-native` facade.
 *
 * Semantics mirror
 * `repos/opencascade.js/experiments/build123d-vs-ocjs/native/samples.cpp` and
 * its `ocjs/samples.mjs` twin, so `ocjs/merge-results.mjs` consumes the JSON
 * this harness writes without changes.
 *
 * Deviations from `samples.cpp`, each deliberate and reported:
 *
 *   * `07_surface_filling_patch` is ABSENT. cadrum exposes no
 *     `BRepOffsetAPI_MakeFilling` equivalent — an API-coverage gap, not a
 *     performance result. The upstream patch is prepared but unsubmitted.
 *   * `03`/`04`/`09` evaluate through `BOPAlgo_CellsBuilder` (cadrum's only
 *     boolean path) rather than multi-tool `BRepAlgoAPI_Fuse`/`_Cut`. Different
 *     OCCT algorithm, same user-visible result — this is exactly the arity
 *     question the facade's routing exists to answer.
 *   * `10_mesh_incremental` additionally computes per-vertex normals and copies
 *     the whole mesh into JS typed arrays; the C++/JS sample only reads one
 *     face's triangulation. The facade does strictly more work here.
 */

const AXIS_Z = [0, 0, 1];

const overlappingBoxes = (oc, { count = 40, spacing = 3, side = 4 } = {}) =>
  Array.from({ length: count }, (_, index) => {
    const x = index * spacing;
    return oc.createSolid.box([x, 0, 0], [x + side, side, side]);
  });

const fuseManyBoxes = (oc) => oc.fuseAll(overlappingBoxes(oc));

/** Preview-quality tessellation, identical to sample 10 in samples.cpp. */
export const previewTessellation = { deflectionLinear: 0.25, deflectionAngular: 0.5, relativeLinear: false };

/**
 * Build the native workload table.
 * @param oc - The facade model API (`toModelApi(binding)`).
 * @returns Workload name to thunk.
 */
export const nativeSamples = (oc) => ({
  '01_primitive_box': () => oc.createSolid.box([0, 0, 0], [10, 20, 30]),

  '02_primitive_cylinder': () => oc.createSolid.cylinder(5, [0, 0, 15]),

  '03_boolean_fuse': () =>
    oc.fuseAll([oc.createSolid.box([0, 0, 0], [10, 10, 10]), oc.createSolid.box([0, 0, 0], [5, 5, 5])]),

  '04_boolean_cut_grid': () => {
    const base = oc.createSolid.box([0, 0, 0], [100, 100, 10]);
    const tools = [];
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        tools.push(oc.createSolid.cylinder(2, [0, 0, 20]).translate([10 + i * 20, 10 + j * 20, -5]));
      }
    }
    // One DNF clause: base AND NOT t1 AND ... AND NOT t25 — a single Build.
    return oc.cutAll(base, tools);
  },

  '05_loft_thru_sections': () =>
    oc.loft(
      [
        { kind: 'circle', radius: 10, axis: AXIS_Z, center: [0, 0, 0] },
        { kind: 'circle', radius: 5, axis: AXIS_Z, center: [0, 0, 15] },
        { kind: 'circle', radius: 8, axis: AXIS_Z, center: [0, 0, 30] },
      ],
      false,
    ),

  '06_pipe_shell_sweep': () =>
    oc.sweepLine({
      profile: { kind: 'circle', radius: 5, axis: AXIS_Z, center: [0, 0, 0] },
      start: [0, 0, 0],
      end: [0, 0, 30],
      orientation: 'fixed',
    }),

  // 07_surface_filling_patch: no cadrum equivalent — see the file header.

  '08_fillet_all_edges': () => oc.createSolid.box([0, 0, 0], [20, 20, 20]).fillet(3),

  '09_fuse_many_boxes': () => fuseManyBoxes(oc),

  '10_mesh_incremental': () => oc.mesh([fuseManyBoxes(oc)], previewTessellation),
});
