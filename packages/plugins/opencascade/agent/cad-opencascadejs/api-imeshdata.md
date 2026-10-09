# libcascade — IMeshData

33 top-level symbols. Signatures are verbatim typescript.

IMeshData_Curve: declare class IMeshData_Curve extends IMeshData_ParametersList

  // IMeshData_Curve.InsertPoint (method)
  InsertPoint(thePosition: number, thePoint: gp_Pnt, theParamOnPCurve: number): void;

  // IMeshData_Curve.AddPoint (method)
  AddPoint(thePoint: gp_Pnt, theParamOnCurve: number): void;

  // IMeshData_Curve.GetPoint (method)
  GetPoint(theIndex: number): gp_Pnt;

  // IMeshData_Curve.RemovePoint (method)
  RemovePoint(theIndex: number): void;

  // IMeshData_Curve.get_type_name (method)
  static get_type_name(): string;

  // IMeshData_Curve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshData_Curve.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshData_Curve.delete (method)
  delete(): void;

  // IMeshData_Curve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_Model: declare class IMeshData_Model extends IMeshData_Shape

  // IMeshData_Model.GetMaxSize (method)
  GetMaxSize(): number;

  // IMeshData_Model.get_type_name (method)
  static get_type_name(): string;

  // IMeshData_Model.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshData_Model.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshData_Model.FacesNb (method)
  FacesNb(): number;

  // IMeshData_Model.AddFace (method)
  AddFace(theFace: TopoDS_Face): unknown;

  // IMeshData_Model.GetFace (method)
  GetFace(theIndex: number): unknown;

  // IMeshData_Model.EdgesNb (method)
  EdgesNb(): number;

  // IMeshData_Model.AddEdge (method)
  AddEdge(theEdge: TopoDS_Edge): unknown;

  // IMeshData_Model.GetEdge (method)
  GetEdge(theIndex: number): unknown;

  // IMeshData_Model.delete (method)
  delete(): void;

  // IMeshData_Model.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_PCurve: declare class IMeshData_PCurve extends IMeshData_ParametersList

  // IMeshData_PCurve.InsertPoint (method)
  InsertPoint(thePosition: number, thePoint: gp_Pnt2d, theParamOnPCurve: number): void;

  // IMeshData_PCurve.AddPoint (method)
  AddPoint(thePoint: gp_Pnt2d, theParamOnPCurve: number): void;

  // IMeshData_PCurve.GetPoint (method)
  GetPoint(theIndex: number): gp_Pnt2d;

  // IMeshData_PCurve.GetIndex (method)
  GetIndex(theIndex: number): number;

  // IMeshData_PCurve.RemovePoint (method)
  RemovePoint(theIndex: number): void;

  // IMeshData_PCurve.IsForward (method)
  IsForward(): boolean;

  // IMeshData_PCurve.IsInternal (method)
  IsInternal(): boolean;

  // IMeshData_PCurve.GetOrientation (method)
  GetOrientation(): TopAbs_Orientation;

  // IMeshData_PCurve.GetFace (method)
  GetFace(): unknown;

  // IMeshData_PCurve.get_type_name (method)
  static get_type_name(): string;

  // IMeshData_PCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshData_PCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshData_PCurve.delete (method)
  delete(): void;

  // IMeshData_PCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_ParametersList: declare class IMeshData_ParametersList extends Standard_Transient

  // IMeshData_ParametersList.GetParameter (method)
  GetParameter(theIndex: number): number;

  // IMeshData_ParametersList.ParametersNb (method)
  ParametersNb(): number;

  // IMeshData_ParametersList.Clear (method)
  Clear(isKeepEndPoints: boolean): void;

  // IMeshData_ParametersList.get_type_name (method)
  static get_type_name(): string;

  // IMeshData_ParametersList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshData_ParametersList.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshData_ParametersList.delete (method)
  delete(): void;

  // IMeshData_ParametersList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_Shape: declare class IMeshData_Shape extends Standard_Transient

  // IMeshData_Shape.SetShape (method)
  SetShape(theShape: TopoDS_Shape): void;

  // IMeshData_Shape.GetShape (method)
  GetShape(): TopoDS_Shape;

  // IMeshData_Shape.get_type_name (method)
  static get_type_name(): string;

  // IMeshData_Shape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshData_Shape.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshData_Shape.delete (method)
  delete(): void;

  // IMeshData_Shape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_Status: typeof IMeshData_Status[keyof typeof IMeshData_Status]

  readonly IMeshData_NoError: 'IMeshData_NoError'

  readonly IMeshData_OpenWire: 'IMeshData_OpenWire'

  readonly IMeshData_SelfIntersectingWire: 'IMeshData_SelfIntersectingWire'

  readonly IMeshData_Failure: 'IMeshData_Failure'

  readonly IMeshData_ReMesh: 'IMeshData_ReMesh'

  readonly IMeshData_UnorientedWire: 'IMeshData_UnorientedWire'

  readonly IMeshData_TooFewPoints: 'IMeshData_TooFewPoints'

  readonly IMeshData_Outdated: 'IMeshData_Outdated'

  readonly IMeshData_Reused: 'IMeshData_Reused'

  readonly IMeshData_UserBreak: 'IMeshData_UserBreak'

IMeshData_StatusOwner: declare class IMeshData_StatusOwner

  // IMeshData_StatusOwner.IsEqual (method)
  IsEqual(theValue: IMeshData_Status): boolean;

  // IMeshData_StatusOwner.IsSet (method)
  IsSet(theValue: IMeshData_Status): boolean;

  // IMeshData_StatusOwner.SetStatus (method)
  SetStatus(theValue: IMeshData_Status): void;

  // IMeshData_StatusOwner.UnsetStatus (method)
  UnsetStatus(theValue: IMeshData_Status): void;

  // IMeshData_StatusOwner.GetStatusMask (method)
  GetStatusMask(): number;

  // IMeshData_StatusOwner.delete (method)
  delete(): void;

  // IMeshData_StatusOwner.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_TessellatedShape: declare class IMeshData_TessellatedShape extends IMeshData_Shape

  // IMeshData_TessellatedShape.GetDeflection (method)
  GetDeflection(): number;

  // IMeshData_TessellatedShape.SetDeflection (method)
  SetDeflection(theValue: number): void;

  // IMeshData_TessellatedShape.get_type_name (method)
  static get_type_name(): string;

  // IMeshData_TessellatedShape.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IMeshData_TessellatedShape.DynamicType (method)
  DynamicType(): Standard_Type;

  // IMeshData_TessellatedShape.delete (method)
  delete(): void;

  // IMeshData_TessellatedShape.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_Array1OfInteger: declare class IMeshData_Array1OfInteger extends Standard_Transient

  // IMeshData_Array1OfInteger.constructor (constructor)
  constructor();

  // IMeshData_Array1OfInteger.delete (method)
  delete(): void;

  // IMeshData_Array1OfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_Array1OfVertexOfDelaun: declare class IMeshData_Array1OfVertexOfDelaun extends Standard_Transient

  // IMeshData_Array1OfVertexOfDelaun.constructor (constructor)
  constructor();

  // IMeshData_Array1OfVertexOfDelaun.delete (method)
  delete(): void;

  // IMeshData_Array1OfVertexOfDelaun.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_BndBox2dTree: declare class IMeshData_BndBox2dTree extends Standard_Transient

  // IMeshData_BndBox2dTree.constructor (constructor)
  constructor();

  // IMeshData_BndBox2dTree.delete (method)
  delete(): void;

  // IMeshData_BndBox2dTree.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_BndBox2dTreeFiller: declare class IMeshData_BndBox2dTreeFiller

  // IMeshData_BndBox2dTreeFiller.constructor (constructor)
  constructor(theTree: any, theAlloc?: NCollection_BaseAllocator, isFullRandom?: boolean);

  // IMeshData_BndBox2dTreeFiller.Add (method)
  Add(theObj: number, theBnd: Bnd_Box2d): void;

  // IMeshData_BndBox2dTreeFiller.Fill (method)
  Fill(): number;

  // IMeshData_BndBox2dTreeFiller.Reset (method)
  Reset(): void;

  // IMeshData_BndBox2dTreeFiller.delete (method)
  delete(): void;

  // IMeshData_BndBox2dTreeFiller.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_CircleCellFilter: declare class IMeshData_CircleCellFilter

  // IMeshData_CircleCellFilter.constructor (constructor)
  constructor(theCellSize?: number, theAlloc?: NCollection_IncAllocator);
  constructor(theDim: number, theCellSize?: number, theAlloc?: NCollection_IncAllocator);

  // IMeshData_CircleCellFilter.Reset (method)
  Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
  Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;

  // IMeshData_CircleCellFilter.Add (method)
  Add(theTarget: number, thePnt: gp_XY): void;
  Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

  // IMeshData_CircleCellFilter.Remove (method)
  Remove(theTarget: number, thePnt: gp_XY): void;
  Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

  // IMeshData_CircleCellFilter.Inspect (method)
  Inspect(thePnt: gp_XY, theInspector: BRepMesh_CircleInspector): void;
  Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_CircleInspector): void;

  // IMeshData_CircleCellFilter.delete (method)
  delete(): void;

  // IMeshData_CircleCellFilter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_DMapOfIFacePtrsListOfInteger: declare class IMeshData_DMapOfIFacePtrsListOfInteger extends Standard_Transient

  // IMeshData_DMapOfIFacePtrsListOfInteger.constructor (constructor)
  constructor();

  // IMeshData_DMapOfIFacePtrsListOfInteger.delete (method)
  delete(): void;

  // IMeshData_DMapOfIFacePtrsListOfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs: declare class IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs extends Standard_Transient

  // IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs.constructor (constructor)
  constructor();

  // IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs.delete (method)
  delete(): void;

  // IMeshData_DMapOfIFacePtrsMapOfIEdgePtrs.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_DMapOfIntegerListOfInteger: declare class IMeshData_DMapOfIntegerListOfInteger extends Standard_Transient

  // IMeshData_DMapOfIntegerListOfInteger.constructor (constructor)
  constructor();

  // IMeshData_DMapOfIntegerListOfInteger.delete (method)
  delete(): void;

  // IMeshData_DMapOfIntegerListOfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_DMapOfShapeInteger: declare class IMeshData_DMapOfShapeInteger extends Standard_Transient

  // IMeshData_DMapOfShapeInteger.constructor (constructor)
  constructor();

  // IMeshData_DMapOfShapeInteger.delete (method)
  delete(): void;

  // IMeshData_DMapOfShapeInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_IDMapOfIFacePtrsListOfIPCurves: declare class IMeshData_IDMapOfIFacePtrsListOfIPCurves extends Standard_Transient

  // IMeshData_IDMapOfIFacePtrsListOfIPCurves.constructor (constructor)
  constructor();

  // IMeshData_IDMapOfIFacePtrsListOfIPCurves.delete (method)
  delete(): void;

  // IMeshData_IDMapOfIFacePtrsListOfIPCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_IDMapOfLink: declare class IMeshData_IDMapOfLink extends Standard_Transient

  // IMeshData_IDMapOfLink.constructor (constructor)
  constructor();

  // IMeshData_IDMapOfLink.delete (method)
  delete(): void;

  // IMeshData_IDMapOfLink.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_IMapOfReal: declare class IMeshData_IMapOfReal extends Standard_Transient

  // IMeshData_IMapOfReal.constructor (constructor)
  constructor();

  // IMeshData_IMapOfReal.delete (method)
  delete(): void;

  // IMeshData_IMapOfReal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_ListOfIPCurves: declare class IMeshData_ListOfIPCurves extends Standard_Transient

  // IMeshData_ListOfIPCurves.constructor (constructor)
  constructor();

  // IMeshData_ListOfIPCurves.delete (method)
  delete(): void;

  // IMeshData_ListOfIPCurves.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_ListOfInteger: declare class IMeshData_ListOfInteger extends Standard_Transient

  // IMeshData_ListOfInteger.constructor (constructor)
  constructor();

  // IMeshData_ListOfInteger.delete (method)
  delete(): void;

  // IMeshData_ListOfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_ListOfPnt2d: declare class IMeshData_ListOfPnt2d extends Standard_Transient

  // IMeshData_ListOfPnt2d.constructor (constructor)
  constructor();

  // IMeshData_ListOfPnt2d.delete (method)
  delete(): void;

  // IMeshData_ListOfPnt2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_MapOfIEdgePtr: declare class IMeshData_MapOfIEdgePtr extends Standard_Transient

  // IMeshData_MapOfIEdgePtr.constructor (constructor)
  constructor();

  // IMeshData_MapOfIEdgePtr.delete (method)
  delete(): void;

  // IMeshData_MapOfIEdgePtr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_MapOfIFacePtr: declare class IMeshData_MapOfIFacePtr extends Standard_Transient

  // IMeshData_MapOfIFacePtr.constructor (constructor)
  constructor();

  // IMeshData_MapOfIFacePtr.delete (method)
  delete(): void;

  // IMeshData_MapOfIFacePtr.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_MapOfInteger: declare class IMeshData_MapOfInteger extends Standard_Transient

  // IMeshData_MapOfInteger.constructor (constructor)
  constructor();

  // IMeshData_MapOfInteger.delete (method)
  delete(): void;

  // IMeshData_MapOfInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_MapOfIntegerInteger: declare class IMeshData_MapOfIntegerInteger extends Standard_Transient

  // IMeshData_MapOfIntegerInteger.constructor (constructor)
  constructor();

  // IMeshData_MapOfIntegerInteger.delete (method)
  delete(): void;

  // IMeshData_MapOfIntegerInteger.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_MapOfOrientedEdges: declare class IMeshData_MapOfOrientedEdges extends Standard_Transient

  // IMeshData_MapOfOrientedEdges.constructor (constructor)
  constructor();

  // IMeshData_MapOfOrientedEdges.delete (method)
  delete(): void;

  // IMeshData_MapOfOrientedEdges.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_MapOfReal: declare class IMeshData_MapOfReal extends Standard_Transient

  // IMeshData_MapOfReal.constructor (constructor)
  constructor();

  // IMeshData_MapOfReal.delete (method)
  delete(): void;

  // IMeshData_MapOfReal.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_VertexCellFilter: declare class IMeshData_VertexCellFilter

  // IMeshData_VertexCellFilter.constructor (constructor)
  constructor(theCellSize?: number, theAlloc?: NCollection_IncAllocator);
  constructor(theDim: number, theCellSize?: number, theAlloc?: NCollection_IncAllocator);

  // IMeshData_VertexCellFilter.Reset (method)
  Reset(theCellSize: number, theAlloc: NCollection_IncAllocator): void;
  Reset(theCellSize: NCollection_Array1_double, theAlloc: NCollection_IncAllocator): void;

  // IMeshData_VertexCellFilter.Add (method)
  Add(theTarget: number, thePnt: gp_XY): void;
  Add(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

  // IMeshData_VertexCellFilter.Remove (method)
  Remove(theTarget: number, thePnt: gp_XY): void;
  Remove(theTarget: number, thePntMin: gp_XY, thePntMax: gp_XY): void;

  // IMeshData_VertexCellFilter.Inspect (method)
  Inspect(thePnt: gp_XY, theInspector: BRepMesh_VertexInspector): void;
  Inspect(thePntMin: gp_XY, thePntMax: gp_XY, theInspector: BRepMesh_VertexInspector): void;

  // IMeshData_VertexCellFilter.delete (method)
  delete(): void;

  // IMeshData_VertexCellFilter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IMeshData_BndBox2dTreeFiller_ObjBnd: interface IMeshData_BndBox2dTreeFiller_ObjBnd

  myObj: number

  myBnd: Bnd_Box2d

IMeshData_VectorOfCircle: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Circle_void

IMeshData_VectorOfVertex: NCollection_Shared_NCollection_DynamicArray_BRepMesh_Vertex_void
