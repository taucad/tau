# libcascade — StepGeom

26 top-level symbols. Signatures are verbatim typescript.

StepGeom_Axis1Placement: declare class StepGeom_Axis1Placement extends StepGeom_Placement

  // StepGeom_Axis1Placement.constructor (constructor)
  constructor();

  // StepGeom_Axis1Placement.Init (method)
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Axis1Placement.SetAxis (method)
  SetAxis(aAxis: StepGeom_Direction): void;

  // StepGeom_Axis1Placement.UnSetAxis (method)
  UnSetAxis(): void;

  // StepGeom_Axis1Placement.Axis (method)
  Axis(): StepGeom_Direction;

  // StepGeom_Axis1Placement.HasAxis (method)
  HasAxis(): boolean;

  // StepGeom_Axis1Placement.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Axis1Placement.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Axis1Placement.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Axis1Placement.delete (method)
  delete(): void;

  // StepGeom_Axis1Placement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Axis2Placement: declare class StepGeom_Axis2Placement extends StepData_SelectType

  // StepGeom_Axis2Placement.constructor (constructor)
  constructor();

  // StepGeom_Axis2Placement.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepGeom_Axis2Placement.Axis2Placement2d (method)
  Axis2Placement2d(): StepGeom_Axis2Placement2d;

  // StepGeom_Axis2Placement.Axis2Placement3d (method)
  Axis2Placement3d(): StepGeom_Axis2Placement3d;

  // StepGeom_Axis2Placement.delete (method)
  delete(): void;

  // StepGeom_Axis2Placement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Axis2Placement2d: declare class StepGeom_Axis2Placement2d extends StepGeom_Placement

  // StepGeom_Axis2Placement2d.constructor (constructor)
  constructor();

  // StepGeom_Axis2Placement2d.Init (method)
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Axis2Placement2d.SetRefDirection (method)
  SetRefDirection(aRefDirection: StepGeom_Direction): void;

  // StepGeom_Axis2Placement2d.UnSetRefDirection (method)
  UnSetRefDirection(): void;

  // StepGeom_Axis2Placement2d.RefDirection (method)
  RefDirection(): StepGeom_Direction;

  // StepGeom_Axis2Placement2d.HasRefDirection (method)
  HasRefDirection(): boolean;

  // StepGeom_Axis2Placement2d.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Axis2Placement2d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Axis2Placement2d.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Axis2Placement2d.delete (method)
  delete(): void;

  // StepGeom_Axis2Placement2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Axis2Placement3d: declare class StepGeom_Axis2Placement3d extends StepGeom_Placement

  // StepGeom_Axis2Placement3d.constructor (constructor)
  constructor();

  // StepGeom_Axis2Placement3d.Init (method)
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Axis2Placement3d.SetAxis (method)
  SetAxis(aAxis: StepGeom_Direction): void;

  // StepGeom_Axis2Placement3d.UnSetAxis (method)
  UnSetAxis(): void;

  // StepGeom_Axis2Placement3d.Axis (method)
  Axis(): StepGeom_Direction;

  // StepGeom_Axis2Placement3d.HasAxis (method)
  HasAxis(): boolean;

  // StepGeom_Axis2Placement3d.SetRefDirection (method)
  SetRefDirection(aRefDirection: StepGeom_Direction): void;

  // StepGeom_Axis2Placement3d.UnSetRefDirection (method)
  UnSetRefDirection(): void;

  // StepGeom_Axis2Placement3d.RefDirection (method)
  RefDirection(): StepGeom_Direction;

  // StepGeom_Axis2Placement3d.HasRefDirection (method)
  HasRefDirection(): boolean;

  // StepGeom_Axis2Placement3d.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Axis2Placement3d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Axis2Placement3d.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Axis2Placement3d.delete (method)
  delete(): void;

  // StepGeom_Axis2Placement3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BSplineCurve: declare class StepGeom_BSplineCurve extends StepGeom_BoundedCurve

  // StepGeom_BSplineCurve.constructor (constructor)
  constructor();

  // StepGeom_BSplineCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BSplineCurve.SetDegree (method)
  SetDegree(aDegree: number): void;

  // StepGeom_BSplineCurve.Degree (method)
  Degree(): number;

  // StepGeom_BSplineCurve.SetControlPointsList (method)
  SetControlPointsList(aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;

  // StepGeom_BSplineCurve.ControlPointsList (method)
  ControlPointsList(): NCollection_HArray1_handle_StepGeom_CartesianPoint;

  // StepGeom_BSplineCurve.ControlPointsListValue (method)
  ControlPointsListValue(num: number): StepGeom_CartesianPoint;

  // StepGeom_BSplineCurve.NbControlPointsList (method)
  NbControlPointsList(): number;

  // StepGeom_BSplineCurve.SetCurveForm (method)
  SetCurveForm(aCurveForm: StepGeom_BSplineCurveForm): void;

  // StepGeom_BSplineCurve.CurveForm (method)
  CurveForm(): StepGeom_BSplineCurveForm;

  // StepGeom_BSplineCurve.SetClosedCurve (method)
  SetClosedCurve(aClosedCurve: StepData_Logical): void;

  // StepGeom_BSplineCurve.ClosedCurve (method)
  ClosedCurve(): StepData_Logical;

  // StepGeom_BSplineCurve.SetSelfIntersect (method)
  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  // StepGeom_BSplineCurve.SelfIntersect (method)
  SelfIntersect(): StepData_Logical;

  // StepGeom_BSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BSplineCurve.delete (method)
  delete(): void;

  // StepGeom_BSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BSplineCurveForm: typeof StepGeom_BSplineCurveForm[keyof typeof StepGeom_BSplineCurveForm]

  readonly StepGeom_bscfPolylineForm: 'StepGeom_bscfPolylineForm'

  readonly StepGeom_bscfCircularArc: 'StepGeom_bscfCircularArc'

  readonly StepGeom_bscfEllipticArc: 'StepGeom_bscfEllipticArc'

  readonly StepGeom_bscfParabolicArc: 'StepGeom_bscfParabolicArc'

  readonly StepGeom_bscfHyperbolicArc: 'StepGeom_bscfHyperbolicArc'

  readonly StepGeom_bscfUnspecified: 'StepGeom_bscfUnspecified'

StepGeom_BSplineCurveWithKnots: declare class StepGeom_BSplineCurveWithKnots extends StepGeom_BSplineCurve

  // StepGeom_BSplineCurveWithKnots.constructor (constructor)
  constructor();

  // StepGeom_BSplineCurveWithKnots.Init (method)
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BSplineCurveWithKnots.SetKnotMultiplicities (method)
  SetKnotMultiplicities(aKnotMultiplicities: NCollection_HArray1_int): void;

  // StepGeom_BSplineCurveWithKnots.KnotMultiplicities (method)
  KnotMultiplicities(): NCollection_HArray1_int;

  // StepGeom_BSplineCurveWithKnots.KnotMultiplicitiesValue (method)
  KnotMultiplicitiesValue(num: number): number;

  // StepGeom_BSplineCurveWithKnots.NbKnotMultiplicities (method)
  NbKnotMultiplicities(): number;

  // StepGeom_BSplineCurveWithKnots.SetKnots (method)
  SetKnots(aKnots: NCollection_HArray1_double): void;

  // StepGeom_BSplineCurveWithKnots.Knots (method)
  Knots(): NCollection_HArray1_double;

  // StepGeom_BSplineCurveWithKnots.KnotsValue (method)
  KnotsValue(num: number): number;

  // StepGeom_BSplineCurveWithKnots.NbKnots (method)
  NbKnots(): number;

  // StepGeom_BSplineCurveWithKnots.SetKnotSpec (method)
  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  // StepGeom_BSplineCurveWithKnots.KnotSpec (method)
  KnotSpec(): StepGeom_KnotType;

  // StepGeom_BSplineCurveWithKnots.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BSplineCurveWithKnots.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BSplineCurveWithKnots.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BSplineCurveWithKnots.delete (method)
  delete(): void;

  // StepGeom_BSplineCurveWithKnots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve: declare class StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve extends StepGeom_BSplineCurve

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.constructor (constructor)
  constructor();

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineCurveWithKnots: StepGeom_BSplineCurveWithKnots, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.SetBSplineCurveWithKnots (method)
  SetBSplineCurveWithKnots(aBSplineCurveWithKnots: StepGeom_BSplineCurveWithKnots): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.BSplineCurveWithKnots (method)
  BSplineCurveWithKnots(): StepGeom_BSplineCurveWithKnots;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.SetRationalBSplineCurve (method)
  SetRationalBSplineCurve(aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.RationalBSplineCurve (method)
  RationalBSplineCurve(): StepGeom_RationalBSplineCurve;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.SetKnotMultiplicities (method)
  SetKnotMultiplicities(aKnotMultiplicities: NCollection_HArray1_int): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.KnotMultiplicities (method)
  KnotMultiplicities(): NCollection_HArray1_int;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.KnotMultiplicitiesValue (method)
  KnotMultiplicitiesValue(num: number): number;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.NbKnotMultiplicities (method)
  NbKnotMultiplicities(): number;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.SetKnots (method)
  SetKnots(aKnots: NCollection_HArray1_double): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.Knots (method)
  Knots(): NCollection_HArray1_double;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.KnotsValue (method)
  KnotsValue(num: number): number;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.NbKnots (method)
  NbKnots(): number;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.SetKnotSpec (method)
  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.KnotSpec (method)
  KnotSpec(): StepGeom_KnotType;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.WeightsData (method)
  WeightsData(): NCollection_HArray1_double;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.WeightsDataValue (method)
  WeightsDataValue(num: number): number;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.NbWeightsData (method)
  NbWeightsData(): number;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.delete (method)
  delete(): void;

  // StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BSplineSurface: declare class StepGeom_BSplineSurface extends StepGeom_BoundedSurface

  // StepGeom_BSplineSurface.constructor (constructor)
  constructor();

  // StepGeom_BSplineSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BSplineSurface.SetUDegree (method)
  SetUDegree(aUDegree: number): void;

  // StepGeom_BSplineSurface.UDegree (method)
  UDegree(): number;

  // StepGeom_BSplineSurface.SetVDegree (method)
  SetVDegree(aVDegree: number): void;

  // StepGeom_BSplineSurface.VDegree (method)
  VDegree(): number;

  // StepGeom_BSplineSurface.SetControlPointsList (method)
  SetControlPointsList(aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint): void;

  // StepGeom_BSplineSurface.ControlPointsList (method)
  ControlPointsList(): NCollection_HArray2_handle_StepGeom_CartesianPoint;

  // StepGeom_BSplineSurface.ControlPointsListValue (method)
  ControlPointsListValue(num1: number, num2: number): StepGeom_CartesianPoint;

  // StepGeom_BSplineSurface.NbControlPointsListI (method)
  NbControlPointsListI(): number;

  // StepGeom_BSplineSurface.NbControlPointsListJ (method)
  NbControlPointsListJ(): number;

  // StepGeom_BSplineSurface.SetSurfaceForm (method)
  SetSurfaceForm(aSurfaceForm: StepGeom_BSplineSurfaceForm): void;

  // StepGeom_BSplineSurface.SurfaceForm (method)
  SurfaceForm(): StepGeom_BSplineSurfaceForm;

  // StepGeom_BSplineSurface.SetUClosed (method)
  SetUClosed(aUClosed: StepData_Logical): void;

  // StepGeom_BSplineSurface.UClosed (method)
  UClosed(): StepData_Logical;

  // StepGeom_BSplineSurface.SetVClosed (method)
  SetVClosed(aVClosed: StepData_Logical): void;

  // StepGeom_BSplineSurface.VClosed (method)
  VClosed(): StepData_Logical;

  // StepGeom_BSplineSurface.SetSelfIntersect (method)
  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  // StepGeom_BSplineSurface.SelfIntersect (method)
  SelfIntersect(): StepData_Logical;

  // StepGeom_BSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BSplineSurface.delete (method)
  delete(): void;

  // StepGeom_BSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BSplineSurfaceForm: typeof StepGeom_BSplineSurfaceForm[keyof typeof StepGeom_BSplineSurfaceForm]

  readonly StepGeom_bssfPlaneSurf: 'StepGeom_bssfPlaneSurf'

  readonly StepGeom_bssfCylindricalSurf: 'StepGeom_bssfCylindricalSurf'

  readonly StepGeom_bssfConicalSurf: 'StepGeom_bssfConicalSurf'

  readonly StepGeom_bssfSphericalSurf: 'StepGeom_bssfSphericalSurf'

  readonly StepGeom_bssfToroidalSurf: 'StepGeom_bssfToroidalSurf'

  readonly StepGeom_bssfSurfOfRevolution: 'StepGeom_bssfSurfOfRevolution'

  readonly StepGeom_bssfRuledSurf: 'StepGeom_bssfRuledSurf'

  readonly StepGeom_bssfGeneralisedCone: 'StepGeom_bssfGeneralisedCone'

  readonly StepGeom_bssfQuadricSurf: 'StepGeom_bssfQuadricSurf'

  readonly StepGeom_bssfSurfOfLinearExtrusion: 'StepGeom_bssfSurfOfLinearExtrusion'

  readonly StepGeom_bssfUnspecified: 'StepGeom_bssfUnspecified'

StepGeom_BSplineSurfaceWithKnots: declare class StepGeom_BSplineSurfaceWithKnots extends StepGeom_BSplineSurface

  // StepGeom_BSplineSurfaceWithKnots.constructor (constructor)
  constructor();

  // StepGeom_BSplineSurfaceWithKnots.Init (method)
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BSplineSurfaceWithKnots.SetUMultiplicities (method)
  SetUMultiplicities(aUMultiplicities: NCollection_HArray1_int): void;

  // StepGeom_BSplineSurfaceWithKnots.UMultiplicities (method)
  UMultiplicities(): NCollection_HArray1_int;

  // StepGeom_BSplineSurfaceWithKnots.UMultiplicitiesValue (method)
  UMultiplicitiesValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnots.NbUMultiplicities (method)
  NbUMultiplicities(): number;

  // StepGeom_BSplineSurfaceWithKnots.SetVMultiplicities (method)
  SetVMultiplicities(aVMultiplicities: NCollection_HArray1_int): void;

  // StepGeom_BSplineSurfaceWithKnots.VMultiplicities (method)
  VMultiplicities(): NCollection_HArray1_int;

  // StepGeom_BSplineSurfaceWithKnots.VMultiplicitiesValue (method)
  VMultiplicitiesValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnots.NbVMultiplicities (method)
  NbVMultiplicities(): number;

  // StepGeom_BSplineSurfaceWithKnots.SetUKnots (method)
  SetUKnots(aUKnots: NCollection_HArray1_double): void;

  // StepGeom_BSplineSurfaceWithKnots.UKnots (method)
  UKnots(): NCollection_HArray1_double;

  // StepGeom_BSplineSurfaceWithKnots.UKnotsValue (method)
  UKnotsValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnots.NbUKnots (method)
  NbUKnots(): number;

  // StepGeom_BSplineSurfaceWithKnots.SetVKnots (method)
  SetVKnots(aVKnots: NCollection_HArray1_double): void;

  // StepGeom_BSplineSurfaceWithKnots.VKnots (method)
  VKnots(): NCollection_HArray1_double;

  // StepGeom_BSplineSurfaceWithKnots.VKnotsValue (method)
  VKnotsValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnots.NbVKnots (method)
  NbVKnots(): number;

  // StepGeom_BSplineSurfaceWithKnots.SetKnotSpec (method)
  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  // StepGeom_BSplineSurfaceWithKnots.KnotSpec (method)
  KnotSpec(): StepGeom_KnotType;

  // StepGeom_BSplineSurfaceWithKnots.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BSplineSurfaceWithKnots.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BSplineSurfaceWithKnots.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BSplineSurfaceWithKnots.delete (method)
  delete(): void;

  // StepGeom_BSplineSurfaceWithKnots.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface: declare class StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface extends StepGeom_BSplineSurface

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.constructor (constructor)
  constructor();

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineSurfaceWithKnots: StepGeom_BSplineSurfaceWithKnots, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetBSplineSurfaceWithKnots (method)
  SetBSplineSurfaceWithKnots(aBSplineSurfaceWithKnots: StepGeom_BSplineSurfaceWithKnots): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.BSplineSurfaceWithKnots (method)
  BSplineSurfaceWithKnots(): StepGeom_BSplineSurfaceWithKnots;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetRationalBSplineSurface (method)
  SetRationalBSplineSurface(aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.RationalBSplineSurface (method)
  RationalBSplineSurface(): StepGeom_RationalBSplineSurface;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetUMultiplicities (method)
  SetUMultiplicities(aUMultiplicities: NCollection_HArray1_int): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.UMultiplicities (method)
  UMultiplicities(): NCollection_HArray1_int;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.UMultiplicitiesValue (method)
  UMultiplicitiesValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.NbUMultiplicities (method)
  NbUMultiplicities(): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetVMultiplicities (method)
  SetVMultiplicities(aVMultiplicities: NCollection_HArray1_int): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.VMultiplicities (method)
  VMultiplicities(): NCollection_HArray1_int;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.VMultiplicitiesValue (method)
  VMultiplicitiesValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.NbVMultiplicities (method)
  NbVMultiplicities(): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetUKnots (method)
  SetUKnots(aUKnots: NCollection_HArray1_double): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.UKnots (method)
  UKnots(): NCollection_HArray1_double;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.UKnotsValue (method)
  UKnotsValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.NbUKnots (method)
  NbUKnots(): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetVKnots (method)
  SetVKnots(aVKnots: NCollection_HArray1_double): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.VKnots (method)
  VKnots(): NCollection_HArray1_double;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.VKnotsValue (method)
  VKnotsValue(num: number): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.NbVKnots (method)
  NbVKnots(): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetKnotSpec (method)
  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.KnotSpec (method)
  KnotSpec(): StepGeom_KnotType;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray2_double): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.WeightsData (method)
  WeightsData(): NCollection_HArray2_double;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.WeightsDataValue (method)
  WeightsDataValue(num1: number, num2: number): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.NbWeightsDataI (method)
  NbWeightsDataI(): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.NbWeightsDataJ (method)
  NbWeightsDataJ(): number;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.delete (method)
  delete(): void;

  // StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BezierCurve: declare class StepGeom_BezierCurve extends StepGeom_BSplineCurve

  // StepGeom_BezierCurve.constructor (constructor)
  constructor();

  // StepGeom_BezierCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BezierCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BezierCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BezierCurve.delete (method)
  delete(): void;

  // StepGeom_BezierCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BezierCurveAndRationalBSplineCurve: declare class StepGeom_BezierCurveAndRationalBSplineCurve extends StepGeom_BSplineCurve

  // StepGeom_BezierCurveAndRationalBSplineCurve.constructor (constructor)
  constructor();

  // StepGeom_BezierCurveAndRationalBSplineCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierCurve: StepGeom_BezierCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BezierCurveAndRationalBSplineCurve.SetBezierCurve (method)
  SetBezierCurve(aBezierCurve: StepGeom_BezierCurve): void;

  // StepGeom_BezierCurveAndRationalBSplineCurve.BezierCurve (method)
  BezierCurve(): StepGeom_BezierCurve;

  // StepGeom_BezierCurveAndRationalBSplineCurve.SetRationalBSplineCurve (method)
  SetRationalBSplineCurve(aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;

  // StepGeom_BezierCurveAndRationalBSplineCurve.RationalBSplineCurve (method)
  RationalBSplineCurve(): StepGeom_RationalBSplineCurve;

  // StepGeom_BezierCurveAndRationalBSplineCurve.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  // StepGeom_BezierCurveAndRationalBSplineCurve.WeightsData (method)
  WeightsData(): NCollection_HArray1_double;

  // StepGeom_BezierCurveAndRationalBSplineCurve.WeightsDataValue (method)
  WeightsDataValue(num: number): number;

  // StepGeom_BezierCurveAndRationalBSplineCurve.NbWeightsData (method)
  NbWeightsData(): number;

  // StepGeom_BezierCurveAndRationalBSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BezierCurveAndRationalBSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BezierCurveAndRationalBSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BezierCurveAndRationalBSplineCurve.delete (method)
  delete(): void;

  // StepGeom_BezierCurveAndRationalBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BezierSurface: declare class StepGeom_BezierSurface extends StepGeom_BSplineSurface

  // StepGeom_BezierSurface.constructor (constructor)
  constructor();

  // StepGeom_BezierSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BezierSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BezierSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BezierSurface.delete (method)
  delete(): void;

  // StepGeom_BezierSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BezierSurfaceAndRationalBSplineSurface: declare class StepGeom_BezierSurfaceAndRationalBSplineSurface extends StepGeom_BSplineSurface

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.constructor (constructor)
  constructor();

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBezierSurface: StepGeom_BezierSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.SetBezierSurface (method)
  SetBezierSurface(aBezierSurface: StepGeom_BezierSurface): void;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.BezierSurface (method)
  BezierSurface(): StepGeom_BezierSurface;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.SetRationalBSplineSurface (method)
  SetRationalBSplineSurface(aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.RationalBSplineSurface (method)
  RationalBSplineSurface(): StepGeom_RationalBSplineSurface;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray2_double): void;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.WeightsData (method)
  WeightsData(): NCollection_HArray2_double;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.WeightsDataValue (method)
  WeightsDataValue(num1: number, num2: number): number;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.NbWeightsDataI (method)
  NbWeightsDataI(): number;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.NbWeightsDataJ (method)
  NbWeightsDataJ(): number;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.delete (method)
  delete(): void;

  // StepGeom_BezierSurfaceAndRationalBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BoundaryCurve: declare class StepGeom_BoundaryCurve extends StepGeom_CompositeCurveOnSurface

  // StepGeom_BoundaryCurve.constructor (constructor)
  constructor();

  // StepGeom_BoundaryCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BoundaryCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BoundaryCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BoundaryCurve.delete (method)
  delete(): void;

  // StepGeom_BoundaryCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BoundedCurve: declare class StepGeom_BoundedCurve extends StepGeom_Curve

  // StepGeom_BoundedCurve.constructor (constructor)
  constructor();

  // StepGeom_BoundedCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BoundedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BoundedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BoundedCurve.delete (method)
  delete(): void;

  // StepGeom_BoundedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_BoundedSurface: declare class StepGeom_BoundedSurface extends StepGeom_Surface

  // StepGeom_BoundedSurface.constructor (constructor)
  constructor();

  // StepGeom_BoundedSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_BoundedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_BoundedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_BoundedSurface.delete (method)
  delete(): void;

  // StepGeom_BoundedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CartesianPoint: declare class StepGeom_CartesianPoint extends StepGeom_Point

  // StepGeom_CartesianPoint.constructor (constructor)
  constructor();

  // StepGeom_CartesianPoint.Init (method)
  Init(theName: TCollection_HAsciiString, theCoordinates: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_CartesianPoint.Init2D (method)
  Init2D(theName: TCollection_HAsciiString, theX: number, theY: number): void;

  // StepGeom_CartesianPoint.Init3D (method)
  Init3D(theName: TCollection_HAsciiString, theX: number, theY: number, theZ: number): void;

  // StepGeom_CartesianPoint.SetCoordinates (method)
  SetCoordinates(theCoordinates: NCollection_HArray1_double): void;
  SetCoordinates(theCoordinates: [number, number, number]): void;

  // StepGeom_CartesianPoint.Coordinates (method)
  Coordinates(): [number, number, number];

  // StepGeom_CartesianPoint.CoordinatesValue (method)
  CoordinatesValue(theInd: number): number;

  // StepGeom_CartesianPoint.SetNbCoordinates (method)
  SetNbCoordinates(theSize: number): void;

  // StepGeom_CartesianPoint.NbCoordinates (method)
  NbCoordinates(): number;

  // StepGeom_CartesianPoint.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CartesianPoint.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CartesianPoint.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CartesianPoint.delete (method)
  delete(): void;

  // StepGeom_CartesianPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CartesianTransformationOperator: declare class StepGeom_CartesianTransformationOperator extends StepGeom_GeometricRepresentationItem

  // StepGeom_CartesianTransformationOperator.constructor (constructor)
  constructor();

  // StepGeom_CartesianTransformationOperator.Init (method)
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_CartesianTransformationOperator.SetAxis1 (method)
  SetAxis1(aAxis1: StepGeom_Direction): void;

  // StepGeom_CartesianTransformationOperator.UnSetAxis1 (method)
  UnSetAxis1(): void;

  // StepGeom_CartesianTransformationOperator.Axis1 (method)
  Axis1(): StepGeom_Direction;

  // StepGeom_CartesianTransformationOperator.HasAxis1 (method)
  HasAxis1(): boolean;

  // StepGeom_CartesianTransformationOperator.SetAxis2 (method)
  SetAxis2(aAxis2: StepGeom_Direction): void;

  // StepGeom_CartesianTransformationOperator.UnSetAxis2 (method)
  UnSetAxis2(): void;

  // StepGeom_CartesianTransformationOperator.Axis2 (method)
  Axis2(): StepGeom_Direction;

  // StepGeom_CartesianTransformationOperator.HasAxis2 (method)
  HasAxis2(): boolean;

  // StepGeom_CartesianTransformationOperator.SetLocalOrigin (method)
  SetLocalOrigin(aLocalOrigin: StepGeom_CartesianPoint): void;

  // StepGeom_CartesianTransformationOperator.LocalOrigin (method)
  LocalOrigin(): StepGeom_CartesianPoint;

  // StepGeom_CartesianTransformationOperator.SetScale (method)
  SetScale(aScale: number): void;

  // StepGeom_CartesianTransformationOperator.UnSetScale (method)
  UnSetScale(): void;

  // StepGeom_CartesianTransformationOperator.Scale (method)
  Scale(): number;

  // StepGeom_CartesianTransformationOperator.HasScale (method)
  HasScale(): boolean;

  // StepGeom_CartesianTransformationOperator.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CartesianTransformationOperator.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CartesianTransformationOperator.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CartesianTransformationOperator.delete (method)
  delete(): void;

  // StepGeom_CartesianTransformationOperator.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CartesianTransformationOperator2d: declare class StepGeom_CartesianTransformationOperator2d extends StepGeom_CartesianTransformationOperator

  // StepGeom_CartesianTransformationOperator2d.constructor (constructor)
  constructor();

  // StepGeom_CartesianTransformationOperator2d.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CartesianTransformationOperator2d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CartesianTransformationOperator2d.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CartesianTransformationOperator2d.delete (method)
  delete(): void;

  // StepGeom_CartesianTransformationOperator2d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CartesianTransformationOperator3d: declare class StepGeom_CartesianTransformationOperator3d extends StepGeom_CartesianTransformationOperator

  // StepGeom_CartesianTransformationOperator3d.constructor (constructor)
  constructor();

  // StepGeom_CartesianTransformationOperator3d.Init (method)
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number, hasAaxis3: boolean, aAxis3: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, hasAaxis1: boolean, aAxis1: StepGeom_Direction, hasAaxis2: boolean, aAxis2: StepGeom_Direction, aLocalOrigin: StepGeom_CartesianPoint, hasAscale: boolean, aScale: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_CartesianTransformationOperator3d.SetAxis3 (method)
  SetAxis3(aAxis3: StepGeom_Direction): void;

  // StepGeom_CartesianTransformationOperator3d.UnSetAxis3 (method)
  UnSetAxis3(): void;

  // StepGeom_CartesianTransformationOperator3d.Axis3 (method)
  Axis3(): StepGeom_Direction;

  // StepGeom_CartesianTransformationOperator3d.HasAxis3 (method)
  HasAxis3(): boolean;

  // StepGeom_CartesianTransformationOperator3d.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CartesianTransformationOperator3d.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CartesianTransformationOperator3d.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CartesianTransformationOperator3d.delete (method)
  delete(): void;

  // StepGeom_CartesianTransformationOperator3d.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Circle: declare class StepGeom_Circle extends StepGeom_Conic

  // StepGeom_Circle.constructor (constructor)
  constructor();

  // StepGeom_Circle.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Circle.SetRadius (method)
  SetRadius(aRadius: number): void;

  // StepGeom_Circle.Radius (method)
  Radius(): number;

  // StepGeom_Circle.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Circle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Circle.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Circle.delete (method)
  delete(): void;

  // StepGeom_Circle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CompositeCurve: declare class StepGeom_CompositeCurve extends StepGeom_BoundedCurve

  // StepGeom_CompositeCurve.constructor (constructor)
  constructor();

  // StepGeom_CompositeCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aSegments: NCollection_HArray1_handle_StepGeom_CompositeCurveSegment, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_CompositeCurve.SetSegments (method)
  SetSegments(aSegments: NCollection_HArray1_handle_StepGeom_CompositeCurveSegment): void;

  // StepGeom_CompositeCurve.Segments (method)
  Segments(): NCollection_HArray1_handle_StepGeom_CompositeCurveSegment;

  // StepGeom_CompositeCurve.SegmentsValue (method)
  SegmentsValue(num: number): StepGeom_CompositeCurveSegment;

  // StepGeom_CompositeCurve.NbSegments (method)
  NbSegments(): number;

  // StepGeom_CompositeCurve.SetSelfIntersect (method)
  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  // StepGeom_CompositeCurve.SelfIntersect (method)
  SelfIntersect(): StepData_Logical;

  // StepGeom_CompositeCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CompositeCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CompositeCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CompositeCurve.delete (method)
  delete(): void;

  // StepGeom_CompositeCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_CompositeCurveOnSurface: declare class StepGeom_CompositeCurveOnSurface extends StepGeom_CompositeCurve

  // StepGeom_CompositeCurveOnSurface.constructor (constructor)
  constructor();

  // StepGeom_CompositeCurveOnSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_CompositeCurveOnSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_CompositeCurveOnSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_CompositeCurveOnSurface.delete (method)
  delete(): void;

  // StepGeom_CompositeCurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
