# libcascade — ShapeFix (2)

7 top-level symbols. Signatures are verbatim typescript.

// Root class for fixing operations Provides context for recording changes (optional), basic precision value and limit (minimal and maximal) values for tolerances, and message registrator
ShapeFix_Root: declare class ShapeFix_Root extends Standard_Transient

constructor

// Copy all fields from another Root object
Set(Root: ShapeFix_Root): void;

// Sets context
SetContext(context: ShapeBuild_ReShape): void;

// Returns context
Context(): ShapeBuild_ReShape;

// Sets message registrator
SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

// Returns message registrator
MsgRegistrator(): ShapeExtend_BasicMsgRegistrator;

// Sets basic precision value
SetPrecision(preci: number): void;

// Returns basic precision value
Precision(): number;

// Sets minimal allowed tolerance
SetMinTolerance(mintol: number): void;

// Returns minimal allowed tolerance
MinTolerance(): number;

// Sets maximal allowed tolerance
SetMaxTolerance(maxtol: number): void;

// Returns maximal allowed tolerance
MaxTolerance(): number;

// Returns tolerance limited by [myMinTol,myMaxTol]
LimitTolerance(toler: number): number;

// Sends a message to be attached to the shape
SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
SendMsg(message: Message_Msg, gravity: Message_Gravity): void;
SendMsg(shape: TopoDS_Shape, message: Message_Msg, gravity: Message_Gravity): void;
SendMsg(message: Message_Msg, gravity: Message_Gravity): void;

// Sends a warning to be attached to the shape
SendWarning(shape: TopoDS_Shape, message: Message_Msg): void;
SendWarning(message: Message_Msg): void;
SendWarning(shape: TopoDS_Shape, message: Message_Msg): void;
SendWarning(message: Message_Msg): void;

// Sends a fail to be attached to the shape
SendFail(shape: TopoDS_Shape, message: Message_Msg): void;
SendFail(message: Message_Msg): void;
SendFail(shape: TopoDS_Shape, message: Message_Msg): void;
SendFail(message: Message_Msg): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Fixing shape in general
ShapeFix_Shape: declare class ShapeFix_Shape extends ShapeFix_Root

constructor

// Initislises by shape
Init(shape: TopoDS_Shape): void;

// Iterates on sub- shape and performs fixes
Perform(theProgress?: Message_ProgressRange): boolean;

// Returns resulting shape
Shape(): TopoDS_Shape;

// Returns tool for fixing solids
FixSolidTool(): ShapeFix_Solid;

// Returns tool for fixing shells
FixShellTool(): ShapeFix_Shell;

// Returns tool for fixing faces
FixFaceTool(): ShapeFix_Face;

// Returns tool for fixing wires
FixWireTool(): ShapeFix_Wire;

// Returns tool for fixing edges
FixEdgeTool(): ShapeFix_Edge;

// Returns the status of the last Fix
Status(status: ShapeExtend_Status): boolean;

// Sets message registrator
SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

// Sets basic precision value (also to FixSolidTool)
SetPrecision(preci: number): void;

// Sets minimal allowed tolerance (also to FixSolidTool)
SetMinTolerance(mintol: number): void;

// Sets maximal allowed tolerance (also to FixSolidTool)
SetMaxTolerance(maxtol: number): void;

// Returns (modifiable) the mode for applying fixes of {@link ShapeFix_Solid`ShapeFix_Solid`}, by default True
FixSolidMode(): number;

// Returns (modifiable) the mode for applying fixes of {@link ShapeFix_Shell`ShapeFix_Shell`}, by default True
FixFreeShellMode(): number;

// Returns (modifiable) the mode for applying fixes of {@link ShapeFix_Face`ShapeFix_Face`}, by default True
FixFreeFaceMode(): number;

// Returns (modifiable) the mode for applying fixes of {@link ShapeFix_Wire`ShapeFix_Wire`}, by default True
FixFreeWireMode(): number;

// Returns (modifiable) the mode for applying `ShapeFix::SameParameter` after all fixes, by default True
FixSameParameterMode(): number;

// Returns (modifiable) the mode for applying `ShapeFix::FixVertexPosition` before all fixes, by default False
FixVertexPositionMode(): number;

// Returns (modifiable) the mode for fixing tolerances of vertices on whole shape after performing all fixes
FixVertexTolMode(): number;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Modifies tolerances of sub-shapes (vertices, edges, faces)
ShapeFix_ShapeTolerance: declare class ShapeFix_ShapeTolerance

constructor

// Limits tolerances in a shape as follows
LimitTolerance(shape: TopoDS_Shape, tmin: number, tmax?: number, styp?: TopAbs_ShapeEnum): boolean;

// Sets (enforces) tolerances in a shape to the given value styp = VERTEX
SetTolerance(shape: TopoDS_Shape, preci: number, styp?: TopAbs_ShapeEnum): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Fixing orientation of faces in shell
ShapeFix_Shell: declare class ShapeFix_Shell extends ShapeFix_Root

constructor

// Initializes by shell
Init(shell: TopoDS_Shell): void;

// Iterates on subshapes and performs fixes (for each face calls `ShapeFix_Face::Perform` and then calls FixFaceOrientation)
Perform(theProgress?: Message_ProgressRange): boolean;

// Fixes orientation of faces in shell
FixFaceOrientation(shell: TopoDS_Shell, isAccountMultiConex?: boolean, NonManifold?: boolean): boolean;

// Returns fixed shell (or subset of oriented faces)
Shell(): TopoDS_Shell;

// In case of multiconnexity returns compound of fixed shells else returns one shell.
Shape(): TopoDS_Shape;

// Returns Number of obtainrd shells;
NbShells(): number;

// Returns not oriented subset of faces
ErrorFaces(): TopoDS_Compound;

// Returns the status of the last Fix
Status(status: ShapeExtend_Status): boolean;

// Returns tool for fixing faces
FixFaceTool(): ShapeFix_Face;

// Sets message registrator
SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

// Sets basic precision value (also to FixWireTool)
SetPrecision(preci: number): void;

// Sets minimal allowed tolerance (also to FixWireTool)
SetMinTolerance(mintol: number): void;

// Sets maximal allowed tolerance (also to FixWireTool)
SetMaxTolerance(maxtol: number): void;

// Returns (modifiable) the mode for applying fixes of {@link ShapeFix_Face`ShapeFix_Face`}, by default True
FixFaceMode(): number;

// Returns (modifiable) the mode for applying FixFaceOrientation, by default True
FixOrientationMode(): number;

// Sets NonManifold flag
SetNonManifoldFlag(isNonManifold: boolean): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides method to build a solid from a shells and orients them in order to have a valid solid with finite volume
ShapeFix_Solid: declare class ShapeFix_Solid extends ShapeFix_Root

constructor

// Initializes by solid
Init(solid: TopoDS_Solid): void;

// Iterates on shells and performs fixes (calls {@link ShapeFix_Shell`ShapeFix_Shell`} for each subshell)
Perform(theProgress?: Message_ProgressRange): boolean;

// Calls MakeSolid and orients the solid to be "not infinite"
SolidFromShell(shell: TopoDS_Shell): TopoDS_Solid;

// Returns the status of the last Fix
Status(status: ShapeExtend_Status): boolean;

// Returns resulting solid
Solid(): TopoDS_Shape;

// Returns tool for fixing shells
FixShellTool(): ShapeFix_Shell;

// Sets message registrator
SetMsgRegistrator(msgreg: ShapeExtend_BasicMsgRegistrator): void;

// Sets basic precision value (also to FixShellTool)
SetPrecision(preci: number): void;

// Sets minimal allowed tolerance (also to FixShellTool)
SetMinTolerance(mintol: number): void;

// Sets maximal allowed tolerance (also to FixShellTool)
SetMaxTolerance(maxtol: number): void;

// Returns (modifiable) the mode for applying fixes of {@link ShapeFix_Shell`ShapeFix_Shell`}, by default True
FixShellMode(): number;

// Returns (modifiable) the mode for applying analysis and fixes of orientation of shells in the solid
FixShellOrientationMode(): number;

// Returns (modifiable) the mode for creation of solids
CreateOpenSolidMode(): boolean;

// In case of multiconnexity returns compound of fixed solids else returns one solid
Shape(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Two wires have common vertex - this case is valid in BRep model and isn't valid in STEP => before writing into STEP it is necessary to split this vertex (each wire must has one vertex)
ShapeFix_SplitCommonVertex: declare class ShapeFix_SplitCommonVertex extends ShapeFix_Root

constructor

Init(S: TopoDS_Shape): void;

Perform(): void;

Shape(): TopoDS_Shape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Tool for splitting and cutting edges
ShapeFix_SplitTool: declare class ShapeFix_SplitTool

constructor

// Split edge on two new edges using new vertex "vert" and "param" - parameter for splitting The "face" is necessary for pcurves and using TransferParameterProj
SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, param1: number, param2: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, fp: number, V1: TopoDS_Vertex, lp: number, V2: TopoDS_Vertex, face: TopoDS_Face, SeqE: NCollection_Sequence_TopoDS_Shape, aNum: number, context: ShapeBuild_ReShape, tol3d: number, tol2d: number): { returnValue: boolean; aNum: number };
SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, param1: number, param2: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, fp: number, V1: TopoDS_Vertex, lp: number, V2: TopoDS_Vertex, face: TopoDS_Face, SeqE: NCollection_Sequence_TopoDS_Shape, aNum: number, context: ShapeBuild_ReShape, tol3d: number, tol2d: number): { returnValue: boolean; aNum: number };
SplitEdge(edge: TopoDS_Edge, param: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, param1: number, param2: number, vert: TopoDS_Vertex, face: TopoDS_Face, newE1: TopoDS_Edge, newE2: TopoDS_Edge, tol3d: number, tol2d: number): boolean;
SplitEdge(edge: TopoDS_Edge, fp: number, V1: TopoDS_Vertex, lp: number, V2: TopoDS_Vertex, face: TopoDS_Face, SeqE: NCollection_Sequence_TopoDS_Shape, aNum: number, context: ShapeBuild_ReShape, tol3d: number, tol2d: number): { returnValue: boolean; aNum: number };
// newE1: Mutated in place
// newE2: Mutated in place

// Cut edge by parameters pend and cut
CutEdge(edge: TopoDS_Edge, pend: number, cut: number, face: TopoDS_Face, iscutline?: boolean): { returnValue: boolean; iscutline: boolean };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
