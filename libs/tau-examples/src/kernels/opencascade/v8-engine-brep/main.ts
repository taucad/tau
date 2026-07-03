import {
  BOPAlgo_Options,
  BRepAlgoAPI_Common,
  BRepAlgoAPI_Cut,
  BRepAlgoAPI_Fuse,
  BRepBuilderAPI_MakeEdge,
  BRepBuilderAPI_MakeFace,
  BRepBuilderAPI_MakeWire,
  BRepBuilderAPI_Transform,
  BRepMesh_IncrementalMesh,
  BRepPrimAPI_MakeBox,
  BRepPrimAPI_MakeCylinder,
  BRepPrimAPI_MakePrism,
  BRepPrimAPI_MakeSphere,
  Message_ProgressRange,
  NCollection_List_TopoDS_Shape,
  OSD_ThreadPool,
  gp_Ax1,
  gp_Ax2,
  gp_Dir,
  gp_Pnt,
  gp_Trsf,
  gp_Vec,
  type BRepAlgoAPI_BooleanOperation,
  type TopoDS_Edge,
  type TopoDS_Face,
  type TopoDS_Shape,
  type TopoDS_Wire,
} from 'opencascade.js';

export const defaultParams = {
  bore: 94,
  stroke: 90,
  deckHeight: 232,
  mainJournalDia: 60,
  mainJournalLen: 28,
  crankpinDia: 52,
  crankpinLen: 30,
  crankThrow: 45,
  webThickness: 22,
  webHubMainDia: 68,
  webHubPinDia: 60,
  counterweightDia: 150,
  counterweightOffset: 30,
  snoutDia: 38,
  snoutLen: 60,
  flangeDia: 120,
  flangeThk: 16,
  flangeBolts: 8,
  flangeBoltDia: 11,
  flangeBoltCircle: 90,
  oilGalleryDia: 6,
  crownDia: 93.6,
  pistonCompHeight: 32,
  pistonSkirtLen: 30,
  domeRise: 4,
  ringGrooveDepth: 1.2,
  ringGrooveWidth: 2,
  pinBoreDia: 22,
  wristPinOuterDia: 22,
  wristPinInnerDia: 12,
  wristPinLen: 64,
  rodBigEndDia: 56,
  rodBigEndBoreDia: 52,
  rodSmallEndDia: 30,
  rodSmallEndBoreDia: 22,
  rodLength: 155,
  rodBeamWidth: 18,
  rodBeamThk: 10,
  headThk: 110,
  valveCoverHeight: 55,
  plenumDia: 90,
  runnerDia: 34,
  throttleDia: 70,
  damperOuterDia: 170,
  damperThk: 34,
  damperGrooves: 6,
  flywheelOuterDia: 320,
  flywheelThk: 28,
  flywheelClutchDia: 240,
  ringGearTeeth: 120,
  plugThreadDia: 14,
  plugReach: 19,
  plugHexAcross: 16,
};

type Params = typeof defaultParams;
type Vec3 = readonly [number, number, number];
type Disposable = { delete(): void } | null | undefined;
type BooleanAlgorithmConstructor = new () => BRepAlgoAPI_BooleanOperation;
type EnginePart = {
  shape: TopoDS_Shape;
  name: string;
  color: string;
  opacity?: number;
};
type CrankStations = {
  snoutStart: number;
  mainStart: number[];
  pinStart: number[];
  pinCenter: number[];
  webStart: number[];
  flangeStart: number;
  totalLen: number;
  mainCenter: number[];
};

const PIN_PHASE: readonly number[] = [0, 90, 270, 180];
const BANKS = [
  { side: 'L', deckAngle: 135, xShift: 0 },
  { side: 'R', deckAngle: 45, xShift: 15 },
] as const;

const cosd = (deg: number): number => Math.cos((deg * Math.PI) / 180);
const sind = (deg: number): number => Math.sin((deg * Math.PI) / 180);
const rad = (deg: number): number => (deg * Math.PI) / 180;

const arrayValue = <T>(
  values: readonly T[],
  index: number,
  label: string,
): T => {
  const value = values[index];
  if (value === undefined) {
    throw new Error(`${label}[${index}] is missing`);
  }
  return value;
};

const phaseAt = (index: number): number =>
  arrayValue(PIN_PHASE, index % PIN_PHASE.length, 'PIN_PHASE');

const assertShape = <T extends TopoDS_Shape>(shape: T, label: string): T => {
  if (shape.IsNull()) {
    throw new Error(`${label} produced a null shape`);
  }
  return shape;
};

const del = (value: Disposable): void => {
  try {
    value?.delete();
  } catch {
    // Best-effort cleanup only.
  }
};

const delAll = (values: readonly Disposable[]): void => {
  for (let i = values.length - 1; i >= 0; i--) {
    del(values[i]);
  }
};

const activateParallelDefaults = (): void => {
  BOPAlgo_Options.SetParallelMode(true);
  BRepMesh_IncrementalMesh.SetParallelDefault(true);
  const pool = OSD_ThreadPool.DefaultPool(-1);
  pool.SetNbDefaultThreadsToLaunch(pool.NbThreads());
};

const pnt = (x: number, y: number, z: number): gp_Pnt => new gp_Pnt(x, y, z);

const box = (min: Vec3, max: Vec3): TopoDS_Shape => {
  const x0 = Math.min(min[0], max[0]);
  const y0 = Math.min(min[1], max[1]);
  const z0 = Math.min(min[2], max[2]);
  const x1 = Math.max(min[0], max[0]);
  const y1 = Math.max(min[1], max[1]);
  const z1 = Math.max(min[2], max[2]);
  const origin = pnt(x0, y0, z0);
  const maker = new BRepPrimAPI_MakeBox(origin, x1 - x0, y1 - y0, z1 - z0);
  const shape = assertShape(maker.Shape(), 'box');
  del(maker);
  del(origin);
  return shape;
};

const cylinder = (
  radius: number,
  height: number,
  start: Vec3,
  direction: Vec3,
): TopoDS_Shape => {
  const origin = pnt(start[0], start[1], start[2]);
  const dir = new gp_Dir(direction[0], direction[1], direction[2]);
  const axis = new gp_Ax2(origin, dir);
  const maker = new BRepPrimAPI_MakeCylinder(axis, radius, height);
  const shape = assertShape(maker.Shape(), 'cylinder');
  del(maker);
  del(axis);
  del(dir);
  del(origin);
  return shape;
};

const sphere = (radius: number, center: Vec3): TopoDS_Shape => {
  const centerPoint = pnt(center[0], center[1], center[2]);
  const maker = new BRepPrimAPI_MakeSphere(centerPoint, radius);
  const shape = assertShape(maker.Shape(), 'sphere');
  del(maker);
  del(centerPoint);
  return shape;
};

const shapeList = (
  shapes: readonly TopoDS_Shape[],
): NCollection_List_TopoDS_Shape => {
  const list = new NCollection_List_TopoDS_Shape();
  for (const shape of shapes) {
    list.Append(shape);
  }
  return list;
};

const configureBoolean = (algo: BRepAlgoAPI_BooleanOperation): void => {
  algo.SetRunParallel(true);
  algo.SetToFillHistory(false);
  algo.SetNonDestructive(false);
  algo.SetCheckInverted(false);
};

const booleanOp = (
  Algorithm: BooleanAlgorithmConstructor,
  label: string,
  args: readonly [TopoDS_Shape, ...TopoDS_Shape[]],
  tools: readonly TopoDS_Shape[],
): TopoDS_Shape => {
  if (tools.length === 0) {
    return args[0];
  }
  const argList = shapeList(args);
  const toolList = shapeList(tools);
  const algo = new Algorithm();
  const progress = new Message_ProgressRange();
  algo.SetArguments(argList);
  algo.SetTools(toolList);
  configureBoolean(algo);
  algo.Build(progress);
  if (algo.HasErrors()) {
    throw new Error(`${label} failed`);
  }
  const result = assertShape(algo.Shape(), label);
  del(progress);
  del(algo);
  del(toolList);
  del(argList);
  return result;
};

const fuseAll = (shapes: TopoDS_Shape[]): TopoDS_Shape => {
  const first = shapes[0];
  if (!first) {
    throw new Error('fuse requires at least one shape');
  }
  if (shapes.length === 1) {
    return first;
  }
  const result = booleanOp(BRepAlgoAPI_Fuse, 'fuse', [first], shapes.slice(1));
  delAll(shapes);
  return result;
};

const cutAll = (base: TopoDS_Shape, tools: TopoDS_Shape[]): TopoDS_Shape => {
  const result = booleanOp(BRepAlgoAPI_Cut, 'cut', [base], tools);
  del(base);
  delAll(tools);
  return result;
};

const common = (a: TopoDS_Shape, b: TopoDS_Shape): TopoDS_Shape => {
  const result = booleanOp(BRepAlgoAPI_Common, 'common', [a], [b]);
  del(a);
  del(b);
  return result;
};

const transform = (shape: TopoDS_Shape, trsf: gp_Trsf): TopoDS_Shape => {
  const builder = new BRepBuilderAPI_Transform(shape, trsf, false, false);
  const result = assertShape(builder.Shape(), 'transform');
  del(builder);
  return result;
};

const translate = (shape: TopoDS_Shape, delta: Vec3): TopoDS_Shape => {
  const trsf = new gp_Trsf();
  const vec = new gp_Vec(delta[0], delta[1], delta[2]);
  trsf.SetTranslation(vec);
  const result = transform(shape, trsf);
  del(vec);
  del(trsf);
  return result;
};

const rotate = (
  shape: TopoDS_Shape,
  angleDeg: number,
  origin: Vec3,
  axisDirection: Vec3,
): TopoDS_Shape => {
  const trsf = new gp_Trsf();
  const originPoint = pnt(origin[0], origin[1], origin[2]);
  const dir = new gp_Dir(axisDirection[0], axisDirection[1], axisDirection[2]);
  const axis = new gp_Ax1(originPoint, dir);
  trsf.SetRotation(axis, rad(angleDeg));
  const result = transform(shape, trsf);
  del(axis);
  del(dir);
  del(originPoint);
  del(trsf);
  return result;
};

const ringX = (
  outerRadius: number,
  innerRadius: number,
  length: number,
  start: Vec3,
): TopoDS_Shape => {
  return cutAll(cylinder(outerRadius, length, start, [1, 0, 0]), [
    cylinder(
      innerRadius,
      length + 2,
      [start[0] - 1, start[1], start[2]],
      [1, 0, 0],
    ),
  ]);
};

const edge = (a: Vec3, b: Vec3): TopoDS_Edge => {
  const p1 = pnt(a[0], a[1], a[2]);
  const p2 = pnt(b[0], b[1], b[2]);
  const maker = new BRepBuilderAPI_MakeEdge(p1, p2);
  const result = assertShape(maker.Edge(), 'edge');
  del(maker);
  del(p2);
  del(p1);
  return result;
};

const prism = (source: TopoDS_Shape, vector: Vec3): TopoDS_Shape => {
  const vec = new gp_Vec(vector[0], vector[1], vector[2]);
  const maker = new BRepPrimAPI_MakePrism(source, vec, true, true);
  const result = assertShape(maker.Shape(), 'prism');
  del(maker);
  del(vec);
  return result;
};

const regularPrismZ = (
  radius: number,
  sides: number,
  z: number,
  height: number,
): TopoDS_Shape => {
  const wireMaker = new BRepBuilderAPI_MakeWire();
  const edges: TopoDS_Edge[] = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (2 * Math.PI * i) / sides + Math.PI / sides;
    const a1 = (2 * Math.PI * ((i + 1) % sides)) / sides + Math.PI / sides;
    const e = edge(
      [radius * Math.cos(a0), radius * Math.sin(a0), z],
      [radius * Math.cos(a1), radius * Math.sin(a1), z],
    );
    edges.push(e);
    wireMaker.Add(e);
  }
  const wire = assertShape(wireMaker.Wire(), 'wire');
  const faceMaker = new BRepBuilderAPI_MakeFace(wire, true);
  const face = assertShape(faceMaker.Face(), 'face');
  const result = prism(face, [0, 0, height]);
  del(faceMaker);
  del(face);
  del(wire);
  del(wireMaker);
  delAll(edges);
  return result;
};

const stations = (p: Params): CrankStations => {
  let x = 0;
  const snoutStart = x;
  x += p.snoutLen;
  const mainStart: number[] = [];
  const pinStart: number[] = [];
  const pinCenter: number[] = [];
  const webStart: number[] = [];
  for (let i = 0; i < 5; i++) {
    mainStart.push(x);
    x += p.mainJournalLen;
    if (i < 4) {
      webStart.push(x);
      x += p.webThickness;
      pinStart.push(x);
      pinCenter.push(x + p.crankpinLen / 2);
      x += p.crankpinLen;
      webStart.push(x);
      x += p.webThickness;
    }
  }
  const flangeStart = x;
  x += p.flangeThk;
  return {
    snoutStart,
    mainStart,
    pinStart,
    pinCenter,
    webStart,
    flangeStart,
    totalLen: x,
    mainCenter: mainStart.map((s) => s + p.mainJournalLen / 2),
  };
};

const web = (p: Params, xStart: number, phaseDeg: number): TopoDS_Shape => {
  const y = cosd(phaseDeg);
  const z = sind(phaseDeg);
  const pinY = p.crankThrow * y;
  const pinZ = p.crankThrow * z;
  const cwY = -p.counterweightOffset * y;
  const cwZ = -p.counterweightOffset * z;
  const beamLen = p.crankThrow + p.webHubPinDia / 2;
  const beamW = p.webHubPinDia * 0.55;
  const beam = rotate(
    box(
      [xStart, -beamW / 2, -beamW / 2],
      [xStart + p.webThickness, beamLen, beamW / 2],
    ),
    phaseDeg,
    [0, 0, 0],
    [1, 0, 0],
  );
  return fuseAll([
    cylinder(p.webHubMainDia / 2, p.webThickness, [xStart, 0, 0], [1, 0, 0]),
    cylinder(
      p.webHubPinDia / 2,
      p.webThickness,
      [xStart, pinY, pinZ],
      [1, 0, 0],
    ),
    cylinder(
      p.counterweightDia / 2,
      p.webThickness,
      [xStart, cwY, cwZ],
      [1, 0, 0],
    ),
    beam,
  ]);
};

const crankshaft = (p: Params): TopoDS_Shape => {
  const st = stations(p);
  const solids: TopoDS_Shape[] = [
    cylinder(p.snoutDia / 2, p.snoutLen, [st.snoutStart, 0, 0], [1, 0, 0]),
  ];
  for (let i = 0; i < 5; i++) {
    solids.push(
      cylinder(
        p.mainJournalDia / 2,
        p.mainJournalLen,
        [arrayValue(st.mainStart, i, 'mainStart'), 0, 0],
        [1, 0, 0],
      ),
    );
  }
  for (let i = 0; i < 4; i++) {
    const phase = phaseAt(i);
    solids.push(web(p, arrayValue(st.webStart, 2 * i, 'webStart'), phase));
    solids.push(
      cylinder(
        p.crankpinDia / 2,
        p.crankpinLen,
        [
          arrayValue(st.pinStart, i, 'pinStart'),
          p.crankThrow * cosd(phase),
          p.crankThrow * sind(phase),
        ],
        [1, 0, 0],
      ),
    );
    solids.push(web(p, arrayValue(st.webStart, 2 * i + 1, 'webStart'), phase));
  }
  solids.push(
    cylinder(p.flangeDia / 2, p.flangeThk, [st.flangeStart, 0, 0], [1, 0, 0]),
  );
  let shape = fuseAll(solids);

  const cuts: TopoDS_Shape[] = [];
  for (let i = 0; i < 4; i++) {
    const phase = phaseAt(i);
    const pin: Vec3 = [
      arrayValue(st.pinCenter, i, 'pinCenter'),
      p.crankThrow * cosd(phase),
      p.crankThrow * sind(phase),
    ];
    const main: Vec3 = [arrayValue(st.mainCenter, i + 1, 'mainCenter'), 0, 0];
    const dx = main[0] - pin[0];
    const dy = main[1] - pin[1];
    const dz = main[2] - pin[2];
    const len = Math.hypot(dx, dy, dz);
    cuts.push(
      cylinder(p.oilGalleryDia / 2, len, pin, [dx / len, dy / len, dz / len]),
    );
  }
  cuts.push(
    cylinder(11, p.flangeThk + 4, [st.flangeStart - 2, 0, 0], [1, 0, 0]),
  );
  for (let b = 0; b < p.flangeBolts; b++) {
    const a = (360 / p.flangeBolts) * b;
    cuts.push(
      cylinder(
        p.flangeBoltDia / 2,
        p.flangeThk + 4,
        [
          st.flangeStart - 2,
          (p.flangeBoltCircle / 2) * cosd(a),
          (p.flangeBoltCircle / 2) * sind(a),
        ],
        [1, 0, 0],
      ),
    );
  }
  shape = cutAll(shape, cuts);
  return shape;
};

const engineBlock = (p: Params): TopoDS_Shape => {
  const st = stations(p);
  const xFront = -10;
  const xRear = st.totalLen + 10;
  const blockLen = xRear - xFront;
  const caseW = 200;
  const caseTop = 30;
  const caseBot = -110;
  const solids: TopoDS_Shape[] = [
    box([xFront, -caseW / 2, caseBot], [xRear, caseW / 2, caseTop]),
  ];

  for (const bank of BANKS) {
    const ny = cosd(bank.deckAngle);
    const nz = sind(bank.deckAngle);
    let slab = box(
      [-blockLen / 2, -75, -p.deckHeight / 2],
      [blockLen / 2, 75, p.deckHeight / 2],
    );
    slab = rotate(slab, bank.deckAngle - 90, [0, 0, 0], [1, 0, 0]);
    slab = translate(slab, [
      (xFront + xRear) / 2,
      (ny * p.deckHeight) / 2,
      (nz * p.deckHeight) / 2 + 10,
    ]);
    solids.push(slab);
  }

  let block = fuseAll(solids);
  const cuts: TopoDS_Shape[] = [];
  for (const bank of BANKS) {
    const ny = cosd(bank.deckAngle);
    const nz = sind(bank.deckAngle);
    for (let i = 0; i < 4; i++) {
      cuts.push(
        cylinder(
          p.bore / 2,
          p.deckHeight + 30,
          [
            arrayValue(st.pinCenter, i, 'pinCenter') + bank.xShift - 7,
            ny * 15,
            nz * 15 + 10,
          ],
          [0, ny, nz],
        ),
      );
    }
  }
  cuts.push(
    cylinder(
      p.mainJournalDia / 2 + 1,
      blockLen + 20,
      [xFront - 10, 0, 0],
      [1, 0, 0],
    ),
  );
  cuts.push(
    common(
      cylinder(
        p.counterweightDia / 2 + 4,
        blockLen + 20,
        [xFront - 10, 0, 0],
        [1, 0, 0],
      ),
      box([xFront - 12, -caseW, caseBot - 5], [xRear + 12, caseW, 0]),
    ),
  );
  cuts.push(box([xFront + 6, -70, caseBot - 1], [xRear - 6, 70, caseBot + 25]));
  block = cutAll(block, cuts);
  return block;
};

const piston = (p: Params): TopoDS_Shape => {
  const r = p.crownDia / 2;
  const top = p.pistonCompHeight;
  const bottom = -p.pistonSkirtLen;
  let shape = cylinder(r, top - bottom, [0, 0, bottom], [0, 0, 1]);
  const sphR = (r * r + p.domeRise * p.domeRise) / (2 * p.domeRise);
  const cap = common(
    sphere(sphR, [0, 0, top + p.domeRise - sphR]),
    cylinder(r, p.domeRise + 1, [0, 0, top - 0.5], [0, 0, 1]),
  );
  shape = fuseAll([shape, cap]);

  const cuts: TopoDS_Shape[] = [];
  for (let g = 0; g < 3; g++) {
    const z = top - 4 - g * (p.ringGrooveWidth + 3);
    cuts.push(
      cutAll(cylinder(r + 0.5, p.ringGrooveWidth, [0, 0, z], [0, 0, 1]), [
        cylinder(
          r - p.ringGrooveDepth,
          p.ringGrooveWidth + 2,
          [0, 0, z - 1],
          [0, 0, 1],
        ),
      ]),
    );
  }
  cuts.push(cylinder(p.pinBoreDia / 2, r * 2 + 4, [-r - 2, 0, 0], [1, 0, 0]));
  return cutAll(shape, cuts);
};

const wristPin = (p: Params): TopoDS_Shape =>
  cutAll(
    cylinder(
      p.wristPinOuterDia / 2,
      p.wristPinLen,
      [-p.wristPinLen / 2, 0, 0],
      [1, 0, 0],
    ),
    [
      cylinder(
        p.wristPinInnerDia / 2,
        p.wristPinLen + 2,
        [-p.wristPinLen / 2 - 1, 0, 0],
        [1, 0, 0],
      ),
    ],
  );

const conrod = (p: Params): TopoDS_Shape => {
  const bigR = p.rodBigEndDia / 2;
  const smallR = p.rodSmallEndDia / 2;
  const bossW = p.rodBeamThk + 18;
  const zBoss = (p.rodBeamThk - bossW) / 2;
  let shape = fuseAll([
    box(
      [-p.rodBeamWidth / 2, 0, 0],
      [p.rodBeamWidth / 2, p.rodLength, p.rodBeamThk],
    ),
    cylinder(bigR, bossW, [0, 0, zBoss], [0, 0, 1]),
    cylinder(smallR, bossW, [0, p.rodLength, zBoss], [0, 0, 1]),
  ]);
  const cuts: TopoDS_Shape[] = [
    cylinder(p.rodBigEndBoreDia / 2, bossW + 4, [0, 0, zBoss - 2], [0, 0, 1]),
    cylinder(
      p.rodSmallEndBoreDia / 2,
      bossW + 4,
      [0, p.rodLength, zBoss - 2],
      [0, 0, 1],
    ),
  ];
  for (const sx of [-1, 1]) {
    cuts.push(
      cylinder(
        2.5,
        bigR * 2 + 6,
        [sx * (bigR - 2), -bigR - 3, p.rodBeamThk / 2],
        [0, 1, 0],
      ),
    );
  }
  shape = cutAll(shape, cuts);
  return shape;
};

const cylinderHead = (p: Params): TopoDS_Shape => {
  const st = stations(p);
  const len = st.totalLen - p.snoutLen - p.flangeThk + 40;
  const width = 150;
  const thk = p.headThk;
  const x0 = arrayValue(st.mainStart, 0, 'mainStart');
  const solids: TopoDS_Shape[] = [
    box([x0 - 10, -width / 2, 0], [x0 - 10 + len, width / 2, thk]),
    box([x0 - 10, -58, thk], [x0 - 10 + len, -22, thk + 28]),
    box([x0 - 10, 22, thk], [x0 - 10 + len, 58, thk + 28]),
  ];
  const cuts: TopoDS_Shape[] = [];
  for (let i = 0; i < 4; i++) {
    const x = arrayValue(st.pinCenter, i, 'pinCenter') - 7;
    solids.push(cylinder(13, 26, [x, 0, thk], [0, 0, 1]));
    cuts.push(cylinder(p.plugThreadDia / 2, thk + 30, [x, 0, -1], [0, 0, 1]));
    cuts.push(cylinder(p.bore / 2 - 4, 8, [x, 0, -1], [0, 0, 1]));
    cuts.push(cylinder(15, 6, [x, -22, -1], [0, 0, 1]));
    cuts.push(cylinder(15, 6, [x, 22, -1], [0, 0, 1]));
  }
  cuts.push(
    box([x0 - 4, -width / 2 + 8, -0.1], [x0 - 10 + len - 6, width / 2 - 8, 10]),
  );
  return cutAll(fuseAll(solids), cuts);
};

const valveCover = (p: Params): TopoDS_Shape => {
  const st = stations(p);
  const len = st.totalLen - p.snoutLen - p.flangeThk + 30;
  const width = 110;
  const h = p.valveCoverHeight;
  const x0 = arrayValue(st.mainStart, 0, 'mainStart') - 5;
  const wall = 4;
  const solids: TopoDS_Shape[] = [
    box([x0, -width / 2, 0], [x0 + len, width / 2, h]),
    box([x0 - 6, -width / 2 - 6, 0], [x0 + len + 6, width / 2 + 6, 6]),
    cylinder(16, 18, [x0 + 30, 0, h], [0, 0, 1]),
  ];
  for (let i = 0; i < 4; i++) {
    const x = x0 + (len * (i + 0.5)) / 4;
    solids.push(
      box(
        [x - 3, -width / 2 + wall, h - wall],
        [x + 3, width / 2 - wall, h + 4],
      ),
    );
  }
  const cuts: TopoDS_Shape[] = [
    box(
      [x0 + wall, -width / 2 + wall, -1],
      [x0 + len - wall, width / 2 - wall, h - wall],
    ),
    box(
      [x0 + wall, -width / 2 + wall, -1],
      [x0 + len - wall, width / 2 - wall, 6.1],
    ),
    cylinder(11, 22, [x0 + 30, 0, h - 2], [0, 0, 1]),
  ];
  return cutAll(fuseAll(solids), cuts);
};

const tube = (a: Vec3, b: Vec3, radius: number): TopoDS_Shape => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz);
  return cylinder(radius, len, a, [dx / len, dy / len, dz / len]);
};

const intake = (p: Params): TopoDS_Shape => {
  const st = stations(p);
  const plenumR = p.plenumDia / 2;
  const x0 = arrayValue(st.mainStart, 0, 'mainStart');
  const len = st.totalLen - p.snoutLen - p.flangeThk;
  const plenumZ = p.deckHeight * sind(45) + 40;
  const solids: TopoDS_Shape[] = [
    cylinder(plenumR, len, [x0, 0, plenumZ], [1, 0, 0]),
    cylinder(p.throttleDia / 2, 40, [x0 - 40, 0, plenumZ], [1, 0, 0]),
  ];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = arrayValue(st.pinCenter, i, 'pinCenter') - 7;
      const portY = side * (p.deckHeight * cosd(45) * 0.35 + 25);
      const portZ = plenumZ - 60;
      solids.push(
        tube(
          [x, side * plenumR, plenumZ],
          [x, portY * 0.7, plenumZ - 20],
          p.runnerDia / 2,
        ),
      );
      solids.push(
        tube(
          [x, portY * 0.7, plenumZ - 20],
          [x, portY, portZ],
          p.runnerDia / 2,
        ),
      );
    }
  }
  return fuseAll(solids);
};

const oilPan = (p: Params): TopoDS_Shape => {
  const st = stations(p);
  const x0 = -6;
  const x1 = st.totalLen + 6;
  const railTop = -100;
  const railW = 184;
  const sumpX0 = st.totalLen * 0.4;
  let shape = fuseAll([
    box([x0, -railW / 2, railTop - 10], [x1, railW / 2, railTop]),
    box([sumpX0, -78, railTop - 62], [sumpX0 + 200, 78, railTop]),
  ]);
  shape = cutAll(shape, [
    box(
      [x0 + 4, -railW / 2 + 4, railTop - 58],
      [x1 - 4, railW / 2 - 4, railTop + 0.1],
    ),
  ]);
  return shape;
};

const damper = (p: Params): TopoDS_Shape => {
  const r = p.damperOuterDia / 2;
  const shape = cylinder(r, p.damperThk, [0, 0, 0], [1, 0, 0]);
  const cuts: TopoDS_Shape[] = [];
  for (let g = 0; g < p.damperGrooves; g++) {
    cuts.push(
      ringX(r + 1, r - 5, 1.6, [
        3 + g * ((p.damperThk - 6) / p.damperGrooves),
        0,
        0,
      ]),
    );
  }
  cuts.push(ringX(r - 22, p.snoutDia / 2 + 14, p.damperThk - 10, [8, 0, 0]));
  cuts.push(cylinder(p.snoutDia / 2, p.damperThk + 4, [-2, 0, 0], [1, 0, 0]));
  return cutAll(shape, cuts);
};

const flywheel = (p: Params): TopoDS_Shape => {
  const r = p.flywheelOuterDia / 2;
  const shape = fuseAll([
    cylinder(r - 8, p.flywheelThk, [0, 0, 0], [1, 0, 0]),
    ringX(r, r - 12, 12, [0, 0, 0]),
  ]);
  const cuts: TopoDS_Shape[] = [];
  for (let i = 0; i < p.ringGearTeeth; i++) {
    cuts.push(
      rotate(
        box([-1, -1.6, r - 3.5], [13, 1.6, r + 1]),
        (360 / p.ringGearTeeth) * i,
        [0, 0, 0],
        [1, 0, 0],
      ),
    );
  }
  cuts.push(
    cylinder(p.flywheelClutchDia / 2, 6, [p.flywheelThk - 6, 0, 0], [1, 0, 0]),
  );
  cuts.push(cylinder(18, p.flywheelThk + 4, [-2, 0, 0], [1, 0, 0]));
  for (let b = 0; b < p.flangeBolts; b++) {
    const a = (360 / p.flangeBolts) * b;
    cuts.push(
      cylinder(
        p.flangeBoltDia / 2,
        p.flywheelThk + 4,
        [
          -2,
          (p.flangeBoltCircle / 2) * cosd(a),
          (p.flangeBoltCircle / 2) * sind(a),
        ],
        [1, 0, 0],
      ),
    );
  }
  return cutAll(shape, cuts);
};

const sparkPlug = (p: Params): TopoDS_Shape =>
  fuseAll([
    cylinder(p.plugThreadDia / 2, p.plugReach, [0, 0, 0], [0, 0, 1]),
    cylinder(1.2, 4, [0, 0, -3.5], [0, 0, 1]),
    regularPrismZ(p.plugHexAcross / Math.sqrt(3), 6, p.plugReach, 14),
    cylinder(6.5, 22, [0, 0, p.plugReach + 14], [0, 0, 1]),
    cylinder(5, 10, [0, 0, p.plugReach + 36], [0, 0, 1]),
    cylinder(3, 6, [0, 0, p.plugReach + 46], [0, 0, 1]),
  ]);

const banked = (
  shape: TopoDS_Shape,
  angle: number,
  delta: Vec3,
): TopoDS_Shape =>
  translate(rotate(shape, angle - 90, [0, 0, 0], [1, 0, 0]), delta);
const entry = (
  shape: TopoDS_Shape,
  name: string,
  color: string,
  opacity = 1,
): EnginePart => ({ shape, name, color, opacity });

export default function main(
  params: Partial<Params> = defaultParams,
): EnginePart[] {
  activateParallelDefaults();
  const p: Params = { ...defaultParams, ...params };
  const st = stations(p);
  const parts: EnginePart[] = [
    entry(crankshaft(p), 'Crankshaft', '#c3c3cc'),
    entry(engineBlock(p), 'Block', '#5f6168', 0.55),
    entry(
      translate(damper(p), [st.snoutStart - p.damperThk, 0, 0]),
      'HarmonicDamper',
      '#2b2b2e',
    ),
    entry(
      translate(flywheel(p), [st.flangeStart + p.flangeThk, 0, 0]),
      'Flywheel',
      '#9a9aa2',
    ),
    entry(oilPan(p), 'OilPan', '#3a3a40'),
    entry(intake(p), 'IntakeManifold', '#7a2d2d', 0.9),
  ];

  const pistonPrototype = piston(p);
  const pinPrototype = wristPin(p);
  const rodPrototype = conrod(p);
  const plugPrototype = sparkPlug(p);
  const headPrototype = cylinderHead(p);
  const coverPrototype = valveCover(p);

  const baseZ = 10;
  let cylinderIndex = 0;
  for (const bank of BANKS) {
    const ny = cosd(bank.deckAngle);
    const nz = sind(bank.deckAngle);
    for (let i = 0; i < 4; i++) {
      const x =
        arrayValue(st.pinCenter, i, 'pinCenter') +
        (bank.side === 'R' ? 15 : 0) -
        7;
      const phase = phaseAt(i);
      const crankY = p.crankThrow * cosd(phase);
      const crankZ = p.crankThrow * sind(phase);
      const a = crankY;
      const b = crankZ - baseZ;
      const k = ny * a + nz * b;
      const s =
        k +
        Math.sqrt(
          Math.max(0, k * k - (a * a + b * b - p.rodLength * p.rodLength)),
        );
      const pinCY = s * ny;
      const pinCZ = baseZ + s * nz;
      const phiDeg =
        (Math.atan2(pinCZ - crankZ, pinCY - crankY) * 180) / Math.PI;

      parts.push(
        entry(
          banked(pistonPrototype, bank.deckAngle, [x, pinCY, pinCZ]),
          `Piston${cylinderIndex + 1}`,
          '#d9d9de',
        ),
      );
      parts.push(
        entry(
          translate(pinPrototype, [x, pinCY, pinCZ]),
          `WristPin${cylinderIndex + 1}`,
          '#8f8f97',
        ),
      );
      parts.push(
        entry(
          translate(
            rotate(
              rotate(rodPrototype, 90, [0, 0, 0], [0, 1, 0]),
              phiDeg,
              [0, 0, 0],
              [1, 0, 0],
            ),
            [x, crankY, crankZ],
          ),
          `ConRod${cylinderIndex + 1}`,
          '#b0b0b8',
        ),
      );
      parts.push(
        entry(
          banked(plugPrototype, bank.deckAngle, [
            x,
            ny * p.deckHeight,
            baseZ + nz * p.deckHeight,
          ]),
          `SparkPlug${cylinderIndex + 1}`,
          '#cfcf66',
        ),
      );
      cylinderIndex++;
    }
  }

  for (const bank of BANKS) {
    parts.push(
      entry(
        banked(headPrototype, bank.deckAngle, [
          0,
          cosd(bank.deckAngle) * p.deckHeight,
          sind(bank.deckAngle) * p.deckHeight + 10,
        ]),
        `Cylinder Head ${bank.side}`,
        '#55575d',
      ),
    );
    parts.push(
      entry(
        banked(coverPrototype, bank.deckAngle, [
          0,
          cosd(bank.deckAngle) * (p.deckHeight + p.headThk),
          sind(bank.deckAngle) * (p.deckHeight + p.headThk) + 10,
        ]),
        `Valve Cover ${bank.side}`,
        '#43444a',
      ),
    );
  }

  return parts;
}
