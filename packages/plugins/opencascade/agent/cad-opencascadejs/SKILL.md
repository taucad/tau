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

## Tessellation

Views and exports take `options.tessellation` as a preset or an explicit object, never both. Presets scale with the shape's bounding-box diagonal D: `low` (D/500, 30°) for a first look or a large assembly; `medium` (D/2000, 20°), the default for `evaluate_model`, `screenshot` and the viewer; `high` (D/8000, 12°), the export default; `extra-high` (D/32000, 6°) only when asked. The explicit `{ linearTolerance, angularTolerance }` is absolute, in millimetres and degrees, and does not scale with size; an omitted field keeps the kernel default (0.02 mm and 20° to view, 0.01 mm and 20° to export). Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint yet, so keep it out of model parameters. Results report the effective `tessellation` (requested form, tolerances, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M fails with suggested tolerances.

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

### BRepPrimAPI

```ts
declare class BRepPrimAPI_MakeBox extends BRepBuilderAPI_MakeShape
  constructor();
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(dx: number, dy: number, dz: number);
  constructor(P: gp_Pnt, dx: number, dy: number, dz: number);
  constructor(Axes: gp_Ax2, dx: number, dy: number, dz: number);
  Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
  Init(theDX: number, theDY: number, theDZ: number): void;
  Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
  Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;
  Wedge(): BRepPrim_Wedge;
  Build(theRange?: Message_ProgressRange): void;
  Shell(): TopoDS_Shell;
  Solid(): TopoDS_Solid;
  BottomFace(): TopoDS_Face;
  BackFace(): TopoDS_Face;
  FrontFace(): TopoDS_Face;
  LeftFace(): TopoDS_Face;
  RightFace(): TopoDS_Face;
  TopFace(): TopoDS_Face;
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepPrimAPI_MakeCylinder extends BRepPrimAPI_MakeOneAxis
  constructor(R: number, H: number);
  constructor(R: number, H: number, Angle: number);
  constructor(Axes: gp_Ax2, R: number, H: number);
  constructor(Axes: gp_Ax2, R: number, H: number, Angle: number);
  Cylinder(): BRepPrim_Cylinder;
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepPrimAPI_MakeSphere extends BRepPrimAPI_MakeOneAxis
  constructor(R: number);
  constructor(R: number, angle: number);
  constructor(Center: gp_Pnt, R: number);
  constructor(Axis: gp_Ax2, R: number);
  constructor(R: number, angle1: number, angle2: number);
  constructor(Center: gp_Pnt, R: number, angle: number);
  constructor(Axis: gp_Ax2, R: number, angle: number);
  constructor(R: number, angle1: number, angle2: number, angle3: number);
  constructor(Center: gp_Pnt, R: number, angle1: number, angle2: number);
  constructor(Axis: gp_Ax2, R: number, angle1: number, angle2: number);
  constructor(Center: gp_Pnt, R: number, angle1: number, angle2: number, angle3: number);
  constructor(Axis: gp_Ax2, R: number, angle1: number, angle2: number, angle3: number);
  Sphere(): BRepPrim_Sphere;
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepPrimAPI_MakePrism extends BRepPrimAPI_MakeSweep
  constructor(S: TopoDS_Shape, V: gp_Vec, Copy?: boolean, Canonize?: boolean);
  constructor(S: TopoDS_Shape, D: gp_Dir, Inf?: boolean, Copy?: boolean, Canonize?: boolean);
  Prism(): BRepSweep_Prism;
  Build(theRange?: Message_ProgressRange): void;
  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;
  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  IsDeleted(S: TopoDS_Shape): boolean;
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepPrimAPI_MakeRevol extends BRepPrimAPI_MakeSweep
  constructor(S: TopoDS_Shape, A: gp_Ax1, Copy?: boolean);
  constructor(S: TopoDS_Shape, A: gp_Ax1, D: number, Copy?: boolean);
  Revol(): BRepSweep_Revol;
  Build(theRange?: Message_ProgressRange): void;
  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;
  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  IsDeleted(S: TopoDS_Shape): boolean;
  HasDegenerated(): boolean;
  Degenerated(): NCollection_List_TopoDS_Shape;
  delete(): void;
  [Symbol.dispose](): void;
```

### BRepAlgoAPI

```ts
declare class BRepAlgoAPI_Fuse extends BRepAlgoAPI_BooleanOperation
  constructor();
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, theRange?: Message_ProgressRange);
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepAlgoAPI_Cut extends BRepAlgoAPI_BooleanOperation
  constructor();
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, theRange?: Message_ProgressRange);
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepAlgoAPI_Common extends BRepAlgoAPI_BooleanOperation
  constructor();
  constructor(S1: TopoDS_Shape, S2: TopoDS_Shape, theRange?: Message_ProgressRange);
  delete(): void;
  [Symbol.dispose](): void;
```

### BRepBuilderAPI

```ts
declare class BRepBuilderAPI_MakeShape extends BRepBuilderAPI_Command
  Build(theRange?: Message_ProgressRange): void;
  Shape(): TopoDS_Shape;
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  IsDeleted(S: TopoDS_Shape): boolean;
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepBuilderAPI_Transform extends BRepBuilderAPI_ModifyShape
  constructor(T: gp_Trsf);
  constructor(theShape: TopoDS_Shape, theTrsf: gp_Trsf, theCopyGeom?: boolean, theCopyMesh?: boolean);
  Perform(theShape: TopoDS_Shape, theCopyGeom?: boolean, theCopyMesh?: boolean): void;
  ModifiedShape(S: TopoDS_Shape): TopoDS_Shape;
  Modified(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;
  delete(): void;
  [Symbol.dispose](): void;

declare class BRepBuilderAPI_MakeEdge extends BRepBuilderAPI_MakeShape
  constructor();
  constructor(L: gp_Lin);
  constructor(L: gp_Circ);
  constructor(L: gp_Elips);
  constructor(L: gp_Hypr);
  constructor(L: gp_Parab);
  constructor(L: Geom_Curve);
  constructor(V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom2d_Curve, S: Geom_Surface);
  constructor(L: gp_Lin, p1: number, p2: number);
  constructor(L: gp_Lin, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Lin, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Circ, p1: number, p2: number);
  constructor(L: gp_Circ, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Circ, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Elips, p1: number, p2: number);
  constructor(L: gp_Elips, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Elips, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Hypr, p1: number, p2: number);
  constructor(L: gp_Hypr, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Hypr, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: gp_Parab, p1: number, p2: number);
  constructor(L: gp_Parab, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: gp_Parab, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom_Curve, p1: number, p2: number);
  constructor(L: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom2d_Curve, S: Geom_Surface, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt);
  constructor(L: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex);
  constructor(L: Geom_Curve, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number);
  constructor(L: Geom_Curve, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, P1: gp_Pnt, P2: gp_Pnt, p1: number, p2: number);
  constructor(L: Geom2d_Curve, S: Geom_Surface, V1: TopoDS_Vertex, V2: TopoDS_Vertex, p1: number, p2: number);
  Edge(): TopoDS_Edge;
  delete(): void;
  // … 6 more members in the API reference: Init, IsDone, Error, Vertex1, Vertex2, [Symbol.dispose]

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
```

### BRepFilletAPI

```ts
declare class BRepFilletAPI_MakeFillet extends BRepFilletAPI_LocalOperation
  constructor(S: TopoDS_Shape, FShape?: ChFi3d_FilletShape);
  Add(E: TopoDS_Edge): void;
  Add(Radius: number, E: TopoDS_Edge): void;
  Add(L: Law_Function, E: TopoDS_Edge): void;
  Add(UandR: NCollection_Array1_gp_Pnt2d, E: TopoDS_Edge): void;
  Add(R1: number, R2: number, E: TopoDS_Edge): void;
  Edge(I: number, J: number): TopoDS_Edge;
  Build(theRange?: Message_ProgressRange): void;
  delete(): void;
  // … 42 more members in the API reference: SetParams, SetContinuity, SetRadius, ResetContour, IsConstant, Radius, GetBounds, GetLaw, SetLaw, SetFilletShape, GetFilletShape, NbContours, Contour, NbEdges, Remove, Length, FirstVertex, LastVertex, Abscissa, RelativeAbscissa, ClosedAndTangent, Closed, Reset, Builder, Generated, Modified, IsDeleted, NbSurfaces, NewFaces, Simulate, NbSurf, Sect, and 10 more

declare class BRepFilletAPI_MakeChamfer extends BRepFilletAPI_LocalOperation
  constructor(S: TopoDS_Shape);
  Add(E: TopoDS_Edge): void;
  Add(Dis: number, E: TopoDS_Edge): void;
  Add(Dis1: number, Dis2: number, E: TopoDS_Edge, F: TopoDS_Face): void;
  Edge(I: number, J: number): TopoDS_Edge;
  Build(theRange?: Message_ProgressRange): void;
  delete(): void;
  // … 32 more members in the API reference: SetDist, GetDist, SetDists, Dists, AddDA, SetDistAngle, GetDistAngle, SetMode, IsSymetric, IsTwoDistances, IsDistanceAngle, ResetContour, NbContours, Contour, NbEdges, Remove, Length, FirstVertex, LastVertex, Abscissa, RelativeAbscissa, ClosedAndTangent, Closed, Reset, Builder, Generated, Modified, IsDeleted, Simulate, NbSurf, Sect, [Symbol.dispose]
```

### TopExp

```ts
declare class TopExp_Explorer
  constructor();
  constructor(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum);
  Init(S: TopoDS_Shape, ToFind: TopAbs_ShapeEnum, ToAvoid?: TopAbs_ShapeEnum): void;
  More(): boolean;
  Next(): void;
  Value(): TopoDS_Shape;
  Current(): TopoDS_Shape;
  ReInit(): void;
  ExploredShape(): TopoDS_Shape;
  Depth(): number;
  Clear(): void;
  end(): NCollection_ForwardRangeSentinel;
  delete(): void;
  [Symbol.dispose](): void;

TopAbs_ShapeEnum: typeof TopAbs_ShapeEnum[keyof typeof TopAbs_ShapeEnum]
  readonly TopAbs_COMPOUND: 'TopAbs_COMPOUND'
  readonly TopAbs_COMPSOLID: 'TopAbs_COMPSOLID'
  readonly TopAbs_SOLID: 'TopAbs_SOLID'
  readonly TopAbs_SHELL: 'TopAbs_SHELL'
  readonly TopAbs_FACE: 'TopAbs_FACE'
  readonly TopAbs_WIRE: 'TopAbs_WIRE'
  readonly TopAbs_EDGE: 'TopAbs_EDGE'
  readonly TopAbs_VERTEX: 'TopAbs_VERTEX'
  readonly TopAbs_SHAPE: 'TopAbs_SHAPE'

declare class TopExp
  static FirstVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;
  static LastVertex(E: TopoDS_Edge, CumOri?: boolean): TopoDS_Vertex;
  // … 8 more members in the API reference: constructor, MapShapes, MapShapesAndAncestors, MapShapesAndUniqueAncestors, Vertices, CommonVertex, delete, [Symbol.dispose]
```

### TopoDS

```ts
declare class TopoDS
  static Edge(shape: TopoDS_Shape): TopoDS_Edge;
  static Wire(shape: TopoDS_Shape): TopoDS_Wire;
  static Face(shape: TopoDS_Shape): TopoDS_Face;
  static Vertex(shape: TopoDS_Shape): TopoDS_Vertex;
  static Shell(shape: TopoDS_Shape): TopoDS_Shell;
  static Solid(shape: TopoDS_Shape): TopoDS_Solid;
  static Compound(shape: TopoDS_Shape): TopoDS_Compound;
```

### BRep

```ts
declare class BRep_Tool
  static Pnt(V: TopoDS_Vertex): gp_Pnt;
  // … 28 more members in the API reference: constructor, IsClosed, Surface, Triangulation, Triangulations, Tolerance, NaturalRestriction, IsGeometric, Curve, Polygon3D, CurveOnSurface, CurveOnPlane, PolygonOnSurface, PolygonOnTriangulation, SameParameter, SameRange, Degenerated, Range, UVPoints, SetUVPoints, HasContinuity, Continuity, MaxContinuity, Parameter, Parameters, MaxTolerance, delete, and 1 more
```

### gp

```ts
declare class gp_Pnt
  constructor();
  constructor(theCoord: gp_XYZ);
  constructor(theXp: number, theYp: number, theZp: number);
  X(): number;
  Y(): number;
  Z(): number;
  // … 24 more members in the API reference: SetCoord, SetX, SetY, SetZ, SetXYZ, Coord, XYZ, ChangeCoord, BaryCenter, IsEqual, Distance, SquareDistance, Mirror, Mirrored, Rotate, Rotated, Scale, Scaled, Transform, Transformed, Translate, Translated, delete, [Symbol.dispose]

declare class gp_Dir
  constructor();
  constructor(theDir: gp_Dir_D);
  constructor(theV: gp_Vec);
  constructor(theCoord: gp_XYZ);
  constructor(a0: gp_Dir);
  constructor(theXv: number, theYv: number, theZv: number);
  // … 32 more members in the API reference: SetCoord, SetX, SetY, SetZ, SetXYZ, Coord, X, Y, Z, XYZ, IsEqual, IsNormal, IsOpposite, IsParallel, Angle, AngleWithRef, Cross, Crossed, CrossCross, CrossCrossed, Dot, DotCross, Reverse, Reversed, Mirror, Mirrored, Rotate, Rotated, Transform, Transformed, delete, [Symbol.dispose]

declare class gp_Vec
  constructor();
  constructor(theV: gp_Dir);
  constructor(theCoord: gp_XYZ);
  constructor(theP1: gp_Pnt, theP2: gp_Pnt);
  constructor(theXv: number, theYv: number, theZv: number);
  Add(theOther: gp_Vec): void;
  // … 48 more members in the API reference: SetCoord, SetX, SetY, SetZ, SetXYZ, Coord, X, Y, Z, XYZ, IsEqual, IsNormal, IsOpposite, IsParallel, Angle, AngleWithRef, Magnitude, SquareMagnitude, Added, Subtract, Subtracted, Multiply, Multiplied, Divide, Divided, Cross, Crossed, CrossMagnitude, CrossSquareMagnitude, CrossCross, CrossCrossed, Dot, DotCross, Normalize, Normalized, Reverse, Reversed, and 11 more

declare class gp_Ax1
  constructor();
  constructor(theDir: gp_Dir_D);
  constructor(theP: gp_Pnt, theV: gp_Dir);
  constructor(theP: gp_Pnt, theDir: gp_Dir_D);
  // … 23 more members in the API reference: SetDirection, SetLocation, Direction, Location, IsCoaxial, IsNormal, IsOpposite, IsParallel, Angle, Reverse, Reversed, Mirror, Mirrored, Rotate, Rotated, Scale, Scaled, Transform, Transformed, Translate, Translated, delete, [Symbol.dispose]

declare class gp_Ax2
  constructor();
  constructor(theV: gp_Dir_D);
  constructor(P: gp_Pnt, V: gp_Dir);
  constructor(theP: gp_Pnt, theV: gp_Dir_D);
  constructor(P: gp_Pnt, N: gp_Dir, Vx: gp_Dir);
  constructor(theP: gp_Pnt, theN: gp_Dir_D, theVx: gp_Dir_D);
  // … 24 more members in the API reference: SetAxis, SetDirection, SetLocation, SetXDirection, SetYDirection, Angle, Axis, Direction, Location, XDirection, YDirection, IsCoplanar, Mirror, Mirrored, Rotate, Rotated, Scale, Scaled, Transform, Transformed, Translate, Translated, delete, [Symbol.dispose]

declare class gp_Trsf
  constructor();
  constructor(theT: gp_Trsf2d);
  SetRotation(theA1: gp_Ax1, theAng: number): void;
  SetRotation(theR: gp_Quaternion): void;
  SetTranslation(theV: gp_Vec): void;
  SetTranslation(theP1: gp_Pnt, theP2: gp_Pnt): void;
  // … 27 more members in the API reference: SetMirror, SetRotationPart, SetScale, SetDisplacement, SetTransformation, SetTranslationPart, SetScaleFactor, SetForm, SetValues, IsNegative, Form, ScaleFactor, TranslationPart, GetRotation, VectorialPart, HVectorialPart, Value, Invert, Inverted, Multiplied, Multiply, PreMultiply, Power, Powered, Transforms, delete, [Symbol.dispose]
```

## API reference

To read any other signature, find its name in `api-index.md`, which lists all 77875 symbols by file with the lines that hold each, and read that range of the named file.

- 22 reference files, named in `api-index.md`
- 357 further files are fetched on demand; `api-index.md` names them.

Read ranges, not whole files. Never copy a reference into a source file.
