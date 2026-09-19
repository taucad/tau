# libcascade — Bnd

14 top-level symbols. Signatures are verbatim typescript.

Bnd_BoundSortBox: declare class Bnd_BoundSortBox

  constructor

  Initialize(theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theNbBoxes: number): void;
  Initialize(theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theNbBoxes: number): void;
  Initialize(theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theNbBoxes: number): void;

  Add(theBox: Bnd_Box, theIndex: number): void;

  Compare(theBox: Bnd_Box): NCollection_List_int;
  Compare(thePlane: gp_Pln): NCollection_List_int;
  Compare(theBox: Bnd_Box): NCollection_List_int;
  Compare(thePlane: gp_Pln): NCollection_List_int;

  delete(): void;

  [Symbol.dispose](): void;

Bnd_Box: declare class Bnd_Box

  constructor

  SetWhole(): void;

  SetVoid(): void;

  Set(P: gp_Pnt): void;
  Set(P: gp_Pnt, D: gp_Dir): void;
  Set(P: gp_Pnt): void;
  Set(P: gp_Pnt, D: gp_Dir): void;

  Update(aXmin: number, aYmin: number, aZmin: number, aXmax: number, aYmax: number, aZmax: number): void;
  Update(X: number, Y: number, Z: number): void;
  Update(aXmin: number, aYmin: number, aZmin: number, aXmax: number, aYmax: number, aZmax: number): void;
  Update(X: number, Y: number, Z: number): void;

  SetGap(Tol: number): void;

  Enlarge(Tol: number): void;

  GetXMin(): number;

  GetXMax(): number;

  GetYMin(): number;

  GetYMax(): number;

  GetZMin(): number;

  GetZMax(): number;

  CornerMin(): gp_Pnt;

  CornerMax(): gp_Pnt;

  Center(): gp_Pnt | null | undefined;

  OpenXmin(): void;

  OpenXmax(): void;

  OpenYmin(): void;

  OpenYmax(): void;

  OpenZmin(): void;

  OpenZmax(): void;

  IsOpen(): boolean;

  IsOpenXmin(): boolean;

  IsOpenXmax(): boolean;

  IsOpenYmin(): boolean;

  IsOpenYmax(): boolean;

  IsOpenZmin(): boolean;

  IsOpenZmax(): boolean;

  IsWhole(): boolean;

  IsVoid(): boolean;

  IsXThin(tol: number): boolean;

  IsYThin(tol: number): boolean;

  IsZThin(tol: number): boolean;

  IsThin(tol: number): boolean;

  Transformed(T: gp_Trsf): Bnd_Box;

  Add(Other: Bnd_Box): void;
  Add(P: gp_Pnt): void;
  Add(D: gp_Dir): void;
  Add(P: gp_Pnt, D: gp_Dir): void;
  Add(Other: Bnd_Box): void;
  Add(P: gp_Pnt): void;
  Add(D: gp_Dir): void;
  Add(P: gp_Pnt, D: gp_Dir): void;
  Add(Other: Bnd_Box): void;
  Add(P: gp_Pnt): void;
  Add(D: gp_Dir): void;
  Add(P: gp_Pnt, D: gp_Dir): void;
  Add(Other: Bnd_Box): void;
  Add(P: gp_Pnt): void;
  Add(D: gp_Dir): void;
  Add(P: gp_Pnt, D: gp_Dir): void;

  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;

  Contains(theP: gp_Pnt): boolean;

  Intersects(theOther: Bnd_Box): boolean;

  Distance(Other: Bnd_Box): number;

  Dump(): void;

  SquareExtent(): number;

  FinitePart(): Bnd_Box;

  HasFinitePart(): boolean;

  delete(): void;

  [Symbol.dispose](): void;

Bnd_Box2d: declare class Bnd_Box2d

  constructor

  SetWhole(): void;

  SetVoid(): void;

  Set(thePnt: gp_Pnt2d): void;
  Set(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
  Set(thePnt: gp_Pnt2d): void;
  Set(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;

  Update(aXmin: number, aYmin: number, aXmax: number, aYmax: number): void;
  Update(X: number, Y: number): void;
  Update(aXmin: number, aYmin: number, aXmax: number, aYmax: number): void;
  Update(X: number, Y: number): void;

  SetGap(Tol: number): void;

  Enlarge(theTol: number): void;

  GetXMin(): number;

  GetXMax(): number;

  GetYMin(): number;

  GetYMax(): number;

  Center(): gp_Pnt2d | null | undefined;

  OpenXmin(): void;

  OpenXmax(): void;

  OpenYmin(): void;

  OpenYmax(): void;

  IsOpenXmin(): boolean;

  IsOpenXmax(): boolean;

  IsOpenYmin(): boolean;

  IsOpenYmax(): boolean;

  IsWhole(): boolean;

  IsVoid(): boolean;

  Transformed(T: gp_Trsf2d): Bnd_Box2d;

  Add(Other: Bnd_Box2d): void;
  Add(thePnt: gp_Pnt2d): void;
  Add(D: gp_Dir2d): void;
  Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
  Add(Other: Bnd_Box2d): void;
  Add(thePnt: gp_Pnt2d): void;
  Add(D: gp_Dir2d): void;
  Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
  Add(Other: Bnd_Box2d): void;
  Add(thePnt: gp_Pnt2d): void;
  Add(D: gp_Dir2d): void;
  Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
  Add(Other: Bnd_Box2d): void;
  Add(thePnt: gp_Pnt2d): void;
  Add(D: gp_Dir2d): void;
  Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;

  IsOut(P: gp_Pnt2d): boolean;
  IsOut(theL: gp_Lin2d): boolean;
  IsOut(Other: Bnd_Box2d): boolean;
  IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
  IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
  IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
  IsOut(P: gp_Pnt2d): boolean;
  IsOut(theL: gp_Lin2d): boolean;
  IsOut(Other: Bnd_Box2d): boolean;
  IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
  IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
  IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
  IsOut(P: gp_Pnt2d): boolean;
  IsOut(theL: gp_Lin2d): boolean;
  IsOut(Other: Bnd_Box2d): boolean;
  IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
  IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
  IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
  IsOut(P: gp_Pnt2d): boolean;
  IsOut(theL: gp_Lin2d): boolean;
  IsOut(Other: Bnd_Box2d): boolean;
  IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
  IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
  IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
  IsOut(P: gp_Pnt2d): boolean;
  IsOut(theL: gp_Lin2d): boolean;
  IsOut(Other: Bnd_Box2d): boolean;
  IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
  IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
  IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
  IsOut(P: gp_Pnt2d): boolean;
  IsOut(theL: gp_Lin2d): boolean;
  IsOut(Other: Bnd_Box2d): boolean;
  IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
  IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
  IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;

  Contains(theP: gp_Pnt2d): boolean;

  Intersects(theOther: Bnd_Box2d): boolean;

  Distance(theOther: Bnd_Box2d): number;

  Dump(): void;

  SquareExtent(): number;

  delete(): void;

  [Symbol.dispose](): void;

Bnd_OBB: declare class Bnd_OBB

  constructor

  ReBuild(theListOfPoints: NCollection_Array1_gp_Pnt, theListOfTolerances?: NCollection_Array1_double, theIsOptimal?: boolean): void;

  SetCenter(theCenter: gp_Pnt): void;

  SetXComponent(theXDirection: gp_Dir, theHXSize: number): void;

  SetYComponent(theYDirection: gp_Dir, theHYSize: number): void;

  SetZComponent(theZDirection: gp_Dir, theHZSize: number): void;

  Position(): gp_Ax3;

  Center(): gp_XYZ;

  XDirection(): gp_XYZ;

  YDirection(): gp_XYZ;

  ZDirection(): gp_XYZ;

  XHSize(): number;

  YHSize(): number;

  ZHSize(): number;

  GetHalfSizes(): Bnd_OBB_HalfSizes;

  IsVoid(): boolean;

  SetVoid(): void;

  SetAABox(theFlag: boolean): void;

  IsAABox(): boolean;

  Enlarge(theGapAdd: number): void;

  GetVertex(theP: [gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt]): boolean;

  SquareExtent(): number;

  IsOut(theOther: Bnd_OBB): boolean;
  IsOut(theP: gp_Pnt): boolean;
  IsOut(theOther: Bnd_OBB): boolean;
  IsOut(theP: gp_Pnt): boolean;

  Contains(theP: gp_Pnt): boolean;

  Intersects(theOther: Bnd_OBB): boolean;

  IsCompletelyInside(theOther: Bnd_OBB): boolean;

  Add(theOther: Bnd_OBB): void;
  Add(theP: gp_Pnt): void;
  Add(theOther: Bnd_OBB): void;
  Add(theP: gp_Pnt): void;

  delete(): void;

  [Symbol.dispose](): void;

Bnd_Range: declare class Bnd_Range

  constructor

  Common(theOther: Bnd_Range): void;

  Union(theOther: Bnd_Range): boolean;

  Split(theVal: number, theList: NCollection_List_Bnd_Range, thePeriod: number): void;

  IsIntersected(theVal: number, thePeriod?: number): Bnd_Range_IntersectStatus;

  Add(theParameter: number): void;
  Add(theRange: Bnd_Range): void;
  Add(theParameter: number): void;
  Add(theRange: Bnd_Range): void;

  GetMin(thePar?: number): { returnValue: boolean; thePar: number };

  GetMax(thePar?: number): { returnValue: boolean; thePar: number };

  GetBounds(theFirstPar?: number, theLastPar?: number): { returnValue: boolean; theFirstPar: number; theLastPar: number };

  Get(): Bnd_Range_Bounds | null | undefined;

  GetIntermediatePoint(theLambda: number, theParameter?: number): { returnValue: boolean; theParameter: number };

  Center(): number | null | undefined;

  Delta(): number;

  IsVoid(): boolean;

  SetVoid(): void;

  Enlarge(theDelta: number): void;

  Shifted(theVal: number): Bnd_Range;

  Shift(theVal: number): void;

  TrimFrom(theValLower: number): void;

  TrimTo(theValUpper: number): void;

  IsOut(theValue: number): boolean;
  IsOut(theRange: Bnd_Range): boolean;
  IsOut(theValue: number): boolean;
  IsOut(theRange: Bnd_Range): boolean;

  Contains(theValue: number): boolean;

  Intersects(theRange: Bnd_Range): boolean;

  Min(): number | null | undefined;

  Max(): number | null | undefined;

  delete(): void;

  [Symbol.dispose](): void;

Bnd_Range_IntersectStatus: typeof Bnd_Range_IntersectStatus[keyof typeof Bnd_Range_IntersectStatus]

Bnd_Sphere: declare class Bnd_Sphere

  constructor

  U(): number;

  V(): number;

  IsValid(): boolean;

  SetValid(isValid: boolean): void;

  Center(): gp_XYZ;

  Radius(): number;

  Distances(theXYZ: gp_XYZ, theMin?: number, theMax?: number): { theMin: number; theMax: number };

  SquareDistances(theXYZ: gp_XYZ, theMin?: number, theMax?: number): { theMin: number; theMax: number };

  Project(theNode: gp_XYZ, theProjNode: gp_XYZ, theDist?: number, theInside?: boolean): { returnValue: boolean; theDist: number; theInside: boolean };

  Distance(theNode: gp_XYZ): number;

  SquareDistance(theNode: gp_XYZ): number;

  Add(theOther: Bnd_Sphere): void;

  IsOut(theOther: Bnd_Sphere): boolean;
  IsOut(thePnt: gp_XYZ, theMaxDist?: number): { returnValue: boolean; theMaxDist: number };
  IsOut(theOther: Bnd_Sphere): boolean;
  IsOut(thePnt: gp_XYZ, theMaxDist?: number): { returnValue: boolean; theMaxDist: number };

  SquareExtent(): number;

  delete(): void;

  [Symbol.dispose](): void;

Bnd_Tools: declare class Bnd_Tools

  constructor

  static Bnd2BVH(theBox: Bnd_Box2d): any;
  static Bnd2BVH(theBox: Bnd_Box): any;
  static Bnd2BVH(theBox: Bnd_Box2d): any;
  static Bnd2BVH(theBox: Bnd_Box): any;

  delete(): void;

  [Symbol.dispose](): void;

Bnd_Box_Limits: interface Bnd_Box_Limits

  Xmin: number

  Xmax: number

  Ymin: number

  Ymax: number

  Zmin: number

  Zmax: number

Bnd_Box2d_Limits: interface Bnd_Box2d_Limits

  Xmin: number

  Xmax: number

  Ymin: number

  Ymax: number

Bnd_OBB_HalfSizes: interface Bnd_OBB_HalfSizes

  X: number

  Y: number

  Z: number

Bnd_Range_Bounds: interface Bnd_Range_Bounds

  Min: number

  Max: number

Bnd_Array1OfBox: NCollection_Array1_Bnd_Box

Bnd_HArray1OfBox: NCollection_HArray1_Bnd_Box
