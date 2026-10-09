# libcascade — BRepFill

34 top-level symbols. Signatures are verbatim typescript.

BRepFill: declare class BRepFill

  // BRepFill.constructor (constructor)
  constructor();

  // BRepFill.Face (method)
  static Face(Edge1: TopoDS_Edge, Edge2: TopoDS_Edge): TopoDS_Face;

  // BRepFill.Shell (method)
  static Shell(Wire1: TopoDS_Wire, Wire2: TopoDS_Wire): TopoDS_Shell;

  // BRepFill.Axe (method)
  static Axe(Spine: TopoDS_Shape, Profile: TopoDS_Wire, AxeProf: gp_Ax3, ProfOnSpine: boolean, Tol: number): { ProfOnSpine: boolean };

  // BRepFill.ComputeACR (method)
  static ComputeACR(wire: TopoDS_Wire, ACR: NCollection_Array1_double): void;

  // BRepFill.InsertACR (method)
  static InsertACR(wire: TopoDS_Wire, ACRcuts: NCollection_Array1_double, prec: number): TopoDS_Wire;

  // BRepFill.delete (method)
  delete(): void;

  // BRepFill.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_ACRLaw: declare class BRepFill_ACRLaw extends BRepFill_LocationLaw

  // BRepFill_ACRLaw.constructor (constructor)
  constructor(Path: TopoDS_Wire, Law: GeomFill_LocationGuide);

  // BRepFill_ACRLaw.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_ACRLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_ACRLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_ACRLaw.delete (method)
  delete(): void;

  // BRepFill_ACRLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_AdvancedEvolved: declare class BRepFill_AdvancedEvolved

  // BRepFill_AdvancedEvolved.constructor (constructor)
  constructor();

  // BRepFill_AdvancedEvolved.Perform (method)
  Perform(theSpine: TopoDS_Wire, theProfile: TopoDS_Wire, theTolerance: number, theSolidReq?: boolean): void;

  // BRepFill_AdvancedEvolved.IsDone (method)
  IsDone(theErrorCode?: number): boolean;

  // BRepFill_AdvancedEvolved.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepFill_AdvancedEvolved.SetTemporaryDirectory (method)
  SetTemporaryDirectory(thePath: string): void;

  // BRepFill_AdvancedEvolved.SetParallelMode (method)
  SetParallelMode(theVal: boolean): void;

  // BRepFill_AdvancedEvolved.delete (method)
  delete(): void;

  // BRepFill_AdvancedEvolved.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_ApproxSeewing: declare class BRepFill_ApproxSeewing

  // BRepFill_ApproxSeewing.constructor (constructor)
  constructor();
  constructor(ML: BRepFill_MultiLine);

  // BRepFill_ApproxSeewing.Perform (method)
  Perform(ML: BRepFill_MultiLine): void;

  // BRepFill_ApproxSeewing.IsDone (method)
  IsDone(): boolean;

  // BRepFill_ApproxSeewing.Curve (method)
  Curve(): Geom_Curve;

  // BRepFill_ApproxSeewing.CurveOnF1 (method)
  CurveOnF1(): Geom2d_Curve;

  // BRepFill_ApproxSeewing.CurveOnF2 (method)
  CurveOnF2(): Geom2d_Curve;

  // BRepFill_ApproxSeewing.delete (method)
  delete(): void;

  // BRepFill_ApproxSeewing.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_CompatibleWires: declare class BRepFill_CompatibleWires

  // BRepFill_CompatibleWires.constructor (constructor)
  constructor();
  constructor(Sections: NCollection_Sequence_TopoDS_Shape);

  // BRepFill_CompatibleWires.Init (method)
  Init(Sections: NCollection_Sequence_TopoDS_Shape): void;

  // BRepFill_CompatibleWires.SetPercent (method)
  SetPercent(percent?: number): void;

  // BRepFill_CompatibleWires.Perform (method)
  Perform(WithRotation?: boolean): void;

  // BRepFill_CompatibleWires.IsDone (method)
  IsDone(): boolean;

  // BRepFill_CompatibleWires.GetStatus (method)
  GetStatus(): BRepFill_ThruSectionErrorStatus;

  // BRepFill_CompatibleWires.Shape (method)
  Shape(): NCollection_Sequence_TopoDS_Shape;

  // BRepFill_CompatibleWires.GeneratedShapes (method)
  GeneratedShapes(SubSection: TopoDS_Edge): NCollection_List_TopoDS_Shape;

  // BRepFill_CompatibleWires.Generated (method)
  Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  // BRepFill_CompatibleWires.IsDegeneratedFirstSection (method)
  IsDegeneratedFirstSection(): boolean;

  // BRepFill_CompatibleWires.IsDegeneratedLastSection (method)
  IsDegeneratedLastSection(): boolean;

  // BRepFill_CompatibleWires.delete (method)
  delete(): void;

  // BRepFill_CompatibleWires.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_ComputeCLine: declare class BRepFill_ComputeCLine

  // BRepFill_ComputeCLine.constructor (constructor)
  constructor(degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, cutting?: boolean, FirstC?: AppParCurves_Constraint, LastC?: AppParCurves_Constraint);
  constructor(Line: BRepFill_MultiLine, degreemin?: number, degreemax?: number, Tolerance3d?: number, Tolerance2d?: number, cutting?: boolean, FirstC?: AppParCurves_Constraint, LastC?: AppParCurves_Constraint);

  // BRepFill_ComputeCLine.Perform (method)
  Perform(Line: BRepFill_MultiLine): void;

  // BRepFill_ComputeCLine.SetDegrees (method)
  SetDegrees(degreemin: number, degreemax: number): void;

  // BRepFill_ComputeCLine.SetTolerances (method)
  SetTolerances(Tolerance3d: number, Tolerance2d: number): void;

  // BRepFill_ComputeCLine.SetConstraints (method)
  SetConstraints(FirstC: AppParCurves_Constraint, LastC: AppParCurves_Constraint): void;

  // BRepFill_ComputeCLine.SetMaxSegments (method)
  SetMaxSegments(theMaxSegments: number): void;

  // BRepFill_ComputeCLine.SetInvOrder (method)
  SetInvOrder(theInvOrder: boolean): void;

  // BRepFill_ComputeCLine.SetHangChecking (method)
  SetHangChecking(theHangChecking: boolean): void;

  // BRepFill_ComputeCLine.IsAllApproximated (method)
  IsAllApproximated(): boolean;

  // BRepFill_ComputeCLine.IsToleranceReached (method)
  IsToleranceReached(): boolean;

  // BRepFill_ComputeCLine.Error (method)
  Error(Index: number, tol3d?: number, tol2d?: number): { tol3d: number; tol2d: number };

  // BRepFill_ComputeCLine.NbMultiCurves (method)
  NbMultiCurves(): number;

  // BRepFill_ComputeCLine.Value (method)
  Value(Index?: number): AppParCurves_MultiCurve;

  // BRepFill_ComputeCLine.Parameters (method)
  Parameters(Index: number, firstp?: number, lastp?: number): { firstp: number; lastp: number };

  // BRepFill_ComputeCLine.delete (method)
  delete(): void;

  // BRepFill_ComputeCLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_CurveConstraint: declare class BRepFill_CurveConstraint extends Standard_Transient

  // BRepFill_CurveConstraint.constructor (constructor)
  constructor(Boundary: Adaptor3d_Curve, Tang: number, NPt?: number, TolDist?: number);
  constructor(Boundary: Adaptor3d_CurveOnSurface, Order: number, NPt?: number, TolDist?: number, TolAng?: number, TolCurv?: number);

  // BRepFill_CurveConstraint.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_CurveConstraint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_CurveConstraint.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_CurveConstraint.delete (method)
  delete(): void;

  // BRepFill_CurveConstraint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Draft: declare class BRepFill_Draft

  // BRepFill_Draft.constructor (constructor)
  constructor(Shape: TopoDS_Shape, Dir: gp_Dir, Angle: number);

  // BRepFill_Draft.SetOptions (method)
  SetOptions(Style?: BRepFill_TransitionStyle, AngleMin?: number, AngleMax?: number): void;

  // BRepFill_Draft.SetDraft (method)
  SetDraft(IsInternal?: boolean): void;

  // BRepFill_Draft.Perform (method)
  Perform(LengthMax: number): void;
  Perform(Surface: Geom_Surface, KeepInsideSurface: boolean): void;
  Perform(StopShape: TopoDS_Shape, KeepOutSide: boolean): void;

  // BRepFill_Draft.IsDone (method)
  IsDone(): boolean;

  // BRepFill_Draft.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepFill_Draft.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFill_Draft.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepFill_Draft.delete (method)
  delete(): void;

  // BRepFill_Draft.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_DraftLaw: declare class BRepFill_DraftLaw extends BRepFill_Edge3DLaw

  // BRepFill_DraftLaw.constructor (constructor)
  constructor(Path: TopoDS_Wire, Law: GeomFill_LocationDraft);

  // BRepFill_DraftLaw.CleanLaw (method)
  CleanLaw(TolAngular: number): void;

  // BRepFill_DraftLaw.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_DraftLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_DraftLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_DraftLaw.delete (method)
  delete(): void;

  // BRepFill_DraftLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Edge3DLaw: declare class BRepFill_Edge3DLaw extends BRepFill_LocationLaw

  // BRepFill_Edge3DLaw.constructor (constructor)
  constructor(Path: TopoDS_Wire, Law: GeomFill_LocationLaw);

  // BRepFill_Edge3DLaw.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_Edge3DLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_Edge3DLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_Edge3DLaw.delete (method)
  delete(): void;

  // BRepFill_Edge3DLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_EdgeFaceAndOrder: declare class BRepFill_EdgeFaceAndOrder

  // BRepFill_EdgeFaceAndOrder.constructor (constructor)
  constructor();
  constructor(anEdge: TopoDS_Edge, aFace: TopoDS_Face, anOrder: GeomAbs_Shape);

  // BRepFill_EdgeFaceAndOrder.delete (method)
  delete(): void;

  // BRepFill_EdgeFaceAndOrder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_EdgeOnSurfLaw: declare class BRepFill_EdgeOnSurfLaw extends BRepFill_LocationLaw

  // BRepFill_EdgeOnSurfLaw.constructor (constructor)
  constructor(Path: TopoDS_Wire, Surf: TopoDS_Shape);

  // BRepFill_EdgeOnSurfLaw.HasResult (method)
  HasResult(): boolean;

  // BRepFill_EdgeOnSurfLaw.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_EdgeOnSurfLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_EdgeOnSurfLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_EdgeOnSurfLaw.delete (method)
  delete(): void;

  // BRepFill_EdgeOnSurfLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Evolved: declare class BRepFill_Evolved

  // BRepFill_Evolved.constructor (constructor)
  constructor();
  constructor(Spine: TopoDS_Wire, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join?: GeomAbs_JoinType, Solid?: boolean);
  constructor(Spine: TopoDS_Face, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join?: GeomAbs_JoinType, Solid?: boolean);

  // BRepFill_Evolved.Perform (method)
  Perform(Spine: TopoDS_Wire, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;
  Perform(Spine: TopoDS_Face, Profile: TopoDS_Wire, AxeProf: gp_Ax3, Join: GeomAbs_JoinType, Solid: boolean): void;

  // BRepFill_Evolved.IsDone (method)
  IsDone(): boolean;

  // BRepFill_Evolved.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepFill_Evolved.GeneratedShapes (method)
  GeneratedShapes(SpineShape: TopoDS_Shape, ProfShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFill_Evolved.JoinType (method)
  JoinType(): GeomAbs_JoinType;

  // BRepFill_Evolved.Top (method)
  Top(): TopoDS_Shape;

  // BRepFill_Evolved.Bottom (method)
  Bottom(): TopoDS_Shape;

  // BRepFill_Evolved.delete (method)
  delete(): void;

  // BRepFill_Evolved.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_FaceAndOrder: declare class BRepFill_FaceAndOrder

  // BRepFill_FaceAndOrder.constructor (constructor)
  constructor();
  constructor(aFace: TopoDS_Face, anOrder: GeomAbs_Shape);

  // BRepFill_FaceAndOrder.delete (method)
  delete(): void;

  // BRepFill_FaceAndOrder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Filling: declare class BRepFill_Filling

  // BRepFill_Filling.constructor (constructor)
  constructor(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean, Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number, MaxDeg?: number, MaxSegments?: number);

  // BRepFill_Filling.SetConstrParam (method)
  SetConstrParam(Tol2d?: number, Tol3d?: number, TolAng?: number, TolCurv?: number): void;

  // BRepFill_Filling.SetResolParam (method)
  SetResolParam(Degree?: number, NbPtsOnCur?: number, NbIter?: number, Anisotropie?: boolean): void;

  // BRepFill_Filling.SetApproxParam (method)
  SetApproxParam(MaxDeg?: number, MaxSegments?: number): void;

  // BRepFill_Filling.LoadInitSurface (method)
  LoadInitSurface(aFace: TopoDS_Face): void;

  // BRepFill_Filling.Add (method)
  Add(Point: gp_Pnt): number;
  Add(Support: TopoDS_Face, Order: GeomAbs_Shape): number;
  Add(anEdge: TopoDS_Edge, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(anEdge: TopoDS_Edge, Support: TopoDS_Face, Order: GeomAbs_Shape, IsBound: boolean): number;
  Add(U: number, V: number, Support: TopoDS_Face, Order: GeomAbs_Shape): number;

  // BRepFill_Filling.Build (method)
  Build(): void;

  // BRepFill_Filling.IsDone (method)
  IsDone(): boolean;

  // BRepFill_Filling.Face (method)
  Face(): TopoDS_Face;

  // BRepFill_Filling.Generated (method)
  Generated(S: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFill_Filling.G0Error (method)
  G0Error(): number;
  G0Error(Index: number): number;

  // BRepFill_Filling.G1Error (method)
  G1Error(): number;
  G1Error(Index: number): number;

  // BRepFill_Filling.G2Error (method)
  G2Error(): number;
  G2Error(Index: number): number;

  // BRepFill_Filling.delete (method)
  delete(): void;

  // BRepFill_Filling.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Generator: declare class BRepFill_Generator

  // BRepFill_Generator.constructor (constructor)
  constructor();

  // BRepFill_Generator.AddWire (method)
  AddWire(Wire: TopoDS_Wire): void;

  // BRepFill_Generator.Perform (method)
  Perform(): void;

  // BRepFill_Generator.Shell (method)
  Shell(): TopoDS_Shell;

  // BRepFill_Generator.Generated (method)
  Generated(): NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher;

  // BRepFill_Generator.GeneratedShapes (method)
  GeneratedShapes(SSection: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFill_Generator.ResultShape (method)
  ResultShape(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepFill_Generator.SetMutableInput (method)
  SetMutableInput(theIsMutableInput: boolean): void;

  // BRepFill_Generator.IsMutableInput (method)
  IsMutableInput(): boolean;

  // BRepFill_Generator.GetStatus (method)
  GetStatus(): BRepFill_ThruSectionErrorStatus;

  // BRepFill_Generator.delete (method)
  delete(): void;

  // BRepFill_Generator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_LocationLaw: declare class BRepFill_LocationLaw extends Standard_Transient

  // BRepFill_LocationLaw.constructor (constructor)
  constructor();

  // BRepFill_LocationLaw.GetStatus (method)
  GetStatus(): GeomFill_PipeError;

  // BRepFill_LocationLaw.TransformInG0Law (method)
  TransformInG0Law(): void;

  // BRepFill_LocationLaw.TransformInCompatibleLaw (method)
  TransformInCompatibleLaw(AngularTolerance: number): void;

  // BRepFill_LocationLaw.DeleteTransform (method)
  DeleteTransform(): void;

  // BRepFill_LocationLaw.NbHoles (method)
  NbHoles(Tol?: number): number;

  // BRepFill_LocationLaw.Holes (method)
  Holes(Interval: NCollection_Array1_int): void;

  // BRepFill_LocationLaw.NbLaw (method)
  NbLaw(): number;

  // BRepFill_LocationLaw.Law (method)
  Law(Index: number): GeomFill_LocationLaw;

  // BRepFill_LocationLaw.Wire (method)
  Wire(): TopoDS_Wire;

  // BRepFill_LocationLaw.Edge (method)
  Edge(Index: number): TopoDS_Edge;

  // BRepFill_LocationLaw.Vertex (method)
  Vertex(Index: number): TopoDS_Vertex;

  // BRepFill_LocationLaw.PerformVertex (method)
  PerformVertex(Index: number, InputVertex: TopoDS_Vertex, TolMin: number, OutputVertex: TopoDS_Vertex, Location: number): void;

  // BRepFill_LocationLaw.CurvilinearBounds (method)
  CurvilinearBounds(Index: number, First?: number, Last?: number): { First: number; Last: number };

  // BRepFill_LocationLaw.IsClosed (method)
  IsClosed(): boolean;

  // BRepFill_LocationLaw.IsG1 (method)
  IsG1(Index: number, SpatialTolerance?: number, AngularTolerance?: number): number;

  // BRepFill_LocationLaw.D0 (method)
  D0(Abscissa: number, Section: TopoDS_Shape): void;

  // BRepFill_LocationLaw.Parameter (method)
  Parameter(Abscissa: number, Index?: number, Param?: number): { Index: number; Param: number };

  // BRepFill_LocationLaw.Abscissa (method)
  Abscissa(Index: number, Param: number): number;

  // BRepFill_LocationLaw.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_LocationLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_LocationLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_LocationLaw.delete (method)
  delete(): void;

  // BRepFill_LocationLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_MultiLine: declare class BRepFill_MultiLine extends AppCont_Function

  // BRepFill_MultiLine.constructor (constructor)
  constructor();
  constructor(Face1: TopoDS_Face, Face2: TopoDS_Face, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Inv1: boolean, Inv2: boolean, Bissec: Geom2d_Curve);

  // BRepFill_MultiLine.IsParticularCase (method)
  IsParticularCase(): boolean;

  // BRepFill_MultiLine.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // BRepFill_MultiLine.Curves (method)
  Curves(): { Curve: Geom_Curve; PCurve1: Geom2d_Curve; PCurve2: Geom2d_Curve; [Symbol.dispose](): void };

  // BRepFill_MultiLine.FirstParameter (method)
  FirstParameter(): number;

  // BRepFill_MultiLine.LastParameter (method)
  LastParameter(): number;

  // BRepFill_MultiLine.Value (method)
  Value(U: number): gp_Pnt;
  Value(theU: number, thePnt2d: NCollection_Array1_gp_Pnt2d, thePnt: NCollection_Array1_gp_Pnt): boolean;

  // BRepFill_MultiLine.ValueOnF1 (method)
  ValueOnF1(U: number): gp_Pnt2d;

  // BRepFill_MultiLine.ValueOnF2 (method)
  ValueOnF2(U: number): gp_Pnt2d;

  // BRepFill_MultiLine.Value3dOnF1OnF2 (method)
  Value3dOnF1OnF2(U: number, P3d: gp_Pnt, PF1: gp_Pnt2d, PF2: gp_Pnt2d): void;

  // BRepFill_MultiLine.D1 (method)
  D1(theU: number, theVec2d: NCollection_Array1_gp_Vec2d, theVec: NCollection_Array1_gp_Vec): boolean;

  // BRepFill_MultiLine.delete (method)
  delete(): void;

  // BRepFill_MultiLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_NSections: declare class BRepFill_NSections extends BRepFill_SectionLaw

  // BRepFill_NSections.constructor (constructor)
  constructor(S: NCollection_Sequence_TopoDS_Shape, Build?: boolean);
  constructor(S: NCollection_Sequence_TopoDS_Shape, Trsfs: NCollection_Sequence_gp_Trsf, P: NCollection_Sequence_double, VF: number, VL: number, Build?: boolean);

  // BRepFill_NSections.IsVertex (method)
  IsVertex(): boolean;

  // BRepFill_NSections.IsConstant (method)
  IsConstant(): boolean;

  // BRepFill_NSections.ConcatenedLaw (method)
  ConcatenedLaw(): GeomFill_SectionLaw;

  // BRepFill_NSections.Continuity (method)
  Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

  // BRepFill_NSections.VertexTol (method)
  VertexTol(Index: number, Param: number): number;

  // BRepFill_NSections.Vertex (method)
  Vertex(Index: number, Param: number): TopoDS_Vertex;

  // BRepFill_NSections.D0 (method)
  D0(U: number, S: TopoDS_Shape): void;

  // BRepFill_NSections.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_NSections.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_NSections.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_NSections.delete (method)
  delete(): void;

  // BRepFill_NSections.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_OffsetAncestors: declare class BRepFill_OffsetAncestors

  // BRepFill_OffsetAncestors.constructor (constructor)
  constructor();
  constructor(Paral: BRepFill_OffsetWire);

  // BRepFill_OffsetAncestors.Perform (method)
  Perform(Paral: BRepFill_OffsetWire): void;

  // BRepFill_OffsetAncestors.IsDone (method)
  IsDone(): boolean;

  // BRepFill_OffsetAncestors.HasAncestor (method)
  HasAncestor(S1: TopoDS_Edge): boolean;

  // BRepFill_OffsetAncestors.Ancestor (method)
  Ancestor(S1: TopoDS_Edge): TopoDS_Shape;

  // BRepFill_OffsetAncestors.delete (method)
  delete(): void;

  // BRepFill_OffsetAncestors.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_OffsetWire: declare class BRepFill_OffsetWire

  // BRepFill_OffsetWire.constructor (constructor)
  constructor();
  constructor(Spine: TopoDS_Face, Join?: GeomAbs_JoinType, IsOpenResult?: boolean);

  // BRepFill_OffsetWire.Init (method)
  Init(Spine: TopoDS_Face, Join?: GeomAbs_JoinType, IsOpenResult?: boolean): void;

  // BRepFill_OffsetWire.Perform (method)
  Perform(Offset: number, Alt?: number): void;

  // BRepFill_OffsetWire.PerformWithBiLo (method)
  PerformWithBiLo(WSP: TopoDS_Face, Offset: number, Locus: BRepMAT2d_BisectingLocus, Link: BRepMAT2d_LinkTopoBilo, Join: GeomAbs_JoinType, Alt: number): void;

  // BRepFill_OffsetWire.IsDone (method)
  IsDone(): boolean;

  // BRepFill_OffsetWire.Spine (method)
  Spine(): TopoDS_Face;

  // BRepFill_OffsetWire.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepFill_OffsetWire.GeneratedShapes (method)
  GeneratedShapes(SpineShape: TopoDS_Shape): NCollection_List_TopoDS_Shape;

  // BRepFill_OffsetWire.JoinType (method)
  JoinType(): GeomAbs_JoinType;

  // BRepFill_OffsetWire.delete (method)
  delete(): void;

  // BRepFill_OffsetWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Pipe: declare class BRepFill_Pipe

  // BRepFill_Pipe.constructor (constructor)
  constructor();
  constructor(Spine: TopoDS_Wire, Profile: TopoDS_Shape, aMode?: GeomFill_Trihedron, ForceApproxC1?: boolean, GeneratePartCase?: boolean);

  // BRepFill_Pipe.Perform (method)
  Perform(Spine: TopoDS_Wire, Profile: TopoDS_Shape, GeneratePartCase?: boolean): void;

  // BRepFill_Pipe.Spine (method)
  Spine(): TopoDS_Shape;

  // BRepFill_Pipe.Profile (method)
  Profile(): TopoDS_Shape;

  // BRepFill_Pipe.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepFill_Pipe.ErrorOnSurface (method)
  ErrorOnSurface(): number;

  // BRepFill_Pipe.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // BRepFill_Pipe.LastShape (method)
  LastShape(): TopoDS_Shape;

  // BRepFill_Pipe.Generated (method)
  Generated(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;

  // BRepFill_Pipe.Face (method)
  Face(ESpine: TopoDS_Edge, EProfile: TopoDS_Edge): TopoDS_Face;

  // BRepFill_Pipe.Edge (method)
  Edge(ESpine: TopoDS_Edge, VProfile: TopoDS_Vertex): TopoDS_Edge;

  // BRepFill_Pipe.Section (method)
  Section(VSpine: TopoDS_Vertex): TopoDS_Shape;

  // BRepFill_Pipe.PipeLine (method)
  PipeLine(Point: gp_Pnt): TopoDS_Wire;

  // BRepFill_Pipe.delete (method)
  delete(): void;

  // BRepFill_Pipe.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_PipeShell: declare class BRepFill_PipeShell extends Standard_Transient

  // BRepFill_PipeShell.constructor (constructor)
  constructor(Spine: TopoDS_Wire);

  // BRepFill_PipeShell.Set (method)
  Set(Frenet: boolean): void;
  Set(Axe: gp_Ax2): void;
  Set(BiNormal: gp_Dir): void;
  Set(SpineSupport: TopoDS_Shape): boolean;
  Set(AuxiliarySpine: TopoDS_Wire, CurvilinearEquivalence: boolean, KeepContact: BRepFill_TypeOfContact): void;

  // BRepFill_PipeShell.SetDiscrete (method)
  SetDiscrete(): void;

  // BRepFill_PipeShell.SetMaxDegree (method)
  SetMaxDegree(NewMaxDegree: number): void;

  // BRepFill_PipeShell.SetMaxSegments (method)
  SetMaxSegments(NewMaxSegments: number): void;

  // BRepFill_PipeShell.SetForceApproxC1 (method)
  SetForceApproxC1(ForceApproxC1: boolean): void;

  // BRepFill_PipeShell.SetIsBuildHistory (method)
  SetIsBuildHistory(theIsBuildHistory: boolean): void;

  // BRepFill_PipeShell.IsBuildHistory (method)
  IsBuildHistory(): boolean;

  // BRepFill_PipeShell.Add (method)
  Add(Profile: TopoDS_Shape, WithContact: boolean, WithCorrection: boolean): void;
  Add(Profile: TopoDS_Shape, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  // BRepFill_PipeShell.SetLaw (method)
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, WithContact: boolean, WithCorrection: boolean): void;
  SetLaw(Profile: TopoDS_Shape, L: Law_Function, Location: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean): void;

  // BRepFill_PipeShell.DeleteProfile (method)
  DeleteProfile(Profile: TopoDS_Shape): void;

  // BRepFill_PipeShell.IsReady (method)
  IsReady(): boolean;

  // BRepFill_PipeShell.GetStatus (method)
  GetStatus(): GeomFill_PipeError;

  // BRepFill_PipeShell.SetTolerance (method)
  SetTolerance(Tol3d?: number, BoundTol?: number, TolAngular?: number): void;

  // BRepFill_PipeShell.SetTransition (method)
  SetTransition(Mode?: BRepFill_TransitionStyle, Angmin?: number, Angmax?: number): void;

  // BRepFill_PipeShell.Simulate (method)
  Simulate(NumberOfSection: number, Sections: NCollection_List_TopoDS_Shape): void;

  // BRepFill_PipeShell.Build (method)
  Build(): boolean;

  // BRepFill_PipeShell.MakeSolid (method)
  MakeSolid(): boolean;

  // BRepFill_PipeShell.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepFill_PipeShell.ErrorOnSurface (method)
  ErrorOnSurface(): number;

  // BRepFill_PipeShell.FirstShape (method)
  FirstShape(): TopoDS_Shape;

  // BRepFill_PipeShell.LastShape (method)
  LastShape(): TopoDS_Shape;

  // BRepFill_PipeShell.Profiles (method)
  Profiles(theProfiles: NCollection_List_TopoDS_Shape): void;

  // BRepFill_PipeShell.Spine (method)
  Spine(): TopoDS_Wire;

  // BRepFill_PipeShell.Generated (method)
  Generated(S: TopoDS_Shape, L: NCollection_List_TopoDS_Shape): void;

  // BRepFill_PipeShell.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_PipeShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_PipeShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_PipeShell.delete (method)
  delete(): void;

  // BRepFill_PipeShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Section: declare class BRepFill_Section

  // BRepFill_Section.constructor (constructor)
  constructor();
  constructor(Profile: TopoDS_Shape, V: TopoDS_Vertex, WithContact: boolean, WithCorrection: boolean);

  // BRepFill_Section.Set (method)
  Set(IsLaw: boolean): void;

  // BRepFill_Section.OriginalShape (method)
  OriginalShape(): TopoDS_Shape;

  // BRepFill_Section.Wire (method)
  Wire(): TopoDS_Wire;

  // BRepFill_Section.Vertex (method)
  Vertex(): TopoDS_Vertex;

  // BRepFill_Section.ModifiedShape (method)
  ModifiedShape(theShape: TopoDS_Shape): TopoDS_Shape;

  // BRepFill_Section.IsLaw (method)
  IsLaw(): boolean;

  // BRepFill_Section.IsPunctual (method)
  IsPunctual(): boolean;

  // BRepFill_Section.WithContact (method)
  WithContact(): boolean;

  // BRepFill_Section.WithCorrection (method)
  WithCorrection(): boolean;

  // BRepFill_Section.delete (method)
  delete(): void;

  // BRepFill_Section.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_SectionLaw: declare class BRepFill_SectionLaw extends Standard_Transient

  // BRepFill_SectionLaw.NbLaw (method)
  NbLaw(): number;

  // BRepFill_SectionLaw.Law (method)
  Law(Index: number): GeomFill_SectionLaw;

  // BRepFill_SectionLaw.IndexOfEdge (method)
  IndexOfEdge(anEdge: TopoDS_Shape): number;

  // BRepFill_SectionLaw.IsConstant (method)
  IsConstant(): boolean;

  // BRepFill_SectionLaw.IsUClosed (method)
  IsUClosed(): boolean;

  // BRepFill_SectionLaw.IsVClosed (method)
  IsVClosed(): boolean;

  // BRepFill_SectionLaw.IsDone (method)
  IsDone(): boolean;

  // BRepFill_SectionLaw.IsVertex (method)
  IsVertex(): boolean;

  // BRepFill_SectionLaw.ConcatenedLaw (method)
  ConcatenedLaw(): GeomFill_SectionLaw;

  // BRepFill_SectionLaw.Continuity (method)
  Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

  // BRepFill_SectionLaw.VertexTol (method)
  VertexTol(Index: number, Param: number): number;

  // BRepFill_SectionLaw.Vertex (method)
  Vertex(Index: number, Param: number): TopoDS_Vertex;

  // BRepFill_SectionLaw.D0 (method)
  D0(U: number, S: TopoDS_Shape): void;

  // BRepFill_SectionLaw.Init (method)
  Init(W: TopoDS_Wire): void;

  // BRepFill_SectionLaw.CurrentEdge (method)
  CurrentEdge(): TopoDS_Edge;

  // BRepFill_SectionLaw.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_SectionLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_SectionLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_SectionLaw.delete (method)
  delete(): void;

  // BRepFill_SectionLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_SectionPlacement: declare class BRepFill_SectionPlacement

  // BRepFill_SectionPlacement.constructor (constructor)
  constructor(Law: BRepFill_LocationLaw, Section: TopoDS_Shape, WithContact?: boolean, WithCorrection?: boolean);
  constructor(Law: BRepFill_LocationLaw, Section: TopoDS_Shape, Vertex: TopoDS_Shape, WithContact?: boolean, WithCorrection?: boolean);

  // BRepFill_SectionPlacement.Transformation (method)
  Transformation(): gp_Trsf;

  // BRepFill_SectionPlacement.AbscissaOnPath (method)
  AbscissaOnPath(): number;

  // BRepFill_SectionPlacement.delete (method)
  delete(): void;

  // BRepFill_SectionPlacement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_ShapeLaw: declare class BRepFill_ShapeLaw extends BRepFill_SectionLaw

  // BRepFill_ShapeLaw.constructor (constructor)
  constructor(V: TopoDS_Vertex, Build?: boolean);
  constructor(W: TopoDS_Wire, Build?: boolean);
  constructor(W: TopoDS_Wire, L: Law_Function, Build?: boolean);

  // BRepFill_ShapeLaw.IsVertex (method)
  IsVertex(): boolean;

  // BRepFill_ShapeLaw.IsConstant (method)
  IsConstant(): boolean;

  // BRepFill_ShapeLaw.ConcatenedLaw (method)
  ConcatenedLaw(): GeomFill_SectionLaw;

  // BRepFill_ShapeLaw.Continuity (method)
  Continuity(Index: number, TolAngular: number): GeomAbs_Shape;

  // BRepFill_ShapeLaw.VertexTol (method)
  VertexTol(Index: number, Param: number): number;

  // BRepFill_ShapeLaw.Vertex (method)
  Vertex(Index: number, Param: number): TopoDS_Vertex;

  // BRepFill_ShapeLaw.D0 (method)
  D0(U: number, S: TopoDS_Shape): void;

  // BRepFill_ShapeLaw.Edge (method)
  Edge(Index: number): TopoDS_Edge;

  // BRepFill_ShapeLaw.get_type_name (method)
  static get_type_name(): string;

  // BRepFill_ShapeLaw.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepFill_ShapeLaw.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepFill_ShapeLaw.delete (method)
  delete(): void;

  // BRepFill_ShapeLaw.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_Sweep: declare class BRepFill_Sweep

  // BRepFill_Sweep.constructor (constructor)
  constructor(Section: BRepFill_SectionLaw, Location: BRepFill_LocationLaw, WithKPart: boolean);

  // BRepFill_Sweep.SetBounds (method)
  SetBounds(FirstShape: TopoDS_Wire, LastShape: TopoDS_Wire): void;

  // BRepFill_Sweep.SetTolerance (method)
  SetTolerance(Tol3d: number, BoundTol?: number, Tol2d?: number, TolAngular?: number): void;

  // BRepFill_Sweep.SetAngularControl (method)
  SetAngularControl(AngleMin?: number, AngleMax?: number): void;

  // BRepFill_Sweep.SetForceApproxC1 (method)
  SetForceApproxC1(ForceApproxC1: boolean): void;

  // BRepFill_Sweep.Build (method)
  Build(ReversedEdges: NCollection_Map_TopoDS_Shape_TopTools_ShapeMapHasher, Tapes: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher, Rails: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher, Transition: BRepFill_TransitionStyle, Continuity: GeomAbs_Shape, Approx: GeomFill_ApproxStyle, Degmax: number, Segmax: number): void;

  // BRepFill_Sweep.IsDone (method)
  IsDone(): boolean;

  // BRepFill_Sweep.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepFill_Sweep.ErrorOnSurface (method)
  ErrorOnSurface(): number;

  // BRepFill_Sweep.SubShape (method)
  SubShape(): NCollection_HArray2_TopoDS_Shape;

  // BRepFill_Sweep.InterFaces (method)
  InterFaces(): NCollection_HArray2_TopoDS_Shape;

  // BRepFill_Sweep.Sections (method)
  Sections(): NCollection_HArray2_TopoDS_Shape;

  // BRepFill_Sweep.Tape (method)
  Tape(Index: number): TopoDS_Shape;

  // BRepFill_Sweep.delete (method)
  delete(): void;

  // BRepFill_Sweep.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_ThruSectionErrorStatus: typeof BRepFill_ThruSectionErrorStatus[keyof typeof BRepFill_ThruSectionErrorStatus]

  readonly BRepFill_ThruSectionErrorStatus_Done: 'BRepFill_ThruSectionErrorStatus_Done'

  readonly BRepFill_ThruSectionErrorStatus_NotDone: 'BRepFill_ThruSectionErrorStatus_NotDone'

  readonly BRepFill_ThruSectionErrorStatus_NotSameTopology: 'BRepFill_ThruSectionErrorStatus_NotSameTopology'

  readonly BRepFill_ThruSectionErrorStatus_ProfilesInconsistent: 'BRepFill_ThruSectionErrorStatus_ProfilesInconsistent'

  readonly BRepFill_ThruSectionErrorStatus_WrongUsage: 'BRepFill_ThruSectionErrorStatus_WrongUsage'

  readonly BRepFill_ThruSectionErrorStatus_Null3DCurve: 'BRepFill_ThruSectionErrorStatus_Null3DCurve'

  readonly BRepFill_ThruSectionErrorStatus_Failed: 'BRepFill_ThruSectionErrorStatus_Failed'

BRepFill_TransitionStyle: typeof BRepFill_TransitionStyle[keyof typeof BRepFill_TransitionStyle]

  readonly BRepFill_Modified: 'BRepFill_Modified'

  readonly BRepFill_Right: 'BRepFill_Right'

  readonly BRepFill_Round: 'BRepFill_Round'

BRepFill_TrimEdgeTool: declare class BRepFill_TrimEdgeTool

  // BRepFill_TrimEdgeTool.constructor (constructor)
  constructor();
  constructor(Bisec: Bisector_Bisec, S1: Geom2d_Geometry, S2: Geom2d_Geometry, Offset: number);

  // BRepFill_TrimEdgeTool.IntersectWith (method)
  IntersectWith(Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, InitShape1: TopoDS_Shape, InitShape2: TopoDS_Shape, End1: TopoDS_Vertex, End2: TopoDS_Vertex, theJoinType: GeomAbs_JoinType, IsOpenResult: boolean, Params: NCollection_Sequence_gp_Pnt): void;

  // BRepFill_TrimEdgeTool.AddOrConfuse (method)
  AddOrConfuse(Start: boolean, Edge1: TopoDS_Edge, Edge2: TopoDS_Edge, Params: NCollection_Sequence_gp_Pnt): void;

  // BRepFill_TrimEdgeTool.IsInside (method)
  IsInside(P: gp_Pnt2d): boolean;

  // BRepFill_TrimEdgeTool.delete (method)
  delete(): void;

  // BRepFill_TrimEdgeTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_TrimShellCorner: declare class BRepFill_TrimShellCorner

  // BRepFill_TrimShellCorner.constructor (constructor)
  constructor(theFaces: NCollection_HArray2_TopoDS_Shape, theTransition: BRepFill_TransitionStyle, theAxeOfBisPlane: gp_Ax2, theIntPointCrossDir: gp_Vec);

  // BRepFill_TrimShellCorner.AddBounds (method)
  AddBounds(Bounds: NCollection_HArray2_TopoDS_Shape): void;

  // BRepFill_TrimShellCorner.AddUEdges (method)
  AddUEdges(theUEdges: NCollection_HArray2_TopoDS_Shape): void;

  // BRepFill_TrimShellCorner.AddVEdges (method)
  AddVEdges(theVEdges: NCollection_HArray2_TopoDS_Shape, theIndex: number): void;

  // BRepFill_TrimShellCorner.Perform (method)
  Perform(): void;

  // BRepFill_TrimShellCorner.IsDone (method)
  IsDone(): boolean;

  // BRepFill_TrimShellCorner.HasSection (method)
  HasSection(): boolean;

  // BRepFill_TrimShellCorner.Modified (method)
  Modified(S: TopoDS_Shape, theModified: NCollection_List_TopoDS_Shape): void;

  // BRepFill_TrimShellCorner.delete (method)
  delete(): void;

  // BRepFill_TrimShellCorner.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepFill_TypeOfContact: typeof BRepFill_TypeOfContact[keyof typeof BRepFill_TypeOfContact]

  readonly BRepFill_NoContact: 'BRepFill_NoContact'

  readonly BRepFill_Contact: 'BRepFill_Contact'

  readonly BRepFill_ContactOnBorder: 'BRepFill_ContactOnBorder'

BRepFill_DataMapOfShapeHArray2OfShape: NCollection_DataMap_TopoDS_Shape_handle_NCollection_HArray2_TopoDS_Shape_TopTools_ShapeMapHasher
