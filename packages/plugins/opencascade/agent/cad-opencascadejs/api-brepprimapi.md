# libcascade — BRepPrimAPI

12 top-level symbols. Signatures are verbatim typescript.

BRepPrimAPI_MakeBox: declare class BRepPrimAPI_MakeBox extends BRepBuilderAPI_MakeShape

  constructor

  Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
  Init(theDX: number, theDY: number, theDZ: number): void;
  Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
  Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;
  Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
  Init(theDX: number, theDY: number, theDZ: number): void;
  Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
  Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;
  Init(thePnt1: gp_Pnt, thePnt2: gp_Pnt): void;
  Init(theDX: number, theDY: number, theDZ: number): void;
  Init(thePnt: gp_Pnt, theDX: number, theDY: number, theDZ: number): void;
  Init(theAxes: gp_Ax2, theDX: number, theDY: number, theDZ: number): void;
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

BRepPrimAPI_MakeCone: declare class BRepPrimAPI_MakeCone extends BRepPrimAPI_MakeOneAxis

  constructor

  Cone(): BRepPrim_Cone;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeCylinder: declare class BRepPrimAPI_MakeCylinder extends BRepPrimAPI_MakeOneAxis

  constructor

  Cylinder(): BRepPrim_Cylinder;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeHalfSpace: declare class BRepPrimAPI_MakeHalfSpace extends BRepBuilderAPI_MakeShape

  constructor

  Solid(): TopoDS_Solid;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeOneAxis: declare class BRepPrimAPI_MakeOneAxis extends BRepBuilderAPI_MakeShape

  Build(theRange?: Message_ProgressRange): void;

  Face(): TopoDS_Face;

  Shell(): TopoDS_Shell;

  Solid(): TopoDS_Solid;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakePrism: declare class BRepPrimAPI_MakePrism extends BRepPrimAPI_MakeSweep

  constructor

  Prism(): BRepSweep_Prism;

  Build(theRange?: Message_ProgressRange): void;

  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;
  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;

  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;
  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsDeleted(S: TopoDS_Shape): boolean;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeRevol: declare class BRepPrimAPI_MakeRevol extends BRepPrimAPI_MakeSweep

  constructor

  Revol(): BRepSweep_Revol;

  Build(theRange?: Message_ProgressRange): void;

  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;
  FirstShape(): TopoDS_Shape;
  FirstShape(theShape: TopoDS_Shape): TopoDS_Shape;

  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;
  LastShape(): TopoDS_Shape;
  LastShape(theShape: TopoDS_Shape): TopoDS_Shape;

  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  IsDeleted(S: TopoDS_Shape): boolean;

  HasDegenerated(): boolean;

  Degenerated(): NCollection_List_TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeRevolution: declare class BRepPrimAPI_MakeRevolution extends BRepPrimAPI_MakeOneAxis

  constructor

  Revolution(): BRepPrim_Revolution;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeSphere: declare class BRepPrimAPI_MakeSphere extends BRepPrimAPI_MakeOneAxis

  constructor

  Sphere(): BRepPrim_Sphere;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeSweep: declare class BRepPrimAPI_MakeSweep extends BRepBuilderAPI_MakeShape

  FirstShape(): TopoDS_Shape;

  LastShape(): TopoDS_Shape;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeTorus: declare class BRepPrimAPI_MakeTorus extends BRepPrimAPI_MakeOneAxis

  constructor

  Torus(): BRepPrim_Torus;

  delete(): void;

  [Symbol.dispose](): void;

BRepPrimAPI_MakeWedge: declare class BRepPrimAPI_MakeWedge extends BRepBuilderAPI_MakeShape

  constructor

  Wedge(): BRepPrim_Wedge;

  Build(theRange?: Message_ProgressRange): void;

  Shell(): TopoDS_Shell;

  Solid(): TopoDS_Solid;

  delete(): void;

  [Symbol.dispose](): void;
