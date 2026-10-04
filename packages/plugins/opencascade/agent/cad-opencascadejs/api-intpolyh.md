# libcascade — IntPolyh

17 top-level symbols. Signatures are verbatim typescript.

IntPolyh_PointNormal: declare class IntPolyh_PointNormal

  // IntPolyh_PointNormal.constructor (constructor)
  constructor();

  Point: gp_Pnt

  Normal: gp_Vec

  // IntPolyh_PointNormal.delete (method)
  delete(): void;

  // IntPolyh_PointNormal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Couple: declare class IntPolyh_Couple

  // IntPolyh_Couple.constructor (constructor)
  constructor();
  constructor(theTriangle1: number, theTriangle2: number, theAngle?: number);

  // IntPolyh_Couple.FirstValue (method)
  FirstValue(): number;

  // IntPolyh_Couple.SecondValue (method)
  SecondValue(): number;

  // IntPolyh_Couple.IsAnalyzed (method)
  IsAnalyzed(): boolean;

  // IntPolyh_Couple.Angle (method)
  Angle(): number;

  // IntPolyh_Couple.SetCoupleValue (method)
  SetCoupleValue(theInd1: number, theInd2: number): void;

  // IntPolyh_Couple.SetAnalyzed (method)
  SetAnalyzed(theAnalyzed: boolean): void;

  // IntPolyh_Couple.SetAngle (method)
  SetAngle(theAngle: number): void;

  // IntPolyh_Couple.IsEqual (method)
  IsEqual(theOther: IntPolyh_Couple): boolean;

  // IntPolyh_Couple.Dump (method)
  Dump(v: number): void;

  // IntPolyh_Couple.delete (method)
  delete(): void;

  // IntPolyh_Couple.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Edge: declare class IntPolyh_Edge

  // IntPolyh_Edge.constructor (constructor)
  constructor();
  constructor(thePoint1: number, thePoint2: number, theTriangle1: number, theTriangle2: number);

  // IntPolyh_Edge.FirstPoint (method)
  FirstPoint(): number;

  // IntPolyh_Edge.SecondPoint (method)
  SecondPoint(): number;

  // IntPolyh_Edge.FirstTriangle (method)
  FirstTriangle(): number;

  // IntPolyh_Edge.SecondTriangle (method)
  SecondTriangle(): number;

  // IntPolyh_Edge.SetFirstPoint (method)
  SetFirstPoint(thePoint: number): void;

  // IntPolyh_Edge.SetSecondPoint (method)
  SetSecondPoint(thePoint: number): void;

  // IntPolyh_Edge.SetFirstTriangle (method)
  SetFirstTriangle(theTriangle: number): void;

  // IntPolyh_Edge.SetSecondTriangle (method)
  SetSecondTriangle(theTriangle: number): void;

  // IntPolyh_Edge.Dump (method)
  Dump(v: number): void;

  // IntPolyh_Edge.delete (method)
  delete(): void;

  // IntPolyh_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Intersection: declare class IntPolyh_Intersection

  // IntPolyh_Intersection.constructor (constructor)
  constructor(theS1: Adaptor3d_Surface, theS2: Adaptor3d_Surface);
  constructor(theS1: Adaptor3d_Surface, theNbSU1: number, theNbSV1: number, theS2: Adaptor3d_Surface, theNbSU2: number, theNbSV2: number);
  constructor(theS1: Adaptor3d_Surface, theUPars1: NCollection_Array1_double, theVPars1: NCollection_Array1_double, theS2: Adaptor3d_Surface, theUPars2: NCollection_Array1_double, theVPars2: NCollection_Array1_double);

  // IntPolyh_Intersection.IsDone (method)
  IsDone(): boolean;

  // IntPolyh_Intersection.IsParallel (method)
  IsParallel(): boolean;

  // IntPolyh_Intersection.NbSectionLines (method)
  NbSectionLines(): number;

  // IntPolyh_Intersection.NbPointsInLine (method)
  NbPointsInLine(IndexLine: number): number;

  // IntPolyh_Intersection.NbTangentZones (method)
  NbTangentZones(): number;

  // IntPolyh_Intersection.NbPointsInTangentZone (method)
  NbPointsInTangentZone(argNo0: number): number;

  // IntPolyh_Intersection.GetLinePoint (method)
  GetLinePoint(IndexLine: number, IndexPoint: number, x?: number, y?: number, z?: number, u1?: number, v1?: number, u2?: number, v2?: number, incidence?: number): { x: number; y: number; z: number; u1: number; v1: number; u2: number; v2: number; incidence: number };

  // IntPolyh_Intersection.GetTangentZonePoint (method)
  GetTangentZonePoint(IndexLine: number, IndexPoint: number, x?: number, y?: number, z?: number, u1?: number, v1?: number, u2?: number, v2?: number): { x: number; y: number; z: number; u1: number; v1: number; u2: number; v2: number };

  // IntPolyh_Intersection.delete (method)
  delete(): void;

  // IntPolyh_Intersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Point: declare class IntPolyh_Point

  // IntPolyh_Point.constructor (constructor)
  constructor();
  constructor(x: number, y: number, z: number, u: number, v: number);

  // IntPolyh_Point.X (method)
  X(): number;

  // IntPolyh_Point.Y (method)
  Y(): number;

  // IntPolyh_Point.Z (method)
  Z(): number;

  // IntPolyh_Point.U (method)
  U(): number;

  // IntPolyh_Point.V (method)
  V(): number;

  // IntPolyh_Point.PartOfCommon (method)
  PartOfCommon(): number;

  // IntPolyh_Point.Set (method)
  Set(x: number, y: number, z: number, u: number, v: number, II?: number): void;

  // IntPolyh_Point.SetX (method)
  SetX(x: number): void;

  // IntPolyh_Point.SetY (method)
  SetY(y: number): void;

  // IntPolyh_Point.SetZ (method)
  SetZ(z: number): void;

  // IntPolyh_Point.SetU (method)
  SetU(u: number): void;

  // IntPolyh_Point.SetV (method)
  SetV(v: number): void;

  // IntPolyh_Point.SetPartOfCommon (method)
  SetPartOfCommon(ii: number): void;

  // IntPolyh_Point.Middle (method)
  Middle(MySurface: Adaptor3d_Surface, P1: IntPolyh_Point, P2: IntPolyh_Point): void;

  // IntPolyh_Point.Add (method)
  Add(P1: IntPolyh_Point): IntPolyh_Point;

  // IntPolyh_Point.Sub (method)
  Sub(P1: IntPolyh_Point): IntPolyh_Point;

  // IntPolyh_Point.Divide (method)
  Divide(rr: number): IntPolyh_Point;

  // IntPolyh_Point.Multiplication (method)
  Multiplication(rr: number): IntPolyh_Point;

  // IntPolyh_Point.SquareModulus (method)
  SquareModulus(): number;

  // IntPolyh_Point.SquareDistance (method)
  SquareDistance(P2: IntPolyh_Point): number;

  // IntPolyh_Point.Dot (method)
  Dot(P2: IntPolyh_Point): number;

  // IntPolyh_Point.Cross (method)
  Cross(P1: IntPolyh_Point, P2: IntPolyh_Point): void;

  // IntPolyh_Point.Dump (method)
  Dump(): void;
  Dump(i: number): void;

  // IntPolyh_Point.SetDegenerated (method)
  SetDegenerated(theFlag: boolean): void;

  // IntPolyh_Point.Degenerated (method)
  Degenerated(): boolean;

  // IntPolyh_Point.delete (method)
  delete(): void;

  // IntPolyh_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_SectionLine: declare class IntPolyh_SectionLine

  // IntPolyh_SectionLine.constructor (constructor)
  constructor();
  constructor(nn: number);
  constructor(theOther: IntPolyh_SectionLine);

  // IntPolyh_SectionLine.Init (method)
  Init(nn: number): void;

  // IntPolyh_SectionLine.Value (method)
  Value(nn: number): IntPolyh_StartPoint;

  // IntPolyh_SectionLine.ChangeValue (method)
  ChangeValue(nn: number): IntPolyh_StartPoint;

  // IntPolyh_SectionLine.Copy (method)
  Copy(Other: IntPolyh_SectionLine): IntPolyh_SectionLine;

  // IntPolyh_SectionLine.GetN (method)
  GetN(): number;

  // IntPolyh_SectionLine.NbStartPoints (method)
  NbStartPoints(): number;

  // IntPolyh_SectionLine.IncrementNbStartPoints (method)
  IncrementNbStartPoints(): void;

  // IntPolyh_SectionLine.Destroy (method)
  Destroy(): void;

  // IntPolyh_SectionLine.Dump (method)
  Dump(): void;

  // IntPolyh_SectionLine.Prepend (method)
  Prepend(SP: IntPolyh_StartPoint): void;

  // IntPolyh_SectionLine.delete (method)
  delete(): void;

  // IntPolyh_SectionLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_StartPoint: declare class IntPolyh_StartPoint

  // IntPolyh_StartPoint.constructor (constructor)
  constructor();
  constructor(xx: number, yy: number, zz: number, uu1: number, vv1: number, uu2: number, vv2: number, T1: number, E1: number, LAM1: number, T2: number, E2: number, LAM2: number, List: number);

  // IntPolyh_StartPoint.X (method)
  X(): number;

  // IntPolyh_StartPoint.Y (method)
  Y(): number;

  // IntPolyh_StartPoint.Z (method)
  Z(): number;

  // IntPolyh_StartPoint.U1 (method)
  U1(): number;

  // IntPolyh_StartPoint.V1 (method)
  V1(): number;

  // IntPolyh_StartPoint.U2 (method)
  U2(): number;

  // IntPolyh_StartPoint.V2 (method)
  V2(): number;

  // IntPolyh_StartPoint.T1 (method)
  T1(): number;

  // IntPolyh_StartPoint.E1 (method)
  E1(): number;

  // IntPolyh_StartPoint.Lambda1 (method)
  Lambda1(): number;

  // IntPolyh_StartPoint.T2 (method)
  T2(): number;

  // IntPolyh_StartPoint.E2 (method)
  E2(): number;

  // IntPolyh_StartPoint.Lambda2 (method)
  Lambda2(): number;

  // IntPolyh_StartPoint.GetAngle (method)
  GetAngle(): number;

  // IntPolyh_StartPoint.ChainList (method)
  ChainList(): number;

  // IntPolyh_StartPoint.GetEdgePoints (method)
  GetEdgePoints(Triangle: IntPolyh_Triangle, FirstEdgePoint?: number, SecondEdgePoint?: number, LastPoint?: number): { returnValue: number; FirstEdgePoint: number; SecondEdgePoint: number; LastPoint: number };

  // IntPolyh_StartPoint.SetXYZ (method)
  SetXYZ(XX: number, YY: number, ZZ: number): void;

  // IntPolyh_StartPoint.SetUV1 (method)
  SetUV1(UU1: number, VV1: number): void;

  // IntPolyh_StartPoint.SetUV2 (method)
  SetUV2(UU2: number, VV2: number): void;

  // IntPolyh_StartPoint.SetEdge1 (method)
  SetEdge1(IE1: number): void;

  // IntPolyh_StartPoint.SetLambda1 (method)
  SetLambda1(LAM1: number): void;

  // IntPolyh_StartPoint.SetEdge2 (method)
  SetEdge2(IE2: number): void;

  // IntPolyh_StartPoint.SetLambda2 (method)
  SetLambda2(LAM2: number): void;

  // IntPolyh_StartPoint.SetCoupleValue (method)
  SetCoupleValue(IT1: number, IT2: number): void;

  // IntPolyh_StartPoint.SetAngle (method)
  SetAngle(ang: number): void;

  // IntPolyh_StartPoint.SetChainList (method)
  SetChainList(ChList: number): void;

  // IntPolyh_StartPoint.CheckSameSP (method)
  CheckSameSP(SP: IntPolyh_StartPoint): number;

  // IntPolyh_StartPoint.Dump (method)
  Dump(): void;
  Dump(i: number): void;

  // IntPolyh_StartPoint.delete (method)
  delete(): void;

  // IntPolyh_StartPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Tools: declare class IntPolyh_Tools

  // IntPolyh_Tools.constructor (constructor)
  constructor();

  // IntPolyh_Tools.IsEnlargePossible (method)
  static IsEnlargePossible(theSurf: Adaptor3d_Surface, theUEnlarge?: boolean, theVEnlarge?: boolean): { theUEnlarge: boolean; theVEnlarge: boolean };

  // IntPolyh_Tools.MakeSampling (method)
  static MakeSampling(theSurf: Adaptor3d_Surface, theNbSU: number, theNbSV: number, theEnlargeZone: boolean, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double): void;

  // IntPolyh_Tools.ComputeDeflection (method)
  static ComputeDeflection(theSurf: Adaptor3d_Surface, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double): number;

  // IntPolyh_Tools.FillArrayOfPointNormal (method)
  static FillArrayOfPointNormal(theSurf: Adaptor3d_Surface, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double, thePoints: IntPolyh_Array_IntPolyh_PointNormal): void;

  // IntPolyh_Tools.delete (method)
  delete(): void;

  // IntPolyh_Tools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Triangle: declare class IntPolyh_Triangle

  // IntPolyh_Triangle.constructor (constructor)
  constructor();
  constructor(thePoint1: number, thePoint2: number, thePoint3: number);

  // IntPolyh_Triangle.FirstPoint (method)
  FirstPoint(): number;

  // IntPolyh_Triangle.SecondPoint (method)
  SecondPoint(): number;

  // IntPolyh_Triangle.ThirdPoint (method)
  ThirdPoint(): number;

  // IntPolyh_Triangle.FirstEdge (method)
  FirstEdge(): number;

  // IntPolyh_Triangle.FirstEdgeOrientation (method)
  FirstEdgeOrientation(): number;

  // IntPolyh_Triangle.SecondEdge (method)
  SecondEdge(): number;

  // IntPolyh_Triangle.SecondEdgeOrientation (method)
  SecondEdgeOrientation(): number;

  // IntPolyh_Triangle.ThirdEdge (method)
  ThirdEdge(): number;

  // IntPolyh_Triangle.ThirdEdgeOrientation (method)
  ThirdEdgeOrientation(): number;

  // IntPolyh_Triangle.Deflection (method)
  Deflection(): number;

  // IntPolyh_Triangle.IsIntersectionPossible (method)
  IsIntersectionPossible(): boolean;

  // IntPolyh_Triangle.HasIntersection (method)
  HasIntersection(): boolean;

  // IntPolyh_Triangle.IsDegenerated (method)
  IsDegenerated(): boolean;

  // IntPolyh_Triangle.SetFirstPoint (method)
  SetFirstPoint(thePoint: number): void;

  // IntPolyh_Triangle.SetSecondPoint (method)
  SetSecondPoint(thePoint: number): void;

  // IntPolyh_Triangle.SetThirdPoint (method)
  SetThirdPoint(thePoint: number): void;

  // IntPolyh_Triangle.SetFirstEdge (method)
  SetFirstEdge(theEdge: number, theEdgeOrientation: number): void;

  // IntPolyh_Triangle.SetSecondEdge (method)
  SetSecondEdge(theEdge: number, theEdgeOrientation: number): void;

  // IntPolyh_Triangle.SetThirdEdge (method)
  SetThirdEdge(theEdge: number, theEdgeOrientation: number): void;

  // IntPolyh_Triangle.SetDeflection (method)
  SetDeflection(theDeflection: number): void;

  // IntPolyh_Triangle.SetIntersectionPossible (method)
  SetIntersectionPossible(theIP: boolean): void;

  // IntPolyh_Triangle.SetIntersection (method)
  SetIntersection(theInt: boolean): void;

  // IntPolyh_Triangle.SetDegenerated (method)
  SetDegenerated(theDegFlag: boolean): void;

  // IntPolyh_Triangle.GetEdgeNumber (method)
  GetEdgeNumber(theEdgeIndex: number): number;

  // IntPolyh_Triangle.SetEdge (method)
  SetEdge(theEdgeIndex: number, theEdgeNumber: number): void;

  // IntPolyh_Triangle.GetEdgeOrientation (method)
  GetEdgeOrientation(theEdgeIndex: number): number;

  // IntPolyh_Triangle.SetEdgeOrientation (method)
  SetEdgeOrientation(theEdgeIndex: number, theEdgeOrientation: number): void;

  // IntPolyh_Triangle.ComputeDeflection (method)
  ComputeDeflection(theSurface: Adaptor3d_Surface, thePoints: IntPolyh_Array_IntPolyh_Point): number;

  // IntPolyh_Triangle.GetNextTriangle (method)
  GetNextTriangle(theTriangle: number, theEdgeNum: number, TEdges: IntPolyh_Array_IntPolyh_Edge): number;

  // IntPolyh_Triangle.MiddleRefinement (method)
  MiddleRefinement(theTriangleNumber: number, theSurface: Adaptor3d_Surface, TPoints: IntPolyh_Array_IntPolyh_Point, TTriangles: IntPolyh_Array_IntPolyh_Triangle, TEdges: IntPolyh_Array_IntPolyh_Edge): void;

  // IntPolyh_Triangle.MultipleMiddleRefinement (method)
  MultipleMiddleRefinement(theRefineCriterion: number, theBox: Bnd_Box, theTriangleNumber: number, theSurface: Adaptor3d_Surface, TPoints: IntPolyh_Array_IntPolyh_Point, TTriangles: IntPolyh_Array_IntPolyh_Triangle, TEdges: IntPolyh_Array_IntPolyh_Edge): void;

  // IntPolyh_Triangle.LinkEdges2Triangle (method)
  LinkEdges2Triangle(TEdges: IntPolyh_Array_IntPolyh_Edge, theEdge1: number, theEdge2: number, theEdge3: number): void;

  // IntPolyh_Triangle.SetEdgeAndOrientation (method)
  SetEdgeAndOrientation(theEdge: IntPolyh_Edge, theEdgeIndex: number): void;

  // IntPolyh_Triangle.BoundingBox (method)
  BoundingBox(thePoints: IntPolyh_Array_IntPolyh_Point): Bnd_Box;

  // IntPolyh_Triangle.Dump (method)
  Dump(v: number): void;

  // IntPolyh_Triangle.delete (method)
  delete(): void;

  // IntPolyh_Triangle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_Edge: declare class IntPolyh_Array_IntPolyh_Edge

  // IntPolyh_Array_IntPolyh_Edge.constructor (constructor)
  constructor(aIncrement?: number);
  constructor(aN: number, aIncrement?: number);

  // IntPolyh_Array_IntPolyh_Edge.Copy (method)
  Copy(aOther: IntPolyh_Array_IntPolyh_Edge): IntPolyh_Array_IntPolyh_Edge;

  // IntPolyh_Array_IntPolyh_Edge.Init (method)
  Init(aN: number): void;

  // IntPolyh_Array_IntPolyh_Edge.IncrementNbItems (method)
  IncrementNbItems(): void;

  // IntPolyh_Array_IntPolyh_Edge.GetN (method)
  GetN(): number;

  // IntPolyh_Array_IntPolyh_Edge.NbItems (method)
  NbItems(): number;

  // IntPolyh_Array_IntPolyh_Edge.SetNbItems (method)
  SetNbItems(aNb: number): void;

  // IntPolyh_Array_IntPolyh_Edge.Value (method)
  Value(aIndex: number): IntPolyh_Edge;

  // IntPolyh_Array_IntPolyh_Edge.ChangeValue (method)
  ChangeValue(aIndex: number): IntPolyh_Edge;

  // IntPolyh_Array_IntPolyh_Edge.Dump (method)
  Dump(): void;

  // IntPolyh_Array_IntPolyh_Edge.delete (method)
  delete(): void;

  // IntPolyh_Array_IntPolyh_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_Point: declare class IntPolyh_Array_IntPolyh_Point

  // IntPolyh_Array_IntPolyh_Point.constructor (constructor)
  constructor(aIncrement?: number);
  constructor(aN: number, aIncrement?: number);

  // IntPolyh_Array_IntPolyh_Point.Copy (method)
  Copy(aOther: unknown): unknown;

  // IntPolyh_Array_IntPolyh_Point.Init (method)
  Init(aN: number): void;

  // IntPolyh_Array_IntPolyh_Point.IncrementNbItems (method)
  IncrementNbItems(): void;

  // IntPolyh_Array_IntPolyh_Point.GetN (method)
  GetN(): number;

  // IntPolyh_Array_IntPolyh_Point.NbItems (method)
  NbItems(): number;

  // IntPolyh_Array_IntPolyh_Point.SetNbItems (method)
  SetNbItems(aNb: number): void;

  // IntPolyh_Array_IntPolyh_Point.Value (method)
  Value(aIndex: number): IntPolyh_Point;

  // IntPolyh_Array_IntPolyh_Point.ChangeValue (method)
  ChangeValue(aIndex: number): IntPolyh_Point;

  // IntPolyh_Array_IntPolyh_Point.Dump (method)
  Dump(): void;

  // IntPolyh_Array_IntPolyh_Point.delete (method)
  delete(): void;

  // IntPolyh_Array_IntPolyh_Point.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_PointNormal: declare class IntPolyh_Array_IntPolyh_PointNormal

  // IntPolyh_Array_IntPolyh_PointNormal.constructor (constructor)
  constructor(aIncrement?: number);
  constructor(aN: number, aIncrement?: number);

  // IntPolyh_Array_IntPolyh_PointNormal.Copy (method)
  Copy(aOther: unknown): unknown;

  // IntPolyh_Array_IntPolyh_PointNormal.Init (method)
  Init(aN: number): void;

  // IntPolyh_Array_IntPolyh_PointNormal.IncrementNbItems (method)
  IncrementNbItems(): void;

  // IntPolyh_Array_IntPolyh_PointNormal.GetN (method)
  GetN(): number;

  // IntPolyh_Array_IntPolyh_PointNormal.NbItems (method)
  NbItems(): number;

  // IntPolyh_Array_IntPolyh_PointNormal.SetNbItems (method)
  SetNbItems(aNb: number): void;

  // IntPolyh_Array_IntPolyh_PointNormal.Value (method)
  Value(aIndex: number): IntPolyh_PointNormal;

  // IntPolyh_Array_IntPolyh_PointNormal.ChangeValue (method)
  ChangeValue(aIndex: number): IntPolyh_PointNormal;

  // IntPolyh_Array_IntPolyh_PointNormal.Dump (method)
  Dump(): void;

  // IntPolyh_Array_IntPolyh_PointNormal.delete (method)
  delete(): void;

  // IntPolyh_Array_IntPolyh_PointNormal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_Triangle: declare class IntPolyh_Array_IntPolyh_Triangle

  // IntPolyh_Array_IntPolyh_Triangle.constructor (constructor)
  constructor(aIncrement?: number);
  constructor(aN: number, aIncrement?: number);

  // IntPolyh_Array_IntPolyh_Triangle.Copy (method)
  Copy(aOther: IntPolyh_Array_IntPolyh_Triangle): IntPolyh_Array_IntPolyh_Triangle;

  // IntPolyh_Array_IntPolyh_Triangle.Init (method)
  Init(aN: number): void;

  // IntPolyh_Array_IntPolyh_Triangle.IncrementNbItems (method)
  IncrementNbItems(): void;

  // IntPolyh_Array_IntPolyh_Triangle.GetN (method)
  GetN(): number;

  // IntPolyh_Array_IntPolyh_Triangle.NbItems (method)
  NbItems(): number;

  // IntPolyh_Array_IntPolyh_Triangle.SetNbItems (method)
  SetNbItems(aNb: number): void;

  // IntPolyh_Array_IntPolyh_Triangle.Value (method)
  Value(aIndex: number): IntPolyh_Triangle;

  // IntPolyh_Array_IntPolyh_Triangle.ChangeValue (method)
  ChangeValue(aIndex: number): IntPolyh_Triangle;

  // IntPolyh_Array_IntPolyh_Triangle.Dump (method)
  Dump(): void;

  // IntPolyh_Array_IntPolyh_Triangle.delete (method)
  delete(): void;

  // IntPolyh_Array_IntPolyh_Triangle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IntPolyh_ArrayOfEdges: IntPolyh_Array_IntPolyh_Edge

IntPolyh_ArrayOfPointNormal: IntPolyh_Array_IntPolyh_PointNormal

IntPolyh_ArrayOfPoints: IntPolyh_Array_IntPolyh_Point

IntPolyh_ArrayOfTriangles: IntPolyh_Array_IntPolyh_Triangle
