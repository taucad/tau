# libcascade — XCAFDoc (2)

6 top-level symbols. Signatures are verbatim typescript.

// Provides tools to store and retrieve attributes (colors) of {@link TopoDS_Shape`TopoDS_Shape`} in and from {@link TDocStd_Document`TDocStd_Document`} A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Colors section of document
XCAFDoc_ColorTool: declare class XCAFDoc_ColorTool extends TDataStd_GenericEmpty

constructor

// Returns current auto-naming mode
static AutoNaming(): boolean;

// See also `AutoNaming()`
static SetAutoNaming(theIsAutoNaming: boolean): void;

// Creates (if not exist) ColorTool
static Set(L: TDF_Label): XCAFDoc_ColorTool;

static GetID(): Standard_GUID;

// returns the label under which colors are stored
BaseLabel(): TDF_Label;

// Returns internal {@link XCAFDoc_ShapeTool`XCAFDoc_ShapeTool`} tool
ShapeTool(): XCAFDoc_ShapeTool;

// Returns True if label belongs to a colortable and is a color definition
IsColor(lab: TDF_Label): boolean;

// Returns color defined by label lab Returns False if the label is not in colortable or does not define a color
static GetColor(lab: TDF*Label, col: Quantity_Color): boolean;
static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
static GetColor(lab: TDF_Label, col: Quantity_Color): boolean;
static GetColor(lab: TDF_Label, col: Quantity_ColorRGBA): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
static GetColor(L: TDF_Label, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, colorL: TDF_Label): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
GetColor(S: TopoDS_Shape, type*: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
// col: Mutated in place

// Finds a color definition in a colortable and returns its label if found (or Null label else) Finds a color definition in a colortable and returns its label if found Returns False if color is not found in colortable
FindColor(col: Quantity_Color): TDF_Label;
FindColor(col: Quantity_ColorRGBA): TDF_Label;
FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;
FindColor(col: Quantity_Color): TDF_Label;
FindColor(col: Quantity_ColorRGBA): TDF_Label;
FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;
FindColor(col: Quantity_Color): TDF_Label;
FindColor(col: Quantity_ColorRGBA): TDF_Label;
FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;
FindColor(col: Quantity_Color): TDF_Label;
FindColor(col: Quantity_ColorRGBA): TDF_Label;
FindColor(col: Quantity_Color, lab: TDF_Label): boolean;
FindColor(col: Quantity_ColorRGBA, lab: TDF_Label): boolean;

// Adds a color definition to a colortable and returns its label (returns existing label if the same color is already defined)
AddColor(col: Quantity_Color): TDF_Label;
AddColor(col: Quantity_ColorRGBA): TDF_Label;
AddColor(col: Quantity_Color): TDF_Label;
AddColor(col: Quantity_ColorRGBA): TDF_Label;

// Removes color from the colortable
RemoveColor(lab: TDF_Label): void;

// Returns a sequence of colors currently stored in the colortable
GetColors(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Sets a link with GUID defined by <type> (see `XCAFDoc::ColorRefGUID()`) from label <L> to color defined by <colorL>
SetColor(L: TDF*Label, colorL: TDF_Label, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_Color, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): void;
SetColor(S: TopoDS_Shape, colorL: TDF_Label, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_Color, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): boolean;
SetColor(L: TDF_Label, colorL: TDF_Label, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_Color, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): void;
SetColor(S: TopoDS_Shape, colorL: TDF_Label, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_Color, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): boolean;
SetColor(L: TDF_Label, colorL: TDF_Label, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_Color, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): void;
SetColor(S: TopoDS_Shape, colorL: TDF_Label, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_Color, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): boolean;
SetColor(L: TDF_Label, colorL: TDF_Label, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_Color, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): void;
SetColor(S: TopoDS_Shape, colorL: TDF_Label, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_Color, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): boolean;
SetColor(L: TDF_Label, colorL: TDF_Label, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_Color, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): void;
SetColor(S: TopoDS_Shape, colorL: TDF_Label, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_Color, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): boolean;
SetColor(L: TDF_Label, colorL: TDF_Label, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_Color, type*: XCAFDoc*ColorType): void;
SetColor(L: TDF_Label, Color: Quantity_ColorRGBA, type*: XCAFDoc*ColorType): void;
SetColor(S: TopoDS_Shape, colorL: TDF_Label, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_Color, type*: XCAFDoc*ColorType): boolean;
SetColor(S: TopoDS_Shape, Color: Quantity_ColorRGBA, type*: XCAFDoc_ColorType): boolean;

// Removes a link with GUID defined by <type> (see `XCAFDoc::ColorRefGUID()`) from label <L> to color
UnSetColor(L: TDF*Label, type*: XCAFDoc*ColorType): void;
UnSetColor(S: TopoDS_Shape, type*: XCAFDoc*ColorType): boolean;
UnSetColor(L: TDF_Label, type*: XCAFDoc*ColorType): void;
UnSetColor(S: TopoDS_Shape, type*: XCAFDoc_ColorType): boolean;

// Returns True if label <L> has a color assignment of the type <type>
IsSet(L: TDF*Label, type*: XCAFDoc*ColorType): boolean;
IsSet(S: TopoDS_Shape, type*: XCAFDoc*ColorType): boolean;
IsSet(L: TDF_Label, type*: XCAFDoc*ColorType): boolean;
IsSet(S: TopoDS_Shape, type*: XCAFDoc_ColorType): boolean;

// Return TRUE if object on this label is visible, FALSE if invisible
static IsVisible(L: TDF_Label): boolean;

// Set the visibility of object on label
SetVisibility(shapeLabel: TDF_Label, isvisible?: boolean): void;

// Return TRUE if object color defined by its Layer, FALSE if not
IsColorByLayer(L: TDF_Label): boolean;

// Set the Color defined by Layer flag on label
SetColorByLayer(shapeLabel: TDF_Label, isColorByLayer?: boolean): void;

// Sets the color of component that styled with SHUO structure Returns FALSE if no sush component found NOTE
SetInstanceColor(theShape: TopoDS*Shape, type*: XCAFDoc*ColorType, color: Quantity_Color, isCreateSHUO: boolean): boolean;
SetInstanceColor(theShape: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA, isCreateSHUO: boolean): boolean;
SetInstanceColor(theShape: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_Color, isCreateSHUO: boolean): boolean;
SetInstanceColor(theShape: TopoDS_Shape, type*: XCAFDoc_ColorType, color: Quantity_ColorRGBA, isCreateSHUO: boolean): boolean;

// Gets the color of component that styled with SHUO structure Returns FALSE if no sush component or color type
GetInstanceColor(theShape: TopoDS*Shape, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
GetInstanceColor(theShape: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_ColorRGBA): boolean;
GetInstanceColor(theShape: TopoDS_Shape, type*: XCAFDoc*ColorType, color: Quantity_Color): boolean;
GetInstanceColor(theShape: TopoDS_Shape, type*: XCAFDoc_ColorType, color: Quantity_ColorRGBA): boolean;
// color: Mutated in place

// Gets the visibility status of component that styled with SHUO structure Returns FALSE if no sush component
IsInstanceVisible(theShape: TopoDS_Shape): boolean;

// Reverses order in chains of TreeNodes (from Last to First) under each Color Label since we became to use function ::Prepend() instead of ::Append() in method `SetColor()` for acceleration
ReverseChainsOfTreeNodes(): boolean;

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

// Defines types of color assignments Color of shape is defined following way in dependance with type of color
XCAFDoc_ColorType: typeof XCAFDoc_ColorType[keyof typeof XCAFDoc_ColorType]

// attribute to store datum
XCAFDoc_Datum: declare class XCAFDoc_Datum extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): XCAFDoc_Datum;
static Set(theLabel: TDF_Label): XCAFDoc_Datum;
static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): XCAFDoc_Datum;
static Set(theLabel: TDF_Label): XCAFDoc_Datum;
Set(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, anIdentification: TCollection_HAsciiString): void;

GetName(): TCollection_HAsciiString;

GetDescription(): TCollection_HAsciiString;

GetIdentification(): TCollection_HAsciiString;

// Returns dimension object data taken from the paren's label and its sub-labels
GetObject(): XCAFDimTolObjects_DatumObject;

// Updates parent's label and its sub-labels with data taken from theDatumObject
SetObject(theDatumObject: XCAFDimTolObjects_DatumObject): void;

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

// attribute to store dimension and tolerance
XCAFDoc_DimTol: declare class XCAFDoc_DimTol extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label, kind: number, aVal: NCollection_HArray1_double, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): XCAFDoc_DimTol;
Set(kind: number, aVal: NCollection_HArray1_double, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString): void;

GetKind(): number;

GetVal(): NCollection_HArray1_double;

GetName(): TCollection_HAsciiString;

GetDescription(): TCollection_HAsciiString;

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

// Attribute containing GD&T section of XCAF document
XCAFDoc_DimTolTool: declare class XCAFDoc_DimTolTool extends TDataStd_GenericEmpty

constructor

// Creates (if not exist) DimTolTool attribute
static Set(L: TDF_Label): XCAFDoc_DimTolTool;

// Returns the standard GD&T tool GUID
static GetID(): Standard_GUID;

// Returns the label under which GD&T table is stored
BaseLabel(): TDF_Label;

// Returns internal {@link XCAFDoc_ShapeTool`XCAFDoc_ShapeTool`} tool
ShapeTool(): XCAFDoc_ShapeTool;

// Returns True if the label belongs to a GD&T table and is a Dimension definition
IsDimension(theLab: TDF_Label): boolean;

// Returns a sequence of Dimension labels currently stored in the GD&T table
GetDimensionLabels(theLabels: NCollection_Sequence_TDF_Label): void;
// theLabels: Mutated in place

// Sets a dimension to the target label
SetDimension(theL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstLS: NCollection_Sequence_TDF_Label, theSecondLS: NCollection_Sequence_TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstL: TDF_Label, theSecondL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstLS: NCollection_Sequence_TDF_Label, theSecondLS: NCollection_Sequence_TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstL: TDF_Label, theSecondL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstLS: NCollection_Sequence_TDF_Label, theSecondLS: NCollection_Sequence_TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstL: TDF_Label, theSecondL: TDF_Label, theDimL: TDF_Label): void;

// Returns all Dimension labels defined for theShapeL
GetRefDimensionLabels(theShapeL: TDF_Label, theDimensions: NCollection_Sequence_TDF_Label): boolean;
// theDimensions: Mutated in place

// Adds a dimension definition to the GD&T table and returns its label
AddDimension(): TDF_Label;

// Returns True if the label belongs to the GD&T table and is a dimension tolerance
IsGeomTolerance(theLab: TDF_Label): boolean;

// Returns a sequence of Tolerance labels currently stored in the GD&T table
GetGeomToleranceLabels(theLabels: NCollection_Sequence_TDF_Label): void;
// theLabels: Mutated in place

// Sets a geometry tolerance from theGeomTolL to theL label
SetGeomTolerance(theL: TDF_Label, theGeomTolL: TDF_Label): void;
SetGeomTolerance(theL: NCollection_Sequence_TDF_Label, theGeomTolL: TDF_Label): void;
SetGeomTolerance(theL: TDF_Label, theGeomTolL: TDF_Label): void;
SetGeomTolerance(theL: NCollection_Sequence_TDF_Label, theGeomTolL: TDF_Label): void;

// Returns all GeomTolerance labels defined for theShapeL
GetRefGeomToleranceLabels(theShapeL: TDF_Label, theDimTols: NCollection_Sequence_TDF_Label): boolean;
// theDimTols: Mutated in place

// Adds a GeomTolerance definition to the GD&T table and returns its label
AddGeomTolerance(): TDF_Label;

// Returns True if theLab belongs to the GD&T table and is a dmension tolerance
IsDimTol(theLab: TDF_Label): boolean;

// Returns a sequence of D&GTs currently stored in the GD&T table
GetDimTolLabels(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Finds a dimension tolerance definition in the GD&T table satisfying the specified kind, values, name and description and returns its label if found
FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, lab: TDF_Label): boolean;
FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;
FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, lab: TDF_Label): boolean;
FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;
// lab: Mutated in place

// Adds a dimension tolerance definition with the specified kind, value, name and description to the GD&T table and returns its label
AddDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

// Sets existing dimension tolerance to theL label
SetDimTol(theL: TDF_Label, theDimTolL: TDF_Label): void;
SetDimTol(theL: TDF_Label, theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;
SetDimTol(theL: TDF_Label, theDimTolL: TDF_Label): void;
SetDimTol(theL: TDF_Label, theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

// Gets all shape labels referred by theL label of the GD&T table
static GetRefShapeLabel(theL: TDF_Label, theShapeLFirst: NCollection_Sequence_TDF_Label, theShapeLSecond: NCollection_Sequence_TDF_Label): boolean;
// theShapeLFirst: Mutated in place
// theShapeLSecond: Mutated in place

// Returns dimension tolerance assigned to theDimTolL label
GetDimTol(theDimTolL: TDF_Label, theKind?: number): { returnValue: boolean; theKind: number; theVal: NCollection_HArray1_double; theName: TCollection_HAsciiString; theDescription: TCollection_HAsciiString; [Symbol.dispose](): void };

// Returns True if label belongs to the GD&T table and is a Datum definition
IsDatum(lab: TDF_Label): boolean;

// Returns a sequence of Datums currently stored in the GD&T table
GetDatumLabels(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Finds a datum satisfying the specified name, description and identification and returns its label if found
FindDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString, lab: TDF_Label): boolean;
// lab: Mutated in place

// Adds a datum definition to the GD&T table and returns its label
AddDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): TDF_Label;
AddDatum(): TDF_Label;
AddDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): TDF_Label;
AddDatum(): TDF_Label;

// Sets a datum to the sequence of shape labels
SetDatum(theShapeLabels: NCollection_Sequence_TDF_Label, theDatumL: TDF_Label): void;
SetDatum(theL: TDF_Label, theTolerL: TDF_Label, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): void;
SetDatum(theShapeLabels: NCollection_Sequence_TDF_Label, theDatumL: TDF_Label): void;
SetDatum(theL: TDF_Label, theTolerL: TDF_Label, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): void;

// Sets a datum from theDatumL label to theToletL label
SetDatumToGeomTol(theDatumL: TDF_Label, theTolerL: TDF_Label): void;

// Returns datum assigned to theDatumL label
GetDatum(theDatumL: TDF_Label): { returnValue: boolean; theName: TCollection_HAsciiString; theDescription: TCollection_HAsciiString; theIdentification: TCollection_HAsciiString; [Symbol.dispose](): void };

// Returns all Datum labels defined for theDimTolL label
static GetDatumOfTolerLabels(theDimTolL: TDF_Label, theDatums: NCollection_Sequence_TDF_Label): boolean;
// theDatums: Mutated in place

// Returns all Datum labels with {@link XCAFDimTolObjects_DatumObject`XCAFDimTolObjects_DatumObject`} defined for label theDimTolL
static GetDatumWithObjectOfTolerLabels(theDimTolL: TDF_Label, theDatums: NCollection_Sequence_TDF_Label): boolean;
// theDatums: Mutated in place

// Returns all GeomToleranses labels defined for theDatumL label
GetTolerOfDatumLabels(theDatumL: TDF_Label, theTols: NCollection_Sequence_TDF_Label): boolean;
// theTols: Mutated in place

// Returns Datum label defined for theShapeL label
GetRefDatumLabel(theShapeL: TDF_Label, theDatum: NCollection_Sequence_TDF_Label): boolean;
// theDatum: Mutated in place

// Returns true if the given GDT is marked as locked
IsLocked(theViewL: TDF_Label): boolean;

// Mark the given GDT as locked
Lock(theViewL: TDF_Label): void;

// fill the map GDT label -> shape presentation
GetGDTPresentations(theGDTLabelToShape: NCollection_IndexedDataMap_TDF_Label_TopoDS_Shape): void;
// theGDTLabelToShape: Mutated in place

// Set shape presentation for GDT labels according to given map (theGDTLabelToPrs) theGDTLabelToPrsName map is an additional argument, can be used to set presentation names
SetGDTPresentations(theGDTLabelToPrs: NCollection_IndexedDataMap_TDF_Label_TopoDS_Shape): void;
// theGDTLabelToPrs: Mutated in place

// Unlock the given GDT
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

// Attribute that identifies a dimension in the GD&T table
XCAFDoc_Dimension: declare class XCAFDoc_Dimension extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

static Set(theLabel: TDF_Label): XCAFDoc_Dimension;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Updates parent's label and its sub-labels with data taken from theDimensionObject
SetObject(theDimensionObject: XCAFDimTolObjects_DimensionObject): void;

// Returns dimension object data taken from the parent's label and its sub-labels
GetObject(): XCAFDimTolObjects_DimensionObject;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
