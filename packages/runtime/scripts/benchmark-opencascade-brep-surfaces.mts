/* oxlint-disable eslint-comments-js/require-description, no-await-in-loop, no-console, new-cap, max-lines, max-params, typescript/no-confusing-void-expression, typescript/no-explicit-any, typescript/no-unnecessary-condition, typescript/no-unsafe-argument, typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, typescript/no-unsafe-return, typescript/restrict-plus-operands, tau-lint/no-time-unit-suffix, enforce-uint8array-arraybuffer/enforce-uint8array-arraybuffer, eslint/prefer-destructuring -- Direct OCJS benchmark code needs permissive C++ binding calls and stable JSON metric names. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { createRuntimeClient, fromMemoryFs } from '#index.js';
import { esbuild } from '#plugins/bundler-entry.js';
import { opencascade } from '#plugins/kernel-factories.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import { defineRuntime } from '#worker/runtime-definition.js';
import { activateOccParallelism } from '#kernels/occt/oc-threading.js';
import { createIncrementalMesh, meshShapesToGltf } from '#kernels/opencascade/opencascade-mesh.js';
import { extractGltfFromExportResult } from '#testing/kernel-geometry-testing.utils.js';

type Oc = any;
type Owned = { delete(): void };
type BenchContext = Record<string, unknown>;

type BenchCase = {
  name: string;
  category: string;
  notes: string;
  expectedFailure?: boolean;
  reuseSetup?: boolean;
  setup?: (oc: Oc, options: BenchOptions) => BenchContext | Promise<BenchContext>;
  run: (oc: Oc, context: BenchContext, options: BenchOptions) => unknown | Promise<unknown>;
  teardown?: (oc: Oc, context: BenchContext, options: BenchOptions) => void | Promise<void>;
};

type BenchOptions = {
  variant: string;
};

type BenchResult = {
  name: string;
  category: string;
  notes: string;
  iterations: number;
  warmup: number;
  ok: boolean;
  expectedFailure?: boolean;
  error?: string;
  timingsMs: number[];
  meanMs?: number;
  medianMs?: number;
  p95Ms?: number;
  minMs?: number;
  maxMs?: number;
};

const safeDelete = (value: unknown): void => {
  try {
    const candidate = value as Partial<Owned> | undefined;
    if (typeof candidate?.delete === 'function') {
      candidate.delete();
    }
  } catch {
    // Ignore teardown failures so the first benchmark failure stays visible.
  }
};

const deleteAll = (values: unknown[]): void => {
  for (let index = values.length - 1; index >= 0; index--) {
    safeDelete(values[index]);
  }
};

const assertShape = (shape: any, label: string): void => {
  if (!shape || shape.IsNull()) {
    throw new Error(`${label} produced a null shape`);
  }
};

const countSubShapes = (oc: Oc, shape: any, kind: string): number => {
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  let count = 0;
  try {
    while (explorer.More()) {
      count++;
      explorer.Next();
    }
    return count;
  } finally {
    explorer.delete();
  }
};

const collectSubShapes = (oc: Oc, shape: any, kind: 'TopAbs_EDGE' | 'TopAbs_FACE', limit = Infinity): any[] => {
  const explorer = new oc.TopExp_Explorer(shape, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const result: any[] = [];
  try {
    while (explorer.More() && result.length < limit) {
      const current = explorer.Current();
      try {
        result.push(kind === 'TopAbs_EDGE' ? oc.TopoDS.Edge(current) : oc.TopoDS.Face(current));
      } finally {
        current.delete();
      }
      explorer.Next();
    }
    return result;
  } finally {
    explorer.delete();
  }
};

const makePoint = (oc: Oc, x: number, y: number, z: number): any => new oc.gp_Pnt(x, y, z);

const makeBoxAt = (oc: Oc, x: number, y: number, z: number, dx: number, dy: number, dz: number): any => {
  const origin = makePoint(oc, x, y, z);
  const maker = new oc.BRepPrimAPI_MakeBox(origin, dx, dy, dz);
  try {
    const shape = maker.Shape();
    assertShape(shape, 'box');
    return shape;
  } finally {
    maker.delete();
    origin.delete();
  }
};

const makeCylinder = (
  oc: Oc,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  radius: number,
  height: number,
): any => {
  const origin = makePoint(oc, x, y, z);
  const direction = new oc.gp_Dir(dx, dy, dz);
  const axis = new oc.gp_Ax2(origin, direction);
  const maker = new oc.BRepPrimAPI_MakeCylinder(axis, radius, height);
  try {
    const shape = maker.Shape();
    assertShape(shape, 'cylinder');
    return shape;
  } finally {
    maker.delete();
    axis.delete();
    direction.delete();
    origin.delete();
  }
};

const makeEdgeBetween = (oc: Oc, a: [number, number, number], b: [number, number, number]): any => {
  const p1 = makePoint(oc, a[0], a[1], a[2]);
  const p2 = makePoint(oc, b[0], b[1], b[2]);
  const maker = new oc.BRepBuilderAPI_MakeEdge(p1, p2);
  try {
    const edge = maker.Edge();
    assertShape(edge, 'edge');
    return edge;
  } finally {
    maker.delete();
    p2.delete();
    p1.delete();
  }
};

const makeRectangleWire = (oc: Oc, x: number, y: number, z: number, width: number, height: number): any => {
  const edges = [
    makeEdgeBetween(oc, [x, y, z], [x + width, y, z]),
    makeEdgeBetween(oc, [x + width, y, z], [x + width, y + height, z]),
    makeEdgeBetween(oc, [x + width, y + height, z], [x, y + height, z]),
    makeEdgeBetween(oc, [x, y + height, z], [x, y, z]),
  ];
  const maker = new oc.BRepBuilderAPI_MakeWire(edges[0], edges[1], edges[2], edges[3]);
  try {
    const wire = maker.Wire();
    assertShape(wire, 'rectangle wire');
    return wire;
  } finally {
    maker.delete();
    deleteAll(edges);
  }
};

const makeCircleWire = (oc: Oc, x: number, y: number, z: number, radius: number): any => {
  const origin = makePoint(oc, x, y, z);
  const direction = new oc.gp_Dir(0, 0, 1);
  const axis = new oc.gp_Ax2(origin, direction);
  const circle = new oc.Geom_Circle(axis, radius);
  const edgeMaker = new oc.BRepBuilderAPI_MakeEdge(circle);
  const edge = edgeMaker.Edge();
  const wireMaker = new oc.BRepBuilderAPI_MakeWire(edge);
  try {
    const wire = wireMaker.Wire();
    assertShape(wire, 'circle wire');
    return wire;
  } finally {
    wireMaker.delete();
    edge.delete();
    edgeMaker.delete();
    circle.delete();
    axis.delete();
    direction.delete();
    origin.delete();
  }
};

const makeFaceFromOuterAndHoles = (oc: Oc, outer: any, holes: any[]): any => {
  const maker = new oc.BRepBuilderAPI_MakeFace(outer, true);
  try {
    for (const hole of holes) {
      maker.Add(hole);
    }
    const face = maker.Face();
    assertShape(face, 'face with holes');
    return face;
  } finally {
    maker.delete();
  }
};

const prismShape = (oc: Oc, source: any, dx: number, dy: number, dz: number): any => {
  const vector = new oc.gp_Vec(dx, dy, dz);
  const maker = new oc.BRepPrimAPI_MakePrism(source, vector, true, true);
  try {
    const shape = maker.Shape();
    assertShape(shape, 'prism');
    return shape;
  } finally {
    maker.delete();
    vector.delete();
  }
};

const transformShape = (
  oc: Oc,
  shape: any,
  transform: any,
  copyGeom: boolean,
  copyMesh = false,
  modifiedShape = false,
): any => {
  const builder = new oc.BRepBuilderAPI_Transform(shape, transform, copyGeom, copyMesh);
  try {
    const out = modifiedShape ? builder.ModifiedShape(shape) : builder.Shape();
    assertShape(out, 'transform');
    return out;
  } finally {
    builder.delete();
  }
};

const makeTranslation = (oc: Oc, x: number, y: number, z: number): any => {
  const vector = new oc.gp_Vec(x, y, z);
  const transform = new oc.gp_Trsf();
  try {
    transform.SetTranslation(vector);
    return transform;
  } finally {
    vector.delete();
  }
};

const makeRotation = (oc: Oc, angleRadians: number): any => {
  const origin = makePoint(oc, 0, 0, 0);
  const direction = new oc.gp_Dir(0, 0, 1);
  const axis = new oc.gp_Ax1(origin, direction);
  const transform = new oc.gp_Trsf();
  try {
    transform.SetRotation(axis, angleRadians);
    return transform;
  } finally {
    axis.delete();
    direction.delete();
    origin.delete();
  }
};

const makeYupExportRotation = (oc: Oc): any => {
  const origin = makePoint(oc, 0, 0, 0);
  const direction = new oc.gp_Dir(1, 0, 0);
  const axis = new oc.gp_Ax1(origin, direction);
  const transform = new oc.gp_Trsf();
  try {
    transform.SetRotation(axis, -Math.PI / 2);
    return transform;
  } finally {
    axis.delete();
    direction.delete();
    origin.delete();
  }
};

const makeShapeList = (oc: Oc, shapes: any[]): any => {
  const list = new oc.NCollection_List_TopoDS_Shape();
  for (const shape of shapes) {
    list.Append(shape);
  }
  return list;
};

const cutAll = (oc: Oc, base: any, tools: any[], parallel = true): any => {
  const args = makeShapeList(oc, [base]);
  const toolList = makeShapeList(oc, tools);
  const cut = new oc.BRepAlgoAPI_Cut();
  const progress = new oc.Message_ProgressRange();
  try {
    cut.SetArguments(args);
    cut.SetTools(toolList);
    if (typeof cut.SetRunParallel === 'function') {
      cut.SetRunParallel(parallel);
    }
    cut.Build(progress);
    const shape = cut.Shape();
    assertShape(shape, 'multi-tool cut');
    return shape;
  } finally {
    progress.delete();
    cut.delete();
    toolList.delete();
    args.delete();
  }
};

const fuseAll = (oc: Oc, shapes: any[], parallel = true): any => {
  const args = makeShapeList(oc, shapes.slice(0, 1));
  const tools = makeShapeList(oc, shapes.slice(1));
  const fuse = new oc.BRepAlgoAPI_Fuse();
  const progress = new oc.Message_ProgressRange();
  try {
    fuse.SetArguments(args);
    fuse.SetTools(tools);
    if (typeof fuse.SetRunParallel === 'function') {
      fuse.SetRunParallel(parallel);
    }
    fuse.Build(progress);
    const shape = fuse.Shape();
    assertShape(shape, 'multi-tool fuse');
    return shape;
  } finally {
    progress.delete();
    fuse.delete();
    tools.delete();
    args.delete();
  }
};

const makeV8EngineBlock = (oc: Oc): any => {
  const base = makeBoxAt(oc, -90, -45, -30, 180, 90, 60);
  const boreTools: any[] = [];
  try {
    for (const x of [-62, -38, -14, 10, 34, 58, 82, 106]) {
      boreTools.push(makeCylinder(oc, x - 45, -62, -40, 0, 0.42, 1, 8.5, 110));
      boreTools.push(makeCylinder(oc, x - 45, 62, -40, 0, -0.42, 1, 8.5, 110));
    }
    const bored = cutAll(oc, base, boreTools);
    const crankTool = makeCylinder(oc, -105, 0, -6, 1, 0, 0, 14, 210);
    try {
      const result = cutAll(oc, bored, [crankTool]);
      assertShape(result, 'v8 engine block');
      return result;
    } finally {
      crankTool.delete();
      bored.delete();
    }
  } finally {
    deleteAll(boreTools);
    base.delete();
  }
};

const makeV8FixtureWithExternalFeatures = (oc: Oc): any => {
  const block = makeV8EngineBlock(oc);
  const boxes: any[] = [];
  try {
    boxes.push(makeBoxAt(oc, -80, -58, 24, 160, 12, 18));
    boxes.push(makeBoxAt(oc, -80, 46, 24, 160, 12, 18));
    boxes.push(makeBoxAt(oc, -95, -10, -24, 20, 20, 28));
    boxes.push(makeBoxAt(oc, 85, -10, -24, 20, 20, 28));
    const fused = fuseAll(oc, [block, ...boxes]);
    assertShape(fused, 'v8 fixture with external features');
    return fused;
  } finally {
    deleteAll(boxes);
    block.delete();
  }
};

const filletAllEdges = (oc: Oc, shape: any, radius: number, explicitBuild: boolean): any => {
  const fillet = new oc.BRepFilletAPI_MakeFillet(shape, oc.ChFi3d_FilletShape.ChFi3d_Rational);
  const edges = collectSubShapes(oc, shape, 'TopAbs_EDGE');
  const progress = new oc.Message_ProgressRange();
  try {
    for (const edge of edges) {
      fillet.Add(radius, edge);
    }
    if (explicitBuild) {
      fillet.Build(progress);
    }
    const out = fillet.Shape();
    assertShape(out, 'fillet');
    return out;
  } finally {
    progress.delete();
    deleteAll(edges);
    fillet.delete();
  }
};

const chamferAllEdges = (oc: Oc, shape: any, distance: number, explicitBuild: boolean): any => {
  const chamfer = new oc.BRepFilletAPI_MakeChamfer(shape);
  const edges = collectSubShapes(oc, shape, 'TopAbs_EDGE');
  const progress = new oc.Message_ProgressRange();
  try {
    for (const edge of edges) {
      chamfer.Add(distance, edge);
    }
    if (explicitBuild) {
      chamfer.Build(progress);
    }
    const out = chamfer.Shape();
    assertShape(out, 'chamfer');
    return out;
  } finally {
    progress.delete();
    deleteAll(edges);
    chamfer.delete();
  }
};

const shellOpenBox = (oc: Oc, shape: any, offset: number): any => {
  const faces = collectSubShapes(oc, shape, 'TopAbs_FACE', 1);
  const closingFaces = makeShapeList(oc, faces);
  const builder = new oc.BRepOffsetAPI_MakeThickSolid();
  const progress = new oc.Message_ProgressRange();
  try {
    builder.MakeThickSolidByJoin(
      shape,
      closingFaces,
      offset,
      1e-3,
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      oc.GeomAbs_JoinType.GeomAbs_Arc,
      false,
      progress,
    );
    const out = builder.Shape();
    assertShape(out, 'shell');
    return out;
  } finally {
    progress.delete();
    builder.delete();
    closingFaces.delete();
    deleteAll(faces);
  }
};

const offsetWire = (oc: Oc, wire: any, distance: number, join: string, approx: boolean): any => {
  const builder = new oc.BRepOffsetAPI_MakeOffset(wire, oc.GeomAbs_JoinType[join], false);
  try {
    builder.SetApprox(approx);
    builder.Perform(distance, 0);
    const out = builder.Shape();
    assertShape(out, 'wire offset');
    return out;
  } finally {
    builder.delete();
  }
};

const offsetSolid = (oc: Oc, shape: any, distance: number, join: string): any => {
  const builder = new oc.BRepOffsetAPI_MakeOffsetShape();
  const progress = new oc.Message_ProgressRange();
  try {
    builder.PerformByJoin(
      shape,
      distance,
      1e-3,
      oc.BRepOffset_Mode.BRepOffset_Skin,
      false,
      false,
      oc.GeomAbs_JoinType[join],
      false,
      progress,
    );
    const out = builder.Shape();
    assertShape(out, 'solid offset');
    return out;
  } finally {
    progress.delete();
    builder.delete();
  }
};

const pipeSweep = (oc: Oc): any => {
  const spineStart = makePoint(oc, 0, 0, 0);
  const spineMid = makePoint(oc, 25, 12, 30);
  const spineEnd = makePoint(oc, 55, -4, 62);
  const segmentA = new oc.BRepBuilderAPI_MakeEdge(spineStart, spineMid);
  const segmentB = new oc.BRepBuilderAPI_MakeEdge(spineMid, spineEnd);
  const edgeA = segmentA.Edge();
  const edgeB = segmentB.Edge();
  const spineMaker = new oc.BRepBuilderAPI_MakeWire(edgeA, edgeB);
  const spine = spineMaker.Wire();
  const profile = makeCircleWire(oc, 0, 0, 0, 5);
  const builder = new oc.BRepOffsetAPI_MakePipeShell(spine);
  const progress = new oc.Message_ProgressRange();
  try {
    builder.Add(profile, false, false);
    builder.Build(progress);
    builder.MakeSolid();
    const out = builder.Shape();
    assertShape(out, 'pipe sweep');
    return out;
  } finally {
    progress.delete();
    builder.delete();
    profile.delete();
    spine.delete();
    spineMaker.delete();
    edgeB.delete();
    edgeA.delete();
    segmentB.delete();
    segmentA.delete();
    spineEnd.delete();
    spineMid.delete();
    spineStart.delete();
  }
};

const loftThruSections = (oc: Oc, count: number, compatibility: boolean): any => {
  const loft = new oc.BRepOffsetAPI_ThruSections(true, false, 1e-6);
  const wires: any[] = [];
  const progress = new oc.Message_ProgressRange();
  try {
    for (let index = 0; index < count; index++) {
      const z = index * 12;
      const radius = 8 + Math.sin(index * 0.85) * 2.5;
      const wire = makeCircleWire(oc, Math.sin(index * 0.7) * 5, Math.cos(index * 0.5) * 4, z, radius);
      wires.push(wire);
      loft.AddWire(wire);
    }
    loft.CheckCompatibility(compatibility);
    loft.Build(progress);
    const out = loft.Shape();
    assertShape(out, 'loft');
    return out;
  } finally {
    progress.delete();
    loft.delete();
    deleteAll(wires);
  }
};

const draftSideFaces = (oc: Oc, shape: any): any => {
  const faces = collectSubShapes(oc, shape, 'TopAbs_FACE');
  const builder = new oc.BRepOffsetAPI_DraftAngle(shape);
  const direction = new oc.gp_Dir(0, 0, 1);
  const neutralOrigin = makePoint(oc, 0, 0, 0);
  const neutralNormal = new oc.gp_Dir(0, 0, 1);
  const neutralPlane = new oc.gp_Pln(neutralOrigin, neutralNormal);
  const progress = new oc.Message_ProgressRange();
  try {
    for (const face of faces.slice(0, 2)) {
      builder.Add(face, direction, (3 * Math.PI) / 180, neutralPlane, true);
      if (typeof builder.AddDone === 'function' && !builder.AddDone()) {
        throw new Error('draft AddDone() returned false');
      }
    }
    builder.Build(progress);
    const out = builder.Shape();
    assertShape(out, 'draft');
    return out;
  } finally {
    progress.delete();
    neutralPlane.delete();
    neutralNormal.delete();
    neutralOrigin.delete();
    direction.delete();
    builder.delete();
    deleteAll(faces);
  }
};

const featurePocketDraftPrism = (oc: Oc): any => {
  const base = makeBoxAt(oc, -50, -35, 0, 100, 70, 20);
  const faces = collectSubShapes(oc, base, 'TopAbs_FACE');
  const supportFace = faces[0];
  const holeWire = makeCircleWire(oc, 0, 0, 0, 10);
  const sketchMaker = new oc.BRepBuilderAPI_MakeFace(holeWire, true);
  const sketchFace = sketchMaker.Face();
  const feature = new oc.BRepFeat_MakeDPrism(base, supportFace, sketchFace, 0, 0, false);
  try {
    feature.PerformThruAll();
    const out = feature.Shape();
    assertShape(out, 'DPrism pocket');
    return out;
  } finally {
    feature.delete();
    sketchFace.delete();
    sketchMaker.delete();
    holeWire.delete();
    deleteAll(faces);
    base.delete();
  }
};

const booleanHolePlate = (oc: Oc, rows: number, cols: number): any => {
  const base = makeBoxAt(oc, -60, -40, 0, 120, 80, 10);
  const tools: any[] = [];
  try {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tools.push(makeCylinder(oc, -45 + col * 30, -25 + row * 25, -4, 0, 0, 1, 4, 18));
      }
    }
    const out = cutAll(oc, base, tools);
    assertShape(out, 'boolean hole plate');
    return out;
  } finally {
    deleteAll(tools);
    base.delete();
  }
};

const sketchHolePlate = (oc: Oc, rows: number, cols: number): any => {
  const outer = makeRectangleWire(oc, -60, -40, 0, 120, 80);
  const holes: any[] = [];
  try {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        holes.push(makeCircleWire(oc, -45 + col * 30, -25 + row * 25, 0, 4));
      }
    }
    const face = makeFaceFromOuterAndHoles(oc, outer, holes);
    try {
      const out = prismShape(oc, face, 0, 0, 10);
      assertShape(out, 'sketch hole plate');
      return out;
    } finally {
      face.delete();
    }
  } finally {
    deleteAll(holes);
    outer.delete();
  }
};

const textLikeOutlinePrism = (oc: Oc, glyphCount: number): any => {
  const strokes: any[] = [];
  const solids: any[] = [];
  try {
    for (let index = 0; index < glyphCount; index++) {
      const x = (index % 16) * 8;
      const y = Math.floor(index / 16) * 12;
      const wire = makeRectangleWire(oc, x, y, 0, 5.2, 8);
      strokes.push(wire);
      const face = makeFaceFromOuterAndHoles(oc, wire, []);
      const solid = prismShape(oc, face, 0, 0, 2);
      face.delete();
      solids.push(solid);
    }
    const out = fuseAll(oc, solids);
    assertShape(out, 'text-like outline prism');
    return out;
  } finally {
    deleteAll(solids);
    deleteAll(strokes);
  }
};

const hlrProjection = (oc: Oc, shape: any): number => {
  const origin = makePoint(oc, 140, -180, 120);
  const direction = new oc.gp_Dir(-0.55, 0.7, -0.45);
  const axis = new oc.gp_Ax2(origin, direction);
  const projector = new oc.HLRAlgo_Projector(axis);
  const algorithm = new oc.HLRBRep_Algo();
  const converter = new oc.HLRBRep_HLRToShape(algorithm);
  let visible: any | undefined;
  let hidden: any | undefined;
  try {
    algorithm.Add(shape, 0);
    algorithm.Projector(projector);
    algorithm.Update();
    algorithm.Hide();
    visible = converter.VCompound();
    hidden = converter.HCompound();
    assertShape(visible, 'visible HLR compound');
    return (
      countSubShapes(oc, visible, 'TopAbs_EDGE') + (hidden?.IsNull?.() ? 0 : countSubShapes(oc, hidden, 'TopAbs_EDGE'))
    );
  } finally {
    safeDelete(hidden);
    safeDelete(visible);
    converter.delete();
    algorithm.delete();
    projector.delete();
    axis.delete();
    direction.delete();
    origin.delete();
  }
};

const distanceExtremaReuse = (oc: Oc, source: any, targets: any[], multiThread: boolean): number => {
  const tool = new oc.BRepExtrema_DistShapeShape();
  const progress = new oc.Message_ProgressRange();
  let total = 0;
  try {
    if (typeof tool.SetMultiThread === 'function') {
      tool.SetMultiThread(multiThread);
    }
    tool.LoadS1(source);
    for (const target of targets) {
      tool.LoadS2(target);
      if (!tool.Perform(progress)) {
        throw new Error('BRepExtrema_DistShapeShape.Perform returned false');
      }
      total += Number(tool.Value());
    }
    return total;
  } finally {
    progress.delete();
    tool.delete();
  }
};

const distanceExtremaConstructor = (oc: Oc, source: any, targets: any[]): number => {
  let total = 0;
  for (const target of targets) {
    const progress = new oc.Message_ProgressRange();
    const tool = new oc.BRepExtrema_DistShapeShape(source, target, progress);
    try {
      if (!tool.IsDone()) {
        throw new Error('BRepExtrema_DistShapeShape constructor did not finish');
      }
      total += Number(tool.Value());
    } finally {
      tool.delete();
      progress.delete();
    }
  }
  return total;
};

const brepRoundTrip = (oc: Oc, shape: any): number => {
  const path = `/tmp/ocjs_brep_${Date.now()}_${Math.random().toString(16).slice(2)}.brep`;
  const progress = new oc.Message_ProgressRange();
  const format = oc.TopTools_FormatVersion.TopTools_FormatVersion_CURRENT;
  const readShape = new oc.TopoDS_Shape();
  const builder = new oc.BRep_Builder();
  try {
    const ok = oc.BRepTools.Write(shape, path, false, false, format, progress);
    if (!ok) {
      throw new Error('BRepTools.Write failed');
    }
    const bytes = oc.FS.readFile(path, { encoding: 'binary' }) as Uint8Array<ArrayBuffer>;
    const okRead = oc.BRepTools.Read(readShape, path, builder, progress);
    if (!okRead || readShape.IsNull()) {
      throw new Error('BRepTools.Read failed');
    }
    return bytes.byteLength;
  } finally {
    try {
      oc.FS.unlink(path);
    } catch {
      // Ignore missing file after failed writes.
    }
    builder.delete();
    readShape.delete();
    progress.delete();
  }
};

const stlExport = (oc: Oc, shape: any): number => {
  const path = `/tmp/ocjs_stl_${Date.now()}_${Math.random().toString(16).slice(2)}.stl`;
  const progress = new oc.Message_ProgressRange();
  const writer = new oc.StlAPI_Writer();
  let mesh: Owned | undefined;
  try {
    mesh = createIncrementalMesh(oc, shape, {
      linearTolerance: 0.1,
      angularTolerance: (30 * Math.PI) / 180,
      inParallel: true,
    });
    const ok = writer.Write(shape, path, progress);
    if (!ok) {
      throw new Error('StlAPI_Writer.Write failed');
    }
    const bytes = oc.FS.readFile(path, { encoding: 'binary' }) as Uint8Array<ArrayBuffer>;
    return bytes.byteLength;
  } finally {
    safeDelete(mesh);
    try {
      oc.FS.unlink(path);
    } catch {
      // Ignore missing file after failed writes.
    }
    writer.delete();
    progress.delete();
  }
};

const stepExport = (oc: Oc, shape: any): number => {
  const path = `/tmp/ocjs_step_${Date.now()}_${Math.random().toString(16).slice(2)}.step`;
  const progress = new oc.Message_ProgressRange();
  const writer = new oc.STEPControl_Writer();
  try {
    const transferStatus = writer.Transfer(shape, oc.STEPControl_StepModelType.STEPControl_AsIs, true, progress);
    if (transferStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(`STEPControl_Writer.Transfer failed: ${String(transferStatus)}`);
    }
    const writeStatus = writer.Write(path);
    if (writeStatus !== oc.IFSelect_ReturnStatus.IFSelect_RetDone) {
      throw new Error(`STEPControl_Writer.Write failed: ${String(writeStatus)}`);
    }
    const bytes = oc.FS.readFile(path, { encoding: 'binary' }) as Uint8Array<ArrayBuffer>;
    return bytes.byteLength;
  } finally {
    try {
      oc.FS.unlink(path);
    } catch {
      // Ignore missing file after failed writes.
    }
    writer.delete();
    progress.delete();
  }
};

const glbExportViaOpenCascadeKernel = async (oc: Oc, shape: any): Promise<number> => {
  const glb = await meshShapesToGltf(
    oc,
    [
      {
        name: 'V8Block',
        shape,
        color: '#cc3333',
      },
    ],
    {
      linearTolerance: 0.1,
      angularTolerance: (30 * Math.PI) / 180,
      inParallel: true,
      coordinateSystem: 'y-up',
      unit: { length: 'millimeter' },
    },
  );
  return glb.byteLength;
};

const opencascadeKernelV8Source = String.raw`
import initOpenCascade from 'libcascade';
void initOpenCascade;

const assertShape = (shape: any, label: string) => {
  if (!shape || shape.IsNull()) {
    throw new Error(label + ' produced a null shape');
  }
};

const makePoint = (oc: any, x: number, y: number, z: number) => new oc.gp_Pnt(x, y, z);

const makeBoxAt = (oc: any, x: number, y: number, z: number, dx: number, dy: number, dz: number) => {
  const origin = makePoint(oc, x, y, z);
  const maker = new oc.BRepPrimAPI_MakeBox(origin, dx, dy, dz);
  try {
    const shape = maker.Shape();
    assertShape(shape, 'box');
    return shape;
  } finally {
    maker.delete();
    origin.delete();
  }
};

const makeCylinder = (
  oc: any,
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number,
  radius: number,
  height: number,
) => {
  const origin = makePoint(oc, x, y, z);
  const direction = new oc.gp_Dir(dx, dy, dz);
  const axis = new oc.gp_Ax2(origin, direction);
  const maker = new oc.BRepPrimAPI_MakeCylinder(axis, radius, height);
  try {
    const shape = maker.Shape();
    assertShape(shape, 'cylinder');
    return shape;
  } finally {
    maker.delete();
    axis.delete();
    direction.delete();
    origin.delete();
  }
};

const deleteAll = (values: any[]) => {
  for (let index = values.length - 1; index >= 0; index--) {
    values[index]?.delete?.();
  }
};

const makeShapeList = (oc: any, shapes: any[]) => {
  const list = new oc.NCollection_List_TopoDS_Shape();
  for (const shape of shapes) {
    list.Append(shape);
  }
  return list;
};

const cutAll = (oc: any, base: any, tools: any[]) => {
  const args = makeShapeList(oc, [base]);
  const toolList = makeShapeList(oc, tools);
  const cut = new oc.BRepAlgoAPI_Cut();
  const progress = new oc.Message_ProgressRange();
  try {
    cut.SetArguments(args);
    cut.SetTools(toolList);
    if (typeof cut.SetRunParallel === 'function') {
      cut.SetRunParallel(true);
    }
    cut.Build(progress);
    const shape = cut.Shape();
    assertShape(shape, 'multi-tool cut');
    return shape;
  } finally {
    progress.delete();
    cut.delete();
    toolList.delete();
    args.delete();
  }
};

const fuseAll = (oc: any, shapes: any[]) => {
  const args = makeShapeList(oc, shapes.slice(0, 1));
  const tools = makeShapeList(oc, shapes.slice(1));
  const fuse = new oc.BRepAlgoAPI_Fuse();
  const progress = new oc.Message_ProgressRange();
  try {
    fuse.SetArguments(args);
    fuse.SetTools(tools);
    if (typeof fuse.SetRunParallel === 'function') {
      fuse.SetRunParallel(true);
    }
    fuse.Build(progress);
    const shape = fuse.Shape();
    assertShape(shape, 'multi-tool fuse');
    return shape;
  } finally {
    progress.delete();
    fuse.delete();
    tools.delete();
    args.delete();
  }
};

const makeV8EngineBlock = (oc: any) => {
  const base = makeBoxAt(oc, -90, -45, -30, 180, 90, 60);
  const boreTools: any[] = [];
  try {
    for (const x of [-62, -38, -14, 10, 34, 58, 82, 106]) {
      boreTools.push(makeCylinder(oc, x - 45, -62, -40, 0, 0.42, 1, 8.5, 110));
      boreTools.push(makeCylinder(oc, x - 45, 62, -40, 0, -0.42, 1, 8.5, 110));
    }
    const bored = cutAll(oc, base, boreTools);
    const crankTool = makeCylinder(oc, -105, 0, -6, 1, 0, 0, 14, 210);
    try {
      const result = cutAll(oc, bored, [crankTool]);
      assertShape(result, 'v8 engine block');
      return result;
    } finally {
      crankTool.delete();
      bored.delete();
    }
  } finally {
    deleteAll(boreTools);
    base.delete();
  }
};

const makeV8FixtureWithExternalFeatures = (oc: any) => {
  const block = makeV8EngineBlock(oc);
  const boxes: any[] = [];
  try {
    boxes.push(makeBoxAt(oc, -80, -58, 24, 160, 12, 18));
    boxes.push(makeBoxAt(oc, -80, 46, 24, 160, 12, 18));
    boxes.push(makeBoxAt(oc, -95, -10, -24, 20, 20, 28));
    boxes.push(makeBoxAt(oc, 85, -10, -24, 20, 20, 28));
    const fused = fuseAll(oc, [block, ...boxes]);
    assertShape(fused, 'v8 fixture with external features');
    return fused;
  } finally {
    deleteAll(boxes);
    block.delete();
  }
};

export default function main(oc: any, _parameters: Record<string, unknown>) {
  return {
    shape: makeV8FixtureWithExternalFeatures(oc),
    name: 'OpenCascadeKernelV8Block',
    color: '#cc3333',
  };
}
`;

const createOpenCascadeKernelContext = async (variant: string): Promise<BenchContext> => {
  const basePath = '/projects/opencascade-kernel-bench';
  const mainPath = `${basePath}/main.ts`;
  const runtime = defineRuntime({
    kernels: [opencascade({ wasm: variant === 'multi' ? 'multi' : 'full', ocTracing: 'off' })],
    bundlers: [esbuild()],
  });
  const transport = inProcessTransport({
    runtime,
    fileSystem: fromMemoryFs({ [mainPath]: opencascadeKernelV8Source }),
  });
  const client = createRuntimeClient({ transport });
  await client.connect();
  return {
    client,
    file: mainPath,
  };
};

const opencascadeKernelExportGlb = async (context: BenchContext): Promise<number> => {
  const client = context['client'] as ReturnType<typeof createRuntimeClient>;
  const result = await client.export('glb', {
    source: { path: context['file'] as string },
    parameters: {},
  });
  if (!result.success) {
    const messages = result.issues.map((issue) => issue.message).join('; ');
    throw new Error(`OpenCascade kernel export failed: ${messages}`);
  }
  const glb = extractGltfFromExportResult(result);
  if (!glb) {
    throw new Error('OpenCascade kernel GLB export unexpectedly failed');
  }
  return glb.byteLength;
};

const makeDistanceTargets = (oc: Oc): any[] => {
  const targets: any[] = [];
  for (let index = 0; index < 18; index++) {
    targets.push(makeBoxAt(oc, -95 + index * 11, 80 + (index % 3) * 7, -12, 6, 6, 6));
  }
  return targets;
};

const cases: BenchCase[] = [
  {
    name: 'v8-engine-block-plain-ocjs-build',
    category: 'fixture',
    notes: 'Builds a V8-like block from direct OCJS primitives and list-based boolean cuts.',
    run: (oc) => {
      const shape = makeV8EngineBlock(oc);
      shape.delete();
    },
  },
  {
    name: 'v8-engine-block-with-fuse-features-build',
    category: 'fixture',
    notes: 'Builds the same V8-like block, then fuses external box features using list-based fuse.',
    run: (oc) => {
      const shape = makeV8FixtureWithExternalFeatures(oc);
      shape.delete();
    },
  },
  {
    name: 'transform-translate-copyGeom-true',
    category: 'transform',
    notes: 'Replicad-like transform copy mode: BRepBuilderAPI_Transform(shape,trsf,true,false).',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), transform: makeTranslation(oc, 12, 0, 0) }),
    run: (oc, context) => {
      const source = context['source'];
      const transform = context['transform'];
      const outputs = Array.from({ length: 30 }, (_, index) =>
        transformShape(oc, source, transform, true, false, index % 2 === 0),
      );
      deleteAll(outputs);
    },
    teardown: (_oc, context) => deleteAll([context['transform'], context['source']]),
  },
  {
    name: 'transform-translate-copyGeom-false',
    category: 'transform',
    notes: 'Location-only path for direct isometric transforms when copyGeom=false.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), transform: makeTranslation(oc, 12, 0, 0) }),
    run: (oc, context) => {
      const source = context['source'];
      const transform = context['transform'];
      const outputs = Array.from({ length: 30 }, (_, index) =>
        transformShape(oc, source, transform, false, false, index % 2 === 0),
      );
      deleteAll(outputs);
    },
    teardown: (_oc, context) => deleteAll([context['transform'], context['source']]),
  },
  {
    name: 'transform-rotate-copyGeom-true',
    category: 'transform',
    notes: 'Rotational transform with forced geometry copy.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), transform: makeRotation(oc, Math.PI / 6) }),
    run: (oc, context) => {
      const outputs = Array.from({ length: 30 }, () =>
        transformShape(oc, context['source'], context['transform'], true),
      );
      deleteAll(outputs);
    },
    teardown: (_oc, context) => deleteAll([context['transform'], context['source']]),
  },
  {
    name: 'transform-rotate-copyGeom-false',
    category: 'transform',
    notes: 'Rotational transform allowing OCCT to use location-only semantics when valid.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), transform: makeRotation(oc, Math.PI / 6) }),
    run: (oc, context) => {
      const outputs = Array.from({ length: 30 }, () =>
        transformShape(oc, context['source'], context['transform'], false),
      );
      deleteAll(outputs);
    },
    teardown: (_oc, context) => deleteAll([context['transform'], context['source']]),
  },
  {
    name: 'transform-y-up-export-copyGeom-true',
    category: 'transform',
    notes: 'Mirrors the STL export coordinate-system transform currently done with copyGeom=true.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), transform: makeYupExportRotation(oc) }),
    run: (oc, context) => {
      const outputs = Array.from({ length: 20 }, () =>
        transformShape(oc, context['source'], context['transform'], true),
      );
      deleteAll(outputs);
    },
    teardown: (_oc, context) => deleteAll([context['transform'], context['source']]),
  },
  {
    name: 'transform-y-up-export-copyGeom-false',
    category: 'transform',
    notes: 'Same coordinate-system transform with copyGeom=false.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), transform: makeYupExportRotation(oc) }),
    run: (oc, context) => {
      const outputs = Array.from({ length: 20 }, () =>
        transformShape(oc, context['source'], context['transform'], false),
      );
      deleteAll(outputs);
    },
    teardown: (_oc, context) => deleteAll([context['transform'], context['source']]),
  },
  {
    name: 'fillet-box-all-edges-explicit-build',
    category: 'fillet-chamfer',
    notes: 'Stable BRepFilletAPI_MakeFillet baseline on all box edges with explicit Build.',
    setup: (oc) => ({ source: makeBoxAt(oc, -20, -20, -20, 40, 40, 40) }),
    run: (oc, context) => {
      const out = filletAllEdges(oc, context['source'], 2, true);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'fillet-box-all-edges-lazy-shape',
    category: 'fillet-chamfer',
    notes: 'Stable fillet baseline matching Replicad lazy Shape() style.',
    setup: (oc) => ({ source: makeBoxAt(oc, -20, -20, -20, 40, 40, 40) }),
    run: (oc, context) => {
      const out = filletAllEdges(oc, context['source'], 2, false);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'chamfer-box-all-edges-explicit-build',
    category: 'fillet-chamfer',
    notes: 'Stable BRepFilletAPI_MakeChamfer baseline on all box edges with explicit Build.',
    setup: (oc) => ({ source: makeBoxAt(oc, -20, -20, -20, 40, 40, 40) }),
    run: (oc, context) => {
      const out = chamferAllEdges(oc, context['source'], 2, true);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'chamfer-box-all-edges-lazy-shape',
    category: 'fillet-chamfer',
    notes: 'Stable chamfer baseline matching Replicad lazy Shape() style.',
    setup: (oc) => ({ source: makeBoxAt(oc, -20, -20, -20, 40, 40, 40) }),
    run: (oc, context) => {
      const out = chamferAllEdges(oc, context['source'], 2, false);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'fillet-v8-all-edges-explicit-build',
    category: 'fillet-chamfer',
    notes:
      'Stress case: indiscriminate all-edge V8 fillet currently throws, proving status/fault instrumentation is needed.',
    expectedFailure: true,
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      const out = filletAllEdges(oc, context['source'], 1.2, true);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'fillet-v8-all-edges-lazy-shape',
    category: 'fillet-chamfer',
    notes: 'Stress case: same V8 all-edge fillet through lazy Shape().',
    expectedFailure: true,
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      const out = filletAllEdges(oc, context['source'], 1.2, false);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'chamfer-v8-all-edges-explicit-build',
    category: 'fillet-chamfer',
    notes: 'Stress case: indiscriminate all-edge V8 chamfer currently throws.',
    expectedFailure: true,
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      const out = chamferAllEdges(oc, context['source'], 1, true);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'shell-open-box-thick-solid-join',
    category: 'shell-offset',
    notes: 'BRepOffsetAPI_MakeThickSolid.MakeThickSolidByJoin on an open box.',
    setup: (oc) => ({ source: makeBoxAt(oc, -30, -30, -30, 60, 60, 60) }),
    run: (oc, context) => {
      const out = shellOpenBox(oc, context['source'], -2);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'solid-offset-box-join',
    category: 'shell-offset',
    notes: 'Stable BRepOffsetAPI_MakeOffsetShape.PerformByJoin baseline on a convex box.',
    setup: (oc) => ({ source: makeBoxAt(oc, -20, -20, -20, 40, 40, 40) }),
    run: (oc, context) => {
      const out = offsetSolid(oc, context['source'], 1, 'GeomAbs_Arc');
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'wire-offset-arc-approx-false',
    category: 'shell-offset',
    notes: 'BRepOffsetAPI_MakeOffset.Perform on a rectangular wire with arc joins.',
    setup: (oc) => ({ wire: makeRectangleWire(oc, -30, -20, 0, 60, 40) }),
    run: (oc, context) => {
      const out = offsetWire(oc, context['wire'], 3, 'GeomAbs_Arc', false);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['wire']]),
  },
  {
    name: 'wire-offset-intersection-approx-true',
    category: 'shell-offset',
    notes: 'BRepOffsetAPI_MakeOffset.Perform with intersection joins and approximation.',
    setup: (oc) => ({ wire: makeRectangleWire(oc, -30, -20, 0, 60, 40) }),
    run: (oc, context) => {
      const out = offsetWire(oc, context['wire'], 3, 'GeomAbs_Intersection', true);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['wire']]),
  },
  {
    name: 'solid-offset-v8-join',
    category: 'shell-offset',
    notes:
      'Stress case: whole-fixture V8 PerformByJoin currently throws, matching OCCT offset limitations on complex solids.',
    expectedFailure: true,
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      const out = offsetSolid(oc, context['source'], 0.75, 'GeomAbs_Arc');
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'pipe-shell-sweep-curved-spine',
    category: 'sweep-loft',
    notes: 'BRepOffsetAPI_MakePipeShell.Build + MakeSolid on a curved two-segment spine.',
    run: (oc) => {
      const out = pipeSweep(oc);
      out.delete();
    },
  },
  {
    name: 'loft-thru-sections-compatibility-off',
    category: 'sweep-loft',
    notes: 'BRepOffsetAPI_ThruSections over eight circular profiles with CheckCompatibility(false).',
    run: (oc) => {
      const out = loftThruSections(oc, 8, false);
      out.delete();
    },
  },
  {
    name: 'loft-thru-sections-compatibility-on',
    category: 'sweep-loft',
    notes: 'Same loft with compatibility checking enabled.',
    run: (oc) => {
      const out = loftThruSections(oc, 8, true);
      out.delete();
    },
  },
  {
    name: 'draft-box-two-faces',
    category: 'draft',
    notes: 'BRepOffsetAPI_DraftAngle.Add + Build on two box faces.',
    setup: (oc) => ({ source: makeBoxAt(oc, -30, -30, 0, 60, 60, 50) }),
    run: (oc, context) => {
      const out = draftSideFaces(oc, context['source']);
      out.delete();
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'hole-workflow-boolean-cut-all',
    category: 'feature-hole',
    notes: 'Plate with 12 cylindrical holes through one list-based BRepAlgoAPI_Cut.',
    run: (oc) => {
      const out = booleanHolePlate(oc, 3, 4);
      out.delete();
    },
  },
  {
    name: 'hole-workflow-sketch-inner-wires-prism',
    category: 'feature-hole',
    notes: 'Same plate topology via face inner wires + prism, avoiding cylinder booleans.',
    run: (oc) => {
      const out = sketchHolePlate(oc, 3, 4);
      out.delete();
    },
  },
  {
    name: 'hole-workflow-brepfeat-dprism-thru-all',
    category: 'feature-hole',
    notes: 'BRepFeat_MakeDPrism thru-all pocket workflow used by Replicad punchHole.',
    run: (oc) => {
      const out = featurePocketDraftPrism(oc);
      out.delete();
    },
  },
  {
    name: 'projection-hlr-v8-visible-hidden',
    category: 'projection-hlr',
    notes: 'HLRBRep_Algo.Update + Hide + HLRBRep_HLRToShape visible/hidden compounds.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      const edgeCount = hlrProjection(oc, context['source']);
      if (edgeCount < 1) {
        throw new Error('HLR returned no edges');
      }
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'distance-extrema-reuse-single-thread',
    category: 'distance-extrema',
    notes: 'Replicad-style reusable BRepExtrema_DistShapeShape with SetMultiThread(false).',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), targets: makeDistanceTargets(oc) }),
    run: (oc, context) => {
      const total = distanceExtremaReuse(oc, context['source'], context['targets'] as any[], false);
      if (!Number.isFinite(total)) {
        throw new TypeError('distance total was not finite');
      }
    },
    teardown: (_oc, context) => deleteAll([...(context['targets'] as any[]), context['source']]),
  },
  {
    name: 'distance-extrema-reuse-multi-thread',
    category: 'distance-extrema',
    notes: 'Reusable BRepExtrema_DistShapeShape with SetMultiThread(true).',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), targets: makeDistanceTargets(oc) }),
    run: (oc, context) => {
      const total = distanceExtremaReuse(oc, context['source'], context['targets'] as any[], true);
      if (!Number.isFinite(total)) {
        throw new TypeError('distance total was not finite');
      }
    },
    teardown: (_oc, context) => deleteAll([...(context['targets'] as any[]), context['source']]),
  },
  {
    name: 'distance-extrema-constructor-per-call',
    category: 'distance-extrema',
    notes: 'Constructor-per-query distance computation for comparison against Replicad reusable tool.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc), targets: makeDistanceTargets(oc) }),
    run: (oc, context) => {
      const total = distanceExtremaConstructor(oc, context['source'], context['targets'] as any[]);
      if (!Number.isFinite(total)) {
        throw new TypeError('distance total was not finite');
      }
    },
    teardown: (_oc, context) => deleteAll([...(context['targets'] as any[]), context['source']]),
  },
  {
    name: 'text-like-outline-wires-to-fused-prisms',
    category: 'text',
    notes: 'Proxy for Replicad text: many JS-derived outline wires converted to faces/prisms and fused.',
    run: (oc) => {
      const out = textLikeOutlinePrism(oc, 32);
      out.delete();
    },
  },
  {
    name: 'export-brep-write-read-v8',
    category: 'import-export',
    notes: 'BRepTools.Write + Read round-trip through MEMFS.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      if (brepRoundTrip(oc, context['source']) < 1) {
        throw new Error('empty BREP export');
      }
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'export-step-writer-v8',
    category: 'import-export',
    notes: 'STEPControl_Writer.Transfer + Write through MEMFS.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      if (stepExport(oc, context['source']) < 1) {
        throw new Error('empty STEP export');
      }
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'export-stl-writer-v8',
    category: 'import-export',
    notes: 'BRepMesh_IncrementalMesh + StlAPI_Writer.Write through MEMFS.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: (oc, context) => {
      if (stlExport(oc, context['source']) < 1) {
        throw new Error('empty STL export');
      }
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'export-glb-opencascade-kernel-helper-v8',
    category: 'import-export',
    notes: 'OpenCascade kernel GLB path: meshShapesToGltf, XCAF, RWGltf_CafWriter, glTF post-normalization.',
    setup: (oc) => ({ source: makeV8FixtureWithExternalFeatures(oc) }),
    run: async (oc, context) => {
      if ((await glbExportViaOpenCascadeKernel(oc, context['source'])) < 1) {
        throw new Error('empty GLB export');
      }
    },
    teardown: (_oc, context) => deleteAll([context['source']]),
  },
  {
    name: 'opencascade-kernel-v8-export-glb',
    category: 'kernel-runtime',
    notes: 'Actual Tau OpenCascade kernel path: bundle in-memory source, run opencascade.kernel.ts, create GLB export.',
    reuseSetup: true,
    setup: async (_oc, options) => createOpenCascadeKernelContext(options.variant),
    run: async (_oc, context) => {
      if ((await opencascadeKernelExportGlb(context)) < 1) {
        throw new Error('empty OpenCascade kernel GLB export');
      }
    },
    teardown: async (_oc, context) => {
      (context['client'] as { terminate?: () => void }).terminate?.();
    },
  },
];

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) {
    return 0;
  }
  const position = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) {
    return sorted[lower]!;
  }
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
};

const summarize = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    meanMs: sum / sorted.length,
    medianMs: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    minMs: sorted[0]!,
    maxMs: sorted.at(-1)!,
  };
};

const numericOption = (value: string | boolean | undefined, fallback: number): number => {
  if (typeof value !== 'string') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const stringOption = (value: string | boolean | undefined, fallback: string): string => {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
};

const initOpenCascade = async (variant: string): Promise<Oc> => {
  const moduleName = variant === 'multi' ? 'libcascade/multi' : 'libcascade';
  const module = await import(moduleName);
  const oc = await module.default({
    print() {
      // Keep benchmark output deterministic.
    },
    printErr(message: string) {
      console.error(message);
    },
  });

  if (variant === 'multi') {
    const threads = activateOccParallelism(oc, {
      log: (message) => console.log(message),
      warn: (message) => console.warn(message),
      error: (message) => console.error(message),
      debug: () => undefined,
      trace: () => undefined,
      custom: (_level, message) => console.log(message),
    });
    if (threads) {
      console.log(`OCCT multi-thread benchmark using ${threads} threads`);
    }
  }

  return oc;
};

const runCase = async (
  oc: Oc,
  benchCase: BenchCase,
  iterations: number,
  warmup: number,
  options: BenchOptions,
): Promise<BenchResult> => {
  const timingsMs: number[] = [];
  let sharedContext: BenchContext | undefined;

  try {
    if (benchCase.reuseSetup) {
      sharedContext = benchCase.setup ? await benchCase.setup(oc, options) : {};
    }

    for (let runIndex = 0; runIndex < warmup + iterations; runIndex++) {
      let context: BenchContext = sharedContext ?? {};
      try {
        if (!benchCase.reuseSetup) {
          context = benchCase.setup ? await benchCase.setup(oc, options) : {};
        }
        const start = performance.now();
        await benchCase.run(oc, context, options);
        const elapsed = performance.now() - start;
        if (runIndex >= warmup) {
          timingsMs.push(elapsed);
        }
      } finally {
        if (!benchCase.reuseSetup) {
          await benchCase.teardown?.(oc, context, options);
        }
      }
    }
  } finally {
    if (benchCase.reuseSetup && sharedContext) {
      await benchCase.teardown?.(oc, sharedContext, options);
    }
  }

  return {
    name: benchCase.name,
    category: benchCase.category,
    notes: benchCase.notes,
    iterations,
    warmup,
    ok: true,
    expectedFailure: benchCase.expectedFailure,
    timingsMs,
    ...summarize(timingsMs),
  };
};

const tableRows = (results: BenchResult[]) =>
  results.map((result) => ({
    category: result.category,
    name: result.name,
    meanMs: result.meanMs?.toFixed(2) ?? 'FAILED',
    medianMs: result.medianMs?.toFixed(2) ?? 'FAILED',
    p95Ms: result.p95Ms?.toFixed(2) ?? 'FAILED',
    minMs: result.minMs?.toFixed(2) ?? 'FAILED',
    maxMs: result.maxMs?.toFixed(2) ?? 'FAILED',
    ok: result.ok,
    expectedFailure: result.expectedFailure ?? false,
    error: result.error ?? '',
  }));

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    allowPositionals: false,
    options: {
      filter: { type: 'string' },
      iterations: { type: 'string', short: 'i' },
      warmup: { type: 'string', short: 'w' },
      variant: { type: 'string', short: 'v' },
      output: { type: 'string', short: 'o' },
      continueOnError: { type: 'boolean', default: false },
    },
  });

  const iterations = numericOption(values.iterations, 5);
  const warmup = numericOption(values.warmup, 2);
  const variant = stringOption(values.variant, 'multi');
  const outputDirectory = stringOption(values.output, 'reports/opencascade-brep-surfaces');
  const benchOptions = { variant };
  const filters = stringOption(values.filter, '')
    .split(',')
    .map((filter) => filter.trim())
    .filter(Boolean);
  const selectedCases =
    filters.length === 0
      ? cases
      : cases.filter((benchCase) =>
          filters.some((filter) => benchCase.name.includes(filter) || benchCase.category.includes(filter)),
        );

  if (selectedCases.length === 0) {
    throw new Error(`No benchmark cases matched filter: ${filters.join(', ')}`);
  }

  console.log(
    `OpenCascade BRep benchmark: variant=${variant}, cases=${selectedCases.length}, warmup=${warmup}, iterations=${iterations}`,
  );
  const oc = await initOpenCascade(variant);
  const startedAt = new Date().toISOString();
  const results: BenchResult[] = [];
  const runStart = performance.now();

  for (const [index, benchCase] of selectedCases.entries()) {
    process.stdout.write(`[${index + 1}/${selectedCases.length}] ${benchCase.name} ... `);
    try {
      const result = await runCase(oc, benchCase, iterations, warmup, benchOptions);
      results.push(result);
      console.log(`${result.meanMs?.toFixed(2)} ms mean`);
    } catch (error) {
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      results.push({
        name: benchCase.name,
        category: benchCase.category,
        notes: benchCase.notes,
        iterations,
        warmup,
        ok: false,
        expectedFailure: benchCase.expectedFailure,
        error: message,
        timingsMs: [],
      });
      console.log('FAILED');
      if (!values.continueOnError && !benchCase.expectedFailure) {
        throw error;
      }
    }
  }

  const totalDurationMs = performance.now() - runStart;
  mkdirSync(outputDirectory, { recursive: true });
  const outputPath = join(outputDirectory, `opencascade-brep-surfaces-${variant}-${Date.now()}.json`);
  writeFileSync(
    outputPath,
    `${JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        variant,
        warmup,
        iterations,
        totalDurationMs,
        results,
      },
      null,
      2,
    )}\n`,
  );

  console.table(tableRows(results));
  console.log(`Wrote ${outputPath}`);

  const failures = results.filter((result) => !result.ok && !result.expectedFailure);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
};

await main();
