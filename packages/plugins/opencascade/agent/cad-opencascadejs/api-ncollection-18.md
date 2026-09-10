# libcascade — NCollection (18)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepDimTol_DatumReferenceElement: declare class NCollection_Array1_handle_StepDimTol_DatumReferenceElement

constructor

// Initialise the items with theValue
Init(theValue: StepDimTol_DatumReferenceElement): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepDimTol_DatumReferenceElement): NCollection_Array1_handle_StepDimTol_DatumReferenceElement;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepDimTol_DatumReferenceElement): NCollection_Array1_handle_StepDimTol_DatumReferenceElement;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepDimTol_DatumReferenceElement): NCollection_Array1_handle_StepDimTol_DatumReferenceElement;
// theOther: Mutated in place

First(): StepDimTol_DatumReferenceElement;

ChangeFirst(): StepDimTol_DatumReferenceElement;

Last(): StepDimTol_DatumReferenceElement;

ChangeLast(): StepDimTol_DatumReferenceElement;

// Constant value access
Value(theIndex: number): StepDimTol_DatumReferenceElement;

// Variable value access
ChangeValue(theIndex: number): StepDimTol_DatumReferenceElement;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepDimTol_DatumReferenceElement;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepDimTol_DatumReferenceElement;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepDimTol_DatumReferenceElement): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket: declare class NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket

constructor

// Initialise the items with theValue
Init(theValue: StepElement_CurveElementEndReleasePacket): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket): NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket): NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket): NCollection_Array1_handle_StepElement_CurveElementEndReleasePacket;
// theOther: Mutated in place

First(): StepElement_CurveElementEndReleasePacket;

ChangeFirst(): StepElement_CurveElementEndReleasePacket;

Last(): StepElement_CurveElementEndReleasePacket;

ChangeLast(): StepElement_CurveElementEndReleasePacket;

// Constant value access
Value(theIndex: number): StepElement_CurveElementEndReleasePacket;

// Variable value access
ChangeValue(theIndex: number): StepElement_CurveElementEndReleasePacket;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepElement_CurveElementEndReleasePacket;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepElement_CurveElementEndReleasePacket;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepElement_CurveElementEndReleasePacket): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepElement_CurveElementSectionDefinition: declare class NCollection_Array1_handle_StepElement_CurveElementSectionDefinition

constructor

// Initialise the items with theValue
Init(theValue: StepElement_CurveElementSectionDefinition): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepElement_CurveElementSectionDefinition): NCollection_Array1_handle_StepElement_CurveElementSectionDefinition;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepElement_CurveElementSectionDefinition): NCollection_Array1_handle_StepElement_CurveElementSectionDefinition;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepElement_CurveElementSectionDefinition): NCollection_Array1_handle_StepElement_CurveElementSectionDefinition;
// theOther: Mutated in place

First(): StepElement_CurveElementSectionDefinition;

ChangeFirst(): StepElement_CurveElementSectionDefinition;

Last(): StepElement_CurveElementSectionDefinition;

ChangeLast(): StepElement_CurveElementSectionDefinition;

// Constant value access
Value(theIndex: number): StepElement_CurveElementSectionDefinition;

// Variable value access
ChangeValue(theIndex: number): StepElement_CurveElementSectionDefinition;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepElement_CurveElementSectionDefinition;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepElement_CurveElementSectionDefinition;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepElement_CurveElementSectionDefinition): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepElement_SurfaceSection: declare class NCollection_Array1_handle_StepElement_SurfaceSection

constructor

// Initialise the items with theValue
Init(theValue: StepElement_SurfaceSection): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepElement_SurfaceSection): NCollection_Array1_handle_StepElement_SurfaceSection;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepElement_SurfaceSection): NCollection_Array1_handle_StepElement_SurfaceSection;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepElement_SurfaceSection): NCollection_Array1_handle_StepElement_SurfaceSection;
// theOther: Mutated in place

First(): StepElement_SurfaceSection;

ChangeFirst(): StepElement_SurfaceSection;

Last(): StepElement_SurfaceSection;

ChangeLast(): StepElement_SurfaceSection;

// Constant value access
Value(theIndex: number): StepElement_SurfaceSection;

// Variable value access
ChangeValue(theIndex: number): StepElement_SurfaceSection;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepElement_SurfaceSection;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepElement_SurfaceSection;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepElement_SurfaceSection): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepElement_VolumeElementPurposeMember: declare class NCollection_Array1_handle_StepElement_VolumeElementPurposeMember

constructor

// Initialise the items with theValue
Init(theValue: StepElement_VolumeElementPurposeMember): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepElement_VolumeElementPurposeMember): NCollection_Array1_handle_StepElement_VolumeElementPurposeMember;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepElement_VolumeElementPurposeMember): NCollection_Array1_handle_StepElement_VolumeElementPurposeMember;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepElement_VolumeElementPurposeMember): NCollection_Array1_handle_StepElement_VolumeElementPurposeMember;
// theOther: Mutated in place

First(): StepElement_VolumeElementPurposeMember;

ChangeFirst(): StepElement_VolumeElementPurposeMember;

Last(): StepElement_VolumeElementPurposeMember;

ChangeLast(): StepElement_VolumeElementPurposeMember;

// Constant value access
Value(theIndex: number): StepElement_VolumeElementPurposeMember;

// Variable value access
ChangeValue(theIndex: number): StepElement_VolumeElementPurposeMember;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepElement_VolumeElementPurposeMember;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepElement_VolumeElementPurposeMember;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepElement_VolumeElementPurposeMember): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepFEA_CurveElementEndOffset: declare class NCollection_Array1_handle_StepFEA_CurveElementEndOffset

constructor

// Initialise the items with theValue
Init(theValue: StepFEA_CurveElementEndOffset): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepFEA_CurveElementEndOffset): NCollection_Array1_handle_StepFEA_CurveElementEndOffset;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepFEA_CurveElementEndOffset): NCollection_Array1_handle_StepFEA_CurveElementEndOffset;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepFEA_CurveElementEndOffset): NCollection_Array1_handle_StepFEA_CurveElementEndOffset;
// theOther: Mutated in place

First(): StepFEA_CurveElementEndOffset;

ChangeFirst(): StepFEA_CurveElementEndOffset;

Last(): StepFEA_CurveElementEndOffset;

ChangeLast(): StepFEA_CurveElementEndOffset;

// Constant value access
Value(theIndex: number): StepFEA_CurveElementEndOffset;

// Variable value access
ChangeValue(theIndex: number): StepFEA_CurveElementEndOffset;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_CurveElementEndOffset;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_CurveElementEndOffset;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepFEA_CurveElementEndOffset): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepFEA_CurveElementEndRelease: declare class NCollection_Array1_handle_StepFEA_CurveElementEndRelease

constructor

// Initialise the items with theValue
Init(theValue: StepFEA_CurveElementEndRelease): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepFEA_CurveElementEndRelease): NCollection_Array1_handle_StepFEA_CurveElementEndRelease;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepFEA_CurveElementEndRelease): NCollection_Array1_handle_StepFEA_CurveElementEndRelease;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepFEA_CurveElementEndRelease): NCollection_Array1_handle_StepFEA_CurveElementEndRelease;
// theOther: Mutated in place

First(): StepFEA_CurveElementEndRelease;

ChangeFirst(): StepFEA_CurveElementEndRelease;

Last(): StepFEA_CurveElementEndRelease;

ChangeLast(): StepFEA_CurveElementEndRelease;

// Constant value access
Value(theIndex: number): StepFEA_CurveElementEndRelease;

// Variable value access
ChangeValue(theIndex: number): StepFEA_CurveElementEndRelease;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_CurveElementEndRelease;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_CurveElementEndRelease;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepFEA_CurveElementEndRelease): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepFEA_CurveElementInterval: declare class NCollection_Array1_handle_StepFEA_CurveElementInterval

constructor

// Initialise the items with theValue
Init(theValue: StepFEA_CurveElementInterval): void;

// Size query
Size(): number;

// Length query (legacy int-returning API)
Length(): number;

// Return TRUE if array has zero length
IsEmpty(): boolean;

// Lower bound
Lower(): number;

// Upper bound
Upper(): number;

// Replaces this array by a copy of theOther array
Assign(theOther: NCollection_Array1_handle_StepFEA_CurveElementInterval): NCollection_Array1_handle_StepFEA_CurveElementInterval;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepFEA_CurveElementInterval): NCollection_Array1_handle_StepFEA_CurveElementInterval;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepFEA_CurveElementInterval): NCollection_Array1_handle_StepFEA_CurveElementInterval;
// theOther: Mutated in place

First(): StepFEA_CurveElementInterval;

ChangeFirst(): StepFEA_CurveElementInterval;

Last(): StepFEA_CurveElementInterval;

ChangeLast(): StepFEA_CurveElementInterval;

// Constant value access
Value(theIndex: number): StepFEA_CurveElementInterval;

// Variable value access
ChangeValue(theIndex: number): StepFEA_CurveElementInterval;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_CurveElementInterval;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_CurveElementInterval;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepFEA_CurveElementInterval): void;

// Changes the lowest bound
UpdateLowerBound(theLower: number): void;

// Changes the upper bound
UpdateUpperBound(theUpper: number): void;

// Resizes the array to specified bounds
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
Resize(theSize: number, theToCopyData: boolean): void;
// theLower: new lower bound of array
// theUpper: new upper bound of array
// theToCopyData: flag to copy existing data into new array

IsDeletable(): boolean;

// Releases the C++ object
delete(): void;

[Symbol.dispose](): void;
