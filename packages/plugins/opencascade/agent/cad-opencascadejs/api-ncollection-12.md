# libcascade — NCollection (12)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_gp_Vec: declare class NCollection_Array1_gp_Vec

constructor

// Initialise the items with theValue
Init(theValue: gp_Vec): void;

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
Assign(theOther: NCollection_Array1_gp_Vec): NCollection_Array1_gp_Vec;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_Vec): NCollection_Array1_gp_Vec;

// Move assignment
Move(theOther: NCollection_Array1_gp_Vec): NCollection_Array1_gp_Vec;
// theOther: Mutated in place

First(): gp_Vec;

ChangeFirst(): gp_Vec;

Last(): gp_Vec;

ChangeLast(): gp_Vec;

// Constant value access
Value(theIndex: number): gp_Vec;

// Variable value access
ChangeValue(theIndex: number): gp_Vec;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Vec;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Vec;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_Vec): void;

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
NCollection_Array1_gp_Vec2d: declare class NCollection_Array1_gp_Vec2d

constructor

// Initialise the items with theValue
Init(theValue: gp_Vec2d): void;

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
Assign(theOther: NCollection_Array1_gp_Vec2d): NCollection_Array1_gp_Vec2d;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_Vec2d): NCollection_Array1_gp_Vec2d;

// Move assignment
Move(theOther: NCollection_Array1_gp_Vec2d): NCollection_Array1_gp_Vec2d;
// theOther: Mutated in place

First(): gp_Vec2d;

ChangeFirst(): gp_Vec2d;

Last(): gp_Vec2d;

ChangeLast(): gp_Vec2d;

// Constant value access
Value(theIndex: number): gp_Vec2d;

// Variable value access
ChangeValue(theIndex: number): gp_Vec2d;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_Vec2d;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_Vec2d;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_Vec2d): void;

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
NCollection_Array1_gp_XY: declare class NCollection_Array1_gp_XY

constructor

// Initialise the items with theValue
Init(theValue: gp_XY): void;

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
Assign(theOther: NCollection_Array1_gp_XY): NCollection_Array1_gp_XY;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_XY): NCollection_Array1_gp_XY;

// Move assignment
Move(theOther: NCollection_Array1_gp_XY): NCollection_Array1_gp_XY;
// theOther: Mutated in place

First(): gp_XY;

ChangeFirst(): gp_XY;

Last(): gp_XY;

ChangeLast(): gp_XY;

// Constant value access
Value(theIndex: number): gp_XY;

// Variable value access
ChangeValue(theIndex: number): gp_XY;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_XY;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_XY;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_XY): void;

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
NCollection_Array1_gp_XYZ: declare class NCollection_Array1_gp_XYZ

constructor

// Initialise the items with theValue
Init(theValue: gp_XYZ): void;

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
Assign(theOther: NCollection_Array1_gp_XYZ): NCollection_Array1_gp_XYZ;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_gp_XYZ): NCollection_Array1_gp_XYZ;

// Move assignment
Move(theOther: NCollection_Array1_gp_XYZ): NCollection_Array1_gp_XYZ;
// theOther: Mutated in place

First(): gp_XYZ;

ChangeFirst(): gp_XYZ;

Last(): gp_XYZ;

ChangeLast(): gp_XYZ;

// Constant value access
Value(theIndex: number): gp_XYZ;

// Variable value access
ChangeValue(theIndex: number): gp_XYZ;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): gp_XYZ;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): gp_XYZ;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: gp_XYZ): void;

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
NCollection_Array1_handle_Expr_GeneralExpression: declare class NCollection_Array1_handle_Expr_GeneralExpression

constructor

// Initialise the items with theValue
Init(theValue: Expr_GeneralExpression): void;

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
Assign(theOther: NCollection_Array1_handle_Expr_GeneralExpression): NCollection_Array1_handle_Expr_GeneralExpression;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Expr_GeneralExpression): NCollection_Array1_handle_Expr_GeneralExpression;

// Move assignment
Move(theOther: NCollection_Array1_handle_Expr_GeneralExpression): NCollection_Array1_handle_Expr_GeneralExpression;
// theOther: Mutated in place

First(): Expr_GeneralExpression;

ChangeFirst(): Expr_GeneralExpression;

Last(): Expr_GeneralExpression;

ChangeLast(): Expr_GeneralExpression;

// Constant value access
Value(theIndex: number): Expr_GeneralExpression;

// Variable value access
ChangeValue(theIndex: number): Expr_GeneralExpression;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Expr_GeneralExpression;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Expr_GeneralExpression;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Expr_GeneralExpression): void;

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
NCollection_Array1_handle_Expr_NamedUnknown: declare class NCollection_Array1_handle_Expr_NamedUnknown

constructor

// Initialise the items with theValue
Init(theValue: Expr_NamedUnknown): void;

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
Assign(theOther: NCollection_Array1_handle_Expr_NamedUnknown): NCollection_Array1_handle_Expr_NamedUnknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Expr_NamedUnknown): NCollection_Array1_handle_Expr_NamedUnknown;

// Move assignment
Move(theOther: NCollection_Array1_handle_Expr_NamedUnknown): NCollection_Array1_handle_Expr_NamedUnknown;
// theOther: Mutated in place

First(): Expr_NamedUnknown;

ChangeFirst(): Expr_NamedUnknown;

Last(): Expr_NamedUnknown;

ChangeLast(): Expr_NamedUnknown;

// Constant value access
Value(theIndex: number): Expr_NamedUnknown;

// Variable value access
ChangeValue(theIndex: number): Expr_NamedUnknown;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Expr_NamedUnknown;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Expr_NamedUnknown;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Expr_NamedUnknown): void;

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
NCollection_Array1_handle_Geom2d_BSplineCurve: declare class NCollection_Array1_handle_Geom2d_BSplineCurve

constructor

// Initialise the items with theValue
Init(theValue: Geom2d_BSplineCurve): void;

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
Assign(theOther: NCollection_Array1_handle_Geom2d_BSplineCurve): NCollection_Array1_handle_Geom2d_BSplineCurve;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Geom2d_BSplineCurve): NCollection_Array1_handle_Geom2d_BSplineCurve;

// Move assignment
Move(theOther: NCollection_Array1_handle_Geom2d_BSplineCurve): NCollection_Array1_handle_Geom2d_BSplineCurve;
// theOther: Mutated in place

First(): Geom2d_BSplineCurve;

ChangeFirst(): Geom2d_BSplineCurve;

Last(): Geom2d_BSplineCurve;

ChangeLast(): Geom2d_BSplineCurve;

// Constant value access
Value(theIndex: number): Geom2d_BSplineCurve;

// Variable value access
ChangeValue(theIndex: number): Geom2d_BSplineCurve;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom2d_BSplineCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom2d_BSplineCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Geom2d_BSplineCurve): void;

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
NCollection_Array1_handle_Geom2d_BezierCurve: declare class NCollection_Array1_handle_Geom2d_BezierCurve

constructor

// Initialise the items with theValue
Init(theValue: Geom2d_BezierCurve): void;

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
Assign(theOther: NCollection_Array1_handle_Geom2d_BezierCurve): NCollection_Array1_handle_Geom2d_BezierCurve;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_Geom2d_BezierCurve): NCollection_Array1_handle_Geom2d_BezierCurve;

// Move assignment
Move(theOther: NCollection_Array1_handle_Geom2d_BezierCurve): NCollection_Array1_handle_Geom2d_BezierCurve;
// theOther: Mutated in place

First(): Geom2d_BezierCurve;

ChangeFirst(): Geom2d_BezierCurve;

Last(): Geom2d_BezierCurve;

ChangeLast(): Geom2d_BezierCurve;

// Constant value access
Value(theIndex: number): Geom2d_BezierCurve;

// Variable value access
ChangeValue(theIndex: number): Geom2d_BezierCurve;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): Geom2d_BezierCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): Geom2d_BezierCurve;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: Geom2d_BezierCurve): void;

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
