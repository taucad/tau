# libcascade — XCAFDoc (4)

9 top-level symbols. Signatures are verbatim typescript.

// attribute to store {@link TopLoc_Location`TopLoc_Location`}
XCAFDoc_Location: declare class XCAFDoc_Location extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

// Find, or create, a Location attribute and set it's value the Location attribute is returned
static Set(label: TDF_Label, Loc: TopLoc_Location): XCAFDoc_Location;
Set(Loc: TopLoc_Location): void;

// Returns True if there is a reference on the same label
Get(): TopLoc_Location;

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

// attribute to store material
XCAFDoc_Material: declare class XCAFDoc_Material extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): XCAFDoc_Material;
Set(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;

GetName(): TCollection_HAsciiString;

GetDescription(): TCollection_HAsciiString;

GetDensity(): number;

GetDensName(): TCollection_HAsciiString;

GetDensValType(): TCollection_HAsciiString;

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

// Provides tools to store and retrieve attributes (materials) of {@link TopoDS_Shape`TopoDS_Shape`} in and from {@link TDocStd_Document`TDocStd_Document`} A Document is intended to hold different attributes of ONE shape and it's sub-shapes Provide tools for management of Materialss section of document
XCAFDoc_MaterialTool: declare class XCAFDoc_MaterialTool extends TDataStd_GenericEmpty

constructor

// Creates (if not exist) MaterialTool
static Set(L: TDF_Label): XCAFDoc_MaterialTool;

static GetID(): Standard_GUID;

// returns the label under which colors are stored
BaseLabel(): TDF_Label;

// Returns internal {@link XCAFDoc_ShapeTool`XCAFDoc_ShapeTool`} tool
ShapeTool(): XCAFDoc_ShapeTool;

// Returns True if label belongs to a material table and is a Material definition
IsMaterial(lab: TDF_Label): boolean;

// Returns a sequence of materials currently stored in the material table
GetMaterialLabels(Labels: NCollection_Sequence_TDF_Label): void;
// Labels: Mutated in place

// Adds a Material definition to a table and returns its label
AddMaterial(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): TDF_Label;

// Sets a link with GUID
SetMaterial(L: TDF_Label, MatL: TDF_Label): void;
SetMaterial(L: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;
SetMaterial(L: TDF_Label, MatL: TDF_Label): void;
SetMaterial(L: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;

// Returns Material assigned to <MatL> Returns False if no such Material is assigned
static GetMaterial(MatL: TDF_Label, aDensity?: number): { returnValue: boolean; aName: TCollection_HAsciiString; aDescription: TCollection_HAsciiString; aDensity: number; aDensName: TCollection_HAsciiString; aDensValType: TCollection_HAsciiString; [Symbol.dispose](): void };

// Find referred material and return density from it if no material --> return 0
static GetDensityForShape(ShapeL: TDF_Label): number;

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

// A base note attribute
XCAFDoc_Note: declare class XCAFDoc_Note extends TDF_Attribute

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Checks if the given label represents a note
static IsMine(theLabel: TDF_Label): boolean;

// Finds a reference attribute on the given label and returns it, if it is found
static Get(theLabel: TDF_Label): XCAFDoc_Note;

// Sets the user name and the timestamp of the note
Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
// theUserName: the user associated with the note
// theTimeStamp: timestamp of the note

// Returns the user name, who created the note
UserName(): TCollection_ExtendedString;

// Returns the timestamp of the note
TimeStamp(): TCollection_ExtendedString;

// Checks if the note isn't linked to annotated items
IsOrphan(): boolean;

// Returns auxiliary data object
GetObject(): XCAFNoteObjects_NoteObject;

// Updates auxiliary data
SetObject(theObject: XCAFNoteObjects_NoteObject): void;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A comment note attribute
XCAFDoc_NoteBalloon: declare class XCAFDoc_NoteBalloon extends XCAFDoc_NoteComment

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Returns default attribute GUID
static GetID(): Standard_GUID;

// Finds a reference attribute on the given label and returns it, if it is found
static Get(theLabel: TDF_Label): XCAFDoc_NoteBalloon;

// Create (if not exist) a comment note on the given label
static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_NoteBalloon;
Set(theComment: TCollection_ExtendedString): void;
Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
Set(theComment: TCollection_ExtendedString): void;
Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
// theLabel: note label
// theUserName: the name of the user, who created the note
// theTimeStamp: creation timestamp of the note
// theComment: comment text

// Returns the ID of the attribute
ID(): Standard_GUID;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

XCAFDoc_NoteBinData: declare class XCAFDoc_NoteBinData extends XCAFDoc_Note

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns default attribute GUID
static GetID(): Standard_GUID;

// Finds a binary data attribute on the given label and returns it, if it is found
static Get(theLabel: TDF_Label): XCAFDoc_NoteBinData;

static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): XCAFDoc_NoteBinData;
Set(theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): void;
Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
Set(theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): void;
Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;

// Returns the note title
Title(): TCollection_ExtendedString;

// Returns data MIME type
MIMEtype(): TCollection_AsciiString;

// Size of data in bytes
Size(): number;

// Returns byte data array
Data(): TColStd_HArray1OfByte;

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

// A comment note attribute
XCAFDoc_NoteComment: declare class XCAFDoc_NoteComment extends XCAFDoc_Note

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns default attribute GUID
static GetID(): Standard_GUID;

// Finds a reference attribute on the given label and returns it, if it is found
static Get(theLabel: TDF_Label): XCAFDoc_NoteComment;

// Create (if not exist) a comment note on the given label
static Set(theLabel: TDF_Label, theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_NoteComment;
Set(theComment: TCollection_ExtendedString): void;
Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
Set(theComment: TCollection_ExtendedString): void;
Set(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString): void;
// theLabel: note label
// theUserName: the name of the user, who created the note
// theTimeStamp: creation timestamp of the note
// theComment: comment text

// Returns the comment text
Comment(): TCollection_ExtendedString;

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

// A tool to annotate items in the hierarchical product structure
XCAFDoc_NotesTool: declare class XCAFDoc_NotesTool extends TDataStd_GenericEmpty

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// Returns default attribute GUID
static GetID(): Standard_GUID;

// Create (if not exist) a notes tool from {@link XCAFDoc`XCAFDoc`} on theLabel
static Set(theLabel: TDF_Label): XCAFDoc_NotesTool;

// Returns the label of the notes hive
GetNotesLabel(): TDF_Label;

// Returns the label of the annotated items hive
GetAnnotatedItemsLabel(): TDF_Label;

// Returns the number of labels in the notes hive
NbNotes(): number;

// Returns the number of labels in the annotated items hive
NbAnnotatedItems(): number;

// Returns all labels from the notes hive
GetNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;
GetNotes(theItemId: XCAFDoc_AssemblyItemId, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetNotes(theItemLabel: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;
GetNotes(theItemId: XCAFDoc_AssemblyItemId, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetNotes(theItemLabel: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;
GetNotes(theItemId: XCAFDoc_AssemblyItemId, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetNotes(theItemLabel: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): number;
// theNoteLabels: sequence of labels

// Returns all labels from the annotated items hive
GetAnnotatedItems(theLabels: NCollection_Sequence_TDF_Label): void;
// theLabels: Mutated in place

// Checks if the given assembly item is annotated
IsAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): boolean;
IsAnnotatedItem(theItemLabel: TDF_Label): boolean;
IsAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): boolean;
IsAnnotatedItem(theItemLabel: TDF_Label): boolean;
// theItemId: assembly item ID

FindAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): TDF_Label;
FindAnnotatedItem(theItemLabel: TDF_Label): TDF_Label;
FindAnnotatedItem(theItemId: XCAFDoc_AssemblyItemId): TDF_Label;
FindAnnotatedItem(theItemLabel: TDF_Label): TDF_Label;

FindAnnotatedItemAttr(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): TDF_Label;
FindAnnotatedItemAttr(theItemLabel: TDF_Label, theGUID: Standard_GUID): TDF_Label;
FindAnnotatedItemAttr(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): TDF_Label;
FindAnnotatedItemAttr(theItemLabel: TDF_Label, theGUID: Standard_GUID): TDF_Label;

FindAnnotatedItemSubshape(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): TDF_Label;
FindAnnotatedItemSubshape(theItemLabel: TDF_Label, theSubshapeIndex: number): TDF_Label;
FindAnnotatedItemSubshape(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): TDF_Label;
FindAnnotatedItemSubshape(theItemLabel: TDF_Label, theSubshapeIndex: number): TDF_Label;

CreateComment(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_Note;

CreateBalloon(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theComment: TCollection_ExtendedString): XCAFDoc_Note;

CreateBinData(theUserName: TCollection_ExtendedString, theTimeStamp: TCollection_ExtendedString, theTitle: TCollection_ExtendedString, theMIMEtype: TCollection_AsciiString, theData: TColStd_HArray1OfByte): XCAFDoc_Note;

GetAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;
GetAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theNoteLabels: NCollection_Sequence_TDF_Label): number;

GetSubshapeNotes(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theNoteLabels: NCollection_Sequence_TDF_Label): number;

AddNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
AddNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label): XCAFDoc_AssemblyItemRef;
AddNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId): XCAFDoc_AssemblyItemRef;
AddNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label): XCAFDoc_AssemblyItemRef;

AddNoteToAttr(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
AddNoteToAttr(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
AddNoteToAttr(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;
AddNoteToAttr(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID): XCAFDoc_AssemblyItemRef;

AddNoteToSubshape(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;
AddNoteToSubshape(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;
AddNoteToSubshape(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;
AddNoteToSubshape(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number): XCAFDoc_AssemblyItemRef;

RemoveNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
RemoveNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;
RemoveNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
RemoveNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;

RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;
RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;
RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;
RemoveSubshapeNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theSubshapeIndex: number, theDelIfOrphan: boolean): boolean;

RemoveAttrNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
RemoveAttrNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
RemoveAttrNote(theNoteLabel: TDF_Label, theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
RemoveAttrNote(theNoteLabel: TDF_Label, theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;

RemoveAllNotes(theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
RemoveAllNotes(theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;
RemoveAllNotes(theItemId: XCAFDoc_AssemblyItemId, theDelIfOrphan: boolean): boolean;
RemoveAllNotes(theItemLabel: TDF_Label, theDelIfOrphan: boolean): boolean;

RemoveAllSubshapeNotes(theItemId: XCAFDoc_AssemblyItemId, theSubshapeIndex: number, theDelIfOrphan?: boolean): boolean;

RemoveAllAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
RemoveAllAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
RemoveAllAttrNotes(theItemId: XCAFDoc_AssemblyItemId, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;
RemoveAllAttrNotes(theItemLabel: TDF_Label, theGUID: Standard_GUID, theDelIfOrphan: boolean): boolean;

DeleteNote(theNoteLabel: TDF_Label): boolean;

DeleteNotes(theNoteLabels: NCollection_Sequence_TDF_Label): number;

DeleteAllNotes(): number;

NbOrphanNotes(): number;

GetOrphanNotes(theNoteLabels: NCollection_Sequence_TDF_Label): void;

DeleteOrphanNotes(): number;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// attribute containing map of sub shapes
XCAFDoc_ShapeMapTool: declare class XCAFDoc_ShapeMapTool extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

// Create (if not exist) ShapeTool from {@link XCAFDoc`XCAFDoc`} on <L>
static Set(L: TDF_Label): XCAFDoc_ShapeMapTool;

// Checks whether shape is subshape of shape stored on label shapeL
IsSubShape(sub: TopoDS_Shape): boolean;

// Sets representation ({@link TopoDS_Shape`TopoDS_Shape`}) for top-level shape
SetShape(S: TopoDS_Shape): void;

// Returns the ID of the attribute
ID(): Standard_GUID;

// Restores the backuped contents from <anAttribute> into this one
Restore(anAttribute: TDF_Attribute): void;

// Returns an new empty attribute from the good end type
NewEmpty(): TDF_Attribute;

// This method is different from the "Copy" one, because it is used when copying an attribute from a source structure into a target structure
Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

GetMap(): NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
