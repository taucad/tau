# libcascade — StepVisual (5)

50 top-level symbols. Signatures are verbatim typescript.

// Representation of STEP entity TessellatedSolid
StepVisual_TessellatedSolid: declare class StepVisual_TessellatedSolid extends StepVisual_TessellatedItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasGeometricLink: boolean, theGeometricLink: StepShape_ManifoldSolidBrep): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasGeometricLink: boolean, theGeometricLink: StepShape_ManifoldSolidBrep): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Items
Items(): NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem;

// Sets field Items
SetItems(theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem): void;

// Returns number of Items
NbItems(): number;

// Returns value of Items by its num
ItemsValue(theNum: number): StepVisual_TessellatedStructuredItem;

// Returns field GeometricLink
GeometricLink(): StepShape_ManifoldSolidBrep;

// Sets field GeometricLink
SetGeometricLink(theGeometricLink: StepShape_ManifoldSolidBrep): void;

// Returns True if optional field GeometricLink is defined
HasGeometricLink(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedStructuredItem
StepVisual_TessellatedStructuredItem: declare class StepVisual_TessellatedStructuredItem extends StepVisual_TessellatedItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedSurfaceSet
StepVisual_TessellatedSurfaceSet: declare class StepVisual_TessellatedSurfaceSet extends StepVisual_TessellatedItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Coordinates
Coordinates(): StepVisual_CoordinatesList;

// Sets field Coordinates
SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

// Returns field Pnmax
Pnmax(): number;

// Sets field Pnmax
SetPnmax(thePnmax: number): void;

// Returns field Normals
Normals(): NCollection_HArray2_double;

// Sets field Normals
SetNormals(theNormals: NCollection_HArray2_double): void;

// Returns number of Normals
NbNormals(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedVertex
StepVisual_TessellatedVertex: declare class StepVisual_TessellatedVertex extends StepVisual_TessellatedStructuredItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_VertexPoint, thePointIndex: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_VertexPoint, thePointIndex: number): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Coordinates
Coordinates(): StepVisual_CoordinatesList;

// Sets field Coordinates
SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

// Returns field TopologicalLink
TopologicalLink(): StepShape_VertexPoint;

// Sets field TopologicalLink
SetTopologicalLink(theTopologicalLink: StepShape_VertexPoint): void;

// Returns True if optional field TopologicalLink is defined
HasTopologicalLink(): boolean;

// Returns field PointIndex
PointIndex(): number;

// Sets field PointIndex
SetPointIndex(thePointIndex: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedWire
StepVisual_TessellatedWire: declare class StepVisual_TessellatedWire extends StepVisual_TessellatedItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex, theHasGeometricModelLink: boolean, theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex, theHasGeometricModelLink: boolean, theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Items
Items(): NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex;

// Sets field Items
SetItems(theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex): void;

// Returns number of Items
NbItems(): number;

// Returns value of Items by its num
ItemsValue(theNum: number): StepVisual_TessellatedEdgeOrVertex;

// Returns field GeometricModelLink
GeometricModelLink(): StepVisual_PathOrCompositeCurve;

// Sets field GeometricModelLink
SetGeometricModelLink(theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;

// Returns True if optional field GeometricModelLink is defined
HasGeometricModelLink(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_TextOrCharacter: declare class StepVisual_TextOrCharacter extends StepData_SelectType

constructor

// Recognizes a TextOrCharacter Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a AnnotationText (Null if another type)
AnnotationText(): StepVisual_AnnotationText;

// returns Value as a CompositeText (Null if another type)
CompositeText(): StepVisual_CompositeText;

// returns Value as a TextLiteral (Null if another type)
TextLiteral(): StepVisual_TextLiteral;

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TriangulatedFace
StepVisual_TriangulatedFace: declare class StepVisual_TriangulatedFace extends StepVisual_TessellatedFace

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Pnindex
Pnindex(): NCollection_HArray1_int;

// Sets field Pnindex
SetPnindex(thePnindex: NCollection_HArray1_int): void;

// Returns number of Pnindex
NbPnindex(): number;

// Returns value of Pnindex by its num
PnindexValue(theNum: number): number;

// Returns field Triangles
Triangles(): NCollection_HArray2_int;

// Sets field Triangles
SetTriangles(theTriangles: NCollection_HArray2_int): void;

// Returns number of Triangles
NbTriangles(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TriangulatedSurfaceSet
StepVisual_TriangulatedSurfaceSet: declare class StepVisual_TriangulatedSurfaceSet extends StepVisual_TessellatedSurfaceSet

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItemName: TCollection_HAsciiString, theTessellatedFaceCoordinates: StepVisual_CoordinatesList, theTessellatedFacePnmax: number, theTessellatedFaceNormals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItemName: TCollection_HAsciiString, theTessellatedFaceCoordinates: StepVisual_CoordinatesList, theTessellatedFacePnmax: number, theTessellatedFaceNormals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItemName: TCollection_HAsciiString, theTessellatedFaceCoordinates: StepVisual_CoordinatesList, theTessellatedFacePnmax: number, theTessellatedFaceNormals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Pnindex
Pnindex(): NCollection_HArray1_int;

// Sets field Pnindex
SetPnindex(thePnindex: NCollection_HArray1_int): void;

// Returns number of Pnindex
NbPnindex(): number;

// Returns value of Pnindex by its num
PnindexValue(theNum: number): number;

// Returns field Triangles
Triangles(): NCollection_HArray2_int;

// Sets field Triangles
SetTriangles(theTriangles: NCollection_HArray2_int): void;

// Returns number of Triangles
NbTriangles(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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

// Releases the C++ object
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
