# libcascade — XCAFDoc

12 top-level symbols. Signatures are verbatim typescript.

// Definition of general structure of DECAF document and tools to work with it
XCAFDoc: declare class XCAFDoc

constructor

// class for containing GraphNodes
static AssemblyGUID(): Standard_GUID;

// Returns GUID for TreeNode representing assembly link
static ShapeRefGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of colors
static ColorRefGUID(type\_: XCAFDoc_ColorType): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of DGT
static DimTolRefGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of Dimension
static DimensionRefFirstGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of Dimension
static DimensionRefSecondGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of GeomTolerance
static GeomToleranceRefGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of datum
static DatumRefGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing connections Datum-Toler
static DatumTolRefGUID(): Standard_GUID;

static LayerRefGUID(): Standard_GUID;

static MaterialRefGUID(): Standard_GUID;

// Return GUID for TreeNode representing Visualization Material
static VisMaterialRefGUID(): Standard_GUID;

// Return GUIDs for representing notes
static NoteRefGUID(): Standard_GUID;

static InvisibleGUID(): Standard_GUID;

static ColorByLayerGUID(): Standard_GUID;

// Returns GUID for UAttribute identifying external reference on no-step file
static ExternRefGUID(): Standard_GUID;

// Returns GUID for UAttribute identifying specified higher usage occurrence
static SHUORefGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of View
static ViewRefGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of View
static ViewRefShapeGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of View
static ViewRefGDTGUID(): Standard_GUID;

// Return GUIDs for TreeNode representing specified types of View
static ViewRefPlaneGUID(): Standard_GUID;

// Return GUIDs for GraphNode representing specified types of View
static ViewRefNoteGUID(): Standard_GUID;

static ViewRefAnnotationGUID(): Standard_GUID;

// Returns GUID for UAttribute identifying lock flag
static LockGUID(): Standard_GUID;

// Prints attribute information into a string
static AttributeInfo(theAtt: TDF_Attribute): TCollection_AsciiString;
// theAtt: an XDE attribute

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// attribute to store area
XCAFDoc_Area: declare class XCAFDoc_Area extends TDataStd_Real

constructor

// **class methods**
static GetID(): Standard_GUID;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Sets a value of volume
Set(V: number): void;
static Set(label: TDF_Label, value: number): XCAFDoc_Area;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
static Set(label: TDF_Label, value: number): XCAFDoc_Area;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;

// Returns the real number value contained in the attribute
Get(): number;
static Get(label: TDF_Label, area?: number): { returnValue: boolean; area: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

XCAFDoc_AssemblyGraph: declare class XCAFDoc_AssemblyGraph extends Standard_Transient

constructor

GetShapeTool(): XCAFDoc_ShapeTool;

// Returns IDs of the root nodes
GetRoots(): TColStd_PackedMapOfInteger;

// Checks whether the assembly graph contains (n1, n2) directed link
IsDirectLink(theNode1: number, theNode2: number): boolean;
// theNode1: one-based ID of the first node
// theNode2: one-based ID of the second node

// Checks whether direct children exist for the given node
HasChildren(theNode: number): boolean;
// theNode: one-based node ID

// Returns IDs of child nodes for the given node
GetChildren(theNode: number): TColStd_PackedMapOfInteger;
// theNode: one-based node ID

// Returns the node type from `NodeType` enum
GetNodeType(theNode: number): XCAFDoc_AssemblyGraph_NodeType;
// theNode: one-based node ID

// returns object ID by node ID
GetNode(theNode: number): TDF_Label;
// theNode: one-based node ID

// Returns the unordered set of graph nodes
GetNodes(): NCollection_IndexedMap_TDF_Label;

// Returns the number of graph nodes
NbNodes(): number;

// Returns the collection of graph links in the form of adjacency matrix
GetLinks(): any;

// Returns the number of graph links
NbLinks(): number;

// Returns quantity of part usage occurrences
NbOccurrences(theNode: number): number;
// theNode: one-based part ID

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Type of the graph node
XCAFDoc_AssemblyGraph_NodeType: typeof XCAFDoc_AssemblyGraph_NodeType[keyof typeof XCAFDoc_AssemblyGraph_NodeType]

XCAFDoc_AssemblyGraph_Iterator: declare class XCAFDoc_AssemblyGraph_Iterator

constructor

More(): boolean;

Current(): number;

Next(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Unique item identifier in the hierarchical product structure
XCAFDoc_AssemblyItemId: declare class XCAFDoc_AssemblyItemId

constructor

// Initializes the item ID from a list of strings, where every string is a label entry
Init(thePath: NCollection_List_TCollection_AsciiString): void;
Init(theString: TCollection_AsciiString): void;
Init(thePath: NCollection_List_TCollection_AsciiString): void;
Init(theString: TCollection_AsciiString): void;
// thePath: list of label entries

// Returns true if the full path is empty, otherwise - false
IsNull(): boolean;

// Clears the full path
Nullify(): void;

// Checks if this item is a child of the given item
IsChild(theOther: XCAFDoc_AssemblyItemId): boolean;
// theOther: potentially ancestor item

// Checks if this item is a direct child of the given item
IsDirectChild(theOther: XCAFDoc_AssemblyItemId): boolean;
// theOther: potentially parent item

// Checks for item IDs equality
IsEqual(theOther: XCAFDoc_AssemblyItemId): boolean;
// theOther: the item ID to check equality with

// Returns the full path as a list of label entries
GetPath(): NCollection_List_TCollection_AsciiString;

// Returns the full pass as a formatted string
ToString(): TCollection_AsciiString;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// An attribute that describes a weak reference to an assembly item or to a subshape or to an assembly label attribute
XCAFDoc_AssemblyItemRef: declare class XCAFDoc_AssemblyItemRef extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

static GetID(): Standard_GUID;

// Finds a reference attribute on the given label and returns it, if it is found
static Get(theLabel: TDF_Label): XCAFDoc_AssemblyItemRef;

static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theShapeIndex: number): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theShapeIndex: number): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
static Set(theLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theShapeIndex: number): XCAFDoc_AssemblyItemRef;

// Checks if the reference points to a really existing item in XDE document
IsOrphan(): boolean;

HasExtraRef(): boolean;

IsGUID(): boolean;

IsSubshapeIndex(): boolean;

GetGUID(): Standard_GUID;

GetSubshapeIndex(): number;

// Returns the assembly item ID that the reference points to
GetItem(): XCAFDoc_AssemblyItemId;

SetItem(theItemId: XCAFDoc_AssemblyItemId): void;
SetItem(thePath: NCollection_List_TCollection_AsciiString): void;
SetItem(theString: TCollection_AsciiString): void;
SetItem(theItemId: XCAFDoc_AssemblyItemId): void;
SetItem(thePath: NCollection_List_TCollection_AsciiString): void;
SetItem(theString: TCollection_AsciiString): void;
SetItem(theItemId: XCAFDoc_AssemblyItemId): void;
SetItem(thePath: NCollection_List_TCollection_AsciiString): void;
SetItem(theString: TCollection_AsciiString): void;

SetGUID(theAttrGUID: Standard_GUID): void;

SetSubshapeIndex(theShapeIndex: number): void;

// Reverts the reference to empty state
ClearExtraRef(): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Iterator in depth along the assembly tree
XCAFDoc_AssemblyIterator: declare class XCAFDoc_AssemblyIterator

constructor

More(): boolean;

// Moves depth-first iterator to the next position
Next(): void;

Current(): XCAFDoc_AssemblyItemId;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides generic methods for traversing assembly tree and graph
XCAFDoc_AssemblyTool: declare class XCAFDoc_AssemblyTool

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// attribute to store centroid
XCAFDoc_Centroid: declare class XCAFDoc_Centroid extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

// Find, or create, a Location attribute and set it's value the Location attribute is returned
static Set(label: TDF_Label, pnt: gp_Pnt): XCAFDoc_Centroid;
Set(pnt: gp_Pnt): void;

Get(): gp_Pnt;
static Get(label: TDF_Label, pnt: gp_Pnt): boolean;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provide tool for management of ClippingPlane section of document
XCAFDoc_ClippingPlaneTool: declare class XCAFDoc_ClippingPlaneTool extends TDataStd_GenericEmpty

constructor

// Creates (if not exist) ClippingPlaneTool
static Set(theLabel: TDF_Label): XCAFDoc_ClippingPlaneTool;

static GetID(): Standard_GUID;

// returns the label under which ClippingPlanes are stored
BaseLabel(): TDF_Label;

// Returns True if label belongs to a ClippingPlane table and is a ClippingPlane definition
IsClippingPlane(theLabel: TDF_Label): boolean;

// Returns ClippingPlane defined by label lab Returns False if the label is not in ClippingPlane table or does not define a ClippingPlane
GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };
GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping?: boolean): { returnValue: boolean; theName: TCollection_HAsciiString; theCapping: boolean; [Symbol.dispose](): void };
GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };
GetClippingPlane(theLabel: TDF_Label, thePlane: gp_Pln, theCapping?: boolean): { returnValue: boolean; theName: TCollection_HAsciiString; theCapping: boolean; [Symbol.dispose](): void };
// thePlane: Mutated in place
// theName: Mutated in place

// Adds a clipping plane definition to a ClippingPlane table and returns its label (returns existing label if the same clipping plane is already defined)
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_ExtendedString, theCapping: boolean): TDF_Label;
AddClippingPlane(thePlane: gp_Pln, theName: TCollection_HAsciiString, theCapping: boolean): TDF_Label;

// Removes clipping plane from the ClippingPlane table Return false and do nothing if clipping plane is referenced in at least one View
RemoveClippingPlane(theLabel: TDF_Label): boolean;

// Returns a sequence of clipping planes currently stored in the ClippingPlane table
GetClippingPlanes(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Sets new value of plane and name to the given clipping plane label or do nothing, if the given label is not a clipping plane label
UpdateClippingPlane(theLabelL: TDF_Label, thePlane: gp_Pln, theName: TCollection_ExtendedString): void;

// Set new value of capping for given clipping plane label
SetCapping(theClippingPlaneL: TDF_Label, theCapping: boolean): void;

// Get capping value for given clipping plane label Return capping value
GetCapping(theClippingPlaneL: TDF_Label): boolean;
GetCapping(theClippingPlaneL: TDF_Label, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };
GetCapping(theClippingPlaneL: TDF_Label): boolean;
GetCapping(theClippingPlaneL: TDF_Label, theCapping?: boolean): { returnValue: boolean; theCapping: boolean };

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

// attribute to store color
XCAFDoc_Color: declare class XCAFDoc_Color extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

Set(C: Quantity_Color): void;
Set(C: Quantity_ColorRGBA): void;
Set(C: Quantity_NameOfColor): void;
Set(R: number, G: number, B: number, alpha: number): void;
Set(C: Quantity_Color): void;
Set(C: Quantity_ColorRGBA): void;
Set(C: Quantity_NameOfColor): void;
Set(R: number, G: number, B: number, alpha: number): void;
Set(C: Quantity_Color): void;
Set(C: Quantity_ColorRGBA): void;
Set(C: Quantity_NameOfColor): void;
Set(R: number, G: number, B: number, alpha: number): void;
static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;
Set(C: Quantity_Color): void;
Set(C: Quantity_ColorRGBA): void;
Set(C: Quantity_NameOfColor): void;
Set(R: number, G: number, B: number, alpha: number): void;
static Set(label: TDF_Label, C: Quantity_Color): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_ColorRGBA): XCAFDoc_Color;
static Set(label: TDF_Label, C: Quantity_NameOfColor): XCAFDoc_Color;
static Set(label: TDF_Label, R: number, G: number, B: number, alpha: number): XCAFDoc_Color;

GetColor(): Quantity_Color;

GetColorRGBA(): Quantity_ColorRGBA;

GetNOC(): Quantity_NameOfColor;

GetRGB(R?: number, G?: number, B?: number): { R: number; G: number; B: number };

GetAlpha(): number;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
