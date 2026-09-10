# libcascade — Geom2dHatch

6 top-level symbols. Signatures are verbatim typescript.

Geom2dHatch_Classifier: declare class Geom2dHatch_Classifier

constructor

// Returns the result of the classification
State(): TopAbs_State;

// Returns True when the state was computed by a rejection
Rejected(): boolean;

// Returns True if the face contains no wire
NoWires(): boolean;

// Returns the Edge used to determine the classification
Edge(): Geom2dAdaptor_Curve;

// Returns the parameter on `Edge()` used to determine the classification
EdgeParameter(): number;

// Returns the position of the point on the edge returned by Edge
Position(): IntRes2d_Position;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dHatch_Element: declare class Geom2dHatch_Element

constructor

// Returns the curve associated to the element
Curve(): Geom2dAdaptor_Curve;

// Returns the curve associated to the element
ChangeCurve(): Geom2dAdaptor_Curve;

// Sets the orientation of the element
Orientation(Orientation: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;
Orientation(Orientation: TopAbs_Orientation): void;
Orientation(): TopAbs_Orientation;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dHatch_FClass2dOfClassifier: declare class Geom2dHatch_FClass2dOfClassifier

constructor

// Starts a classification process
Reset(L: gp_Lin2d, P: number, Tol: number): void;

// Updates the classification process with the edge <E> from the boundary
Compare(E: Geom2dAdaptor_Curve, Or: TopAbs_Orientation): void;

// Returns the current value of the parameter
Parameter(): number;

// Returns the intersecting algorithm
Intersector(): Geom2dHatch_Intersector;

// Returns 0 if the last compared edge had no relevant intersection
ClosestIntersection(): number;

// Returns the current state of the point
State(): TopAbs_State;

// Returns the true if the closest intersection point represents head or end of the edge
IsHeadOrEnd(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dHatch_Hatcher: declare class Geom2dHatch_Hatcher

constructor

// Sets the associated intersector
Intersector(Intersector: Geom2dHatch_Intersector): void;
Intersector(): Geom2dHatch_Intersector;
Intersector(Intersector: Geom2dHatch_Intersector): void;
Intersector(): Geom2dHatch_Intersector;

// Returns the associated intersector
ChangeIntersector(): Geom2dHatch_Intersector;

// Sets the confusion tolerance
Confusion2d(Confusion: number): void;
Confusion2d(): number;
Confusion2d(Confusion: number): void;
Confusion2d(): number;

// Sets the confusion tolerance
Confusion3d(Confusion: number): void;
Confusion3d(): number;
Confusion3d(Confusion: number): void;
Confusion3d(): number;

// Sets the above flag
KeepPoints(Keep: boolean): void;
KeepPoints(): boolean;
KeepPoints(Keep: boolean): void;
KeepPoints(): boolean;

// Sets the above flag
KeepSegments(Keep: boolean): void;
KeepSegments(): boolean;
KeepSegments(Keep: boolean): void;
KeepSegments(): boolean;

// Removes all the hatchings and all the elements
Clear(): void;

// Returns the curve associated to the IndE-th element
ElementCurve(IndE: number): Geom2dAdaptor_Curve;

// Adds an element to the hatcher and returns its index
AddElement(Curve: Geom2dAdaptor_Curve, Orientation: TopAbs_Orientation): number;
AddElement(Curve: Geom2d_Curve, Orientation: TopAbs_Orientation): number;
AddElement(Curve: Geom2dAdaptor_Curve, Orientation: TopAbs_Orientation): number;
AddElement(Curve: Geom2d_Curve, Orientation: TopAbs_Orientation): number;

// Removes the IndE-th element from the hatcher
RemElement(IndE: number): void;

// Removes all the elements from the hatcher
ClrElements(): void;

// Returns the curve associated to the IndH-th hatching
HatchingCurve(IndH: number): Geom2dAdaptor_Curve;

// Adds a hatching to the hatcher and returns its index
AddHatching(Curve: Geom2dAdaptor_Curve): number;

// Removes the IndH-th hatching from the hatcher
RemHatching(IndH: number): void;

// Removes all the hatchings from the hatcher
ClrHatchings(): void;

// Returns the number of intersection points of the IndH-th hatching
NbPoints(IndH: number): number;

// Returns the IndP-th intersection point of the IndH-th hatching
Point(IndH: number, IndP: number): HatchGen_PointOnHatching;

// Trims all the hatchings of the hatcher by all the elements of the hatcher
Trim(): void;
Trim(Curve: Geom2dAdaptor_Curve): number;
Trim(IndH: number): void;
Trim(): void;
Trim(Curve: Geom2dAdaptor_Curve): number;
Trim(IndH: number): void;
Trim(): void;
Trim(Curve: Geom2dAdaptor_Curve): number;
Trim(IndH: number): void;

// Computes the domains of all the hatchings
ComputeDomains(): void;
ComputeDomains(IndH: number): void;
ComputeDomains(): void;
ComputeDomains(IndH: number): void;

// Returns the fact that the intersections were computed for the IndH-th hatching
TrimDone(IndH: number): boolean;

// Returns the fact that the intersections failed for the IndH-th hatching
TrimFailed(IndH: number): boolean;

// Returns the status about the IndH-th hatching
Status(IndH: number): HatchGen_ErrorStatus;

// Returns the number of domains of the IndH-th hatching
NbDomains(IndH: number): number;

// Returns the IDom-th domain of the IndH-th hatching
Domain(IndH: number, IDom: number): HatchGen_Domain;

// Dump the hatcher
Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dHatch_Hatching: declare class Geom2dHatch_Hatching

constructor

// Returns the curve associated to the hatching
Curve(): Geom2dAdaptor_Curve;

// Returns the curve associated to the hatching
ChangeCurve(): Geom2dAdaptor_Curve;

// Sets the flag about the trimming computations to the given value
TrimDone(Flag: boolean): void;
TrimDone(): boolean;
TrimDone(Flag: boolean): void;
TrimDone(): boolean;

// Sets the flag about the trimming failure to the given value
TrimFailed(Flag: boolean): void;
TrimFailed(): boolean;
TrimFailed(Flag: boolean): void;
TrimFailed(): boolean;

// Sets the flag about the domains computation to the given value
IsDone(Flag: boolean): void;
IsDone(): boolean;
IsDone(Flag: boolean): void;
IsDone(): boolean;

// Sets the error status
Status(theStatus: HatchGen_ErrorStatus): void;
Status(): HatchGen_ErrorStatus;
Status(theStatus: HatchGen_ErrorStatus): void;
Status(): HatchGen_ErrorStatus;

// Adds an intersection point to the hatching
AddPoint(Point: HatchGen_PointOnHatching, Confusion: number): void;

// Returns the number of intersection points of the hatching
NbPoints(): number;

// Returns the Index-th intersection point of the hatching
Point(Index: number): HatchGen_PointOnHatching;

// Returns the Index-th intersection point of the hatching
ChangePoint(Index: number): HatchGen_PointOnHatching;

// Removes the Index-th intersection point of the hatching
RemPoint(Index: number): void;

// Removes all the intersection points of the hatching
ClrPoints(): void;

// Adds a domain to the hatching
AddDomain(Domain: HatchGen_Domain): void;

// Returns the number of domains of the hatching
NbDomains(): number;

// Returns the Index-th domain of the hatching
Domain(Index: number): HatchGen_Domain;

// Removes the Index-th domain of the hatching
RemDomain(Index: number): void;

// Removes all the domains of the hatching
ClrDomains(): void;

// Returns a point on the curve
ClassificationPoint(): gp_Pnt2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Geom2dHatch_Intersector: declare class Geom2dHatch_Intersector extends Geom2dInt_GInter

constructor

// Returns the confusion tolerance of the intersector
ConfusionTolerance(): number;

// Sets the confusion tolerance of the intersector
SetConfusionTolerance(Confusion: number): void;

// Returns the tangency tolerance of the intersector
TangencyTolerance(): number;

// Sets the tangency tolerance of the intersector
SetTangencyTolerance(Tangency: number): void;

// Intersects the curves C1 and C2
Intersect(C1: Geom2dAdaptor_Curve, C2: Geom2dAdaptor_Curve): void;

// Performs the intersection between the 2d line segment (<L>,
Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(L: gp_Lin2d, P: number, Tol: number, E: Geom2dAdaptor_Curve): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, D1: IntRes2d_Domain, C2: Adaptor2d_Curve2d, TolConf: number, Tol: number): void;
Perform(C1: Adaptor2d_Curve2d, C2: Adaptor2d_Curve2d, D2: IntRes2d_Domain, TolConf: number, Tol: number): void;

// Returns in <T>, <N> and `the tangent, normal and curvature of the edge <E> at parameter value .`
LocalGeometry(E: Geom2dAdaptor_Curve, U: number, T: gp_Dir2d, N: gp_Dir2d, C?: number): { C: number };
// T: Mutated in place
// N: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
