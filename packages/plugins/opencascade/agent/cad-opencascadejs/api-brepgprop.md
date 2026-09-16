# libcascade — BRepGProp

10 top-level symbols. Signatures are verbatim typescript.

BRepGProp: declare class BRepGProp

  constructor

  static LinearProperties(S: TopoDS_Shape, LProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;

  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, Eps: number, SkipShared: boolean): number;
  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, SkipShared: boolean, UseTriangulation: boolean): void;
  static SurfaceProperties(S: TopoDS_Shape, SProps: GProp_GProps, Eps: number, SkipShared: boolean): number;

  static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, OnlyClosed: boolean, SkipShared: boolean, UseTriangulation: boolean): void;
  static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, SkipShared: boolean): number;
  static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, OnlyClosed: boolean, SkipShared: boolean, UseTriangulation: boolean): void;
  static VolumeProperties(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, SkipShared: boolean): number;

  static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
  static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, thePln: gp_Pln, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
  static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;
  static VolumePropertiesGK(S: TopoDS_Shape, VProps: GProp_GProps, thePln: gp_Pln, Eps: number, OnlyClosed: boolean, IsUseSpan: boolean, CGFlag: boolean, IFlag: boolean, SkipShared: boolean): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_Cinert: declare class BRepGProp_Cinert extends GProp_GProps

  constructor

  SetLocation(CLocation: gp_Pnt): void;

  Perform(C: BRepAdaptor_Curve): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_Domain: declare class BRepGProp_Domain

  constructor

  Init(F: TopoDS_Face): void;
  Init(): void;
  Init(F: TopoDS_Face): void;
  Init(): void;

  More(): boolean;

  Value(): TopoDS_Edge;

  Next(): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_EdgeTool: declare class BRepGProp_EdgeTool

  constructor

  static FirstParameter(C: BRepAdaptor_Curve): number;

  static LastParameter(C: BRepAdaptor_Curve): number;

  static IntegrationOrder(C: BRepAdaptor_Curve): number;

  static Value(C: BRepAdaptor_Curve, U: number): gp_Pnt;

  static D1(C: BRepAdaptor_Curve, U: number, P: gp_Pnt, V1: gp_Vec): void;

  static NbIntervals(C: BRepAdaptor_Curve, S: GeomAbs_Shape): number;

  static Intervals(C: BRepAdaptor_Curve, T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_Face: declare class BRepGProp_Face

  constructor

  Load(F: TopoDS_Face): void;
  Load(E: TopoDS_Edge): boolean;
  Load(IsFirstParam: boolean, theIsoType: GeomAbs_IsoType): void;
  Load(F: TopoDS_Face): void;
  Load(E: TopoDS_Edge): boolean;
  Load(IsFirstParam: boolean, theIsoType: GeomAbs_IsoType): void;
  Load(F: TopoDS_Face): void;
  Load(E: TopoDS_Edge): boolean;
  Load(IsFirstParam: boolean, theIsoType: GeomAbs_IsoType): void;

  VIntegrationOrder(): number;

  NaturalRestriction(): boolean;

  GetFace(): TopoDS_Face;

  Value2d(U: number): gp_Pnt2d;

  SIntOrder(Eps: number): number;

  SVIntSubs(): number;

  SUIntSubs(): number;

  UKnots(Knots: NCollection_Array1_double): void;

  VKnots(Knots: NCollection_Array1_double): void;

  LIntOrder(Eps: number): number;

  LIntSubs(): number;

  LKnots(Knots: NCollection_Array1_double): void;

  UIntegrationOrder(): number;

  Bounds(U1?: number, U2?: number, V1?: number, V2?: number): { U1: number; U2: number; V1: number; V2: number };

  Normal(U: number, V: number, P: gp_Pnt, VNor: gp_Vec): void;

  FirstParameter(): number;

  LastParameter(): number;

  IntegrationOrder(): number;

  D12d(U: number, P: gp_Pnt2d, V1: gp_Vec2d): void;

  GetUKnots(theUMin: number, theUMax: number): NCollection_HArray1_double;

  GetTKnots(theTMin: number, theTMax: number): NCollection_HArray1_double;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_MeshCinert: declare class BRepGProp_MeshCinert extends GProp_GProps

  constructor

  SetLocation(CLocation: gp_Pnt): void;

  Perform(theNodes: NCollection_Array1_gp_Pnt): void;

  static PreparePolygon(theE: TopoDS_Edge): NCollection_HArray1_gp_Pnt;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_Sinert: declare class BRepGProp_Sinert extends GProp_GProps

  constructor

  SetLocation(SLocation: gp_Pnt): void;

  Perform(S: BRepGProp_Face): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
  Perform(S: BRepGProp_Face, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;
  Perform(S: BRepGProp_Face): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
  Perform(S: BRepGProp_Face, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;
  Perform(S: BRepGProp_Face): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
  Perform(S: BRepGProp_Face, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;
  Perform(S: BRepGProp_Face): void;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain): void;
  Perform(S: BRepGProp_Face, Eps: number): number;
  Perform(S: BRepGProp_Face, D: BRepGProp_Domain, Eps: number): number;

  GetEpsilon(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_TFunction: declare class BRepGProp_TFunction extends math_Function

  constructor

  Init(): void;

  SetNbKronrodPoints(theNbPoints: number): void;

  SetValueType(aType: GProp_ValueType): void;

  SetTolerance(aTol: number): void;

  ErrorReached(): number;

  AbsolutError(): number;

  Value(X: number, F: number): { returnValue: boolean; F: number };

  GetStateNumber(): number;

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_UFunction: declare class BRepGProp_UFunction extends math_Function

  constructor

  SetValueType(theType: GProp_ValueType): void;

  SetVParam(theVParam: number): void;

  Value(X: number, F: number): { returnValue: boolean; F: number };

  delete(): void;

  [Symbol.dispose](): void;

BRepGProp_Vinert: declare class BRepGProp_Vinert extends GProp_GProps

  constructor

  SetLocation(VLocation: gp_Pnt): void;

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

  GetEpsilon(): number;

  delete(): void;

  [Symbol.dispose](): void;
