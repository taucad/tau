# libcascade — NCollection (8)

8 top-level symbols. Signatures are verbatim typescript.

// The class `NCollection_Array1` represents unidimensional arrays of fixed size known at run time
NCollection_Array1_StepGeom_PcurveOrSurface: declare class NCollection_Array1_StepGeom_PcurveOrSurface

constructor

// Initialise the items with theValue
Init(theValue: StepGeom_PcurveOrSurface): void;

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
Assign(theOther: NCollection_Array1_StepGeom_PcurveOrSurface): NCollection_Array1_StepGeom_PcurveOrSurface;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepGeom_PcurveOrSurface): NCollection_Array1_StepGeom_PcurveOrSurface;

// Move assignment
Move(theOther: NCollection_Array1_StepGeom_PcurveOrSurface): NCollection_Array1_StepGeom_PcurveOrSurface;
// theOther: Mutated in place

First(): StepGeom_PcurveOrSurface;

ChangeFirst(): StepGeom_PcurveOrSurface;

Last(): StepGeom_PcurveOrSurface;

ChangeLast(): StepGeom_PcurveOrSurface;

// Constant value access
Value(theIndex: number): StepGeom_PcurveOrSurface;

// Variable value access
ChangeValue(theIndex: number): StepGeom_PcurveOrSurface;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepGeom_PcurveOrSurface;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepGeom_PcurveOrSurface;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepGeom_PcurveOrSurface): void;

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
NCollection_Array1_StepGeom_SurfaceBoundary: declare class NCollection_Array1_StepGeom_SurfaceBoundary

constructor

// Initialise the items with theValue
Init(theValue: StepGeom_SurfaceBoundary): void;

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
Assign(theOther: NCollection_Array1_StepGeom_SurfaceBoundary): NCollection_Array1_StepGeom_SurfaceBoundary;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepGeom_SurfaceBoundary): NCollection_Array1_StepGeom_SurfaceBoundary;

// Move assignment
Move(theOther: NCollection_Array1_StepGeom_SurfaceBoundary): NCollection_Array1_StepGeom_SurfaceBoundary;
// theOther: Mutated in place

First(): StepGeom_SurfaceBoundary;

ChangeFirst(): StepGeom_SurfaceBoundary;

Last(): StepGeom_SurfaceBoundary;

ChangeLast(): StepGeom_SurfaceBoundary;

// Constant value access
Value(theIndex: number): StepGeom_SurfaceBoundary;

// Variable value access
ChangeValue(theIndex: number): StepGeom_SurfaceBoundary;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepGeom_SurfaceBoundary;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepGeom_SurfaceBoundary;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepGeom_SurfaceBoundary): void;

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
NCollection_Array1_StepGeom_TrimmingSelect: declare class NCollection_Array1_StepGeom_TrimmingSelect

constructor

// Initialise the items with theValue
Init(theValue: StepGeom_TrimmingSelect): void;

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
Assign(theOther: NCollection_Array1_StepGeom_TrimmingSelect): NCollection_Array1_StepGeom_TrimmingSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepGeom_TrimmingSelect): NCollection_Array1_StepGeom_TrimmingSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepGeom_TrimmingSelect): NCollection_Array1_StepGeom_TrimmingSelect;
// theOther: Mutated in place

First(): StepGeom_TrimmingSelect;

ChangeFirst(): StepGeom_TrimmingSelect;

Last(): StepGeom_TrimmingSelect;

ChangeLast(): StepGeom_TrimmingSelect;

// Constant value access
Value(theIndex: number): StepGeom_TrimmingSelect;

// Variable value access
ChangeValue(theIndex: number): StepGeom_TrimmingSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepGeom_TrimmingSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepGeom_TrimmingSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepGeom_TrimmingSelect): void;

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
NCollection_Array1_StepShape_GeometricSetSelect: declare class NCollection_Array1_StepShape_GeometricSetSelect

constructor

// Initialise the items with theValue
Init(theValue: StepShape_GeometricSetSelect): void;

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
Assign(theOther: NCollection_Array1_StepShape_GeometricSetSelect): NCollection_Array1_StepShape_GeometricSetSelect;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepShape_GeometricSetSelect): NCollection_Array1_StepShape_GeometricSetSelect;

// Move assignment
Move(theOther: NCollection_Array1_StepShape_GeometricSetSelect): NCollection_Array1_StepShape_GeometricSetSelect;
// theOther: Mutated in place

First(): StepShape_GeometricSetSelect;

ChangeFirst(): StepShape_GeometricSetSelect;

Last(): StepShape_GeometricSetSelect;

ChangeLast(): StepShape_GeometricSetSelect;

// Constant value access
Value(theIndex: number): StepShape_GeometricSetSelect;

// Variable value access
ChangeValue(theIndex: number): StepShape_GeometricSetSelect;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_GeometricSetSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_GeometricSetSelect;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_GeometricSetSelect): void;

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
NCollection_Array1_StepShape_ShapeDimensionRepresentationItem: declare class NCollection_Array1_StepShape_ShapeDimensionRepresentationItem

constructor

// Initialise the items with theValue
Init(theValue: StepShape_ShapeDimensionRepresentationItem): void;

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
Assign(theOther: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem): NCollection_Array1_StepShape_ShapeDimensionRepresentationItem;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem): NCollection_Array1_StepShape_ShapeDimensionRepresentationItem;

// Move assignment
Move(theOther: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem): NCollection_Array1_StepShape_ShapeDimensionRepresentationItem;
// theOther: Mutated in place

First(): StepShape_ShapeDimensionRepresentationItem;

ChangeFirst(): StepShape_ShapeDimensionRepresentationItem;

Last(): StepShape_ShapeDimensionRepresentationItem;

ChangeLast(): StepShape_ShapeDimensionRepresentationItem;

// Constant value access
Value(theIndex: number): StepShape_ShapeDimensionRepresentationItem;

// Variable value access
ChangeValue(theIndex: number): StepShape_ShapeDimensionRepresentationItem;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_ShapeDimensionRepresentationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_ShapeDimensionRepresentationItem;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_ShapeDimensionRepresentationItem): void;

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
NCollection_Array1_StepShape_Shell: declare class NCollection_Array1_StepShape_Shell

constructor

// Initialise the items with theValue
Init(theValue: StepShape_Shell): void;

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
Assign(theOther: NCollection_Array1_StepShape_Shell): NCollection_Array1_StepShape_Shell;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepShape_Shell): NCollection_Array1_StepShape_Shell;

// Move assignment
Move(theOther: NCollection_Array1_StepShape_Shell): NCollection_Array1_StepShape_Shell;
// theOther: Mutated in place

First(): StepShape_Shell;

ChangeFirst(): StepShape_Shell;

Last(): StepShape_Shell;

ChangeLast(): StepShape_Shell;

// Constant value access
Value(theIndex: number): StepShape_Shell;

// Variable value access
ChangeValue(theIndex: number): StepShape_Shell;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_Shell;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_Shell;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_Shell): void;

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
NCollection_Array1_StepShape_ValueQualifier: declare class NCollection_Array1_StepShape_ValueQualifier

constructor

// Initialise the items with theValue
Init(theValue: StepShape_ValueQualifier): void;

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
Assign(theOther: NCollection_Array1_StepShape_ValueQualifier): NCollection_Array1_StepShape_ValueQualifier;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepShape_ValueQualifier): NCollection_Array1_StepShape_ValueQualifier;

// Move assignment
Move(theOther: NCollection_Array1_StepShape_ValueQualifier): NCollection_Array1_StepShape_ValueQualifier;
// theOther: Mutated in place

First(): StepShape_ValueQualifier;

ChangeFirst(): StepShape_ValueQualifier;

Last(): StepShape_ValueQualifier;

ChangeLast(): StepShape_ValueQualifier;

// Constant value access
Value(theIndex: number): StepShape_ValueQualifier;

// Variable value access
ChangeValue(theIndex: number): StepShape_ValueQualifier;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepShape_ValueQualifier;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepShape_ValueQualifier;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepShape_ValueQualifier): void;

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
NCollection_Array1_StepVisual_AnnotationPlaneElement: declare class NCollection_Array1_StepVisual_AnnotationPlaneElement

constructor

// Initialise the items with theValue
Init(theValue: StepVisual_AnnotationPlaneElement): void;

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
Assign(theOther: NCollection_Array1_StepVisual_AnnotationPlaneElement): NCollection_Array1_StepVisual_AnnotationPlaneElement;

// Copies values from theOther array without changing this array bounds
CopyValues(theOther: NCollection_Array1_StepVisual_AnnotationPlaneElement): NCollection_Array1_StepVisual_AnnotationPlaneElement;

// Move assignment
Move(theOther: NCollection_Array1_StepVisual_AnnotationPlaneElement): NCollection_Array1_StepVisual_AnnotationPlaneElement;
// theOther: Mutated in place

First(): StepVisual_AnnotationPlaneElement;

ChangeFirst(): StepVisual_AnnotationPlaneElement;

Last(): StepVisual_AnnotationPlaneElement;

ChangeLast(): StepVisual_AnnotationPlaneElement;

// Constant value access
Value(theIndex: number): StepVisual_AnnotationPlaneElement;

// Variable value access
ChangeValue(theIndex: number): StepVisual_AnnotationPlaneElement;

// 0-based checked access independent of `Lower()`/Upper()
At(theIndex: number): StepVisual_AnnotationPlaneElement;
// theIndex: 0-based index in [0, `Size()`-1]

// 0-based checked mutable access independent of `Lower()`/Upper()
ChangeAt(theIndex: number): StepVisual_AnnotationPlaneElement;
// theIndex: 0-based index in [0, `Size()`-1]

// Set value
SetValue(theIndex: number, theItem: StepVisual_AnnotationPlaneElement): void;

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
