# libcascade — ShapeExtend

10 top-level symbols. Signatures are verbatim typescript.

// This package provides general tools and data structures common for other packages in SHAPEWORKS and extending CAS.CADE structures
ShapeExtend: declare class ShapeExtend

constructor

// Inits using of {@link ShapeExtend`ShapeExtend`}
static Init(): void;

// Encodes status (enumeration) to a bit flag
static EncodeStatus(status: ShapeExtend_Status): number;

// Tells if a bit flag contains bit corresponding to enumerated status
static DecodeStatus(flag: number, status: ShapeExtend_Status): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Abstract class that can be used for attaching messages to the objects (e.g
ShapeExtend_BasicMsgRegistrator: declare class ShapeExtend_BasicMsgRegistrator extends Standard_Transient

constructor

// Calls Send method with Null Transient
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a curve which consists of several segments
ShapeExtend_ComplexCurve: declare class ShapeExtend_ComplexCurve extends Geom_Curve

// Returns number of curves
NbCurves(): number;

// Returns curve given by its index
Curve(index: number): Geom_Curve;

// Returns number of the curve for the given parameter U and local parameter UOut for the found curve
LocateParameter(U: number, UOut: number): { returnValue: number; UOut: number };

// Returns global parameter for the whole curve according to the segment and local parameter on it
LocalToGlobal(index: number, Ulocal: number): number;

// Applies transformation to each curve
Transform(T: gp_Trsf): void;

// Returns 1 - U
ReversedParameter(U: number): number;

// Returns 0
FirstParameter(): number;

// Returns 1
LastParameter(): number;

// Returns True if the curve is closed
IsClosed(): boolean;

// Returns False
IsPeriodic(): boolean;

// Returns GeomAbs_C0
Continuity(): GeomAbs_Shape;

// Returns False if N > 0
IsCN(N: number): boolean;

// Returns point at parameter U
EvalD0(U: number): gp_Pnt;

// Computes the point and first derivative at parameter U
EvalD1(U: number): Geom_Curve_ResD1;

// Computes the point and first two derivatives at parameter U
EvalD2(U: number): Geom_Curve_ResD2;

// Computes the point and first three derivatives at parameter U
EvalD3(U: number): Geom_Curve_ResD3;

// Computes the Nth derivative at parameter U
EvalDN(U: number, N: number): gp_Vec;

// Returns scale factor for recomputing of deviatives
GetScaleFactor(ind: number): number;

// Checks geometrical connectivity of the curves, including closure (sets fields myClosed)
CheckConnectivity(Preci: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Composite surface is represented by a grid of surfaces (patches) connected geometrically
ShapeExtend_CompositeSurface: declare class ShapeExtend_CompositeSurface extends Geom_Surface

constructor

// Initializes by a grid of surfaces
Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, param: ShapeExtend_Parametrisation): boolean;
Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, UJoints: NCollection_Array1_double, VJoints: NCollection_Array1_double): boolean;
Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, param: ShapeExtend_Parametrisation): boolean;
Init(GridSurf: NCollection_HArray2_handle_Geom_Surface, UJoints: NCollection_Array1_double, VJoints: NCollection_Array1_double): boolean;

// Returns number of patches in U direction
NbUPatches(): number;

// Returns number of patches in V direction
NbVPatches(): number;

// Returns one surface patch that contains given point
Patch(pnt: gp_Pnt2d): Geom_Surface;
Patch(i: number, j: number): Geom_Surface;
Patch(U: number, V: number): Geom_Surface;
Patch(pnt: gp_Pnt2d): Geom_Surface;
Patch(i: number, j: number): Geom_Surface;
Patch(U: number, V: number): Geom_Surface;
Patch(pnt: gp_Pnt2d): Geom_Surface;
Patch(i: number, j: number): Geom_Surface;
Patch(U: number, V: number): Geom_Surface;

// Returns grid of surfaces
Patches(): NCollection_HArray2_handle_Geom_Surface;

// Returns the array of U values corresponding to joint points between patches as well as to start and end points, which define global parametrisation of the surface
UJointValues(): NCollection_HArray1_double;

// Returns the array of V values corresponding to joint points between patches as well as to start and end points, which define global parametrisation of the surface
VJointValues(): NCollection_HArray1_double;

// Returns i-th joint value in U direction (1-st is global Umin, (`NbUPatches()`+1)-th is global Umax on the composite surface)
UJointValue(i: number): number;

// Returns j-th joint value in V direction (1-st is global Vmin, (`NbVPatches()`+1)-th is global Vmax on the composite surface)
VJointValue(j: number): number;

// Sets the array of U values corresponding to joint points, which define global parametrisation of the surface
SetUJointValues(UJoints: NCollection_Array1_double): boolean;

// Sets the array of V values corresponding to joint points, which define global parametrisation of the surface Number of values in array should be equal to `NbVPatches()`+1
SetVJointValues(VJoints: NCollection_Array1_double): boolean;

// Changes starting value for global U parametrisation (all other joint values are shifted accordingly)
SetUFirstValue(UFirst: number): void;

// Changes starting value for global V parametrisation (all other joint values are shifted accordingly)
SetVFirstValue(VFirst: number): void;

// Returns number of col that contains given (global) parameter
LocateUParameter(U: number): number;

// Returns number of row that contains given (global) parameter
LocateVParameter(V: number): number;

// Returns number of row and col of surface that contains given point
LocateUVPoint(pnt: gp_Pnt2d, i?: number, j?: number): { i: number; j: number };

// Converts local parameter u on patch i,j to global parameter U
ULocalToGlobal(i: number, j: number, u: number): number;

// Converts local parameter v on patch i,j to global parameter V
VLocalToGlobal(i: number, j: number, v: number): number;

// Converts local parameters uv on patch i,j to global parameters UV
LocalToGlobal(i: number, j: number, uv: gp_Pnt2d): gp_Pnt2d;

// Converts global parameter U to local parameter u on patch i,j
UGlobalToLocal(i: number, j: number, U: number): number;

// Converts global parameter V to local parameter v on patch i,j
VGlobalToLocal(i: number, j: number, V: number): number;

// Converts global parameters UV to local parameters uv on patch i,j
GlobalToLocal(i: number, j: number, UV: gp_Pnt2d): gp_Pnt2d;

// Computes transformation operator and uFactor descrinbing affine transformation required to convert global parameters on composite surface to local parameters on patch (i,j)
GlobalToLocalTransformation(i: number, j: number, uFact: number, Trsf: gp_Trsf2d): { returnValue: boolean; uFact: number };
// Trsf: Mutated in place

// Applies transformation to all the patches
Transform(T: gp_Trsf): void;

// Returns a copy of the surface
Copy(): Geom_Geometry;

// NOT IMPLEMENTED (does nothing)
UReverse(): void;

// Returns U
UReversedParameter(U: number): number;

// NOT IMPLEMENTED (does nothing)
VReverse(): void;

// Returns V
VReversedParameter(V: number): number;

// Returns the parametric bounds of grid
Bounds(U1: number, U2: number, V1: number, V2: number): { U1: number; U2: number; V1: number; V2: number };

// Returns True if grid is closed in U direction (i.e
IsUClosed(): boolean;

// Returns True if grid is closed in V direction (i.e
IsVClosed(): boolean;

// Returns False
IsUPeriodic(): boolean;

// Returns False
IsVPeriodic(): boolean;

// NOT IMPLEMENTED (returns Null curve)
UIso(U: number): Geom_Curve;

// NOT IMPLEMENTED (returns Null curve)
VIso(V: number): Geom_Curve;

// returns C0
Continuity(): GeomAbs_Shape;

// returns True if N <=0
IsCNu(N: number): boolean;

// returns True if N <=0
IsCNv(N: number): boolean;

// Computes the point of parameter U,V on the grid
EvalD0(U: number, V: number): gp_Pnt;

// Computes the point P and the first derivatives in the directions U and V at this point
EvalD1(U: number, V: number): Geom_Surface_ResD1;

// Computes the point P, the first and the second derivatives in the directions U and V at this point
EvalD2(U: number, V: number): Geom_Surface_ResD2;

// Computes the point P, the first,the second and the third derivatives in the directions U and V at this point
EvalD3(U: number, V: number): Geom_Surface_ResD3;

// Computes the derivative of order Nu in the direction U and Nv in the direction V at the point P(U, V)
EvalDN(U: number, V: number, Nu: number, Nv: number): gp_Vec;

// Computes the point of parameter pnt on the grid
Value(pnt: gp_Pnt2d): gp_Pnt;
Value(U: number, V: number): gp_Pnt;
Value(pnt: gp_Pnt2d): gp_Pnt;
Value(U: number, V: number): gp_Pnt;

// Computes Joint values according to parameter
ComputeJointValues(param?: ShapeExtend_Parametrisation): void;

// Checks geometrical connectivity of the patches, including closedness (sets fields muUClosed and myVClosed)
CheckConnectivity(prec: number): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class is intended to explore shapes and convert different representations (list, sequence, compound) of complex shapes
ShapeExtend_Explorer: declare class ShapeExtend_Explorer

constructor

// Converts a sequence of Shapes to a Compound
CompoundFromSeq(seqval: NCollection_HSequence_TopoDS_Shape): TopoDS_Shape;

// Converts a Compound to a list of Shapes if <comp> is not a compound, the list contains only <comp> if <comp> is Null, the list is empty if <comp> is a Compound, its sub-shapes are put into the list then if <expcomp> is True, if a sub-shape is a Compound, it is not put to the list but its sub-shapes are (recursive)
SeqFromCompound(comp: TopoDS_Shape, expcomp: boolean): NCollection_HSequence_TopoDS_Shape;

// Converts a Sequence of Shapes to a List of Shapes <clear> if True (D), commands the list to start from scratch else, the list is cumulated
ListFromSeq(seqval: NCollection_HSequence_TopoDS_Shape, lisval: NCollection_List_TopoDS_Shape, clear: boolean): void;
// lisval: Mutated in place

// Converts a List of Shapes to a Sequence of Shapes
SeqFromList(lisval: NCollection_List_TopoDS_Shape): NCollection_HSequence_TopoDS_Shape;

// Returns the type of a Shape
ShapeType(shape: TopoDS_Shape, compound: boolean): TopAbs_ShapeEnum;

// Builds a COMPOUND from the given shape
SortedCompound(shape: TopoDS*Shape, type*: TopAbs_ShapeEnum, explore: boolean, compound: boolean): TopoDS_Shape;

// Dispatches starting list of shapes according to their type, to the appropriate resulting lists For each of these lists, if it is null, it is firstly created else, new items are appended to the already existing ones
DispatchList(list: NCollection_HSequence_TopoDS_Shape): { vertices: NCollection_HSequence_TopoDS_Shape; edges: NCollection_HSequence_TopoDS_Shape; wires: NCollection_HSequence_TopoDS_Shape; faces: NCollection_HSequence_TopoDS_Shape; shells: NCollection_HSequence_TopoDS_Shape; solids: NCollection_HSequence_TopoDS_Shape; compsols: NCollection_HSequence_TopoDS_Shape; compounds: NCollection_HSequence_TopoDS_Shape; [Symbol.dispose](): void };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Attaches messages to the objects (generic Transient or shape)
ShapeExtend_MsgRegistrator: declare class ShapeExtend_MsgRegistrator extends ShapeExtend_BasicMsgRegistrator

constructor

// Sends a message to be attached to the object
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;
Send(object: Standard_Transient, message: Message_Msg, gravity: Message_Gravity): void;
Send(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
Send(message: Message_Msg, gravity: Message_Gravity): void;

// Returns a Map of objects and message list
MapTransient(): NCollection_DataMap_handle_Standard_Transient_NCollection_List_Message_Msg;

// Returns a Map of shapes and message list
MapShape(): NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines kind of global parametrisation on the composite surface each patch of the 1st row and column adds its range, Ui+1 = Ui + URange(i,1), etc
ShapeExtend_Parametrisation: typeof ShapeExtend_Parametrisation[keyof typeof ShapeExtend_Parametrisation]

// This enumeration is used in ShapeHealing toolkit for representing flags in the return statuses of class methods
ShapeExtend_Status: typeof ShapeExtend_Status[keyof typeof ShapeExtend_Status]

// This class provides a data structure necessary for work with the wire as with ordered list of edges, what is required for many algorithms
ShapeExtend_WireData: declare class ShapeExtend_WireData extends Standard_Transient

constructor

// Copies data from another WireData
Init(other: ShapeExtend_WireData): void;
Init(wire: TopoDS_Wire, chained: boolean, theManifoldMode: boolean): boolean;
Init(other: ShapeExtend_WireData): void;
Init(wire: TopoDS_Wire, chained: boolean, theManifoldMode: boolean): boolean;

// Clears data about Wire
Clear(): void;

// Computes the list of seam edges By default (direct call), computing is enforced For indirect call (from IsSeam) it is redone only if not yet already done or if the list of edges has changed Remark
ComputeSeams(enforce?: boolean): void;

// Does a circular permutation in order to set <num>th edge last
SetLast(num: number): void;

// When the wire contains at least one degenerated edge, sets it as last one Note
SetDegeneratedLast(): void;

// Adds an edge to a wire, being defined (not yet ended) This is the plain, basic, function to add an edge <num> = 0 (D)
Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;
Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;
Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;
Add(edge: TopoDS_Edge, atnum: number): void;
Add(wire: TopoDS_Wire, atnum: number): void;
Add(wire: ShapeExtend_WireData, atnum: number): void;
Add(shape: TopoDS_Shape, atnum: number): void;

// Adds an edge to start or end of <me>, according to <mode> 0
AddOriented(edge: TopoDS_Edge, mode: number): void;
AddOriented(wire: TopoDS_Wire, mode: number): void;
AddOriented(shape: TopoDS_Shape, mode: number): void;
AddOriented(edge: TopoDS_Edge, mode: number): void;
AddOriented(wire: TopoDS_Wire, mode: number): void;
AddOriented(shape: TopoDS_Shape, mode: number): void;
AddOriented(edge: TopoDS_Edge, mode: number): void;
AddOriented(wire: TopoDS_Wire, mode: number): void;
AddOriented(shape: TopoDS_Shape, mode: number): void;

// Removes an Edge, given its rank
Remove(num?: number): void;

// Replaces an edge at the given rank number <num> with new one
Set(edge: TopoDS_Edge, num?: number): void;

// Reverses the sense of the list and the orientation of each Edge This method should be called when either wire has no seam edges or face is not available
Reverse(): void;
Reverse(face: TopoDS_Face): void;
Reverse(): void;
Reverse(face: TopoDS_Face): void;

// Returns the count of currently recorded edges
NbEdges(): number;

// Returns the count of currently recorded non-manifold edges
NbNonManifoldEdges(): number;

// Returns <num>th nonmanifold Edge
NonmanifoldEdge(num: number): TopoDS_Edge;

// Returns sequence of non-manifold edges This sequence can be not empty if wire data set in manifold mode but initial wire has INTERNAL orientation or contains INTERNAL edges
NonmanifoldEdges(): NCollection_HSequence_TopoDS_Shape;

// Returns mode defining manifold wire data or not
ManifoldMode(): boolean;

// Returns <num>th Edge
Edge(num: number): TopoDS_Edge;

// Returns the index of the edge If the edge is a seam the orientation is also checked Returns 0 if the edge is not found in the list
Index(edge: TopoDS_Edge): number;

// Tells if an Edge is seam (see ComputeSeams) An edge is considered as seam if it presents twice in the edge list, once as FORWARD and once as REVERSED
IsSeam(num: number): boolean;

// Makes {@link TopoDS_Wire`TopoDS_Wire`} using {@link BRep_Builder `BRep_Builder`} (just creates the {@link TopoDS_Wire`TopoDS_Wire`} object and adds all edges into it)
Wire(): TopoDS_Wire;

// Makes {@link TopoDS_Wire`TopoDS_Wire`} using BRepAPI_MakeWire
WireAPIMake(): TopoDS_Wire;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

ShapeExtend_DataMapOfShapeListOfMsg: NCollection_DataMap_TopoDS_Shape_NCollection_List_Message_Msg_TopTools_ShapeMapHasher
