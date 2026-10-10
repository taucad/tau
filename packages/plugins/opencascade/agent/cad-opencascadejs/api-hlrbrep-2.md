# libcascade — HLRBRep (2)

22 top-level symbols. Signatures are verbatim typescript.

HLRBRep_PolyHLRToShape: declare class HLRBRep_PolyHLRToShape

  // HLRBRep_PolyHLRToShape.constructor (constructor)
  constructor();

  // HLRBRep_PolyHLRToShape.Update (method)
  Update(A: HLRBRep_PolyAlgo): void;

  // HLRBRep_PolyHLRToShape.Show (method)
  Show(): void;

  // HLRBRep_PolyHLRToShape.Hide (method)
  Hide(): void;

  // HLRBRep_PolyHLRToShape.VCompound (method)
  VCompound(): TopoDS_Shape;
  VCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.Rg1LineVCompound (method)
  Rg1LineVCompound(): TopoDS_Shape;
  Rg1LineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.RgNLineVCompound (method)
  RgNLineVCompound(): TopoDS_Shape;
  RgNLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.OutLineVCompound (method)
  OutLineVCompound(): TopoDS_Shape;
  OutLineVCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.HCompound (method)
  HCompound(): TopoDS_Shape;
  HCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.Rg1LineHCompound (method)
  Rg1LineHCompound(): TopoDS_Shape;
  Rg1LineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.RgNLineHCompound (method)
  RgNLineHCompound(): TopoDS_Shape;
  RgNLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.OutLineHCompound (method)
  OutLineHCompound(): TopoDS_Shape;
  OutLineHCompound(S: TopoDS_Shape): TopoDS_Shape;

  // HLRBRep_PolyHLRToShape.delete (method)
  delete(): void;

  // HLRBRep_PolyHLRToShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_SLProps: declare class HLRBRep_SLProps

  // HLRBRep_SLProps.constructor (constructor)
  constructor(N: number, Resolution: number);
  constructor(S: unknown, N: number, Resolution: number);
  constructor(S: unknown, U: number, V: number, N: number, Resolution: number);

  // HLRBRep_SLProps.SetSurface (method)
  SetSurface(S: unknown): void;

  // HLRBRep_SLProps.SetParameters (method)
  SetParameters(U: number, V: number): void;

  // HLRBRep_SLProps.Value (method)
  Value(): gp_Pnt;

  // HLRBRep_SLProps.D1U (method)
  D1U(): gp_Vec;

  // HLRBRep_SLProps.D1V (method)
  D1V(): gp_Vec;

  // HLRBRep_SLProps.D2U (method)
  D2U(): gp_Vec;

  // HLRBRep_SLProps.D2V (method)
  D2V(): gp_Vec;

  // HLRBRep_SLProps.DUV (method)
  DUV(): gp_Vec;

  // HLRBRep_SLProps.IsTangentUDefined (method)
  IsTangentUDefined(): boolean;

  // HLRBRep_SLProps.TangentU (method)
  TangentU(D: gp_Dir): void;

  // HLRBRep_SLProps.IsTangentVDefined (method)
  IsTangentVDefined(): boolean;

  // HLRBRep_SLProps.TangentV (method)
  TangentV(D: gp_Dir): void;

  // HLRBRep_SLProps.IsNormalDefined (method)
  IsNormalDefined(): boolean;

  // HLRBRep_SLProps.Normal (method)
  Normal(): gp_Dir;

  // HLRBRep_SLProps.IsCurvatureDefined (method)
  IsCurvatureDefined(): boolean;

  // HLRBRep_SLProps.IsUmbilic (method)
  IsUmbilic(): boolean;

  // HLRBRep_SLProps.MaxCurvature (method)
  MaxCurvature(): number;

  // HLRBRep_SLProps.MinCurvature (method)
  MinCurvature(): number;

  // HLRBRep_SLProps.CurvatureDirections (method)
  CurvatureDirections(MaxD: gp_Dir, MinD: gp_Dir): void;

  // HLRBRep_SLProps.MeanCurvature (method)
  MeanCurvature(): number;

  // HLRBRep_SLProps.GaussianCurvature (method)
  GaussianCurvature(): number;

  // HLRBRep_SLProps.delete (method)
  delete(): void;

  // HLRBRep_SLProps.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_SLPropsATool: declare class HLRBRep_SLPropsATool

  // HLRBRep_SLPropsATool.constructor (constructor)
  constructor();

  // HLRBRep_SLPropsATool.delete (method)
  delete(): void;

  // HLRBRep_SLPropsATool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_ShapeBounds: declare class HLRBRep_ShapeBounds

  // HLRBRep_ShapeBounds.constructor (constructor)
  constructor();
  constructor(S: HLRTopoBRep_OutLiner, nbIso: number, V1: number, V2: number, E1: number, E2: number, F1: number, F2: number);
  constructor(S: HLRTopoBRep_OutLiner, SData: Standard_Transient, nbIso: number, V1: number, V2: number, E1: number, E2: number, F1: number, F2: number);

  // HLRBRep_ShapeBounds.Translate (method)
  Translate(NV: number, NE: number, NF: number): void;

  // HLRBRep_ShapeBounds.Shape (method)
  Shape(S: HLRTopoBRep_OutLiner): void;
  Shape(): HLRTopoBRep_OutLiner;

  // HLRBRep_ShapeBounds.ShapeData (method)
  ShapeData(SD: Standard_Transient): void;
  ShapeData(): Standard_Transient;

  // HLRBRep_ShapeBounds.NbOfIso (method)
  NbOfIso(nbIso: number): void;
  NbOfIso(): number;

  // HLRBRep_ShapeBounds.Sizes (method)
  Sizes(NV?: number, NE?: number, NF?: number): { NV: number; NE: number; NF: number };

  // HLRBRep_ShapeBounds.Bounds (method)
  Bounds(V1?: number, V2?: number, E1?: number, E2?: number, F1?: number, F2?: number): { V1: number; V2: number; E1: number; E2: number; F1: number; F2: number };

  // HLRBRep_ShapeBounds.UpdateMinMax (method)
  UpdateMinMax(theTotMinMax: HLRAlgo_EdgesBlock_MinMaxIndices): void;

  // HLRBRep_ShapeBounds.MinMax (method)
  MinMax(): HLRAlgo_EdgesBlock_MinMaxIndices;

  // HLRBRep_ShapeBounds.delete (method)
  delete(): void;

  // HLRBRep_ShapeBounds.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_ShapeToHLR: declare class HLRBRep_ShapeToHLR

  // HLRBRep_ShapeToHLR.constructor (constructor)
  constructor();

  // HLRBRep_ShapeToHLR.delete (method)
  delete(): void;

  // HLRBRep_ShapeToHLR.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_SurfaceTool: declare class HLRBRep_SurfaceTool

  // HLRBRep_SurfaceTool.constructor (constructor)
  constructor();

  // HLRBRep_SurfaceTool.delete (method)
  delete(): void;

  // HLRBRep_SurfaceTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter extends math_FunctionSetWithDerivatives

  // HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter.NbVariables (method)
  NbVariables(): number;

  // HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter.NbEquations (method)
  NbEquations(): number;

  // HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter.Value (method)
  Value(X: math_VectorBase_double, F: math_VectorBase_double): boolean;

  // HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter.Derivatives (method)
  Derivatives(X: math_VectorBase_double, D: math_Matrix): boolean;

  // HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter.Values (method)
  Values(X: math_VectorBase_double, F: math_VectorBase_double, D: math_Matrix): boolean;

  // HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_TheDistBetweenPCurvesOfTheIntPCurvePCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheExactInterCSurf: declare class HLRBRep_TheExactInterCSurf

  // HLRBRep_TheExactInterCSurf.Perform (method)
  Perform(U: number, V: number, W: number, Rsnld: math_FunctionSetRoot, u0: number, v0: number, u1: number, v1: number, w0: number, w1: number): void;

  // HLRBRep_TheExactInterCSurf.IsDone (method)
  IsDone(): boolean;

  // HLRBRep_TheExactInterCSurf.IsEmpty (method)
  IsEmpty(): boolean;

  // HLRBRep_TheExactInterCSurf.Point (method)
  Point(): gp_Pnt;

  // HLRBRep_TheExactInterCSurf.ParameterOnCurve (method)
  ParameterOnCurve(): number;

  // HLRBRep_TheExactInterCSurf.ParameterOnSurface (method)
  ParameterOnSurface(U?: number, V?: number): { U: number; V: number };

  // HLRBRep_TheExactInterCSurf.delete (method)
  delete(): void;

  // HLRBRep_TheExactInterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheIntConicCurveOfCInter: declare class HLRBRep_TheIntConicCurveOfCInter extends IntRes2d_Intersection

  // HLRBRep_TheIntConicCurveOfCInter.constructor (constructor)
  constructor();

  // HLRBRep_TheIntConicCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_TheIntConicCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheIntPCurvePCurveOfCInter: declare class HLRBRep_TheIntPCurvePCurveOfCInter extends IntRes2d_Intersection

  // HLRBRep_TheIntPCurvePCurveOfCInter.constructor (constructor)
  constructor();

  // HLRBRep_TheIntPCurvePCurveOfCInter.SetMinNbSamples (method)
  SetMinNbSamples(theMinNbSamples: number): void;

  // HLRBRep_TheIntPCurvePCurveOfCInter.GetMinNbSamples (method)
  GetMinNbSamples(): number;

  // HLRBRep_TheIntPCurvePCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_TheIntPCurvePCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheInterferenceOfInterCSurf: declare class HLRBRep_TheInterferenceOfInterCSurf extends Intf_Interference

  // HLRBRep_TheInterferenceOfInterCSurf.constructor (constructor)
  constructor();

  // HLRBRep_TheInterferenceOfInterCSurf.delete (method)
  delete(): void;

  // HLRBRep_TheInterferenceOfInterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter: declare class HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter extends IntRes2d_Intersection

  // HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter.constructor (constructor)
  constructor();

  // HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_TheIntersectorOfTheIntConicCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter: declare class HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter extends Intf_Polygon2d

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.DeflectionOverEstimation (method)
  DeflectionOverEstimation(): number;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.SetDeflectionOverEstimation (method)
  SetDeflectionOverEstimation(x: number): void;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.Closed (method)
  Closed(clos: boolean): void;
  Closed(): boolean;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.NbSegments (method)
  NbSegments(): number;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.Segment (method)
  Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.InfParameter (method)
  InfParameter(): number;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.SupParameter (method)
  SupParameter(): number;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.AutoIntersectionIsPossible (method)
  AutoIntersectionIsPossible(): boolean;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.ApproxParamOnCurve (method)
  ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.CalculRegion (method)
  CalculRegion(x: number, y: number, x1: number, x2: number, y1: number, y2: number): number;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.Dump (method)
  Dump(): void;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.delete (method)
  delete(): void;

  // HLRBRep_ThePolygon2dOfTheIntPCurvePCurveOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_ThePolygonOfInterCSurf: declare class HLRBRep_ThePolygonOfInterCSurf

  // HLRBRep_ThePolygonOfInterCSurf.constructor (constructor)
  constructor(Curve: gp_Lin, NbPnt: number);
  constructor(Curve: gp_Lin, Upars: NCollection_Array1_double);
  constructor(Curve: gp_Lin, U1: number, U2: number, NbPnt: number);

  // HLRBRep_ThePolygonOfInterCSurf.Bounding (method)
  Bounding(): Bnd_Box;

  // HLRBRep_ThePolygonOfInterCSurf.DeflectionOverEstimation (method)
  DeflectionOverEstimation(): number;

  // HLRBRep_ThePolygonOfInterCSurf.SetDeflectionOverEstimation (method)
  SetDeflectionOverEstimation(x: number): void;

  // HLRBRep_ThePolygonOfInterCSurf.Closed (method)
  Closed(flag: boolean): void;
  Closed(): boolean;

  // HLRBRep_ThePolygonOfInterCSurf.NbSegments (method)
  NbSegments(): number;

  // HLRBRep_ThePolygonOfInterCSurf.BeginOfSeg (method)
  BeginOfSeg(theIndex: number): gp_Pnt;

  // HLRBRep_ThePolygonOfInterCSurf.EndOfSeg (method)
  EndOfSeg(theIndex: number): gp_Pnt;

  // HLRBRep_ThePolygonOfInterCSurf.InfParameter (method)
  InfParameter(): number;

  // HLRBRep_ThePolygonOfInterCSurf.SupParameter (method)
  SupParameter(): number;

  // HLRBRep_ThePolygonOfInterCSurf.ApproxParamOnCurve (method)
  ApproxParamOnCurve(Index: number, ParamOnLine: number): number;

  // HLRBRep_ThePolygonOfInterCSurf.Dump (method)
  Dump(): void;

  // HLRBRep_ThePolygonOfInterCSurf.delete (method)
  delete(): void;

  // HLRBRep_ThePolygonOfInterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_ThePolygonToolOfInterCSurf: declare class HLRBRep_ThePolygonToolOfInterCSurf

  // HLRBRep_ThePolygonToolOfInterCSurf.constructor (constructor)
  constructor();

  // HLRBRep_ThePolygonToolOfInterCSurf.Bounding (method)
  static Bounding(thePolygon: HLRBRep_ThePolygonOfInterCSurf): Bnd_Box;

  // HLRBRep_ThePolygonToolOfInterCSurf.DeflectionOverEstimation (method)
  static DeflectionOverEstimation(thePolygon: HLRBRep_ThePolygonOfInterCSurf): number;

  // HLRBRep_ThePolygonToolOfInterCSurf.Closed (method)
  static Closed(thePolygon: HLRBRep_ThePolygonOfInterCSurf): boolean;

  // HLRBRep_ThePolygonToolOfInterCSurf.NbSegments (method)
  static NbSegments(thePolygon: HLRBRep_ThePolygonOfInterCSurf): number;

  // HLRBRep_ThePolygonToolOfInterCSurf.BeginOfSeg (method)
  static BeginOfSeg(thePolygon: HLRBRep_ThePolygonOfInterCSurf, Index: number): gp_Pnt;

  // HLRBRep_ThePolygonToolOfInterCSurf.EndOfSeg (method)
  static EndOfSeg(thePolygon: HLRBRep_ThePolygonOfInterCSurf, Index: number): gp_Pnt;

  // HLRBRep_ThePolygonToolOfInterCSurf.Dump (method)
  static Dump(thePolygon: HLRBRep_ThePolygonOfInterCSurf): void;

  // HLRBRep_ThePolygonToolOfInterCSurf.delete (method)
  delete(): void;

  // HLRBRep_ThePolygonToolOfInterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_ThePolyhedronToolOfInterCSurf: declare class HLRBRep_ThePolyhedronToolOfInterCSurf

  // HLRBRep_ThePolyhedronToolOfInterCSurf.constructor (constructor)
  constructor();

  // HLRBRep_ThePolyhedronToolOfInterCSurf.delete (method)
  delete(): void;

  // HLRBRep_ThePolyhedronToolOfInterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheProjPCurOfCInter: declare class HLRBRep_TheProjPCurOfCInter

  // HLRBRep_TheProjPCurOfCInter.constructor (constructor)
  constructor();

  // HLRBRep_TheProjPCurOfCInter.delete (method)
  delete(): void;

  // HLRBRep_TheProjPCurOfCInter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheQuadCurvExactInterCSurf: declare class HLRBRep_TheQuadCurvExactInterCSurf

  // HLRBRep_TheQuadCurvExactInterCSurf.IsDone (method)
  IsDone(): boolean;

  // HLRBRep_TheQuadCurvExactInterCSurf.NbRoots (method)
  NbRoots(): number;

  // HLRBRep_TheQuadCurvExactInterCSurf.Root (method)
  Root(Index: number): number;

  // HLRBRep_TheQuadCurvExactInterCSurf.NbIntervals (method)
  NbIntervals(): number;

  // HLRBRep_TheQuadCurvExactInterCSurf.Intervals (method)
  Intervals(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

  // HLRBRep_TheQuadCurvExactInterCSurf.delete (method)
  delete(): void;

  // HLRBRep_TheQuadCurvExactInterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf: declare class HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf extends math_FunctionWithDerivative

  // HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf.constructor (constructor)
  constructor(Q: IntSurf_Quadric, C: gp_Lin);

  // HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf.Derivative (method)
  Derivative(X: number, D: number): { returnValue: boolean; D: number };

  // HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf.Values (method)
  Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

  // HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf.delete (method)
  delete(): void;

  // HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_TypeOfResultingEdge: typeof HLRBRep_TypeOfResultingEdge[keyof typeof HLRBRep_TypeOfResultingEdge]

  readonly HLRBRep_Undefined: 'HLRBRep_Undefined'

  readonly HLRBRep_IsoLine: 'HLRBRep_IsoLine'

  readonly HLRBRep_OutLine: 'HLRBRep_OutLine'

  readonly HLRBRep_Rg1Line: 'HLRBRep_Rg1Line'

  readonly HLRBRep_RgNLine: 'HLRBRep_RgNLine'

  readonly HLRBRep_Sharp: 'HLRBRep_Sharp'

HLRBRep_VertexList: declare class HLRBRep_VertexList

  // HLRBRep_VertexList.IsPeriodic (method)
  IsPeriodic(): boolean;

  // HLRBRep_VertexList.More (method)
  More(): boolean;

  // HLRBRep_VertexList.Next (method)
  Next(): void;

  // HLRBRep_VertexList.Current (method)
  Current(): HLRAlgo_Intersection;

  // HLRBRep_VertexList.IsBoundary (method)
  IsBoundary(): boolean;

  // HLRBRep_VertexList.IsInterference (method)
  IsInterference(): boolean;

  // HLRBRep_VertexList.Orientation (method)
  Orientation(): TopAbs_Orientation;

  // HLRBRep_VertexList.Transition (method)
  Transition(): TopAbs_Orientation;

  // HLRBRep_VertexList.BoundaryTransition (method)
  BoundaryTransition(): TopAbs_Orientation;

  // HLRBRep_VertexList.delete (method)
  delete(): void;

  // HLRBRep_VertexList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HLRBRep_SeqOfShapeBounds: NCollection_Sequence_HLRBRep_ShapeBounds
