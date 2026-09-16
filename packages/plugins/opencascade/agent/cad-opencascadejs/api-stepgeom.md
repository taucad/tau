# libcascade — StepGeom

13 top-level symbols. Signatures are verbatim typescript.

StepGeom_Axis1Placement: declare class StepGeom_Axis1Placement extends StepGeom_Placement

  constructor

  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  SetAxis(aAxis: StepGeom_Direction): void;

  UnSetAxis(): void;

  Axis(): StepGeom_Direction;

  HasAxis(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Axis2Placement: declare class StepGeom_Axis2Placement extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Axis2Placement2d(): StepGeom_Axis2Placement2d;

  Axis2Placement3d(): StepGeom_Axis2Placement3d;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Axis2Placement2d: declare class StepGeom_Axis2Placement2d extends StepGeom_Placement

  constructor

  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  SetRefDirection(aRefDirection: StepGeom_Direction): void;

  UnSetRefDirection(): void;

  RefDirection(): StepGeom_Direction;

  HasRefDirection(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Axis2Placement3d: declare class StepGeom_Axis2Placement3d extends StepGeom_Placement

  constructor

  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint, hasAaxis: boolean, aAxis: StepGeom_Direction, hasArefDirection: boolean, aRefDirection: StepGeom_Direction): void;
  Init(aName: TCollection_HAsciiString, aLocation: StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  SetAxis(aAxis: StepGeom_Direction): void;

  UnSetAxis(): void;

  Axis(): StepGeom_Direction;

  HasAxis(): boolean;

  SetRefDirection(aRefDirection: StepGeom_Direction): void;

  UnSetRefDirection(): void;

  RefDirection(): StepGeom_Direction;

  HasRefDirection(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BSplineCurve: declare class StepGeom_BSplineCurve extends StepGeom_BoundedCurve

  constructor

  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetDegree(aDegree: number): void;

  Degree(): number;

  SetControlPointsList(aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;

  ControlPointsList(): NCollection_HArray1_handle_StepGeom_CartesianPoint;

  ControlPointsListValue(num: number): StepGeom_CartesianPoint;

  NbControlPointsList(): number;

  SetCurveForm(aCurveForm: StepGeom_BSplineCurveForm): void;

  CurveForm(): StepGeom_BSplineCurveForm;

  SetClosedCurve(aClosedCurve: StepData_Logical): void;

  ClosedCurve(): StepData_Logical;

  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  SelfIntersect(): StepData_Logical;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BSplineCurveForm: typeof StepGeom_BSplineCurveForm[keyof typeof StepGeom_BSplineCurveForm]

StepGeom_BSplineCurveWithKnots: declare class StepGeom_BSplineCurveWithKnots extends StepGeom_BSplineCurve

  constructor

  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetKnotMultiplicities(aKnotMultiplicities: NCollection_HArray1_int): void;

  KnotMultiplicities(): NCollection_HArray1_int;

  KnotMultiplicitiesValue(num: number): number;

  NbKnotMultiplicities(): number;

  SetKnots(aKnots: NCollection_HArray1_double): void;

  Knots(): NCollection_HArray1_double;

  KnotsValue(num: number): number;

  NbKnots(): number;

  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  KnotSpec(): StepGeom_KnotType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve: declare class StepGeom_BSplineCurveWithKnotsAndRationalBSplineCurve extends StepGeom_BSplineCurve

  constructor

  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineCurveWithKnots: StepGeom_BSplineCurveWithKnots, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineCurveWithKnots: StepGeom_BSplineCurveWithKnots, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineCurveWithKnots: StepGeom_BSplineCurveWithKnots, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineCurveWithKnots: StepGeom_BSplineCurveWithKnots, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aKnotMultiplicities: NCollection_HArray1_int, aKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBSplineCurveWithKnots(aBSplineCurveWithKnots: StepGeom_BSplineCurveWithKnots): void;

  BSplineCurveWithKnots(): StepGeom_BSplineCurveWithKnots;

  SetRationalBSplineCurve(aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;

  RationalBSplineCurve(): StepGeom_RationalBSplineCurve;

  SetKnotMultiplicities(aKnotMultiplicities: NCollection_HArray1_int): void;

  KnotMultiplicities(): NCollection_HArray1_int;

  KnotMultiplicitiesValue(num: number): number;

  NbKnotMultiplicities(): number;

  SetKnots(aKnots: NCollection_HArray1_double): void;

  Knots(): NCollection_HArray1_double;

  KnotsValue(num: number): number;

  NbKnots(): number;

  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  KnotSpec(): StepGeom_KnotType;

  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  WeightsData(): NCollection_HArray1_double;

  WeightsDataValue(num: number): number;

  NbWeightsData(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BSplineSurface: declare class StepGeom_BSplineSurface extends StepGeom_BoundedSurface

  constructor

  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetUDegree(aUDegree: number): void;

  UDegree(): number;

  SetVDegree(aVDegree: number): void;

  VDegree(): number;

  SetControlPointsList(aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint): void;

  ControlPointsList(): NCollection_HArray2_handle_StepGeom_CartesianPoint;

  ControlPointsListValue(num1: number, num2: number): StepGeom_CartesianPoint;

  NbControlPointsListI(): number;

  NbControlPointsListJ(): number;

  SetSurfaceForm(aSurfaceForm: StepGeom_BSplineSurfaceForm): void;

  SurfaceForm(): StepGeom_BSplineSurfaceForm;

  SetUClosed(aUClosed: StepData_Logical): void;

  UClosed(): StepData_Logical;

  SetVClosed(aVClosed: StepData_Logical): void;

  VClosed(): StepData_Logical;

  SetSelfIntersect(aSelfIntersect: StepData_Logical): void;

  SelfIntersect(): StepData_Logical;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BSplineSurfaceForm: typeof StepGeom_BSplineSurfaceForm[keyof typeof StepGeom_BSplineSurfaceForm]

StepGeom_BSplineSurfaceWithKnots: declare class StepGeom_BSplineSurfaceWithKnots extends StepGeom_BSplineSurface

  constructor

  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetUMultiplicities(aUMultiplicities: NCollection_HArray1_int): void;

  UMultiplicities(): NCollection_HArray1_int;

  UMultiplicitiesValue(num: number): number;

  NbUMultiplicities(): number;

  SetVMultiplicities(aVMultiplicities: NCollection_HArray1_int): void;

  VMultiplicities(): NCollection_HArray1_int;

  VMultiplicitiesValue(num: number): number;

  NbVMultiplicities(): number;

  SetUKnots(aUKnots: NCollection_HArray1_double): void;

  UKnots(): NCollection_HArray1_double;

  UKnotsValue(num: number): number;

  NbUKnots(): number;

  SetVKnots(aVKnots: NCollection_HArray1_double): void;

  VKnots(): NCollection_HArray1_double;

  VKnotsValue(num: number): number;

  NbVKnots(): number;

  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  KnotSpec(): StepGeom_KnotType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface: declare class StepGeom_BSplineSurfaceWithKnotsAndRationalBSplineSurface extends StepGeom_BSplineSurface

  constructor

  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineSurfaceWithKnots: StepGeom_BSplineSurfaceWithKnots, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineSurfaceWithKnots: StepGeom_BSplineSurfaceWithKnots, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineSurfaceWithKnots: StepGeom_BSplineSurfaceWithKnots, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aBSplineSurfaceWithKnots: StepGeom_BSplineSurfaceWithKnots, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUMultiplicities: NCollection_HArray1_int, aVMultiplicities: NCollection_HArray1_int, aUKnots: NCollection_HArray1_double, aVKnots: NCollection_HArray1_double, aKnotSpec: StepGeom_KnotType, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBSplineSurfaceWithKnots(aBSplineSurfaceWithKnots: StepGeom_BSplineSurfaceWithKnots): void;

  BSplineSurfaceWithKnots(): StepGeom_BSplineSurfaceWithKnots;

  SetRationalBSplineSurface(aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;

  RationalBSplineSurface(): StepGeom_RationalBSplineSurface;

  SetUMultiplicities(aUMultiplicities: NCollection_HArray1_int): void;

  UMultiplicities(): NCollection_HArray1_int;

  UMultiplicitiesValue(num: number): number;

  NbUMultiplicities(): number;

  SetVMultiplicities(aVMultiplicities: NCollection_HArray1_int): void;

  VMultiplicities(): NCollection_HArray1_int;

  VMultiplicitiesValue(num: number): number;

  NbVMultiplicities(): number;

  SetUKnots(aUKnots: NCollection_HArray1_double): void;

  UKnots(): NCollection_HArray1_double;

  UKnotsValue(num: number): number;

  NbUKnots(): number;

  SetVKnots(aVKnots: NCollection_HArray1_double): void;

  VKnots(): NCollection_HArray1_double;

  VKnotsValue(num: number): number;

  NbVKnots(): number;

  SetKnotSpec(aKnotSpec: StepGeom_KnotType): void;

  KnotSpec(): StepGeom_KnotType;

  SetWeightsData(aWeightsData: NCollection_HArray2_double): void;

  WeightsData(): NCollection_HArray2_double;

  WeightsDataValue(num1: number, num2: number): number;

  NbWeightsDataI(): number;

  NbWeightsDataJ(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_BezierCurve: declare class StepGeom_BezierCurve extends StepGeom_BSplineCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
