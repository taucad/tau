# libcascade — NCollection (19)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_handle_StepFEA_ElementRepresentation: declare class NCollection_Array1_handle_StepFEA_ElementRepresentation

constructor

// Initialise the items with theValue
Init(theValue: StepFEA_ElementRepresentation): void;

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
Assign(theOther: NCollection_Array1_handle_StepFEA_ElementRepresentation): NCollection_Array1_handle_StepFEA_ElementRepresentation;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepFEA_ElementRepresentation): NCollection_Array1_handle_StepFEA_ElementRepresentation;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepFEA_ElementRepresentation): NCollection_Array1_handle_StepFEA_ElementRepresentation;
// theOther: Mutated in place

First(): StepFEA_ElementRepresentation;

ChangeFirst(): StepFEA_ElementRepresentation;

Last(): StepFEA_ElementRepresentation;

ChangeLast(): StepFEA_ElementRepresentation;

// Constant value access
Value(theIndex: number): StepFEA_ElementRepresentation;

// Variable value access
ChangeValue(theIndex: number): StepFEA_ElementRepresentation;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_ElementRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_ElementRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepFEA_ElementRepresentation): void;

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
NCollection_Array1_handle_StepFEA_NodeRepresentation: declare class NCollection_Array1_handle_StepFEA_NodeRepresentation

constructor

// Initialise the items with theValue
Init(theValue: StepFEA_NodeRepresentation): void;

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
Assign(theOther: NCollection_Array1_handle_StepFEA_NodeRepresentation): NCollection_Array1_handle_StepFEA_NodeRepresentation;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepFEA_NodeRepresentation): NCollection_Array1_handle_StepFEA_NodeRepresentation;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepFEA_NodeRepresentation): NCollection_Array1_handle_StepFEA_NodeRepresentation;
// theOther: Mutated in place

First(): StepFEA_NodeRepresentation;

ChangeFirst(): StepFEA_NodeRepresentation;

Last(): StepFEA_NodeRepresentation;

ChangeLast(): StepFEA_NodeRepresentation;

// Constant value access
Value(theIndex: number): StepFEA_NodeRepresentation;

// Variable value access
ChangeValue(theIndex: number): StepFEA_NodeRepresentation;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepFEA_NodeRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepFEA_NodeRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepFEA_NodeRepresentation): void;

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
NCollection_Array1_handle_StepGeom_CartesianPoint: declare class NCollection_Array1_handle_StepGeom_CartesianPoint

constructor

// Initialise the items with theValue
Init(theValue: StepGeom_CartesianPoint): void;

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
Assign(theOther: unknown): unknown;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: unknown): unknown;

// Move assignment
Move(theOther: unknown): unknown;
// theOther: Mutated in place

First(): StepGeom_CartesianPoint;

ChangeFirst(): StepGeom_CartesianPoint;

Last(): StepGeom_CartesianPoint;

ChangeLast(): StepGeom_CartesianPoint;

// Constant value access
Value(theIndex: number): StepGeom_CartesianPoint;

// Variable value access
ChangeValue(theIndex: number): StepGeom_CartesianPoint;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepGeom_CartesianPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepGeom_CartesianPoint;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepGeom_CartesianPoint): void;

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
NCollection_Array1_handle_StepGeom_CompositeCurveSegment: declare class NCollection_Array1_handle_StepGeom_CompositeCurveSegment

constructor

// Initialise the items with theValue
Init(theValue: StepGeom_CompositeCurveSegment): void;

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
Assign(theOther: NCollection_Array1_handle_StepGeom_CompositeCurveSegment): NCollection_Array1_handle_StepGeom_CompositeCurveSegment;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepGeom_CompositeCurveSegment): NCollection_Array1_handle_StepGeom_CompositeCurveSegment;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepGeom_CompositeCurveSegment): NCollection_Array1_handle_StepGeom_CompositeCurveSegment;
// theOther: Mutated in place

First(): StepGeom_CompositeCurveSegment;

ChangeFirst(): StepGeom_CompositeCurveSegment;

Last(): StepGeom_CompositeCurveSegment;

ChangeLast(): StepGeom_CompositeCurveSegment;

// Constant value access
Value(theIndex: number): StepGeom_CompositeCurveSegment;

// Variable value access
ChangeValue(theIndex: number): StepGeom_CompositeCurveSegment;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepGeom_CompositeCurveSegment;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepGeom_CompositeCurveSegment;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepGeom_CompositeCurveSegment): void;

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
NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation: declare class NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation

constructor

// Initialise the items with theValue
Init(theValue: StepRepr_MaterialPropertyRepresentation): void;

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
Assign(theOther: NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation): NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation): NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation): NCollection_Array1_handle_StepRepr_MaterialPropertyRepresentation;
// theOther: Mutated in place

First(): StepRepr_MaterialPropertyRepresentation;

ChangeFirst(): StepRepr_MaterialPropertyRepresentation;

Last(): StepRepr_MaterialPropertyRepresentation;

ChangeLast(): StepRepr_MaterialPropertyRepresentation;

// Constant value access
Value(theIndex: number): StepRepr_MaterialPropertyRepresentation;

// Variable value access
ChangeValue(theIndex: number): StepRepr_MaterialPropertyRepresentation;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepRepr_MaterialPropertyRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepRepr_MaterialPropertyRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepRepr_MaterialPropertyRepresentation): void;

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
NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation: declare class NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation

constructor

// Initialise the items with theValue
Init(theValue: StepRepr_PropertyDefinitionRepresentation): void;

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
Assign(theOther: NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation): NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation): NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation): NCollection_Array1_handle_StepRepr_PropertyDefinitionRepresentation;
// theOther: Mutated in place

First(): StepRepr_PropertyDefinitionRepresentation;

ChangeFirst(): StepRepr_PropertyDefinitionRepresentation;

Last(): StepRepr_PropertyDefinitionRepresentation;

ChangeLast(): StepRepr_PropertyDefinitionRepresentation;

// Constant value access
Value(theIndex: number): StepRepr_PropertyDefinitionRepresentation;

// Variable value access
ChangeValue(theIndex: number): StepRepr_PropertyDefinitionRepresentation;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepRepr_PropertyDefinitionRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepRepr_PropertyDefinitionRepresentation;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepRepr_PropertyDefinitionRepresentation): void;

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
NCollection_Array1_handle_StepRepr_RepresentationItem: declare class NCollection_Array1_handle_StepRepr_RepresentationItem

constructor

// Initialise the items with theValue
Init(theValue: StepRepr_RepresentationItem): void;

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
Assign(theOther: NCollection_Array1_handle_StepRepr_RepresentationItem): NCollection_Array1_handle_StepRepr_RepresentationItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepRepr_RepresentationItem): NCollection_Array1_handle_StepRepr_RepresentationItem;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepRepr_RepresentationItem): NCollection_Array1_handle_StepRepr_RepresentationItem;
// theOther: Mutated in place

First(): StepRepr_RepresentationItem;

ChangeFirst(): StepRepr_RepresentationItem;

Last(): StepRepr_RepresentationItem;

ChangeLast(): StepRepr_RepresentationItem;

// Constant value access
Value(theIndex: number): StepRepr_RepresentationItem;

// Variable value access
ChangeValue(theIndex: number): StepRepr_RepresentationItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepRepr_RepresentationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepRepr_RepresentationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepRepr_RepresentationItem): void;

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
NCollection_Array1_handle_StepRepr_ShapeAspect: declare class NCollection_Array1_handle_StepRepr_ShapeAspect

constructor

// Initialise the items with theValue
Init(theValue: StepRepr_ShapeAspect): void;

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
Assign(theOther: NCollection_Array1_handle_StepRepr_ShapeAspect): NCollection_Array1_handle_StepRepr_ShapeAspect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_handle_StepRepr_ShapeAspect): NCollection_Array1_handle_StepRepr_ShapeAspect;

// Move assignment
Move(theOther: NCollection_Array1_handle_StepRepr_ShapeAspect): NCollection_Array1_handle_StepRepr_ShapeAspect;
// theOther: Mutated in place

First(): StepRepr_ShapeAspect;

ChangeFirst(): StepRepr_ShapeAspect;

Last(): StepRepr_ShapeAspect;

ChangeLast(): StepRepr_ShapeAspect;

// Constant value access
Value(theIndex: number): StepRepr_ShapeAspect;

// Variable value access
ChangeValue(theIndex: number): StepRepr_ShapeAspect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepRepr_ShapeAspect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepRepr_ShapeAspect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepRepr_ShapeAspect): void;

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
