# libcascade — BRepGProp

10 top-level symbols. Signatures are verbatim typescript.

BRepGProp: declare class BRepGProp

  // BRepGProp.constructor (constructor)
  constructor();

  // BRepGProp.LinearProperties (method)
  static LinearProperties(S: TopoDS_Shape, LProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;

  // BRepGProp.SurfaceProperties (method)
  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, Eps: number, SkipShared: boolean): number;

  // BRepGProp.VolumeProperties (method)
  static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, OnlyClosed: boolean, SkipShared: boolean, UseTriangulation: boolean): void;
  static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, SkipShared: boolean): number;

  // BRepGProp.VolumePropertiesGK (method)
  static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
  static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, thePln: gp_Pln, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;

  // BRepGProp.delete (method)
  delete(): void;

  // BRepGProp.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_Cinert: declare class BRepGProp_Cinert extends GProp_GProps

  // BRepGProp_Cinert.constructor (constructor)
  constructor();
  constructor(C: BRepAdaptor_Curve, CLocation: gp_Pnt);

  // BRepGProp_Cinert.SetLocation (method)
  SetLocation(CLocation: gp_Pnt): void;

  // BRepGProp_Cinert.Perform (method)
  Perform(C: BRepAdaptor_Curve): void;

  // BRepGProp_Cinert.delete (method)
  delete(): void;

  // BRepGProp_Cinert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_Domain: declare class BRepGProp_Domain

  // BRepGProp_Domain.constructor (constructor)
  constructor();
  constructor(F: TopoDS_Face);

  // BRepGProp_Domain.Init (method)
  Init(F: TopoDS_Face): void;
  Init(): void;

  // BRepGProp_Domain.More (method)
  More(): boolean;

  // BRepGProp_Domain.Value (method)
  Value(): TopoDS_Edge;

  // BRepGProp_Domain.Next (method)
  Next(): void;

  // BRepGProp_Domain.delete (method)
  delete(): void;

  // BRepGProp_Domain.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_EdgeTool: declare class BRepGProp_EdgeTool

  // BRepGProp_EdgeTool.constructor (constructor)
  constructor();

  // BRepGProp_EdgeTool.FirstParameter (method)
  static FirstParameter(C: BRepAdaptor_Curve): number;

  // BRepGProp_EdgeTool.LastParameter (method)
  static LastParameter(C: BRepAdaptor_Curve): number;

  // BRepGProp_EdgeTool.IntegrationOrder (method)
  static IntegrationOrder(C: BRepAdaptor_Curve): number;

  // BRepGProp_EdgeTool.Value (method)
  static Value(C: BRepAdaptor_Curve, U: number): gp_Pnt;

  // BRepGProp_EdgeTool.D1 (method)
  static D1(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec): void;

  // BRepGProp_EdgeTool.NbIntervals (method)
  static NbIntervals(C: BRepAdaptor_Curve, S: GeomAbs_Shape): number;

  // BRepGProp_EdgeTool.Intervals (method)
  static Intervals(C: BRepAdaptor_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // BRepGProp_EdgeTool.delete (method)
  delete(): void;

  // BRepGProp_EdgeTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_Face: declare class BRepGProp_Face

  // BRepGProp_Face.constructor (constructor)
  constructor(IsUseSpan?: boolean);
  constructor(F: TopoDS_Face, IsUseSpan?: boolean);

  // BRepGProp_Face.Load (method)
  Load(F: TopoDS_Face): void;
  Load(E: TopoDS_Edge): boolean;
  Load(IsFirstParam: boolean, theIsoType: GeomAbs_IsoType): void;

  // BRepGProp_Face.VIntegrationOrder (method)
  VIntegrationOrder(): number;

  // BRepGProp_Face.NaturalRestriction (method)
  NaturalRestriction(): boolean;

  // BRepGProp_Face.GetFace (method)
  GetFace(): TopoDS_Face;

  // BRepGProp_Face.Value2d (method)
  Value2d(U: number): gp_Pnt2d;

  // BRepGProp_Face.SIntOrder (method)
  SIntOrder(Eps: number): number;

  // BRepGProp_Face.SVIntSubs (method)
  SVIntSubs(): number;

  // BRepGProp_Face.SUIntSubs (method)
  SUIntSubs(): number;

  // BRepGProp_Face.UKnots (method)
  UKnots(Knots: NCollection_Array1_double): void;

  // BRepGProp_Face.VKnots (method)
  VKnots(Knots: NCollection_Array1_double): void;

  // BRepGProp_Face.LIntOrder (method)
  LIntOrder(Eps: number): number;

  // BRepGProp_Face.LIntSubs (method)
  LIntSubs(): number;

  // BRepGProp_Face.LKnots (method)
  LKnots(Knots: NCollection_Array1_double): void;

  // BRepGProp_Face.UIntegrationOrder (method)
  UIntegrationOrder(): number;

  // BRepGProp_Face.Bounds (method)
  Bounds(U1?: number, U2?: number, V1?: number, V2?: number): { U1: number; U2: number; V1: number; V2: number };

  // BRepGProp_Face.Normal (method)
  Normal(U: number, V: number, P: gp_Pnt, VNor: gp_Vec): void;

  // BRepGProp_Face.FirstParameter (method)
  FirstParameter(): number;

  // BRepGProp_Face.LastParameter (method)
  LastParameter(): number;

  // BRepGProp_Face.IntegrationOrder (method)
  IntegrationOrder(): number;

  // BRepGProp_Face.D12d (method)
  D12d(U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  // BRepGProp_Face.GetUKnots (method)
  GetUKnots(theUMin: number, theUMax: number): NCollection_HArray1_double;

  // BRepGProp_Face.GetTKnots (method)
  GetTKnots(theTMin: number, theTMax: number): NCollection_HArray1_double;

  // BRepGProp_Face.delete (method)
  delete(): void;

  // BRepGProp_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_MeshCinert: declare class BRepGProp_MeshCinert extends GProp_GProps

  // BRepGProp_MeshCinert.constructor (constructor)
  constructor();

  // BRepGProp_MeshCinert.SetLocation (method)
  SetLocation(CLocation: gp_Pnt): void;

  // BRepGProp_MeshCinert.Perform (method)
  Perform(theNodes: NCollection_Array1_gp_Pnt): void;

  // BRepGProp_MeshCinert.PreparePolygon (method)
  static PreparePolygon(theE: TopoDS_Edge): NCollection_HArray1_gp_Pnt;

  // BRepGProp_MeshCinert.delete (method)
  delete(): void;

  // BRepGProp_MeshCinert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_Sinert: declare class BRepGProp_Sinert extends GProp_GProps

  // BRepGProp_Sinert.constructor (constructor)
  constructor();
  constructor(S: BRepGProp_Face, SLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, SLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, SLocation: gp_Pnt, Eps: number);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, SLocation: gp_Pnt, Eps: number);

  // BRepGProp_Sinert.SetLocation (method)
  SetLocation(SLocation: gp_Pnt): void;

  // BRepGProp_Sinert.Perform (method)
  Perform(S: BRepGProp_Face): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
  Perform(S: BRepGProp_Face, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;

  // BRepGProp_Sinert.GetEpsilon (method)
  GetEpsilon(): number;

  // BRepGProp_Sinert.delete (method)
  delete(): void;

  // BRepGProp_Sinert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_TFunction: declare class BRepGProp_TFunction extends math_Function

  // BRepGProp_TFunction.constructor (constructor)
  constructor(theSurface: BRepGProp_Face, theVertex: gp_Pnt, IsByPoint: boolean, theCoeffs: number, theUMin: number, theTolerance: number);

  // BRepGProp_TFunction.Init (method)
  Init(): void;

  // BRepGProp_TFunction.SetNbKronrodPoints (method)
  SetNbKronrodPoints(theNbPoints: number): void;

  // BRepGProp_TFunction.SetValueType (method)
  SetValueType(aType: GProp_ValueType): void;

  // BRepGProp_TFunction.SetTolerance (method)
  SetTolerance(aTol: number): void;

  // BRepGProp_TFunction.ErrorReached (method)
  ErrorReached(): number;

  // BRepGProp_TFunction.AbsolutError (method)
  AbsolutError(): number;

  // BRepGProp_TFunction.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // BRepGProp_TFunction.GetStateNumber (method)
  GetStateNumber(): number;

  // BRepGProp_TFunction.delete (method)
  delete(): void;

  // BRepGProp_TFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_UFunction: declare class BRepGProp_UFunction extends math_Function

  // BRepGProp_UFunction.constructor (constructor)
  constructor(theSurface: BRepGProp_Face, theVertex: gp_Pnt, IsByPoint: boolean, theCoeffs: number);

  // BRepGProp_UFunction.SetValueType (method)
  SetValueType(theType: GProp_ValueType): void;

  // BRepGProp_UFunction.SetVParam (method)
  SetVParam(theVParam: number): void;

  // BRepGProp_UFunction.Value (method)
  Value(X: number, F: number): { returnValue: boolean; F: number };

  // BRepGProp_UFunction.delete (method)
  delete(): void;

  // BRepGProp_UFunction.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepGProp_Vinert: declare class BRepGProp_Vinert extends GProp_GProps

  // BRepGProp_Vinert.constructor (constructor)
  constructor();
  constructor(S: BRepGProp_Face, VLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, VLocation: gp_Pnt, Eps: number);
  constructor(S: BRepGProp_Face, O: gp_Pnt, VLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, Pl: gp_Pln, VLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, VLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, O: gp_Pnt, VLocation: gp_Pnt, Eps: number);
  constructor(S: BRepGProp_Face, Pl: gp_Pln, VLocation: gp_Pnt, Eps: number);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, VLocation: gp_Pnt, Eps: number);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, O: gp_Pnt, VLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, Pl: gp_Pln, VLocation: gp_Pnt);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, O: gp_Pnt, VLocation: gp_Pnt, Eps: number);
  constructor(S: BRepGProp_Face, D: BRepGProp_Domain, Pl: gp_Pln, VLocation: gp_Pnt, Eps: number);

  // BRepGProp_Vinert.SetLocation (method)
  SetLocation(VLocation: gp_Pnt): void;

  // BRepGProp_Vinert.Perform (method)
  Perform(S: BRepGProp_Face): void;
  Perform(S: BRepGProp_Face, Eps: number): number;
  Perform(S: BRepGProp_Face, O: gp_Pnt): void;
  Perform(S: BRepGProp_Face, Pl: gp_Pln): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
  Perform(S: BRepGProp_Face, O: gp_Pnt, Eps: number): number;
  Perform(S: BRepGProp_Face, Pl: gp_Pln, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, O: gp_Pnt): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Pl: gp_Pln): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, O: gp_Pnt, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Pl: gp_Pln, Eps: number): number;

  // BRepGProp_Vinert.GetEpsilon (method)
  GetEpsilon(): number;

  // BRepGProp_Vinert.delete (method)
  delete(): void;

  // BRepGProp_Vinert.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
