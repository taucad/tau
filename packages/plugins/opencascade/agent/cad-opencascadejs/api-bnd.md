# libcascade — Bnd

14 top-level symbols. Signatures are verbatim typescript.

Bnd_BoundSortBox: declare class Bnd_BoundSortBox

  // Bnd_BoundSortBox.constructor (constructor)
  constructor();

  // Bnd_BoundSortBox.Initialize (method)
  Initialize(theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
  Initialize(theEnclosingBox: Bnd_Box, theNbBoxes: number): void;

  // Bnd_BoundSortBox.Add (method)
  Add(theBox: Bnd_Box, theIndex: number): void;

  // Bnd_BoundSortBox.Compare (method)
  Compare(theBox: Bnd_Box): NCollection_List_int;
  Compare(thePlane: gp_Pln): NCollection_List_int;

  // Bnd_BoundSortBox.delete (method)
  delete(): void;

  // Bnd_BoundSortBox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bnd_Box: declare class Bnd_Box

  // Bnd_Box.constructor (constructor)
  constructor();
  constructor(theMin: gp_Pnt, theMax: gp_Pnt);

  // Bnd_Box.SetWhole (method)
  SetWhole(): void;

  // Bnd_Box.SetVoid (method)
  SetVoid(): void;

  // Bnd_Box.Set (method)
  Set(P: gp_Pnt): void;
  Set(P: gp_Pnt, D: gp_Dir): void;

  // Bnd_Box.Update (method)
  Update(aXmin: number, aYmin: number, aZmin: number, aXmax: number, aYmax: number, aZmax: number): void;
  Update(X: number, Y: number, Z: number): void;

  // Bnd_Box.SetGap (method)
  SetGap(Tol: number): void;

  // Bnd_Box.Enlarge (method)
  Enlarge(Tol: number): void;

  // Bnd_Box.GetXMin (method)
  GetXMin(): number;

  // Bnd_Box.GetXMax (method)
  GetXMax(): number;

  // Bnd_Box.GetYMin (method)
  GetYMin(): number;

  // Bnd_Box.GetYMax (method)
  GetYMax(): number;

  // Bnd_Box.GetZMin (method)
  GetZMin(): number;

  // Bnd_Box.GetZMax (method)
  GetZMax(): number;

  // Bnd_Box.CornerMin (method)
  CornerMin(): gp_Pnt;

  // Bnd_Box.CornerMax (method)
  CornerMax(): gp_Pnt;

  // Bnd_Box.Center (method)
  Center(): gp_Pnt | null | undefined;

  // Bnd_Box.OpenXmin (method)
  OpenXmin(): void;

  // Bnd_Box.OpenXmax (method)
  OpenXmax(): void;

  // Bnd_Box.OpenYmin (method)
  OpenYmin(): void;

  // Bnd_Box.OpenYmax (method)
  OpenYmax(): void;

  // Bnd_Box.OpenZmin (method)
  OpenZmin(): void;

  // Bnd_Box.OpenZmax (method)
  OpenZmax(): void;

  // Bnd_Box.IsOpen (method)
  IsOpen(): boolean;

  // Bnd_Box.IsOpenXmin (method)
  IsOpenXmin(): boolean;

  // Bnd_Box.IsOpenXmax (method)
  IsOpenXmax(): boolean;

  // Bnd_Box.IsOpenYmin (method)
  IsOpenYmin(): boolean;

  // Bnd_Box.IsOpenYmax (method)
  IsOpenYmax(): boolean;

  // Bnd_Box.IsOpenZmin (method)
  IsOpenZmin(): boolean;

  // Bnd_Box.IsOpenZmax (method)
  IsOpenZmax(): boolean;

  // Bnd_Box.IsWhole (method)
  IsWhole(): boolean;

  // Bnd_Box.IsVoid (method)
  IsVoid(): boolean;

  // Bnd_Box.IsXThin (method)
  IsXThin(tol: number): boolean;

  // Bnd_Box.IsYThin (method)
  IsYThin(tol: number): boolean;

  // Bnd_Box.IsZThin (method)
  IsZThin(tol: number): boolean;

  // Bnd_Box.IsThin (method)
  IsThin(tol: number): boolean;

  // Bnd_Box.Transformed (method)
  Transformed(T: gp_Trsf): Bnd_Box;

  // Bnd_Box.Add (method)
  Add(Other: Bnd_Box): void;
  Add(P: gp_Pnt): void;
  Add(D: gp_Dir): void;
  Add(P: gp_Pnt, D: gp_Dir): void;

  // Bnd_Box.IsOut (method)
  IsOut(P: gp_Pnt): boolean;
  IsOut(L: gp_Lin): boolean;
  IsOut(P: gp_Pln): boolean;
  IsOut(Other: Bnd_Box): boolean;
  IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
  IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
  IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;

  // Bnd_Box.Contains (method)
  Contains(theP: gp_Pnt): boolean;

  // Bnd_Box.Intersects (method)
  Intersects(theOther: Bnd_Box): boolean;

  // Bnd_Box.Distance (method)
  Distance(Other: Bnd_Box): number;

  // Bnd_Box.Dump (method)
  Dump(): void;

  // Bnd_Box.SquareExtent (method)
  SquareExtent(): number;

  // Bnd_Box.FinitePart (method)
  FinitePart(): Bnd_Box;

  // Bnd_Box.HasFinitePart (method)
  HasFinitePart(): boolean;

  // Bnd_Box.delete (method)
  delete(): void;

  // Bnd_Box.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bnd_Box2d: declare class Bnd_Box2d

  // Bnd_Box2d.constructor (constructor)
  constructor();

  // Bnd_Box2d.SetWhole (method)
  SetWhole(): void;

  // Bnd_Box2d.SetVoid (method)
  SetVoid(): void;

  // Bnd_Box2d.Set (method)
  Set(thePnt: gp_Pnt2d): void;
  Set(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;

  // Bnd_Box2d.Update (method)
  Update(aXmin: number, aYmin: number, aXmax: number, aYmax: number): void;
  Update(X: number, Y: number): void;

  // Bnd_Box2d.SetGap (method)
  SetGap(Tol: number): void;

  // Bnd_Box2d.Enlarge (method)
  Enlarge(theTol: number): void;

  // Bnd_Box2d.GetXMin (method)
  GetXMin(): number;

  // Bnd_Box2d.GetXMax (method)
  GetXMax(): number;

  // Bnd_Box2d.GetYMin (method)
  GetYMin(): number;

  // Bnd_Box2d.GetYMax (method)
  GetYMax(): number;

  // Bnd_Box2d.Center (method)
  Center(): gp_Pnt2d | null | undefined;

  // Bnd_Box2d.OpenXmin (method)
  OpenXmin(): void;

  // Bnd_Box2d.OpenXmax (method)
  OpenXmax(): void;

  // Bnd_Box2d.OpenYmin (method)
  OpenYmin(): void;

  // Bnd_Box2d.OpenYmax (method)
  OpenYmax(): void;

  // Bnd_Box2d.IsOpenXmin (method)
  IsOpenXmin(): boolean;

  // Bnd_Box2d.IsOpenXmax (method)
  IsOpenXmax(): boolean;

  // Bnd_Box2d.IsOpenYmin (method)
  IsOpenYmin(): boolean;

  // Bnd_Box2d.IsOpenYmax (method)
  IsOpenYmax(): boolean;

  // Bnd_Box2d.IsWhole (method)
  IsWhole(): boolean;

  // Bnd_Box2d.IsVoid (method)
  IsVoid(): boolean;

  // Bnd_Box2d.Transformed (method)
  Transformed(T: gp_Trsf2d): Bnd_Box2d;

  // Bnd_Box2d.Add (method)
  Add(Other: Bnd_Box2d): void;
  Add(thePnt: gp_Pnt2d): void;
  Add(D: gp_Dir2d): void;
  Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;

  // Bnd_Box2d.IsOut (method)
  IsOut(P: gp_Pnt2d): boolean;
  IsOut(theL: gp_Lin2d): boolean;
  IsOut(Other: Bnd_Box2d): boolean;
  IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
  IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
  IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;

  // Bnd_Box2d.Contains (method)
  Contains(theP: gp_Pnt2d): boolean;

  // Bnd_Box2d.Intersects (method)
  Intersects(theOther: Bnd_Box2d): boolean;

  // Bnd_Box2d.Distance (method)
  Distance(theOther: Bnd_Box2d): number;

  // Bnd_Box2d.Dump (method)
  Dump(): void;

  // Bnd_Box2d.SquareExtent (method)
  SquareExtent(): number;

  // Bnd_Box2d.delete (method)
  delete(): void;

  // Bnd_Box2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bnd_OBB: declare class Bnd_OBB

  // Bnd_OBB.constructor (constructor)
  constructor();
  constructor(theBox: Bnd_Box);
  constructor(theCenter: gp_Pnt, theXDirection: gp_Dir, theYDirection: gp_Dir, theZDirection: gp_Dir, theHXSize: number, theHYSize: number, theHZSize: number);

  // Bnd_OBB.ReBuild (method)
  ReBuild(theListOfPoints: NCollection_Array1_gp_Pnt, theListOfTolerances?: NCollection_Array1_double, theIsOptimal?: boolean): void;

  // Bnd_OBB.SetCenter (method)
  SetCenter(theCenter: gp_Pnt): void;

  // Bnd_OBB.SetXComponent (method)
  SetXComponent(theXDirection: gp_Dir, theHXSize: number): void;

  // Bnd_OBB.SetYComponent (method)
  SetYComponent(theYDirection: gp_Dir, theHYSize: number): void;

  // Bnd_OBB.SetZComponent (method)
  SetZComponent(theZDirection: gp_Dir, theHZSize: number): void;

  // Bnd_OBB.Position (method)
  Position(): gp_Ax3;

  // Bnd_OBB.Center (method)
  Center(): gp_XYZ;

  // Bnd_OBB.XDirection (method)
  XDirection(): gp_XYZ;

  // Bnd_OBB.YDirection (method)
  YDirection(): gp_XYZ;

  // Bnd_OBB.ZDirection (method)
  ZDirection(): gp_XYZ;

  // Bnd_OBB.XHSize (method)
  XHSize(): number;

  // Bnd_OBB.YHSize (method)
  YHSize(): number;

  // Bnd_OBB.ZHSize (method)
  ZHSize(): number;

  // Bnd_OBB.GetHalfSizes (method)
  GetHalfSizes(): Bnd_OBB_HalfSizes;

  // Bnd_OBB.IsVoid (method)
  IsVoid(): boolean;

  // Bnd_OBB.SetVoid (method)
  SetVoid(): void;

  // Bnd_OBB.SetAABox (method)
  SetAABox(theFlag: boolean): void;

  // Bnd_OBB.IsAABox (method)
  IsAABox(): boolean;

  // Bnd_OBB.Enlarge (method)
  Enlarge(theGapAdd: number): void;

  // Bnd_OBB.GetVertex (method)
  GetVertex(theP: [gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt]): boolean;

  // Bnd_OBB.SquareExtent (method)
  SquareExtent(): number;

  // Bnd_OBB.IsOut (method)
  IsOut(theOther: Bnd_OBB): boolean;
  IsOut(theP: gp_Pnt): boolean;

  // Bnd_OBB.Contains (method)
  Contains(theP: gp_Pnt): boolean;

  // Bnd_OBB.Intersects (method)
  Intersects(theOther: Bnd_OBB): boolean;

  // Bnd_OBB.IsCompletelyInside (method)
  IsCompletelyInside(theOther: Bnd_OBB): boolean;

  // Bnd_OBB.Add (method)
  Add(theOther: Bnd_OBB): void;
  Add(theP: gp_Pnt): void;

  // Bnd_OBB.delete (method)
  delete(): void;

  // Bnd_OBB.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bnd_Range: declare class Bnd_Range

  // Bnd_Range.constructor (constructor)
  constructor();
  constructor(theMin: number, theMax: number);

  // Bnd_Range.Common (method)
  Common(theOther: Bnd_Range): void;

  // Bnd_Range.Union (method)
  Union(theOther: Bnd_Range): boolean;

  // Bnd_Range.Split (method)
  Split(theVal: number, theList: NCollection_List_Bnd_Range, thePeriod: number): void;

  // Bnd_Range.IsIntersected (method)
  IsIntersected(theVal: number, thePeriod?: number): Bnd_Range_IntersectStatus;

  // Bnd_Range.Add (method)
  Add(theParameter: number): void;
  Add(theRange: Bnd_Range): void;

  // Bnd_Range.GetMin (method)
  GetMin(thePar?: number): { returnValue: boolean; thePar: number };

  // Bnd_Range.GetMax (method)
  GetMax(thePar?: number): { returnValue: boolean; thePar: number };

  // Bnd_Range.GetBounds (method)
  GetBounds(theFirstPar?: number, theLastPar?: number): { returnValue: boolean; theFirstPar: number; theLastPar: number };

  // Bnd_Range.Get (method)
  Get(): Bnd_Range_Bounds | null | undefined;

  // Bnd_Range.GetIntermediatePoint (method)
  GetIntermediatePoint(theLambda: number, theParameter?: number): { returnValue: boolean; theParameter: number };

  // Bnd_Range.Center (method)
  Center(): number | null | undefined;

  // Bnd_Range.Delta (method)
  Delta(): number;

  // Bnd_Range.IsVoid (method)
  IsVoid(): boolean;

  // Bnd_Range.SetVoid (method)
  SetVoid(): void;

  // Bnd_Range.Enlarge (method)
  Enlarge(theDelta: number): void;

  // Bnd_Range.Shifted (method)
  Shifted(theVal: number): Bnd_Range;

  // Bnd_Range.Shift (method)
  Shift(theVal: number): void;

  // Bnd_Range.TrimFrom (method)
  TrimFrom(theValLower: number): void;

  // Bnd_Range.TrimTo (method)
  TrimTo(theValUpper: number): void;

  // Bnd_Range.IsOut (method)
  IsOut(theValue: number): boolean;
  IsOut(theRange: Bnd_Range): boolean;

  // Bnd_Range.Contains (method)
  Contains(theValue: number): boolean;

  // Bnd_Range.Intersects (method)
  Intersects(theRange: Bnd_Range): boolean;

  // Bnd_Range.Min (method)
  Min(): number | null | undefined;

  // Bnd_Range.Max (method)
  Max(): number | null | undefined;

  // Bnd_Range.delete (method)
  delete(): void;

  // Bnd_Range.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bnd_Range_IntersectStatus: typeof Bnd_Range_IntersectStatus[keyof typeof Bnd_Range_IntersectStatus]

  readonly IntersectStatus_Out: 'IntersectStatus_Out'

  readonly IntersectStatus_In: 'IntersectStatus_In'

  readonly IntersectStatus_Boundary: 'IntersectStatus_Boundary'

Bnd_Sphere: declare class Bnd_Sphere

  // Bnd_Sphere.constructor (constructor)
  constructor();
  constructor(theCntr: gp_XYZ, theRad: number, theU: number, theV: number);

  // Bnd_Sphere.U (method)
  U(): number;

  // Bnd_Sphere.V (method)
  V(): number;

  // Bnd_Sphere.IsValid (method)
  IsValid(): boolean;

  // Bnd_Sphere.SetValid (method)
  SetValid(isValid: boolean): void;

  // Bnd_Sphere.Center (method)
  Center(): gp_XYZ;

  // Bnd_Sphere.Radius (method)
  Radius(): number;

  // Bnd_Sphere.Distances (method)
  Distances(theXYZ: gp_XYZ, theMin?: number, theMax?: number): { theMin: number; theMax: number };

  // Bnd_Sphere.SquareDistances (method)
  SquareDistances(theXYZ: gp_XYZ, theMin?: number, theMax?: number): { theMin: number; theMax: number };

  // Bnd_Sphere.Project (method)
  Project(theNode: gp_XYZ, theProjNode: gp_XYZ, theDist?: number, theInside?: boolean): { returnValue: boolean; theDist: number; theInside: boolean };

  // Bnd_Sphere.Distance (method)
  Distance(theNode: gp_XYZ): number;

  // Bnd_Sphere.SquareDistance (method)
  SquareDistance(theNode: gp_XYZ): number;

  // Bnd_Sphere.Add (method)
  Add(theOther: Bnd_Sphere): void;

  // Bnd_Sphere.IsOut (method)
  IsOut(theOther: Bnd_Sphere): boolean;
  IsOut(thePnt: gp_XYZ, theMaxDist?: number): { returnValue: boolean; theMaxDist: number };

  // Bnd_Sphere.SquareExtent (method)
  SquareExtent(): number;

  // Bnd_Sphere.delete (method)
  delete(): void;

  // Bnd_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

Bnd_Tools: declare class Bnd_Tools

  // Bnd_Tools.constructor (constructor)
  constructor();

  // Bnd_Tools.Bnd2BVH (method)
  static Bnd2BVH(theBox: Bnd_Box2d): any;
  static Bnd2BVH(theBox: Bnd_Box): any;

  // Bnd_Tools.delete (method)
  delete(): void;

  // Bnd_Tools.[Symbol.dispose] (method)
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
