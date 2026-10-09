# libcascade — BRepMesh

45 top-level symbols. Signatures are verbatim typescript.

BRepMesh_BaseMeshAlgo: declare class BRepMesh_BaseMeshAlgo extends IMeshTools_MeshAlgo

  // BRepMesh_BaseMeshAlgo.Perform (method)
  Perform(theDFace: unknown, theParameters: IMeshTools_Parameters, theRange?: Message_ProgressRange): void;

  // BRepMesh_BaseMeshAlgo.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_BaseMeshAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_BaseMeshAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_BaseMeshAlgo.delete (method)
  delete(): void;

  // BRepMesh_BaseMeshAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_BoundaryParamsRangeSplitter: declare class BRepMesh_BoundaryParamsRangeSplitter extends BRepMesh_NURBSRangeSplitter

  // BRepMesh_BoundaryParamsRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_BoundaryParamsRangeSplitter.AddPoint (method)
  AddPoint(thePoint: gp_Pnt2d): void;

  // BRepMesh_BoundaryParamsRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_BoundaryParamsRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_Circle: declare class BRepMesh_Circle

  // BRepMesh_Circle.constructor (constructor)
  constructor();
  constructor(theLocation: gp_XY, theRadius: number);

  // BRepMesh_Circle.SetLocation (method)
  SetLocation(theLocation: gp_XY): void;

  // BRepMesh_Circle.SetRadius (method)
  SetRadius(theRadius: number): void;

  // BRepMesh_Circle.Location (method)
  Location(): gp_XY;

  // BRepMesh_Circle.Radius (method)
  Radius(): number;

  // BRepMesh_Circle.delete (method)
  delete(): void;

  // BRepMesh_Circle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_CircleInspector: declare class BRepMesh_CircleInspector

  // BRepMesh_CircleInspector.constructor (constructor)
  constructor(theTolerance: number, theReservedSize: number, theAllocator: NCollection_IncAllocator);

  // BRepMesh_CircleInspector.Coord (method)
  static Coord(i: number, thePnt: gp_XY): number;

  // BRepMesh_CircleInspector.Shift (method)
  static Shift(thePnt: gp_XY, theTol: number): gp_XY;

  // BRepMesh_CircleInspector.Bind (method)
  Bind(theIndex: number, theCircle: BRepMesh_Circle): void;

  // BRepMesh_CircleInspector.Circles (method)
  Circles(): VectorOfCircle;

  // BRepMesh_CircleInspector.Circle (method)
  Circle(theIndex: number): BRepMesh_Circle;

  // BRepMesh_CircleInspector.SetPoint (method)
  SetPoint(thePoint: gp_XY): void;

  // BRepMesh_CircleInspector.GetShotCircles (method)
  GetShotCircles(): unknown;

  // BRepMesh_CircleInspector.Inspect (method)
  Inspect(theTargetIndex: number): NCollection_CellFilter_Action;

  // BRepMesh_CircleInspector.IsEqual (method)
  static IsEqual(theIndex: number, theTargetIndex: number): boolean;

  // BRepMesh_CircleInspector.delete (method)
  delete(): void;

  // BRepMesh_CircleInspector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_CircleTool: declare class BRepMesh_CircleTool

  // BRepMesh_CircleTool.constructor (constructor)
  constructor(theAllocator: NCollection_IncAllocator);
  constructor(theReservedSize: number, theAllocator: NCollection_IncAllocator);

  // BRepMesh_CircleTool.Init (method)
  Init(argNo0: number): void;

  // BRepMesh_CircleTool.SetCellSize (method)
  SetCellSize(theSize: number): void;
  SetCellSize(theSizeX: number, theSizeY: number): void;

  // BRepMesh_CircleTool.SetMinMaxSize (method)
  SetMinMaxSize(theMin: gp_XY, theMax: gp_XY): void;

  // BRepMesh_CircleTool.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepMesh_CircleTool.Bind (method)
  Bind(theIndex: number, theCircle: gp_Circ2d): void;
  Bind(theIndex: number, thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY): boolean;

  // BRepMesh_CircleTool.MakeCircle (method)
  static MakeCircle(thePoint1: gp_XY, thePoint2: gp_XY, thePoint3: gp_XY, theLocation: gp_XY, theRadius?: number): { returnValue: boolean; theRadius: number };

  // BRepMesh_CircleTool.MocBind (method)
  MocBind(theIndex: number): void;

  // BRepMesh_CircleTool.Delete (method)
  Delete(theIndex: number): void;

  // BRepMesh_CircleTool.Select (method)
  Select(thePoint: gp_XY): unknown;

  // BRepMesh_CircleTool.delete (method)
  delete(): void;

  // BRepMesh_CircleTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_Classifier: declare class BRepMesh_Classifier extends Standard_Transient

  // BRepMesh_Classifier.constructor (constructor)
  constructor();

  // BRepMesh_Classifier.Perform (method)
  Perform(thePoint: gp_Pnt2d): TopAbs_State;

  // BRepMesh_Classifier.RegisterWire (method)
  RegisterWire(theWire: NCollection_Sequence_gp_Pnt2d, theTolUV: [number, number], theRangeU: [number, number], theRangeV: [number, number]): void;

  // BRepMesh_Classifier.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_Classifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_Classifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_Classifier.delete (method)
  delete(): void;

  // BRepMesh_Classifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ConeRangeSplitter: declare class BRepMesh_ConeRangeSplitter extends BRepMesh_DefaultRangeSplitter

  // BRepMesh_ConeRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_ConeRangeSplitter.GetSplitSteps (method)
  GetSplitSteps(theParameters: IMeshTools_Parameters, theStepsNb: [number, number]): [number, number];

  // BRepMesh_ConeRangeSplitter.GenerateSurfaceNodes (method)
  GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

  // BRepMesh_ConeRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_ConeRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ConstrainedBaseMeshAlgo: declare class BRepMesh_ConstrainedBaseMeshAlgo extends BRepMesh_BaseMeshAlgo

  // BRepMesh_ConstrainedBaseMeshAlgo.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_ConstrainedBaseMeshAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_ConstrainedBaseMeshAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_ConstrainedBaseMeshAlgo.delete (method)
  delete(): void;

  // BRepMesh_ConstrainedBaseMeshAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_Context: declare class BRepMesh_Context extends IMeshTools_Context

  // BRepMesh_Context.constructor (constructor)
  constructor(theMeshType?: IMeshTools_MeshAlgoType);

  // BRepMesh_Context.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_Context.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_Context.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_Context.delete (method)
  delete(): void;

  // BRepMesh_Context.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_CurveTessellator: declare class BRepMesh_CurveTessellator extends IMeshTools_CurveTessellator

  // BRepMesh_CurveTessellator.constructor (constructor)
  constructor(theEdge: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb?: number);
  constructor(theEdge: unknown, theOrientation: TopAbs_Orientation, theFace: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb?: number);

  // BRepMesh_CurveTessellator.PointsNb (method)
  PointsNb(): number;

  // BRepMesh_CurveTessellator.Value (method)
  Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };

  // BRepMesh_CurveTessellator.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_CurveTessellator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_CurveTessellator.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_CurveTessellator.delete (method)
  delete(): void;

  // BRepMesh_CurveTessellator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_CustomBaseMeshAlgo: declare class BRepMesh_CustomBaseMeshAlgo extends BRepMesh_ConstrainedBaseMeshAlgo

  // BRepMesh_CustomBaseMeshAlgo.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_CustomBaseMeshAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_CustomBaseMeshAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_CustomBaseMeshAlgo.delete (method)
  delete(): void;

  // BRepMesh_CustomBaseMeshAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_CylinderRangeSplitter: declare class BRepMesh_CylinderRangeSplitter extends BRepMesh_DefaultRangeSplitter

  // BRepMesh_CylinderRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_CylinderRangeSplitter.Reset (method)
  Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

  // BRepMesh_CylinderRangeSplitter.GenerateSurfaceNodes (method)
  GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

  // BRepMesh_CylinderRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_CylinderRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DataStructureOfDelaun: declare class BRepMesh_DataStructureOfDelaun extends Standard_Transient

  // BRepMesh_DataStructureOfDelaun.constructor (constructor)
  constructor(theAllocator: NCollection_IncAllocator, theReservedNodeSize?: number);

  // BRepMesh_DataStructureOfDelaun.NbNodes (method)
  NbNodes(): number;

  // BRepMesh_DataStructureOfDelaun.AddNode (method)
  AddNode(theNode: BRepMesh_Vertex, isForceAdd?: boolean): number;

  // BRepMesh_DataStructureOfDelaun.IndexOf (method)
  IndexOf(theNode: BRepMesh_Vertex): number;
  IndexOf(theLink: BRepMesh_Edge): number;

  // BRepMesh_DataStructureOfDelaun.GetNode (method)
  GetNode(theIndex: number): BRepMesh_Vertex;

  // BRepMesh_DataStructureOfDelaun.SubstituteNode (method)
  SubstituteNode(theIndex: number, theNewNode: BRepMesh_Vertex): boolean;

  // BRepMesh_DataStructureOfDelaun.RemoveNode (method)
  RemoveNode(theIndex: number, isForce?: boolean): void;

  // BRepMesh_DataStructureOfDelaun.LinksConnectedTo (method)
  LinksConnectedTo(theIndex: number): unknown;

  // BRepMesh_DataStructureOfDelaun.NbLinks (method)
  NbLinks(): number;

  // BRepMesh_DataStructureOfDelaun.AddLink (method)
  AddLink(theLink: BRepMesh_Edge): number;

  // BRepMesh_DataStructureOfDelaun.GetLink (method)
  GetLink(theIndex: number): BRepMesh_Edge;

  // BRepMesh_DataStructureOfDelaun.LinksOfDomain (method)
  LinksOfDomain(): unknown;

  // BRepMesh_DataStructureOfDelaun.SubstituteLink (method)
  SubstituteLink(theIndex: number, theNewLink: BRepMesh_Edge): boolean;

  // BRepMesh_DataStructureOfDelaun.RemoveLink (method)
  RemoveLink(theIndex: number, isForce?: boolean): void;

  // BRepMesh_DataStructureOfDelaun.ElementsConnectedTo (method)
  ElementsConnectedTo(theLinkIndex: number): BRepMesh_PairOfIndex;

  // BRepMesh_DataStructureOfDelaun.NbElements (method)
  NbElements(): number;

  // BRepMesh_DataStructureOfDelaun.ElementsOfDomain (method)
  ElementsOfDomain(): unknown;

  // BRepMesh_DataStructureOfDelaun.RemoveElement (method)
  RemoveElement(theIndex: number): void;

  // BRepMesh_DataStructureOfDelaun.Dump (method)
  Dump(theFileNameStr: string): void;

  // BRepMesh_DataStructureOfDelaun.Allocator (method)
  Allocator(): NCollection_IncAllocator;

  // BRepMesh_DataStructureOfDelaun.Data (method)
  Data(): BRepMesh_VertexTool;

  // BRepMesh_DataStructureOfDelaun.ClearDomain (method)
  ClearDomain(): void;

  // BRepMesh_DataStructureOfDelaun.ClearDeleted (method)
  ClearDeleted(): void;

  // BRepMesh_DataStructureOfDelaun.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_DataStructureOfDelaun.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_DataStructureOfDelaun.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_DataStructureOfDelaun.delete (method)
  delete(): void;

  // BRepMesh_DataStructureOfDelaun.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DefaultRangeSplitter: declare class BRepMesh_DefaultRangeSplitter

  // BRepMesh_DefaultRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_DefaultRangeSplitter.Reset (method)
  Reset(theDFace: unknown, theParameters: IMeshTools_Parameters): void;

  // BRepMesh_DefaultRangeSplitter.AddPoint (method)
  AddPoint(thePoint: gp_Pnt2d): void;

  // BRepMesh_DefaultRangeSplitter.AdjustRange (method)
  AdjustRange(): void;

  // BRepMesh_DefaultRangeSplitter.IsValid (method)
  IsValid(): boolean;

  // BRepMesh_DefaultRangeSplitter.Scale (method)
  Scale(thePoint: gp_Pnt2d, isToFaceBasis: boolean): gp_Pnt2d;

  // BRepMesh_DefaultRangeSplitter.GenerateSurfaceNodes (method)
  GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

  // BRepMesh_DefaultRangeSplitter.Point (method)
  Point(thePoint2d: gp_Pnt2d): gp_Pnt;

  // BRepMesh_DefaultRangeSplitter.GetDFace (method)
  GetDFace(): unknown;

  // BRepMesh_DefaultRangeSplitter.GetSurface (method)
  GetSurface(): BRepAdaptor_Surface;

  // BRepMesh_DefaultRangeSplitter.GetRangeU (method)
  GetRangeU(): [number, number];

  // BRepMesh_DefaultRangeSplitter.GetRangeV (method)
  GetRangeV(): [number, number];

  // BRepMesh_DefaultRangeSplitter.GetDelta (method)
  GetDelta(): [number, number];

  // BRepMesh_DefaultRangeSplitter.GetToleranceUV (method)
  GetToleranceUV(): [number, number];

  // BRepMesh_DefaultRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_DefaultRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_Deflection: declare class BRepMesh_Deflection extends Standard_Transient

  // BRepMesh_Deflection.constructor (constructor)
  constructor();

  // BRepMesh_Deflection.ComputeAbsoluteDeflection (method)
  static ComputeAbsoluteDeflection(theShape: TopoDS_Shape, theRelativeDeflection: number, theMaxShapeSize: number): number;

  // BRepMesh_Deflection.ComputeDeflection (method)
  static ComputeDeflection(theDWire: unknown, theParameters: IMeshTools_Parameters): void;
  static ComputeDeflection(theDFace: unknown, theParameters: IMeshTools_Parameters): void;
  static ComputeDeflection(theDEdge: unknown, theMaxShapeSize: number, theParameters: IMeshTools_Parameters): void;

  // BRepMesh_Deflection.IsConsistent (method)
  static IsConsistent(theCurrent: number, theRequired: number, theAllowDecrease: boolean, theRatio?: number): boolean;

  // BRepMesh_Deflection.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_Deflection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_Deflection.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_Deflection.delete (method)
  delete(): void;

  // BRepMesh_Deflection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DegreeOfFreedom: typeof BRepMesh_DegreeOfFreedom[keyof typeof BRepMesh_DegreeOfFreedom]

  readonly BRepMesh_Free: 'BRepMesh_Free'

  readonly BRepMesh_InVolume: 'BRepMesh_InVolume'

  readonly BRepMesh_OnSurface: 'BRepMesh_OnSurface'

  readonly BRepMesh_OnCurve: 'BRepMesh_OnCurve'

  readonly BRepMesh_Fixed: 'BRepMesh_Fixed'

  readonly BRepMesh_Frontier: 'BRepMesh_Frontier'

  readonly BRepMesh_Deleted: 'BRepMesh_Deleted'

BRepMesh_DelabellaBaseMeshAlgo: declare class BRepMesh_DelabellaBaseMeshAlgo extends BRepMesh_CustomBaseMeshAlgo

  // BRepMesh_DelabellaBaseMeshAlgo.constructor (constructor)
  constructor();

  // BRepMesh_DelabellaBaseMeshAlgo.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_DelabellaBaseMeshAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_DelabellaBaseMeshAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_DelabellaBaseMeshAlgo.delete (method)
  delete(): void;

  // BRepMesh_DelabellaBaseMeshAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DelabellaMeshAlgoFactory: declare class BRepMesh_DelabellaMeshAlgoFactory extends IMeshTools_MeshAlgoFactory

  // BRepMesh_DelabellaMeshAlgoFactory.constructor (constructor)
  constructor();

  // BRepMesh_DelabellaMeshAlgoFactory.GetAlgo (method)
  GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

  // BRepMesh_DelabellaMeshAlgoFactory.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_DelabellaMeshAlgoFactory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_DelabellaMeshAlgoFactory.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_DelabellaMeshAlgoFactory.delete (method)
  delete(): void;

  // BRepMesh_DelabellaMeshAlgoFactory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DelaunayBaseMeshAlgo: declare class BRepMesh_DelaunayBaseMeshAlgo extends BRepMesh_ConstrainedBaseMeshAlgo

  // BRepMesh_DelaunayBaseMeshAlgo.constructor (constructor)
  constructor();

  // BRepMesh_DelaunayBaseMeshAlgo.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_DelaunayBaseMeshAlgo.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_DelaunayBaseMeshAlgo.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_DelaunayBaseMeshAlgo.delete (method)
  delete(): void;

  // BRepMesh_DelaunayBaseMeshAlgo.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DiscretAlgoFactory: declare class BRepMesh_DiscretAlgoFactory extends Standard_Transient

  // BRepMesh_DiscretAlgoFactory.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_DiscretAlgoFactory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_DiscretAlgoFactory.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_DiscretAlgoFactory.RegisterFactory (method)
  static RegisterFactory(theFactory: BRepMesh_DiscretAlgoFactory, theIsPreferred?: boolean): void;

  // BRepMesh_DiscretAlgoFactory.UnregisterFactory (method)
  static UnregisterFactory(theName: TCollection_AsciiString): void;

  // BRepMesh_DiscretAlgoFactory.DefaultFactory (method)
  static DefaultFactory(): BRepMesh_DiscretAlgoFactory;

  // BRepMesh_DiscretAlgoFactory.FindFactory (method)
  static FindFactory(theName: TCollection_AsciiString): BRepMesh_DiscretAlgoFactory;

  // BRepMesh_DiscretAlgoFactory.Factories (method)
  static Factories(): NCollection_List_handle_BRepMesh_DiscretAlgoFactory;

  // BRepMesh_DiscretAlgoFactory.CreateAlgorithm (method)
  CreateAlgorithm(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;

  // BRepMesh_DiscretAlgoFactory.Name (method)
  Name(): TCollection_AsciiString;

  // BRepMesh_DiscretAlgoFactory.delete (method)
  delete(): void;

  // BRepMesh_DiscretAlgoFactory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DiscretFactory: declare class BRepMesh_DiscretFactory

  // BRepMesh_DiscretFactory.Get (method)
  static Get(): BRepMesh_DiscretFactory;

  // BRepMesh_DiscretFactory.SetDefaultName (method)
  SetDefaultName(theName: TCollection_AsciiString): boolean;

  // BRepMesh_DiscretFactory.DefaultName (method)
  DefaultName(): TCollection_AsciiString;

  // BRepMesh_DiscretFactory.Discret (method)
  Discret(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;

  // BRepMesh_DiscretFactory.delete (method)
  delete(): void;

  // BRepMesh_DiscretFactory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_DiscretRoot: declare class BRepMesh_DiscretRoot extends Standard_Transient

  // BRepMesh_DiscretRoot.SetShape (method)
  SetShape(theShape: TopoDS_Shape): void;

  // BRepMesh_DiscretRoot.Shape (method)
  Shape(): TopoDS_Shape;

  // BRepMesh_DiscretRoot.IsDone (method)
  IsDone(): boolean;

  // BRepMesh_DiscretRoot.Perform (method)
  Perform(theRange?: Message_ProgressRange): void;

  // BRepMesh_DiscretRoot.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_DiscretRoot.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_DiscretRoot.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_DiscretRoot.delete (method)
  delete(): void;

  // BRepMesh_DiscretRoot.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_Edge: declare class BRepMesh_Edge extends BRepMesh_OrientedEdge

  // BRepMesh_Edge.constructor (constructor)
  constructor();
  constructor(theFirstNode: number, theLastNode: number, theMovability: BRepMesh_DegreeOfFreedom);

  // BRepMesh_Edge.Movability (method)
  Movability(): BRepMesh_DegreeOfFreedom;

  // BRepMesh_Edge.SetMovability (method)
  SetMovability(theMovability: BRepMesh_DegreeOfFreedom): void;

  // BRepMesh_Edge.IsSameOrientation (method)
  IsSameOrientation(theOther: BRepMesh_Edge): boolean;

  // BRepMesh_Edge.IsEqual (method)
  IsEqual(theOther: BRepMesh_Edge): boolean;
  IsEqual(theOther: BRepMesh_OrientedEdge): boolean;

  // BRepMesh_Edge.delete (method)
  delete(): void;

  // BRepMesh_Edge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_EdgeDiscret: declare class BRepMesh_EdgeDiscret extends IMeshTools_ModelAlgo

  // BRepMesh_EdgeDiscret.constructor (constructor)
  constructor();

  // BRepMesh_EdgeDiscret.CreateEdgeTessellator (method)
  static CreateEdgeTessellator(theDEdge: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;
  static CreateEdgeTessellator(theDEdge: unknown, theOrientation: TopAbs_Orientation, theDFace: unknown, theParameters: IMeshTools_Parameters, theMinPointsNb: number): IMeshTools_CurveTessellator;

  // BRepMesh_EdgeDiscret.CreateEdgeTessellationExtractor (method)
  static CreateEdgeTessellationExtractor(theDEdge: unknown, theDFace: unknown): IMeshTools_CurveTessellator;

  // BRepMesh_EdgeDiscret.Tessellate3d (method)
  static Tessellate3d(theDEdge: unknown, theTessellator: IMeshTools_CurveTessellator, theUpdateEnds: boolean): void;

  // BRepMesh_EdgeDiscret.Tessellate2d (method)
  static Tessellate2d(theDEdge: unknown, theUpdateEnds: boolean): void;

  // BRepMesh_EdgeDiscret.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_EdgeDiscret.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_EdgeDiscret.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_EdgeDiscret.delete (method)
  delete(): void;

  // BRepMesh_EdgeDiscret.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_EdgeTessellationExtractor: declare class BRepMesh_EdgeTessellationExtractor extends IMeshTools_CurveTessellator

  // BRepMesh_EdgeTessellationExtractor.constructor (constructor)
  constructor(theEdge: unknown, theFace: unknown);

  // BRepMesh_EdgeTessellationExtractor.PointsNb (method)
  PointsNb(): number;

  // BRepMesh_EdgeTessellationExtractor.Value (method)
  Value(theIndex: number, thePoint: gp_Pnt, theParameter: number): { returnValue: boolean; theParameter: number };

  // BRepMesh_EdgeTessellationExtractor.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_EdgeTessellationExtractor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_EdgeTessellationExtractor.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_EdgeTessellationExtractor.delete (method)
  delete(): void;

  // BRepMesh_EdgeTessellationExtractor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ExtrusionRangeSplitter: declare class BRepMesh_ExtrusionRangeSplitter extends BRepMesh_NURBSRangeSplitter

  // BRepMesh_ExtrusionRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_ExtrusionRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_ExtrusionRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_FaceChecker: declare class BRepMesh_FaceChecker extends Standard_Transient

  // BRepMesh_FaceChecker.constructor (constructor)
  constructor(theFace: unknown, theParameters: IMeshTools_Parameters);

  // BRepMesh_FaceChecker.Perform (method)
  Perform(): boolean;

  // BRepMesh_FaceChecker.GetIntersectingEdges (method)
  GetIntersectingEdges(): any;

  // BRepMesh_FaceChecker.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_FaceChecker.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_FaceChecker.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_FaceChecker.delete (method)
  delete(): void;

  // BRepMesh_FaceChecker.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_FaceDiscret: declare class BRepMesh_FaceDiscret extends IMeshTools_ModelAlgo

  // BRepMesh_FaceDiscret.constructor (constructor)
  constructor(theAlgoFactory: IMeshTools_MeshAlgoFactory);

  // BRepMesh_FaceDiscret.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_FaceDiscret.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_FaceDiscret.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_FaceDiscret.delete (method)
  delete(): void;

  // BRepMesh_FaceDiscret.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_FastDiscret: declare class BRepMesh_FastDiscret

  // BRepMesh_FastDiscret.constructor (constructor)
  constructor();

  // BRepMesh_FastDiscret.delete (method)
  delete(): void;

  // BRepMesh_FastDiscret.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_GeomTool: declare class BRepMesh_GeomTool

  // BRepMesh_GeomTool.constructor (constructor)
  constructor(theCurve: BRepAdaptor_Curve, theFirstParam: number, theLastParam: number, theLinDeflection: number, theAngDeflection: number, theMinPointsNb?: number, theMinSize?: number);
  constructor(theSurface: BRepAdaptor_Surface, theIsoType: GeomAbs_IsoType, theParamIso: number, theFirstParam: number, theLastParam: number, theLinDeflection: number, theAngDeflection: number, theMinPointsNb?: number, theMinSize?: number);

  // BRepMesh_GeomTool.AddPoint (method)
  AddPoint(thePoint: gp_Pnt, theParam: number, theIsReplace?: boolean): number;

  // BRepMesh_GeomTool.NbPoints (method)
  NbPoints(): number;

  // BRepMesh_GeomTool.Value (method)
  Value(theIndex: number, theIsoParam: number, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };
  Value(theIndex: number, theSurface: BRepAdaptor_Surface, theParam: number, thePoint: gp_Pnt, theUV: gp_Pnt2d): { returnValue: boolean; theParam: number };

  // BRepMesh_GeomTool.Normal (method)
  static Normal(theSurface: BRepAdaptor_Surface, theParamU: number, theParamV: number, thePoint: gp_Pnt, theNormal: gp_Dir): boolean;

  // BRepMesh_GeomTool.IntLinLin (method)
  static IntLinLin(theStartPnt1: gp_XY, theEndPnt1: gp_XY, theStartPnt2: gp_XY, theEndPnt2: gp_XY, theIntPnt: gp_XY, theParamOnSegment: [number, number]): BRepMesh_GeomTool_IntFlag;

  // BRepMesh_GeomTool.IntSegSeg (method)
  static IntSegSeg(theStartPnt1: gp_XY, theEndPnt1: gp_XY, theStartPnt2: gp_XY, theEndPnt2: gp_XY, isConsiderEndPointTouch: boolean, isConsiderPointOnSegment: boolean, theIntPnt: gp_Pnt2d): BRepMesh_GeomTool_IntFlag;

  // BRepMesh_GeomTool.SquareDeflectionOfSegment (method)
  static SquareDeflectionOfSegment(theFirstPoint: gp_Pnt, theLastPoint: gp_Pnt, theMidPoint: gp_Pnt): number;

  // BRepMesh_GeomTool.CellsCount (method)
  static CellsCount(theSurface: Adaptor3d_Surface, theVerticesNb: number, theDeflection: number, theRangeSplitter: BRepMesh_DefaultRangeSplitter): [number, number];

  // BRepMesh_GeomTool.delete (method)
  delete(): void;

  // BRepMesh_GeomTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_GeomTool_IntFlag: typeof BRepMesh_GeomTool_IntFlag[keyof typeof BRepMesh_GeomTool_IntFlag]

  readonly NoIntersection: 'NoIntersection'

  readonly Cross: 'Cross'

  readonly EndPointTouch: 'EndPointTouch'

  readonly PointOnSegment: 'PointOnSegment'

  readonly Glued: 'Glued'

  readonly Same: 'Same'

BRepMesh_IncrementalMesh: declare class BRepMesh_IncrementalMesh extends BRepMesh_DiscretRoot

  // BRepMesh_IncrementalMesh.constructor (constructor)
  constructor();
  constructor(theShape: TopoDS_Shape, theParameters: IMeshTools_Parameters, theRange?: Message_ProgressRange);
  constructor(theShape: TopoDS_Shape, theLinDeflection: number, isRelative?: boolean, theAngDeflection?: number, isInParallel?: boolean);

  // BRepMesh_IncrementalMesh.Perform (method)
  Perform(theRange: Message_ProgressRange): void;
  Perform(theContext: IMeshTools_Context, theRange: Message_ProgressRange): void;

  // BRepMesh_IncrementalMesh.Parameters (method)
  Parameters(): IMeshTools_Parameters;

  // BRepMesh_IncrementalMesh.ChangeParameters (method)
  ChangeParameters(): IMeshTools_Parameters;

  // BRepMesh_IncrementalMesh.IsModified (method)
  IsModified(): boolean;

  // BRepMesh_IncrementalMesh.GetStatusFlags (method)
  GetStatusFlags(): number;

  // BRepMesh_IncrementalMesh.IsParallelDefault (method)
  static IsParallelDefault(): boolean;

  // BRepMesh_IncrementalMesh.SetParallelDefault (method)
  static SetParallelDefault(isInParallel: boolean): void;

  // BRepMesh_IncrementalMesh.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_IncrementalMesh.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_IncrementalMesh.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_IncrementalMesh.delete (method)
  delete(): void;

  // BRepMesh_IncrementalMesh.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_IncrementalMeshFactory: declare class BRepMesh_IncrementalMeshFactory extends BRepMesh_DiscretAlgoFactory

  // BRepMesh_IncrementalMeshFactory.constructor (constructor)
  constructor();

  // BRepMesh_IncrementalMeshFactory.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_IncrementalMeshFactory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_IncrementalMeshFactory.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_IncrementalMeshFactory.CreateAlgorithm (method)
  CreateAlgorithm(theShape: TopoDS_Shape, theLinDeflection: number, theAngDeflection: number): BRepMesh_DiscretRoot;

  // BRepMesh_IncrementalMeshFactory.delete (method)
  delete(): void;

  // BRepMesh_IncrementalMeshFactory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_MeshAlgoFactory: declare class BRepMesh_MeshAlgoFactory extends IMeshTools_MeshAlgoFactory

  // BRepMesh_MeshAlgoFactory.constructor (constructor)
  constructor();

  // BRepMesh_MeshAlgoFactory.GetAlgo (method)
  GetAlgo(theSurfaceType: GeomAbs_SurfaceType, theParameters: IMeshTools_Parameters): IMeshTools_MeshAlgo;

  // BRepMesh_MeshAlgoFactory.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_MeshAlgoFactory.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_MeshAlgoFactory.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_MeshAlgoFactory.delete (method)
  delete(): void;

  // BRepMesh_MeshAlgoFactory.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_MeshTool: declare class BRepMesh_MeshTool extends Standard_Transient

  // BRepMesh_MeshTool.constructor (constructor)
  constructor(theStructure: BRepMesh_DataStructureOfDelaun);

  // BRepMesh_MeshTool.GetStructure (method)
  GetStructure(): BRepMesh_DataStructureOfDelaun;

  // BRepMesh_MeshTool.DumpTriangles (method)
  DumpTriangles(theFileName: string, theTriangles: unknown): void;

  // BRepMesh_MeshTool.AddAndLegalizeTriangle (method)
  AddAndLegalizeTriangle(thePoint1: number, thePoint2: number, thePoint3: number): void;

  // BRepMesh_MeshTool.AddTriangle (method)
  AddTriangle(thePoint1: number, thePoint2: number, thePoint3: number, theEdges: [number, number, number]): void;

  // BRepMesh_MeshTool.AddLink (method)
  AddLink(theFirstNode: number, theLastNode: number, theLinkIndex?: number, theLinkOri?: boolean): { theLinkIndex: number; theLinkOri: boolean };

  // BRepMesh_MeshTool.Legalize (method)
  Legalize(theLinkIndex: number): void;

  // BRepMesh_MeshTool.EraseItemsConnectedTo (method)
  EraseItemsConnectedTo(theNodeIndex: number): void;

  // BRepMesh_MeshTool.CleanFrontierLinks (method)
  CleanFrontierLinks(): void;

  // BRepMesh_MeshTool.EraseTriangles (method)
  EraseTriangles(theTriangles: unknown, theLoopEdges: unknown): void;

  // BRepMesh_MeshTool.EraseTriangle (method)
  EraseTriangle(theTriangleIndex: number, theLoopEdges: unknown): void;

  // BRepMesh_MeshTool.EraseFreeLinks (method)
  EraseFreeLinks(): void;
  EraseFreeLinks(theLinks: unknown): void;

  // BRepMesh_MeshTool.GetEdgesByType (method)
  GetEdgesByType(theEdgeType: BRepMesh_DegreeOfFreedom): unknown;

  // BRepMesh_MeshTool.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_MeshTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_MeshTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_MeshTool.delete (method)
  delete(): void;

  // BRepMesh_MeshTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_MeshTool_NodeClassifier: declare class BRepMesh_MeshTool_NodeClassifier

  // BRepMesh_MeshTool_NodeClassifier.constructor (constructor)
  constructor(theConstraint: BRepMesh_Edge, theStructure: BRepMesh_DataStructureOfDelaun);

  // BRepMesh_MeshTool_NodeClassifier.IsAbove (method)
  IsAbove(theNodeIndex: number): boolean;

  // BRepMesh_MeshTool_NodeClassifier.delete (method)
  delete(): void;

  // BRepMesh_MeshTool_NodeClassifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ModelBuilder: declare class BRepMesh_ModelBuilder extends IMeshTools_ModelBuilder

  // BRepMesh_ModelBuilder.constructor (constructor)
  constructor();

  // BRepMesh_ModelBuilder.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_ModelBuilder.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_ModelBuilder.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_ModelBuilder.delete (method)
  delete(): void;

  // BRepMesh_ModelBuilder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ModelHealer: declare class BRepMesh_ModelHealer extends IMeshTools_ModelAlgo

  // BRepMesh_ModelHealer.constructor (constructor)
  constructor();

  // BRepMesh_ModelHealer.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_ModelHealer.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_ModelHealer.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_ModelHealer.delete (method)
  delete(): void;

  // BRepMesh_ModelHealer.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ModelPostProcessor: declare class BRepMesh_ModelPostProcessor extends IMeshTools_ModelAlgo

  // BRepMesh_ModelPostProcessor.constructor (constructor)
  constructor();

  // BRepMesh_ModelPostProcessor.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_ModelPostProcessor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_ModelPostProcessor.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_ModelPostProcessor.delete (method)
  delete(): void;

  // BRepMesh_ModelPostProcessor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ModelPreProcessor: declare class BRepMesh_ModelPreProcessor extends IMeshTools_ModelAlgo

  // BRepMesh_ModelPreProcessor.constructor (constructor)
  constructor();

  // BRepMesh_ModelPreProcessor.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_ModelPreProcessor.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_ModelPreProcessor.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_ModelPreProcessor.delete (method)
  delete(): void;

  // BRepMesh_ModelPreProcessor.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_NURBSRangeSplitter: declare class BRepMesh_NURBSRangeSplitter extends BRepMesh_UVParamRangeSplitter

  // BRepMesh_NURBSRangeSplitter.constructor (constructor)
  constructor();

  // BRepMesh_NURBSRangeSplitter.AdjustRange (method)
  AdjustRange(): void;

  // BRepMesh_NURBSRangeSplitter.GenerateSurfaceNodes (method)
  GenerateSurfaceNodes(theParameters: IMeshTools_Parameters): unknown;

  // BRepMesh_NURBSRangeSplitter.delete (method)
  delete(): void;

  // BRepMesh_NURBSRangeSplitter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_OrientedEdge: declare class BRepMesh_OrientedEdge

  // BRepMesh_OrientedEdge.constructor (constructor)
  constructor();
  constructor(theFirstNode: number, theLastNode: number);

  // BRepMesh_OrientedEdge.FirstNode (method)
  FirstNode(): number;

  // BRepMesh_OrientedEdge.LastNode (method)
  LastNode(): number;

  // BRepMesh_OrientedEdge.IsEqual (method)
  IsEqual(theOther: BRepMesh_OrientedEdge): boolean;

  // BRepMesh_OrientedEdge.delete (method)
  delete(): void;

  // BRepMesh_OrientedEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_PairOfIndex: declare class BRepMesh_PairOfIndex

  // BRepMesh_PairOfIndex.constructor (constructor)
  constructor();

  // BRepMesh_PairOfIndex.Clear (method)
  Clear(): void;

  // BRepMesh_PairOfIndex.Append (method)
  Append(theIndex: number): void;

  // BRepMesh_PairOfIndex.Prepend (method)
  Prepend(theIndex: number): void;

  // BRepMesh_PairOfIndex.IsEmpty (method)
  IsEmpty(): boolean;

  // BRepMesh_PairOfIndex.Extent (method)
  Extent(): number;

  // BRepMesh_PairOfIndex.FirstIndex (method)
  FirstIndex(): number;

  // BRepMesh_PairOfIndex.LastIndex (method)
  LastIndex(): number;

  // BRepMesh_PairOfIndex.Index (method)
  Index(thePairPos: number): number;

  // BRepMesh_PairOfIndex.SetIndex (method)
  SetIndex(thePairPos: number, theIndex: number): void;

  // BRepMesh_PairOfIndex.RemoveIndex (method)
  RemoveIndex(thePairPos: number): void;

  // BRepMesh_PairOfIndex.delete (method)
  delete(): void;

  // BRepMesh_PairOfIndex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_SelectorOfDataStructureOfDelaun: declare class BRepMesh_SelectorOfDataStructureOfDelaun extends Standard_Transient

  // BRepMesh_SelectorOfDataStructureOfDelaun.constructor (constructor)
  constructor();
  constructor(theMesh: BRepMesh_DataStructureOfDelaun);

  // BRepMesh_SelectorOfDataStructureOfDelaun.Initialize (method)
  Initialize(theMesh: BRepMesh_DataStructureOfDelaun): void;

  // BRepMesh_SelectorOfDataStructureOfDelaun.NeighboursOf (method)
  NeighboursOf(theNode: BRepMesh_Vertex): void;
  NeighboursOf(theLink: BRepMesh_Edge): void;
  NeighboursOf(argNo0: BRepMesh_SelectorOfDataStructureOfDelaun): void;

  // BRepMesh_SelectorOfDataStructureOfDelaun.NeighboursOfNode (method)
  NeighboursOfNode(theNodeIndex: number): void;

  // BRepMesh_SelectorOfDataStructureOfDelaun.NeighboursOfLink (method)
  NeighboursOfLink(theLinkIndex: number): void;

  // BRepMesh_SelectorOfDataStructureOfDelaun.NeighboursOfElement (method)
  NeighboursOfElement(theElementIndex: number): void;

  // BRepMesh_SelectorOfDataStructureOfDelaun.AddNeighbours (method)
  AddNeighbours(): void;

  // BRepMesh_SelectorOfDataStructureOfDelaun.Nodes (method)
  Nodes(): unknown;

  // BRepMesh_SelectorOfDataStructureOfDelaun.Links (method)
  Links(): unknown;

  // BRepMesh_SelectorOfDataStructureOfDelaun.Elements (method)
  Elements(): unknown;

  // BRepMesh_SelectorOfDataStructureOfDelaun.FrontierLinks (method)
  FrontierLinks(): unknown;

  // BRepMesh_SelectorOfDataStructureOfDelaun.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_SelectorOfDataStructureOfDelaun.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_SelectorOfDataStructureOfDelaun.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_SelectorOfDataStructureOfDelaun.delete (method)
  delete(): void;

  // BRepMesh_SelectorOfDataStructureOfDelaun.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

BRepMesh_ShapeTool: declare class BRepMesh_ShapeTool extends Standard_Transient

  // BRepMesh_ShapeTool.constructor (constructor)
  constructor();

  // BRepMesh_ShapeTool.MaxFaceTolerance (method)
  static MaxFaceTolerance(theFace: TopoDS_Face): number;

  // BRepMesh_ShapeTool.BoxMaxDimension (method)
  static BoxMaxDimension(theBox: Bnd_Box, theMaxDimension?: number): { theMaxDimension: number };

  // BRepMesh_ShapeTool.CheckAndUpdateFlags (method)
  static CheckAndUpdateFlags(theEdge: unknown, thePCurve: unknown): void;

  // BRepMesh_ShapeTool.AddInFace (method)
  static AddInFace(theFace: TopoDS_Face): { theTriangulation: Poly_Triangulation; [Symbol.dispose](): void };

  // BRepMesh_ShapeTool.NullifyFace (method)
  static NullifyFace(theFace: TopoDS_Face): void;

  // BRepMesh_ShapeTool.NullifyEdge (method)
  static NullifyEdge(theEdge: TopoDS_Edge, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
  static NullifyEdge(theEdge: TopoDS_Edge, theLocation: TopLoc_Location): void;

  // BRepMesh_ShapeTool.UpdateEdge (method)
  static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;
  static UpdateEdge(theEdge: TopoDS_Edge, thePolygon: Poly_Polygon3D): void;
  static UpdateEdge(theEdge: TopoDS_Edge, thePolygon1: Poly_PolygonOnTriangulation, thePolygon2: Poly_PolygonOnTriangulation, theTriangulation: Poly_Triangulation, theLocation: TopLoc_Location): void;

  // BRepMesh_ShapeTool.UseLocation (method)
  static UseLocation(thePnt: gp_Pnt, theLoc: TopLoc_Location): gp_Pnt;

  // BRepMesh_ShapeTool.UVPoints (method)
  static UVPoints(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstPoint2d: gp_Pnt2d, theLastPoint2d: gp_Pnt2d, isConsiderOrientation: boolean): boolean;

  // BRepMesh_ShapeTool.Range (method)
  static Range(theEdge: TopoDS_Edge, theFace: TopoDS_Face, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; thePCurve: Geom2d_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };
  static Range(theEdge: TopoDS_Edge, theFirstParam: number, theLastParam: number, isConsiderOrientation: boolean): { returnValue: boolean; theCurve: Geom_Curve; theFirstParam: number; theLastParam: number; [Symbol.dispose](): void };

  // BRepMesh_ShapeTool.get_type_name (method)
  static get_type_name(): string;

  // BRepMesh_ShapeTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // BRepMesh_ShapeTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // BRepMesh_ShapeTool.delete (method)
  delete(): void;

  // BRepMesh_ShapeTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
