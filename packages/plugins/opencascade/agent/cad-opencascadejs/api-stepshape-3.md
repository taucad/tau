# libcascade — StepShape (3)

35 top-level symbols. Signatures are verbatim typescript.

StepShape_OrientedPath: declare class StepShape_OrientedPath extends StepShape_Path

  constructor

  Init(aName: TCollection_HAsciiString, aPathElement: StepShape_EdgeLoop, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPathElement: StepShape_EdgeLoop, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPathElement: StepShape_EdgeLoop, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPathElement(aPathElement: StepShape_EdgeLoop): void;

  PathElement(): StepShape_EdgeLoop;

  SetOrientation(aOrientation: boolean): void;

  Orientation(): boolean;

  SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

  EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

  EdgeListValue(num: number): StepShape_OrientedEdge;

  NbEdgeList(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_Path: declare class StepShape_Path extends StepShape_TopologicalRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;
  Init(aName: TCollection_HAsciiString): void;

  SetEdgeList(aEdgeList: NCollection_HArray1_handle_StepShape_OrientedEdge): void;

  EdgeList(): NCollection_HArray1_handle_StepShape_OrientedEdge;

  EdgeListValue(num: number): StepShape_OrientedEdge;

  NbEdgeList(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_PlusMinusTolerance: declare class StepShape_PlusMinusTolerance extends Standard_Transient

  constructor

  Init(range: StepShape_ToleranceMethodDefinition, toleranced_dimension: StepShape_DimensionalCharacteristic): void;

  Range(): StepShape_ToleranceMethodDefinition;

  SetRange(range: StepShape_ToleranceMethodDefinition): void;

  TolerancedDimension(): StepShape_DimensionalCharacteristic;

  SetTolerancedDimension(toleranced_dimension: StepShape_DimensionalCharacteristic): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_PointRepresentation: declare class StepShape_PointRepresentation extends StepShape_ShapeRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_PolyLoop: declare class StepShape_PolyLoop extends StepShape_Loop

  constructor

  Init(aName: TCollection_HAsciiString, aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPolygon(aPolygon: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;

  Polygon(): NCollection_HArray1_handle_StepGeom_CartesianPoint;

  PolygonValue(num: number): StepGeom_CartesianPoint;

  NbPolygon(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_PrecisionQualifier: declare class StepShape_PrecisionQualifier extends Standard_Transient

  constructor

  Init(precision_value: number): void;

  PrecisionValue(): number;

  SetPrecisionValue(precision_value: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_QualifiedRepresentationItem: declare class StepShape_QualifiedRepresentationItem extends StepRepr_RepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;
  Init(aName: TCollection_HAsciiString): void;

  Qualifiers(): NCollection_HArray1_StepShape_ValueQualifier;

  NbQualifiers(): number;

  SetQualifiers(qualifiers: NCollection_HArray1_StepShape_ValueQualifier): void;

  QualifiersValue(num: number): StepShape_ValueQualifier;

  SetQualifiersValue(num: number, aqualifier: StepShape_ValueQualifier): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ReversibleTopologyItem: declare class StepShape_ReversibleTopologyItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Edge(): StepShape_Edge;

  Path(): StepShape_Path;

  Face(): StepShape_Face;

  FaceBound(): StepShape_FaceBound;

  ClosedShell(): StepShape_ClosedShell;

  OpenShell(): StepShape_OpenShell;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_RevolvedAreaSolid: declare class StepShape_RevolvedAreaSolid extends StepShape_SweptAreaSolid

  constructor

  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  SetAxis(aAxis: StepGeom_Axis1Placement): void;

  Axis(): StepGeom_Axis1Placement;

  SetAngle(aAngle: number): void;

  Angle(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_RevolvedFaceSolid: declare class StepShape_RevolvedFaceSolid extends StepShape_SweptFaceSolid

  constructor

  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface, aAxis: StepGeom_Axis1Placement, aAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetAxis(aAxis: StepGeom_Axis1Placement): void;

  Axis(): StepGeom_Axis1Placement;

  SetAngle(aAngle: number): void;

  Angle(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_RightAngularWedge: declare class StepShape_RightAngularWedge extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number, aLtx: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aX: number, aY: number, aZ: number, aLtx: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPosition(aPosition: StepGeom_Axis2Placement3d): void;

  Position(): StepGeom_Axis2Placement3d;

  SetX(aX: number): void;

  X(): number;

  SetY(aY: number): void;

  Y(): number;

  SetZ(aZ: number): void;

  Z(): number;

  SetLtx(aLtx: number): void;

  Ltx(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_RightCircularCone: declare class StepShape_RightCircularCone extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number, aSemiAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number, aSemiAngle: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPosition(aPosition: StepGeom_Axis1Placement): void;

  Position(): StepGeom_Axis1Placement;

  SetHeight(aHeight: number): void;

  Height(): number;

  SetRadius(aRadius: number): void;

  Radius(): number;

  SetSemiAngle(aSemiAngle: number): void;

  SemiAngle(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_RightCircularCylinder: declare class StepShape_RightCircularCylinder extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aHeight: number, aRadius: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPosition(aPosition: StepGeom_Axis1Placement): void;

  Position(): StepGeom_Axis1Placement;

  SetHeight(aHeight: number): void;

  Height(): number;

  SetRadius(aRadius: number): void;

  Radius(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_SeamEdge: declare class StepShape_SeamEdge extends StepShape_OrientedEdge

  constructor

  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
  Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
  Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
  Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aOrientedEdge_EdgeElement: StepShape_Edge, aOrientedEdge_Orientation: boolean, aPcurveReference: StepGeom_Pcurve): void;
  Init(aName: TCollection_HAsciiString, aEdgeElement: StepShape_Edge, aOrientation: boolean): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  PcurveReference(): StepGeom_Pcurve;

  SetPcurveReference(PcurveReference: StepGeom_Pcurve): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ShapeDefinitionRepresentation: declare class StepShape_ShapeDefinitionRepresentation extends StepRepr_PropertyDefinitionRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ShapeDimensionRepresentation: declare class StepShape_ShapeDimensionRepresentation extends StepShape_ShapeRepresentation

  constructor

  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  SetItemsAP242(theItems: NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem): void;

  ItemsAP242(): NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ShapeDimensionRepresentationItem: declare class StepShape_ShapeDimensionRepresentationItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  CompoundRepresentationItem(): StepRepr_CompoundRepresentationItem;

  DescriptiveRepresentationItem(): StepRepr_DescriptiveRepresentationItem;

  MeasureRepresentationItem(): StepRepr_MeasureRepresentationItem;

  Placement(): StepGeom_Placement;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ShapeRepresentation: declare class StepShape_ShapeRepresentation extends StepRepr_Representation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ShapeRepresentationWithParameters: declare class StepShape_ShapeRepresentationWithParameters extends StepShape_ShapeRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_Shell: declare class StepShape_Shell extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  OpenShell(): StepShape_OpenShell;

  ClosedShell(): StepShape_ClosedShell;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ShellBasedSurfaceModel: declare class StepShape_ShellBasedSurfaceModel extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSbsmBoundary(aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;

  SbsmBoundary(): NCollection_HArray1_StepShape_Shell;

  SbsmBoundaryValue(num: number): StepShape_Shell;

  NbSbsmBoundary(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_SolidModel: declare class StepShape_SolidModel extends StepGeom_GeometricRepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_SolidReplica: declare class StepShape_SolidReplica extends StepShape_SolidModel

  constructor

  Init(aName: TCollection_HAsciiString, aParentSolid: StepShape_SolidModel, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aParentSolid: StepShape_SolidModel, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetParentSolid(aParentSolid: StepShape_SolidModel): void;

  ParentSolid(): StepShape_SolidModel;

  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator3d): void;

  Transformation(): StepGeom_CartesianTransformationOperator3d;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_Sphere: declare class StepShape_Sphere extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aRadius: number, aCentre: StepGeom_Point): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aRadius: number, aCentre: StepGeom_Point): void;
  Init(aName: TCollection_HAsciiString): void;

  SetRadius(aRadius: number): void;

  Radius(): number;

  SetCentre(aCentre: StepGeom_Point): void;

  Centre(): StepGeom_Point;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_Subedge: declare class StepShape_Subedge extends StepShape_Edge

  constructor

  Init(aRepresentationItem_Name: TCollection_HAsciiString, aEdge_EdgeStart: StepShape_Vertex, aEdge_EdgeEnd: StepShape_Vertex, aParentEdge: StepShape_Edge): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aEdge_EdgeStart: StepShape_Vertex, aEdge_EdgeEnd: StepShape_Vertex, aParentEdge: StepShape_Edge): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aEdge_EdgeStart: StepShape_Vertex, aEdge_EdgeEnd: StepShape_Vertex, aParentEdge: StepShape_Edge): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  ParentEdge(): StepShape_Edge;

  SetParentEdge(ParentEdge: StepShape_Edge): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_Subface: declare class StepShape_Subface extends StepShape_Face

  constructor

  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFace_Bounds: NCollection_HArray1_handle_StepShape_FaceBound, aParentFace: StepShape_Face): void;
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFace_Bounds: NCollection_HArray1_handle_StepShape_FaceBound, aParentFace: StepShape_Face): void;
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFace_Bounds: NCollection_HArray1_handle_StepShape_FaceBound, aParentFace: StepShape_Face): void;
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
  Init(aName: TCollection_HAsciiString): void;

  ParentFace(): StepShape_Face;

  SetParentFace(ParentFace: StepShape_Face): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_SurfaceModel: declare class StepShape_SurfaceModel extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ShellBasedSurfaceModel(): StepShape_ShellBasedSurfaceModel;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_SweptAreaSolid: declare class StepShape_SweptAreaSolid extends StepShape_SolidModel

  constructor

  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSweptArea(aSweptArea: StepGeom_CurveBoundedSurface): void;

  SweptArea(): StepGeom_CurveBoundedSurface;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_SweptFaceSolid: declare class StepShape_SweptFaceSolid extends StepShape_SolidModel

  constructor

  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSweptFace(aSweptArea: StepShape_FaceSurface): void;

  SweptFace(): StepShape_FaceSurface;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ToleranceMethodDefinition: declare class StepShape_ToleranceMethodDefinition extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  ToleranceValue(): StepShape_ToleranceValue;

  LimitsAndFits(): StepShape_LimitsAndFits;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_ToleranceValue: declare class StepShape_ToleranceValue extends Standard_Transient

  constructor

  Init(lower_bound: Standard_Transient, upper_bound: Standard_Transient): void;

  LowerBound(): Standard_Transient;

  SetLowerBound(lower_bound: Standard_Transient): void;

  UpperBound(): Standard_Transient;

  SetUpperBound(upper_bound: Standard_Transient): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_TopologicalRepresentationItem: declare class StepShape_TopologicalRepresentationItem extends StepRepr_RepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_Torus: declare class StepShape_Torus extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPosition(aPosition: StepGeom_Axis1Placement): void;

  Position(): StepGeom_Axis1Placement;

  SetMajorRadius(aMajorRadius: number): void;

  MajorRadius(): number;

  SetMinorRadius(aMinorRadius: number): void;

  MinorRadius(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_TransitionalShapeRepresentation: declare class StepShape_TransitionalShapeRepresentation extends StepShape_ShapeRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepShape_TypeQualifier: declare class StepShape_TypeQualifier extends Standard_Transient

  constructor

  Init(name: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetName(name: TCollection_HAsciiString): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
