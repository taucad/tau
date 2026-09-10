# libcascade — Poly (2)

8 top-level symbols. Signatures are verbatim typescript.

// This class provides a polygon in 3D space, based on the triangulation of a surface
Poly_PolygonOnTriangulation: declare class Poly_PolygonOnTriangulation extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Creates a copy of current polygon
Copy(): Poly_PolygonOnTriangulation;

// Returns the deflection of this polygon
Deflection(): number;
Deflection(theDefl: number): void;
Deflection(): number;
Deflection(theDefl: number): void;

// Returns the number of nodes for this polygon
NbNodes(): number;

// Returns node at the given index
Node(theIndex: number): number;

// Returns mutable node-index array
ChangeNodeArray(): NCollection_Array1_int;

// Sets node at the given index
SetNode(theIndex: number, theNode: number): void;

// Returns true if parameters are associated with the nodes in this polygon
HasParameters(): boolean;

// Returns parameter at the given index
Parameter(theIndex: number): number;

// Sets parameter at the given index
SetParameter(theIndex: number, theValue: number): void;

// Returns mutable parameter array
ChangeParameterArray(): NCollection_Array1_double;

// Sets the table of the parameters associated with each node in this polygon
SetParameters(theParameters: NCollection_HArray1_double): void;

// Returns the table of nodes for this polygon
Nodes(): NCollection_Array1_int;

// Returns the table of the parameters associated with each node in this polygon
Parameters(): NCollection_HArray1_double;

// DEPRECATED
ChangeNodes(): NCollection_Array1_int;

// DEPRECATED
ChangeParameters(): NCollection_Array1_double;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a component triangle of a triangulation ({@link Poly_Triangulation`Poly_Triangulation`} object)
Poly_Triangle: declare class Poly_Triangle

constructor

// Sets the value of the three nodes of this triangle
Set(theN1: number, theN2: number, theN3: number): void;
Set(theIndex: number, theNode: number): void;
Set(theN1: number, theN2: number, theN3: number): void;
Set(theIndex: number, theNode: number): void;

// Returns the node indices of this triangle
Get(theN1?: number, theN2?: number, theN3?: number): { theN1: number; theN2: number; theN3: number };

// Get the node of given Index
Value(theIndex: number): number;

// Get the node of given Index
ChangeValue(theIndex: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides a triangulation for a surface, a set of surfaces, or more generally a shape
Poly_Triangulation: declare class Poly_Triangulation extends Standard_Transient

constructor

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Creates full copy of current triangulation
Copy(): Poly_Triangulation;

// Returns the deflection of this triangulation
Deflection(): number;
Deflection(theDeflection: number): void;
Deflection(): number;
Deflection(theDeflection: number): void;

// Returns initial set of parameters used to generate this triangulation
Parameters(): Poly_TriangulationParameters;
Parameters(theParams: Poly_TriangulationParameters): void;
Parameters(): Poly_TriangulationParameters;
Parameters(theParams: Poly_TriangulationParameters): void;

// Clears internal arrays of nodes and all attributes
Clear(): void;

// Returns TRUE if triangulation has some geometry
HasGeometry(): boolean;

// Returns the number of nodes for this triangulation
NbNodes(): number;

// Returns the number of triangles for this triangulation
NbTriangles(): number;

// Returns true if 2D nodes are associated with 3D nodes for this triangulation
HasUVNodes(): boolean;

// Returns true if nodal normals are defined
HasNormals(): boolean;

// Returns a node at the given index
Node(theIndex: number): gp_Pnt;
// theIndex: node index within [1, `NbNodes()`] range

// Sets a node coordinates
SetNode(theIndex: number, thePnt: gp_Pnt): void;
// theIndex: node index within [1, `NbNodes()`] range
// thePnt: 3D point coordinates

// Returns UV-node at the given index
UVNode(theIndex: number): gp_Pnt2d;
// theIndex: node index within [1, `NbNodes()`] range

// Sets an UV-node coordinates
SetUVNode(theIndex: number, thePnt: gp_Pnt2d): void;
// theIndex: node index within [1, `NbNodes()`] range
// thePnt: UV coordinates

// Returns triangle at the given index
Triangle(theIndex: number): Poly_Triangle;
// theIndex: triangle index within [1, `NbTriangles()`] range

// Sets a triangle
SetTriangle(theIndex: number, theTriangle: Poly_Triangle): void;
// theIndex: triangle index within [1, `NbTriangles()`] range
// theTriangle: triangle node indices, with each node defined within [1, `NbNodes()`] range

// Returns normal at the given index
Normal(theIndex: number): gp_Dir;
// theIndex: node index within [1, `NbNodes()`] range

// Changes normal at the given index
SetNormal(theIndex: number, theNormal: gp_Dir): void;
// theIndex: node index within [1, `NbNodes()`] range
// theNormal: normalized 3D vector defining a surface normal

// Returns mesh purpose bits
MeshPurpose(): number;

// Sets mesh purpose bits
SetMeshPurpose(thePurpose: number): void;

// Returns cached min - max range of triangulation data, which is VOID by default (e.g, no cached information)
CachedMinMax(): Bnd_Box;

// Sets a cached min - max range of this triangulation
SetCachedMinMax(theBox: Bnd_Box): void;

// Returns TRUE if there is some cached min - max range of this triangulation
HasCachedMinMax(): boolean;

// Updates cached min - max range of this triangulation with bounding box of nodal data
UpdateCachedMinMax(): void;

// Extends the passed box with bounding box of this triangulation
MinMax(theBox: Bnd_Box, theTrsf: gp_Trsf, theIsAccurate: boolean): boolean;
// theBox: Mutated in place
// theTrsf: optional transformation
// theIsAccurate: when FALSE, allows using a cached min - max range of this triangulation even for non-identity transformation

// Returns TRUE if node positions are defined with double precision
IsDoublePrecision(): boolean;

// Set if node positions should be defined with double or single precision for 3D and UV nodes
SetDoublePrecision(theIsDouble: boolean): void;

// Method resizing internal arrays of nodes (synchronously for all attributes)
ResizeNodes(theNbNodes: number, theToCopyOld: boolean): void;
// theNbNodes: new number of nodes
// theToCopyOld: copy old nodes into the new array

// Method resizing an internal array of triangles
ResizeTriangles(theNbTriangles: number, theToCopyOld: boolean): void;
// theNbTriangles: new number of triangles
// theToCopyOld: copy old triangles into the new array

// If an array for UV coordinates is not allocated yet, do it now
AddUVNodes(): void;

// Deallocates the UV nodes array
RemoveUVNodes(): void;

// If an array for normals is not allocated yet, do it now
AddNormals(): void;

// Deallocates the normals array
RemoveNormals(): void;

// Compute smooth normals by averaging triangle normals
ComputeNormals(): void;

// Returns the table of 3D points for read-only access or NULL if nodes array is undefined
MapNodeArray(): NCollection_HArray1_gp_Pnt;

// Returns the triangle array for read-only access or NULL if triangle array is undefined
MapTriangleArray(): NCollection_HArray1_Poly_Triangle;

// Returns the table of 2D nodes for read-only access or NULL if UV nodes array is undefined
MapUVNodeArray(): NCollection_HArray1_gp_Pnt2d;

// Returns the table of per-vertex normals for read-only access or NULL if normals array is undefined
MapNormalArray(): NCollection_HArray1_float;

// Returns an internal array of triangles
InternalTriangles(): NCollection_Array1_Poly_Triangle;

// Returns an internal array of nodes
InternalNodes(): Poly_ArrayOfNodes;

// Returns an internal array of UV nodes
InternalUVNodes(): Poly_ArrayOfUVNodes;

// Return an internal array of normals
InternalNormals(): NCollection_Array1_NCollection_Vec3_float;

// DEPRECATED
SetNormals(theNormals: NCollection_HArray1_float): void;

// DEPRECATED
Triangles(): NCollection_Array1_Poly_Triangle;

// DEPRECATED
ChangeTriangles(): NCollection_Array1_Poly_Triangle;

// DEPRECATED
ChangeTriangle(theIndex: number): Poly_Triangle;

NbDeferredNodes(): number;

NbDeferredTriangles(): number;

HasDeferredData(): boolean;

UnloadDeferredData(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Represents initial set of parameters triangulation is built for
Poly_TriangulationParameters: declare class Poly_TriangulationParameters extends Standard_Transient

constructor

// Creates a copy of current triangulation parameters
Copy(): Poly_TriangulationParameters;

// Returns true if linear deflection is defined
HasDeflection(): boolean;

// Returns true if angular deflection is defined
HasAngle(): boolean;

// Returns true if minimum size is defined
HasMinSize(): boolean;

// Returns linear deflection or -1 if undefined
Deflection(): number;

// Returns angular deflection or -1 if undefined
Angle(): number;

// Returns minimum size or -1 if undefined
MinSize(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Poly_CoherentTriangulation_TwoIntegers: interface Poly_CoherentTriangulation_TwoIntegers

myValue: [number, number]

Poly_Array1OfTriangle: NCollection_Array1_Poly_Triangle

Poly_HArray1OfTriangle: NCollection_HArray1_Poly_Triangle

Poly_ListOfTriangulation: NCollection_List_handle_Poly_Triangulation
