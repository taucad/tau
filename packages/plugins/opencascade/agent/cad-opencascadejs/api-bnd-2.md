# libcascade — Bnd (2)

8 top-level symbols. Signatures are verbatim typescript.

// This class represents a bounding sphere of a geometric entity (triangle, segment of line or whatever else)
Bnd_Sphere: declare class Bnd_Sphere

constructor

// Returns the U parameter on shape
U(): number;

// Returns the V parameter on shape
V(): number;

// Returns validity status, indicating that this sphere corresponds to a real entity
IsValid(): boolean;

SetValid(isValid: boolean): void;

// Returns center of sphere object
Center(): gp_XYZ;

// Returns the radius value
Radius(): number;

// Calculate and return minimal and maximal distance to sphere
Distances(theXYZ: gp_XYZ, theMin?: number, theMax?: number): { theMin: number; theMax: number };

// Calculate and return minimal and maximal distance to sphere
SquareDistances(theXYZ: gp_XYZ, theMin?: number, theMax?: number): { theMin: number; theMax: number };

// Projects a point on entity
Project(theNode: gp_XYZ, theProjNode: gp_XYZ, theDist?: number, theInside?: boolean): { returnValue: boolean; theDist: number; theInside: boolean };
// theProjNode: Mutated in place

Distance(theNode: gp_XYZ): number;

SquareDistance(theNode: gp_XYZ): number;

Add(theOther: Bnd_Sphere): void;

IsOut(theOther: Bnd_Sphere): boolean;
IsOut(thePnt: gp_XYZ, theMaxDist?: number): { returnValue: boolean; theMaxDist: number };
IsOut(theOther: Bnd_Sphere): boolean;
IsOut(thePnt: gp_XYZ, theMaxDist?: number): { returnValue: boolean; theMaxDist: number };

SquareExtent(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Defines a set of static methods operating with bounding boxes
Bnd_Tools: declare class Bnd_Tools

constructor

static Bnd2BVH(theBox: Bnd_Box2d): any;
static Bnd2BVH(theBox: Bnd_Box): any;
static Bnd2BVH(theBox: Bnd_Box2d): any;
static Bnd2BVH(theBox: Bnd_Box): any;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

Bnd_Box_Limits: interface Bnd_Box_Limits

Xmin: number

Xmax: number

Ymin: number

Ymax: number

Zmin: number

Zmax: number

Bnd_Box2d_Limits: interface Bnd_Box2d_Limits

Xmin: number

Xmax: number

Ymin: number

Ymax: number

Bnd_OBB_HalfSizes: interface Bnd_OBB_HalfSizes

X: number

Y: number

Z: number

Bnd_Range_Bounds: interface Bnd_Range_Bounds

Min: number

Max: number

Bnd_Array1OfBox: NCollection_Array1_Bnd_Box

Bnd_HArray1OfBox: NCollection_HArray1_Bnd_Box
