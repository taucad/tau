# libcascade — StepVisual (4)

60 top-level symbols. Signatures are verbatim typescript.

StepVisual_TessellatedCurveSet: declare class StepVisual_TessellatedCurveSet extends StepVisual_TessellatedItem

  constructor

  Init(theName: TCollection_HAsciiString, theCoordList: StepVisual_CoordinatesList, theCurves: any): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theCoordList: StepVisual_CoordinatesList, theCurves: any): void;
  Init(aName: TCollection_HAsciiString): void;

  CoordList(): StepVisual_CoordinatesList;

  Curves(): any;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedEdge: declare class StepVisual_TessellatedEdge extends StepVisual_TessellatedStructuredItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;

  Coordinates(): StepVisual_CoordinatesList;

  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  GeometricLink(): StepVisual_EdgeOrCurve;

  SetGeometricLink(theGeometricLink: StepVisual_EdgeOrCurve): void;

  HasGeometricLink(): boolean;

  LineStrip(): NCollection_HArray1_int;

  SetLineStrip(theLineStrip: NCollection_HArray1_int): void;

  NbLineStrip(): number;

  LineStripValue(theNum: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedEdgeOrVertex: declare class StepVisual_TessellatedEdgeOrVertex extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  TessellatedEdge(): StepVisual_TessellatedEdge;

  TessellatedVertex(): StepVisual_TessellatedVertex;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedFace: declare class StepVisual_TessellatedFace extends StepVisual_TessellatedStructuredItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  Coordinates(): StepVisual_CoordinatesList;

  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  Pnmax(): number;

  SetPnmax(thePnmax: number): void;

  Normals(): NCollection_HArray2_double;

  SetNormals(theNormals: NCollection_HArray2_double): void;

  NbNormals(): number;

  GeometricLink(): StepVisual_FaceOrSurface;

  SetGeometricLink(theGeometricLink: StepVisual_FaceOrSurface): void;

  HasGeometricLink(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedGeometricSet: declare class StepVisual_TessellatedGeometricSet extends StepVisual_TessellatedItem

  constructor

  Init(theName: TCollection_HAsciiString, theItems: any): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theItems: any): void;
  Init(aName: TCollection_HAsciiString): void;

  Items(): any;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedItem: declare class StepVisual_TessellatedItem extends StepGeom_GeometricRepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedPointSet: declare class StepVisual_TessellatedPointSet extends StepVisual_TessellatedItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePointList: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePointList: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;

  Coordinates(): StepVisual_CoordinatesList;

  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  PointList(): NCollection_HArray1_int;

  SetPointList(thePointList: NCollection_HArray1_int): void;

  NbPointList(): number;

  PointListValue(theNum: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedShapeRepresentation: declare class StepVisual_TessellatedShapeRepresentation extends StepShape_ShapeRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedShapeRepresentationWithAccuracyParameters: declare class StepVisual_TessellatedShapeRepresentationWithAccuracyParameters extends StepVisual_TessellatedShapeRepresentation

  constructor

  Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theTessellationAccuracyParameters: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
  Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theTessellationAccuracyParameters: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  TessellationAccuracyParameters(): NCollection_HArray1_double;

  SetTessellationAccuracyParameters(theTessellationAccuracyParameters: NCollection_HArray1_double): void;

  NbTessellationAccuracyParameters(): number;

  TessellationAccuracyParametersValue(theNum: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedShell: declare class StepVisual_TessellatedShell extends StepVisual_TessellatedItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString): void;

  Items(): NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem;

  SetItems(theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem): void;

  NbItems(): number;

  ItemsValue(theNum: number): StepVisual_TessellatedStructuredItem;

  TopologicalLink(): StepShape_ConnectedFaceSet;

  SetTopologicalLink(theTopologicalLink: StepShape_ConnectedFaceSet): void;

  HasTopologicalLink(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedSolid: declare class StepVisual_TessellatedSolid extends StepVisual_TessellatedItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasGeometricLink: boolean, theGeometricLink: StepShape_ManifoldSolidBrep): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasGeometricLink: boolean, theGeometricLink: StepShape_ManifoldSolidBrep): void;
  Init(aName: TCollection_HAsciiString): void;

  Items(): NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem;

  SetItems(theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem): void;

  NbItems(): number;

  ItemsValue(theNum: number): StepVisual_TessellatedStructuredItem;

  GeometricLink(): StepShape_ManifoldSolidBrep;

  SetGeometricLink(theGeometricLink: StepShape_ManifoldSolidBrep): void;

  HasGeometricLink(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedStructuredItem: declare class StepVisual_TessellatedStructuredItem extends StepVisual_TessellatedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedSurfaceSet: declare class StepVisual_TessellatedSurfaceSet extends StepVisual_TessellatedItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;

  Coordinates(): StepVisual_CoordinatesList;

  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  Pnmax(): number;

  SetPnmax(thePnmax: number): void;

  Normals(): NCollection_HArray2_double;

  SetNormals(theNormals: NCollection_HArray2_double): void;

  NbNormals(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedVertex: declare class StepVisual_TessellatedVertex extends StepVisual_TessellatedStructuredItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_VertexPoint, thePointIndex: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_VertexPoint, thePointIndex: number): void;
  Init(aName: TCollection_HAsciiString): void;

  Coordinates(): StepVisual_CoordinatesList;

  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  TopologicalLink(): StepShape_VertexPoint;

  SetTopologicalLink(theTopologicalLink: StepShape_VertexPoint): void;

  HasTopologicalLink(): boolean;

  PointIndex(): number;

  SetPointIndex(thePointIndex: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedWire: declare class StepVisual_TessellatedWire extends StepVisual_TessellatedItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex, theHasGeometricModelLink: boolean, theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex, theHasGeometricModelLink: boolean, theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;
  Init(aName: TCollection_HAsciiString): void;

  Items(): NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex;

  SetItems(theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex): void;

  NbItems(): number;

  ItemsValue(theNum: number): StepVisual_TessellatedEdgeOrVertex;

  GeometricModelLink(): StepVisual_PathOrCompositeCurve;

  SetGeometricModelLink(theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;

  HasGeometricModelLink(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TextLiteral: declare class StepVisual_TextLiteral extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aLiteral: TCollection_HAsciiString, aPlacement: StepGeom_Axis2Placement, aAlignment: TCollection_HAsciiString, aPath: StepVisual_TextPath, aFont: StepVisual_FontSelect): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLiteral: TCollection_HAsciiString, aPlacement: StepGeom_Axis2Placement, aAlignment: TCollection_HAsciiString, aPath: StepVisual_TextPath, aFont: StepVisual_FontSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  SetLiteral(aLiteral: TCollection_HAsciiString): void;

  Literal(): TCollection_HAsciiString;

  SetPlacement(aPlacement: StepGeom_Axis2Placement): void;

  Placement(): StepGeom_Axis2Placement;

  SetAlignment(aAlignment: TCollection_HAsciiString): void;

  Alignment(): TCollection_HAsciiString;

  SetPath(aPath: StepVisual_TextPath): void;

  Path(): StepVisual_TextPath;

  SetFont(aFont: StepVisual_FontSelect): void;

  Font(): StepVisual_FontSelect;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TextOrCharacter: declare class StepVisual_TextOrCharacter extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  AnnotationText(): StepVisual_AnnotationText;

  CompositeText(): StepVisual_CompositeText;

  TextLiteral(): StepVisual_TextLiteral;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TextPath: typeof StepVisual_TextPath[keyof typeof StepVisual_TextPath]

StepVisual_TextStyle: declare class StepVisual_TextStyle extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetCharacterAppearance(aCharacterAppearance: StepVisual_TextStyleForDefinedFont): void;

  CharacterAppearance(): StepVisual_TextStyleForDefinedFont;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TextStyleForDefinedFont: declare class StepVisual_TextStyleForDefinedFont extends Standard_Transient

  constructor

  Init(aTextColour: StepVisual_Colour): void;

  SetTextColour(aTextColour: StepVisual_Colour): void;

  TextColour(): StepVisual_Colour;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TextStyleWithBoxCharacteristics: declare class StepVisual_TextStyleWithBoxCharacteristics extends StepVisual_TextStyle

  constructor

  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont, aCharacteristics: NCollection_HArray1_StepVisual_BoxCharacteristicSelect): void;
  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont): void;
  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont, aCharacteristics: NCollection_HArray1_StepVisual_BoxCharacteristicSelect): void;
  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont): void;

  SetCharacteristics(aCharacteristics: NCollection_HArray1_StepVisual_BoxCharacteristicSelect): void;

  Characteristics(): NCollection_HArray1_StepVisual_BoxCharacteristicSelect;

  CharacteristicsValue(num: number): StepVisual_BoxCharacteristicSelect;

  NbCharacteristics(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TriangulatedFace: declare class StepVisual_TriangulatedFace extends StepVisual_TessellatedFace

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  Pnindex(): NCollection_HArray1_int;

  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  NbPnindex(): number;

  PnindexValue(theNum: number): number;

  Triangles(): NCollection_HArray2_int;

  SetTriangles(theTriangles: NCollection_HArray2_int): void;

  NbTriangles(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TriangulatedSurfaceSet: declare class StepVisual_TriangulatedSurfaceSet extends StepVisual_TessellatedSurfaceSet

  constructor

  Init(theRepresentationItemName: TCollection_HAsciiString, theTessellatedFaceCoordinates: StepVisual_CoordinatesList, theTessellatedFacePnmax: number, theTessellatedFaceNormals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItemName: TCollection_HAsciiString, theTessellatedFaceCoordinates: StepVisual_CoordinatesList, theTessellatedFacePnmax: number, theTessellatedFaceNormals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItemName: TCollection_HAsciiString, theTessellatedFaceCoordinates: StepVisual_CoordinatesList, theTessellatedFacePnmax: number, theTessellatedFaceNormals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;

  Pnindex(): NCollection_HArray1_int;

  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  NbPnindex(): number;

  PnindexValue(theNum: number): number;

  Triangles(): NCollection_HArray2_int;

  SetTriangles(theTriangles: NCollection_HArray2_int): void;

  NbTriangles(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ViewVolume: declare class StepVisual_ViewVolume extends Standard_Transient

  constructor

  Init(aProjectionType: StepVisual_CentralOrParallel, aProjectionPoint: StepGeom_CartesianPoint, aViewPlaneDistance: number, aFrontPlaneDistance: number, aFrontPlaneClipping: boolean, aBackPlaneDistance: number, aBackPlaneClipping: boolean, aViewVolumeSidesClipping: boolean, aViewWindow: StepVisual_PlanarBox): void;

  SetProjectionType(aProjectionType: StepVisual_CentralOrParallel): void;

  ProjectionType(): StepVisual_CentralOrParallel;

  SetProjectionPoint(aProjectionPoint: StepGeom_CartesianPoint): void;

  ProjectionPoint(): StepGeom_CartesianPoint;

  SetViewPlaneDistance(aViewPlaneDistance: number): void;

  ViewPlaneDistance(): number;

  SetFrontPlaneDistance(aFrontPlaneDistance: number): void;

  FrontPlaneDistance(): number;

  SetFrontPlaneClipping(aFrontPlaneClipping: boolean): void;

  FrontPlaneClipping(): boolean;

  SetBackPlaneDistance(aBackPlaneDistance: number): void;

  BackPlaneDistance(): number;

  SetBackPlaneClipping(aBackPlaneClipping: boolean): void;

  BackPlaneClipping(): boolean;

  SetViewVolumeSidesClipping(aViewVolumeSidesClipping: boolean): void;

  ViewVolumeSidesClipping(): boolean;

  SetViewWindow(aViewWindow: StepVisual_PlanarBox): void;

  ViewWindow(): StepVisual_PlanarBox;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_Array1OfAnnotationPlaneElement: NCollection_Array1_StepVisual_AnnotationPlaneElement

StepVisual_Array1OfBoxCharacteristicSelect: NCollection_Array1_StepVisual_BoxCharacteristicSelect

StepVisual_Array1OfCameraModelD3MultiClippingInterectionSelect: NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect

StepVisual_Array1OfCameraModelD3MultiClippingUnionSelect: NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect

StepVisual_Array1OfCurveStyleFontPattern: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern

StepVisual_Array1OfDirectionCountSelect: NCollection_Array1_StepVisual_DirectionCountSelect

StepVisual_Array1OfDraughtingCalloutElement: NCollection_Array1_StepVisual_DraughtingCalloutElement

StepVisual_Array1OfFillStyleSelect: NCollection_Array1_StepVisual_FillStyleSelect

StepVisual_Array1OfInvisibleItem: NCollection_Array1_StepVisual_InvisibleItem

StepVisual_Array1OfLayeredItem: NCollection_Array1_StepVisual_LayeredItem

StepVisual_Array1OfPresentationStyleAssignment: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment

StepVisual_Array1OfPresentationStyleSelect: NCollection_Array1_StepVisual_PresentationStyleSelect

StepVisual_Array1OfRenderingPropertiesSelect: NCollection_Array1_StepVisual_RenderingPropertiesSelect

StepVisual_Array1OfStyleContextSelect: NCollection_Array1_StepVisual_StyleContextSelect

StepVisual_Array1OfSurfaceStyleElementSelect: NCollection_Array1_StepVisual_SurfaceStyleElementSelect

StepVisual_Array1OfTessellatedEdgeOrVertex: NCollection_Array1_StepVisual_TessellatedEdgeOrVertex

StepVisual_Array1OfTessellatedStructuredItem: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem

StepVisual_Array1OfTextOrCharacter: NCollection_Array1_StepVisual_TextOrCharacter

StepVisual_HArray1OfAnnotationPlaneElement: NCollection_HArray1_StepVisual_AnnotationPlaneElement

StepVisual_HArray1OfBoxCharacteristicSelect: NCollection_HArray1_StepVisual_BoxCharacteristicSelect

StepVisual_HArray1OfCameraModelD3MultiClippingInterectionSelect: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect

StepVisual_HArray1OfCameraModelD3MultiClippingUnionSelect: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect

StepVisual_HArray1OfCurveStyleFontPattern: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern

StepVisual_HArray1OfDirectionCountSelect: NCollection_HArray1_StepVisual_DirectionCountSelect

StepVisual_HArray1OfDraughtingCalloutElement: NCollection_HArray1_StepVisual_DraughtingCalloutElement

StepVisual_HArray1OfFillStyleSelect: NCollection_HArray1_StepVisual_FillStyleSelect

StepVisual_HArray1OfInvisibleItem: NCollection_HArray1_StepVisual_InvisibleItem

StepVisual_HArray1OfLayeredItem: NCollection_HArray1_StepVisual_LayeredItem

StepVisual_HArray1OfPresentationStyleAssignment: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment

StepVisual_HArray1OfPresentationStyleSelect: NCollection_HArray1_StepVisual_PresentationStyleSelect

StepVisual_HArray1OfRenderingPropertiesSelect: NCollection_HArray1_StepVisual_RenderingPropertiesSelect

StepVisual_HArray1OfStyleContextSelect: NCollection_HArray1_StepVisual_StyleContextSelect

StepVisual_HArray1OfSurfaceStyleElementSelect: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect

StepVisual_HArray1OfTessellatedEdgeOrVertex: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex

StepVisual_HArray1OfTessellatedStructuredItem: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem

StepVisual_HArray1OfTextOrCharacter: NCollection_HArray1_StepVisual_TextOrCharacter
