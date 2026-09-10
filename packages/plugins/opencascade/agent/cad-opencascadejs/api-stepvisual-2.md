# libcascade — StepVisual (2)

33 top-level symbols. Signatures are verbatim typescript.

StepVisual_CompositeText: declare class StepVisual_CompositeText extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
Init(aName: TCollection_HAsciiString): void;

SetCollectedText(aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;

CollectedText(): NCollection_HArray1_StepVisual_TextOrCharacter;

CollectedTextValue(num: number): StepVisual_TextOrCharacter;

NbCollectedText(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_CompositeTextWithExtent: declare class StepVisual_CompositeTextWithExtent extends StepVisual_CompositeText

constructor

Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter, aExtent: StepVisual_PlanarExtent): void;
Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter, aExtent: StepVisual_PlanarExtent): void;
Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter, aExtent: StepVisual_PlanarExtent): void;
Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
Init(aName: TCollection_HAsciiString): void;

SetExtent(aExtent: StepVisual_PlanarExtent): void;

Extent(): StepVisual_PlanarExtent;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_ContextDependentInvisibility: declare class StepVisual_ContextDependentInvisibility extends StepVisual_Invisibility

constructor

Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem, aPresentationContext: StepVisual_InvisibilityContext): void;
Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;
Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem, aPresentationContext: StepVisual_InvisibilityContext): void;
Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

SetPresentationContext(aPresentationContext: StepVisual_InvisibilityContext): void;

PresentationContext(): StepVisual_InvisibilityContext;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_ContextDependentOverRidingStyledItem: declare class StepVisual_ContextDependentOverRidingStyledItem extends StepVisual_OverRidingStyledItem

constructor

Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;

SetStyleContext(aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;

StyleContext(): NCollection_HArray1_StepVisual_StyleContextSelect;

StyleContextValue(num: number): StepVisual_StyleContextSelect;

NbStyleContext(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_CoordinatesList: declare class StepVisual_CoordinatesList extends StepVisual_TessellatedItem

constructor

Init(theName: TCollection_HAsciiString, thePoints: NCollection_HArray1_gp_XYZ): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, thePoints: NCollection_HArray1_gp_XYZ): void;
Init(aName: TCollection_HAsciiString): void;

Points(): NCollection_HArray1_gp_XYZ;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CubicBezierTessellatedEdge
StepVisual_CubicBezierTessellatedEdge: declare class StepVisual_CubicBezierTessellatedEdge extends StepVisual_TessellatedEdge

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity CubicBezierTriangulatedFace
StepVisual_CubicBezierTriangulatedFace: declare class StepVisual_CubicBezierTriangulatedFace extends StepVisual_TessellatedFace

constructor

// Initialize all fields (own and inherited)
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, theCtriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, theCtriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
Init(aName: TCollection_HAsciiString): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, theCtriangles: NCollection_HArray2_int): void;
Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Ctriangles
Ctriangles(): NCollection_HArray2_int;

// Sets field Ctriangles
SetCtriangles(theCtriangles: NCollection_HArray2_int): void;

// Returns number of Ctriangles
NbCtriangles(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_CurveStyle: declare class StepVisual_CurveStyle extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aCurveFont: StepVisual_CurveStyleFontSelect, aCurveWidth: StepBasic_SizeSelect, aCurveColour: StepVisual_Colour): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetCurveFont(aCurveFont: StepVisual_CurveStyleFontSelect): void;

CurveFont(): StepVisual_CurveStyleFontSelect;

SetCurveWidth(aCurveWidth: StepBasic_SizeSelect): void;

CurveWidth(): StepBasic_SizeSelect;

SetCurveColour(aCurveColour: StepVisual_Colour): void;

CurveColour(): StepVisual_Colour;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_CurveStyleFont: declare class StepVisual_CurveStyleFont extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aPatternList: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetPatternList(aPatternList: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern): void;

PatternList(): NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern;

PatternListValue(num: number): StepVisual_CurveStyleFontPattern;

NbPatternList(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_CurveStyleFontPattern: declare class StepVisual_CurveStyleFontPattern extends Standard_Transient

constructor

Init(aVisibleSegmentLength: number, aInvisibleSegmentLength: number): void;

SetVisibleSegmentLength(aVisibleSegmentLength: number): void;

VisibleSegmentLength(): number;

SetInvisibleSegmentLength(aInvisibleSegmentLength: number): void;

InvisibleSegmentLength(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_CurveStyleFontSelect: declare class StepVisual_CurveStyleFontSelect extends StepData_SelectType

constructor

// Recognizes a CurveStyleFontSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a CurveStyleFont (Null if another type)
CurveStyleFont(): StepVisual_CurveStyleFont;

// returns Value as a PreDefinedCurveFont (Null if another type)
PreDefinedCurveFont(): StepVisual_PreDefinedCurveFont;

// returns Value as a ExternallyDefinedCurveFont (Null if another type)
ExternallyDefinedCurveFont(): StepVisual_ExternallyDefinedCurveFont;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_DirectionCountSelect: declare class StepVisual_DirectionCountSelect

constructor

SetTypeOfContent(aTypeOfContent: number): void;

TypeOfContent(): number;

UDirectionCount(): number;

SetUDirectionCount(aUDirectionCount: number): void;

VDirectionCount(): number;

SetVDirectionCount(aUDirectionCount: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_DraughtingAnnotationOccurrence: declare class StepVisual_DraughtingAnnotationOccurrence extends StepVisual_AnnotationOccurrence

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_DraughtingCallout: declare class StepVisual_DraughtingCallout extends StepGeom_GeometricRepresentationItem

constructor

// Init
Init(theName: TCollection_HAsciiString, theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;
Init(aName: TCollection_HAsciiString): void;

// Returns field Contents
Contents(): NCollection_HArray1_StepVisual_DraughtingCalloutElement;

// Set field Contents
SetContents(theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;

// Returns number of Contents
NbContents(): number;

// Returns Contents with the given number
ContentsValue(theNum: number): StepVisual_DraughtingCalloutElement;

// Sets Contents with given number
SetContentsValue(theNum: number, theItem: StepVisual_DraughtingCalloutElement): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_DraughtingCalloutElement: declare class StepVisual_DraughtingCalloutElement extends StepData_SelectType

constructor

// Recognizes a IdAttributeSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a AnnotationCurveOccurrence (Null if another type)
AnnotationCurveOccurrence(): StepVisual_AnnotationCurveOccurrence;

// returns Value as a AnnotationTextOccurrence
AnnotationTextOccurrence(): StepVisual_AnnotationTextOccurrence;

// returns Value as a TessellatedAnnotationOccurrence
TessellatedAnnotationOccurrence(): StepVisual_TessellatedAnnotationOccurrence;

// returns Value as a AnnotationFillAreaOccurrence
AnnotationFillAreaOccurrence(): StepVisual_AnnotationFillAreaOccurrence;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity DraughtingModel
StepVisual_DraughtingModel: declare class StepVisual_DraughtingModel extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_DraughtingPreDefinedColour: declare class StepVisual_DraughtingPreDefinedColour extends StepVisual_PreDefinedColour

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_DraughtingPreDefinedCurveFont: declare class StepVisual_DraughtingPreDefinedCurveFont extends StepVisual_PreDefinedCurveFont

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type EdgeOrCurve
StepVisual_EdgeOrCurve: declare class StepVisual_EdgeOrCurve extends StepData_SelectType

constructor

// Recognizes a kind of EdgeOrCurve select type - 1 -> Curve - 2 -> Edge
CaseNum(ent: Standard_Transient): number;

// Returns Value as Curve (or Null if another type)
Curve(): StepGeom_Curve;

// Returns Value as Edge (or Null if another type)
Edge(): StepShape_Edge;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ExternallyDefinedCurveFont
StepVisual_ExternallyDefinedCurveFont: declare class StepVisual_ExternallyDefinedCurveFont extends StepBasic_ExternallyDefinedItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity ExternallyDefinedTextFont
StepVisual_ExternallyDefinedTextFont: declare class StepVisual_ExternallyDefinedTextFont extends StepBasic_ExternallyDefinedItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type FaceOrSurface
StepVisual_FaceOrSurface: declare class StepVisual_FaceOrSurface extends StepData_SelectType

constructor

// Recognizes a kind of FaceOrSurface select type - 1 -> Face - 2 -> Surface
CaseNum(ent: Standard_Transient): number;

// Returns Value as Face (or Null if another type)
Face(): StepShape_Face;

// Returns Value as Surface (or Null if another type)
Surface(): StepGeom_Surface;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_FillAreaStyle: declare class StepVisual_FillAreaStyle extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aFillStyles: NCollection_HArray1_StepVisual_FillStyleSelect): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetFillStyles(aFillStyles: NCollection_HArray1_StepVisual_FillStyleSelect): void;

FillStyles(): NCollection_HArray1_StepVisual_FillStyleSelect;

FillStylesValue(num: number): StepVisual_FillStyleSelect;

NbFillStyles(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_FillAreaStyleColour: declare class StepVisual_FillAreaStyleColour extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aFillColour: StepVisual_Colour): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetFillColour(aFillColour: StepVisual_Colour): void;

FillColour(): StepVisual_Colour;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_FillStyleSelect: declare class StepVisual_FillStyleSelect extends StepData_SelectType

constructor

// Recognizes a FillStyleSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a FillAreaStyleColour (Null if another type)
FillAreaStyleColour(): StepVisual_FillAreaStyleColour;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_FontSelect: declare class StepVisual_FontSelect extends StepData_SelectType

constructor

// Recognizes a FontSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a PreDefinedTextFont (Null if another type)
PreDefinedTextFont(): StepVisual_PreDefinedTextFont;

// returns Value as a ExternallyDefinedTextFont (Null if another type)
ExternallyDefinedTextFont(): StepVisual_ExternallyDefinedTextFont;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_Invisibility: declare class StepVisual_Invisibility extends Standard_Transient

constructor

Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

SetInvisibleItems(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

InvisibleItems(): NCollection_HArray1_StepVisual_InvisibleItem;

InvisibleItemsValue(num: number): StepVisual_InvisibleItem;

NbInvisibleItems(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_InvisibilityContext: declare class StepVisual_InvisibilityContext extends StepData_SelectType

constructor

// Recognizes a InvisibilityContext Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a PresentationRepresentation (Null if another type)
PresentationRepresentation(): StepVisual_PresentationRepresentation;

// returns Value as a PresentationSet (Null if another type)
PresentationSet(): StepVisual_PresentationSet;

// returns Value as a PresentationSet (Null if another type)
DraughtingModel(): StepVisual_DraughtingModel;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_InvisibleItem: declare class StepVisual_InvisibleItem extends StepData_SelectType

constructor

// Recognizes a InvisibleItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a StyledItem (Null if another type)
StyledItem(): StepVisual_StyledItem;

// returns Value as a PresentationLayerAssignment (Null if another type)
PresentationLayerAssignment(): StepVisual_PresentationLayerAssignment;

// returns Value as a PresentationRepresentation (Null if another type)
PresentationRepresentation(): StepVisual_PresentationRepresentation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_LayeredItem: declare class StepVisual_LayeredItem extends StepData_SelectType

constructor

// Recognizes a LayeredItem Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a PresentationRepresentation (Null if another type)
PresentationRepresentation(): StepVisual_PresentationRepresentation;

// returns Value as a RepresentationItem (Null if another type)
RepresentationItem(): StepRepr_RepresentationItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines MarkerType as unique member of MarkerSelect Works with an EnumTool
StepVisual_MarkerMember: declare class StepVisual_MarkerMember extends StepData_SelectInt

constructor

// Tells if a SelectMember has a name
HasName(): boolean;

// Returns the name of a SelectMember
Name(): string;

// Sets the name of a SelectMember, returns True if done, False if no name is allowed Default does nothing and returns False
SetName(name: string): boolean;

EnumText(): string;

SetEnumText(val: number, text: string): void;

SetValue(val: StepVisual_MarkerType): void;

Value(): StepVisual_MarkerType;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_MarkerSelect: declare class StepVisual_MarkerSelect extends StepData_SelectType

constructor

// Recognizes a MarkerSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// Returns a new MarkerMember
NewMember(): StepData_SelectMember;

// Returns 1 for a SelectMember enum, named MARKER_TYPE
CaseMem(ent: StepData_SelectMember): number;

// Gives access to the MarkerMember in order to get/set its value
MarkerMember(): StepVisual_MarkerMember;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_MarkerType: typeof StepVisual_MarkerType[keyof typeof StepVisual_MarkerType]
