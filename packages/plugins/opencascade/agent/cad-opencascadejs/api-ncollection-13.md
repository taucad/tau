# libcascade — NCollection (13)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_Geom2d_Curve: declare class NCollection_Array1_handle_Geom2d_Curve

constructor

// Initialise the items with theValue
Init(theValue: Geom2d_Curve): void;

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
Assign(theOther: NCollection_Array1_handle_Geom2d_Curve): NCollection_Array1_handle_Geom2d_Curve;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Geom2d_Curve): NCollection_Array1_handle_Geom2d_Curve;

// Move assignment
Move(theOther: NCollection_Array1_handle_Geom2d_Curve): NCollection_Array1_handle_Geom2d_Curve;
// theOther: Mutated in place

First(): Geom2d_Curve;

ChangeFirst(): Geom2d_Curve;

Last(): Geom2d_Curve;

ChangeLast(): Geom2d_Curve;

// Constant value access
Value(theIndex: number): Geom2d_Curve;

// Variable value access
ChangeValue(theIndex: number): Geom2d_Curve;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom2d_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom2d_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Geom2d_Curve): void;

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
NCollection_Array1_handle_Geom_BSplineCurve: declare class NCollection_Array1_handle_Geom_BSplineCurve

constructor

// Initialise the items with theValue
Init(theValue: Geom_BSplineCurve): void;

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
Assign(theOther: NCollection_Array1_handle_Geom_BSplineCurve): NCollection_Array1_handle_Geom_BSplineCurve;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Geom_BSplineCurve): NCollection_Array1_handle_Geom_BSplineCurve;

// Move assignment
Move(theOther: NCollection_Array1_handle_Geom_BSplineCurve): NCollection_Array1_handle_Geom_BSplineCurve;
// theOther: Mutated in place

First(): Geom_BSplineCurve;

ChangeFirst(): Geom_BSplineCurve;

Last(): Geom_BSplineCurve;

ChangeLast(): Geom_BSplineCurve;

// Constant value access
Value(theIndex: number): Geom_BSplineCurve;

// Variable value access
ChangeValue(theIndex: number): Geom_BSplineCurve;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom_BSplineCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom_BSplineCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Geom_BSplineCurve): void;

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
NCollection_Array1_handle_Geom_BezierCurve: declare class NCollection_Array1_handle_Geom_BezierCurve

constructor

// Initialise the items with theValue
Init(theValue: Geom_BezierCurve): void;

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
Assign(theOther: NCollection_Array1_handle_Geom_BezierCurve): NCollection_Array1_handle_Geom_BezierCurve;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Geom_BezierCurve): NCollection_Array1_handle_Geom_BezierCurve;

// Move assignment
Move(theOther: NCollection_Array1_handle_Geom_BezierCurve): NCollection_Array1_handle_Geom_BezierCurve;
// theOther: Mutated in place

First(): Geom_BezierCurve;

ChangeFirst(): Geom_BezierCurve;

Last(): Geom_BezierCurve;

ChangeLast(): Geom_BezierCurve;

// Constant value access
Value(theIndex: number): Geom_BezierCurve;

// Variable value access
ChangeValue(theIndex: number): Geom_BezierCurve;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom_BezierCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom_BezierCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Geom_BezierCurve): void;

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
NCollection_Array1_handle_Geom_Curve: declare class NCollection_Array1_handle_Geom_Curve

constructor

// Initialise the items with theValue
Init(theValue: Geom_Curve): void;

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
Assign(theOther: NCollection_Array1_handle_Geom_Curve): NCollection_Array1_handle_Geom_Curve;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Geom_Curve): NCollection_Array1_handle_Geom_Curve;

// Move assignment
Move(theOther: NCollection_Array1_handle_Geom_Curve): NCollection_Array1_handle_Geom_Curve;
// theOther: Mutated in place

First(): Geom_Curve;

ChangeFirst(): Geom_Curve;

Last(): Geom_Curve;

ChangeLast(): Geom_Curve;

// Constant value access
Value(theIndex: number): Geom_Curve;

// Variable value access
ChangeValue(theIndex: number): Geom_Curve;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom_Curve;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Geom_Curve): void;

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
NCollection_Array1_handle_HLRAlgo_PolyData: declare class NCollection_Array1_handle_HLRAlgo_PolyData

constructor

// Initialise the items with theValue
Init(theValue: HLRAlgo_PolyData): void;

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
Assign(theOther: NCollection_Array1_handle_HLRAlgo_PolyData): NCollection_Array1_handle_HLRAlgo_PolyData;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_HLRAlgo_PolyData): NCollection_Array1_handle_HLRAlgo_PolyData;

// Move assignment
Move(theOther: NCollection_Array1_handle_HLRAlgo_PolyData): NCollection_Array1_handle_HLRAlgo_PolyData;
// theOther: Mutated in place

First(): HLRAlgo_PolyData;

ChangeFirst(): HLRAlgo_PolyData;

Last(): HLRAlgo_PolyData;

ChangeLast(): HLRAlgo_PolyData;

// Constant value access
Value(theIndex: number): HLRAlgo_PolyData;

// Variable value access
ChangeValue(theIndex: number): HLRAlgo_PolyData;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): HLRAlgo_PolyData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): HLRAlgo_PolyData;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: HLRAlgo_PolyData): void;

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
NCollection_Array1_handle_HLRAlgo_PolyShellData: declare class NCollection_Array1_handle_HLRAlgo_PolyShellData

constructor

// Initialise the items with theValue
Init(theValue: HLRAlgo_PolyShellData): void;

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
Assign(theOther: NCollection_Array1_handle_HLRAlgo_PolyShellData): NCollection_Array1_handle_HLRAlgo_PolyShellData;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_HLRAlgo_PolyShellData): NCollection_Array1_handle_HLRAlgo_PolyShellData;

// Move assignment
Move(theOther: NCollection_Array1_handle_HLRAlgo_PolyShellData): NCollection_Array1_handle_HLRAlgo_PolyShellData;
// theOther: Mutated in place

First(): HLRAlgo_PolyShellData;

ChangeFirst(): HLRAlgo_PolyShellData;

Last(): HLRAlgo_PolyShellData;

ChangeLast(): HLRAlgo_PolyShellData;

// Constant value access
Value(theIndex: number): HLRAlgo_PolyShellData;

// Variable value access
ChangeValue(theIndex: number): HLRAlgo_PolyShellData;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): HLRAlgo_PolyShellData;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): HLRAlgo_PolyShellData;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: HLRAlgo_PolyShellData): void;

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
NCollection_Array1_handle_IGESAppli_FiniteElement: declare class NCollection_Array1_handle_IGESAppli_FiniteElement

constructor

// Initialise the items with theValue
Init(theValue: IGESAppli_FiniteElement): void;

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
Assign(theOther: NCollection_Array1_handle_IGESAppli_FiniteElement): NCollection_Array1_handle_IGESAppli_FiniteElement;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESAppli_FiniteElement): NCollection_Array1_handle_IGESAppli_FiniteElement;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESAppli_FiniteElement): NCollection_Array1_handle_IGESAppli_FiniteElement;
// theOther: Mutated in place

First(): IGESAppli_FiniteElement;

ChangeFirst(): IGESAppli_FiniteElement;

Last(): IGESAppli_FiniteElement;

ChangeLast(): IGESAppli_FiniteElement;

// Constant value access
Value(theIndex: number): IGESAppli_FiniteElement;

// Variable value access
ChangeValue(theIndex: number): IGESAppli_FiniteElement;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESAppli_FiniteElement;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESAppli_FiniteElement;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESAppli_FiniteElement): void;

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
NCollection_Array1_handle_IGESAppli_Node: declare class NCollection_Array1_handle_IGESAppli_Node

constructor

// Initialise the items with theValue
Init(theValue: IGESAppli_Node): void;

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
Assign(theOther: NCollection_Array1_handle_IGESAppli_Node): NCollection_Array1_handle_IGESAppli_Node;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESAppli_Node): NCollection_Array1_handle_IGESAppli_Node;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESAppli_Node): NCollection_Array1_handle_IGESAppli_Node;
// theOther: Mutated in place

First(): IGESAppli_Node;

ChangeFirst(): IGESAppli_Node;

Last(): IGESAppli_Node;

ChangeLast(): IGESAppli_Node;

// Constant value access
Value(theIndex: number): IGESAppli_Node;

// Variable value access
ChangeValue(theIndex: number): IGESAppli_Node;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESAppli_Node;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESAppli_Node;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESAppli_Node): void;

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
