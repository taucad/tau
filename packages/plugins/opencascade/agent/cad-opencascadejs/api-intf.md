# libcascade — Intf

9 top-level symbols. Signatures are verbatim typescript.

// Interference computation between polygons, lines and polyhedra with only triangular facets
Intf: declare class Intf

constructor

// Computes the interference between two polygons in 2d
static PlaneEquation(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, NormalVector: gp_XYZ, PolarDistance?: number): { PolarDistance: number };
// NormalVector: Mutated in place

// Compute if the triangle <P1> <P2> <P3> contain <ThePnt>
static Contain(P1: gp_Pnt, P2: gp_Pnt, P3: gp_Pnt, ThePnt: gp_Pnt): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes the Interference computation result between polygon2d or polygon3d or polyhedron (as three sequences of points of intersection, polylines of intersection and zones de tangence)
Intf_Interference: declare class Intf_Interference

// Gives the number of points of intersection in the interference
NbSectionPoints(): number;

// Gives the number of polylines of intersection in the interference
NbSectionLines(): number;

// Gives the polyline of intersection at address <Index> in the interference
LineValue(Index: number): Intf_SectionLine;

// Gives the number of zones of tangence in the interference
NbTangentZones(): number;

// Gives the zone of tangence at address Index in the interference
ZoneValue(Index: number): Intf_TangentZone;

// Gives the tolerance used for the calculation
GetTolerance(): number;

// Inserts a new zone of tangence in the current list of tangent zones of the interference and returns True when done
Insert(TheZone: Intf_TangentZone): boolean;

Dump(): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Computes the interference between two polygons or the self intersection of a polygon in two dimensions
Intf_InterferencePolygon2d: declare class Intf_InterferencePolygon2d extends Intf_Interference

constructor

// Computes an interference between two Polygons
Perform(Obje1: Intf_Polygon2d, Obje2: Intf_Polygon2d): void;
Perform(Obje: Intf_Polygon2d): void;
Perform(Obje1: Intf_Polygon2d, Obje2: Intf_Polygon2d): void;
Perform(Obje: Intf_Polygon2d): void;

// Gives the geometrical 2d point of the intersection point at address <Index> in the interference
Pnt2dValue(Index: number): gp_Pnt2d;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes the different intersection point types for this application
Intf_PIType: typeof Intf_PIType[keyof typeof Intf_PIType]

// Describes the necessary polygon information to compute the interferences
Intf_Polygon2d: declare class Intf_Polygon2d

// Returns the bounding box of the polygon
Bounding(): Bnd_Box2d;

// Returns True if the polyline is closed
Closed(): boolean;

// Returns the tolerance of the polygon
DeflectionOverEstimation(): number;

// Returns the number of Segments in the polyline
NbSegments(): number;

// Returns the points of the segment <Index> in the Polygon
Segment(theIndex: number, theBegin: gp_Pnt2d, theEnd: gp_Pnt2d): void;
// theBegin: Mutated in place
// theEnd: Mutated in place

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describe a polyline of intersection between two polyhedra as a sequence of points of intersection
Intf_SectionLine: declare class Intf_SectionLine

constructor

// Returns number of points in this SectionLine
NumberOfPoints(): number;

// Returns True if the SectionLine is closed
IsClosed(): boolean;

// Compares two SectionLines
IsEqual(Other: Intf_SectionLine): boolean;

// Adds a point at the end of the SectionLine
Append(LS: Intf_SectionLine): void;
// LS: Mutated in place

// Adds a point to the beginning of the SectionLine <me>
Prepend(LS: Intf_SectionLine): void;
// LS: Mutated in place

// Reverses the order of the elements of the SectionLine
Reverse(): void;

// Closes the SectionLine
Close(): void;

Dump(Indent: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a zone of tangence between polygons or polyhedra as a sequence of points of intersection
Intf_TangentZone: declare class Intf_TangentZone

constructor

// Returns number of SectionPoint in this TangentZone
NumberOfPoints(): number;

// Compares two TangentZones
IsEqual(Other: Intf_TangentZone): boolean;

// Gives the parameter range of the TangentZone on the first argument of the Interference
ParamOnFirst(paraMin?: number, paraMax?: number): { paraMin: number; paraMax: number };

// Gives the parameter range of the TangentZone on the second argument of the Interference
ParamOnSecond(paraMin?: number, paraMax?: number): { paraMin: number; paraMax: number };

// Gives information about the first argument of the Interference
InfoFirst(segMin?: number, paraMin?: number, segMax?: number, paraMax?: number): { segMin: number; paraMin: number; segMax: number; paraMax: number };

// Gives information about the second argument of the Interference
InfoSecond(segMin?: number, paraMin?: number, segMax?: number, paraMax?: number): { segMin: number; paraMin: number; segMax: number; paraMax: number };

// Returns True if the TangentZone <Other> has a common part with <me>
HasCommonRange(Other: Intf_TangentZone): boolean;

// Adds a SectionPoint to the TangentZone
Append(Tzi: Intf_TangentZone): void;

Dump(Indent: number): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Provides services to create box for infinites lines in a given contexte
Intf_Tool: declare class Intf_Tool

constructor

Lin2dBox(theLin2d: gp_Lin2d, bounding: Bnd_Box2d, boxLin: Bnd_Box2d): void;

Hypr2dBox(theHypr2d: gp_Hypr2d, bounding: Bnd_Box2d, boxHypr: Bnd_Box2d): void;

Parab2dBox(theParab2d: gp_Parab2d, bounding: Bnd_Box2d, boxHypr: Bnd_Box2d): void;

LinBox(theLin: gp_Lin, bounding: Bnd_Box, boxLin: Bnd_Box): void;

HyprBox(theHypr: gp_Hypr, bounding: Bnd_Box, boxHypr: Bnd_Box): void;

ParabBox(theParab: gp_Parab, bounding: Bnd_Box, boxHypr: Bnd_Box): void;

NbSegments(): number;

BeginParam(SegmentNum: number): number;

EndParam(SegmentNum: number): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Intf_Array1OfLin: NCollection_Array1_gp_Lin
