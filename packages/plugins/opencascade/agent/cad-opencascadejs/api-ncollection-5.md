# libcascade — NCollection (5)

13 top-level symbols. Signatures are verbatim typescript.

NCollection_Array1_StepDimTol_DatumSystemOrReference: declare class NCollection_Array1_StepDimTol_DatumSystemOrReference

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepDimTol_DatumSystemOrReference);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepDimTol_DatumSystemOrReference, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepDimTol_DatumSystemOrReference, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Init (method)
  Init(theValue: StepDimTol_DatumSystemOrReference): void;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Size (method)
  Size(): number;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Length (method)
  Length(): number;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Assign (method)
  Assign(theOther: NCollection_Array1_StepDimTol_DatumSystemOrReference): NCollection_Array1_StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepDimTol_DatumSystemOrReference): NCollection_Array1_StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Move (method)
  Move(theOther: NCollection_Array1_StepDimTol_DatumSystemOrReference): NCollection_Array1_StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.First (method)
  First(): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.ChangeFirst (method)
  ChangeFirst(): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Last (method)
  Last(): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.ChangeLast (method)
  ChangeLast(): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Value (method)
  Value(theIndex: number): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.ChangeValue (method)
  ChangeValue(theIndex: number): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.At (method)
  At(theIndex: number): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.ChangeAt (method)
  ChangeAt(theIndex: number): StepDimTol_DatumSystemOrReference;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.SetValue (method)
  SetValue(theIndex: number, theItem: StepDimTol_DatumSystemOrReference): void;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.delete (method)
  delete(): void;

  // NCollection_Array1_StepDimTol_DatumSystemOrReference.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepDimTol_GeometricToleranceModifier: declare class NCollection_Array1_StepDimTol_GeometricToleranceModifier

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepDimTol_GeometricToleranceModifier);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepDimTol_GeometricToleranceModifier, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepDimTol_GeometricToleranceModifier, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Init (method)
  Init(theValue: StepDimTol_GeometricToleranceModifier): void;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Size (method)
  Size(): number;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Length (method)
  Length(): number;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Assign (method)
  Assign(theOther: NCollection_Array1_StepDimTol_GeometricToleranceModifier): NCollection_Array1_StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepDimTol_GeometricToleranceModifier): NCollection_Array1_StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Move (method)
  Move(theOther: NCollection_Array1_StepDimTol_GeometricToleranceModifier): NCollection_Array1_StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.First (method)
  First(): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.ChangeFirst (method)
  ChangeFirst(): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Last (method)
  Last(): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.ChangeLast (method)
  ChangeLast(): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Value (method)
  Value(theIndex: number): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.ChangeValue (method)
  ChangeValue(theIndex: number): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.At (method)
  At(theIndex: number): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.ChangeAt (method)
  ChangeAt(theIndex: number): StepDimTol_GeometricToleranceModifier;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.SetValue (method)
  SetValue(theIndex: number, theItem: StepDimTol_GeometricToleranceModifier): void;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.delete (method)
  delete(): void;

  // NCollection_Array1_StepDimTol_GeometricToleranceModifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepDimTol_ToleranceZoneTarget: declare class NCollection_Array1_StepDimTol_ToleranceZoneTarget

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: unknown);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepDimTol_ToleranceZoneTarget, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepDimTol_ToleranceZoneTarget, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Init (method)
  Init(theValue: StepDimTol_ToleranceZoneTarget): void;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Size (method)
  Size(): number;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Length (method)
  Length(): number;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Assign (method)
  Assign(theOther: unknown): unknown;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.CopyValues (method)
  CopyValues(theOther: unknown): unknown;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Move (method)
  Move(theOther: unknown): unknown;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.First (method)
  First(): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.ChangeFirst (method)
  ChangeFirst(): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Last (method)
  Last(): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.ChangeLast (method)
  ChangeLast(): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Value (method)
  Value(theIndex: number): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.ChangeValue (method)
  ChangeValue(theIndex: number): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.At (method)
  At(theIndex: number): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.ChangeAt (method)
  ChangeAt(theIndex: number): StepDimTol_ToleranceZoneTarget;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.SetValue (method)
  SetValue(theIndex: number, theItem: StepDimTol_ToleranceZoneTarget): void;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.delete (method)
  delete(): void;

  // NCollection_Array1_StepDimTol_ToleranceZoneTarget.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepElement_MeasureOrUnspecifiedValue: declare class NCollection_Array1_StepElement_MeasureOrUnspecifiedValue

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepElement_MeasureOrUnspecifiedValue, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepElement_MeasureOrUnspecifiedValue, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Init (method)
  Init(theValue: StepElement_MeasureOrUnspecifiedValue): void;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Size (method)
  Size(): number;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Length (method)
  Length(): number;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Assign (method)
  Assign(theOther: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue): NCollection_Array1_StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue): NCollection_Array1_StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Move (method)
  Move(theOther: NCollection_Array1_StepElement_MeasureOrUnspecifiedValue): NCollection_Array1_StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.First (method)
  First(): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.ChangeFirst (method)
  ChangeFirst(): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Last (method)
  Last(): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.ChangeLast (method)
  ChangeLast(): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Value (method)
  Value(theIndex: number): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.ChangeValue (method)
  ChangeValue(theIndex: number): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.At (method)
  At(theIndex: number): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.ChangeAt (method)
  ChangeAt(theIndex: number): StepElement_MeasureOrUnspecifiedValue;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.SetValue (method)
  SetValue(theIndex: number, theItem: StepElement_MeasureOrUnspecifiedValue): void;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.delete (method)
  delete(): void;

  // NCollection_Array1_StepElement_MeasureOrUnspecifiedValue.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepFEA_DegreeOfFreedom: declare class NCollection_Array1_StepFEA_DegreeOfFreedom

  // NCollection_Array1_StepFEA_DegreeOfFreedom.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepFEA_DegreeOfFreedom);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepFEA_DegreeOfFreedom, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepFEA_DegreeOfFreedom, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Init (method)
  Init(theValue: StepFEA_DegreeOfFreedom): void;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Size (method)
  Size(): number;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Length (method)
  Length(): number;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Assign (method)
  Assign(theOther: NCollection_Array1_StepFEA_DegreeOfFreedom): NCollection_Array1_StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepFEA_DegreeOfFreedom): NCollection_Array1_StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Move (method)
  Move(theOther: NCollection_Array1_StepFEA_DegreeOfFreedom): NCollection_Array1_StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.First (method)
  First(): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.ChangeFirst (method)
  ChangeFirst(): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Last (method)
  Last(): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.ChangeLast (method)
  ChangeLast(): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Value (method)
  Value(theIndex: number): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.ChangeValue (method)
  ChangeValue(theIndex: number): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.At (method)
  At(theIndex: number): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.ChangeAt (method)
  ChangeAt(theIndex: number): StepFEA_DegreeOfFreedom;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.SetValue (method)
  SetValue(theIndex: number, theItem: StepFEA_DegreeOfFreedom): void;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.delete (method)
  delete(): void;

  // NCollection_Array1_StepFEA_DegreeOfFreedom.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepGeom_PcurveOrSurface: declare class NCollection_Array1_StepGeom_PcurveOrSurface

  // NCollection_Array1_StepGeom_PcurveOrSurface.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepGeom_PcurveOrSurface);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepGeom_PcurveOrSurface, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepGeom_PcurveOrSurface, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepGeom_PcurveOrSurface.Init (method)
  Init(theValue: StepGeom_PcurveOrSurface): void;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Size (method)
  Size(): number;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Length (method)
  Length(): number;

  // NCollection_Array1_StepGeom_PcurveOrSurface.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Assign (method)
  Assign(theOther: NCollection_Array1_StepGeom_PcurveOrSurface): NCollection_Array1_StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepGeom_PcurveOrSurface): NCollection_Array1_StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Move (method)
  Move(theOther: NCollection_Array1_StepGeom_PcurveOrSurface): NCollection_Array1_StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.First (method)
  First(): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.ChangeFirst (method)
  ChangeFirst(): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Last (method)
  Last(): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.ChangeLast (method)
  ChangeLast(): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Value (method)
  Value(theIndex: number): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.ChangeValue (method)
  ChangeValue(theIndex: number): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.At (method)
  At(theIndex: number): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.ChangeAt (method)
  ChangeAt(theIndex: number): StepGeom_PcurveOrSurface;

  // NCollection_Array1_StepGeom_PcurveOrSurface.SetValue (method)
  SetValue(theIndex: number, theItem: StepGeom_PcurveOrSurface): void;

  // NCollection_Array1_StepGeom_PcurveOrSurface.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepGeom_PcurveOrSurface.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepGeom_PcurveOrSurface.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepGeom_PcurveOrSurface.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepGeom_PcurveOrSurface.delete (method)
  delete(): void;

  // NCollection_Array1_StepGeom_PcurveOrSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepGeom_SurfaceBoundary: declare class NCollection_Array1_StepGeom_SurfaceBoundary

  // NCollection_Array1_StepGeom_SurfaceBoundary.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepGeom_SurfaceBoundary);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepGeom_SurfaceBoundary, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepGeom_SurfaceBoundary, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepGeom_SurfaceBoundary.Init (method)
  Init(theValue: StepGeom_SurfaceBoundary): void;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Size (method)
  Size(): number;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Length (method)
  Length(): number;

  // NCollection_Array1_StepGeom_SurfaceBoundary.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Assign (method)
  Assign(theOther: NCollection_Array1_StepGeom_SurfaceBoundary): NCollection_Array1_StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepGeom_SurfaceBoundary): NCollection_Array1_StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Move (method)
  Move(theOther: NCollection_Array1_StepGeom_SurfaceBoundary): NCollection_Array1_StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.First (method)
  First(): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.ChangeFirst (method)
  ChangeFirst(): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Last (method)
  Last(): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.ChangeLast (method)
  ChangeLast(): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Value (method)
  Value(theIndex: number): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.ChangeValue (method)
  ChangeValue(theIndex: number): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.At (method)
  At(theIndex: number): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.ChangeAt (method)
  ChangeAt(theIndex: number): StepGeom_SurfaceBoundary;

  // NCollection_Array1_StepGeom_SurfaceBoundary.SetValue (method)
  SetValue(theIndex: number, theItem: StepGeom_SurfaceBoundary): void;

  // NCollection_Array1_StepGeom_SurfaceBoundary.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepGeom_SurfaceBoundary.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepGeom_SurfaceBoundary.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepGeom_SurfaceBoundary.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepGeom_SurfaceBoundary.delete (method)
  delete(): void;

  // NCollection_Array1_StepGeom_SurfaceBoundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepGeom_TrimmingSelect: declare class NCollection_Array1_StepGeom_TrimmingSelect

  // NCollection_Array1_StepGeom_TrimmingSelect.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepGeom_TrimmingSelect);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepGeom_TrimmingSelect, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepGeom_TrimmingSelect, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepGeom_TrimmingSelect.Init (method)
  Init(theValue: StepGeom_TrimmingSelect): void;

  // NCollection_Array1_StepGeom_TrimmingSelect.Size (method)
  Size(): number;

  // NCollection_Array1_StepGeom_TrimmingSelect.Length (method)
  Length(): number;

  // NCollection_Array1_StepGeom_TrimmingSelect.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepGeom_TrimmingSelect.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepGeom_TrimmingSelect.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepGeom_TrimmingSelect.Assign (method)
  Assign(theOther: NCollection_Array1_StepGeom_TrimmingSelect): NCollection_Array1_StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepGeom_TrimmingSelect): NCollection_Array1_StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.Move (method)
  Move(theOther: NCollection_Array1_StepGeom_TrimmingSelect): NCollection_Array1_StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.First (method)
  First(): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.ChangeFirst (method)
  ChangeFirst(): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.Last (method)
  Last(): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.ChangeLast (method)
  ChangeLast(): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.Value (method)
  Value(theIndex: number): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.ChangeValue (method)
  ChangeValue(theIndex: number): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.At (method)
  At(theIndex: number): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.ChangeAt (method)
  ChangeAt(theIndex: number): StepGeom_TrimmingSelect;

  // NCollection_Array1_StepGeom_TrimmingSelect.SetValue (method)
  SetValue(theIndex: number, theItem: StepGeom_TrimmingSelect): void;

  // NCollection_Array1_StepGeom_TrimmingSelect.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepGeom_TrimmingSelect.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepGeom_TrimmingSelect.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepGeom_TrimmingSelect.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepGeom_TrimmingSelect.delete (method)
  delete(): void;

  // NCollection_Array1_StepGeom_TrimmingSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepShape_GeometricSetSelect: declare class NCollection_Array1_StepShape_GeometricSetSelect

  // NCollection_Array1_StepShape_GeometricSetSelect.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepShape_GeometricSetSelect);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_GeometricSetSelect, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_GeometricSetSelect, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepShape_GeometricSetSelect.Init (method)
  Init(theValue: StepShape_GeometricSetSelect): void;

  // NCollection_Array1_StepShape_GeometricSetSelect.Size (method)
  Size(): number;

  // NCollection_Array1_StepShape_GeometricSetSelect.Length (method)
  Length(): number;

  // NCollection_Array1_StepShape_GeometricSetSelect.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepShape_GeometricSetSelect.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepShape_GeometricSetSelect.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepShape_GeometricSetSelect.Assign (method)
  Assign(theOther: NCollection_Array1_StepShape_GeometricSetSelect): NCollection_Array1_StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepShape_GeometricSetSelect): NCollection_Array1_StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.Move (method)
  Move(theOther: NCollection_Array1_StepShape_GeometricSetSelect): NCollection_Array1_StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.First (method)
  First(): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.ChangeFirst (method)
  ChangeFirst(): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.Last (method)
  Last(): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.ChangeLast (method)
  ChangeLast(): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.Value (method)
  Value(theIndex: number): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.At (method)
  At(theIndex: number): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_GeometricSetSelect;

  // NCollection_Array1_StepShape_GeometricSetSelect.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_GeometricSetSelect): void;

  // NCollection_Array1_StepShape_GeometricSetSelect.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepShape_GeometricSetSelect.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepShape_GeometricSetSelect.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepShape_GeometricSetSelect.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepShape_GeometricSetSelect.delete (method)
  delete(): void;

  // NCollection_Array1_StepShape_GeometricSetSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepShape_ShapeDimensionRepresentationItem: declare class NCollection_Array1_StepShape_ShapeDimensionRepresentationItem

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_ShapeDimensionRepresentationItem, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_ShapeDimensionRepresentationItem, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Init (method)
  Init(theValue: StepShape_ShapeDimensionRepresentationItem): void;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Size (method)
  Size(): number;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Length (method)
  Length(): number;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Assign (method)
  Assign(theOther: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem): NCollection_Array1_StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem): NCollection_Array1_StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Move (method)
  Move(theOther: NCollection_Array1_StepShape_ShapeDimensionRepresentationItem): NCollection_Array1_StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.First (method)
  First(): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.ChangeFirst (method)
  ChangeFirst(): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Last (method)
  Last(): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.ChangeLast (method)
  ChangeLast(): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Value (method)
  Value(theIndex: number): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.At (method)
  At(theIndex: number): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_ShapeDimensionRepresentationItem;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_ShapeDimensionRepresentationItem): void;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.delete (method)
  delete(): void;

  // NCollection_Array1_StepShape_ShapeDimensionRepresentationItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepShape_Shell: declare class NCollection_Array1_StepShape_Shell

  // NCollection_Array1_StepShape_Shell.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepShape_Shell);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_Shell, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_Shell, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepShape_Shell.Init (method)
  Init(theValue: StepShape_Shell): void;

  // NCollection_Array1_StepShape_Shell.Size (method)
  Size(): number;

  // NCollection_Array1_StepShape_Shell.Length (method)
  Length(): number;

  // NCollection_Array1_StepShape_Shell.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepShape_Shell.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepShape_Shell.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepShape_Shell.Assign (method)
  Assign(theOther: NCollection_Array1_StepShape_Shell): NCollection_Array1_StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepShape_Shell): NCollection_Array1_StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.Move (method)
  Move(theOther: NCollection_Array1_StepShape_Shell): NCollection_Array1_StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.First (method)
  First(): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.ChangeFirst (method)
  ChangeFirst(): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.Last (method)
  Last(): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.ChangeLast (method)
  ChangeLast(): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.Value (method)
  Value(theIndex: number): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.At (method)
  At(theIndex: number): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_Shell;

  // NCollection_Array1_StepShape_Shell.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_Shell): void;

  // NCollection_Array1_StepShape_Shell.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepShape_Shell.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepShape_Shell.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepShape_Shell.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepShape_Shell.delete (method)
  delete(): void;

  // NCollection_Array1_StepShape_Shell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepShape_ValueQualifier: declare class NCollection_Array1_StepShape_ValueQualifier

  // NCollection_Array1_StepShape_ValueQualifier.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepShape_ValueQualifier);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepShape_ValueQualifier, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepShape_ValueQualifier, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepShape_ValueQualifier.Init (method)
  Init(theValue: StepShape_ValueQualifier): void;

  // NCollection_Array1_StepShape_ValueQualifier.Size (method)
  Size(): number;

  // NCollection_Array1_StepShape_ValueQualifier.Length (method)
  Length(): number;

  // NCollection_Array1_StepShape_ValueQualifier.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepShape_ValueQualifier.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepShape_ValueQualifier.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepShape_ValueQualifier.Assign (method)
  Assign(theOther: NCollection_Array1_StepShape_ValueQualifier): NCollection_Array1_StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepShape_ValueQualifier): NCollection_Array1_StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.Move (method)
  Move(theOther: NCollection_Array1_StepShape_ValueQualifier): NCollection_Array1_StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.First (method)
  First(): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.ChangeFirst (method)
  ChangeFirst(): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.Last (method)
  Last(): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.ChangeLast (method)
  ChangeLast(): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.Value (method)
  Value(theIndex: number): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.ChangeValue (method)
  ChangeValue(theIndex: number): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.At (method)
  At(theIndex: number): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.ChangeAt (method)
  ChangeAt(theIndex: number): StepShape_ValueQualifier;

  // NCollection_Array1_StepShape_ValueQualifier.SetValue (method)
  SetValue(theIndex: number, theItem: StepShape_ValueQualifier): void;

  // NCollection_Array1_StepShape_ValueQualifier.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepShape_ValueQualifier.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepShape_ValueQualifier.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepShape_ValueQualifier.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepShape_ValueQualifier.delete (method)
  delete(): void;

  // NCollection_Array1_StepShape_ValueQualifier.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

NCollection_Array1_StepVisual_AnnotationPlaneElement: declare class NCollection_Array1_StepVisual_AnnotationPlaneElement

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.constructor (constructor)
  constructor();
  constructor(theSize: number);
  constructor(theOther: NCollection_Array1_StepVisual_AnnotationPlaneElement);
  constructor(theLower: number, theUpper: number);
  constructor(theBegin: StepVisual_AnnotationPlaneElement, theSize: number, theUseBuffer: boolean);
  constructor(theBegin: StepVisual_AnnotationPlaneElement, theLower: number, theUpper: number, theUseBuffer?: boolean);

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Init (method)
  Init(theValue: StepVisual_AnnotationPlaneElement): void;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Size (method)
  Size(): number;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Length (method)
  Length(): number;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.IsEmpty (method)
  IsEmpty(): boolean;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Lower (method)
  Lower(): number;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Upper (method)
  Upper(): number;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Assign (method)
  Assign(theOther: NCollection_Array1_StepVisual_AnnotationPlaneElement): NCollection_Array1_StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.CopyValues (method)
  CopyValues(theOther: NCollection_Array1_StepVisual_AnnotationPlaneElement): NCollection_Array1_StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Move (method)
  Move(theOther: NCollection_Array1_StepVisual_AnnotationPlaneElement): NCollection_Array1_StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.First (method)
  First(): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.ChangeFirst (method)
  ChangeFirst(): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Last (method)
  Last(): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.ChangeLast (method)
  ChangeLast(): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Value (method)
  Value(theIndex: number): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.ChangeValue (method)
  ChangeValue(theIndex: number): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.At (method)
  At(theIndex: number): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.ChangeAt (method)
  ChangeAt(theIndex: number): StepVisual_AnnotationPlaneElement;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.SetValue (method)
  SetValue(theIndex: number, theItem: StepVisual_AnnotationPlaneElement): void;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.UpdateLowerBound (method)
  UpdateLowerBound(theLower: number): void;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.UpdateUpperBound (method)
  UpdateUpperBound(theUpper: number): void;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.Resize (method)
  Resize(theLower: number, theUpper: number, theToCopyData: boolean): void;
  Resize(theSize: number, theToCopyData: boolean): void;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.IsDeletable (method)
  IsDeletable(): boolean;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.delete (method)
  delete(): void;

  // NCollection_Array1_StepVisual_AnnotationPlaneElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
