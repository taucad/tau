# libcascade — IntRes2d

9 top-level symbols. Signatures are verbatim typescript.

// Definition of the domain of parameter on a 2d-curve
IntRes2d_Domain: declare class IntRes2d_Domain

constructor

// Sets the values for a bounded domain
SetValues(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number): void;
SetValues(): void;
SetValues(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean): void;
SetValues(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number): void;
SetValues(): void;
SetValues(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean): void;
SetValues(Pnt1: gp_Pnt2d, Par1: number, Tol1: number, Pnt2: gp_Pnt2d, Par2: number, Tol2: number): void;
SetValues(): void;
SetValues(Pnt: gp_Pnt2d, Par: number, Tol: number, First: boolean): void;

// Defines a closed domain
SetEquivalentParameters(zero: number, period: number): void;

// Returns True if the domain has a first point, i-e a point defining the lowest admitted parameter on the curve
HasFirstPoint(): boolean;

// Returns the parameter of the first point of the domain The exception DomainError is raised if HasFirstPoint returns False
FirstParameter(): number;

// Returns the first point of the domain
FirstPoint(): gp_Pnt2d;

// Returns the tolerance of the first (left) bound
FirstTolerance(): number;

// Returns True if the domain has a last point, i-e a point defining the highest admitted parameter on the curve
HasLastPoint(): boolean;

// Returns the parameter of the last point of the domain
LastParameter(): number;

// Returns the last point of the domain
LastPoint(): gp_Pnt2d;

// Returns the tolerance of the last (right) bound
LastTolerance(): number;

// Returns True if the domain is closed
IsClosed(): boolean;

// Returns Equivalent parameters if the domain is closed
EquivalentParameters(zero?: number, zeroplusperiod?: number): { zero: number; zeroplusperiod: number };

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines the root class of all the Intersections between two 2D-Curves, and provides all the methods about the results of the Intersections Algorithms
IntRes2d_Intersection: declare class IntRes2d_Intersection

// returns TRUE when the computation was successful
IsDone(): boolean;

// Returns TRUE if there is no intersection between the given arguments
IsEmpty(): boolean;

// This function returns the number of intersection points between the 2 curves
NbPoints(): number;

// This function returns the intersection point of range N
Point(N: number): IntRes2d_IntersectionPoint;

// This function returns the number of intersection segments between the two curves
NbSegments(): number;

// This function returns the intersection segment of range N
Segment(N: number): IntRes2d_IntersectionSegment;

SetReversedParameters(Reverseflag: boolean): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of an intersection point between two 2D curves
IntRes2d_IntersectionPoint: declare class IntRes2d_IntersectionPoint

constructor

// Sets the values for an existing intersection point
SetValues(P: gp_Pnt2d, Uc1: number, Uc2: number, Trans1: IntRes2d_Transition, Trans2: IntRes2d_Transition, ReversedFlag: boolean): void;

// Returns the value of the coordinates of the intersection point in the 2D space
Value(): gp_Pnt2d;

// Returns the parameter on the first curve
ParamOnFirst(): number;

// Returns the parameter on the second curve
ParamOnSecond(): number;

// Returns the transition of the 1st curve compared to the 2nd one
TransitionOfFirst(): IntRes2d_Transition;

// returns the transition of the 2nd curve compared to the 1st one
TransitionOfSecond(): IntRes2d_Transition;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Definition of an intersection curve between two 2D curves
IntRes2d_IntersectionSegment: declare class IntRes2d_IntersectionSegment

constructor

// Returns FALSE if the intersection segment has got the same orientation on both curves
IsOpposite(): boolean;

// Returns True if the segment is limited by a first point
HasFirstPoint(): boolean;

// Returns the first point of the segment as an IntersectionPoint (with a transition)
FirstPoint(): IntRes2d_IntersectionPoint;

// Returns True if the segment is limited by a last point
HasLastPoint(): boolean;

// Returns the last point of the segment as an IntersectionPoint (with a transition)
LastPoint(): IntRes2d_IntersectionPoint;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntRes2d_Position: typeof IntRes2d_Position[keyof typeof IntRes2d_Position]

IntRes2d_Situation: typeof IntRes2d_Situation[keyof typeof IntRes2d_Situation]

// Definition of the type of transition near an intersection point between two curves
IntRes2d_Transition: declare class IntRes2d_Transition

constructor

// Sets the values of an IN or OUT transition
SetValue(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans): void;
SetValue(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean): void;
SetValue(Pos: IntRes2d_Position): void;
SetValue(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans): void;
SetValue(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean): void;
SetValue(Pos: IntRes2d_Position): void;
SetValue(Tangent: boolean, Pos: IntRes2d_Position, Type: IntRes2d_TypeTrans): void;
SetValue(Tangent: boolean, Pos: IntRes2d_Position, Situ: IntRes2d_Situation, Oppos: boolean): void;
SetValue(Pos: IntRes2d_Position): void;

// Sets the value of the position
SetPosition(Pos: IntRes2d_Position): void;

// Indicates if the intersection is at the beginning (IntRes2d_Head), at the end (IntRes2d_End), or in the middle (IntRes2d_Middle) of the curve
PositionOnCurve(): IntRes2d_Position;

// Returns the type of transition at the intersection
TransitionType(): IntRes2d_TypeTrans;

// Returns TRUE when the 2 curves are tangent at the intersection point
IsTangent(): boolean;

// returns a significant value if TransitionType returns TOUCH
Situation(): IntRes2d_Situation;

// returns a significant value if TransitionType returns TOUCH
IsOpposite(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntRes2d_TypeTrans: typeof IntRes2d_TypeTrans[keyof typeof IntRes2d_TypeTrans]

IntRes2d_SequenceOfIntersectionPoint: NCollection_Sequence_IntRes2d_IntersectionPoint
