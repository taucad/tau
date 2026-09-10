# libcascade — BRep (2)

19 top-level symbols. Signatures are verbatim typescript.

// Representation of a curve by a 3D curve
BRep_Curve3D: declare class BRep_Curve3D extends BRep_GCurve

constructor

// Computes the point at parameter U
D0(U: number, P: gp_Pnt): void;
// P: Mutated in place

// Returns True
IsCurve3D(): boolean;

Curve3D(): Geom_Curve;
Curve3D(C: Geom_Curve): void;
Curve3D(): Geom_Curve;
Curve3D(C: Geom_Curve): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a continuity between two surfaces
BRep_CurveOn2Surfaces: declare class BRep_CurveOn2Surfaces extends BRep_CurveRepresentation

constructor

// Returns True
IsRegularity(): boolean;
IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
IsRegularity(): boolean;
IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

// Raises an error
D0(U: number, P: gp_Pnt): void;
// P: Mutated in place

Surface(): Geom_Surface;

Surface2(): Geom_Surface;

Location2(): TopLoc_Location;

Continuity(): GeomAbs_Shape;
Continuity(C: GeomAbs_Shape): void;
Continuity(): GeomAbs_Shape;
Continuity(C: GeomAbs_Shape): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of a curve by two pcurves on a closed surface
BRep_CurveOnClosedSurface: declare class BRep_CurveOnClosedSurface extends BRep_CurveOnSurface

constructor

SetUVPoints2(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

UVPoints2(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

// Returns True
IsCurveOnClosedSurface(): boolean;

// Returns True
IsRegularity(): boolean;
IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
IsRegularity(): boolean;
IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

PCurve2(): Geom2d_Curve;
PCurve2(C: Geom2d_Curve): void;
PCurve2(): Geom2d_Curve;
PCurve2(C: Geom2d_Curve): void;

// Returns `Surface()`
Surface2(): Geom_Surface;

// Returns `Location()`
Location2(): TopLoc_Location;

Continuity(): GeomAbs_Shape;
Continuity(C: GeomAbs_Shape): void;
Continuity(): GeomAbs_Shape;
Continuity(C: GeomAbs_Shape): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

// Recomputes any derived data after a modification
Update(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of a curve by a curve in the parametric space of a surface
BRep_CurveOnSurface: declare class BRep_CurveOnSurface extends BRep_GCurve

constructor

SetUVPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

UVPoints(P1: gp_Pnt2d, P2: gp_Pnt2d): void;

// Computes the point at parameter U
D0(U: number, P: gp_Pnt): void;
// P: Mutated in place

// Returns True
IsCurveOnSurface(): boolean;
IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
IsCurveOnSurface(): boolean;
IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

Surface(): Geom_Surface;

PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;
PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

// Recomputes any derived data after a modification
Update(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for the curve representations
BRep_CurveRepresentation: declare class BRep_CurveRepresentation extends Standard_Transient

// A 3D curve representation
IsCurve3D(): boolean;

// A curve in the parametric space of a surface
IsCurveOnSurface(): boolean;
IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
IsCurveOnSurface(): boolean;
IsCurveOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

// A continuity between two surfaces
IsRegularity(): boolean;
IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;
IsRegularity(): boolean;
IsRegularity(S1: Geom_Surface, S2: Geom_Surface, L1: TopLoc_Location, L2: TopLoc_Location): boolean;

// A curve with two parametric curves on the same surface
IsCurveOnClosedSurface(): boolean;

// A 3D polygon representation
IsPolygon3D(): boolean;

// A representation by an array of nodes on a triangulation
IsPolygonOnTriangulation(): boolean;
IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;
IsPolygonOnTriangulation(): boolean;
IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;

// A representation by two arrays of nodes on a triangulation
IsPolygonOnClosedTriangulation(): boolean;

// A polygon in the parametric space of a surface
IsPolygonOnSurface(): boolean;
IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
IsPolygonOnSurface(): boolean;
IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

// Two 2D polygon representations in the parametric space of a surface
IsPolygonOnClosedSurface(): boolean;

Location(): TopLoc_Location;
Location(L: TopLoc_Location): void;
Location(): TopLoc_Location;
Location(L: TopLoc_Location): void;

Curve3D(): Geom_Curve;
Curve3D(C: Geom_Curve): void;
Curve3D(): Geom_Curve;
Curve3D(C: Geom_Curve): void;

Surface(): Geom_Surface;

PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;
PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;

PCurve2(): Geom2d_Curve;
PCurve2(C: Geom2d_Curve): void;
PCurve2(): Geom2d_Curve;
PCurve2(C: Geom2d_Curve): void;

Polygon3D(): Poly_Polygon3D;
Polygon3D(P: Poly_Polygon3D): void;
Polygon3D(): Poly_Polygon3D;
Polygon3D(P: Poly_Polygon3D): void;

Polygon(): Poly_Polygon2D;
Polygon(P: Poly_Polygon2D): void;
Polygon(): Poly_Polygon2D;
Polygon(P: Poly_Polygon2D): void;

Polygon2(): Poly_Polygon2D;
Polygon2(P: Poly_Polygon2D): void;
Polygon2(): Poly_Polygon2D;
Polygon2(P: Poly_Polygon2D): void;

Triangulation(): Poly_Triangulation;

PolygonOnTriangulation(): Poly_PolygonOnTriangulation;
PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;
PolygonOnTriangulation(): Poly_PolygonOnTriangulation;
PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;

PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;
PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;
PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;
PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;

Surface2(): Geom_Surface;

Location2(): TopLoc_Location;

Continuity(): GeomAbs_Shape;
Continuity(C: GeomAbs_Shape): void;
Continuity(): GeomAbs_Shape;
Continuity(C: GeomAbs_Shape): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for the geometric curves representation
BRep_GCurve: declare class BRep_GCurve extends BRep_CurveRepresentation

SetRange(First: number, Last: number): void;

Range(First?: number, Last?: number): { First: number; Last: number };

First(): number;
First(F: number): void;
First(): number;
First(F: number): void;

Last(): number;
Last(L: number): void;
Last(): number;
Last(L: number): void;

// Computes the point at parameter U
D0(U: number, P: gp_Pnt): void;
// P: Mutated in place

// Recomputes any derived data after a modification
Update(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation by a parameter on a 3D curve
BRep_PointOnCurve: declare class BRep_PointOnCurve extends BRep_PointRepresentation

constructor

// Returns True
IsPointOnCurve(): boolean;
IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;
IsPointOnCurve(): boolean;
IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;

Curve(): Geom_Curve;
Curve(C: Geom_Curve): void;
Curve(): Geom_Curve;
Curve(C: Geom_Curve): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation by a parameter on a curve on a surface
BRep_PointOnCurveOnSurface: declare class BRep_PointOnCurveOnSurface extends BRep_PointsOnSurface

constructor

// Returns True
IsPointOnCurveOnSurface(): boolean;
IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;
IsPointOnCurveOnSurface(): boolean;
IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;

PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;
PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation by two parameters on a surface
BRep_PointOnSurface: declare class BRep_PointOnSurface extends BRep_PointsOnSurface

constructor

// A point on a surface
IsPointOnSurface(): boolean;
IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
IsPointOnSurface(): boolean;
IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

Parameter2(): number;
Parameter2(P: number): void;
Parameter2(): number;
Parameter2(P: number): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root class for the points representations
BRep_PointRepresentation: declare class BRep_PointRepresentation extends Standard_Transient

// A point on a 3d curve
IsPointOnCurve(): boolean;
IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;
IsPointOnCurve(): boolean;
IsPointOnCurve(C: Geom_Curve, L: TopLoc_Location): boolean;

// A point on a 2d curve on a surface
IsPointOnCurveOnSurface(): boolean;
IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;
IsPointOnCurveOnSurface(): boolean;
IsPointOnCurveOnSurface(PC: Geom2d_Curve, S: Geom_Surface, L: TopLoc_Location): boolean;

// A point on a surface
IsPointOnSurface(): boolean;
IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
IsPointOnSurface(): boolean;
IsPointOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

Location(): TopLoc_Location;
Location(L: TopLoc_Location): void;
Location(): TopLoc_Location;
Location(L: TopLoc_Location): void;

Parameter(): number;
Parameter(P: number): void;
Parameter(): number;
Parameter(P: number): void;

Parameter2(): number;
Parameter2(P: number): void;
Parameter2(): number;
Parameter2(P: number): void;

Curve(): Geom_Curve;
Curve(C: Geom_Curve): void;
Curve(): Geom_Curve;
Curve(C: Geom_Curve): void;

PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;
PCurve(): Geom2d_Curve;
PCurve(C: Geom2d_Curve): void;

Surface(): Geom_Surface;
Surface(S: Geom_Surface): void;
Surface(): Geom_Surface;
Surface(S: Geom_Surface): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Root for points on surface
BRep_PointsOnSurface: declare class BRep_PointsOnSurface extends BRep_PointRepresentation

Surface(): Geom_Surface;
Surface(S: Geom_Surface): void;
Surface(): Geom_Surface;
Surface(S: Geom_Surface): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation by a 3D polygon
BRep_Polygon3D: declare class BRep_Polygon3D extends BRep_CurveRepresentation

constructor

// Returns True
IsPolygon3D(): boolean;

Polygon3D(): Poly_Polygon3D;
Polygon3D(P: Poly_Polygon3D): void;
Polygon3D(): Poly_Polygon3D;
Polygon3D(P: Poly_Polygon3D): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation by two 2d polygons in the parametric space of a surface
BRep_PolygonOnClosedSurface: declare class BRep_PolygonOnClosedSurface extends BRep_PolygonOnSurface

constructor

// returns True
IsPolygonOnClosedSurface(): boolean;

Polygon2(): Poly_Polygon2D;
Polygon2(P: Poly_Polygon2D): void;
Polygon2(): Poly_Polygon2D;
Polygon2(P: Poly_Polygon2D): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A representation by two arrays of nodes on a triangulation
BRep_PolygonOnClosedTriangulation: declare class BRep_PolygonOnClosedTriangulation extends BRep_PolygonOnTriangulation

constructor

// Returns True
IsPolygonOnClosedTriangulation(): boolean;

PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;
PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;
PolygonOnTriangulation2(P2: Poly_PolygonOnTriangulation): void;
PolygonOnTriangulation2(): Poly_PolygonOnTriangulation;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Representation of a 2D polygon in the parametric space of a surface
BRep_PolygonOnSurface: declare class BRep_PolygonOnSurface extends BRep_CurveRepresentation

constructor

// A 2D polygon representation in the parametric space of a surface
IsPolygonOnSurface(): boolean;
IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;
IsPolygonOnSurface(): boolean;
IsPolygonOnSurface(S: Geom_Surface, L: TopLoc_Location): boolean;

Surface(): Geom_Surface;

Polygon(): Poly_Polygon2D;
Polygon(P: Poly_Polygon2D): void;
Polygon(): Poly_Polygon2D;
Polygon(P: Poly_Polygon2D): void;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// A representation by an array of nodes on a triangulation
BRep_PolygonOnTriangulation: declare class BRep_PolygonOnTriangulation extends BRep_CurveRepresentation

constructor

// returns True
IsPolygonOnTriangulation(): boolean;
IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;
IsPolygonOnTriangulation(): boolean;
IsPolygonOnTriangulation(T: Poly_Triangulation, L: TopLoc_Location): boolean;

// returns True
PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;
PolygonOnTriangulation(): Poly_PolygonOnTriangulation;
PolygonOnTriangulation(P: Poly_PolygonOnTriangulation): void;
PolygonOnTriangulation(): Poly_PolygonOnTriangulation;

Triangulation(): Poly_Triangulation;

// Return a copy of this representation
Copy(): BRep_CurveRepresentation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The TEdge from BRep is inherited from the TEdge from `TopoDS`
BRep_TEdge: declare class BRep_TEdge extends TopoDS_TEdge

constructor

Tolerance(): number;
Tolerance(T: number): void;
Tolerance(): number;
Tolerance(T: number): void;

// Sets the tolerance to the max of <T> and the current tolerance
UpdateTolerance(T: number): void;

SameParameter(): boolean;
SameParameter(S: boolean): void;
SameParameter(): boolean;
SameParameter(S: boolean): void;

SameRange(): boolean;
SameRange(S: boolean): void;
SameRange(): boolean;
SameRange(S: boolean): void;

Degenerated(): boolean;
Degenerated(S: boolean): void;
Degenerated(): boolean;
Degenerated(S: boolean): void;

Curves(): NCollection_List_handle_BRep_CurveRepresentation;

ChangeCurves(): NCollection_List_handle_BRep_CurveRepresentation;

// Returns a copy of the TShape with no sub-shapes
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The Tface from BRep is based on the TFace from `TopoDS`
BRep_TFace: declare class BRep_TFace extends TopoDS_TFace

constructor

// Returns face surface
Surface(): Geom_Surface;
Surface(theSurface: Geom_Surface): void;
Surface(): Geom_Surface;
Surface(theSurface: Geom_Surface): void;

// Returns the face location
Location(): TopLoc_Location;
Location(theLocation: TopLoc_Location): void;
Location(): TopLoc_Location;
Location(theLocation: TopLoc_Location): void;

// Returns the face tolerance
Tolerance(): number;
Tolerance(theTolerance: number): void;
Tolerance(): number;
Tolerance(theTolerance: number): void;

// Returns TRUE if the boundary of this face is known to be the parametric space (Umin, UMax, VMin, VMax)
NaturalRestriction(): boolean;
NaturalRestriction(theRestriction: boolean): void;
NaturalRestriction(): boolean;
NaturalRestriction(theRestriction: boolean): void;

// Returns the triangulation of this face according to the mesh purpose
Triangulation(thePurpose: number): Poly_Triangulation;
Triangulation(theTriangulation: Poly_Triangulation, theToReset: boolean): void;
Triangulation(thePurpose: number): Poly_Triangulation;
Triangulation(theTriangulation: Poly_Triangulation, theToReset: boolean): void;
// thePurpose: a mesh purpose to find appropriate triangulation (NONE by default)

// Returns a copy of the TShape with no sub-shapes
EmptyCopy(): TopoDS_TShape;

// Returns the list of available face triangulations
Triangulations(): NCollection_List_handle_Poly_Triangulation;
Triangulations(theTriangulations: NCollection_List_handle_Poly_Triangulation, theActiveTriangulation: Poly_Triangulation): void;
Triangulations(): NCollection_List_handle_Poly_Triangulation;
Triangulations(theTriangulations: NCollection_List_handle_Poly_Triangulation, theActiveTriangulation: Poly_Triangulation): void;

// Returns number of available face triangulations
NbTriangulations(): number;

// Returns current active triangulation
ActiveTriangulation(): Poly_Triangulation;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The TVertex from BRep inherits from the TVertex from `TopoDS`
BRep_TVertex: declare class BRep_TVertex extends TopoDS_TVertex

constructor

Tolerance(): number;
Tolerance(T: number): void;
Tolerance(): number;
Tolerance(T: number): void;

// Sets the tolerance to the max of <T> and the current tolerance
UpdateTolerance(T: number): void;

Pnt(): gp_Pnt;
Pnt(P: gp_Pnt): void;
Pnt(): gp_Pnt;
Pnt(P: gp_Pnt): void;

Points(): NCollection_List_handle_BRep_PointRepresentation;

ChangePoints(): NCollection_List_handle_BRep_PointRepresentation;

// Returns a copy of the TShape with no sub-shapes
EmptyCopy(): TopoDS_TShape;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
