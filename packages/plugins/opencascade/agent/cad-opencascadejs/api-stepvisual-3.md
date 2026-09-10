# libcascade — StepVisual (3)

38 top-level symbols. Signatures are verbatim typescript.

StepVisual_MechanicalDesignGeometricPresentationArea: declare class StepVisual_MechanicalDesignGeometricPresentationArea extends StepVisual_PresentationArea

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_MechanicalDesignGeometricPresentationRepresentation: declare class StepVisual_MechanicalDesignGeometricPresentationRepresentation extends StepVisual_PresentationRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_NullStyle: typeof StepVisual_NullStyle[keyof typeof StepVisual_NullStyle]

// Defines NullStyle as unique member of PresentationStyleSelect Works with an EnumTool
StepVisual_NullStyleMember: declare class StepVisual_NullStyleMember extends StepData_SelectInt

constructor

// Tells if a SelectMember has a name
HasName(): boolean;

// Returns the name of a SelectMember
Name(): string;

// Sets the name of a SelectMember, returns True if done, False if no name is allowed Default does nothing and returns False
SetName(name: string): boolean;

Kind(): number;

EnumText(): string;

SetEnumText(val: number, text: string): void;

SetValue(theValue: StepVisual_NullStyle): void;

Value(): StepVisual_NullStyle;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_OverRidingStyledItem: declare class StepVisual_OverRidingStyledItem extends StepVisual_StyledItem

constructor

Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;

SetOverRiddenStyle(aOverRiddenStyle: StepVisual_StyledItem): void;

OverRiddenStyle(): StepVisual_StyledItem;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type PathOrCompositeCurve
StepVisual_PathOrCompositeCurve: declare class StepVisual_PathOrCompositeCurve extends StepData_SelectType

constructor

// Recognizes a kind of PathOrCompositeCurve select type - 1 -> CompositeCurve - 2 -> Path
CaseNum(ent: Standard_Transient): number;

// Returns Value as CompositeCurve (or Null if another type)
CompositeCurve(): StepGeom_CompositeCurve;

// Returns Value as Path (or Null if another type)
Path(): StepShape_Path;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PlanarBox: declare class StepVisual_PlanarBox extends StepVisual_PlanarExtent

constructor

Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number, aPlacement: StepGeom_Axis2Placement): void;
Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number, aPlacement: StepGeom_Axis2Placement): void;
Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number, aPlacement: StepGeom_Axis2Placement): void;
Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
Init(aName: TCollection_HAsciiString): void;

SetPlacement(aPlacement: StepGeom_Axis2Placement): void;

Placement(): StepGeom_Axis2Placement;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PlanarExtent: declare class StepVisual_PlanarExtent extends StepGeom_GeometricRepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
Init(aName: TCollection_HAsciiString): void;

SetSizeInX(aSizeInX: number): void;

SizeInX(): number;

SetSizeInY(aSizeInY: number): void;

SizeInY(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PointStyle: declare class StepVisual_PointStyle extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aMarker: StepVisual_MarkerSelect, aMarkerSize: StepBasic_SizeSelect, aMarkerColour: StepVisual_Colour): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetMarker(aMarker: StepVisual_MarkerSelect): void;

Marker(): StepVisual_MarkerSelect;

SetMarkerSize(aMarkerSize: StepBasic_SizeSelect): void;

MarkerSize(): StepBasic_SizeSelect;

SetMarkerColour(aMarkerColour: StepVisual_Colour): void;

MarkerColour(): StepVisual_Colour;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PreDefinedColour: declare class StepVisual_PreDefinedColour extends StepVisual_Colour

constructor

// set a pre_defined_item part
SetPreDefinedItem(item: StepVisual_PreDefinedItem): void;

// return a pre_defined_item part
GetPreDefinedItem(): StepVisual_PreDefinedItem;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PreDefinedCurveFont: declare class StepVisual_PreDefinedCurveFont extends StepVisual_PreDefinedItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PreDefinedItem: declare class StepVisual_PreDefinedItem extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PreDefinedTextFont: declare class StepVisual_PreDefinedTextFont extends StepVisual_PreDefinedItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationArea: declare class StepVisual_PresentationArea extends StepVisual_PresentationRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationLayerAssignment: declare class StepVisual_PresentationLayerAssignment extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aAssignedItems: NCollection_HArray1_StepVisual_LayeredItem): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetDescription(aDescription: TCollection_HAsciiString): void;

Description(): TCollection_HAsciiString;

SetAssignedItems(aAssignedItems: NCollection_HArray1_StepVisual_LayeredItem): void;

AssignedItems(): NCollection_HArray1_StepVisual_LayeredItem;

AssignedItemsValue(num: number): StepVisual_LayeredItem;

NbAssignedItems(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added from StepVisual Rev2 to Rev4
StepVisual_PresentationLayerUsage: declare class StepVisual_PresentationLayerUsage extends Standard_Transient

constructor

Init(aAssignment: StepVisual_PresentationLayerAssignment, aPresentation: StepVisual_PresentationRepresentation): void;

SetAssignment(aAssignment: StepVisual_PresentationLayerAssignment): void;

Assignment(): StepVisual_PresentationLayerAssignment;

SetPresentation(aPresentation: StepVisual_PresentationRepresentation): void;

Presentation(): StepVisual_PresentationRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationRepresentation: declare class StepVisual_PresentationRepresentation extends StepRepr_Representation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationRepresentationSelect: declare class StepVisual_PresentationRepresentationSelect extends StepData_SelectType

constructor

// Recognizes a PresentationRepresentationSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a PresentationRepresentation (Null if another type)
PresentationRepresentation(): StepVisual_PresentationRepresentation;

// returns Value as a PresentationSet (Null if another type)
PresentationSet(): StepVisual_PresentationSet;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationSet: declare class StepVisual_PresentationSet extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationSize: declare class StepVisual_PresentationSize extends Standard_Transient

constructor

Init(aUnit: StepVisual_PresentationSizeAssignmentSelect, aSize: StepVisual_PlanarBox): void;

SetUnit(aUnit: StepVisual_PresentationSizeAssignmentSelect): void;

Unit(): StepVisual_PresentationSizeAssignmentSelect;

SetSize(aSize: StepVisual_PlanarBox): void;

Size(): StepVisual_PlanarBox;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationSizeAssignmentSelect: declare class StepVisual_PresentationSizeAssignmentSelect extends StepData_SelectType

constructor

// Recognizes a PresentationSizeAssignmentSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a PresentationView (Null if another type)
PresentationView(): StepVisual_PresentationView;

// returns Value as a PresentationArea (Null if another type)
PresentationArea(): StepVisual_PresentationArea;

// returns Value as a AreaInSet (Null if another type)
AreaInSet(): StepVisual_AreaInSet;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationStyleAssignment: declare class StepVisual_PresentationStyleAssignment extends Standard_Transient

constructor

Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

SetStyles(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

Styles(): NCollection_HArray1_StepVisual_PresentationStyleSelect;

StylesValue(num: number): StepVisual_PresentationStyleSelect;

NbStyles(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationStyleByContext: declare class StepVisual_PresentationStyleByContext extends StepVisual_PresentationStyleAssignment

constructor

Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect, aStyleContext: StepVisual_StyleContextSelect): void;
Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;
Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect, aStyleContext: StepVisual_StyleContextSelect): void;
Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

SetStyleContext(aStyleContext: StepVisual_StyleContextSelect): void;

StyleContext(): StepVisual_StyleContextSelect;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationStyleSelect: declare class StepVisual_PresentationStyleSelect extends StepData_SelectType

constructor

// Recognizes a PresentationStyleSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a PointStyle (Null if another type)
PointStyle(): StepVisual_PointStyle;

// returns Value as a CurveStyle (Null if another type)
CurveStyle(): StepVisual_CurveStyle;

// returns Value as a NullStyleMember (Null if another type)
NullStyle(): StepVisual_NullStyleMember;

// returns Value as a SurfaceStyleUsage (Null if another type)
SurfaceStyleUsage(): StepVisual_SurfaceStyleUsage;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentationView: declare class StepVisual_PresentationView extends StepVisual_PresentationRepresentation

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_PresentedItem: declare class StepVisual_PresentedItem extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Added from StepVisual Rev2 to Rev4
StepVisual_PresentedItemRepresentation: declare class StepVisual_PresentedItemRepresentation extends Standard_Transient

constructor

Init(aPresentation: StepVisual_PresentationRepresentationSelect, aItem: StepVisual_PresentedItem): void;

SetPresentation(aPresentation: StepVisual_PresentationRepresentationSelect): void;

Presentation(): StepVisual_PresentationRepresentationSelect;

SetItem(aItem: StepVisual_PresentedItem): void;

Item(): StepVisual_PresentedItem;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP SELECT type RenderingPropertiesSelect
StepVisual_RenderingPropertiesSelect: declare class StepVisual_RenderingPropertiesSelect extends StepData_SelectType

constructor

// Recognizes a kind of RenderingPropertiesSelect select type - 1 -> SurfaceStyleReflectanceAmbient - 2 -> SurfaceStyleTransparent
CaseNum(ent: Standard_Transient): number;

// Returns Value as SurfaceStyleReflectanceAmbient (or Null if another type)
SurfaceStyleReflectanceAmbient(): StepVisual_SurfaceStyleReflectanceAmbient;

// Returns Value as SurfaceStyleTransparent (or Null if another type)
SurfaceStyleTransparent(): StepVisual_SurfaceStyleTransparent;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of complex STEP entity RepositionedTessellatedGeometricSet
StepVisual_RepositionedTessellatedGeometricSet: declare class StepVisual_RepositionedTessellatedGeometricSet extends StepVisual_TessellatedGeometricSet

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Initialize all fields (own and inherited)
Init(theName: TCollection_HAsciiString, theItems: any, theLocation: StepGeom_Axis2Placement3d): void;
Init(theName: TCollection_HAsciiString, theItems: any): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, theItems: any, theLocation: StepGeom_Axis2Placement3d): void;
Init(theName: TCollection_HAsciiString, theItems: any): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, theItems: any, theLocation: StepGeom_Axis2Placement3d): void;
Init(theName: TCollection_HAsciiString, theItems: any): void;
Init(aName: TCollection_HAsciiString): void;

// Returns location
Location(): StepGeom_Axis2Placement3d;

// Sets location
SetLocation(theLocation: StepGeom_Axis2Placement3d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of STEP entity RepositionedTessellatedItem
StepVisual_RepositionedTessellatedItem: declare class StepVisual_RepositionedTessellatedItem extends StepVisual_TessellatedItem

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Initialize all fields (own and inherited)
Init(theName: TCollection_HAsciiString, theLocation: StepGeom_Axis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;
Init(theName: TCollection_HAsciiString, theLocation: StepGeom_Axis2Placement3d): void;
Init(aName: TCollection_HAsciiString): void;

// Returns location
Location(): StepGeom_Axis2Placement3d;

// Sets location
SetLocation(theLocation: StepGeom_Axis2Placement3d): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_ShadingSurfaceMethod: typeof StepVisual_ShadingSurfaceMethod[keyof typeof StepVisual_ShadingSurfaceMethod]

StepVisual_StyleContextSelect: declare class StepVisual_StyleContextSelect extends StepData_SelectType

constructor

// Recognizes a StyleContextSelect Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a RepresentationItem (Null if another type)
RepresentationItem(): StepRepr_RepresentationItem;

// returns Value as a PresentationSet (Null if another type)
PresentationSet(): StepVisual_PresentationSet;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_StyledItem: declare class StepVisual_StyledItem extends StepRepr_RepresentationItem

constructor

Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;
Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
Init(aName: TCollection_HAsciiString): void;

SetStyles(aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment): void;

Styles(): NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment;

StylesValue(num: number): StepVisual_PresentationStyleAssignment;

NbStyles(): number;

SetItem(aItem: StepRepr_RepresentationItem): void;
SetItem(aItem: StepVisual_StyledItemTarget): void;
SetItem(aItem: StepRepr_RepresentationItem): void;
SetItem(aItem: StepVisual_StyledItemTarget): void;

Item(): StepRepr_RepresentationItem;

ItemAP242(): StepVisual_StyledItemTarget;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_StyledItemTarget: declare class StepVisual_StyledItemTarget extends StepData_SelectType

constructor

// Recognizes a StyledItemTarget Kind Entity that is
CaseNum(ent: Standard_Transient): number;

// returns Value as a GeometricRepresentationItem (Null if another type)
GeometricRepresentationItem(): StepGeom_GeometricRepresentationItem;

// returns Value as a MappedItem (Null if another type)
MappedItem(): StepRepr_MappedItem;

// returns Value as a Representation (Null if another type)
Representation(): StepRepr_Representation;

// returns Value as a TopologicalRepresentationItem (Null if another type)
TopologicalRepresentationItem(): StepShape_TopologicalRepresentationItem;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceSide: typeof StepVisual_SurfaceSide[keyof typeof StepVisual_SurfaceSide]

StepVisual_SurfaceSideStyle: declare class StepVisual_SurfaceSideStyle extends Standard_Transient

constructor

Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect): void;

SetName(aName: TCollection_HAsciiString): void;

Name(): TCollection_HAsciiString;

SetStyles(aStyles: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect): void;

Styles(): NCollection_HArray1_StepVisual_SurfaceStyleElementSelect;

StylesValue(num: number): StepVisual_SurfaceStyleElementSelect;

NbStyles(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceStyleBoundary: declare class StepVisual_SurfaceStyleBoundary extends Standard_Transient

constructor

Init(aStyleOfBoundary: StepVisual_CurveStyle): void;

SetStyleOfBoundary(aStyleOfBoundary: StepVisual_CurveStyle): void;

StyleOfBoundary(): StepVisual_CurveStyle;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

StepVisual_SurfaceStyleControlGrid: declare class StepVisual_SurfaceStyleControlGrid extends Standard_Transient

constructor

Init(aStyleOfControlGrid: StepVisual_CurveStyle): void;

SetStyleOfControlGrid(aStyleOfControlGrid: StepVisual_CurveStyle): void;

StyleOfControlGrid(): StepVisual_CurveStyle;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
