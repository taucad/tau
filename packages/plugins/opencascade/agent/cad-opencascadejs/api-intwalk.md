# libcascade — IntWalk

5 top-level symbols. Signatures are verbatim typescript.

IntWalk_StatusDeflection: typeof IntWalk_StatusDeflection[keyof typeof IntWalk_StatusDeflection]

IntWalk_TheInt2S: declare class IntWalk_TheInt2S

constructor

// returns the best constant isoparametric to find the next intersection's point +stores the solution point (the solution point is found with the close point to intersect the isoparametric with the other patch
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot): IntImp_ConstIsoparametric;
Perform(Param: NCollection_Array1_double, Rsnld: math_FunctionSetRoot, ChoixIso: IntImp_ConstIsoparametric): IntImp_ConstIsoparametric;

// Returns TRUE if the creation completed without failure
IsDone(): boolean;

// Returns TRUE when there is no solution to the problem
IsEmpty(): boolean;

// Returns the intersection point
Point(): IntSurf_PntOn2S;

// Returns True if the surfaces are tangent at the intersection point
IsTangent(): boolean;

// Returns the tangent at the intersection line
Direction(): gp_Dir;

// Returns the tangent at the intersection line in the parametric space of the first surface
DirectionOnS1(): gp_Dir2d;

// Returns the tangent at the intersection line in the parametric space of the second surface
DirectionOnS2(): gp_Dir2d;

// return the intersection point which is enable for changing
ChangePoint(): IntSurf_PntOn2S;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contiguous dynamic array using a flat memory buffer
IntWalk_VectorOfInteger: declare class IntWalk_VectorOfInteger

constructor

Data(): number;

HasData(): boolean;

Empty(): boolean;

static MaxSize(): number;

Size(): number;

IsEmpty(): boolean;

Capacity(): number;

// Pre-allocate memory for at least theCapacity elements without changing size
Reserve(theCapacity: number): void;
// theCapacity: minimum capacity to ensure

// Change the number of elements
Resize(theSize: number): void;
Resize(theSize: number, theValue: number): void;
Resize(theSize: number): void;
Resize(theSize: number, theValue: number): void;
// theSize: new number of elements

Value(theIndex: number): number;
// theIndex: element index (0-based)

ChangeValue(theIndex: number): number;
// theIndex: element index (0-based)

First(): number;

ChangeFirst(): number;

Last(): number;

ChangeLast(): number;

// Append a copy of theValue to the end
Append(theValue: number): number;
// theValue: element to append

// Append a default-constructed element
Appended(): number;

// Set value at theIndex
SetValue(theIndex: number, theValue: number): number;
// theIndex: element index (0-based)
// theValue: value to set

// Insert theValue before theIndex, shifting elements right
InsertBefore(theIndex: number, theValue: number): void;
// theIndex: insertion position (0-based)
// theValue: element to insert

// Insert theValue after theIndex, shifting elements right
InsertAfter(theIndex: number, theValue: number): void;
// theIndex: position after which to insert (0-based)
// theValue: element to insert

// Remove the last element
EraseLast(): void;

// Remove element at theIndex, shifting subsequent elements left
Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;
Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;
// theIndex: element index (0-based)

// Remove all elements
Clear(theReleaseMemory?: boolean): void;
// theReleaseMemory: if true, deallocate the buffer

// Returns a span as Array1 with shared memory
ToArray1(): NCollection_Array1_int;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// Contiguous dynamic array using a flat memory buffer
IntWalk_VectorOfWalkingData: declare class IntWalk_VectorOfWalkingData

constructor

Data(): IntWalk_WalkingData;

HasData(): boolean;

Empty(): boolean;

static MaxSize(): number;

Size(): number;

IsEmpty(): boolean;

Capacity(): number;

// Pre-allocate memory for at least theCapacity elements without changing size
Reserve(theCapacity: number): void;
// theCapacity: minimum capacity to ensure

// Change the number of elements
Resize(theSize: number): void;
Resize(theSize: number, theValue: IntWalk_WalkingData): void;
Resize(theSize: number): void;
Resize(theSize: number, theValue: IntWalk_WalkingData): void;
// theSize: new number of elements

Value(theIndex: number): IntWalk_WalkingData;
// theIndex: element index (0-based)

ChangeValue(theIndex: number): IntWalk_WalkingData;
// theIndex: element index (0-based)

First(): IntWalk_WalkingData;

ChangeFirst(): IntWalk_WalkingData;

Last(): IntWalk_WalkingData;

ChangeLast(): IntWalk_WalkingData;

// Append a copy of theValue to the end
Append(theValue: IntWalk_WalkingData): IntWalk_WalkingData;
// theValue: element to append

// Append a default-constructed element
Appended(): IntWalk_WalkingData;

// Set value at theIndex
SetValue(theIndex: number, theValue: IntWalk_WalkingData): IntWalk_WalkingData;
// theIndex: element index (0-based)
// theValue: value to set

// Insert theValue before theIndex, shifting elements right
InsertBefore(theIndex: number, theValue: IntWalk_WalkingData): void;
// theIndex: insertion position (0-based)
// theValue: element to insert

// Insert theValue after theIndex, shifting elements right
InsertAfter(theIndex: number, theValue: IntWalk_WalkingData): void;
// theIndex: position after which to insert (0-based)
// theValue: element to insert

// Remove the last element
EraseLast(): void;

// Remove element at theIndex, shifting subsequent elements left
Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;
Erase(theIndex: number): void;
Erase(theFrom: number, theTo: number): void;
// theIndex: element index (0-based)

// Remove all elements
Clear(theReleaseMemory?: boolean): void;
// theReleaseMemory: if true, deallocate the buffer

// Returns a span as Array1 with shared memory
ToArray1(): any;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

IntWalk_WalkingData: declare class IntWalk_WalkingData

constructor

ustart: number

vstart: number

etat: number

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
