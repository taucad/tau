# libcascade — XCAFNoteObjects

1 top-level symbols. Signatures are verbatim typescript.

// object to store note auxiliary data
XCAFNoteObjects_NoteObject: declare class XCAFNoteObjects_NoteObject extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Returns True if plane is specified
HasPlane(): boolean;

// Returns a right-handed coordinate system of the plane
GetPlane(): gp_Ax2;

// Sets a right-handed coordinate system of the plane
SetPlane(thePlane: gp_Ax2): void;

// Returns True if the attachment point on the annotated object is specified
HasPoint(): boolean;

// Returns the attachment point on the annotated object
GetPoint(): gp_Pnt;

// Sets the anchor point on the annotated object
SetPoint(thePnt: gp_Pnt): void;

// Returns True if the text position is specified
HasPointText(): boolean;

// Returns the text position
GetPointText(): gp_Pnt;

// Sets the text position
SetPointText(thePnt: gp_Pnt): void;

// Returns a tessellated annotation if specified
GetPresentation(): TopoDS_Shape;

// Sets a tessellated annotation
SetPresentation(thePresentation: TopoDS_Shape): void;

// Resets data to the state after calling the default constructor
Reset(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
