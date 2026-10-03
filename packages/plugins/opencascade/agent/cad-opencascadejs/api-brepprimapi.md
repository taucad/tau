# libcascade — BRepPrimAPI

12 top-level symbols. Signatures are verbatim typescript.

BRepPrimAPI_MakeBox: declare class BRepPrimAPI_MakeBox extends BRepBuilderAPI_MakeShape

  // BRepPrimAPI_MakeBox.constructor (constructor)
  constructor();
  constructor(P1: gp_Pnt, P2: gp_Pnt);
  constructor(dx: number, dy: number, dz: number);
  constructor(P: gp_Pnt, dx: number, dy: number, dz: number);
  constructor(Axes: gp_Ax2, dx: number, dy: number, dz: number);

  // BRepPrimAPI_MakeBox.Init (method)
  Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
  Init(theDX: number, theDY: number, theDZ: number): void;
  Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
  Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;

  // BRepPrimAPI_MakeBox.Wedge (method)
  Wedge(): BRepPrim_Wedge;

  // BRepPrimAPI_MakeBox.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepPrimAPI_MakeBox.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepPrimAPI_MakeBox.Solid (method)
  Solid(): TopoDS_Solid;

  // BRepPrimAPI_MakeBox.BottomFace (method)
  BottomFace(): TopoDS_Face;

  // BRepPrimAPI_MakeBox.BackFace (method)
  BackFace(): TopoDS_Face;

  // BRepPrimAPI_MakeBox.FrontFace (method)
  FrontFace(): TopoDS_Face;

  // BRepPrimAPI_MakeBox.LeftFace (method)
  LeftFace(): TopoDS_Face;

  // BRepPrimAPI_MakeBox.RightFace (method)
  RightFace(): TopoDS_Face;

  // BRepPrimAPI_MakeBox.TopFace (method)
  TopFace(): TopoDS_Face;

  // BRepPrimAPI_MakeBox.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeBox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeCone: declare class BRepPrimAPI_MakeCone extends BRepPrimAPI_MakeOneAxis

  // BRepPrimAPI_MakeCone.constructor (constructor)
  constructor(R1: number, R2: number, H: number);
  constructor(R1: number, R2: number, H: number, angle: number);
  constructor(Axes: gp_Ax2, R1: number, R2: number, H: number);
  constructor(Axes: gp_Ax2, R1: number, R2: number, H: number, angle: number);

  // BRepPrimAPI_MakeCone.Cone (method)
  Cone(): BRepPrim_Cone;

  // BRepPrimAPI_MakeCone.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeCone.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeCylinder: declare class BRepPrimAPI_MakeCylinder extends BRepPrimAPI_MakeOneAxis

  // BRepPrimAPI_MakeCylinder.constructor (constructor)
  constructor(R: number, H: number);
  constructor(R: number, H: number, Angle: number);
  constructor(Axes: gp_Ax2, R: number, H: number);
  constructor(Axes: gp_Ax2, R: number, H: number, Angle: number);

  // BRepPrimAPI_MakeCylinder.Cylinder (method)
  Cylinder(): BRepPrim_Cylinder;

  // BRepPrimAPI_MakeCylinder.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeCylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeHalfSpace: declare class BRepPrimAPI_MakeHalfSpace extends BRepBuilderAPI_MakeShape

  // BRepPrimAPI_MakeHalfSpace.constructor (constructor)
  constructor(Face: TopoDS_Face, RefPnt: gp_Pnt);
  constructor(Shell: TopoDS_Shell, RefPnt: gp_Pnt);

  // BRepPrimAPI_MakeHalfSpace.Solid (method)
  Solid(): TopoDS_Solid;

  // BRepPrimAPI_MakeHalfSpace.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeHalfSpace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeOneAxis: declare class BRepPrimAPI_MakeOneAxis extends BRepBuilderAPI_MakeShape

  // BRepPrimAPI_MakeOneAxis.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepPrimAPI_MakeOneAxis.Face (method)
  Face(): TopoDS_Face;

  // BRepPrimAPI_MakeOneAxis.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepPrimAPI_MakeOneAxis.Solid (method)
  Solid(): TopoDS_Solid;

  // BRepPrimAPI_MakeOneAxis.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeOneAxis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakePrism: declare class BRepPrimAPI_MakePrism extends BRepPrimAPI_MakeSweep

  // BRepPrimAPI_MakePrism.constructor (constructor)
  constructor(S: TopoDS_Shape, V: gp_Vec, Copy?: boolean, Canonize?: boolean);
  constructor(S: TopoDS_Shape, D: gp_Dir, Inf?: boolean, Copy?: boolean, Canonize?: boolean);

  // BRepPrimAPI_MakePrism.Prism (method)
  Prism(): BRepSweep_Prism;

  // BRepPrimAPI_MakePrism.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepPrimAPI_MakePrism.FirstShape (method)
  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepPrimAPI_MakePrism.LastShape (method)
  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepPrimAPI_MakePrism.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepPrimAPI_MakePrism.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepPrimAPI_MakePrism.delete (method)
  delete(): void;

  // BRepPrimAPI_MakePrism.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeRevol: declare class BRepPrimAPI_MakeRevol extends BRepPrimAPI_MakeSweep

  // BRepPrimAPI_MakeRevol.constructor (constructor)
  constructor(S: TopoDS_Shape, A: gp_Ax1, Copy?: boolean);
  constructor(S: TopoDS_Shape, A: gp_Ax1, D: number, Copy?: boolean);

  // BRepPrimAPI_MakeRevol.Revol (method)
  Revol(): BRepSweep_Revol;

  // BRepPrimAPI_MakeRevol.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepPrimAPI_MakeRevol.FirstShape (method)
  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepPrimAPI_MakeRevol.LastShape (method)
  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepPrimAPI_MakeRevol.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepPrimAPI_MakeRevol.IsDeleted (method)
  IsDeleted(S: TopoDS_Shape): boolean;

  // BRepPrimAPI_MakeRevol.HasDegenerated (method)
  HasDegenerated(): boolean;

  // BRepPrimAPI_MakeRevol.Degenerated (method)
  Degenerated(): NCollection_List_TopoDS_Shape;

  // BRepPrimAPI_MakeRevol.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeRevol.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeRevolution: declare class BRepPrimAPI_MakeRevolution extends BRepPrimAPI_MakeOneAxis

  // BRepPrimAPI_MakeRevolution.constructor (constructor)
  constructor(Meridian: Geom_Curve);
  constructor(Meridian: Geom_Curve, angle: number);
  constructor(Axes: gp_Ax2, Meridian: Geom_Curve);
  constructor(Meridian: Geom_Curve, VMin: number, VMax: number);
  constructor(Axes: gp_Ax2, Meridian: Geom_Curve, angle: number);
  constructor(Meridian: Geom_Curve, VMin: number, VMax: number, angle: number);
  constructor(Axes: gp_Ax2, Meridian: Geom_Curve, VMin: number, VMax: number);
  constructor(Axes: gp_Ax2, Meridian: Geom_Curve, VMin: number, VMax: number, angle: number);

  // BRepPrimAPI_MakeRevolution.Revolution (method)
  Revolution(): BRepPrim_Revolution;

  // BRepPrimAPI_MakeRevolution.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeSphere: declare class BRepPrimAPI_MakeSphere extends BRepPrimAPI_MakeOneAxis

  // BRepPrimAPI_MakeSphere.constructor (constructor)
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

  // BRepPrimAPI_MakeSphere.Sphere (method)
  Sphere(): BRepPrim_Sphere;

  // BRepPrimAPI_MakeSphere.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeSphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeSweep: declare class BRepPrimAPI_MakeSweep extends BRepBuilderAPI_MakeShape

  // BRepPrimAPI_MakeSweep.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // BRepPrimAPI_MakeSweep.LastShape (method)
  LastShape(): TopoDS_Shape;

  // BRepPrimAPI_MakeSweep.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeSweep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeTorus: declare class BRepPrimAPI_MakeTorus extends BRepPrimAPI_MakeOneAxis

  // BRepPrimAPI_MakeTorus.constructor (constructor)
  constructor(R1: number, R2: number);
  constructor(R1: number, R2: number, angle: number);
  constructor(Axes: gp_Ax2, R1: number, R2: number);
  constructor(R1: number, R2: number, angle1: number, angle2: number);
  constructor(Axes: gp_Ax2, R1: number, R2: number, angle: number);
  constructor(R1: number, R2: number, angle1: number, angle2: number, angle: number);
  constructor(Axes: gp_Ax2, R1: number, R2: number, angle1: number, angle2: number);
  constructor(Axes: gp_Ax2, R1: number, R2: number, angle1: number, angle2: number, angle: number);

  // BRepPrimAPI_MakeTorus.Torus (method)
  Torus(): BRepPrim_Torus;

  // BRepPrimAPI_MakeTorus.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeTorus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepPrimAPI_MakeWedge: declare class BRepPrimAPI_MakeWedge extends BRepBuilderAPI_MakeShape

  // BRepPrimAPI_MakeWedge.constructor (constructor)
  constructor(dx: number, dy: number, dz: number, ltx: number);
  constructor(Axes: gp_Ax2, dx: number, dy: number, dz: number, ltx: number);
  constructor(dx: number, dy: number, dz: number, xmin: number, zmin: number, xmax: number, zmax: number);
  constructor(Axes: gp_Ax2, dx: number, dy: number, dz: number, xmin: number, zmin: number, xmax: number, zmax: number);

  // BRepPrimAPI_MakeWedge.Wedge (method)
  Wedge(): BRepPrim_Wedge;

  // BRepPrimAPI_MakeWedge.Build (method)
  Build(theRange?: Message_ProgressRange): void;

  // BRepPrimAPI_MakeWedge.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepPrimAPI_MakeWedge.Solid (method)
  Solid(): TopoDS_Solid;

  // BRepPrimAPI_MakeWedge.delete (method)
  delete(): void;

  // BRepPrimAPI_MakeWedge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
