# libcascade — NCollection (20)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepShape_ConnectedEdgeSet: declare class NCollection_Array1_handle_StepShape_ConnectedEdgeSet

constructor

// Initialise the items with theValue
Init(theValue: StepShape_ConnectedEdgeSet): void;

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
Assign(theOther: NCollection_Array1_handle_StepShape_ConnectedEdgeSet): NCollection_Array1_handle_StepShape_ConnectedEdgeSet;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepShape_ConnectedEdgeSet): NCollection_Array1_handle_StepShape_ConnectedEdgeSet;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepShape_ConnectedEdgeSet): NCollection_Array1_handle_StepShape_ConnectedEdgeSet;
// theOther: Mutated in place

First(): StepShape_ConnectedEdgeSet;

ChangeFirst(): StepShape_ConnectedEdgeSet;

Last(): StepShape_ConnectedEdgeSet;

ChangeLast(): StepShape_ConnectedEdgeSet;

// Constant value access
Value(theIndex: number): StepShape_ConnectedEdgeSet;

// Variable value access
ChangeValue(theIndex: number): StepShape_ConnectedEdgeSet;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_ConnectedEdgeSet;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_ConnectedEdgeSet;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_ConnectedEdgeSet): void;

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
NCollection_Array1_handle_StepShape_ConnectedFaceSet: declare class NCollection_Array1_handle_StepShape_ConnectedFaceSet

constructor

// Initialise the items with theValue
Init(theValue: StepShape_ConnectedFaceSet): void;

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
Assign(theOther: NCollection_Array1_handle_StepShape_ConnectedFaceSet): NCollection_Array1_handle_StepShape_ConnectedFaceSet;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepShape_ConnectedFaceSet): NCollection_Array1_handle_StepShape_ConnectedFaceSet;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepShape_ConnectedFaceSet): NCollection_Array1_handle_StepShape_ConnectedFaceSet;
// theOther: Mutated in place

First(): StepShape_ConnectedFaceSet;

ChangeFirst(): StepShape_ConnectedFaceSet;

Last(): StepShape_ConnectedFaceSet;

ChangeLast(): StepShape_ConnectedFaceSet;

// Constant value access
Value(theIndex: number): StepShape_ConnectedFaceSet;

// Variable value access
ChangeValue(theIndex: number): StepShape_ConnectedFaceSet;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_ConnectedFaceSet;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_ConnectedFaceSet;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_ConnectedFaceSet): void;

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
NCollection_Array1_handle_StepShape_Edge: declare class NCollection_Array1_handle_StepShape_Edge

constructor

// Initialise the items with theValue
Init(theValue: StepShape_Edge): void;

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
Assign(theOther: NCollection_Array1_handle_StepShape_Edge): NCollection_Array1_handle_StepShape_Edge;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepShape_Edge): NCollection_Array1_handle_StepShape_Edge;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepShape_Edge): NCollection_Array1_handle_StepShape_Edge;
// theOther: Mutated in place

First(): StepShape_Edge;

ChangeFirst(): StepShape_Edge;

Last(): StepShape_Edge;

ChangeLast(): StepShape_Edge;

// Constant value access
Value(theIndex: number): StepShape_Edge;

// Variable value access
ChangeValue(theIndex: number): StepShape_Edge;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_Edge;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_Edge;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_Edge): void;

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
NCollection_Array1_handle_StepShape_Face: declare class NCollection_Array1_handle_StepShape_Face

constructor

// Initialise the items with theValue
Init(theValue: StepShape_Face): void;

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
Assign(theOther: NCollection_Array1_handle_StepShape_Face): NCollection_Array1_handle_StepShape_Face;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepShape_Face): NCollection_Array1_handle_StepShape_Face;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepShape_Face): NCollection_Array1_handle_StepShape_Face;
// theOther: Mutated in place

First(): StepShape_Face;

ChangeFirst(): StepShape_Face;

Last(): StepShape_Face;

ChangeLast(): StepShape_Face;

// Constant value access
Value(theIndex: number): StepShape_Face;

// Variable value access
ChangeValue(theIndex: number): StepShape_Face;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_Face;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_Face;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_Face): void;

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
NCollection_Array1_handle_StepShape_FaceBound: declare class NCollection_Array1_handle_StepShape_FaceBound

constructor

// Initialise the items with theValue
Init(theValue: StepShape_FaceBound): void;

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
Assign(theOther: NCollection_Array1_handle_StepShape_FaceBound): NCollection_Array1_handle_StepShape_FaceBound;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepShape_FaceBound): NCollection_Array1_handle_StepShape_FaceBound;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepShape_FaceBound): NCollection_Array1_handle_StepShape_FaceBound;
// theOther: Mutated in place

First(): StepShape_FaceBound;

ChangeFirst(): StepShape_FaceBound;

Last(): StepShape_FaceBound;

ChangeLast(): StepShape_FaceBound;

// Constant value access
Value(theIndex: number): StepShape_FaceBound;

// Variable value access
ChangeValue(theIndex: number): StepShape_FaceBound;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_FaceBound;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_FaceBound;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_FaceBound): void;

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
NCollection_Array1_handle_StepShape_OrientedClosedShell: declare class NCollection_Array1_handle_StepShape_OrientedClosedShell

constructor

// Initialise the items with theValue
Init(theValue: StepShape_OrientedClosedShell): void;

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
Assign(theOther: NCollection_Array1_handle_StepShape_OrientedClosedShell): NCollection_Array1_handle_StepShape_OrientedClosedShell;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepShape_OrientedClosedShell): NCollection_Array1_handle_StepShape_OrientedClosedShell;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepShape_OrientedClosedShell): NCollection_Array1_handle_StepShape_OrientedClosedShell;
// theOther: Mutated in place

First(): StepShape_OrientedClosedShell;

ChangeFirst(): StepShape_OrientedClosedShell;

Last(): StepShape_OrientedClosedShell;

ChangeLast(): StepShape_OrientedClosedShell;

// Constant value access
Value(theIndex: number): StepShape_OrientedClosedShell;

// Variable value access
ChangeValue(theIndex: number): StepShape_OrientedClosedShell;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_OrientedClosedShell;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_OrientedClosedShell;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_OrientedClosedShell): void;

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
NCollection_Array1_handle_StepShape_OrientedEdge: declare class NCollection_Array1_handle_StepShape_OrientedEdge

constructor

// Initialise the items with theValue
Init(theValue: StepShape_OrientedEdge): void;

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
Assign(theOther: NCollection_Array1_handle_StepShape_OrientedEdge): NCollection_Array1_handle_StepShape_OrientedEdge;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepShape_OrientedEdge): NCollection_Array1_handle_StepShape_OrientedEdge;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepShape_OrientedEdge): NCollection_Array1_handle_StepShape_OrientedEdge;
// theOther: Mutated in place

First(): StepShape_OrientedEdge;

ChangeFirst(): StepShape_OrientedEdge;

Last(): StepShape_OrientedEdge;

ChangeLast(): StepShape_OrientedEdge;

// Constant value access
Value(theIndex: number): StepShape_OrientedEdge;

// Variable value access
ChangeValue(theIndex: number): StepShape_OrientedEdge;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_OrientedEdge;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_OrientedEdge;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_OrientedEdge): void;

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
NCollection_Array1_handle_StepVisual_CurveStyleFontPattern: declare class NCollection_Array1_handle_StepVisual_CurveStyleFontPattern

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_CurveStyleFontPattern): void;

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
Assign(theOther: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern): NCollection_Array1_handle_StepVisual_CurveStyleFontPattern;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern): NCollection_Array1_handle_StepVisual_CurveStyleFontPattern;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern): NCollection_Array1_handle_StepVisual_CurveStyleFontPattern;
// theOther: Mutated in place

First(): StepVisual_CurveStyleFontPattern;

ChangeFirst(): StepVisual_CurveStyleFontPattern;

Last(): StepVisual_CurveStyleFontPattern;

ChangeLast(): StepVisual_CurveStyleFontPattern;

// Constant value access
Value(theIndex: number): StepVisual_CurveStyleFontPattern;

// Variable value access
ChangeValue(theIndex: number): StepVisual_CurveStyleFontPattern;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_CurveStyleFontPattern;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_CurveStyleFontPattern;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_CurveStyleFontPattern): void;

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
