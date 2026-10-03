# libcascade — HelixGeom

6 top-level symbols. Signatures are verbatim typescript.

HelixGeom_BuilderApproxCurve: declare class HelixGeom_BuilderApproxCurve

  // HelixGeom_BuilderApproxCurve.SetApproxParameters (method)
  SetApproxParameters(aCont: GeomAbs_Shape, aMaxDegree: number, aMaxSeg: number): void;

  // HelixGeom_BuilderApproxCurve.SetTolerance (method)
  SetTolerance(aTolerance: number): void;

  // HelixGeom_BuilderApproxCurve.Tolerance (method)
  Tolerance(): number;

  // HelixGeom_BuilderApproxCurve.ToleranceReached (method)
  ToleranceReached(): number;

  // HelixGeom_BuilderApproxCurve.Curves (method)
  Curves(): NCollection_Sequence_handle_Geom_Curve;

  // HelixGeom_BuilderApproxCurve.ErrorStatus (method)
  ErrorStatus(): number;

  // HelixGeom_BuilderApproxCurve.WarningStatus (method)
  WarningStatus(): number;

  // HelixGeom_BuilderApproxCurve.Perform (method)
  Perform(): void;

  // HelixGeom_BuilderApproxCurve.delete (method)
  delete(): void;

  // HelixGeom_BuilderApproxCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HelixGeom_BuilderHelix: declare class HelixGeom_BuilderHelix extends HelixGeom_BuilderHelixGen

  // HelixGeom_BuilderHelix.constructor (constructor)
  constructor();

  // HelixGeom_BuilderHelix.SetPosition (method)
  SetPosition(aAx2: gp_Ax2): void;

  // HelixGeom_BuilderHelix.Position (method)
  Position(): gp_Ax2;

  // HelixGeom_BuilderHelix.Perform (method)
  Perform(): void;

  // HelixGeom_BuilderHelix.delete (method)
  delete(): void;

  // HelixGeom_BuilderHelix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HelixGeom_BuilderHelixCoil: declare class HelixGeom_BuilderHelixCoil extends HelixGeom_BuilderHelixGen

  // HelixGeom_BuilderHelixCoil.constructor (constructor)
  constructor();

  // HelixGeom_BuilderHelixCoil.Perform (method)
  Perform(): void;

  // HelixGeom_BuilderHelixCoil.delete (method)
  delete(): void;

  // HelixGeom_BuilderHelixCoil.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HelixGeom_BuilderHelixGen: declare class HelixGeom_BuilderHelixGen extends HelixGeom_BuilderApproxCurve

  // HelixGeom_BuilderHelixGen.SetCurveParameters (method)
  SetCurveParameters(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, bIsClockwise: boolean): void;

  // HelixGeom_BuilderHelixGen.CurveParameters (method)
  CurveParameters(aT1?: number, aT2?: number, aPitch?: number, aRStart?: number, aTaperAngle?: number, bIsClockwise?: boolean): { aT1: number; aT2: number; aPitch: number; aRStart: number; aTaperAngle: number; bIsClockwise: boolean };

  // HelixGeom_BuilderHelixGen.delete (method)
  delete(): void;

  // HelixGeom_BuilderHelixGen.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HelixGeom_HelixCurve: declare class HelixGeom_HelixCurve extends Adaptor3d_Curve

  // HelixGeom_HelixCurve.constructor (constructor)
  constructor();

  // HelixGeom_HelixCurve.get_type_name (method)
  static get_type_name(): string;

  // HelixGeom_HelixCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // HelixGeom_HelixCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // HelixGeom_HelixCurve.Load (method)
  Load(): void;
  Load(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean): void;

  // HelixGeom_HelixCurve.FirstParameter (method)
  FirstParameter(): number;

  // HelixGeom_HelixCurve.LastParameter (method)
  LastParameter(): number;

  // HelixGeom_HelixCurve.Continuity (method)
  Continuity(): GeomAbs_Shape;

  // HelixGeom_HelixCurve.NbIntervals (method)
  NbIntervals(S: GeomAbs_Shape): number;

  // HelixGeom_HelixCurve.Intervals (method)
  Intervals(T: NCollection_Array1_double, S: GeomAbs_Shape): void;

  // HelixGeom_HelixCurve.Resolution (method)
  Resolution(R3d: number): number;

  // HelixGeom_HelixCurve.IsClosed (method)
  IsClosed(): boolean;

  // HelixGeom_HelixCurve.IsPeriodic (method)
  IsPeriodic(): boolean;

  // HelixGeom_HelixCurve.Period (method)
  Period(): number;

  // HelixGeom_HelixCurve.EvalD0 (method)
  EvalD0(theU: number): gp_Pnt;

  // HelixGeom_HelixCurve.EvalD1 (method)
  EvalD1(theU: number): Geom_Curve_ResD1;

  // HelixGeom_HelixCurve.EvalD2 (method)
  EvalD2(theU: number): Geom_Curve_ResD2;

  // HelixGeom_HelixCurve.EvalDN (method)
  EvalDN(theU: number, theN: number): gp_Vec;

  // HelixGeom_HelixCurve.delete (method)
  delete(): void;

  // HelixGeom_HelixCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

HelixGeom_Tools: declare class HelixGeom_Tools

  // HelixGeom_Tools.constructor (constructor)
  constructor();

  // HelixGeom_Tools.ApprHelix (method)
  static ApprHelix(aT1: number, aT2: number, aPitch: number, aRStart: number, aTaperAngle: number, aIsCW: boolean, aTol: number, theMaxError?: number): { returnValue: number; theBSpl: Geom_BSplineCurve; theMaxError: number; [Symbol.dispose](): void };

  // HelixGeom_Tools.ApprCurve3D (method)
  static ApprCurve3D(theHC: Adaptor3d_Curve, theTol: number, theCont: GeomAbs_Shape, theMaxSeg: number, theMaxDeg: number, theMaxError?: number): { returnValue: number; theBSpl: Geom_BSplineCurve; theMaxError: number; [Symbol.dispose](): void };

  // HelixGeom_Tools.delete (method)
  delete(): void;

  // HelixGeom_Tools.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
