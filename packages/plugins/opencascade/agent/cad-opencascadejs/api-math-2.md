# libcascade — math (2)

4 top-level symbols. Signatures are verbatim typescript.

math_VectorBase_double: declare class math_VectorBase_double

constructor

Init(theInitialValue: number): void;

Length(): number;

Lower(): number;

Upper(): number;

Norm(): number;

Norm2(): number;

Max(): number;

Min(): number;

Normalize(): void;

Normalized(): math_VectorBase_double;

Invert(): void;

Inverse(): math_VectorBase_double;

Set(theI1: number, theI2: number, theV: math_VectorBase_double): void;

Slice(theI1: number, theI2: number): math_VectorBase_double;

Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
Multiply(theLeft: number, theRight: math_VectorBase_double): void;

Multiplied(theRight: number): math_VectorBase_double;
Multiplied(theRight: math_VectorBase_double): number;
Multiplied(theRight: math_Matrix): math_VectorBase_double;
Multiplied(theRight: number): math_VectorBase_double;
Multiplied(theRight: math_VectorBase_double): number;
Multiplied(theRight: math_Matrix): math_VectorBase_double;
Multiplied(theRight: number): math_VectorBase_double;
Multiplied(theRight: math_VectorBase_double): number;
Multiplied(theRight: math_Matrix): math_VectorBase_double;

TMultiplied(theRight: number): math_VectorBase_double;

Divide(theRight: number): void;

Divided(theRight: number): math_VectorBase_double;

Add(theRight: math_VectorBase_double): void;
Add(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;
Add(theRight: math_VectorBase_double): void;
Add(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;

Added(theRight: math_VectorBase_double): math_VectorBase_double;

TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_double): void;
TMultiply(theLeft: math_VectorBase_double, theTRight: math_Matrix): void;
TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_double): void;
TMultiply(theLeft: math_VectorBase_double, theTRight: math_Matrix): void;

Subtract(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;
Subtract(theRight: math_VectorBase_double): void;
Subtract(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;
Subtract(theRight: math_VectorBase_double): void;

Value(theNum: number): number;

Initialized(theOther: math_VectorBase_double): math_VectorBase_double;

Opposite(): math_VectorBase_double;

Subtracted(theRight: math_VectorBase_double): math_VectorBase_double;

Array1(): NCollection_Array1_double;

Resize(theSize: number): void;

delete(): void;

[Symbol.dispose](): void;

math_VectorBase_int: declare class math_VectorBase_int

constructor

Init(theInitialValue: number): void;

Length(): number;

Lower(): number;

Upper(): number;

Norm(): number;

Norm2(): number;

Max(): number;

Min(): number;

Normalize(): void;

Normalized(): math_VectorBase_int;

Invert(): void;

Inverse(): math_VectorBase_int;

Set(theI1: number, theI2: number, theV: math_VectorBase_int): void;

Slice(theI1: number, theI2: number): math_VectorBase_int;

Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;
Multiply(theRight: number): void;
Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
Multiply(theLeft: number, theRight: math_VectorBase_int): void;

Multiplied(theRight: number): math_VectorBase_int;
Multiplied(theRight: math_VectorBase_int): number;
Multiplied(theRight: math_Matrix): math_VectorBase_int;
Multiplied(theRight: number): math_VectorBase_int;
Multiplied(theRight: math_VectorBase_int): number;
Multiplied(theRight: math_Matrix): math_VectorBase_int;
Multiplied(theRight: number): math_VectorBase_int;
Multiplied(theRight: math_VectorBase_int): number;
Multiplied(theRight: math_Matrix): math_VectorBase_int;

TMultiplied(theRight: number): math_VectorBase_int;

Divide(theRight: number): void;

Divided(theRight: number): math_VectorBase_int;

Add(theRight: math_VectorBase_int): void;
Add(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;
Add(theRight: math_VectorBase_int): void;
Add(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;

Added(theRight: math_VectorBase_int): math_VectorBase_int;

TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_int): void;
TMultiply(theLeft: math_VectorBase_int, theTRight: math_Matrix): void;
TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_int): void;
TMultiply(theLeft: math_VectorBase_int, theTRight: math_Matrix): void;

Subtract(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;
Subtract(theRight: math_VectorBase_int): void;
Subtract(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;
Subtract(theRight: math_VectorBase_int): void;

Value(theNum: number): number;

Initialized(theOther: math_VectorBase_int): math_VectorBase_int;

Opposite(): math_VectorBase_int;

Subtracted(theRight: math_VectorBase_int): math_VectorBase_int;

Array1(): NCollection_Array1_int;

Resize(theSize: number): void;

delete(): void;

[Symbol.dispose](): void;

math_IntegerVector: math_VectorBase_int

math_Vector: math_VectorBase_double
