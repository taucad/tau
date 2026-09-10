# libcascade — XCAFDoc (6)

3 top-level symbols. Signatures are verbatim typescript.

// Provides tools to store and retrieve attributes (visualization materials) of {@link TopoDS_Shape`TopoDS_Shape`} in and from {@link TDocStd_Document`TDocStd_Document`}
XCAFDoc_VisMaterialTool: declare class XCAFDoc_VisMaterialTool extends TDF_Attribute

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Creates (if not exist) ColorTool
static Set(L: TDF_Label): XCAFDoc_VisMaterialTool;

static GetID(): Standard_GUID;

// returns the label under which colors are stored
BaseLabel(): TDF_Label;

// Returns internal {@link XCAFDoc_ShapeTool`XCAFDoc_ShapeTool`} tool
ShapeTool(): XCAFDoc_ShapeTool;

// Returns TRUE if Label belongs to a Material Table
IsMaterial(theLabel: TDF_Label): boolean;

// Returns Material defined by specified Label, or NULL if the label is not in Material Table
static GetMaterial(theMatLabel: TDF_Label): XCAFDoc_VisMaterial;

// Adds Material definition to a Material Table and returns its Label
AddMaterial(theMat: XCAFDoc_VisMaterial, theName: TCollection_AsciiString): TDF_Label;
AddMaterial(theName: TCollection_AsciiString): TDF_Label;
AddMaterial(theMat: XCAFDoc_VisMaterial, theName: TCollection_AsciiString): TDF_Label;
AddMaterial(theName: TCollection_AsciiString): TDF_Label;

// Removes Material from the Material Table
RemoveMaterial(theLabel: TDF_Label): void;

// Returns a sequence of Materials currently stored in the Material Table
GetMaterials(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Sets a link with GUID `XCAFDoc::VisMaterialRefGUID()` from shape label to material label
SetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): void;
SetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;
SetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): void;
SetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;
// theMaterialLabel: material label

// Removes a link with GUID `XCAFDoc::VisMaterialRefGUID()` from shape label to material
UnSetShapeMaterial(theShapeLabel: TDF_Label): void;
UnSetShapeMaterial(theShape: TopoDS_Shape): boolean;
UnSetShapeMaterial(theShapeLabel: TDF_Label): void;
UnSetShapeMaterial(theShape: TopoDS_Shape): boolean;

// Returns TRUE if label has a material assignment
IsSetShapeMaterial(theLabel: TDF_Label): boolean;
IsSetShapeMaterial(theShape: TopoDS_Shape): boolean;
IsSetShapeMaterial(theLabel: TDF_Label): boolean;
IsSetShapeMaterial(theShape: TopoDS_Shape): boolean;

// Returns material assigned to the shape label
static GetShapeMaterial(theShapeLabel: TDF_Label): XCAFDoc_VisMaterial;
static GetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): boolean;
GetShapeMaterial(theShape: TopoDS_Shape): XCAFDoc_VisMaterial;
GetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;
static GetShapeMaterial(theShapeLabel: TDF_Label): XCAFDoc_VisMaterial;
static GetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): boolean;
GetShapeMaterial(theShape: TopoDS_Shape): XCAFDoc_VisMaterial;
GetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;

// Returns GUID of this attribute type
ID(): Standard_GUID;

// Does nothing
Restore(anAttribute: TDF_Attribute): void;

// Creates new instance of this tool
NewEmpty(): TDF_Attribute;

// Does nothing
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// attribute to store volume
XCAFDoc_Volume: declare class XCAFDoc_Volume extends TDataStd_Real

constructor

// **class methods**
static GetID(): Standard_GUID;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Sets a value of volume
Set(V: number): void;
static Set(label: TDF_Label, value: number): XCAFDoc_Volume;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
static Set(label: TDF_Label, value: number): XCAFDoc_Volume;
static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;

// Returns the real number value contained in the attribute
Get(): number;
static Get(label: TDF_Label, vol?: number): { returnValue: boolean; vol: number };

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

XCAFDoc_DataMapOfShapeLabel: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher
