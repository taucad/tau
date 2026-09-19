# libcascade — StepGeom (5)

26 top-level symbols. Signatures are verbatim typescript.

StepGeom_ToroidalSurface: declare class StepGeom_ToroidalSurface extends StepGeom_ElementarySurface

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetMajorRadius(aMajorRadius: number): void;

  MajorRadius(): number;

  SetMinorRadius(aMinorRadius: number): void;

  MinorRadius(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_TransitionCode: typeof StepGeom_TransitionCode[keyof typeof StepGeom_TransitionCode]

StepGeom_TrimmedCurve: declare class StepGeom_TrimmedCurve extends StepGeom_BoundedCurve

  constructor

  SetBasisCurve(aBasisCurve: StepGeom_Curve): void;

  BasisCurve(): StepGeom_Curve;

  SetTrim1(aTrim1: NCollection_HArray1_StepGeom_TrimmingSelect): void;

  Trim1(): NCollection_HArray1_StepGeom_TrimmingSelect;

  Trim1Value(num: number): StepGeom_TrimmingSelect;

  NbTrim1(): number;

  SetTrim2(aTrim2: NCollection_HArray1_StepGeom_TrimmingSelect): void;

  Trim2(): NCollection_HArray1_StepGeom_TrimmingSelect;

  Trim2Value(num: number): StepGeom_TrimmingSelect;

  NbTrim2(): number;

  SetSenseAgreement(aSenseAgreement: boolean): void;

  SenseAgreement(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_TrimmingMember: declare class StepGeom_TrimmingMember extends StepData_SelectReal

  constructor

  HasName(): boolean;

  Name(): string;

  SetName(name: string): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_TrimmingPreference: typeof StepGeom_TrimmingPreference[keyof typeof StepGeom_TrimmingPreference]

StepGeom_TrimmingSelect: declare class StepGeom_TrimmingSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  NewMember(): StepData_SelectMember;

  CaseMem(ent: StepData_SelectMember): number;

  CartesianPoint(): StepGeom_CartesianPoint;

  SetParameterValue(aParameterValue: number): void;

  ParameterValue(): number;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_UniformCurve: declare class StepGeom_UniformCurve extends StepGeom_BSplineCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_UniformCurveAndRationalBSplineCurve: declare class StepGeom_UniformCurveAndRationalBSplineCurve extends StepGeom_BSplineCurve

  constructor

  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformCurve: StepGeom_UniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformCurve: StepGeom_UniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformCurve: StepGeom_UniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformCurve: StepGeom_UniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetUniformCurve(aUniformCurve: StepGeom_UniformCurve): void;

  UniformCurve(): StepGeom_UniformCurve;

  SetRationalBSplineCurve(aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;

  RationalBSplineCurve(): StepGeom_RationalBSplineCurve;

  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  WeightsData(): NCollection_HArray1_double;

  WeightsDataValue(num: number): number;

  NbWeightsData(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_UniformSurface: declare class StepGeom_UniformSurface extends StepGeom_BSplineSurface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_UniformSurfaceAndRationalBSplineSurface: declare class StepGeom_UniformSurfaceAndRationalBSplineSurface extends StepGeom_BSplineSurface

  constructor

  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformSurface: StepGeom_UniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformSurface: StepGeom_UniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformSurface: StepGeom_UniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformSurface: StepGeom_UniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetUniformSurface(aUniformSurface: StepGeom_UniformSurface): void;

  UniformSurface(): StepGeom_UniformSurface;

  SetRationalBSplineSurface(aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;

  RationalBSplineSurface(): StepGeom_RationalBSplineSurface;

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

StepGeom_Vector: declare class StepGeom_Vector extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aOrientation: StepGeom_Direction, aMagnitude: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aOrientation: StepGeom_Direction, aMagnitude: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetOrientation(aOrientation: StepGeom_Direction): void;

  Orientation(): StepGeom_Direction;

  SetMagnitude(aMagnitude: number): void;

  Magnitude(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_VectorOrDirection: declare class StepGeom_VectorOrDirection extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Vector(): StepGeom_Vector;

  Direction(): StepGeom_Direction;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Array1OfCartesianPoint: NCollection_Array1_handle_StepGeom_CartesianPoint

StepGeom_Array1OfCompositeCurveSegment: NCollection_Array1_handle_StepGeom_CompositeCurveSegment

StepGeom_Array1OfPcurveOrSurface: NCollection_Array1_StepGeom_PcurveOrSurface

StepGeom_Array1OfSurfaceBoundary: NCollection_Array1_StepGeom_SurfaceBoundary

StepGeom_Array1OfTrimmingSelect: NCollection_Array1_StepGeom_TrimmingSelect

StepGeom_Array2OfCartesianPoint: NCollection_Array2_handle_StepGeom_CartesianPoint

StepGeom_Array2OfSurfacePatch: NCollection_Array2_handle_StepGeom_SurfacePatch

StepGeom_HArray1OfCartesianPoint: NCollection_HArray1_handle_StepGeom_CartesianPoint

StepGeom_HArray1OfCompositeCurveSegment: NCollection_HArray1_handle_StepGeom_CompositeCurveSegment

StepGeom_HArray1OfPcurveOrSurface: NCollection_HArray1_StepGeom_PcurveOrSurface

StepGeom_HArray1OfSurfaceBoundary: NCollection_HArray1_StepGeom_SurfaceBoundary

StepGeom_HArray1OfTrimmingSelect: NCollection_HArray1_StepGeom_TrimmingSelect

StepGeom_HArray2OfCartesianPoint: NCollection_HArray2_handle_StepGeom_CartesianPoint

StepGeom_HArray2OfSurfacePatch: NCollection_HArray2_handle_StepGeom_SurfacePatch
