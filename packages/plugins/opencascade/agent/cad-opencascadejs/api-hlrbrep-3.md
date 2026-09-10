# libcascade — HLRBRep (3)

8 top-level symbols. Signatures are verbatim typescript.

HLRBRep_ThePolygonToolOfInterCSurf: declare class HLRBRep_ThePolygonToolOfInterCSurf

constructor

// Give the bounding box of the polygon
static Bounding(thePolygon: HLRBRep_ThePolygonOfInterCSurf): Bnd_Box;

static DeflectionOverEstimation(thePolygon: HLRBRep_ThePolygonOfInterCSurf): number;

static Closed(thePolygon: HLRBRep_ThePolygonOfInterCSurf): boolean;

static NbSegments(thePolygon: HLRBRep_ThePolygonOfInterCSurf): number;

// Give the point of range Index in the Polygon
static BeginOfSeg(thePolygon: HLRBRep_ThePolygonOfInterCSurf, Index: number): gp_Pnt;

// Give the point of range Index in the Polygon
static EndOfSeg(thePolygon: HLRBRep_ThePolygonOfInterCSurf, Index: number): gp_Pnt;

static Dump(thePolygon: HLRBRep_ThePolygonOfInterCSurf): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_ThePolyhedronToolOfInterCSurf: declare class HLRBRep_ThePolyhedronToolOfInterCSurf

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheProjPCurOfCInter: declare class HLRBRep_TheProjPCurOfCInter

constructor

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheQuadCurvExactInterCSurf: declare class HLRBRep_TheQuadCurvExactInterCSurf

IsDone(): boolean;

NbRoots(): number;

Root(Index: number): number;

NbIntervals(): number;

// U1 and U2 are the parameters of a segment on the curve
Intervals(Index: number, U1?: number, U2?: number): { U1: number; U2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf: declare class HLRBRep_TheQuadCurvFuncOfTheQuadCurvExactInterCSurf extends math_FunctionWithDerivative

constructor

// Computes the value of the signed distance between the implicit surface and the point at parameter Param on the parametrised curve
Value(X: number, F: number): { returnValue: boolean; F: number };

// Computes the derivative of the previous function at parameter Param
Derivative(X: number, D: number): { returnValue: boolean; D: number };

// Computes the value and the derivative of the function
Values(X: number, F: number, D: number): { returnValue: boolean; F: number; D: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Identifies the type of resulting edge of {@link HLRBRep_Algo`HLRBRep_Algo`}
HLRBRep_TypeOfResultingEdge: typeof HLRBRep_TypeOfResultingEdge[keyof typeof HLRBRep_TypeOfResultingEdge]

HLRBRep_VertexList: declare class HLRBRep_VertexList

// Returns True when the curve is periodic
IsPeriodic(): boolean;

// Returns True when there are more vertices
More(): boolean;

// Proceeds to the next vertex
Next(): void;

// Returns the current vertex
Current(): HLRAlgo_Intersection;

// Returns True if the current vertex is on the boundary of the edge
IsBoundary(): boolean;

// Returns True if the current vertex is an interference
IsInterference(): boolean;

// Returns the orientation of the current vertex if it is on the boundary of the edge
Orientation(): TopAbs_Orientation;

// Returns the transition of the current vertex if it is an interference
Transition(): TopAbs_Orientation;

// Returns the transition of the current vertex relative to the boundary if it is an interference
BoundaryTransition(): TopAbs_Orientation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HLRBRep_SeqOfShapeBounds: NCollection_Sequence_HLRBRep_ShapeBounds
