# libcascade — NCollection (16)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_IGESSolid_VertexList: declare class NCollection_Array1_handle_IGESSolid_VertexList

constructor

// Initialise the items with theValue
Init(theValue: IGESSolid_VertexList): void;

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
Assign(theOther: NCollection_Array1_handle_IGESSolid_VertexList): NCollection_Array1_handle_IGESSolid_VertexList;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESSolid_VertexList): NCollection_Array1_handle_IGESSolid_VertexList;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESSolid_VertexList): NCollection_Array1_handle_IGESSolid_VertexList;
// theOther: Mutated in place

First(): IGESSolid_VertexList;

ChangeFirst(): IGESSolid_VertexList;

Last(): IGESSolid_VertexList;

ChangeLast(): IGESSolid_VertexList;

// Constant value access
Value(theIndex: number): IGESSolid_VertexList;

// Variable value access
ChangeValue(theIndex: number): IGESSolid_VertexList;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESSolid_VertexList;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESSolid_VertexList;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESSolid_VertexList): void;

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
NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember: declare class NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember

constructor

// Initialise the items with theValue
Init(theValue: unknown): void;

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
Assign(theOther: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember;

// Move assignment
Move(theOther: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember): NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_CurveElementPurposeMember;
// theOther: Mutated in place

First(): unknown;

ChangeFirst(): unknown;

Last(): unknown;

ChangeLast(): unknown;

// Constant value access
Value(theIndex: number): unknown;

// Variable value access
ChangeValue(theIndex: number): unknown;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: unknown): void;

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
NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember: declare class NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember

constructor

// Initialise the items with theValue
Init(theValue: unknown): void;

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
Assign(theOther: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember): NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember): NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember;

// Move assignment
Move(theOther: NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember): NCollection_Array1_handle_NCollection_HSequence_handle_StepElement_SurfaceElementPurposeMember;
// theOther: Mutated in place

First(): unknown;

ChangeFirst(): unknown;

Last(): unknown;

ChangeLast(): unknown;

// Constant value access
Value(theIndex: number): unknown;

// Variable value access
ChangeValue(theIndex: number): unknown;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): unknown;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: unknown): void;

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
NCollection_Array1_handle_Standard_Persistent: declare class NCollection_Array1_handle_Standard_Persistent

constructor

// Initialise the items with theValue
Init(theValue: Standard_Persistent): void;

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
Assign(theOther: NCollection_Array1_handle_Standard_Persistent): NCollection_Array1_handle_Standard_Persistent;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Standard_Persistent): NCollection_Array1_handle_Standard_Persistent;

// Move assignment
Move(theOther: NCollection_Array1_handle_Standard_Persistent): NCollection_Array1_handle_Standard_Persistent;
// theOther: Mutated in place

First(): Standard_Persistent;

ChangeFirst(): Standard_Persistent;

Last(): Standard_Persistent;

ChangeLast(): Standard_Persistent;

// Constant value access
Value(theIndex: number): Standard_Persistent;

// Variable value access
ChangeValue(theIndex: number): Standard_Persistent;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Standard_Persistent;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Standard_Persistent;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Standard_Persistent): void;

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
NCollection_Array1_handle_Standard_Transient: declare class NCollection_Array1_handle_Standard_Transient

constructor

// Initialise the items with theValue
Init(theValue: Standard_Transient): void;

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
Assign(theOther: NCollection_Array1_handle_Standard_Transient): NCollection_Array1_handle_Standard_Transient;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Standard_Transient): NCollection_Array1_handle_Standard_Transient;

// Move assignment
Move(theOther: NCollection_Array1_handle_Standard_Transient): NCollection_Array1_handle_Standard_Transient;
// theOther: Mutated in place

First(): Standard_Transient;

ChangeFirst(): Standard_Transient;

Last(): Standard_Transient;

ChangeLast(): Standard_Transient;

// Constant value access
Value(theIndex: number): Standard_Transient;

// Variable value access
ChangeValue(theIndex: number): Standard_Transient;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Standard_Transient;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Standard_Transient;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Standard_Transient): void;

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
NCollection_Array1_handle_StepBasic_Approval: declare class NCollection_Array1_handle_StepBasic_Approval

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_Approval): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_Approval): NCollection_Array1_handle_StepBasic_Approval;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_Approval): NCollection_Array1_handle_StepBasic_Approval;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_Approval): NCollection_Array1_handle_StepBasic_Approval;
// theOther: Mutated in place

First(): StepBasic_Approval;

ChangeFirst(): StepBasic_Approval;

Last(): StepBasic_Approval;

ChangeLast(): StepBasic_Approval;

// Constant value access
Value(theIndex: number): StepBasic_Approval;

// Variable value access
ChangeValue(theIndex: number): StepBasic_Approval;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_Approval;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_Approval;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_Approval): void;

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
NCollection_Array1_handle_StepBasic_DerivedUnitElement: declare class NCollection_Array1_handle_StepBasic_DerivedUnitElement

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_DerivedUnitElement): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_DerivedUnitElement): NCollection_Array1_handle_StepBasic_DerivedUnitElement;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_DerivedUnitElement): NCollection_Array1_handle_StepBasic_DerivedUnitElement;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_DerivedUnitElement): NCollection_Array1_handle_StepBasic_DerivedUnitElement;
// theOther: Mutated in place

First(): StepBasic_DerivedUnitElement;

ChangeFirst(): StepBasic_DerivedUnitElement;

Last(): StepBasic_DerivedUnitElement;

ChangeLast(): StepBasic_DerivedUnitElement;

// Constant value access
Value(theIndex: number): StepBasic_DerivedUnitElement;

// Variable value access
ChangeValue(theIndex: number): StepBasic_DerivedUnitElement;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_DerivedUnitElement;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_DerivedUnitElement;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_DerivedUnitElement): void;

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
NCollection_Array1_handle_StepBasic_Document: declare class NCollection_Array1_handle_StepBasic_Document

constructor

// Initialise the items with theValue
Init(theValue: StepBasic_Document): void;

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
Assign(theOther: NCollection_Array1_handle_StepBasic_Document): NCollection_Array1_handle_StepBasic_Document;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepBasic_Document): NCollection_Array1_handle_StepBasic_Document;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepBasic_Document): NCollection_Array1_handle_StepBasic_Document;
// theOther: Mutated in place

First(): StepBasic_Document;

ChangeFirst(): StepBasic_Document;

Last(): StepBasic_Document;

ChangeLast(): StepBasic_Document;

// Constant value access
Value(theIndex: number): StepBasic_Document;

// Variable value access
ChangeValue(theIndex: number): StepBasic_Document;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepBasic_Document;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepBasic_Document;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepBasic_Document): void;

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
