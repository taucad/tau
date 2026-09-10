# libcascade — TDataXtd (2)

2 top-level symbols. Signatures are verbatim typescript.

// An Ocaf attribute containing a mesh ({@link Poly_Triangulation`Poly_Triangulation`})
TDataXtd_Triangulation: declare class TDataXtd_Triangulation extends TDF_Attribute

constructor

// Static methods
static GetID(): Standard_GUID;

// Finds or creates a triangulation attribute
static Set(theLabel: TDF_Label): TDataXtd_Triangulation;
static Set(theLabel: TDF_Label, theTriangulation: Poly_Triangulation): TDataXtd_Triangulation;
Set(theTriangulation: Poly_Triangulation): void;
static Set(theLabel: TDF_Label): TDataXtd_Triangulation;
static Set(theLabel: TDF_Label, theTriangulation: Poly_Triangulation): TDataXtd_Triangulation;

// Returns the underlying triangulation
Get(): Poly_Triangulation;

// {@link Poly_Triangulation`Poly_Triangulation`} methods
Deflection(): number;
Deflection(theDeflection: number): void;
Deflection(): number;
Deflection(theDeflection: number): void;

// Deallocates the UV nodes
RemoveUVNodes(): void;

NbNodes(): number;

NbTriangles(): number;

HasUVNodes(): boolean;

Node(theIndex: number): gp_Pnt;

// The method differs from Poly_Triangulation! Sets a node at the given index
SetNode(theIndex: number, theNode: gp_Pnt): void;

UVNode(theIndex: number): gp_Pnt2d;

// The method differs from Poly_Triangulation! Sets a UVNode at the given index
SetUVNode(theIndex: number, theUVNode: gp_Pnt2d): void;

Triangle(theIndex: number): Poly_Triangle;

// The method differs from Poly_Triangulation! Sets a triangle at the given index
SetTriangle(theIndex: number, theTriangle: Poly_Triangle): void;

// Changes normal at the given index
SetNormal(theIndex: number, theNormal: gp_Dir): void;

// Returns true if nodal normals are defined
HasNormals(): boolean;

Normal(theIndex: number): gp_Dir;

// Inherited attribute methods
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

TDataXtd_Array1OfTrsf: NCollection_Array1_gp_Trsf
