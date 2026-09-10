# libcascade — XCAFDoc (5)

6 top-level symbols. Signatures are verbatim typescript.

// A tool to store shapes in an XDE document in the form of assembly structure, and to maintain this structure
XCAFDoc_ShapeTool: declare class XCAFDoc_ShapeTool extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

// Create (if not exist) ShapeTool from {@link XCAFDoc`XCAFDoc`} on <L>
static Set(L: TDF_Label): XCAFDoc_ShapeTool;

// Returns True if the label is a label of top-level shape, as opposed to component of assembly or subshape
IsTopLevel(L: TDF_Label): boolean;

// Returns True if the label is not used by any assembly, i.e
static IsFree(L: TDF_Label): boolean;

// Returns True if the label represents a shape (simple shape, assembly or reference)
static IsShape(L: TDF_Label): boolean;

// Returns True if the label is a label of simple shape
static IsSimpleShape(L: TDF_Label): boolean;

// Return true if <L> is a located instance of other shape i.e
static IsReference(L: TDF_Label): boolean;

// Returns True if the label is a label of assembly, i.e
static IsAssembly(L: TDF_Label): boolean;

// Return true if <L> is reference serving as component of assembly
static IsComponent(L: TDF_Label): boolean;

// Returns True if the label is a label of compound, i.e
static IsCompound(L: TDF_Label): boolean;

// Return true if <L> is subshape of the top-level shape
static IsSubShape(L: TDF_Label): boolean;
IsSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): boolean;

SearchUsingMap(S: TopoDS_Shape, L: TDF_Label, findWithoutLoc: boolean, findSubshape: boolean): boolean;

// General tool to find a (sub) shape in the document
Search(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean, findComponent: boolean, findSubshape: boolean): boolean;
// L: Mutated in place

// Returns the label corresponding to shape S (searches among top-level shapes, not including subcomponents of assemblies and subshapes) If findInstance is False (default), search for the input shape without location If findInstance is True, searches for the input shape as is
FindShape(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean): boolean;
FindShape(S: TopoDS_Shape, findInstance: boolean): TDF_Label;
FindShape(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean): boolean;
FindShape(S: TopoDS_Shape, findInstance: boolean): TDF_Label;
// L: Mutated in place

// To get {@link TopoDS_Shape`TopoDS_Shape`} from shape's label For component, returns new shape with correct location Returns False if label does not contain shape
static GetShape(L: TDF_Label, S: TopoDS_Shape): boolean;
static GetShape(L: TDF_Label): TopoDS_Shape;
static GetShape(L: TDF_Label, S: TopoDS_Shape): boolean;
static GetShape(L: TDF_Label): TopoDS_Shape;
// S: Mutated in place

// Gets shape from a sequence of shape's labels
static GetOneShape(theLabels: NCollection_Sequence_TDF_Label): TopoDS_Shape;
GetOneShape(): TopoDS_Shape;
// theLabels: a sequence of labels to get shapes from

// Creates new (empty) top-level shape
NewShape(): TDF_Label;

// Sets representation ({@link TopoDS_Shape`TopoDS_Shape`}) for top-level shape
SetShape(L: TDF_Label, S: TopoDS_Shape): void;

// Adds a new top-level (creates and returns a new label) If makeAssembly is True, treats TopAbs_COMPOUND shapes as assemblies (creates assembly structure)
AddShape(S: TopoDS_Shape, makeAssembly?: boolean, makePrepare?: boolean): TDF_Label;

// Removes shape (whole label and all its sublabels) If removeCompletely is true, removes complete shape If removeCompletely is false, removes instance(location) only Returns False (and does nothing) if shape is not free or is not top-level shape
RemoveShape(L: TDF_Label, removeCompletely?: boolean): boolean;

// set hasComponents into false
Init(): void;

// Sets auto-naming mode to <V>
static SetAutoNaming(V: boolean): void;

// Returns current auto-naming mode
static AutoNaming(): boolean;

// recursive
ComputeShapes(L: TDF_Label): void;

// Compute a sequence of simple shapes
ComputeSimpleShapes(): void;

// Returns a sequence of all top-level shapes
GetShapes(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Returns a sequence of all top-level shapes which are free (i.e
GetFreeShapes(FreeLabels: NCollection_Sequence_TDF_Label): void;
// FreeLabels: Mutated in place

// Returns list of labels which refer shape L as component Returns number of users (0 if shape is free)
static GetUsers(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): number;
// Labels: Mutated in place

// Returns location of instance
static GetLocation(L: TDF_Label): TopLoc_Location;

// Returns label which corresponds to a shape referred by L Returns False if label is not reference
static GetReferredShape(L: TDF_Label, Label: TDF_Label): boolean;
// Label: Mutated in place

// Returns number of Assembles components
static NbComponents(L: TDF_Label, getsubchilds?: boolean): number;

// Returns list of components of assembly Returns False if label is not assembly
static GetComponents(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): boolean;
// Labels: Mutated in place

// Adds a component given by its label and location to the assembly Note
AddComponent(assembly: TDF_Label, comp: TDF_Label, Loc: TopLoc_Location): TDF_Label;
AddComponent(assembly: TDF_Label, comp: TopoDS_Shape, expand: boolean): TDF_Label;
AddComponent(assembly: TDF_Label, comp: TDF_Label, Loc: TopLoc_Location): TDF_Label;
AddComponent(assembly: TDF_Label, comp: TopoDS_Shape, expand: boolean): TDF_Label;

// Removes a component from its assembly
RemoveComponent(comp: TDF_Label): void;

// Top-down update for all assembly compounds stored in the document
UpdateAssemblies(): void;

// Finds a label for subshape of shape stored on label shapeL Returns Null label if it is not found
FindSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, L: TDF_Label): boolean;
// L: Mutated in place

// Adds a label for subshape of shape stored on label shapeL Returns Null label if it is not subshape
AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): TDF_Label;
AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, addedSubShapeL: TDF_Label): boolean;
AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): TDF_Label;
AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, addedSubShapeL: TDF_Label): boolean;

FindMainShapeUsingMap(sub: TopoDS_Shape): TDF_Label;

// Performs a search among top-level shapes to find the shape containing as subshape Checks only simple shapes, and returns the first found label (which should be the only one for valid model)
FindMainShape(sub: TopoDS_Shape): TDF_Label;

// Returns list of labels identifying subshapes of the given shape Returns False if no subshapes are placed on that label
static GetSubShapes(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;
// Labels: Mutated in place

// returns the label under which shapes are stored
BaseLabel(): TDF_Label;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Returns True if the label is a label of external references, i.e
static IsExternRef(L: TDF_Label): boolean;

// Sets the names of references on the no-step files
SetExternRefs(SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): TDF_Label;
SetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;
SetExternRefs(SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): TDF_Label;
SetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;

// Gets the names of references on the no-step files
static GetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;
// SHAS: Mutated in place

// Sets the SHUO structure between upper_usage and next_usage create multy-level (if number of labels > 2) SHUO from first to last Initialise out <MainSHUOAttr> by main upper_usage SHUO attribute
SetSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; MainSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

// Returns founded SHUO GraphNode attribute <aSHUOAttr> Returns false in other case
static GetSHUO(SHUOLabel: TDF_Label): { returnValue: boolean; aSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

// Returns founded SHUO GraphNodes of indicated component Returns false in other case
static GetAllComponentSHUO(CompLabel: TDF_Label, SHUOAttrs: NCollection_Sequence_handle_TDF_Attribute): boolean;
// SHUOAttrs: Mutated in place

// Returns the sequence of labels of SHUO attributes, which is upper_usage for this next_usage SHUO attribute (that indicated by label) NOTE
static GetSHUOUpperUsage(NextUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;
// Labels: Mutated in place

// Returns the sequence of labels of SHUO attributes, which is next_usage for this upper_usage SHUO attribute (that indicated by label) NOTE
static GetSHUONextUsage(UpperUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;
// Labels: Mutated in place

// Remove SHUO from component sublabel, remove all dependencies on other SHUO
RemoveSHUO(SHUOLabel: TDF_Label): boolean;

// Search the path of labels in the document, that corresponds the component from any assembly Try to search the sequence of labels with location that produce this shape as component of any assembly NOTE
FindComponent(theShape: TopoDS_Shape, Labels: NCollection_Sequence_TDF_Label): boolean;
// Labels: Mutated in place

// Search for the component shape that styled by shuo Returns null shape if no any shape is found
GetSHUOInstance(theSHUO: XCAFDoc_GraphNode): TopoDS_Shape;

// Search for the component shape by labelks path and set SHUO structure for founded label structure Returns null attribute if no component in any assembly found
SetInstanceSHUO(theShape: TopoDS_Shape): XCAFDoc_GraphNode;

// Searching for component shapes that styled by shuo Returns empty sequence of shape if no any shape is found
GetAllSHUOInstances(theSHUO: XCAFDoc_GraphNode, theSHUOShapeSeq: NCollection_Sequence_TopoDS_Shape): boolean;
// theSHUOShapeSeq: Mutated in place

// Searches the SHUO by labels of components from upper_usage component to next_usage Returns null attribute if no SHUO found
static FindSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; theSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

// Sets location to the shape label If label is reference -> changes location attribute If label is free shape -> creates reference with location to it
SetLocation(theShapeLabel: TDF_Label, theLoc: TopLoc_Location, theRefLabel: TDF_Label): boolean;
// theShapeLabel: the shape label to change location
// theLoc: location to set
// theRefLabel: the reference label with new location Mutated in place

// Convert Shape (compound/compsolid/shell/wire) to assembly
Expand(Shape: TDF_Label): boolean;

// Method to get NamedData attribute assigned to the given shape label
GetNamedProperties(theLabel: TDF_Label, theToCreate: boolean): TDataStd_NamedData;
GetNamedProperties(theShape: TopoDS_Shape, theToCreate: boolean): TDataStd_NamedData;
GetNamedProperties(theLabel: TDF_Label, theToCreate: boolean): TDataStd_NamedData;
GetNamedProperties(theShape: TopoDS_Shape, theToCreate: boolean): TDataStd_NamedData;
// theLabel: the shape Label
// theToCreate: create and assign attribute if it doesn't exist

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Attribute to store view
XCAFDoc_View: declare class XCAFDoc_View extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

static Set(theLabel: TDF_Label): XCAFDoc_View;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Updates parent's label and its sub-labels with data taken from theViewObject
SetObject(theViewObject: XCAFView_Object): void;

// Returns view object data taken from the paren's label and its sub-labels
GetObject(): XCAFView_Object;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides tools to store and retrieve Views in and from {@link TDocStd_Document`TDocStd_Document`} Each View contains parts {@link XCAFDoc_View`XCAFDoc_View`} attribute with all information about camera and view window
XCAFDoc_ViewTool: declare class XCAFDoc_ViewTool extends TDataStd_GenericEmpty

constructor

// Creates (if not exist) ViewTool
static Set(L: TDF_Label): XCAFDoc_ViewTool;

static GetID(): Standard_GUID;

// Returns the label under which Views are stored
BaseLabel(): TDF_Label;

// Returns True if label belongs to a View table and is a View definition
IsView(theLabel: TDF_Label): boolean;

// Returns a sequence of View labels currently stored in the View table
GetViewLabels(theLabels: NCollection_Sequence_TDF_Label): void;
// theLabels: Mutated in place

// Sets a link with GUID
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theNotes: NCollection_Sequence_TDF_Label, theAnnotations: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theNotes: NCollection_Sequence_TDF_Label, theAnnotations: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theNotes: NCollection_Sequence_TDF_Label, theAnnotations: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;

// Set Clipping planes to given View
SetClippingPlanes(theClippingPlaneLabels: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;

// Remove View
RemoveView(theViewL: TDF_Label): void;

// Returns all View labels defined for label ShapeL
GetViewLabelsForShape(theShapeL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;
// theViews: Mutated in place

// Returns all View labels defined for label GDTL
GetViewLabelsForGDT(theGDTL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;
// theViews: Mutated in place

// Returns all View labels defined for label ClippingPlaneL
GetViewLabelsForClippingPlane(theClippingPlaneL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;
// theViews: Mutated in place

// Returns all View labels defined for label NoteL
GetViewLabelsForNote(theNoteL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;
// theViews: Mutated in place

// Returns all View labels defined for label AnnotationL
GetViewLabelsForAnnotation(theAnnotationL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;
// theViews: Mutated in place

// Adds a view definition to a View table and returns its label
AddView(): TDF_Label;

// Returns shape labels defined for label theViewL Returns False if the theViewL is not in View table
GetRefShapeLabel(theViewL: TDF_Label, theShapeLabels: NCollection_Sequence_TDF_Label): boolean;
// theShapeLabels: Mutated in place

// Returns GDT labels defined for label theViewL Returns False if the theViewL is not in View table
GetRefGDTLabel(theViewL: TDF_Label, theGDTLabels: NCollection_Sequence_TDF_Label): boolean;
// theGDTLabels: Mutated in place

// Returns ClippingPlane labels defined for label theViewL Returns False if the theViewL is not in View table
GetRefClippingPlaneLabel(theViewL: TDF_Label, theClippingPlaneLabels: NCollection_Sequence_TDF_Label): boolean;
// theClippingPlaneLabels: Mutated in place

// Returns Notes labels defined for label theViewL Returns False if the theViewL is not in View table
GetRefNoteLabel(theViewL: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): boolean;
// theNoteLabels: Mutated in place

// Returns Annotation labels defined for label theViewL Returns False if the theViewL is not in View table
GetRefAnnotationLabel(theViewL: TDF_Label, theAnnotationLabels: NCollection_Sequence_TDF_Label): boolean;
// theAnnotationLabels: Mutated in place

// Returns true if the given View is marked as locked
IsLocked(theViewL: TDF_Label): boolean;

// Mark the given View as locked
Lock(theViewL: TDF_Label): void;

// Unlock the given View
Unlock(theViewL: TDF_Label): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Attribute storing Material definition for visualization purposes
XCAFDoc_VisMaterial: declare class XCAFDoc_VisMaterial extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Return attribute GUID
static GetID(): Standard_GUID;

// Return TRUE if material definition is empty
IsEmpty(): boolean;

// Fill in graphic aspects
FillAspect(theAspect: unknown): void;

// Return TRUE if metal-roughness PBR material is defined
HasPbrMaterial(): boolean;

// Return metal-roughness PBR material
PbrMaterial(): XCAFDoc_VisMaterialPBR;

// Setup metal-roughness PBR material
SetPbrMaterial(theMaterial: XCAFDoc_VisMaterialPBR): void;

// Setup undefined metal-roughness PBR material
UnsetPbrMaterial(): void;

// Return TRUE if common material is defined
HasCommonMaterial(): boolean;

// Return common material
CommonMaterial(): XCAFDoc_VisMaterialCommon;

// Setup common material
SetCommonMaterial(theMaterial: XCAFDoc_VisMaterialCommon): void;

// Setup undefined common material
UnsetCommonMaterial(): void;

// Return base color
BaseColor(): Quantity_ColorRGBA;

// Return alpha mode
AlphaMode(): unknown;

// Return alpha cutoff value
AlphaCutOff(): number;

// Set alpha mode
SetAlphaMode(theMode: unknown, theCutOff?: number): void;

// Returns if the material is double or single sided
FaceCulling(): unknown;

// Specifies whether the material is double or single sided
SetFaceCulling(theFaceCulling: unknown): void;

// DEPRECATED
IsDoubleSided(): boolean;

// DEPRECATED
SetDoubleSided(theIsDoubleSided: boolean): void;

// Return material name / tag (transient data, not stored in the document)
RawName(): TCollection_HAsciiString;

// Set material name / tag (transient data, not stored in the document)
SetRawName(theName: TCollection_HAsciiString): void;

// Compare two materials
IsEqual(theOther: XCAFDoc_VisMaterial): boolean;

// Return Common material or convert PBR into Common material
ConvertToCommonMaterial(): XCAFDoc_VisMaterialCommon;

// Return PBR material or convert Common into PBR material
ConvertToPbrMaterial(): XCAFDoc_VisMaterialPBR;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Common (obsolete) material definition
XCAFDoc_VisMaterialCommon: declare class XCAFDoc_VisMaterialCommon

constructor

DiffuseTexture: unknown

AmbientColor: Quantity_Color

DiffuseColor: Quantity_Color

SpecularColor: Quantity_Color

EmissiveColor: Quantity_Color

Shininess: number

Transparency: number

IsDefined: boolean

// Compare two materials
IsEqual(theOther: XCAFDoc_VisMaterialCommon): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Metallic-roughness PBR material definition
XCAFDoc_VisMaterialPBR: declare class XCAFDoc_VisMaterialPBR

constructor

BaseColorTexture: unknown

MetallicRoughnessTexture: unknown

EmissiveTexture: unknown

OcclusionTexture: unknown

NormalTexture: unknown

BaseColor: Quantity_ColorRGBA

EmissiveFactor: [number, number, number]

Metallic: number

Roughness: number

RefractionIndex: number

IsDefined: boolean

// Compare two materials
IsEqual(theOther: XCAFDoc_VisMaterialPBR): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
