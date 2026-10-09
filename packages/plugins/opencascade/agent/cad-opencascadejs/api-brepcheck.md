# libcascade — BRepCheck

11 top-level symbols. Signatures are verbatim typescript.

BRepCheck: declare class BRepCheck

  // BRepCheck.constructor (constructor)
  constructor();

  // BRepCheck.Add (method)
  static Add(List: NCollection_List_BRepCheck_Status, Stat: BRepCheck_Status): void;

  // BRepCheck.SelfIntersection (method)
  static SelfIntersection(W: TopoDS_Wire, F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge): boolean;

  // BRepCheck.PrecCurve (method)
  static PrecCurve(aAC3D: Adaptor3d_Curve): number;

  // BRepCheck.PrecSurface (method)
  static PrecSurface(aAHSurf: Adaptor3d_Surface): number;

  // BRepCheck.delete (method)
  delete(): void;

  // BRepCheck.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Analyzer: declare class BRepCheck_Analyzer

  // BRepCheck_Analyzer.constructor (constructor)
  constructor(S: TopoDS_Shape, GeomControls?: boolean, theIsParallel?: boolean, theIsExact?: boolean);

  // BRepCheck_Analyzer.Init (method)
  Init(S: TopoDS_Shape, GeomControls?: boolean): void;

  // BRepCheck_Analyzer.SetExactMethod (method)
  SetExactMethod(theIsExact: boolean): void;

  // BRepCheck_Analyzer.IsExactMethod (method)
  IsExactMethod(): boolean;

  // BRepCheck_Analyzer.SetParallel (method)
  SetParallel(theIsParallel: boolean): void;

  // BRepCheck_Analyzer.IsParallel (method)
  IsParallel(): boolean;

  // BRepCheck_Analyzer.IsValid (method)
  IsValid(S: TopoDS_Shape): boolean;
  IsValid(): boolean;

  // BRepCheck_Analyzer.Result (method)
  Result(theSubS: TopoDS_Shape): BRepCheck_Result;

  // BRepCheck_Analyzer.delete (method)
  delete(): void;

  // BRepCheck_Analyzer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Edge: declare class BRepCheck_Edge extends BRepCheck_Result

  // BRepCheck_Edge.constructor (constructor)
  constructor(E: TopoDS_Edge);

  // BRepCheck_Edge.InContext (method)
  InContext(ContextShape: TopoDS_Shape): void;

  // BRepCheck_Edge.Minimum (method)
  Minimum(): void;

  // BRepCheck_Edge.Blind (method)
  Blind(): void;

  // BRepCheck_Edge.GeometricControls (method)
  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;

  // BRepCheck_Edge.Tolerance (method)
  Tolerance(): number;

  // BRepCheck_Edge.SetStatus (method)
  SetStatus(theStatus: BRepCheck_Status): void;

  // BRepCheck_Edge.SetExactMethod (method)
  SetExactMethod(theIsExact: boolean): void;

  // BRepCheck_Edge.IsExactMethod (method)
  IsExactMethod(): boolean;

  // BRepCheck_Edge.CheckPolygonOnTriangulation (method)
  CheckPolygonOnTriangulation(theEdge: TopoDS_Edge): BRepCheck_Status;

  // BRepCheck_Edge.get_type_name (method)
  static get_type_name(): string;

  // BRepCheck_Edge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepCheck_Edge.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepCheck_Edge.delete (method)
  delete(): void;

  // BRepCheck_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Face: declare class BRepCheck_Face extends BRepCheck_Result

  // BRepCheck_Face.constructor (constructor)
  constructor(F: TopoDS_Face);

  // BRepCheck_Face.InContext (method)
  InContext(ContextShape: TopoDS_Shape): void;

  // BRepCheck_Face.Minimum (method)
  Minimum(): void;

  // BRepCheck_Face.Blind (method)
  Blind(): void;

  // BRepCheck_Face.IntersectWires (method)
  IntersectWires(Update?: boolean): BRepCheck_Status;

  // BRepCheck_Face.ClassifyWires (method)
  ClassifyWires(Update?: boolean): BRepCheck_Status;

  // BRepCheck_Face.OrientationOfWires (method)
  OrientationOfWires(Update?: boolean): BRepCheck_Status;

  // BRepCheck_Face.SetUnorientable (method)
  SetUnorientable(): void;

  // BRepCheck_Face.SetStatus (method)
  SetStatus(theStatus: BRepCheck_Status): void;

  // BRepCheck_Face.IsUnorientable (method)
  IsUnorientable(): boolean;

  // BRepCheck_Face.GeometricControls (method)
  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;

  // BRepCheck_Face.get_type_name (method)
  static get_type_name(): string;

  // BRepCheck_Face.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepCheck_Face.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepCheck_Face.delete (method)
  delete(): void;

  // BRepCheck_Face.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Result: declare class BRepCheck_Result extends Standard_Transient

  // BRepCheck_Result.Init (method)
  Init(S: TopoDS_Shape): void;

  // BRepCheck_Result.InContext (method)
  InContext(ContextShape: TopoDS_Shape): void;

  // BRepCheck_Result.Minimum (method)
  Minimum(): void;

  // BRepCheck_Result.Blind (method)
  Blind(): void;

  // BRepCheck_Result.SetFailStatus (method)
  SetFailStatus(S: TopoDS_Shape): void;

  // BRepCheck_Result.Status (method)
  Status(): NCollection_List_BRepCheck_Status;

  // BRepCheck_Result.IsMinimum (method)
  IsMinimum(): boolean;

  // BRepCheck_Result.IsBlind (method)
  IsBlind(): boolean;

  // BRepCheck_Result.InitContextIterator (method)
  InitContextIterator(): void;

  // BRepCheck_Result.MoreShapeInContext (method)
  MoreShapeInContext(): boolean;

  // BRepCheck_Result.ContextualShape (method)
  ContextualShape(): TopoDS_Shape;

  // BRepCheck_Result.StatusOnShape (method)
  StatusOnShape(): NCollection_List_BRepCheck_Status;
  StatusOnShape(theShape: TopoDS_Shape): NCollection_List_BRepCheck_Status;

  // BRepCheck_Result.NextShapeInContext (method)
  NextShapeInContext(): void;

  // BRepCheck_Result.SetParallel (method)
  SetParallel(theIsParallel: boolean): void;

  // BRepCheck_Result.IsParallel (method)
  IsParallel(): boolean;

  // BRepCheck_Result.IsStatusOnShape (method)
  IsStatusOnShape(theShape: TopoDS_Shape): boolean;

  // BRepCheck_Result.get_type_name (method)
  static get_type_name(): string;

  // BRepCheck_Result.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepCheck_Result.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepCheck_Result.delete (method)
  delete(): void;

  // BRepCheck_Result.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Shell: declare class BRepCheck_Shell extends BRepCheck_Result

  // BRepCheck_Shell.constructor (constructor)
  constructor(S: TopoDS_Shell);

  // BRepCheck_Shell.InContext (method)
  InContext(ContextShape: TopoDS_Shape): void;

  // BRepCheck_Shell.Minimum (method)
  Minimum(): void;

  // BRepCheck_Shell.Blind (method)
  Blind(): void;

  // BRepCheck_Shell.Closed (method)
  Closed(Update?: boolean): BRepCheck_Status;

  // BRepCheck_Shell.Orientation (method)
  Orientation(Update?: boolean): BRepCheck_Status;

  // BRepCheck_Shell.SetUnorientable (method)
  SetUnorientable(): void;

  // BRepCheck_Shell.IsUnorientable (method)
  IsUnorientable(): boolean;

  // BRepCheck_Shell.NbConnectedSet (method)
  NbConnectedSet(theSets: NCollection_List_TopoDS_Shape): number;

  // BRepCheck_Shell.get_type_name (method)
  static get_type_name(): string;

  // BRepCheck_Shell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepCheck_Shell.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepCheck_Shell.delete (method)
  delete(): void;

  // BRepCheck_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Solid: declare class BRepCheck_Solid extends BRepCheck_Result

  // BRepCheck_Solid.constructor (constructor)
  constructor(theS: TopoDS_Solid);

  // BRepCheck_Solid.InContext (method)
  InContext(ContextShape: TopoDS_Shape): void;

  // BRepCheck_Solid.Minimum (method)
  Minimum(): void;

  // BRepCheck_Solid.Blind (method)
  Blind(): void;

  // BRepCheck_Solid.get_type_name (method)
  static get_type_name(): string;

  // BRepCheck_Solid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepCheck_Solid.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepCheck_Solid.delete (method)
  delete(): void;

  // BRepCheck_Solid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Status: typeof BRepCheck_Status[keyof typeof BRepCheck_Status]

  readonly BRepCheck_NoError: 'BRepCheck_NoError'

  readonly BRepCheck_InvalidPointOnCurve: 'BRepCheck_InvalidPointOnCurve'

  readonly BRepCheck_InvalidPointOnCurveOnSurface: 'BRepCheck_InvalidPointOnCurveOnSurface'

  readonly BRepCheck_InvalidPointOnSurface: 'BRepCheck_InvalidPointOnSurface'

  readonly BRepCheck_No3DCurve: 'BRepCheck_No3DCurve'

  readonly BRepCheck_Multiple3DCurve: 'BRepCheck_Multiple3DCurve'

  readonly BRepCheck_Invalid3DCurve: 'BRepCheck_Invalid3DCurve'

  readonly BRepCheck_NoCurveOnSurface: 'BRepCheck_NoCurveOnSurface'

  readonly BRepCheck_InvalidCurveOnSurface: 'BRepCheck_InvalidCurveOnSurface'

  readonly BRepCheck_InvalidCurveOnClosedSurface: 'BRepCheck_InvalidCurveOnClosedSurface'

  readonly BRepCheck_InvalidSameRangeFlag: 'BRepCheck_InvalidSameRangeFlag'

  readonly BRepCheck_InvalidSameParameterFlag: 'BRepCheck_InvalidSameParameterFlag'

  readonly BRepCheck_InvalidDegeneratedFlag: 'BRepCheck_InvalidDegeneratedFlag'

  readonly BRepCheck_FreeEdge: 'BRepCheck_FreeEdge'

  readonly BRepCheck_InvalidMultiConnexity: 'BRepCheck_InvalidMultiConnexity'

  readonly BRepCheck_InvalidRange: 'BRepCheck_InvalidRange'

  readonly BRepCheck_EmptyWire: 'BRepCheck_EmptyWire'

  readonly BRepCheck_RedundantEdge: 'BRepCheck_RedundantEdge'

  readonly BRepCheck_SelfIntersectingWire: 'BRepCheck_SelfIntersectingWire'

  readonly BRepCheck_NoSurface: 'BRepCheck_NoSurface'

  readonly BRepCheck_InvalidWire: 'BRepCheck_InvalidWire'

  readonly BRepCheck_RedundantWire: 'BRepCheck_RedundantWire'

  readonly BRepCheck_IntersectingWires: 'BRepCheck_IntersectingWires'

  readonly BRepCheck_InvalidImbricationOfWires: 'BRepCheck_InvalidImbricationOfWires'

  readonly BRepCheck_EmptyShell: 'BRepCheck_EmptyShell'

  readonly BRepCheck_RedundantFace: 'BRepCheck_RedundantFace'

  readonly BRepCheck_InvalidImbricationOfShells: 'BRepCheck_InvalidImbricationOfShells'

  readonly BRepCheck_UnorientableShape: 'BRepCheck_UnorientableShape'

  readonly BRepCheck_NotClosed: 'BRepCheck_NotClosed'

  readonly BRepCheck_NotConnected: 'BRepCheck_NotConnected'

  readonly BRepCheck_SubshapeNotInShape: 'BRepCheck_SubshapeNotInShape'

  readonly BRepCheck_BadOrientation: 'BRepCheck_BadOrientation'

  readonly BRepCheck_BadOrientationOfSubshape: 'BRepCheck_BadOrientationOfSubshape'

  readonly BRepCheck_InvalidPolygonOnTriangulation: 'BRepCheck_InvalidPolygonOnTriangulation'

  readonly BRepCheck_InvalidToleranceValue: 'BRepCheck_InvalidToleranceValue'

  readonly BRepCheck_EnclosedRegion: 'BRepCheck_EnclosedRegion'

  readonly BRepCheck_CheckFail: 'BRepCheck_CheckFail'

BRepCheck_Vertex: declare class BRepCheck_Vertex extends BRepCheck_Result

  // BRepCheck_Vertex.constructor (constructor)
  constructor(V: TopoDS_Vertex);

  // BRepCheck_Vertex.InContext (method)
  InContext(ContextShape: TopoDS_Shape): void;

  // BRepCheck_Vertex.Minimum (method)
  Minimum(): void;

  // BRepCheck_Vertex.Blind (method)
  Blind(): void;

  // BRepCheck_Vertex.Tolerance (method)
  Tolerance(): number;

  // BRepCheck_Vertex.get_type_name (method)
  static get_type_name(): string;

  // BRepCheck_Vertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepCheck_Vertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepCheck_Vertex.delete (method)
  delete(): void;

  // BRepCheck_Vertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_Wire: declare class BRepCheck_Wire extends BRepCheck_Result

  // BRepCheck_Wire.constructor (constructor)
  constructor(W: TopoDS_Wire);

  // BRepCheck_Wire.InContext (method)
  InContext(ContextShape: TopoDS_Shape): void;

  // BRepCheck_Wire.Minimum (method)
  Minimum(): void;

  // BRepCheck_Wire.Blind (method)
  Blind(): void;

  // BRepCheck_Wire.Closed (method)
  Closed(Update?: boolean): BRepCheck_Status;

  // BRepCheck_Wire.Closed2d (method)
  Closed2d(F: TopoDS_Face, Update?: boolean): BRepCheck_Status;

  // BRepCheck_Wire.Orientation (method)
  Orientation(F: TopoDS_Face, Update?: boolean): BRepCheck_Status;

  // BRepCheck_Wire.SelfIntersect (method)
  SelfIntersect(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, Update: boolean): BRepCheck_Status;

  // BRepCheck_Wire.GeometricControls (method)
  GeometricControls(): boolean;
  GeometricControls(B: boolean): void;

  // BRepCheck_Wire.SetStatus (method)
  SetStatus(theStatus: BRepCheck_Status): void;

  // BRepCheck_Wire.get_type_name (method)
  static get_type_name(): string;

  // BRepCheck_Wire.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepCheck_Wire.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepCheck_Wire.delete (method)
  delete(): void;

  // BRepCheck_Wire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepCheck_ListOfStatus: NCollection_List_BRepCheck_Status
