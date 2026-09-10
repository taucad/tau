# libcascade — NCollection (10)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_StepVisual_PresentationStyleSelect: declare class NCollection_Array1_StepVisual_PresentationStyleSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_PresentationStyleSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_PresentationStyleSelect): NCollection_Array1_StepVisual_PresentationStyleSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_PresentationStyleSelect): NCollection_Array1_StepVisual_PresentationStyleSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_PresentationStyleSelect): NCollection_Array1_StepVisual_PresentationStyleSelect;
// theOther: Mutated in place

First(): StepVisual_PresentationStyleSelect;

ChangeFirst(): StepVisual_PresentationStyleSelect;

Last(): StepVisual_PresentationStyleSelect;

ChangeLast(): StepVisual_PresentationStyleSelect;

// Constant value access
Value(theIndex: number): StepVisual_PresentationStyleSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_PresentationStyleSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_PresentationStyleSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_PresentationStyleSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_PresentationStyleSelect): void;

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
NCollection_Array1_StepVisual_RenderingPropertiesSelect: declare class NCollection_Array1_StepVisual_RenderingPropertiesSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_RenderingPropertiesSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_RenderingPropertiesSelect): NCollection_Array1_StepVisual_RenderingPropertiesSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_RenderingPropertiesSelect): NCollection_Array1_StepVisual_RenderingPropertiesSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_RenderingPropertiesSelect): NCollection_Array1_StepVisual_RenderingPropertiesSelect;
// theOther: Mutated in place

First(): StepVisual_RenderingPropertiesSelect;

ChangeFirst(): StepVisual_RenderingPropertiesSelect;

Last(): StepVisual_RenderingPropertiesSelect;

ChangeLast(): StepVisual_RenderingPropertiesSelect;

// Constant value access
Value(theIndex: number): StepVisual_RenderingPropertiesSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_RenderingPropertiesSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_RenderingPropertiesSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_RenderingPropertiesSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_RenderingPropertiesSelect): void;

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
NCollection_Array1_StepVisual_StyleContextSelect: declare class NCollection_Array1_StepVisual_StyleContextSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_StyleContextSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_StyleContextSelect): NCollection_Array1_StepVisual_StyleContextSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_StyleContextSelect): NCollection_Array1_StepVisual_StyleContextSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_StyleContextSelect): NCollection_Array1_StepVisual_StyleContextSelect;
// theOther: Mutated in place

First(): StepVisual_StyleContextSelect;

ChangeFirst(): StepVisual_StyleContextSelect;

Last(): StepVisual_StyleContextSelect;

ChangeLast(): StepVisual_StyleContextSelect;

// Constant value access
Value(theIndex: number): StepVisual_StyleContextSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_StyleContextSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_StyleContextSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_StyleContextSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_StyleContextSelect): void;

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
NCollection_Array1_StepVisual_SurfaceStyleElementSelect: declare class NCollection_Array1_StepVisual_SurfaceStyleElementSelect

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_SurfaceStyleElementSelect): void;

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
Assign(theOther: NCollection_Array1_StepVisual_SurfaceStyleElementSelect): NCollection_Array1_StepVisual_SurfaceStyleElementSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_SurfaceStyleElementSelect): NCollection_Array1_StepVisual_SurfaceStyleElementSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_SurfaceStyleElementSelect): NCollection_Array1_StepVisual_SurfaceStyleElementSelect;
// theOther: Mutated in place

First(): StepVisual_SurfaceStyleElementSelect;

ChangeFirst(): StepVisual_SurfaceStyleElementSelect;

Last(): StepVisual_SurfaceStyleElementSelect;

ChangeLast(): StepVisual_SurfaceStyleElementSelect;

// Constant value access
Value(theIndex: number): StepVisual_SurfaceStyleElementSelect;

// Variable value access
ChangeValue(theIndex: number): StepVisual_SurfaceStyleElementSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_SurfaceStyleElementSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_SurfaceStyleElementSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_SurfaceStyleElementSelect): void;

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
NCollection_Array1_StepVisual_TessellatedEdgeOrVertex: declare class NCollection_Array1_StepVisual_TessellatedEdgeOrVertex

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_TessellatedEdgeOrVertex): void;

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
Assign(theOther: NCollection_Array1_StepVisual_TessellatedEdgeOrVertex): NCollection_Array1_StepVisual_TessellatedEdgeOrVertex;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_TessellatedEdgeOrVertex): NCollection_Array1_StepVisual_TessellatedEdgeOrVertex;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_TessellatedEdgeOrVertex): NCollection_Array1_StepVisual_TessellatedEdgeOrVertex;
// theOther: Mutated in place

First(): StepVisual_TessellatedEdgeOrVertex;

ChangeFirst(): StepVisual_TessellatedEdgeOrVertex;

Last(): StepVisual_TessellatedEdgeOrVertex;

ChangeLast(): StepVisual_TessellatedEdgeOrVertex;

// Constant value access
Value(theIndex: number): StepVisual_TessellatedEdgeOrVertex;

// Variable value access
ChangeValue(theIndex: number): StepVisual_TessellatedEdgeOrVertex;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_TessellatedEdgeOrVertex;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_TessellatedEdgeOrVertex;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_TessellatedEdgeOrVertex): void;

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
NCollection_Array1_StepVisual_TextOrCharacter: declare class NCollection_Array1_StepVisual_TextOrCharacter

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_TextOrCharacter): void;

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
Assign(theOther: NCollection_Array1_StepVisual_TextOrCharacter): NCollection_Array1_StepVisual_TextOrCharacter;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_TextOrCharacter): NCollection_Array1_StepVisual_TextOrCharacter;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_TextOrCharacter): NCollection_Array1_StepVisual_TextOrCharacter;
// theOther: Mutated in place

First(): StepVisual_TextOrCharacter;

ChangeFirst(): StepVisual_TextOrCharacter;

Last(): StepVisual_TextOrCharacter;

ChangeLast(): StepVisual_TextOrCharacter;

// Constant value access
Value(theIndex: number): StepVisual_TextOrCharacter;

// Variable value access
ChangeValue(theIndex: number): StepVisual_TextOrCharacter;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_TextOrCharacter;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_TextOrCharacter;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_TextOrCharacter): void;

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
NCollection_Array1_TCollection_AsciiString: declare class NCollection_Array1_TCollection_AsciiString

constructor

// Initialise the items with theValue
Init(theValue: TCollection_AsciiString): void;

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
Assign(theOther: NCollection_Array1_TCollection_AsciiString): NCollection_Array1_TCollection_AsciiString;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_TCollection_AsciiString): NCollection_Array1_TCollection_AsciiString;

// Move assignment
Move(theOther: NCollection_Array1_TCollection_AsciiString): NCollection_Array1_TCollection_AsciiString;
// theOther: Mutated in place

First(): TCollection_AsciiString;

ChangeFirst(): TCollection_AsciiString;

Last(): TCollection_AsciiString;

ChangeLast(): TCollection_AsciiString;

// Constant value access
Value(theIndex: number): TCollection_AsciiString;

// Variable value access
ChangeValue(theIndex: number): TCollection_AsciiString;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TCollection_AsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TCollection_AsciiString;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: TCollection_AsciiString): void;

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
NCollection_Array1_TCollection_ExtendedString: declare class NCollection_Array1_TCollection_ExtendedString

constructor

// Initialise the items with theValue
Init(theValue: TCollection_ExtendedString): void;

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
Assign(theOther: NCollection_Array1_TCollection_ExtendedString): NCollection_Array1_TCollection_ExtendedString;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_TCollection_ExtendedString): NCollection_Array1_TCollection_ExtendedString;

// Move assignment
Move(theOther: NCollection_Array1_TCollection_ExtendedString): NCollection_Array1_TCollection_ExtendedString;
// theOther: Mutated in place

First(): TCollection_ExtendedString;

ChangeFirst(): TCollection_ExtendedString;

Last(): TCollection_ExtendedString;

ChangeLast(): TCollection_ExtendedString;

// Constant value access
Value(theIndex: number): TCollection_ExtendedString;

// Variable value access
ChangeValue(theIndex: number): TCollection_ExtendedString;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): TCollection_ExtendedString;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): TCollection_ExtendedString;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: TCollection_ExtendedString): void;

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
