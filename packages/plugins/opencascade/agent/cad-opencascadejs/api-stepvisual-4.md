# libcascade — StepVisual (4)

26 top-level symbols. Signatures are verbatim typescript.

StepVisual_SurfaceStyleElementSelect: declare class StepVisual_SurfaceStyleElementSelect extends StepData_SelectType

constructor

// Recognizes a SurfaceStyleElementSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a SurfaceStyleFillArea (Null if another type)
SurfaceStyleFillArea(): StepVisual_SurfaceStyleFillArea;

// returns Value as a SurfaceStyleBoundary (Null if another type)
SurfaceStyleBoundary(): StepVisual_SurfaceStyleBoundary;

// returns Value as a SurfaceStyleParameterLine (Null if another type)
SurfaceStyleParameterLine(): StepVisual_SurfaceStyleParameterLine;

// returns Value as a SurfaceStyleRendering (Null if another type)
SurfaceStyleRendering(): StepVisual_SurfaceStyleRendering;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceStyleFillArea: declare class StepVisual_SurfaceStyleFillArea extends Standard_Transient

constructor

Init(aFillArea: StepVisual_FillAreaStyle): void;

SetFillArea(aFillArea: StepVisual_FillAreaStyle): void;

FillArea(): StepVisual_FillAreaStyle;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceStyleParameterLine: declare class StepVisual_SurfaceStyleParameterLine extends Standard_Transient

constructor

Init(aStyleOfParameterLines: StepVisual_CurveStyle, aDirectionCounts: NCollection_HArray1_StepVisual_DirectionCountSelect): void;

SetStyleOfParameterLines(aStyleOfParameterLines: StepVisual_CurveStyle): void;

StyleOfParameterLines(): StepVisual_CurveStyle;

SetDirectionCounts(aDirectionCounts: NCollection_HArray1_StepVisual_DirectionCountSelect): void;

DirectionCounts(): NCollection_HArray1_StepVisual_DirectionCountSelect;

DirectionCountsValue(num: number): StepVisual_DirectionCountSelect;

NbDirectionCounts(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceStyleReflectanceAmbient
StepVisual_SurfaceStyleReflectanceAmbient: declare class StepVisual_SurfaceStyleReflectanceAmbient extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(theAmbientReflectance: number): void;

// Returns field AmbientReflectance
AmbientReflectance(): number;

// Sets field AmbientReflectance
SetAmbientReflectance(theAmbientReflectance: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceStyleReflectanceAmbientDiffuse
StepVisual_SurfaceStyleReflectanceAmbientDiffuse: declare class StepVisual_SurfaceStyleReflectanceAmbientDiffuse extends StepVisual_SurfaceStyleReflectanceAmbient

constructor

// Initialize all fields (own and inherited)
Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
Init(theAmbientReflectance: number): void;
Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
Init(theAmbientReflectance: number): void;

// Returns field DiffuseReflectance
DiffuseReflectance(): number;

// Sets field DiffuseReflectance
SetDiffuseReflectance(theDiffuseReflectance: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceStyleReflectanceAmbientDiffuseSpecular
StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular: declare class StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular extends StepVisual_SurfaceStyleReflectanceAmbientDiffuse

constructor

// Initialize all fields (own and inherited)
Init(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: StepVisual_Colour): void;
Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
Init(theAmbientReflectance: number): void;
Init(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: StepVisual_Colour): void;
Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
Init(theAmbientReflectance: number): void;
Init(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: StepVisual_Colour): void;
Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
Init(theAmbientReflectance: number): void;

// Returns field SpecularReflectance
SpecularReflectance(): number;

// Sets field SpecularReflectance
SetSpecularReflectance(theSpecularReflectance: number): void;

// Returns field SpecularExponent
SpecularExponent(): number;

// Sets field SpecularExponent
SetSpecularExponent(theSpecularExponent: number): void;

// Returns field SpecularColour
SpecularColour(): StepVisual_Colour;

// Sets field SpecularColour
SetSpecularColour(theSpecularColour: StepVisual_Colour): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceStyleRendering
StepVisual_SurfaceStyleRendering: declare class StepVisual_SurfaceStyleRendering extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;

// Returns field RenderingMethod
RenderingMethod(): StepVisual_ShadingSurfaceMethod;

// Sets field RenderingMethod
SetRenderingMethod(theRenderingMethod: StepVisual_ShadingSurfaceMethod): void;

// Returns field SurfaceColour
SurfaceColour(): StepVisual_Colour;

// Sets field SurfaceColour
SetSurfaceColour(theSurfaceColour: StepVisual_Colour): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceStyleRenderingWithProperties
StepVisual_SurfaceStyleRenderingWithProperties: declare class StepVisual_SurfaceStyleRenderingWithProperties extends StepVisual_SurfaceStyleRendering

constructor

// Initialize all fields (own and inherited)
Init(theSurfaceStyleRendering_RenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceStyleRendering_SurfaceColour: StepVisual_Colour, theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;
Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;
Init(theSurfaceStyleRendering_RenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceStyleRendering_SurfaceColour: StepVisual_Colour, theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;
Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;

// Returns field Properties
Properties(): NCollection_HArray1_StepVisual_RenderingPropertiesSelect;

// Sets field Properties
SetProperties(theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceStyleSegmentationCurve: declare class StepVisual_SurfaceStyleSegmentationCurve extends Standard_Transient

constructor

Init(aStyleOfSegmentationCurve: StepVisual_CurveStyle): void;

SetStyleOfSegmentationCurve(aStyleOfSegmentationCurve: StepVisual_CurveStyle): void;

StyleOfSegmentationCurve(): StepVisual_CurveStyle;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceStyleSilhouette: declare class StepVisual_SurfaceStyleSilhouette extends Standard_Transient

constructor

Init(aStyleOfSilhouette: StepVisual_CurveStyle): void;

SetStyleOfSilhouette(aStyleOfSilhouette: StepVisual_CurveStyle): void;

StyleOfSilhouette(): StepVisual_CurveStyle;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity SurfaceStyleTransparent
StepVisual_SurfaceStyleTransparent: declare class StepVisual_SurfaceStyleTransparent extends Standard_Transient

constructor

// Initialize all fields (own and inherited)
Init(theTransparency: number): void;

// Returns field Transparency
Transparency(): number;

// Sets field Transparency
SetTransparency(theTransparency: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceStyleUsage: declare class StepVisual_SurfaceStyleUsage extends Standard_Transient

constructor

Init(aSide: StepVisual_SurfaceSide, aStyle: StepVisual_SurfaceSideStyle): void;

SetSide(aSide: StepVisual_SurfaceSide): void;

Side(): StepVisual_SurfaceSide;

SetStyle(aStyle: StepVisual_SurfaceSideStyle): void;

Style(): StepVisual_SurfaceSideStyle;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_Template: declare class StepVisual_Template extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_TemplateInstance: declare class StepVisual_TemplateInstance extends StepRepr_MappedItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_TessellatedAnnotationOccurrence: declare class StepVisual_TessellatedAnnotationOccurrence extends StepVisual_StyledItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedConnectingEdge
StepVisual_TessellatedConnectingEdge: declare class StepVisual_TessellatedConnectingEdge extends StepVisual_TessellatedEdge

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedEdge_Coordinates: StepVisual_CoordinatesList, theHasTessellatedEdge_GeometricLink: boolean, theTessellatedEdge_GeometricLink: StepVisual_EdgeOrCurve, theTessellatedEdge_LineStrip: NCollection_HArray1_int, theSmooth: StepData_Logical, theFace1: StepVisual_TessellatedFace, theFace2: StepVisual_TessellatedFace, theLineStripFace1: NCollection_HArray1_int, theLineStripFace2: NCollection_HArray1_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedEdge_Coordinates: StepVisual_CoordinatesList, theHasTessellatedEdge_GeometricLink: boolean, theTessellatedEdge_GeometricLink: StepVisual_EdgeOrCurve, theTessellatedEdge_LineStrip: NCollection_HArray1_int, theSmooth: StepData_Logical, theFace1: StepVisual_TessellatedFace, theFace2: StepVisual_TessellatedFace, theLineStripFace1: NCollection_HArray1_int, theLineStripFace2: NCollection_HArray1_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedEdge_Coordinates: StepVisual_CoordinatesList, theHasTessellatedEdge_GeometricLink: boolean, theTessellatedEdge_GeometricLink: StepVisual_EdgeOrCurve, theTessellatedEdge_LineStrip: NCollection_HArray1_int, theSmooth: StepData_Logical, theFace1: StepVisual_TessellatedFace, theFace2: StepVisual_TessellatedFace, theLineStripFace1: NCollection_HArray1_int, theLineStripFace2: NCollection_HArray1_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Smooth
Smooth(): StepData_Logical;

// Sets field Smooth
SetSmooth(theSmooth: StepData_Logical): void;

// Returns field Face1
Face1(): StepVisual_TessellatedFace;

// Sets field Face1
SetFace1(theFace1: StepVisual_TessellatedFace): void;

// Returns field Face2
Face2(): StepVisual_TessellatedFace;

// Sets field Face2
SetFace2(theFace2: StepVisual_TessellatedFace): void;

// Returns field LineStripFace1
LineStripFace1(): NCollection_HArray1_int;

// Sets field LineStripFace1
SetLineStripFace1(theLineStripFace1: NCollection_HArray1_int): void;

// Returns number of LineStripFace1
NbLineStripFace1(): number;

// Returns value of LineStripFace1 by its num
LineStripFace1Value(theNum: number): number;

// Returns field LineStripFace2
LineStripFace2(): NCollection_HArray1_int;

// Sets field LineStripFace2
SetLineStripFace2(theLineStripFace2: NCollection_HArray1_int): void;

// Returns number of LineStripFace2
NbLineStripFace2(): number;

// Returns value of LineStripFace2 by its num
LineStripFace2Value(theNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedEdge
StepVisual_TessellatedEdge: declare class StepVisual_TessellatedEdge extends StepVisual_TessellatedStructuredItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Coordinates
Coordinates(): StepVisual_CoordinatesList;

// Sets field Coordinates
SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

// Returns field GeometricLink
GeometricLink(): StepVisual_EdgeOrCurve;

// Sets field GeometricLink
SetGeometricLink(theGeometricLink: StepVisual_EdgeOrCurve): void;

// Returns True if optional field GeometricLink is defined
HasGeometricLink(): boolean;

// Returns field LineStrip
LineStrip(): NCollection_HArray1_int;

// Sets field LineStrip
SetLineStrip(theLineStrip: NCollection_HArray1_int): void;

// Returns number of LineStrip
NbLineStrip(): number;

// Returns value of LineStrip by its num
LineStripValue(theNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type TessellatedEdgeOrVertex
StepVisual_TessellatedEdgeOrVertex: declare class StepVisual_TessellatedEdgeOrVertex extends StepData_SelectType

constructor

// Recognizes a kind of TessellatedEdgeOrVertex select type - 1 -> TessellatedEdge - 2 -> TessellatedVertex
CaseNum(ent: Standard_Transient): number;

// Returns Value as TessellatedEdge (or Null if another type)
TessellatedEdge(): StepVisual_TessellatedEdge;

// Returns Value as TessellatedVertex (or Null if another type)
TessellatedVertex(): StepVisual_TessellatedVertex;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedFace
StepVisual_TessellatedFace: declare class StepVisual_TessellatedFace extends StepVisual_TessellatedStructuredItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
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

// Returns field GeometricLink
GeometricLink(): StepVisual_FaceOrSurface;

// Sets field GeometricLink
SetGeometricLink(theGeometricLink: StepVisual_FaceOrSurface): void;

// Returns True if optional field GeometricLink is defined
HasGeometricLink(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
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

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_TessellatedItem: declare class StepVisual_TessellatedItem extends StepGeom_GeometricRepresentationItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedPointSet
StepVisual_TessellatedPointSet: declare class StepVisual_TessellatedPointSet extends StepVisual_TessellatedItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePointList: NCollection_HArray1_int): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePointList: NCollection_HArray1_int): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Coordinates
Coordinates(): StepVisual_CoordinatesList;

// Sets field Coordinates
SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

// Returns field PointList
PointList(): NCollection_HArray1_int;

// Sets field PointList
SetPointList(thePointList: NCollection_HArray1_int): void;

// Returns number of PointList
NbPointList(): number;

// Returns value of PointList by its num
PointListValue(theNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedShapeRepresentation
StepVisual_TessellatedShapeRepresentation: declare class StepVisual_TessellatedShapeRepresentation extends StepShape_ShapeRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedShapeRepresentationWithAccuracyParameters
StepVisual_TessellatedShapeRepresentationWithAccuracyParameters: declare class StepVisual_TessellatedShapeRepresentationWithAccuracyParameters extends StepVisual_TessellatedShapeRepresentation

constructor

// Initialize all fields (own and inherited)
Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theTessellationAccuracyParameters: NCollection_HArray1_double): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;
Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theTessellationAccuracyParameters: NCollection_HArray1_double): void;
Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

// Returns field TessellationAccuracyParameters
TessellationAccuracyParameters(): NCollection_HArray1_double;

// Sets field TessellationAccuracyParameters
SetTessellationAccuracyParameters(theTessellationAccuracyParameters: NCollection_HArray1_double): void;

// Returns number of TessellationAccuracyParameters
NbTessellationAccuracyParameters(): number;

// Returns value of TessellationAccuracyParameters by its num
TessellationAccuracyParametersValue(theNum: number): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity TessellatedShell
StepVisual_TessellatedShell: declare class StepVisual_TessellatedShell extends StepVisual_TessellatedItem

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_ConnectedFaceSet): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Items
Items(): NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem;

// Sets field Items
SetItems(theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem): void;

// Returns number of Items
NbItems(): number;

// Returns value of Items by its num
ItemsValue(theNum: number): StepVisual_TessellatedStructuredItem;

// Returns field TopologicalLink
TopologicalLink(): StepShape_ConnectedFaceSet;

// Sets field TopologicalLink
SetTopologicalLink(theTopologicalLink: StepShape_ConnectedFaceSet): void;

// Returns True if optional field TopologicalLink is defined
HasTopologicalLink(): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
