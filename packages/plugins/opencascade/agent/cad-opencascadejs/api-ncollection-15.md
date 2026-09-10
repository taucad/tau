# libcascade — NCollection (15)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_IGESGeom_CurveOnSurface: declare class NCollection_Array1_handle_IGESGeom_CurveOnSurface

constructor

// Initialise the items with theValue
Init(theValue: IGESGeom_CurveOnSurface): void;

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
Assign(theOther: NCollection_Array1_handle_IGESGeom_CurveOnSurface): NCollection_Array1_handle_IGESGeom_CurveOnSurface;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESGeom_CurveOnSurface): NCollection_Array1_handle_IGESGeom_CurveOnSurface;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESGeom_CurveOnSurface): NCollection_Array1_handle_IGESGeom_CurveOnSurface;
// theOther: Mutated in place

First(): IGESGeom_CurveOnSurface;

ChangeFirst(): IGESGeom_CurveOnSurface;

Last(): IGESGeom_CurveOnSurface;

ChangeLast(): IGESGeom_CurveOnSurface;

// Constant value access
Value(theIndex: number): IGESGeom_CurveOnSurface;

// Variable value access
ChangeValue(theIndex: number): IGESGeom_CurveOnSurface;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESGeom_CurveOnSurface;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESGeom_CurveOnSurface;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESGeom_CurveOnSurface): void;

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
NCollection_Array1_handle_IGESGeom_TransformationMatrix: declare class NCollection_Array1_handle_IGESGeom_TransformationMatrix

constructor

// Initialise the items with theValue
Init(theValue: IGESGeom_TransformationMatrix): void;

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
Assign(theOther: NCollection_Array1_handle_IGESGeom_TransformationMatrix): NCollection_Array1_handle_IGESGeom_TransformationMatrix;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESGeom_TransformationMatrix): NCollection_Array1_handle_IGESGeom_TransformationMatrix;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESGeom_TransformationMatrix): NCollection_Array1_handle_IGESGeom_TransformationMatrix;
// theOther: Mutated in place

First(): IGESGeom_TransformationMatrix;

ChangeFirst(): IGESGeom_TransformationMatrix;

Last(): IGESGeom_TransformationMatrix;

ChangeLast(): IGESGeom_TransformationMatrix;

// Constant value access
Value(theIndex: number): IGESGeom_TransformationMatrix;

// Variable value access
ChangeValue(theIndex: number): IGESGeom_TransformationMatrix;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESGeom_TransformationMatrix;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESGeom_TransformationMatrix;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESGeom_TransformationMatrix): void;

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
NCollection_Array1_handle_IGESGraph_Color: declare class NCollection_Array1_handle_IGESGraph_Color

constructor

// Initialise the items with theValue
Init(theValue: IGESGraph_Color): void;

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
Assign(theOther: NCollection_Array1_handle_IGESGraph_Color): NCollection_Array1_handle_IGESGraph_Color;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESGraph_Color): NCollection_Array1_handle_IGESGraph_Color;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESGraph_Color): NCollection_Array1_handle_IGESGraph_Color;
// theOther: Mutated in place

First(): IGESGraph_Color;

ChangeFirst(): IGESGraph_Color;

Last(): IGESGraph_Color;

ChangeLast(): IGESGraph_Color;

// Constant value access
Value(theIndex: number): IGESGraph_Color;

// Variable value access
ChangeValue(theIndex: number): IGESGraph_Color;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESGraph_Color;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESGraph_Color;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESGraph_Color): void;

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
NCollection_Array1_handle_IGESGraph_TextDisplayTemplate: declare class NCollection_Array1_handle_IGESGraph_TextDisplayTemplate

constructor

// Initialise the items with theValue
Init(theValue: IGESGraph_TextDisplayTemplate): void;

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
Assign(theOther: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate): NCollection_Array1_handle_IGESGraph_TextDisplayTemplate;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate): NCollection_Array1_handle_IGESGraph_TextDisplayTemplate;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESGraph_TextDisplayTemplate): NCollection_Array1_handle_IGESGraph_TextDisplayTemplate;
// theOther: Mutated in place

First(): IGESGraph_TextDisplayTemplate;

ChangeFirst(): IGESGraph_TextDisplayTemplate;

Last(): IGESGraph_TextDisplayTemplate;

ChangeLast(): IGESGraph_TextDisplayTemplate;

// Constant value access
Value(theIndex: number): IGESGraph_TextDisplayTemplate;

// Variable value access
ChangeValue(theIndex: number): IGESGraph_TextDisplayTemplate;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESGraph_TextDisplayTemplate;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESGraph_TextDisplayTemplate;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESGraph_TextDisplayTemplate): void;

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
NCollection_Array1_handle_IGESGraph_TextFontDef: declare class NCollection_Array1_handle_IGESGraph_TextFontDef

constructor

// Initialise the items with theValue
Init(theValue: IGESGraph_TextFontDef): void;

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
Assign(theOther: NCollection_Array1_handle_IGESGraph_TextFontDef): NCollection_Array1_handle_IGESGraph_TextFontDef;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESGraph_TextFontDef): NCollection_Array1_handle_IGESGraph_TextFontDef;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESGraph_TextFontDef): NCollection_Array1_handle_IGESGraph_TextFontDef;
// theOther: Mutated in place

First(): IGESGraph_TextFontDef;

ChangeFirst(): IGESGraph_TextFontDef;

Last(): IGESGraph_TextFontDef;

ChangeLast(): IGESGraph_TextFontDef;

// Constant value access
Value(theIndex: number): IGESGraph_TextFontDef;

// Variable value access
ChangeValue(theIndex: number): IGESGraph_TextFontDef;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESGraph_TextFontDef;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESGraph_TextFontDef;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESGraph_TextFontDef): void;

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
NCollection_Array1_handle_IGESSolid_Face: declare class NCollection_Array1_handle_IGESSolid_Face

constructor

// Initialise the items with theValue
Init(theValue: IGESSolid_Face): void;

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
Assign(theOther: NCollection_Array1_handle_IGESSolid_Face): NCollection_Array1_handle_IGESSolid_Face;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESSolid_Face): NCollection_Array1_handle_IGESSolid_Face;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESSolid_Face): NCollection_Array1_handle_IGESSolid_Face;
// theOther: Mutated in place

First(): IGESSolid_Face;

ChangeFirst(): IGESSolid_Face;

Last(): IGESSolid_Face;

ChangeLast(): IGESSolid_Face;

// Constant value access
Value(theIndex: number): IGESSolid_Face;

// Variable value access
ChangeValue(theIndex: number): IGESSolid_Face;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESSolid_Face;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESSolid_Face;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESSolid_Face): void;

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
NCollection_Array1_handle_IGESSolid_Loop: declare class NCollection_Array1_handle_IGESSolid_Loop

constructor

// Initialise the items with theValue
Init(theValue: IGESSolid_Loop): void;

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
Assign(theOther: NCollection_Array1_handle_IGESSolid_Loop): NCollection_Array1_handle_IGESSolid_Loop;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESSolid_Loop): NCollection_Array1_handle_IGESSolid_Loop;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESSolid_Loop): NCollection_Array1_handle_IGESSolid_Loop;
// theOther: Mutated in place

First(): IGESSolid_Loop;

ChangeFirst(): IGESSolid_Loop;

Last(): IGESSolid_Loop;

ChangeLast(): IGESSolid_Loop;

// Constant value access
Value(theIndex: number): IGESSolid_Loop;

// Variable value access
ChangeValue(theIndex: number): IGESSolid_Loop;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESSolid_Loop;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESSolid_Loop;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESSolid_Loop): void;

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
NCollection_Array1_handle_IGESSolid_Shell: declare class NCollection_Array1_handle_IGESSolid_Shell

constructor

// Initialise the items with theValue
Init(theValue: IGESSolid_Shell): void;

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
Assign(theOther: NCollection_Array1_handle_IGESSolid_Shell): NCollection_Array1_handle_IGESSolid_Shell;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_IGESSolid_Shell): NCollection_Array1_handle_IGESSolid_Shell;

// Move assignment
Move(theOther: NCollection_Array1_handle_IGESSolid_Shell): NCollection_Array1_handle_IGESSolid_Shell;
// theOther: Mutated in place

First(): IGESSolid_Shell;

ChangeFirst(): IGESSolid_Shell;

Last(): IGESSolid_Shell;

ChangeLast(): IGESSolid_Shell;

// Constant value access
Value(theIndex: number): IGESSolid_Shell;

// Variable value access
ChangeValue(theIndex: number): IGESSolid_Shell;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): IGESSolid_Shell;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): IGESSolid_Shell;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: IGESSolid_Shell): void;

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
