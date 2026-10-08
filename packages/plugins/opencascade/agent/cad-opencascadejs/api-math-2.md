# libcascade — math (2)

6 top-level symbols. Signatures are verbatim typescript.

math_Uzawa: declare class math_Uzawa

  // math_Uzawa.constructor (constructor)
  constructor(Cont: math_Matrix, Secont: math_VectorBase_double, StartingPoint: math_VectorBase_double, EpsLix?: number, EpsLic?: number, NbIterations?: number);
  constructor(Cont: math_Matrix, Secont: math_VectorBase_double, StartingPoint: math_VectorBase_double, Nci: number, Nce: number, EpsLix?: number, EpsLic?: number, NbIterations?: number);

  // math_Uzawa.IsDone (method)
  IsDone(): boolean;

  // math_Uzawa.Value (method)
  Value(): math_VectorBase_double;

  // math_Uzawa.InitialError (method)
  InitialError(): math_VectorBase_double;

  // math_Uzawa.Duale (method)
  Duale(V: math_VectorBase_double): void;

  // math_Uzawa.Error (method)
  Error(): math_VectorBase_double;

  // math_Uzawa.NbIterations (method)
  NbIterations(): number;

  // math_Uzawa.InverseCont (method)
  InverseCont(): math_Matrix;

  // math_Uzawa.delete (method)
  delete(): void;

  // math_Uzawa.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_ValueAndWeight: declare class math_ValueAndWeight

  // math_ValueAndWeight.constructor (constructor)
  constructor();
  constructor(theValue: number, theWeight: number);

  // math_ValueAndWeight.Value (method)
  Value(): number;

  // math_ValueAndWeight.Weight (method)
  Weight(): number;

  // math_ValueAndWeight.delete (method)
  delete(): void;

  // math_ValueAndWeight.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_VectorBase_double: declare class math_VectorBase_double

  // math_VectorBase_double.constructor (constructor)
  constructor(Other: gp_XY);
  constructor(Other: gp_XYZ);
  constructor(theOther: math_VectorBase_double);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theInitialValue: number);

  // math_VectorBase_double.Init (method)
  Init(theInitialValue: number): void;

  // math_VectorBase_double.Length (method)
  Length(): number;

  // math_VectorBase_double.Lower (method)
  Lower(): number;

  // math_VectorBase_double.Upper (method)
  Upper(): number;

  // math_VectorBase_double.Norm (method)
  Norm(): number;

  // math_VectorBase_double.Norm2 (method)
  Norm2(): number;

  // math_VectorBase_double.Max (method)
  Max(): number;

  // math_VectorBase_double.Min (method)
  Min(): number;

  // math_VectorBase_double.Normalize (method)
  Normalize(): void;

  // math_VectorBase_double.Normalized (method)
  Normalized(): math_VectorBase_double;

  // math_VectorBase_double.Invert (method)
  Invert(): void;

  // math_VectorBase_double.Inverse (method)
  Inverse(): math_VectorBase_double;

  // math_VectorBase_double.Set (method)
  Set(theI1: number, theI2: number, theV: math_VectorBase_double): void;

  // math_VectorBase_double.Slice (method)
  Slice(theI1: number, theI2: number): math_VectorBase_double;

  // math_VectorBase_double.Multiply (method)
  Multiply(theRight: number): void;
  Multiply(theLeft: math_VectorBase_double, theRight: math_Matrix): void;
  Multiply(theLeft: math_Matrix, theRight: math_VectorBase_double): void;
  Multiply(theLeft: number, theRight: math_VectorBase_double): void;

  // math_VectorBase_double.Multiplied (method)
  Multiplied(theRight: number): math_VectorBase_double;
  Multiplied(theRight: math_VectorBase_double): number;
  Multiplied(theRight: math_Matrix): math_VectorBase_double;

  // math_VectorBase_double.TMultiplied (method)
  TMultiplied(theRight: number): math_VectorBase_double;

  // math_VectorBase_double.Divide (method)
  Divide(theRight: number): void;

  // math_VectorBase_double.Divided (method)
  Divided(theRight: number): math_VectorBase_double;

  // math_VectorBase_double.Add (method)
  Add(theRight: math_VectorBase_double): void;
  Add(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;

  // math_VectorBase_double.Added (method)
  Added(theRight: math_VectorBase_double): math_VectorBase_double;

  // math_VectorBase_double.TMultiply (method)
  TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_double): void;
  TMultiply(theLeft: math_VectorBase_double, theTRight: math_Matrix): void;

  // math_VectorBase_double.Subtract (method)
  Subtract(theLeft: math_VectorBase_double, theRight: math_VectorBase_double): void;
  Subtract(theRight: math_VectorBase_double): void;

  // math_VectorBase_double.Value (method)
  Value(theNum: number): number;

  // math_VectorBase_double.Initialized (method)
  Initialized(theOther: math_VectorBase_double): math_VectorBase_double;

  // math_VectorBase_double.Opposite (method)
  Opposite(): math_VectorBase_double;

  // math_VectorBase_double.Subtracted (method)
  Subtracted(theRight: math_VectorBase_double): math_VectorBase_double;

  // math_VectorBase_double.Array1 (method)
  Array1(): NCollection_Array1_double;

  // math_VectorBase_double.Resize (method)
  Resize(theSize: number): void;

  // math_VectorBase_double.delete (method)
  delete(): void;

  // math_VectorBase_double.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_VectorBase_int: declare class math_VectorBase_int

  // math_VectorBase_int.constructor (constructor)
  constructor(Other: gp_XY);
  constructor(Other: gp_XYZ);
  constructor(theOther: math_VectorBase_int);
  constructor(theLower: number, theUpper: number);
  constructor(theLower: number, theUpper: number, theInitialValue: number);

  // math_VectorBase_int.Init (method)
  Init(theInitialValue: number): void;

  // math_VectorBase_int.Length (method)
  Length(): number;

  // math_VectorBase_int.Lower (method)
  Lower(): number;

  // math_VectorBase_int.Upper (method)
  Upper(): number;

  // math_VectorBase_int.Norm (method)
  Norm(): number;

  // math_VectorBase_int.Norm2 (method)
  Norm2(): number;

  // math_VectorBase_int.Max (method)
  Max(): number;

  // math_VectorBase_int.Min (method)
  Min(): number;

  // math_VectorBase_int.Normalize (method)
  Normalize(): void;

  // math_VectorBase_int.Normalized (method)
  Normalized(): math_VectorBase_int;

  // math_VectorBase_int.Invert (method)
  Invert(): void;

  // math_VectorBase_int.Inverse (method)
  Inverse(): math_VectorBase_int;

  // math_VectorBase_int.Set (method)
  Set(theI1: number, theI2: number, theV: math_VectorBase_int): void;

  // math_VectorBase_int.Slice (method)
  Slice(theI1: number, theI2: number): math_VectorBase_int;

  // math_VectorBase_int.Multiply (method)
  Multiply(theRight: number): void;
  Multiply(theLeft: math_VectorBase_int, theRight: math_Matrix): void;
  Multiply(theLeft: math_Matrix, theRight: math_VectorBase_int): void;
  Multiply(theLeft: number, theRight: math_VectorBase_int): void;

  // math_VectorBase_int.Multiplied (method)
  Multiplied(theRight: number): math_VectorBase_int;
  Multiplied(theRight: math_VectorBase_int): number;
  Multiplied(theRight: math_Matrix): math_VectorBase_int;

  // math_VectorBase_int.TMultiplied (method)
  TMultiplied(theRight: number): math_VectorBase_int;

  // math_VectorBase_int.Divide (method)
  Divide(theRight: number): void;

  // math_VectorBase_int.Divided (method)
  Divided(theRight: number): math_VectorBase_int;

  // math_VectorBase_int.Add (method)
  Add(theRight: math_VectorBase_int): void;
  Add(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;

  // math_VectorBase_int.Added (method)
  Added(theRight: math_VectorBase_int): math_VectorBase_int;

  // math_VectorBase_int.TMultiply (method)
  TMultiply(theTLeft: math_Matrix, theRight: math_VectorBase_int): void;
  TMultiply(theLeft: math_VectorBase_int, theTRight: math_Matrix): void;

  // math_VectorBase_int.Subtract (method)
  Subtract(theLeft: math_VectorBase_int, theRight: math_VectorBase_int): void;
  Subtract(theRight: math_VectorBase_int): void;

  // math_VectorBase_int.Value (method)
  Value(theNum: number): number;

  // math_VectorBase_int.Initialized (method)
  Initialized(theOther: math_VectorBase_int): math_VectorBase_int;

  // math_VectorBase_int.Opposite (method)
  Opposite(): math_VectorBase_int;

  // math_VectorBase_int.Subtracted (method)
  Subtracted(theRight: math_VectorBase_int): math_VectorBase_int;

  // math_VectorBase_int.Array1 (method)
  Array1(): NCollection_Array1_int;

  // math_VectorBase_int.Resize (method)
  Resize(theSize: number): void;

  // math_VectorBase_int.delete (method)
  delete(): void;

  // math_VectorBase_int.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

math_IntegerVector: math_VectorBase_int

math_Vector: math_VectorBase_double
