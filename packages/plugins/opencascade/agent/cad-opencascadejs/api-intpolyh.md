# libcascade — IntPolyh

17 top-level symbols. Signatures are verbatim typescript.

// Auxiliary structure to represent pair of point and normal vector in this point on the surface
IntPolyh_PointNormal: declare class IntPolyh_PointNormal

constructor

Point: gp_Pnt

Normal: gp_Vec

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class represents the couple of indices with additional characteristics such as analyzed flag and an angle
IntPolyh_Couple: declare class IntPolyh_Couple

constructor

// Returns the first index
FirstValue(): number;

// Returns the second index
SecondValue(): number;

// Returns TRUE if the couple has been analyzed
IsAnalyzed(): boolean;

// Returns the angle
Angle(): number;

// Sets the triangles
SetCoupleValue(theInd1: number, theInd2: number): void;

// Sets the analyzed flag
SetAnalyzed(theAnalyzed: boolean): void;

// Sets the angle
SetAngle(theAngle: number): void;

// Returns true if the Couple is equal to <theOther>
IsEqual(theOther: IntPolyh_Couple): boolean;

Dump(v: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class represents the edge built between the two IntPolyh points
IntPolyh_Edge: declare class IntPolyh_Edge

constructor

// Returns the first point
FirstPoint(): number;

// Returns the second point
SecondPoint(): number;

// Returns the first triangle
FirstTriangle(): number;

// Returns the second triangle
SecondTriangle(): number;

// Sets the first point
SetFirstPoint(thePoint: number): void;

// Sets the second point
SetSecondPoint(thePoint: number): void;

// Sets the first triangle
SetFirstTriangle(theTriangle: number): void;

// Sets the second triangle
SetSecondTriangle(theTriangle: number): void;

Dump(v: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// API algorithm for intersection of two surfaces by intersection of their triangulations
IntPolyh_Intersection: declare class IntPolyh_Intersection

constructor

IsDone(): boolean;

IsParallel(): boolean;

NbSectionLines(): number;

NbPointsInLine(IndexLine: number): number;

NbTangentZones(): number;

NbPointsInTangentZone(argNo0: number): number;

GetLinePoint(IndexLine: number, IndexPoint: number, x?: number, y?: number, z?: number, u1?: number, v1?: number, u2?: number, v2?: number, incidence?: number): { x: number; y: number; z: number; u1: number; v1: number; u2: number; v2: number; incidence: number };

GetTangentZonePoint(IndexLine: number, IndexPoint: number, x?: number, y?: number, z?: number, u1?: number, v1?: number, u2?: number, v2?: number): { x: number; y: number; z: number; u1: number; v1: number; u2: number; v2: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class represents the point on the surface with both 3D and 2D points
IntPolyh_Point: declare class IntPolyh_Point

constructor

// Returns X coordinate of the 3D point
X(): number;

// Returns Y coordinate of the 3D point
Y(): number;

// Returns the Z coordinate of the 3D point
Z(): number;

// Returns the U coordinate of the 2D point
U(): number;

// Returns the V coordinate of the 2D point
V(): number;

// Returns 0 if the point is not common with the other surface
PartOfCommon(): number;

// Sets the point
Set(x: number, y: number, z: number, u: number, v: number, II?: number): void;

// Sets the X coordinate for the 3D point
SetX(x: number): void;

// Sets the Y coordinate for the 3D point
SetY(y: number): void;

// Sets the Z coordinate for the 3D point
SetZ(z: number): void;

// Sets the U coordinate for the 2D point
SetU(u: number): void;

// Sets the V coordinate for the 2D point
SetV(v: number): void;

// Sets the part of common
SetPartOfCommon(ii: number): void;

// Creates middle point from P1 and P2 and stores it to this
Middle(MySurface: Adaptor3d_Surface, P1: IntPolyh_Point, P2: IntPolyh_Point): void;

// Addition
Add(P1: IntPolyh_Point): IntPolyh_Point;

// Subtraction
Sub(P1: IntPolyh_Point): IntPolyh_Point;

// Division
Divide(rr: number): IntPolyh_Point;

// Multiplication
Multiplication(rr: number): IntPolyh_Point;

// Square modulus
SquareModulus(): number;

// Square distance to the other point
SquareDistance(P2: IntPolyh_Point): number;

// Dot
Dot(P2: IntPolyh_Point): number;

// Cross
Cross(P1: IntPolyh_Point, P2: IntPolyh_Point): void;

// Dump
Dump(): void;
Dump(i: number): void;
Dump(): void;
Dump(i: number): void;

// Sets the degenerated flag
SetDegenerated(theFlag: boolean): void;

// Returns the degenerated flag
Degenerated(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPolyh_SectionLine: declare class IntPolyh_SectionLine

constructor

Init(nn: number): void;

Value(nn: number): IntPolyh_StartPoint;

ChangeValue(nn: number): IntPolyh_StartPoint;

Copy(Other: IntPolyh_SectionLine): IntPolyh_SectionLine;

GetN(): number;

NbStartPoints(): number;

IncrementNbStartPoints(): void;

Destroy(): void;

Dump(): void;

Prepend(SP: IntPolyh_StartPoint): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPolyh_StartPoint: declare class IntPolyh_StartPoint

constructor

X(): number;

Y(): number;

Z(): number;

U1(): number;

V1(): number;

U2(): number;

V2(): number;

T1(): number;

E1(): number;

Lambda1(): number;

T2(): number;

E2(): number;

Lambda2(): number;

GetAngle(): number;

ChainList(): number;

GetEdgePoints(Triangle: IntPolyh_Triangle, FirstEdgePoint?: number, SecondEdgePoint?: number, LastPoint?: number): { returnValue: number; FirstEdgePoint: number; SecondEdgePoint: number; LastPoint: number };

SetXYZ(XX: number, YY: number, ZZ: number): void;

SetUV1(UU1: number, VV1: number): void;

SetUV2(UU2: number, VV2: number): void;

SetEdge1(IE1: number): void;

SetLambda1(LAM1: number): void;

SetEdge2(IE2: number): void;

SetLambda2(LAM2: number): void;

SetCoupleValue(IT1: number, IT2: number): void;

SetAngle(ang: number): void;

SetChainList(ChList: number): void;

CheckSameSP(SP: IntPolyh_StartPoint): number;

Dump(): void;
Dump(i: number): void;
Dump(): void;
Dump(i: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class provides tools for surface sampling
IntPolyh_Tools: declare class IntPolyh_Tools

constructor

// Checks if the surface can be enlarged in U or V direction
static IsEnlargePossible(theSurf: Adaptor3d_Surface, theUEnlarge?: boolean, theVEnlarge?: boolean): { theUEnlarge: boolean; theVEnlarge: boolean };

// Makes the sampling of the given surface <theSurf> making the net of <theNbSU> x <theNbSV> sampling points
static MakeSampling(theSurf: Adaptor3d_Surface, theNbSU: number, theNbSV: number, theEnlargeZone: boolean, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double): void;
// theUPars: Mutated in place
// theVPars: Mutated in place

// Computes the deflection tolerance on the surface for the given sampling
static ComputeDeflection(theSurf: Adaptor3d_Surface, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double): number;

// Fills the array <thePoints> with the points (triangulation nodes) on the surface and normal directions of the surface in these points
static FillArrayOfPointNormal(theSurf: Adaptor3d_Surface, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double, thePoints: IntPolyh_Array_IntPolyh_PointNormal): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class represents the triangle built from three IntPolyh points and three IntPolyh edges
IntPolyh_Triangle: declare class IntPolyh_Triangle

constructor

// Returns the first point
FirstPoint(): number;

// Returns the second point
SecondPoint(): number;

// Returns the third point
ThirdPoint(): number;

// Returns the first edge
FirstEdge(): number;

// Returns the orientation of the first edge
FirstEdgeOrientation(): number;

// Returns the second edge
SecondEdge(): number;

// Returns the orientation of the second edge
SecondEdgeOrientation(): number;

// Returns the third edge
ThirdEdge(): number;

// Returns the orientation of the third edge
ThirdEdgeOrientation(): number;

// Returns the deflection of the triangle
Deflection(): number;

// Returns possibility of the intersection
IsIntersectionPossible(): boolean;

// Returns true if the triangle has interfered the other triangle
HasIntersection(): boolean;

// Returns the Degenerated flag
IsDegenerated(): boolean;

// Sets the first point
SetFirstPoint(thePoint: number): void;

// Sets the second point
SetSecondPoint(thePoint: number): void;

// Sets the third point
SetThirdPoint(thePoint: number): void;

// Sets the first edge
SetFirstEdge(theEdge: number, theEdgeOrientation: number): void;

// Sets the second edge
SetSecondEdge(theEdge: number, theEdgeOrientation: number): void;

// Sets the third edge
SetThirdEdge(theEdge: number, theEdgeOrientation: number): void;

// Sets the deflection
SetDeflection(theDeflection: number): void;

// Sets the flag of possibility of intersection
SetIntersectionPossible(theIP: boolean): void;

// Sets the flag of intersection
SetIntersection(theInt: boolean): void;

// Sets the degenerated flag
SetDegenerated(theDegFlag: boolean): void;

// Gets the edge number by the index
GetEdgeNumber(theEdgeIndex: number): number;

// Sets the edge by the index
SetEdge(theEdgeIndex: number, theEdgeNumber: number): void;

// Gets the edges orientation by the index
GetEdgeOrientation(theEdgeIndex: number): number;

// Sets the edges orientation by the index
SetEdgeOrientation(theEdgeIndex: number, theEdgeOrientation: number): void;

// Computes the deflection for the triangle
ComputeDeflection(theSurface: Adaptor3d_Surface, thePoints: IntPolyh_Array_IntPolyh_Point): number;

// Gets the adjacent triangle
GetNextTriangle(theTriangle: number, theEdgeNum: number, TEdges: IntPolyh_Array_IntPolyh_Edge): number;

// Splits the triangle on two to decrease its deflection
MiddleRefinement(theTriangleNumber: number, theSurface: Adaptor3d_Surface, TPoints: IntPolyh_Array_IntPolyh_Point, TTriangles: IntPolyh_Array_IntPolyh_Triangle, TEdges: IntPolyh_Array_IntPolyh_Edge): void;

// Splits the current triangle and new triangles until the refinement criterion is not achieved
MultipleMiddleRefinement(theRefineCriterion: number, theBox: Bnd_Box, theTriangleNumber: number, theSurface: Adaptor3d_Surface, TPoints: IntPolyh_Array_IntPolyh_Point, TTriangles: IntPolyh_Array_IntPolyh_Triangle, TEdges: IntPolyh_Array_IntPolyh_Edge): void;

// Links edges to triangle
LinkEdges2Triangle(TEdges: IntPolyh_Array_IntPolyh_Edge, theEdge1: number, theEdge2: number, theEdge3: number): void;

// Sets the appropriate edge and orientation for the triangle
SetEdgeAndOrientation(theEdge: IntPolyh_Edge, theEdgeIndex: number): void;

// Returns the bounding box of the triangle
BoundingBox(thePoints: IntPolyh_Array_IntPolyh_Point): Bnd_Box;

// Dumps the contents of the triangle
Dump(v: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `IntPolyh_Array` (dynamic array of objects)
IntPolyh_Array_IntPolyh_Edge: declare class IntPolyh_Array_IntPolyh_Edge

constructor

// Copy
Copy(aOther: IntPolyh_Array_IntPolyh_Edge): IntPolyh_Array_IntPolyh_Edge;
// aOther: the array to copy from

// Init - allocate memory for <aN> items
Init(aN: number): void;
// aN: the number of items to allocate the memory

// IncrementNbItems - increment the number of stored items
IncrementNbItems(): void;

// GetN - returns the number of 'allocated' items
GetN(): number;

// NbItems - returns the number of stored items
NbItems(): number;

// set the number of stored items
SetNbItems(aNb: number): void;
// aNb: the number of stored items

// query the const value
Value(aIndex: number): IntPolyh_Edge;
// aIndex: index

// query the value
ChangeValue(aIndex: number): IntPolyh_Edge;
// aIndex: index

// dump the contents
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `IntPolyh_Array` (dynamic array of objects)
IntPolyh_Array_IntPolyh_Point: declare class IntPolyh_Array_IntPolyh_Point

constructor

// Copy
Copy(aOther: unknown): unknown;
// aOther: the array to copy from

// Init - allocate memory for <aN> items
Init(aN: number): void;
// aN: the number of items to allocate the memory

// IncrementNbItems - increment the number of stored items
IncrementNbItems(): void;

// GetN - returns the number of 'allocated' items
GetN(): number;

// NbItems - returns the number of stored items
NbItems(): number;

// set the number of stored items
SetNbItems(aNb: number): void;
// aNb: the number of stored items

// query the const value
Value(aIndex: number): IntPolyh_Point;
// aIndex: index

// query the value
ChangeValue(aIndex: number): IntPolyh_Point;
// aIndex: index

// dump the contents
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `IntPolyh_Array` (dynamic array of objects)
IntPolyh_Array_IntPolyh_PointNormal: declare class IntPolyh_Array_IntPolyh_PointNormal

constructor

// Copy
Copy(aOther: unknown): unknown;
// aOther: the array to copy from

// Init - allocate memory for <aN> items
Init(aN: number): void;
// aN: the number of items to allocate the memory

// IncrementNbItems - increment the number of stored items
IncrementNbItems(): void;

// GetN - returns the number of 'allocated' items
GetN(): number;

// NbItems - returns the number of stored items
NbItems(): number;

// set the number of stored items
SetNbItems(aNb: number): void;
// aNb: the number of stored items

// query the const value
Value(aIndex: number): IntPolyh_PointNormal;
// aIndex: index

// query the value
ChangeValue(aIndex: number): IntPolyh_PointNormal;
// aIndex: index

// dump the contents
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Class `IntPolyh_Array` (dynamic array of objects)
IntPolyh_Array_IntPolyh_Triangle: declare class IntPolyh_Array_IntPolyh_Triangle

constructor

// Copy
Copy(aOther: IntPolyh_Array_IntPolyh_Triangle): IntPolyh_Array_IntPolyh_Triangle;
// aOther: the array to copy from

// Init - allocate memory for <aN> items
Init(aN: number): void;
// aN: the number of items to allocate the memory

// IncrementNbItems - increment the number of stored items
IncrementNbItems(): void;

// GetN - returns the number of 'allocated' items
GetN(): number;

// NbItems - returns the number of stored items
NbItems(): number;

// set the number of stored items
SetNbItems(aNb: number): void;
// aNb: the number of stored items

// query the const value
Value(aIndex: number): IntPolyh_Triangle;
// aIndex: index

// query the value
ChangeValue(aIndex: number): IntPolyh_Triangle;
// aIndex: index

// dump the contents
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntPolyh_ArrayOfEdges: IntPolyh_Array_IntPolyh_Edge

IntPolyh_ArrayOfPointNormal: IntPolyh_Array_IntPolyh_PointNormal

IntPolyh_ArrayOfPoints: IntPolyh_Array_IntPolyh_Point

IntPolyh_ArrayOfTriangles: IntPolyh_Array_IntPolyh_Triangle
