# libcascade — ShapeAnalysis

16 top-level symbols. Signatures are verbatim typescript.

ShapeAnalysis: declare class ShapeAnalysis

  // ShapeAnalysis.constructor (constructor)
  constructor();

  // ShapeAnalysis.OuterWire (method)
  static OuterWire(theFace: TopoDS_Face): TopoDS_Wire;

  // ShapeAnalysis.TotCross2D (method)
  static TotCross2D(sewd: ShapeExtend_WireData, aFace: TopoDS_Face): number;

  // ShapeAnalysis.ContourArea (method)
  static ContourArea(theWire: TopoDS_Wire): number;

  // ShapeAnalysis.IsOuterBound (method)
  static IsOuterBound(face: TopoDS_Face): boolean;

  // ShapeAnalysis.AdjustByPeriod (method)
  static AdjustByPeriod(Val: number, ToVal: number, Period: number): number;

  // ShapeAnalysis.AdjustToPeriod (method)
  static AdjustToPeriod(Val: number, ValMin: number, ValMax: number): number;

  // ShapeAnalysis.FindBounds (method)
  static FindBounds(shape: TopoDS_Shape, V1: TopoDS_Vertex, V2: TopoDS_Vertex): void;

  // ShapeAnalysis.GetFaceUVBounds (method)
  static GetFaceUVBounds(F: TopoDS_Face, Umin?: number, Umax?: number, Vmin?: number, Vmax?: number): { Umin: number; Umax: number; Vmin: number; Vmax: number };

  // ShapeAnalysis.delete (method)
  delete(): void;

  // ShapeAnalysis.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_BoxBndTreeSelector: declare class ShapeAnalysis_BoxBndTreeSelector

  // ShapeAnalysis_BoxBndTreeSelector.constructor (constructor)
  constructor(theSeq: NCollection_HArray1_TopoDS_Shape, theShared: boolean);

  // ShapeAnalysis_BoxBndTreeSelector.DefineBoxes (method)
  DefineBoxes(theFBox: Bnd_Box, theLBox: Bnd_Box): void;

  // ShapeAnalysis_BoxBndTreeSelector.DefineVertexes (method)
  DefineVertexes(theVf: TopoDS_Vertex, theVl: TopoDS_Vertex): void;

  // ShapeAnalysis_BoxBndTreeSelector.DefinePnt (method)
  DefinePnt(theFPnt: gp_Pnt, theLPnt: gp_Pnt): void;

  // ShapeAnalysis_BoxBndTreeSelector.GetNb (method)
  GetNb(): number;

  // ShapeAnalysis_BoxBndTreeSelector.SetNb (method)
  SetNb(theNb: number): void;

  // ShapeAnalysis_BoxBndTreeSelector.LoadList (method)
  LoadList(elem: number): void;

  // ShapeAnalysis_BoxBndTreeSelector.SetStop (method)
  SetStop(): void;

  // ShapeAnalysis_BoxBndTreeSelector.SetTolerance (method)
  SetTolerance(theTol: number): void;

  // ShapeAnalysis_BoxBndTreeSelector.ContWire (method)
  ContWire(nbWire: number): boolean;

  // ShapeAnalysis_BoxBndTreeSelector.LastCheckStatus (method)
  LastCheckStatus(theStatus: ShapeExtend_Status): boolean;

  // ShapeAnalysis_BoxBndTreeSelector.Reject (method)
  Reject(argNo0: Bnd_Box): boolean;

  // ShapeAnalysis_BoxBndTreeSelector.Accept (method)
  Accept(argNo0: number): boolean;

  // ShapeAnalysis_BoxBndTreeSelector.delete (method)
  delete(): void;

  // ShapeAnalysis_BoxBndTreeSelector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_CanonicalRecognition: declare class ShapeAnalysis_CanonicalRecognition

  // ShapeAnalysis_CanonicalRecognition.constructor (constructor)
  constructor();
  constructor(theShape: TopoDS_Shape);

  // ShapeAnalysis_CanonicalRecognition.SetShape (method)
  SetShape(theShape: TopoDS_Shape): void;

  // ShapeAnalysis_CanonicalRecognition.GetShape (method)
  GetShape(): TopoDS_Shape;

  // ShapeAnalysis_CanonicalRecognition.GetGap (method)
  GetGap(): number;

  // ShapeAnalysis_CanonicalRecognition.GetStatus (method)
  GetStatus(): number;

  // ShapeAnalysis_CanonicalRecognition.ClearStatus (method)
  ClearStatus(): void;

  // ShapeAnalysis_CanonicalRecognition.IsPlane (method)
  IsPlane(theTol: number, thePln: gp_Pln): boolean;

  // ShapeAnalysis_CanonicalRecognition.IsCylinder (method)
  IsCylinder(theTol: number, theCyl: gp_Cylinder): boolean;

  // ShapeAnalysis_CanonicalRecognition.IsCone (method)
  IsCone(theTol: number, theCone: gp_Cone): boolean;

  // ShapeAnalysis_CanonicalRecognition.IsSphere (method)
  IsSphere(theTol: number, theSphere: gp_Sphere): boolean;

  // ShapeAnalysis_CanonicalRecognition.IsLine (method)
  IsLine(theTol: number, theLin: gp_Lin): boolean;

  // ShapeAnalysis_CanonicalRecognition.IsCircle (method)
  IsCircle(theTol: number, theCirc: gp_Circ): boolean;

  // ShapeAnalysis_CanonicalRecognition.IsEllipse (method)
  IsEllipse(theTol: number, theElips: gp_Elips): boolean;

  // ShapeAnalysis_CanonicalRecognition.delete (method)
  delete(): void;

  // ShapeAnalysis_CanonicalRecognition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_CheckSmallFace: declare class ShapeAnalysis_CheckSmallFace

  // ShapeAnalysis_CheckSmallFace.constructor (constructor)
  constructor();

  // ShapeAnalysis_CheckSmallFace.IsSpotFace (method)
  IsSpotFace(F: TopoDS_Face, spot: gp_Pnt, spotol: number, tol: number): { returnValue: number; spotol: number };

  // ShapeAnalysis_CheckSmallFace.CheckSpotFace (method)
  CheckSpotFace(F: TopoDS_Face, tol?: number): boolean;

  // ShapeAnalysis_CheckSmallFace.IsStripSupport (method)
  IsStripSupport(F: TopoDS_Face, tol?: number): boolean;

  // ShapeAnalysis_CheckSmallFace.CheckStripEdges (method)
  CheckStripEdges(E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number, dmax?: number): { returnValue: boolean; dmax: number };

  // ShapeAnalysis_CheckSmallFace.FindStripEdges (method)
  FindStripEdges(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number, dmax?: number): { returnValue: boolean; dmax: number };

  // ShapeAnalysis_CheckSmallFace.CheckSingleStrip (method)
  CheckSingleStrip(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;

  // ShapeAnalysis_CheckSmallFace.CheckStripFace (method)
  CheckStripFace(F: TopoDS_Face, E1: TopoDS_Edge, E2: TopoDS_Edge, tol: number): boolean;

  // ShapeAnalysis_CheckSmallFace.CheckSplittingVertices (method)
  CheckSplittingVertices(F: TopoDS_Face, MapEdges: NCollection_DataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher, MapParam: NCollection_DataMap_TopoDS_Shape_NCollection_List_double_TopTools_ShapeMapHasher, theAllVert: TopoDS_Compound): number;

  // ShapeAnalysis_CheckSmallFace.CheckPin (method)
  CheckPin(F: TopoDS_Face, whatrow?: number, sence?: number): { returnValue: boolean; whatrow: number; sence: number };

  // ShapeAnalysis_CheckSmallFace.CheckTwisted (method)
  CheckTwisted(F: TopoDS_Face, paramu?: number, paramv?: number): { returnValue: boolean; paramu: number; paramv: number };

  // ShapeAnalysis_CheckSmallFace.CheckPinFace (method)
  CheckPinFace(F: TopoDS_Face, mapEdges: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher, toler: number): boolean;

  // ShapeAnalysis_CheckSmallFace.CheckPinEdges (method)
  CheckPinEdges(theFirstEdge: TopoDS_Edge, theSecondEdge: TopoDS_Edge, coef1: number, coef2: number, toler: number): boolean;

  // ShapeAnalysis_CheckSmallFace.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.SetTolerance (method)
  SetTolerance(tol: number): void;

  // ShapeAnalysis_CheckSmallFace.Tolerance (method)
  Tolerance(): number;

  // ShapeAnalysis_CheckSmallFace.StatusSpot (method)
  StatusSpot(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.StatusStrip (method)
  StatusStrip(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.StatusPin (method)
  StatusPin(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.StatusTwisted (method)
  StatusTwisted(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.StatusSplitVert (method)
  StatusSplitVert(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.StatusPinFace (method)
  StatusPinFace(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.StatusPinEdges (method)
  StatusPinEdges(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_CheckSmallFace.delete (method)
  delete(): void;

  // ShapeAnalysis_CheckSmallFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_Curve: declare class ShapeAnalysis_Curve

  // ShapeAnalysis_Curve.constructor (constructor)
  constructor();

  // ShapeAnalysis_Curve.Project (method)
  Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
  Project(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, AdjustToEnds: boolean): { returnValue: number; param: number };
  Project(C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };

  // ShapeAnalysis_Curve.ProjectAct (method)
  ProjectAct(C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };

  // ShapeAnalysis_Curve.NextProject (method)
  NextProject(paramPrev: number, C3D: Geom_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param: number, cf: number, cl: number, AdjustToEnds: boolean): { returnValue: number; param: number };
  NextProject(paramPrev: number, C3D: Adaptor3d_Curve, P3D: gp_Pnt, preci: number, proj: gp_Pnt, param?: number): { returnValue: number; param: number };

  // ShapeAnalysis_Curve.ValidateRange (method)
  ValidateRange(Crv: Geom_Curve, First: number, Last: number, prec: number): { returnValue: boolean; First: number; Last: number };

  // ShapeAnalysis_Curve.FillBndBox (method)
  FillBndBox(C2d: Geom2d_Curve, First: number, Last: number, NPoints: number, Exact: boolean, Box: Bnd_Box2d): void;

  // ShapeAnalysis_Curve.SelectForwardSeam (method)
  SelectForwardSeam(C1: Geom2d_Curve, C2: Geom2d_Curve): number;

  // ShapeAnalysis_Curve.IsPlanar (method)
  static IsPlanar(pnts: NCollection_Array1_gp_Pnt, Normal: gp_XYZ, preci: number): boolean;
  static IsPlanar(curve: Geom_Curve, Normal: gp_XYZ, preci: number): boolean;

  // ShapeAnalysis_Curve.GetSamplePoints (method)
  static GetSamplePoints(curve: Geom2d_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt2d): boolean;
  static GetSamplePoints(curve: Geom_Curve, first: number, last: number, seq: NCollection_Sequence_gp_Pnt): boolean;

  // ShapeAnalysis_Curve.IsClosed (method)
  static IsClosed(curve: Geom_Curve, preci?: number): boolean;

  // ShapeAnalysis_Curve.IsPeriodic (method)
  static IsPeriodic(curve: Geom_Curve): boolean;
  static IsPeriodic(curve: Geom2d_Curve): boolean;

  // ShapeAnalysis_Curve.delete (method)
  delete(): void;

  // ShapeAnalysis_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_Edge: declare class ShapeAnalysis_Edge

  // ShapeAnalysis_Edge.constructor (constructor)
  constructor();

  // ShapeAnalysis_Edge.HasCurve3d (method)
  HasCurve3d(edge: TopoDS_Edge): boolean;

  // ShapeAnalysis_Edge.Curve3d (method)
  Curve3d(edge: TopoDS_Edge, cf: number, cl: number, orient: boolean): { returnValue: boolean; C3d: Geom_Curve; cf: number; cl: number; [Symbol.dispose](): void };

  // ShapeAnalysis_Edge.IsClosed3d (method)
  IsClosed3d(edge: TopoDS_Edge): boolean;

  // ShapeAnalysis_Edge.HasPCurve (method)
  HasPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
  HasPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

  // ShapeAnalysis_Edge.PCurve (method)
  PCurve(edge: TopoDS_Edge, face: TopoDS_Face, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };
  PCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, cf: number, cl: number, orient: boolean): { returnValue: boolean; C2d: Geom2d_Curve; cf: number; cl: number; [Symbol.dispose](): void };

  // ShapeAnalysis_Edge.BoundUV (method)
  BoundUV(edge: TopoDS_Edge, face: TopoDS_Face, first: gp_Pnt2d, last: gp_Pnt2d): boolean;
  BoundUV(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, first: gp_Pnt2d, last: gp_Pnt2d): boolean;

  // ShapeAnalysis_Edge.IsSeam (method)
  IsSeam(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
  IsSeam(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

  // ShapeAnalysis_Edge.FirstVertex (method)
  FirstVertex(edge: TopoDS_Edge): TopoDS_Vertex;

  // ShapeAnalysis_Edge.LastVertex (method)
  LastVertex(edge: TopoDS_Edge): TopoDS_Vertex;

  // ShapeAnalysis_Edge.GetEndTangent2d (method)
  GetEndTangent2d(edge: TopoDS_Edge, face: TopoDS_Face, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;
  GetEndTangent2d(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, atEnd: boolean, pos: gp_Pnt2d, tang: gp_Vec2d, dparam: number): boolean;

  // ShapeAnalysis_Edge.CheckVerticesWithCurve3d (method)
  CheckVerticesWithCurve3d(edge: TopoDS_Edge, preci?: number, vtx?: number): boolean;

  // ShapeAnalysis_Edge.CheckVerticesWithPCurve (method)
  CheckVerticesWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face, preci: number, vtx: number): boolean;
  CheckVerticesWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location, preci: number, vtx: number): boolean;

  // ShapeAnalysis_Edge.CheckVertexTolerance (method)
  CheckVertexTolerance(edge: TopoDS_Edge, face: TopoDS_Face, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };
  CheckVertexTolerance(edge: TopoDS_Edge, toler1?: number, toler2?: number): { returnValue: boolean; toler1: number; toler2: number };

  // ShapeAnalysis_Edge.CheckCurve3dWithPCurve (method)
  CheckCurve3dWithPCurve(edge: TopoDS_Edge, face: TopoDS_Face): boolean;
  CheckCurve3dWithPCurve(edge: TopoDS_Edge, surface: Geom_Surface, location: TopLoc_Location): boolean;

  // ShapeAnalysis_Edge.Status (method)
  Status(status: ShapeExtend_Status): boolean;

  // ShapeAnalysis_Edge.CheckSameParameter (method)
  CheckSameParameter(edge: TopoDS_Edge, maxdev: number, NbControl: number): { returnValue: boolean; maxdev: number };
  CheckSameParameter(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theMaxdev: number, theNbControl: number): { returnValue: boolean; theMaxdev: number };

  // ShapeAnalysis_Edge.CheckPCurveRange (method)
  CheckPCurveRange(theFirst: number, theLast: number, thePC: Geom2d_Curve): boolean;

  // ShapeAnalysis_Edge.CheckOverlapping (method)
  CheckOverlapping(theEdge1: TopoDS_Edge, theEdge2: TopoDS_Edge, theTolOverlap: number, theDomainDist: number): { returnValue: boolean; theTolOverlap: number };

  // ShapeAnalysis_Edge.delete (method)
  delete(): void;

  // ShapeAnalysis_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_FreeBoundData: declare class ShapeAnalysis_FreeBoundData extends Standard_Transient

  // ShapeAnalysis_FreeBoundData.constructor (constructor)
  constructor();
  constructor(freebound: TopoDS_Wire);

  // ShapeAnalysis_FreeBoundData.Clear (method)
  Clear(): void;

  // ShapeAnalysis_FreeBoundData.SetFreeBound (method)
  SetFreeBound(freebound: TopoDS_Wire): void;

  // ShapeAnalysis_FreeBoundData.SetArea (method)
  SetArea(area: number): void;

  // ShapeAnalysis_FreeBoundData.SetPerimeter (method)
  SetPerimeter(perimeter: number): void;

  // ShapeAnalysis_FreeBoundData.SetRatio (method)
  SetRatio(ratio: number): void;

  // ShapeAnalysis_FreeBoundData.SetWidth (method)
  SetWidth(width: number): void;

  // ShapeAnalysis_FreeBoundData.AddNotch (method)
  AddNotch(notch: TopoDS_Wire, width: number): void;

  // ShapeAnalysis_FreeBoundData.FreeBound (method)
  FreeBound(): TopoDS_Wire;

  // ShapeAnalysis_FreeBoundData.Area (method)
  Area(): number;

  // ShapeAnalysis_FreeBoundData.Perimeter (method)
  Perimeter(): number;

  // ShapeAnalysis_FreeBoundData.Ratio (method)
  Ratio(): number;

  // ShapeAnalysis_FreeBoundData.Width (method)
  Width(): number;

  // ShapeAnalysis_FreeBoundData.NbNotches (method)
  NbNotches(): number;

  // ShapeAnalysis_FreeBoundData.Notches (method)
  Notches(): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_FreeBoundData.Notch (method)
  Notch(index: number): TopoDS_Wire;

  // ShapeAnalysis_FreeBoundData.NotchWidth (method)
  NotchWidth(index: number): number;
  NotchWidth(notch: TopoDS_Wire): number;

  // ShapeAnalysis_FreeBoundData.get_type_name (method)
  static get_type_name(): string;

  // ShapeAnalysis_FreeBoundData.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeAnalysis_FreeBoundData.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeAnalysis_FreeBoundData.delete (method)
  delete(): void;

  // ShapeAnalysis_FreeBoundData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_FreeBounds: declare class ShapeAnalysis_FreeBounds

  // ShapeAnalysis_FreeBounds.constructor (constructor)
  constructor();
  constructor(shape: TopoDS_Shape, toler: number, splitclosed?: boolean, splitopen?: boolean);
  constructor(shape: TopoDS_Shape, splitclosed?: boolean, splitopen?: boolean, checkinternaledges?: boolean);

  // ShapeAnalysis_FreeBounds.GetClosedWires (method)
  GetClosedWires(): TopoDS_Compound;

  // ShapeAnalysis_FreeBounds.GetOpenWires (method)
  GetOpenWires(): TopoDS_Compound;

  // ShapeAnalysis_FreeBounds.ConnectEdgesToWires (method)
  static ConnectEdgesToWires(edges: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_FreeBounds.ConnectWiresToWires (method)
  static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): NCollection_HSequence_TopoDS_Shape;
  static ConnectWiresToWires(iwires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean, vertices: NCollection_DataMap_TopoDS_Shape_TopoDS_Shape_TopTools_ShapeMapHasher): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_FreeBounds.SplitWires (method)
  static SplitWires(wires: NCollection_HSequence_TopoDS_Shape, toler: number, shared: boolean): { closed: NCollection_HSequence_TopoDS_Shape; open: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

  // ShapeAnalysis_FreeBounds.DispatchWires (method)
  static DispatchWires(wires: NCollection_HSequence_TopoDS_Shape, closed: TopoDS_Compound, open: TopoDS_Compound): void;

  // ShapeAnalysis_FreeBounds.delete (method)
  delete(): void;

  // ShapeAnalysis_FreeBounds.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_FreeBoundsProperties: declare class ShapeAnalysis_FreeBoundsProperties

  // ShapeAnalysis_FreeBoundsProperties.constructor (constructor)
  constructor();
  constructor(shape: TopoDS_Shape, splitclosed?: boolean, splitopen?: boolean);
  constructor(shape: TopoDS_Shape, tolerance: number, splitclosed?: boolean, splitopen?: boolean);

  // ShapeAnalysis_FreeBoundsProperties.Init (method)
  Init(shape: TopoDS_Shape, tolerance: number, splitclosed: boolean, splitopen: boolean): void;
  Init(shape: TopoDS_Shape, splitclosed: boolean, splitopen: boolean): void;

  // ShapeAnalysis_FreeBoundsProperties.Perform (method)
  Perform(): boolean;

  // ShapeAnalysis_FreeBoundsProperties.IsLoaded (method)
  IsLoaded(): boolean;

  // ShapeAnalysis_FreeBoundsProperties.Shape (method)
  Shape(): TopoDS_Shape;

  // ShapeAnalysis_FreeBoundsProperties.Tolerance (method)
  Tolerance(): number;

  // ShapeAnalysis_FreeBoundsProperties.NbFreeBounds (method)
  NbFreeBounds(): number;

  // ShapeAnalysis_FreeBoundsProperties.NbClosedFreeBounds (method)
  NbClosedFreeBounds(): number;

  // ShapeAnalysis_FreeBoundsProperties.NbOpenFreeBounds (method)
  NbOpenFreeBounds(): number;

  // ShapeAnalysis_FreeBoundsProperties.ClosedFreeBounds (method)
  ClosedFreeBounds(): NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData;

  // ShapeAnalysis_FreeBoundsProperties.OpenFreeBounds (method)
  OpenFreeBounds(): NCollection_HSequence_handle_ShapeAnalysis_FreeBoundData;

  // ShapeAnalysis_FreeBoundsProperties.ClosedFreeBound (method)
  ClosedFreeBound(index: number): ShapeAnalysis_FreeBoundData;

  // ShapeAnalysis_FreeBoundsProperties.OpenFreeBound (method)
  OpenFreeBound(index: number): ShapeAnalysis_FreeBoundData;

  // ShapeAnalysis_FreeBoundsProperties.DispatchBounds (method)
  DispatchBounds(): boolean;

  // ShapeAnalysis_FreeBoundsProperties.CheckContours (method)
  CheckContours(prec?: number): boolean;

  // ShapeAnalysis_FreeBoundsProperties.CheckNotches (method)
  CheckNotches(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };
  CheckNotches(freebound: TopoDS_Wire, num: number, notch: TopoDS_Wire, distMax: number, prec: number): { returnValue: boolean; distMax: number };

  // ShapeAnalysis_FreeBoundsProperties.FillProperties (method)
  FillProperties(prec: number): { returnValue: boolean; fbData: ShapeAnalysis_FreeBoundData; [Symbol.dispose](): void };

  // ShapeAnalysis_FreeBoundsProperties.delete (method)
  delete(): void;

  // ShapeAnalysis_FreeBoundsProperties.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_Geom: declare class ShapeAnalysis_Geom

  // ShapeAnalysis_Geom.constructor (constructor)
  constructor();

  // ShapeAnalysis_Geom.NearestPlane (method)
  static NearestPlane(Pnts: NCollection_Array1_gp_Pnt, aPln: gp_Pln, Dmax?: number): { returnValue: boolean; Dmax: number };

  // ShapeAnalysis_Geom.PositionTrsf (method)
  static PositionTrsf(coefs: NCollection_HArray2_double, trsf: gp_Trsf, unit: number, prec: number): boolean;

  // ShapeAnalysis_Geom.delete (method)
  delete(): void;

  // ShapeAnalysis_Geom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_ShapeContents: declare class ShapeAnalysis_ShapeContents

  // ShapeAnalysis_ShapeContents.constructor (constructor)
  constructor();

  // ShapeAnalysis_ShapeContents.Clear (method)
  Clear(): void;

  // ShapeAnalysis_ShapeContents.ClearFlags (method)
  ClearFlags(): void;

  // ShapeAnalysis_ShapeContents.Perform (method)
  Perform(shape: TopoDS_Shape): void;

  // ShapeAnalysis_ShapeContents.ModifyBigSplineMode (method)
  ModifyBigSplineMode(): boolean;

  // ShapeAnalysis_ShapeContents.ModifyIndirectMode (method)
  ModifyIndirectMode(): boolean;

  // ShapeAnalysis_ShapeContents.ModifyOffsetSurfaceMode (method)
  ModifyOffsetSurfaceMode(): boolean;

  // ShapeAnalysis_ShapeContents.ModifyTrimmed3dMode (method)
  ModifyTrimmed3dMode(): boolean;

  // ShapeAnalysis_ShapeContents.ModifyOffsetCurveMode (method)
  ModifyOffsetCurveMode(): boolean;

  // ShapeAnalysis_ShapeContents.ModifyTrimmed2dMode (method)
  ModifyTrimmed2dMode(): boolean;

  // ShapeAnalysis_ShapeContents.NbSolids (method)
  NbSolids(): number;

  // ShapeAnalysis_ShapeContents.NbShells (method)
  NbShells(): number;

  // ShapeAnalysis_ShapeContents.NbFaces (method)
  NbFaces(): number;

  // ShapeAnalysis_ShapeContents.NbWires (method)
  NbWires(): number;

  // ShapeAnalysis_ShapeContents.NbEdges (method)
  NbEdges(): number;

  // ShapeAnalysis_ShapeContents.NbVertices (method)
  NbVertices(): number;

  // ShapeAnalysis_ShapeContents.NbSolidsWithVoids (method)
  NbSolidsWithVoids(): number;

  // ShapeAnalysis_ShapeContents.NbBigSplines (method)
  NbBigSplines(): number;

  // ShapeAnalysis_ShapeContents.NbC0Surfaces (method)
  NbC0Surfaces(): number;

  // ShapeAnalysis_ShapeContents.NbC0Curves (method)
  NbC0Curves(): number;

  // ShapeAnalysis_ShapeContents.NbOffsetSurf (method)
  NbOffsetSurf(): number;

  // ShapeAnalysis_ShapeContents.NbIndirectSurf (method)
  NbIndirectSurf(): number;

  // ShapeAnalysis_ShapeContents.NbOffsetCurves (method)
  NbOffsetCurves(): number;

  // ShapeAnalysis_ShapeContents.NbTrimmedCurve2d (method)
  NbTrimmedCurve2d(): number;

  // ShapeAnalysis_ShapeContents.NbTrimmedCurve3d (method)
  NbTrimmedCurve3d(): number;

  // ShapeAnalysis_ShapeContents.NbBSplibeSurf (method)
  NbBSplibeSurf(): number;

  // ShapeAnalysis_ShapeContents.NbBezierSurf (method)
  NbBezierSurf(): number;

  // ShapeAnalysis_ShapeContents.NbTrimSurf (method)
  NbTrimSurf(): number;

  // ShapeAnalysis_ShapeContents.NbWireWitnSeam (method)
  NbWireWitnSeam(): number;

  // ShapeAnalysis_ShapeContents.NbWireWithSevSeams (method)
  NbWireWithSevSeams(): number;

  // ShapeAnalysis_ShapeContents.NbFaceWithSevWires (method)
  NbFaceWithSevWires(): number;

  // ShapeAnalysis_ShapeContents.NbNoPCurve (method)
  NbNoPCurve(): number;

  // ShapeAnalysis_ShapeContents.NbFreeFaces (method)
  NbFreeFaces(): number;

  // ShapeAnalysis_ShapeContents.NbFreeWires (method)
  NbFreeWires(): number;

  // ShapeAnalysis_ShapeContents.NbFreeEdges (method)
  NbFreeEdges(): number;

  // ShapeAnalysis_ShapeContents.NbSharedSolids (method)
  NbSharedSolids(): number;

  // ShapeAnalysis_ShapeContents.NbSharedShells (method)
  NbSharedShells(): number;

  // ShapeAnalysis_ShapeContents.NbSharedFaces (method)
  NbSharedFaces(): number;

  // ShapeAnalysis_ShapeContents.NbSharedWires (method)
  NbSharedWires(): number;

  // ShapeAnalysis_ShapeContents.NbSharedFreeWires (method)
  NbSharedFreeWires(): number;

  // ShapeAnalysis_ShapeContents.NbSharedFreeEdges (method)
  NbSharedFreeEdges(): number;

  // ShapeAnalysis_ShapeContents.NbSharedEdges (method)
  NbSharedEdges(): number;

  // ShapeAnalysis_ShapeContents.NbSharedVertices (method)
  NbSharedVertices(): number;

  // ShapeAnalysis_ShapeContents.BigSplineSec (method)
  BigSplineSec(): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_ShapeContents.IndirectSec (method)
  IndirectSec(): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_ShapeContents.OffsetSurfaceSec (method)
  OffsetSurfaceSec(): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_ShapeContents.Trimmed3dSec (method)
  Trimmed3dSec(): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_ShapeContents.OffsetCurveSec (method)
  OffsetCurveSec(): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_ShapeContents.Trimmed2dSec (method)
  Trimmed2dSec(): NCollection_HSequence_TopoDS_Shape;

  // DEPRECATED
  // ShapeAnalysis_ShapeContents.ModifyOffestSurfaceMode (method)
  ModifyOffestSurfaceMode(): boolean;

  // ShapeAnalysis_ShapeContents.delete (method)
  delete(): void;

  // ShapeAnalysis_ShapeContents.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_ShapeTolerance: declare class ShapeAnalysis_ShapeTolerance

  // ShapeAnalysis_ShapeTolerance.constructor (constructor)
  constructor();

  // ShapeAnalysis_ShapeTolerance.Tolerance (method)
  Tolerance(shape: TopoDS_Shape, mode: number, type_?: TopAbs_ShapeEnum): number;

  // ShapeAnalysis_ShapeTolerance.OverTolerance (method)
  OverTolerance(shape: TopoDS_Shape, value: number, type_?: TopAbs_ShapeEnum): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_ShapeTolerance.InTolerance (method)
  InTolerance(shape: TopoDS_Shape, valmin: number, valmax: number, type_?: TopAbs_ShapeEnum): NCollection_HSequence_TopoDS_Shape;

  // ShapeAnalysis_ShapeTolerance.InitTolerance (method)
  InitTolerance(): void;

  // ShapeAnalysis_ShapeTolerance.AddTolerance (method)
  AddTolerance(shape: TopoDS_Shape, type_?: TopAbs_ShapeEnum): void;

  // ShapeAnalysis_ShapeTolerance.GlobalTolerance (method)
  GlobalTolerance(mode: number): number;

  // ShapeAnalysis_ShapeTolerance.delete (method)
  delete(): void;

  // ShapeAnalysis_ShapeTolerance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_Shell: declare class ShapeAnalysis_Shell

  // ShapeAnalysis_Shell.constructor (constructor)
  constructor();

  // ShapeAnalysis_Shell.Clear (method)
  Clear(): void;

  // ShapeAnalysis_Shell.LoadShells (method)
  LoadShells(shape: TopoDS_Shape): void;

  // ShapeAnalysis_Shell.CheckOrientedShells (method)
  CheckOrientedShells(shape: TopoDS_Shape, alsofree?: boolean, checkinternaledges?: boolean): boolean;

  // ShapeAnalysis_Shell.IsLoaded (method)
  IsLoaded(shape: TopoDS_Shape): boolean;

  // ShapeAnalysis_Shell.NbLoaded (method)
  NbLoaded(): number;

  // ShapeAnalysis_Shell.Loaded (method)
  Loaded(num: number): TopoDS_Shape;

  // ShapeAnalysis_Shell.HasBadEdges (method)
  HasBadEdges(): boolean;

  // ShapeAnalysis_Shell.BadEdges (method)
  BadEdges(): TopoDS_Compound;

  // ShapeAnalysis_Shell.HasFreeEdges (method)
  HasFreeEdges(): boolean;

  // ShapeAnalysis_Shell.FreeEdges (method)
  FreeEdges(): TopoDS_Compound;

  // ShapeAnalysis_Shell.HasConnectedEdges (method)
  HasConnectedEdges(): boolean;

  // ShapeAnalysis_Shell.delete (method)
  delete(): void;

  // ShapeAnalysis_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_Surface: declare class ShapeAnalysis_Surface extends Standard_Transient

  // ShapeAnalysis_Surface.constructor (constructor)
  constructor(S: Geom_Surface);

  // ShapeAnalysis_Surface.Init (method)
  Init(S: Geom_Surface): void;
  Init(other: ShapeAnalysis_Surface): void;

  // ShapeAnalysis_Surface.SetDomain (method)
  SetDomain(U1: number, U2: number, V1: number, V2: number): void;

  // ShapeAnalysis_Surface.Surface (method)
  Surface(): Geom_Surface;

  // ShapeAnalysis_Surface.Adaptor3d (method)
  Adaptor3d(): GeomAdaptor_Surface;

  // ShapeAnalysis_Surface.TrueAdaptor3d (method)
  TrueAdaptor3d(): GeomAdaptor_Surface;

  // ShapeAnalysis_Surface.Gap (method)
  Gap(): number;

  // ShapeAnalysis_Surface.Value (method)
  Value(u: number, v: number): gp_Pnt;
  Value(p2d: gp_Pnt2d): gp_Pnt;

  // ShapeAnalysis_Surface.HasSingularities (method)
  HasSingularities(preci: number): boolean;

  // ShapeAnalysis_Surface.NbSingularities (method)
  NbSingularities(preci: number): number;

  // ShapeAnalysis_Surface.Singularity (method)
  Singularity(num: number, preci: number, P3d: gp_Pnt, firstP2d: gp_Pnt2d, lastP2d: gp_Pnt2d, firstpar?: number, lastpar?: number, uisodeg?: boolean): { returnValue: boolean; preci: number; firstpar: number; lastpar: number; uisodeg: boolean };

  // ShapeAnalysis_Surface.IsDegenerated (method)
  IsDegenerated(P3d: gp_Pnt, preci: number): boolean;
  IsDegenerated(p2d1: gp_Pnt2d, p2d2: gp_Pnt2d, tol: number, ratio: number): boolean;

  // ShapeAnalysis_Surface.DegeneratedValues (method)
  DegeneratedValues(P3d: gp_Pnt, preci: number, firstP2d: gp_Pnt2d, lastP2d: gp_Pnt2d, firstpar: number, lastpar: number, forward: boolean): { returnValue: boolean; firstpar: number; lastpar: number };

  // ShapeAnalysis_Surface.ProjectDegenerated (method)
  ProjectDegenerated(P3d: gp_Pnt, preci: number, neighbour: gp_Pnt2d, result: gp_Pnt2d): boolean;
  ProjectDegenerated(nbrPnt: number, points: NCollection_Sequence_gp_Pnt, pnt2d: NCollection_Sequence_gp_Pnt2d, preci: number, direct: boolean): boolean;

  // ShapeAnalysis_Surface.Bounds (method)
  Bounds(ufirst?: number, ulast?: number, vfirst?: number, vlast?: number): { ufirst: number; ulast: number; vfirst: number; vlast: number };

  // ShapeAnalysis_Surface.ComputeBoundIsos (method)
  ComputeBoundIsos(): void;

  // ShapeAnalysis_Surface.UIso (method)
  UIso(U: number): Geom_Curve;

  // ShapeAnalysis_Surface.VIso (method)
  VIso(V: number): Geom_Curve;

  // ShapeAnalysis_Surface.IsUClosed (method)
  IsUClosed(preci?: number): boolean;

  // ShapeAnalysis_Surface.IsVClosed (method)
  IsVClosed(preci?: number): boolean;

  // ShapeAnalysis_Surface.ValueOfUV (method)
  ValueOfUV(P3D: gp_Pnt, preci: number): gp_Pnt2d;

  // ShapeAnalysis_Surface.NextValueOfUV (method)
  NextValueOfUV(p2dPrev: gp_Pnt2d, P3D: gp_Pnt, preci: number, maxpreci?: number): gp_Pnt2d;

  // ShapeAnalysis_Surface.UVFromIso (method)
  UVFromIso(P3D: gp_Pnt, preci: number, U?: number, V?: number): { returnValue: number; U: number; V: number };

  // ShapeAnalysis_Surface.UCloseVal (method)
  UCloseVal(): number;

  // ShapeAnalysis_Surface.VCloseVal (method)
  VCloseVal(): number;

  // ShapeAnalysis_Surface.GetBoxUF (method)
  GetBoxUF(): Bnd_Box;

  // ShapeAnalysis_Surface.GetBoxUL (method)
  GetBoxUL(): Bnd_Box;

  // ShapeAnalysis_Surface.GetBoxVF (method)
  GetBoxVF(): Bnd_Box;

  // ShapeAnalysis_Surface.GetBoxVL (method)
  GetBoxVL(): Bnd_Box;

  // ShapeAnalysis_Surface.get_type_name (method)
  static get_type_name(): string;

  // ShapeAnalysis_Surface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeAnalysis_Surface.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeAnalysis_Surface.delete (method)
  delete(): void;

  // ShapeAnalysis_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_TransferParameters: declare class ShapeAnalysis_TransferParameters extends Standard_Transient

  // ShapeAnalysis_TransferParameters.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge, F: TopoDS_Face);

  // ShapeAnalysis_TransferParameters.Init (method)
  Init(E: TopoDS_Edge, F: TopoDS_Face): void;

  // ShapeAnalysis_TransferParameters.SetMaxTolerance (method)
  SetMaxTolerance(maxtol: number): void;

  // ShapeAnalysis_TransferParameters.Perform (method)
  Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
  Perform(Param: number, To2d: boolean): number;

  // ShapeAnalysis_TransferParameters.TransferRange (method)
  TransferRange(newEdge: TopoDS_Edge, prevPar: number, currPar: number, To2d: boolean): void;

  // ShapeAnalysis_TransferParameters.IsSameRange (method)
  IsSameRange(): boolean;

  // ShapeAnalysis_TransferParameters.get_type_name (method)
  static get_type_name(): string;

  // ShapeAnalysis_TransferParameters.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeAnalysis_TransferParameters.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeAnalysis_TransferParameters.delete (method)
  delete(): void;

  // ShapeAnalysis_TransferParameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

ShapeAnalysis_TransferParametersProj: declare class ShapeAnalysis_TransferParametersProj extends ShapeAnalysis_TransferParameters

  // ShapeAnalysis_TransferParametersProj.constructor (constructor)
  constructor();
  constructor(E: TopoDS_Edge, F: TopoDS_Face);

  // ShapeAnalysis_TransferParametersProj.Init (method)
  Init(E: TopoDS_Edge, F: TopoDS_Face): void;

  // ShapeAnalysis_TransferParametersProj.Perform (method)
  Perform(Params: NCollection_HSequence_double, To2d: boolean): NCollection_HSequence_double;
  Perform(Param: number, To2d: boolean): number;

  // ShapeAnalysis_TransferParametersProj.ForceProjection (method)
  ForceProjection(): boolean;

  // ShapeAnalysis_TransferParametersProj.TransferRange (method)
  TransferRange(newEdge: TopoDS_Edge, prevPar: number, currPar: number, To2d: boolean): void;

  // ShapeAnalysis_TransferParametersProj.IsSameRange (method)
  IsSameRange(): boolean;

  // ShapeAnalysis_TransferParametersProj.CopyNMVertex (method)
  static CopyNMVertex(theVert: TopoDS_Vertex, toedge: TopoDS_Edge, fromedge: TopoDS_Edge): TopoDS_Vertex;
  static CopyNMVertex(theVert: TopoDS_Vertex, toFace: TopoDS_Face, fromFace: TopoDS_Face): TopoDS_Vertex;

  // ShapeAnalysis_TransferParametersProj.get_type_name (method)
  static get_type_name(): string;

  // ShapeAnalysis_TransferParametersProj.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // ShapeAnalysis_TransferParametersProj.DynamicType (method)
  DynamicType(): Standard_Type;

  // ShapeAnalysis_TransferParametersProj.delete (method)
  delete(): void;

  // ShapeAnalysis_TransferParametersProj.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
