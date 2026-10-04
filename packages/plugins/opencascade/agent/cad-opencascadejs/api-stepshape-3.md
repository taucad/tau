# libcascade — StepShape (3)

47 top-level symbols. Signatures are verbatim typescript.

StepShape_ShapeDimensionRepresentation: declare class StepShape_ShapeDimensionRepresentation extends StepShape_ShapeRepresentation

  // StepShape_ShapeDimensionRepresentation.constructor (constructor)
  constructor();

  // StepShape_ShapeDimensionRepresentation.Init (method)
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepShape_ShapeDimensionRepresentation.SetItemsAP242 (method)
  SetItemsAP242(theItems: NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem): void;

  // StepShape_ShapeDimensionRepresentation.ItemsAP242 (method)
  ItemsAP242(): NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem;

  // StepShape_ShapeDimensionRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ShapeDimensionRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ShapeDimensionRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ShapeDimensionRepresentation.delete (method)
  delete(): void;

  // StepShape_ShapeDimensionRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ShapeDimensionRepresentationItem: declare class StepShape_ShapeDimensionRepresentationItem extends StepData_SelectType

  // StepShape_ShapeDimensionRepresentationItem.constructor (constructor)
  constructor();

  // StepShape_ShapeDimensionRepresentationItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_ShapeDimensionRepresentationItem.CompoundRepresentationItem (method)
  CompoundRepresentationItem(): StepRepr_CompoundRepresentationItem;

  // StepShape_ShapeDimensionRepresentationItem.DescriptiveRepresentationItem (method)
  DescriptiveRepresentationItem(): StepRepr_DescriptiveRepresentationItem;

  // StepShape_ShapeDimensionRepresentationItem.MeasureRepresentationItem (method)
  MeasureRepresentationItem(): StepRepr_MeasureRepresentationItem;

  // StepShape_ShapeDimensionRepresentationItem.Placement (method)
  Placement(): StepGeom_Placement;

  // StepShape_ShapeDimensionRepresentationItem.delete (method)
  delete(): void;

  // StepShape_ShapeDimensionRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ShapeRepresentation: declare class StepShape_ShapeRepresentation extends StepRepr_Representation

  // StepShape_ShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_ShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_ShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ShapeRepresentationWithParameters: declare class StepShape_ShapeRepresentationWithParameters extends StepShape_ShapeRepresentation

  // StepShape_ShapeRepresentationWithParameters.constructor (constructor)
  constructor();

  // StepShape_ShapeRepresentationWithParameters.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ShapeRepresentationWithParameters.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ShapeRepresentationWithParameters.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ShapeRepresentationWithParameters.delete (method)
  delete(): void;

  // StepShape_ShapeRepresentationWithParameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Shell: declare class StepShape_Shell extends StepData_SelectType

  // StepShape_Shell.constructor (constructor)
  constructor();

  // StepShape_Shell.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_Shell.OpenShell (method)
  OpenShell(): StepShape_OpenShell;

  // StepShape_Shell.ClosedShell (method)
  ClosedShell(): StepShape_ClosedShell;

  // StepShape_Shell.delete (method)
  delete(): void;

  // StepShape_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ShellBasedSurfaceModel: declare class StepShape_ShellBasedSurfaceModel extends StepGeom_GeometricRepresentationItem

  // StepShape_ShellBasedSurfaceModel.constructor (constructor)
  constructor();

  // StepShape_ShellBasedSurfaceModel.Init (method)
  Init(aName: TCollection_HAsciiString, aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_ShellBasedSurfaceModel.SetSbsmBoundary (method)
  SetSbsmBoundary(aSbsmBoundary: NCollection_HArray1_StepShape_Shell): void;

  // StepShape_ShellBasedSurfaceModel.SbsmBoundary (method)
  SbsmBoundary(): NCollection_HArray1_StepShape_Shell;

  // StepShape_ShellBasedSurfaceModel.SbsmBoundaryValue (method)
  SbsmBoundaryValue(num: number): StepShape_Shell;

  // StepShape_ShellBasedSurfaceModel.NbSbsmBoundary (method)
  NbSbsmBoundary(): number;

  // StepShape_ShellBasedSurfaceModel.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ShellBasedSurfaceModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ShellBasedSurfaceModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ShellBasedSurfaceModel.delete (method)
  delete(): void;

  // StepShape_ShellBasedSurfaceModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_SolidModel: declare class StepShape_SolidModel extends StepGeom_GeometricRepresentationItem

  // StepShape_SolidModel.constructor (constructor)
  constructor();

  // StepShape_SolidModel.get_type_name (method)
  static get_type_name(): string;

  // StepShape_SolidModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_SolidModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_SolidModel.delete (method)
  delete(): void;

  // StepShape_SolidModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_SolidReplica: declare class StepShape_SolidReplica extends StepShape_SolidModel

  // StepShape_SolidReplica.constructor (constructor)
  constructor();

  // StepShape_SolidReplica.Init (method)
  Init(aName: TCollection_HAsciiString, aParentSolid: StepShape_SolidModel, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_SolidReplica.SetParentSolid (method)
  SetParentSolid(aParentSolid: StepShape_SolidModel): void;

  // StepShape_SolidReplica.ParentSolid (method)
  ParentSolid(): StepShape_SolidModel;

  // StepShape_SolidReplica.SetTransformation (method)
  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator3d): void;

  // StepShape_SolidReplica.Transformation (method)
  Transformation(): StepGeom_CartesianTransformationOperator3d;

  // StepShape_SolidReplica.get_type_name (method)
  static get_type_name(): string;

  // StepShape_SolidReplica.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_SolidReplica.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_SolidReplica.delete (method)
  delete(): void;

  // StepShape_SolidReplica.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Sphere: declare class StepShape_Sphere extends StepGeom_GeometricRepresentationItem

  // StepShape_Sphere.constructor (constructor)
  constructor();

  // StepShape_Sphere.Init (method)
  Init(aName: TCollection_HAsciiString, aRadius: number, aCentre: StepGeom_Point): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Sphere.SetRadius (method)
  SetRadius(aRadius: number): void;

  // StepShape_Sphere.Radius (method)
  Radius(): number;

  // StepShape_Sphere.SetCentre (method)
  SetCentre(aCentre: StepGeom_Point): void;

  // StepShape_Sphere.Centre (method)
  Centre(): StepGeom_Point;

  // StepShape_Sphere.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Sphere.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Sphere.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Sphere.delete (method)
  delete(): void;

  // StepShape_Sphere.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Subedge: declare class StepShape_Subedge extends StepShape_Edge

  // StepShape_Subedge.constructor (constructor)
  constructor();

  // StepShape_Subedge.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aEdge_EdgeStart: StepShape_Vertex, aEdge_EdgeEnd: StepShape_Vertex, aParentEdge: StepShape_Edge): void;
  Init(aName: TCollection_HAsciiString, aEdgeStart: StepShape_Vertex, aEdgeEnd: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Subedge.ParentEdge (method)
  ParentEdge(): StepShape_Edge;

  // StepShape_Subedge.SetParentEdge (method)
  SetParentEdge(ParentEdge: StepShape_Edge): void;

  // StepShape_Subedge.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Subedge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Subedge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Subedge.delete (method)
  delete(): void;

  // StepShape_Subedge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Subface: declare class StepShape_Subface extends StepShape_Face

  // StepShape_Subface.constructor (constructor)
  constructor();

  // StepShape_Subface.Init (method)
  Init(aRepresentationItem_Name: TCollection_HAsciiString, aFace_Bounds: NCollection_HArray1_handle_StepShape_FaceBound, aParentFace: StepShape_Face): void;
  Init(aName: TCollection_HAsciiString, aBounds: NCollection_HArray1_handle_StepShape_FaceBound): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Subface.ParentFace (method)
  ParentFace(): StepShape_Face;

  // StepShape_Subface.SetParentFace (method)
  SetParentFace(ParentFace: StepShape_Face): void;

  // StepShape_Subface.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Subface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Subface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Subface.delete (method)
  delete(): void;

  // StepShape_Subface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_SurfaceModel: declare class StepShape_SurfaceModel extends StepData_SelectType

  // StepShape_SurfaceModel.constructor (constructor)
  constructor();

  // StepShape_SurfaceModel.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_SurfaceModel.ShellBasedSurfaceModel (method)
  ShellBasedSurfaceModel(): StepShape_ShellBasedSurfaceModel;

  // StepShape_SurfaceModel.delete (method)
  delete(): void;

  // StepShape_SurfaceModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_SweptAreaSolid: declare class StepShape_SweptAreaSolid extends StepShape_SolidModel

  // StepShape_SweptAreaSolid.constructor (constructor)
  constructor();

  // StepShape_SweptAreaSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptArea: StepGeom_CurveBoundedSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_SweptAreaSolid.SetSweptArea (method)
  SetSweptArea(aSweptArea: StepGeom_CurveBoundedSurface): void;

  // StepShape_SweptAreaSolid.SweptArea (method)
  SweptArea(): StepGeom_CurveBoundedSurface;

  // StepShape_SweptAreaSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_SweptAreaSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_SweptAreaSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_SweptAreaSolid.delete (method)
  delete(): void;

  // StepShape_SweptAreaSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_SweptFaceSolid: declare class StepShape_SweptFaceSolid extends StepShape_SolidModel

  // StepShape_SweptFaceSolid.constructor (constructor)
  constructor();

  // StepShape_SweptFaceSolid.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptArea: StepShape_FaceSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_SweptFaceSolid.SetSweptFace (method)
  SetSweptFace(aSweptArea: StepShape_FaceSurface): void;

  // StepShape_SweptFaceSolid.SweptFace (method)
  SweptFace(): StepShape_FaceSurface;

  // StepShape_SweptFaceSolid.get_type_name (method)
  static get_type_name(): string;

  // StepShape_SweptFaceSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_SweptFaceSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_SweptFaceSolid.delete (method)
  delete(): void;

  // StepShape_SweptFaceSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ToleranceMethodDefinition: declare class StepShape_ToleranceMethodDefinition extends StepData_SelectType

  // StepShape_ToleranceMethodDefinition.constructor (constructor)
  constructor();

  // StepShape_ToleranceMethodDefinition.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_ToleranceMethodDefinition.ToleranceValue (method)
  ToleranceValue(): StepShape_ToleranceValue;

  // StepShape_ToleranceMethodDefinition.LimitsAndFits (method)
  LimitsAndFits(): StepShape_LimitsAndFits;

  // StepShape_ToleranceMethodDefinition.delete (method)
  delete(): void;

  // StepShape_ToleranceMethodDefinition.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ToleranceValue: declare class StepShape_ToleranceValue extends Standard_Transient

  // StepShape_ToleranceValue.constructor (constructor)
  constructor();

  // StepShape_ToleranceValue.Init (method)
  Init(lower_bound: Standard_Transient, upper_bound: Standard_Transient): void;

  // StepShape_ToleranceValue.LowerBound (method)
  LowerBound(): Standard_Transient;

  // StepShape_ToleranceValue.SetLowerBound (method)
  SetLowerBound(lower_bound: Standard_Transient): void;

  // StepShape_ToleranceValue.UpperBound (method)
  UpperBound(): Standard_Transient;

  // StepShape_ToleranceValue.SetUpperBound (method)
  SetUpperBound(upper_bound: Standard_Transient): void;

  // StepShape_ToleranceValue.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ToleranceValue.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ToleranceValue.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ToleranceValue.delete (method)
  delete(): void;

  // StepShape_ToleranceValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_TopologicalRepresentationItem: declare class StepShape_TopologicalRepresentationItem extends StepRepr_RepresentationItem

  // StepShape_TopologicalRepresentationItem.constructor (constructor)
  constructor();

  // StepShape_TopologicalRepresentationItem.get_type_name (method)
  static get_type_name(): string;

  // StepShape_TopologicalRepresentationItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_TopologicalRepresentationItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_TopologicalRepresentationItem.delete (method)
  delete(): void;

  // StepShape_TopologicalRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Torus: declare class StepShape_Torus extends StepGeom_GeometricRepresentationItem

  // StepShape_Torus.constructor (constructor)
  constructor();

  // StepShape_Torus.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis1Placement, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_Torus.SetPosition (method)
  SetPosition(aPosition: StepGeom_Axis1Placement): void;

  // StepShape_Torus.Position (method)
  Position(): StepGeom_Axis1Placement;

  // StepShape_Torus.SetMajorRadius (method)
  SetMajorRadius(aMajorRadius: number): void;

  // StepShape_Torus.MajorRadius (method)
  MajorRadius(): number;

  // StepShape_Torus.SetMinorRadius (method)
  SetMinorRadius(aMinorRadius: number): void;

  // StepShape_Torus.MinorRadius (method)
  MinorRadius(): number;

  // StepShape_Torus.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Torus.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Torus.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Torus.delete (method)
  delete(): void;

  // StepShape_Torus.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_TransitionalShapeRepresentation: declare class StepShape_TransitionalShapeRepresentation extends StepShape_ShapeRepresentation

  // StepShape_TransitionalShapeRepresentation.constructor (constructor)
  constructor();

  // StepShape_TransitionalShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepShape_TransitionalShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_TransitionalShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_TransitionalShapeRepresentation.delete (method)
  delete(): void;

  // StepShape_TransitionalShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_TypeQualifier: declare class StepShape_TypeQualifier extends Standard_Transient

  // StepShape_TypeQualifier.constructor (constructor)
  constructor();

  // StepShape_TypeQualifier.Init (method)
  Init(name: TCollection_HAsciiString): void;

  // StepShape_TypeQualifier.Name (method)
  Name(): TCollection_HAsciiString;

  // StepShape_TypeQualifier.SetName (method)
  SetName(name: TCollection_HAsciiString): void;

  // StepShape_TypeQualifier.get_type_name (method)
  static get_type_name(): string;

  // StepShape_TypeQualifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_TypeQualifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_TypeQualifier.delete (method)
  delete(): void;

  // StepShape_TypeQualifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ValueFormatTypeQualifier: declare class StepShape_ValueFormatTypeQualifier extends Standard_Transient

  // StepShape_ValueFormatTypeQualifier.constructor (constructor)
  constructor();

  // StepShape_ValueFormatTypeQualifier.Init (method)
  Init(theFormatType: TCollection_HAsciiString): void;

  // StepShape_ValueFormatTypeQualifier.FormatType (method)
  FormatType(): TCollection_HAsciiString;

  // StepShape_ValueFormatTypeQualifier.SetFormatType (method)
  SetFormatType(theFormatType: TCollection_HAsciiString): void;

  // StepShape_ValueFormatTypeQualifier.get_type_name (method)
  static get_type_name(): string;

  // StepShape_ValueFormatTypeQualifier.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_ValueFormatTypeQualifier.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_ValueFormatTypeQualifier.delete (method)
  delete(): void;

  // StepShape_ValueFormatTypeQualifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_ValueQualifier: declare class StepShape_ValueQualifier extends StepData_SelectType

  // StepShape_ValueQualifier.constructor (constructor)
  constructor();

  // StepShape_ValueQualifier.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepShape_ValueQualifier.PrecisionQualifier (method)
  PrecisionQualifier(): StepShape_PrecisionQualifier;

  // StepShape_ValueQualifier.TypeQualifier (method)
  TypeQualifier(): StepShape_TypeQualifier;

  // StepShape_ValueQualifier.ValueFormatTypeQualifier (method)
  ValueFormatTypeQualifier(): StepShape_ValueFormatTypeQualifier;

  // StepShape_ValueQualifier.delete (method)
  delete(): void;

  // StepShape_ValueQualifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Vertex: declare class StepShape_Vertex extends StepShape_TopologicalRepresentationItem

  // StepShape_Vertex.constructor (constructor)
  constructor();

  // StepShape_Vertex.get_type_name (method)
  static get_type_name(): string;

  // StepShape_Vertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_Vertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_Vertex.delete (method)
  delete(): void;

  // StepShape_Vertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_VertexLoop: declare class StepShape_VertexLoop extends StepShape_Loop

  // StepShape_VertexLoop.constructor (constructor)
  constructor();

  // StepShape_VertexLoop.Init (method)
  Init(aName: TCollection_HAsciiString, aLoopVertex: StepShape_Vertex): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_VertexLoop.SetLoopVertex (method)
  SetLoopVertex(aLoopVertex: StepShape_Vertex): void;

  // StepShape_VertexLoop.LoopVertex (method)
  LoopVertex(): StepShape_Vertex;

  // StepShape_VertexLoop.get_type_name (method)
  static get_type_name(): string;

  // StepShape_VertexLoop.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_VertexLoop.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_VertexLoop.delete (method)
  delete(): void;

  // StepShape_VertexLoop.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_VertexPoint: declare class StepShape_VertexPoint extends StepShape_Vertex

  // StepShape_VertexPoint.constructor (constructor)
  constructor();

  // StepShape_VertexPoint.Init (method)
  Init(aName: TCollection_HAsciiString, aVertexGeometry: StepGeom_Point): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepShape_VertexPoint.SetVertexGeometry (method)
  SetVertexGeometry(aVertexGeometry: StepGeom_Point): void;

  // StepShape_VertexPoint.VertexGeometry (method)
  VertexGeometry(): StepGeom_Point;

  // StepShape_VertexPoint.get_type_name (method)
  static get_type_name(): string;

  // StepShape_VertexPoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepShape_VertexPoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepShape_VertexPoint.delete (method)
  delete(): void;

  // StepShape_VertexPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepShape_Array1OfConnectedEdgeSet: NCollection_Array1_handle_StepShape_ConnectedEdgeSet

StepShape_Array1OfConnectedFaceSet: NCollection_Array1_handle_StepShape_ConnectedFaceSet

StepShape_Array1OfEdge: NCollection_Array1_handle_StepShape_Edge

StepShape_Array1OfFace: NCollection_Array1_handle_StepShape_Face

StepShape_Array1OfFaceBound: NCollection_Array1_handle_StepShape_FaceBound

StepShape_Array1OfGeometricSetSelect: NCollection_Array1_StepShape_GeometricSetSelect

StepShape_Array1OfOrientedClosedShell: NCollection_Array1_handle_StepShape_OrientedClosedShell

StepShape_Array1OfOrientedEdge: NCollection_Array1_handle_StepShape_OrientedEdge

StepShape_Array1OfShapeDimensionRepresentationItem: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem

StepShape_Array1OfShell: NCollection_Array1_StepShape_Shell

StepShape_Array1OfValueQualifier: NCollection_Array1_StepShape_ValueQualifier

StepShape_HArray1OfConnectedEdgeSet: NCollection_HArray1_handle_StepShape_ConnectedEdgeSet

StepShape_HArray1OfConnectedFaceSet: NCollection_HArray1_handle_StepShape_ConnectedFaceSet

StepShape_HArray1OfEdge: NCollection_HArray1_handle_StepShape_Edge

StepShape_HArray1OfFace: NCollection_HArray1_handle_StepShape_Face

StepShape_HArray1OfFaceBound: NCollection_HArray1_handle_StepShape_FaceBound

StepShape_HArray1OfGeometricSetSelect: NCollection_HArray1_StepShape_GeometricSetSelect

StepShape_HArray1OfOrientedClosedShell: NCollection_HArray1_handle_StepShape_OrientedClosedShell

StepShape_HArray1OfOrientedEdge: NCollection_HArray1_handle_StepShape_OrientedEdge

StepShape_HArray1OfShapeDimensionRepresentationItem: NCollection_HArray1_StepShape_ShapeDimensionRepresentationItem

StepShape_HArray1OfShell: NCollection_HArray1_StepShape_Shell

StepShape_HArray1OfValueQualifier: NCollection_HArray1_StepShape_ValueQualifier
