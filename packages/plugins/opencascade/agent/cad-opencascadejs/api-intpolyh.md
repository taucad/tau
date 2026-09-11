# libcascade — IntPolyh

17 top-level symbols. Signatures are verbatim typescript.

IntPolyh_PointNormal: declare class IntPolyh_PointNormal

constructor

Point: gp_Pnt

Normal: gp_Vec

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Couple: declare class IntPolyh_Couple

constructor

FirstValue(): number;

SecondValue(): number;

IsAnalyzed(): boolean;

Angle(): number;

SetCoupleValue(theInd1: number, theInd2: number): void;

SetAnalyzed(theAnalyzed: boolean): void;

SetAngle(theAngle: number): void;

IsEqual(theOther: IntPolyh_Couple): boolean;

Dump(v: number): void;

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Edge: declare class IntPolyh_Edge

constructor

FirstPoint(): number;

SecondPoint(): number;

FirstTriangle(): number;

SecondTriangle(): number;

SetFirstPoint(thePoint: number): void;

SetSecondPoint(thePoint: number): void;

SetFirstTriangle(theTriangle: number): void;

SetSecondTriangle(theTriangle: number): void;

Dump(v: number): void;

delete(): void;

[Symbol.dispose](): void;

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

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Point: declare class IntPolyh_Point

constructor

X(): number;

Y(): number;

Z(): number;

U(): number;

V(): number;

PartOfCommon(): number;

Set(x: number, y: number, z: number, u: number, v: number, II?: number): void;

SetX(x: number): void;

SetY(y: number): void;

SetZ(z: number): void;

SetU(u: number): void;

SetV(v: number): void;

SetPartOfCommon(ii: number): void;

Middle(MySurface: Adaptor3d_Surface, P1: IntPolyh_Point, P2: IntPolyh_Point): void;

Add(P1: IntPolyh_Point): IntPolyh_Point;

Sub(P1: IntPolyh_Point): IntPolyh_Point;

Divide(rr: number): IntPolyh_Point;

Multiplication(rr: number): IntPolyh_Point;

SquareModulus(): number;

SquareDistance(P2: IntPolyh_Point): number;

Dot(P2: IntPolyh_Point): number;

Cross(P1: IntPolyh_Point, P2: IntPolyh_Point): void;

Dump(): void;
Dump(i: number): void;
Dump(): void;
Dump(i: number): void;

SetDegenerated(theFlag: boolean): void;

Degenerated(): boolean;

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

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Tools: declare class IntPolyh_Tools

constructor

static IsEnlargePossible(theSurf: Adaptor3d_Surface, theUEnlarge?: boolean, theVEnlarge?: boolean): { theUEnlarge: boolean; theVEnlarge: boolean };

static MakeSampling(theSurf: Adaptor3d_Surface, theNbSU: number, theNbSV: number, theEnlargeZone: boolean, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double): void;

static ComputeDeflection(theSurf: Adaptor3d_Surface, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double): number;

static FillArrayOfPointNormal(theSurf: Adaptor3d_Surface, theUPars: NCollection_Array1_double, theVPars: NCollection_Array1_double, thePoints: IntPolyh_Array_IntPolyh_PointNormal): void;

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Triangle: declare class IntPolyh_Triangle

constructor

FirstPoint(): number;

SecondPoint(): number;

ThirdPoint(): number;

FirstEdge(): number;

FirstEdgeOrientation(): number;

SecondEdge(): number;

SecondEdgeOrientation(): number;

ThirdEdge(): number;

ThirdEdgeOrientation(): number;

Deflection(): number;

IsIntersectionPossible(): boolean;

HasIntersection(): boolean;

IsDegenerated(): boolean;

SetFirstPoint(thePoint: number): void;

SetSecondPoint(thePoint: number): void;

SetThirdPoint(thePoint: number): void;

SetFirstEdge(theEdge: number, theEdgeOrientation: number): void;

SetSecondEdge(theEdge: number, theEdgeOrientation: number): void;

SetThirdEdge(theEdge: number, theEdgeOrientation: number): void;

SetDeflection(theDeflection: number): void;

SetIntersectionPossible(theIP: boolean): void;

SetIntersection(theInt: boolean): void;

SetDegenerated(theDegFlag: boolean): void;

GetEdgeNumber(theEdgeIndex: number): number;

SetEdge(theEdgeIndex: number, theEdgeNumber: number): void;

GetEdgeOrientation(theEdgeIndex: number): number;

SetEdgeOrientation(theEdgeIndex: number, theEdgeOrientation: number): void;

ComputeDeflection(theSurface: Adaptor3d_Surface, thePoints: IntPolyh_Array_IntPolyh_Point): number;

GetNextTriangle(theTriangle: number, theEdgeNum: number, TEdges: IntPolyh_Array_IntPolyh_Edge): number;

MiddleRefinement(theTriangleNumber: number, theSurface: Adaptor3d_Surface, TPoints: IntPolyh_Array_IntPolyh_Point, TTriangles: IntPolyh_Array_IntPolyh_Triangle, TEdges: IntPolyh_Array_IntPolyh_Edge): void;

MultipleMiddleRefinement(theRefineCriterion: number, theBox: Bnd_Box, theTriangleNumber: number, theSurface: Adaptor3d_Surface, TPoints: IntPolyh_Array_IntPolyh_Point, TTriangles: IntPolyh_Array_IntPolyh_Triangle, TEdges: IntPolyh_Array_IntPolyh_Edge): void;

LinkEdges2Triangle(TEdges: IntPolyh_Array_IntPolyh_Edge, theEdge1: number, theEdge2: number, theEdge3: number): void;

SetEdgeAndOrientation(theEdge: IntPolyh_Edge, theEdgeIndex: number): void;

BoundingBox(thePoints: IntPolyh_Array_IntPolyh_Point): Bnd_Box;

Dump(v: number): void;

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_Edge: declare class IntPolyh_Array_IntPolyh_Edge

constructor

Copy(aOther: IntPolyh_Array_IntPolyh_Edge): IntPolyh_Array_IntPolyh_Edge;

Init(aN: number): void;

IncrementNbItems(): void;

GetN(): number;

NbItems(): number;

SetNbItems(aNb: number): void;

Value(aIndex: number): IntPolyh_Edge;

ChangeValue(aIndex: number): IntPolyh_Edge;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_Point: declare class IntPolyh_Array_IntPolyh_Point

constructor

Copy(aOther: unknown): unknown;

Init(aN: number): void;

IncrementNbItems(): void;

GetN(): number;

NbItems(): number;

SetNbItems(aNb: number): void;

Value(aIndex: number): IntPolyh_Point;

ChangeValue(aIndex: number): IntPolyh_Point;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_PointNormal: declare class IntPolyh_Array_IntPolyh_PointNormal

constructor

Copy(aOther: unknown): unknown;

Init(aN: number): void;

IncrementNbItems(): void;

GetN(): number;

NbItems(): number;

SetNbItems(aNb: number): void;

Value(aIndex: number): IntPolyh_PointNormal;

ChangeValue(aIndex: number): IntPolyh_PointNormal;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

IntPolyh_Array_IntPolyh_Triangle: declare class IntPolyh_Array_IntPolyh_Triangle

constructor

Copy(aOther: IntPolyh_Array_IntPolyh_Triangle): IntPolyh_Array_IntPolyh_Triangle;

Init(aN: number): void;

IncrementNbItems(): void;

GetN(): number;

NbItems(): number;

SetNbItems(aNb: number): void;

Value(aIndex: number): IntPolyh_Triangle;

ChangeValue(aIndex: number): IntPolyh_Triangle;

Dump(): void;

delete(): void;

[Symbol.dispose](): void;

IntPolyh_ArrayOfEdges: IntPolyh_Array_IntPolyh_Edge

IntPolyh_ArrayOfPointNormal: IntPolyh_Array_IntPolyh_PointNormal

IntPolyh_ArrayOfPoints: IntPolyh_Array_IntPolyh_Point

IntPolyh_ArrayOfTriangles: IntPolyh_Array_IntPolyh_Triangle
