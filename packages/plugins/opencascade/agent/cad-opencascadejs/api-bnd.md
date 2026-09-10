# libcascade — Bnd

6 top-level symbols. Signatures are verbatim typescript.

// A tool to compare a bounding box or a plane with a set of bounding boxes
Bnd_BoundSortBox: declare class Bnd_BoundSortBox

constructor

// Initializes this comparison algorithm with the set of boxes
Initialize(theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
Initialize(theEnclosingBox: Bnd_Box, theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
Initialize(theEnclosingBox: Bnd_Box, theNbBoxes: number): void;
Initialize(theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
Initialize(theEnclosingBox: Bnd_Box, theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
Initialize(theEnclosingBox: Bnd_Box, theNbBoxes: number): void;
Initialize(theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
Initialize(theEnclosingBox: Bnd_Box, theSetOfBoxes: NCollection_HArray1_Bnd_Box): void;
Initialize(theEnclosingBox: Bnd_Box, theNbBoxes: number): void;
// theSetOfBoxes: The set of bounding boxes to be used by this algorithm

// Adds the bounding box theBox at position boxIndex in the internal array of boxes to be sorted by this comparison algorithm
Add(theBox: Bnd_Box, theIndex: number): void;
// theBox: The bounding box to be added
// theIndex: The index of the bounding box in the internal array where the box will be added

// Compares the bounding box theBox, with the set of bounding boxes provided to this algorithm at initialization, and returns the list of indices of bounding boxes that intersect the `theBox` or are inside it
Compare(theBox: Bnd_Box): NCollection_List_int;
Compare(thePlane: gp_Pln): NCollection_List_int;
Compare(theBox: Bnd_Box): NCollection_List_int;
Compare(thePlane: gp_Pln): NCollection_List_int;
// theBox: The bounding box to be compared

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a bounding box in 3D space
Bnd_Box: declare class Bnd_Box

constructor

// Sets this bounding box so that it covers the whole of 3D space
SetWhole(): void;

// Sets this bounding box so that it is empty
SetVoid(): void;

// Sets this bounding box so that it bounds
Set(P: gp_Pnt): void;
Set(P: gp_Pnt, D: gp_Dir): void;
Set(P: gp_Pnt): void;
Set(P: gp_Pnt, D: gp_Dir): void;

// Enlarges this bounding box, if required, so that it contains at least
Update(aXmin: number, aYmin: number, aZmin: number, aXmax: number, aYmax: number, aZmax: number): void;
Update(X: number, Y: number, Z: number): void;
Update(aXmin: number, aYmin: number, aZmin: number, aXmax: number, aYmax: number, aZmax: number): void;
Update(X: number, Y: number, Z: number): void;

// Set the gap of this bounding box to abs(Tol)
SetGap(Tol: number): void;

// Enlarges the box with a tolerance value
Enlarge(Tol: number): void;

// Returns the Xmin value (`IsOpenXmin()` ? -`Precision::Infinite()`
GetXMin(): number;

// Returns the Xmax value (`IsOpenXmax()` ? `Precision::Infinite()`
GetXMax(): number;

// Returns the Ymin value (`IsOpenYmin()` ? -`Precision::Infinite()`
GetYMin(): number;

// Returns the Ymax value (`IsOpenYmax()` ? `Precision::Infinite()`
GetYMax(): number;

// Returns the Zmin value (`IsOpenZmin()` ? -`Precision::Infinite()`
GetZMin(): number;

// Returns the Zmax value (`IsOpenZmax()` ? `Precision::Infinite()`
GetZMax(): number;

// Returns the lower corner of this bounding box
CornerMin(): gp_Pnt;

// Returns the upper corner of this bounding box
CornerMax(): gp_Pnt;

// Returns the center of this bounding box
Center(): gp_Pnt | null | undefined;

// The Box will be infinitely long in the Xmin direction
OpenXmin(): void;

// The Box will be infinitely long in the Xmax direction
OpenXmax(): void;

// The Box will be infinitely long in the Ymin direction
OpenYmin(): void;

// The Box will be infinitely long in the Ymax direction
OpenYmax(): void;

// The Box will be infinitely long in the Zmin direction
OpenZmin(): void;

// The Box will be infinitely long in the Zmax direction
OpenZmax(): void;

// Returns true if this bounding box has at least one open direction
IsOpen(): boolean;

// Returns true if this bounding box is open in the Xmin direction
IsOpenXmin(): boolean;

// Returns true if this bounding box is open in the Xmax direction
IsOpenXmax(): boolean;

// Returns true if this bounding box is open in the Ymin direction
IsOpenYmin(): boolean;

// Returns true if this bounding box is open in the Ymax direction
IsOpenYmax(): boolean;

// Returns true if this bounding box is open in the Zmin direction
IsOpenZmin(): boolean;

// Returns true if this bounding box is open in the Zmax direction
IsOpenZmax(): boolean;

// Returns true if this bounding box is infinite in all 6 directions (WholeSpace flag)
IsWhole(): boolean;

// Returns true if this bounding box is empty (Void flag)
IsVoid(): boolean;

// true if xmax-xmin < tol
IsXThin(tol: number): boolean;

// true if ymax-ymin < tol
IsYThin(tol: number): boolean;

// true if zmax-zmin < tol
IsZThin(tol: number): boolean;

// Returns true if IsXThin, IsYThin and IsZThin are all true, i.e
IsThin(tol: number): boolean;

// Returns a bounding box which is the result of applying the transformation T to this bounding box
Transformed(T: gp_Trsf): Bnd_Box;

// Adds the box <Other> to <me>
Add(Other: Bnd_Box): void;
Add(P: gp_Pnt): void;
Add(D: gp_Dir): void;
Add(P: gp_Pnt, D: gp_Dir): void;
Add(Other: Bnd_Box): void;
Add(P: gp_Pnt): void;
Add(D: gp_Dir): void;
Add(P: gp_Pnt, D: gp_Dir): void;
Add(Other: Bnd_Box): void;
Add(P: gp_Pnt): void;
Add(D: gp_Dir): void;
Add(P: gp_Pnt, D: gp_Dir): void;
Add(Other: Bnd_Box): void;
Add(P: gp_Pnt): void;
Add(D: gp_Dir): void;
Add(P: gp_Pnt, D: gp_Dir): void;

// Returns True if the Pnt is out the box
IsOut(P: gp_Pnt): boolean;
IsOut(L: gp_Lin): boolean;
IsOut(P: gp_Pln): boolean;
IsOut(Other: Bnd_Box): boolean;
IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
IsOut(P: gp_Pnt): boolean;
IsOut(L: gp_Lin): boolean;
IsOut(P: gp_Pln): boolean;
IsOut(Other: Bnd_Box): boolean;
IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
IsOut(P: gp_Pnt): boolean;
IsOut(L: gp_Lin): boolean;
IsOut(P: gp_Pln): boolean;
IsOut(Other: Bnd_Box): boolean;
IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
IsOut(P: gp_Pnt): boolean;
IsOut(L: gp_Lin): boolean;
IsOut(P: gp_Pln): boolean;
IsOut(Other: Bnd_Box): boolean;
IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
IsOut(P: gp_Pnt): boolean;
IsOut(L: gp_Lin): boolean;
IsOut(P: gp_Pln): boolean;
IsOut(Other: Bnd_Box): boolean;
IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
IsOut(P: gp_Pnt): boolean;
IsOut(L: gp_Lin): boolean;
IsOut(P: gp_Pln): boolean;
IsOut(Other: Bnd_Box): boolean;
IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;
IsOut(P: gp_Pnt): boolean;
IsOut(L: gp_Lin): boolean;
IsOut(P: gp_Pln): boolean;
IsOut(Other: Bnd_Box): boolean;
IsOut(Other: Bnd_Box, T: gp_Trsf): boolean;
IsOut(T1: gp_Trsf, Other: Bnd_Box, T2: gp_Trsf): boolean;
IsOut(P1: gp_Pnt, P2: gp_Pnt, D: gp_Dir): boolean;

// Returns True if the point is inside or on the boundary of this box
Contains(theP: gp_Pnt): boolean;

// Returns True if the other box intersects or is inside this box
Intersects(theOther: Bnd_Box): boolean;

// Computes the minimum distance between two boxes
Distance(Other: Bnd_Box): number;

Dump(): void;

// Computes the squared diagonal of me
SquareExtent(): number;

// Returns a finite part of an infinite bounding box (returns self if this is already finite box)
FinitePart(): Bnd_Box;

// Returns TRUE if this box has finite part
HasFinitePart(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Describes a bounding box in 2D space
Bnd_Box2d: declare class Bnd_Box2d

constructor

// Sets this bounding box so that it covers the whole 2D space, i.e
SetWhole(): void;

// Sets this 2D bounding box so that it is empty
SetVoid(): void;

// Sets this 2D bounding box so that it bounds the point P
Set(thePnt: gp_Pnt2d): void;
Set(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
Set(thePnt: gp_Pnt2d): void;
Set(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;

// Enlarges this 2D bounding box, if required, so that it contains at least
Update(aXmin: number, aYmin: number, aXmax: number, aYmax: number): void;
Update(X: number, Y: number): void;
Update(aXmin: number, aYmin: number, aXmax: number, aYmax: number): void;
Update(X: number, Y: number): void;

// Set the gap of this 2D bounding box to abs(Tol)
SetGap(Tol: number): void;

// Enlarges the box with a tolerance value
Enlarge(theTol: number): void;

// Returns the Xmin value (`IsOpenXmin()` ? -`Precision::Infinite()`
GetXMin(): number;

// Returns the Xmax value (`IsOpenXmax()` ? `Precision::Infinite()`
GetXMax(): number;

// Returns the Ymin value (`IsOpenYmin()` ? -`Precision::Infinite()`
GetYMin(): number;

// Returns the Ymax value (`IsOpenYmax()` ? `Precision::Infinite()`
GetYMax(): number;

// Returns the center of this 2D bounding box
Center(): gp_Pnt2d | null | undefined;

// The Box will be infinitely long in the Xmin direction
OpenXmin(): void;

// The Box will be infinitely long in the Xmax direction
OpenXmax(): void;

// The Box will be infinitely long in the Ymin direction
OpenYmin(): void;

// The Box will be infinitely long in the Ymax direction
OpenYmax(): void;

// Returns true if this bounding box is open in the Xmin direction
IsOpenXmin(): boolean;

// Returns true if this bounding box is open in the Xmax direction
IsOpenXmax(): boolean;

// Returns true if this bounding box is open in the Ymin direction
IsOpenYmin(): boolean;

// Returns true if this bounding box is open in the Ymax direction
IsOpenYmax(): boolean;

// Returns true if this bounding box is infinite in all 4 directions (Whole Space flag)
IsWhole(): boolean;

// Returns true if this 2D bounding box is empty (Void flag)
IsVoid(): boolean;

// Returns a bounding box which is the result of applying the transformation T to this bounding box
Transformed(T: gp_Trsf2d): Bnd_Box2d;

// Adds the 2d box <Other> to <me>
Add(Other: Bnd_Box2d): void;
Add(thePnt: gp_Pnt2d): void;
Add(D: gp_Dir2d): void;
Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
Add(Other: Bnd_Box2d): void;
Add(thePnt: gp_Pnt2d): void;
Add(D: gp_Dir2d): void;
Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
Add(Other: Bnd_Box2d): void;
Add(thePnt: gp_Pnt2d): void;
Add(D: gp_Dir2d): void;
Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;
Add(Other: Bnd_Box2d): void;
Add(thePnt: gp_Pnt2d): void;
Add(D: gp_Dir2d): void;
Add(thePnt: gp_Pnt2d, theDir: gp_Dir2d): void;

// Returns True if the 2d pnt
IsOut(P: gp_Pnt2d): boolean;
IsOut(theL: gp_Lin2d): boolean;
IsOut(Other: Bnd_Box2d): boolean;
IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
IsOut(P: gp_Pnt2d): boolean;
IsOut(theL: gp_Lin2d): boolean;
IsOut(Other: Bnd_Box2d): boolean;
IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
IsOut(P: gp_Pnt2d): boolean;
IsOut(theL: gp_Lin2d): boolean;
IsOut(Other: Bnd_Box2d): boolean;
IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
IsOut(P: gp_Pnt2d): boolean;
IsOut(theL: gp_Lin2d): boolean;
IsOut(Other: Bnd_Box2d): boolean;
IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
IsOut(P: gp_Pnt2d): boolean;
IsOut(theL: gp_Lin2d): boolean;
IsOut(Other: Bnd_Box2d): boolean;
IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;
IsOut(P: gp_Pnt2d): boolean;
IsOut(theL: gp_Lin2d): boolean;
IsOut(Other: Bnd_Box2d): boolean;
IsOut(theP0: gp_Pnt2d, theP1: gp_Pnt2d): boolean;
IsOut(theOther: Bnd_Box2d, theTrsf: gp_Trsf2d): boolean;
IsOut(T1: gp_Trsf2d, Other: Bnd_Box2d, T2: gp_Trsf2d): boolean;

// Returns True if the 2d point is inside or on the boundary of this box
Contains(theP: gp_Pnt2d): boolean;

// Returns True if the other 2d box intersects or is inside this box
Intersects(theOther: Bnd_Box2d): boolean;

// Computes the minimum distance between two 2D boxes
Distance(theOther: Bnd_Box2d): number;

Dump(): void;

// Computes the squared diagonal of me
SquareExtent(): number;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class describes the Oriented Bounding Box (OBB), much tighter enclosing volume for the shape than the Axis Aligned Bounding Box (AABB)
Bnd_OBB: declare class Bnd_OBB

constructor

// Creates new OBB covering every point in theListOfPoints
ReBuild(theListOfPoints: NCollection_Array1_gp_Pnt, theListOfTolerances?: NCollection_Array1_double, theIsOptimal?: boolean): void;

// Sets the center of OBB
SetCenter(theCenter: gp_Pnt): void;

// Sets the X component of OBB - direction and size
SetXComponent(theXDirection: gp_Dir, theHXSize: number): void;

// Sets the Y component of OBB - direction and size
SetYComponent(theYDirection: gp_Dir, theHYSize: number): void;

// Sets the Z component of OBB - direction and size
SetZComponent(theZDirection: gp_Dir, theHZSize: number): void;

// Returns the local coordinates system of this oriented box
Position(): gp_Ax3;

// Returns the center of OBB
Center(): gp_XYZ;

// Returns the X Direction of OBB
XDirection(): gp_XYZ;

// Returns the Y Direction of OBB
YDirection(): gp_XYZ;

// Returns the Z Direction of OBB
ZDirection(): gp_XYZ;

// Returns the X Dimension of OBB
XHSize(): number;

// Returns the Y Dimension of OBB
YHSize(): number;

// Returns the Z Dimension of OBB
ZHSize(): number;

// Returns the half-size dimensions of the OBB as a `HalfSizes` structure
GetHalfSizes(): Bnd_OBB_HalfSizes;

// Checks if the box is empty
IsVoid(): boolean;

// Clears this box
SetVoid(): void;

// Sets the flag for axes aligned box
SetAABox(theFlag: boolean): void;

// Returns TRUE if the box is axes aligned
IsAABox(): boolean;

// Enlarges the box with the given value
Enlarge(theGapAdd: number): void;

// Returns the array of vertices in <this>
GetVertex(theP: [gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt, gp_Pnt]): boolean;

// Returns square diagonal of this box
SquareExtent(): number;

// Check if the box do not interfere the other box
IsOut(theOther: Bnd_OBB): boolean;
IsOut(theP: gp_Pnt): boolean;
IsOut(theOther: Bnd_OBB): boolean;
IsOut(theP: gp_Pnt): boolean;

// Returns True if the point is inside or on the boundary of this OBB
Contains(theP: gp_Pnt): boolean;

// Returns True if the other OBB intersects or is inside this OBB
Intersects(theOther: Bnd_OBB): boolean;

// Check if the theOther is completely inside \*this
IsCompletelyInside(theOther: Bnd_OBB): boolean;

// Rebuilds this in order to include all previous objects (which it was created from) and theOther
Add(theOther: Bnd_OBB): void;
Add(theP: gp_Pnt): void;
Add(theOther: Bnd_OBB): void;
Add(theP: gp_Pnt): void;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// This class describes a range in 1D space restricted by two real values
Bnd_Range: declare class Bnd_Range

constructor

// Replaces <this> with common-part of <this> and theOther
Common(theOther: Bnd_Range): void;

// Joins \*this and theOther to one interval
Union(theOther: Bnd_Range): boolean;

// Splits <this> to several sub-ranges by theVal value (e.g
Split(theVal: number, theList: NCollection_List_Bnd_Range, thePeriod: number): void;
// theList: Mutated in place

// Checks if <this> intersects values like theVal+k\*thePeriod, where k is an integer number (k = 0, +/-1, +/-2, ...)
IsIntersected(theVal: number, thePeriod?: number): Bnd_Range_IntersectStatus;

// Extends <this> to include theParameter
Add(theParameter: number): void;
Add(theRange: Bnd_Range): void;
Add(theParameter: number): void;
Add(theRange: Bnd_Range): void;

// Obtain MIN boundary of <this>
GetMin(thePar?: number): { returnValue: boolean; thePar: number };

// Obtain MAX boundary of <this>
GetMax(thePar?: number): { returnValue: boolean; thePar: number };

// Obtain first and last boundary of <this>
GetBounds(theFirstPar?: number, theLastPar?: number): { returnValue: boolean; theFirstPar: number; theLastPar: number };

// Returns the bounds of this range as a `Bounds` structure
Get(): Bnd_Range_Bounds | null | undefined;

// Obtain theParameter satisfied to the equation (theParameter-MIN)/(MAX-MIN) == theLambda
GetIntermediatePoint(theLambda: number, theParameter?: number): { returnValue: boolean; theParameter: number };

// Returns the center of this range ((Min + Max) / 2)
Center(): number | null | undefined;

// Returns range value (MAX-MIN)
Delta(): number;

// Is <this> initialized
IsVoid(): boolean;

// Initializes <this> by default parameters
SetVoid(): void;

// Extends this to the given value (in both side)
Enlarge(theDelta: number): void;

// Returns the copy of <\*this> shifted by theVal
Shifted(theVal: number): Bnd_Range;

// Shifts <\*this> by theVal
Shift(theVal: number): void;

// Trims the First value in range by the given lower limit
TrimFrom(theValLower: number): void;

// Trim the Last value in range by the given Upper limit
TrimTo(theValUpper: number): void;

// Returns True if the value is out of this range
IsOut(theValue: number): boolean;
IsOut(theRange: Bnd_Range): boolean;
IsOut(theValue: number): boolean;
IsOut(theRange: Bnd_Range): boolean;

// Returns True if the value is within this range
Contains(theValue: number): boolean;

// Returns True if the given range intersects (overlaps with) this range
Intersects(theRange: Bnd_Range): boolean;

// Returns the MIN boundary of <this>
Min(): number | null | undefined;

// Returns the MAX boundary of <this>
Max(): number | null | undefined;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Status of intersection check with a periodic value
Bnd_Range_IntersectStatus: typeof Bnd_Range_IntersectStatus[keyof typeof Bnd_Range_IntersectStatus]
