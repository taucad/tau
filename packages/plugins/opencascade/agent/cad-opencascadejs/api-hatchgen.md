# libcascade — HatchGen

6 top-level symbols. Signatures are verbatim typescript.

HatchGen_Domain: declare class HatchGen_Domain

constructor

// Sets the first and the second points of the domain
SetPoints(P1: HatchGen_PointOnHatching, P2: HatchGen_PointOnHatching): void;
SetPoints(): void;
SetPoints(P1: HatchGen_PointOnHatching, P2: HatchGen_PointOnHatching): void;
SetPoints(): void;

// Sets the first point of the domain
SetFirstPoint(P: HatchGen_PointOnHatching): void;
SetFirstPoint(): void;
SetFirstPoint(P: HatchGen_PointOnHatching): void;
SetFirstPoint(): void;

// Sets the second point of the domain
SetSecondPoint(P: HatchGen_PointOnHatching): void;
SetSecondPoint(): void;
SetSecondPoint(P: HatchGen_PointOnHatching): void;
SetSecondPoint(): void;

// Returns True if the domain has a first point
HasFirstPoint(): boolean;

// Returns the first point of the domain
FirstPoint(): HatchGen_PointOnHatching;

// Returns True if the domain has a second point
HasSecondPoint(): boolean;

// Returns the second point of the domain
SecondPoint(): HatchGen_PointOnHatching;

// Dump of the domain
Dump(Index?: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Error status
HatchGen_ErrorStatus: typeof HatchGen_ErrorStatus[keyof typeof HatchGen_ErrorStatus]

HatchGen_IntersectionPoint: declare class HatchGen_IntersectionPoint

// Sets the index of the supporting curve
SetIndex(Index: number): void;

// Returns the index of the supporting curve
Index(): number;

// Sets the parameter on the curve
SetParameter(Parameter: number): void;

// Returns the parameter on the curve
Parameter(): number;

// Sets the position of the point on the curve
SetPosition(Position: TopAbs_Orientation): void;

// Returns the position of the point on the curve
Position(): TopAbs_Orientation;

// Sets the transition state before the intersection
SetStateBefore(State: TopAbs_State): void;

// Returns the transition state before the intersection
StateBefore(): TopAbs_State;

// Sets the transition state after the intersection
SetStateAfter(State: TopAbs_State): void;

// Returns the transition state after of the intersection
StateAfter(): TopAbs_State;

// Sets the flag that the point is the beginning of a segment
SetSegmentBeginning(State?: boolean): void;

// Returns the flag that the point is the beginning of a segment
SegmentBeginning(): boolean;

// Sets the flag that the point is the end of a segment
SetSegmentEnd(State?: boolean): void;

// Returns the flag that the point is the end of a segment
SegmentEnd(): boolean;

// Dump of the point on element
Dump(Index?: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Intersection type between the hatching and the element
HatchGen_IntersectionType: typeof HatchGen_IntersectionType[keyof typeof HatchGen_IntersectionType]

HatchGen_PointOnElement: declare class HatchGen_PointOnElement extends HatchGen_IntersectionPoint

constructor

// Sets the intersection type at this point
SetIntersectionType(Type: HatchGen_IntersectionType): void;

// Returns the intersection type at this point
IntersectionType(): HatchGen_IntersectionType;

// Tests if the point is identical to an other
IsIdentical(Point: HatchGen_PointOnElement, Confusion: number): boolean;

// Tests if the point is different from an other
IsDifferent(Point: HatchGen_PointOnElement, Confusion: number): boolean;

// Dump of the point on element
Dump(Index?: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

HatchGen_PointOnHatching: declare class HatchGen_PointOnHatching extends HatchGen_IntersectionPoint

constructor

// Adds a point on element to the point
AddPoint(Point: HatchGen_PointOnElement, Confusion: number): void;

// Returns the number of elements intersecting the hatching at this point
NbPoints(): number;

// Returns the Index-th point on element of the point
Point(Index: number): HatchGen_PointOnElement;

// Removes the Index-th point on element of the point
RemPoint(Index: number): void;

// Removes all the points on element of the point
ClrPoints(): void;

// Tests if the point is lower than an other
IsLower(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

// Tests if the point is equal to an other
IsEqual(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

// Tests if the point is greater than an other
IsGreater(Point: HatchGen_PointOnHatching, Confusion: number): boolean;

// Dump of the point
Dump(Index?: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
