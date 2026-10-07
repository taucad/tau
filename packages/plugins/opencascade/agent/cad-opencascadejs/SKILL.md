---
name: cad-opencascadejs
description: Guides direct OpenCascade.js BRep authoring in main.ts. Use when creating or editing libcascade geometry.
---

# OpenCascade.js authoring

## Workflow

1. Author `main.ts` with named imports from `libcascade`, exported `defaultParams`, and a default `main(params): TopoDS_Shape`.
2. Construct analytical edges and closed wires, build the operation, then return its shape.
3. Track every OCCT object and call `.delete()` in `finally`, including `gp_*`, `Geom*`, `BRep*`, and `TopoDS_*` intermediates.
4. Keep every standalone test target renderable through its own default `main`.

For multiple files, import helpers through explicit ESM paths such as `./lib/widget.js`; helpers return `TopoDS_Shape` and dispose their builders before returning.

## Kernel rules

- Use `GC_MakeArcOfCircle`, `Geom_Circle`, `Geom_BSplineCurve`, or `Geom2dAPI_PointsToBSpline` instead of polygon chains for analytical curves.
- Build profile wires from analytical edges and close them explicitly.
- Call `Build()` before `Shape()` where the selected builder requires it.
- The runtime meshes BRep at export; do not expose tessellation in `defaultParams`.

## Canonical pattern

```ts
import { BRepPrimAPI_MakeBox, gp_Pnt, type TopoDS_Shape } from 'libcascade';

export const defaultParams = { width: 80, depth: 40, height: 20 };

export default function main(p = defaultParams): TopoDS_Shape {
  const corner = new gp_Pnt(-p.width / 2, -p.depth / 2, -p.height / 2);
  const builder = new BRepPrimAPI_MakeBox(corner, p.width, p.depth, p.height);
  try {
    return builder.Shape();
  } finally {
    builder.delete();
    corner.delete();
  }
}
```

Check overload suffixes, unfreed temporaries, build order, and missing disposal first.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### BRepBuilderAPI

```ts
declare class BRepBuilderAPI_MakeWire extends BRepBuilderAPI_MakeShape
  constructor();
  constructor(E: TopoDS_Edge);
  constructor(W: TopoDS_Wire);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge);
  constructor(W: TopoDS_Wire, E: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge, E4: TopoDS_Edge);
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;
  IsDone(): boolean;
  Error(): BRepBuilderAPI_WireError;
  Wire(): TopoDS_Wire;
  Edge(): TopoDS_Edge;
  Vertex(): TopoDS_Vertex;
  delete(): void;
  [Symbol.dispose](): void;

BRepBuilderAPI_WireError: typeof BRepBuilderAPI_WireError[keyof typeof BRepBuilderAPI_WireError]

declare class BRepBuilderAPI_MakeFace extends BRepBuilderAPI_MakeShape
  constructor();
  constructor(F: TopoDS_Face);
  constructor(P: gp_Pln);
  constructor(C: gp_Cylinder);
  constructor(C: gp_Cone);
  constructor(S: gp_Sphere);
  constructor(C: gp_Torus);
  constructor(S: Geom_Surface, TolDegen: number);
  constructor(W: TopoDS_Wire, OnlyPlane?: boolean);
  constructor(F: TopoDS_Face, W: TopoDS_Wire);
  constructor(P: gp_Pln, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Cylinder, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Cone, W: TopoDS_Wire, Inside?: boolean);
  constructor(S: gp_Sphere, W: TopoDS_Wire, Inside?: boolean);
  constructor(C: gp_Torus, W: TopoDS_Wire, Inside?: boolean);
  constructor(S: Geom_Surface, W: TopoDS_Wire, Inside?: boolean);
  constructor(P: gp_Pln, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Cylinder, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Cone, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(S: gp_Sphere, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(C: gp_Torus, UMin: number, UMax: number, VMin: number, VMax: number);
  constructor(S: Geom_Surface, UMin: number, UMax: number, VMin: number, VMax: number, TolDegen: number);
  Add(W: TopoDS_Wire): void;
  Face(): TopoDS_Face;
  delete(): void;
  // … 4 more members in the API reference

declare class BRepBuilderAPI_MakePolygon extends BRepBuilderAPI_MakeShape
  constructor();
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, Close?: boolean);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, P4: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, V4: TopoDS_Vertex, Close?: boolean);
  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;
  Added(): boolean;
  Close(): void;
  FirstVertex(): TopoDS_Vertex;
  LastVertex(): TopoDS_Vertex;
  IsDone(): boolean;
  Edge(): TopoDS_Edge;
  Wire(): TopoDS_Wire;
  delete(): void;
  [Symbol.dispose](): void;
```

### TransferBRep

```ts
declare class TransferBRep_ShapeListBinder extends Transfer_Binder
  constructor();
  constructor(list: NCollection_HSequence_TopoDS_Shape);
  IsMultiple(): boolean;
  ResultType(): Standard_Type;
  ResultTypeName(): string;
  AddResult(res: TopoDS_Shape): void;
  AddResult(next: Transfer_Binder): void;
  Result(): NCollection_HSequence_TopoDS_Shape;
  SetResult(num: number, res: TopoDS_Shape): void;
  NbShapes(): number;
  Shape(num: number): TopoDS_Shape;
  ShapeType(num: number): TopAbs_ShapeEnum;
  Vertex(num: number): TopoDS_Vertex;
  Edge(num: number): TopoDS_Edge;
  Wire(num: number): TopoDS_Wire;
  Face(num: number): TopoDS_Face;
  Shell(num: number): TopoDS_Shell;
  Solid(num: number): TopoDS_Solid;
  CompSolid(num: number): TopoDS_CompSolid;
  Compound(num: number): TopoDS_Compound;
  static get_type_name(): string;
  static get_type_descriptor(): Standard_Type;
  DynamicType(): Standard_Type;
  delete(): void;
  [Symbol.dispose](): void;

TopAbs_ShapeEnum: typeof TopAbs_ShapeEnum[keyof typeof TopAbs_ShapeEnum]
```

### BRepAlgoAPI

```ts
declare class BRepAlgoAPI_BuilderAlgo extends BRepAlgoAPI_Algo
  constructor();
  SetArguments(theLS: NCollection_List_TopoDS_Shape): void;
  Arguments(): NCollection_List_TopoDS_Shape;
  SetNonDestructive(theFlag: boolean): void;
  NonDestructive(): boolean;
  SetGlue(theGlue: BOPAlgo_GlueEnum): void;
  Glue(): BOPAlgo_GlueEnum;
  SetCheckInverted(theCheck: boolean): void;
  CheckInverted(): boolean;
  Build(theRange?: Message_ProgressRange): void;
  SimplifyResult(theUnifyEdges?: boolean, theUnifyFaces?: boolean, theAngularTol?: number): void;
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  IsDeleted(S: TopoDS_Shape): boolean;
  HasModified(): boolean;
  HasGenerated(): boolean;
  HasDeleted(): boolean;
  SetToFillHistory(theHistFlag: boolean): void;
  HasHistory(): boolean;
  SectionEdges(): NCollection_List_TopoDS_Shape;
  Builder(): BOPAlgo_Builder;
  History(): BRepTools_History;
  delete(): void;
  [Symbol.dispose](): void;

BOPAlgo_GlueEnum: typeof BOPAlgo_GlueEnum[keyof typeof BOPAlgo_GlueEnum]

declare class BRepAlgoAPI_Algo extends BRepBuilderAPI_MakeShape
  Shape(): TopoDS_Shape;
  Clear(): void;
  ClearWarnings(): void;
  FuzzyValue(): number;
  GetReport(): Message_Report;
  HasError(theType: Standard_Type): boolean;
  HasErrors(): boolean;
  HasWarning(theType: Standard_Type): boolean;
  HasWarnings(): boolean;
  RunParallel(): boolean;
  SetFuzzyValue(theFuzz: number): void;
  SetRunParallel(theFlag: boolean): void;
  SetUseOBB(theUseOBB: boolean): void;
  delete(): void;
  [Symbol.dispose](): void;
```

### BRepFill

```ts
declare class BRepFill_Pipe
  constructor();
  constructor(Spine: TopoDS_Wire, Profile: TopoDS_Shape, aMode?: GeomFill_Trihedron, ForceApproxC1?: boolean, GeneratePartCase?: boolean);
  Perform(Spine: TopoDS_Wire, Profile: TopoDS_Shape, GeneratePartCase?: boolean): void;
  Spine(): TopoDS_Shape;
  Profile(): TopoDS_Shape;
  Shape(): TopoDS_Shape;
  ErrorOnSurface(): number;
  FirstShape(): TopoDS_Shape;
  LastShape(): TopoDS_Shape;
  Generated(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;
  Face(ESpine: TopoDS_Edge, EProfile: TopoDS_Edge): TopoDS_Face;
  Edge(ESpine: TopoDS_Edge, VProfile: TopoDS_Vertex): TopoDS_Edge;
  Section(VSpine: TopoDS_Vertex): TopoDS_Shape;
  PipeLine(Point: gp_Pnt): TopoDS_Wire;
  delete(): void;
  [Symbol.dispose](): void;

GeomFill_Trihedron: typeof GeomFill_Trihedron[keyof typeof GeomFill_Trihedron]

declare class BRepFill_PipeShell extends Standard_Transient
  Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;
  Build(): boolean;
  Shape(): TopoDS_Shape;
  delete(): void;
  // … 26 more members in the API reference

declare class BRepFill_Filling
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Build(): void;
  Face(): TopoDS_Face;
  delete(): void;
  // … 11 more members in the API reference

GeomAbs_Shape: typeof GeomAbs_Shape[keyof typeof GeomAbs_Shape]
```

### BRepFilletAPI

```ts
declare class BRepFilletAPI_MakeChamfer extends BRepFilletAPI_LocalOperation
  Add(E: TopoDS_Edge): void;
  Add(Dis: number, E: TopoDS_Edge): void;
  Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
  Edge(I: number, J: number): TopoDS_Edge;
  Build(theRange?: Message_ProgressRange): void;
  delete(): void;
  // … 33 more members in the API reference

declare class BRepFilletAPI_MakeFillet extends BRepFilletAPI_LocalOperation
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;
  Edge(I: number, J: number): TopoDS_Edge;
  Build(theRange?: Message_ProgressRange): void;
  delete(): void;
  // … 43 more members in the API reference
```

### BRepAlgo

```ts
declare class BRepAlgo_FaceRestrictor
  constructor();
  Init(F: TopoDS_Face, Proj?: boolean, ControlOrientation?: boolean): void;
  Add(W: TopoDS_Wire): void;
  Clear(): void;
  Perform(): void;
  IsDone(): boolean;
  More(): boolean;
  Next(): void;
  Current(): TopoDS_Face;
  delete(): void;
  [Symbol.dispose](): void;
```

### BRepGraphInc

```ts
declare class BRepGraphInc_Storage
  Edge(theEdge: BRepGraph_EdgeId): BRepGraphInc_EdgeDef;
  Wire(theWire: BRepGraph_WireId): BRepGraphInc_WireDef;
  Face(theFace: BRepGraph_FaceId): BRepGraphInc_FaceDef;
  delete(): void;
  // … 244 more members in the API reference
```

### BOPDS

```ts
declare class BOPDS_DS
  SetArguments(theLS: NCollection_List_TopoDS_Shape): void;
  Append(theSI: BOPDS_ShapeInfo): number;
  Append(theS: TopoDS_Shape): number;
  Shape(theIndex: number): TopoDS_Shape;
  delete(): void;
  // … 71 more members in the API reference

declare class BOPDS_PaveBlock extends Standard_Transient
  Edge(): number;
  delete(): void;
  // … 30 more members in the API reference
```

### BRepLib

```ts
declare class BRepLib_MakePolygon extends BRepLib_MakeShape
  constructor();
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, Close?: boolean);
  constructor(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, P4: gp_Pnt, Close?: boolean);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex, V3: TopoDS_Vertex, V4: TopoDS_Vertex, Close?: boolean);
  Add(P: gp_Pnt): void;
  Add(V: TopoDS_Vertex): void;
  Added(): boolean;
  Close(): void;
  FirstVertex(): TopoDS_Vertex;
  LastVertex(): TopoDS_Vertex;
  Edge(): TopoDS_Edge;
  Wire(): TopoDS_Wire;
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepLib_MakeWire extends BRepLib_MakeShape
  constructor();
  constructor(E: TopoDS_Edge);
  constructor(W: TopoDS_Wire);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge);
  constructor(W: TopoDS_Wire, E: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge);
  constructor(E1: TopoDS_Edge, E2: TopoDS_Edge, E3: TopoDS_Edge, E4: TopoDS_Edge);
  Add(E: TopoDS_Edge): void;
  Add(W: TopoDS_Wire): void;
  Add(L: NCollection_List_TopoDS_Shape): void;
  Error(): BRepLib_WireError;
  Wire(): TopoDS_Wire;
  Edge(): TopoDS_Edge;
  Vertex(): TopoDS_Vertex;
  delete(): void;
  [Symbol.dispose](): void;

BRepLib_WireError: typeof BRepLib_WireError[keyof typeof BRepLib_WireError]
```

### ShapeExtend

```ts
declare class ShapeExtend_WireData extends Standard_Transient
  Add(edge: TopoDS_Edge, atnum: number): void;
  Add(wire: TopoDS_Wire, atnum: number): void;
  Add(wire: ShapeExtend_WireData, atnum: number): void;
  Add(shape: TopoDS_Shape, atnum: number): void;
  Edge(num: number): TopoDS_Edge;
  Wire(): TopoDS_Wire;
  // … 23 more members in the API reference
```

### BOPTools

```ts
declare class BOPTools_Set
  constructor();
  constructor(theAllocator: NCollection_BaseAllocator);
  constructor(theOther: BOPTools_Set);
  Assign(Other: BOPTools_Set): BOPTools_Set;
  Shape(): TopoDS_Shape;
  Add(theS: TopoDS_Shape, theType: TopAbs_ShapeEnum): void;
  NbShapes(): number;
  IsEqual(aOther: BOPTools_Set): boolean;
  GetSum(): number;
  delete(): void;
  [Symbol.dispose](): void;
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 75301 symbols by file.

- 22 reference files, named in `api-index.md`
- 357 further files are fetched on demand; `api-index.md` names them.

Read ranges, not whole files. Never copy a reference into a source file.
