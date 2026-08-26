/* oxlint-disable new-cap -- libcascade mirrors OCCT's PascalCase C++ method names. */
/* eslint-disable new-cap, unicorn/no-process-exit, no-restricted-imports, no-bitwise, tau-lint/no-time-unit-suffix -- Opt-in benchmark harness, not library source: it is a CLI (exit codes are its gate contract), it imports its sibling workload table by relative path because `bench/` is outside the package `imports` map, and its JSON schema field names are fixed by `ocjs/merge-results.mjs`. */
/**
 * Four-tier native/WASM parity gate for the OpenCascade lane.
 *
 * WASM is the reference semantics; native is admissible only as `exact` or as a
 * declared `tolerant(epsilon)` with an owner and a reason. The tiers come from
 * the S2 design (R5):
 *
 *   T0  bit parity      identical bytes, same target and same OCCT pin, across
 *                       repeated builds — reproducibility, not cross-engine.
 *   T1  structural      identical solid/face/edge counts and topology ids.
 *   T2  numeric         triangle count within +/-1 %, positions within 1e-9
 *                       relative, volume/area/bbox within 1e-9 relative.
 *   T3  semantic        GeoSpec verdict parity on the corpus (see the report:
 *                       this tier needs the geospec harness pointed at both
 *                       backends and is not run here).
 *
 * T1 is the kill bar: a T1 failure means the native lane is not admissible.
 * T2 is expected to fail today — the divergence is inside
 * `BRepMesh_IncrementalMesh`, not in Tau's code — and is reported as a named,
 * owned known issue rather than a green tick.
 *
 *   node bench/parity.mjs [--out FILE]
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../..');
const require_ = createRequire(import.meta.url);

const argv = process.argv.slice(2);
const outFile = (() => {
  const index = argv.indexOf('--out');
  return index === -1 ? '' : argv[index + 1];
})();

/** Tessellation used for every parity measurement on both sides. */
const TESSELLATION = { linear: 0.004, angular: 0.5, relative: true };

const CORPUS = [
  { id: 'synthetic/40-box-fuse', kind: 'synthetic' },
  { id: 'occt/linkrods.step', kind: 'step', file: path.join(repoRoot, 'repos/OCCT/data/step/linkrods.step') },
  {
    id: 'nist-pmi/ctc_01_ap242-e1',
    kind: 'step',
    file: path.join(repoRoot, 'packages/geospec-engine/fixtures/interop/nist-pmi/nist_ctc_01_asme1_ap242-e1.stp'),
  },
  {
    id: 'nist-pmi/ctc_05_ap242-e1',
    kind: 'step',
    file: path.join(repoRoot, 'packages/geospec-engine/fixtures/interop/nist-pmi/nist_ctc_05_asme1_ap242-e1.stp'),
  },
  {
    id: 'nist-pmi/stc_06_ap242-e3',
    kind: 'step',
    file: path.join(repoRoot, 'packages/geospec-engine/fixtures/interop/nist-pmi/nist_stc_06_asme1_ap242-e3.stp'),
  },
];

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

const tessellationBbox = (positions) => {
  const bbox = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let index = 0; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[index + axis];
      bbox[axis] = Math.min(bbox[axis], value);
      bbox[axis + 3] = Math.max(bbox[axis + 3], value);
    }
  }
  return bbox;
};

// ---------------------------------------------------------------- native side

const binding = require_('../src/native/opencascade-native.node');

const nativeBoxes = () =>
  Array.from({ length: 40 }, (_, index) => {
    const x = index * 3;
    return binding.Solid.createBox([x, 0, 0], [x + 4, 4, 4]);
  });

const nativeSolids = (entry) =>
  entry.kind === 'synthetic' ? [binding.fuseAll(nativeBoxes())] : binding.readStep(fs.readFileSync(entry.file));

const nativeMeasure = (entry) => {
  const solids = nativeSolids(entry);
  const mesh = binding.mesh(solids, {
    deflectionLinear: TESSELLATION.linear,
    deflectionAngular: TESSELLATION.angular,
    relativeLinear: TESSELLATION.relative,
  });
  const metrics = solids.map((solid) => solid.metrics());
  // The bbox compared across engines is the *tessellation* bbox on both sides.
  // A BRep bounding box carries OCCT's gap tolerance and is a different
  // quantity from the node extent, so comparing the two is a harness bug, not a
  // divergence.
  const bbox = tessellationBbox(mesh.positions);
  return {
    solids: solids.length,
    faces: metrics.reduce((sum, m) => sum + m.faces, 0),
    edges: metrics.reduce((sum, m) => sum + m.edges, 0),
    triangles: mesh.triangles,
    nodes: mesh.positions.length / 3,
    volume: metrics.reduce((sum, m) => sum + m.volume, 0),
    area: metrics.reduce((sum, m) => sum + m.area, 0),
    bbox,
    positions: mesh.positions,
    glbDigest: sha256(
      binding.toGlb(solids, {
        deflectionLinear: TESSELLATION.linear,
        deflectionAngular: TESSELLATION.angular,
        relativeLinear: TESSELLATION.relative,
      }),
    ),
    brepDigest: sha256(binding.writeBrep(solids)),
  };
};

// ---------------------------------------------------------------- wasm side

const dist = path.join(repoRoot, 'node_modules/libcascade/dist');
const { createInstance } = await import(path.join(dist, 'init.single.js'));
const oc = await createInstance();

const wasmReadStep = (file) => {
  const virtualPath = `/${path.basename(file)}`;
  oc.FS.writeFile(virtualPath, fs.readFileSync(file));
  const reader = new oc.STEPControl_Reader();
  const status = reader.ReadFile(virtualPath);
  if (status !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
    throw new Error(`STEP read failed: ${status}`);
  }
  const progress = new oc.Message_ProgressRange();
  reader.TransferRoots(progress);
  const shape = reader.OneShape();
  progress.delete();
  reader.delete();
  return shape;
};

const wasmSynthetic = () => {
  // Multi-tool BRepAlgoAPI_Fuse over the same 40 overlapping boxes.
  const args = new oc.NCollection_List_TopoDS_Shape();
  const tools = new oc.NCollection_List_TopoDS_Shape();
  for (let index = 0; index < 40; index++) {
    const x = index * 3;
    const origin = new oc.gp_Pnt(x, 0, 0);
    const maker = new oc.BRepPrimAPI_MakeBox(origin, 4, 4, 4);
    const shape = maker.Shape();
    if (index === 0) {
      args.Append(shape);
    } else {
      tools.Append(shape);
    }
    maker.delete();
    origin.delete();
  }
  const fuse = new oc.BRepAlgoAPI_Fuse();
  fuse.SetArguments(args);
  fuse.SetTools(tools);
  const progress = new oc.Message_ProgressRange();
  fuse.Build(progress);
  const shape = fuse.Shape();
  progress.delete();
  return shape;
};

/**
 * Count *unique* sub-shapes, deduplicating by `IsSame`.
 *
 * `TopExp_Explorer` visits a shared edge once per adjacent face, so a raw visit
 * count is 2x the topology for a closed solid. cadrum's `iter_edge` yields
 * unique edges, so the wasm side has to dedupe to compare like with like.
 */
const explore = (shape, kind, visit) => {
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (explorer.More()) {
    visit(explorer.Current());
    explorer.Next();
  }
  explorer.delete();
};

/**
 * Count unique sub-shapes *inside the solids*, deduplicating by `IsSame`.
 *
 * Two conventions have to be matched here or the comparison is a harness bug:
 * `TopExp_Explorer` visits a shared edge once per adjacent face (2x the
 * topology of a closed solid), and `STEPControl_Reader::OneShape()` returns a
 * compound that also carries free PMI annotation curves the native
 * `read_step` -> `Vec<Solid>` path never sees. The facade measures solids, so
 * the reference measures solids.
 */
const countInSolids = (shape, kind) => {
  const unique = [];
  explore(shape, 'TopAbs_SOLID', (solid) => {
    explore(solid, kind, (current) => {
      if (!unique.some((seen) => seen.IsSame(current))) {
        unique.push(current);
      }
    });
  });
  return unique.length;
};

const countSolids = (shape) => {
  let count = 0;
  explore(shape, 'TopAbs_SOLID', () => {
    count++;
  });
  return count;
};

const wasmMeasure = (entry) => {
  const shape = entry.kind === 'synthetic' ? wasmSynthetic() : wasmReadStep(entry.file);
  const mesher = new oc.BRepMesh_IncrementalMesh(
    shape,
    TESSELLATION.linear,
    TESSELLATION.relative,
    TESSELLATION.angular,
    false,
  );

  let triangles = 0;
  let nodes = 0;
  const positions = [];
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (explorer.More()) {
    const face = oc.TopoDS.Face(explorer.Current());
    const location = new oc.TopLoc_Location();
    const triangulation = oc.BRep_Tool.Triangulation(face, location, 0);
    if (triangulation) {
      triangles += triangulation.NbTriangles();
      const count = triangulation.NbNodes();
      nodes += count;
      const transform = location.Transformation();
      for (let index = 1; index <= count; index++) {
        const point = triangulation.Node(index).Transformed(transform);
        positions.push(point.X(), point.Y(), point.Z());
        point.delete();
      }
      transform.delete();
      triangulation.delete();
    }
    location.delete();
    face.delete();
    explorer.Next();
  }
  explorer.delete();
  mesher.delete();

  const properties = new oc.GProp_GProps();
  oc.BRepGProp.VolumeProperties(shape, properties, false, false, false);
  const volume = properties.Mass();
  const surface = new oc.GProp_GProps();
  oc.BRepGProp.SurfaceProperties(shape, surface, false, false);
  const area = surface.Mass();
  properties.delete();
  surface.delete();

  const measured = {
    solids: countSolids(shape),
    faces: countInSolids(shape, 'TopAbs_FACE'),
    edges: countInSolids(shape, 'TopAbs_EDGE'),
    triangles,
    nodes,
    volume,
    area,
    bbox: tessellationBbox(positions),
    positions: Float64Array.from(positions),
  };
  shape.delete();
  return measured;
};

// ---------------------------------------------------------------- comparison

const relative = (a, b) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE));

const results = [];
for (const entry of CORPUS) {
  if (entry.file && !fs.existsSync(entry.file)) {
    results.push({ id: entry.id, skipped: `missing fixture ${entry.file}` });
    continue;
  }

  const nativeA = nativeMeasure(entry);
  const nativeB = nativeMeasure(entry);
  const wasm = wasmMeasure(entry);

  const t0 = {
    glb: nativeA.glbDigest === nativeB.glbDigest,
    brep: nativeA.brepDigest === nativeB.brepDigest,
    positions: Buffer.compare(Buffer.from(nativeA.positions.buffer), Buffer.from(nativeB.positions.buffer)) === 0,
  };

  const t1 = {
    solids: [nativeA.solids, wasm.solids],
    faces: [nativeA.faces, wasm.faces],
    edges: [nativeA.edges, wasm.edges],
    pass: nativeA.solids === wasm.solids && nativeA.faces === wasm.faces && nativeA.edges === wasm.edges,
  };

  const triangleDelta = relative(nativeA.triangles, wasm.triangles);
  const bboxDelta = Math.max(...nativeA.bbox.map((value, index) => relative(value, wasm.bbox[index])));
  const positionDelta =
    nativeA.positions.length === wasm.positions.length
      ? Math.max(...Array.from(nativeA.positions, (value, index) => relative(value, wasm.positions[index])))
      : null;
  const t2 = {
    triangles: [nativeA.triangles, wasm.triangles],
    triangleDelta,
    nodes: [nativeA.nodes, wasm.nodes],
    volumeDelta: relative(nativeA.volume, wasm.volume),
    areaDelta: relative(nativeA.area, wasm.area),
    bboxDelta,
    positionDelta,
    pass:
      triangleDelta <= 0.01 &&
      relative(nativeA.volume, wasm.volume) <= 1e-9 &&
      relative(nativeA.area, wasm.area) <= 1e-9 &&
      bboxDelta <= 1e-9 &&
      (positionDelta === null || positionDelta <= 1e-9),
  };

  results.push({
    id: entry.id,
    occt: binding.version().occt,
    t0: { ...t0, pass: t0.glb && t0.brep && t0.positions },
    t1,
    t2,
    digests: { glb: nativeA.glbDigest, brep: nativeA.brepDigest },
  });
}

/**
 * `exact` is reserved for identical geometry; a row inside the tolerance band
 * but not identical is `tolerant(epsilon)` and needs an owner and a reason.
 */
const verdict = (row) => {
  if (row.skipped) {
    return 'skipped';
  }
  if (!row.t1.pass) {
    return 'divergent(T1)';
  }
  if (row.t2.triangleDelta === 0 && row.t2.positionDelta === 0) {
    return 'exact';
  }
  return row.t2.pass ? 'tolerant' : 'divergent(T2)';
};

const report = {
  occt: binding.version().occt,
  reference: 'libcascade-single (wasm)',
  tessellation: TESSELLATION,
  tiers: {
    t0: 'bit parity, same target',
    t1: 'structural',
    t2: 'numeric tolerance',
    t3: 'GeoSpec verdict (not run here)',
  },
  rows: results.map((row) => ({ ...row, verdict: verdict(row) })),
};

const pad = (value, width) => String(value).padEnd(width);
console.log(
  pad('corpus', 28) + pad('T0', 6) + pad('T1', 6) + pad('T2', 6) + pad('tris n/w', 20) + pad('Δtri', 10) + 'verdict',
);
for (const row of report.rows) {
  if (row.skipped) {
    console.log(pad(row.id, 28) + row.skipped);
    continue;
  }
  console.log(
    pad(row.id, 28) +
      pad(row.t0.pass ? 'pass' : 'FAIL', 6) +
      pad(row.t1.pass ? 'pass' : 'FAIL', 6) +
      pad(row.t2.pass ? 'pass' : 'fail', 6) +
      pad(`${row.t2.triangles[0]} / ${row.t2.triangles[1]}`, 20) +
      pad(`${(row.t2.triangleDelta * 100).toFixed(3)}%`, 10) +
      row.verdict,
  );
}

if (outFile) {
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(path.resolve(outFile), JSON.stringify(report, null, 2));
}

const structural = report.rows.filter((row) => row.verdict === 'divergent(T1)');
const numeric = report.rows.filter((row) => row.verdict === 'divergent(T2)');
const tolerant = report.rows.filter((row) => row.verdict === 'tolerant');

if (tolerant.length > 0 || numeric.length > 0) {
  console.error('\nKNOWN DIVERGENCE (not a pass):');
  for (const row of [...tolerant, ...numeric]) {
    console.error(
      `  ${row.id}: triangles ${row.t2.triangles[0]} native vs ${row.t2.triangles[1]} wasm ` +
        `(${(row.t2.triangleDelta * 100).toFixed(3)} %), volume delta ${row.t2.volumeDelta.toExponential(2)} — ` +
        'inside BRepMesh_IncrementalMesh, owner: S2/RQ1, upstream investigation open.',
    );
  }
}

// T1 is the kill bar. T2 divergence is owned and reported, and only fails the
// run under --strict, so a tolerance regression is visible without pretending
// today's state is green.
if (structural.length > 0) {
  console.error(
    `\nT1 structural parity failed on ${structural.length} corpus item(s) — the native lane is NOT admissible.`,
  );
  process.exit(1);
}
if (numeric.length > 0 && argv.includes('--strict')) {
  console.error(`\n--strict: ${numeric.length} corpus item(s) fall outside the declared T2 band.`);
  process.exit(2);
}
process.exit(0);
