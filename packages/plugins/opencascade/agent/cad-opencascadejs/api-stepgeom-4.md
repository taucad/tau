# libcascade — StepGeom (4)

21 top-level symbols. Signatures are verbatim typescript.

StepGeom_QuasiUniformCurve: declare class StepGeom_QuasiUniformCurve extends StepGeom_BSplineCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_QuasiUniformCurveAndRationalBSplineCurve: declare class StepGeom_QuasiUniformCurveAndRationalBSplineCurve extends StepGeom_BSplineCurve

  constructor

  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformCurve: StepGeom_QuasiUniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformCurve: StepGeom_QuasiUniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformCurve: StepGeom_QuasiUniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformCurve: StepGeom_QuasiUniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetQuasiUniformCurve(aQuasiUniformCurve: StepGeom_QuasiUniformCurve): void;

  QuasiUniformCurve(): StepGeom_QuasiUniformCurve;

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

StepGeom_QuasiUniformSurface: declare class StepGeom_QuasiUniformSurface extends StepGeom_BSplineSurface

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface: declare class StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface extends StepGeom_BSplineSurface

  constructor

  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformSurface: StepGeom_QuasiUniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformSurface: StepGeom_QuasiUniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformSurface: StepGeom_QuasiUniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformSurface: StepGeom_QuasiUniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetQuasiUniformSurface(aQuasiUniformSurface: StepGeom_QuasiUniformSurface): void;

  QuasiUniformSurface(): StepGeom_QuasiUniformSurface;

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

StepGeom_RationalBSplineCurve: declare class StepGeom_RationalBSplineCurve extends StepGeom_BSplineCurve

  constructor

  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  WeightsData(): NCollection_HArray1_double;

  WeightsDataValue(num: number): number;

  NbWeightsData(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_RationalBSplineSurface: declare class StepGeom_RationalBSplineSurface extends StepGeom_BSplineSurface

  constructor

  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

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

StepGeom_RectangularCompositeSurface: declare class StepGeom_RectangularCompositeSurface extends StepGeom_BoundedSurface

  constructor

  Init(aName: TCollection_HAsciiString, aSegments: NCollection_HArray2_handle_StepGeom_SurfacePatch): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSegments: NCollection_HArray2_handle_StepGeom_SurfacePatch): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSegments(aSegments: NCollection_HArray2_handle_StepGeom_SurfacePatch): void;

  Segments(): NCollection_HArray2_handle_StepGeom_SurfacePatch;

  SegmentsValue(num1: number, num2: number): StepGeom_SurfacePatch;

  NbSegmentsI(): number;

  NbSegmentsJ(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_RectangularTrimmedSurface: declare class StepGeom_RectangularTrimmedSurface extends StepGeom_BoundedSurface

  constructor

  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aU1: number, aU2: number, aV1: number, aV2: number, aUsense: boolean, aVsense: boolean): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aU1: number, aU2: number, aV1: number, aV2: number, aUsense: boolean, aVsense: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  BasisSurface(): StepGeom_Surface;

  SetU1(aU1: number): void;

  U1(): number;

  SetU2(aU2: number): void;

  U2(): number;

  SetV1(aV1: number): void;

  V1(): number;

  SetV2(aV2: number): void;

  V2(): number;

  SetUsense(aUsense: boolean): void;

  Usense(): boolean;

  SetVsense(aVsense: boolean): void;

  Vsense(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_ReparametrisedCompositeCurveSegment: declare class StepGeom_ReparametrisedCompositeCurveSegment extends StepGeom_CompositeCurveSegment

  constructor

  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve, aParamLength: number): void;
  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve): void;
  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve, aParamLength: number): void;
  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve): void;

  SetParamLength(aParamLength: number): void;

  ParamLength(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SeamCurve: declare class StepGeom_SeamCurve extends StepGeom_SurfaceCurve

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SphericalSurface: declare class StepGeom_SphericalSurface extends StepGeom_ElementarySurface

  constructor

  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetRadius(aRadius: number): void;

  Radius(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SuParameters: declare class StepGeom_SuParameters extends StepGeom_GeometricRepresentationItem

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theA: number, theAlpha: number, theB: number, theBeta: number, theC: number, theGamma: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theA: number, theAlpha: number, theB: number, theBeta: number, theC: number, theGamma: number): void;
  Init(aName: TCollection_HAsciiString): void;

  A(): number;

  SetA(theA: number): void;

  Alpha(): number;

  SetAlpha(theAlpha: number): void;

  B(): number;

  SetB(theB: number): void;

  Beta(): number;

  SetBeta(theBeta: number): void;

  C(): number;

  SetC(theC: number): void;

  Gamma(): number;

  SetGamma(theGamma: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_Surface: declare class StepGeom_Surface extends StepGeom_GeometricRepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SurfaceBoundary: declare class StepGeom_SurfaceBoundary extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  BoundaryCurve(): StepGeom_BoundaryCurve;

  DegeneratePcurve(): StepGeom_DegeneratePcurve;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SurfaceCurve: declare class StepGeom_SurfaceCurve extends StepGeom_Curve

  constructor

  Init(aName: TCollection_HAsciiString, aCurve3d: StepGeom_Curve, aAssociatedGeometry: NCollection_HArray1_StepGeom_PcurveOrSurface, aMasterRepresentation: StepGeom_PreferredSurfaceCurveRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aCurve3d: StepGeom_Curve, aAssociatedGeometry: NCollection_HArray1_StepGeom_PcurveOrSurface, aMasterRepresentation: StepGeom_PreferredSurfaceCurveRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  SetCurve3d(aCurve3d: StepGeom_Curve): void;

  Curve3d(): StepGeom_Curve;

  SetAssociatedGeometry(aAssociatedGeometry: NCollection_HArray1_StepGeom_PcurveOrSurface): void;

  AssociatedGeometry(): NCollection_HArray1_StepGeom_PcurveOrSurface;

  AssociatedGeometryValue(num: number): StepGeom_PcurveOrSurface;

  NbAssociatedGeometry(): number;

  SetMasterRepresentation(aMasterRepresentation: StepGeom_PreferredSurfaceCurveRepresentation): void;

  MasterRepresentation(): StepGeom_PreferredSurfaceCurveRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SurfaceCurveAndBoundedCurve: declare class StepGeom_SurfaceCurveAndBoundedCurve extends StepGeom_SurfaceCurve

  constructor

  BoundedCurve(): StepGeom_BoundedCurve;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SurfaceOfLinearExtrusion: declare class StepGeom_SurfaceOfLinearExtrusion extends StepGeom_SweptSurface

  constructor

  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aExtrusionAxis: StepGeom_Vector): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aExtrusionAxis: StepGeom_Vector): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aExtrusionAxis: StepGeom_Vector): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;

  SetExtrusionAxis(aExtrusionAxis: StepGeom_Vector): void;

  ExtrusionAxis(): StepGeom_Vector;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SurfaceOfRevolution: declare class StepGeom_SurfaceOfRevolution extends StepGeom_SweptSurface

  constructor

  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aAxisPosition: StepGeom_Axis1Placement): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aAxisPosition: StepGeom_Axis1Placement): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aAxisPosition: StepGeom_Axis1Placement): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;

  SetAxisPosition(aAxisPosition: StepGeom_Axis1Placement): void;

  AxisPosition(): StepGeom_Axis1Placement;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SurfacePatch: declare class StepGeom_SurfacePatch extends Standard_Transient

  constructor

  Init(aParentSurface: StepGeom_BoundedSurface, aUTransition: StepGeom_TransitionCode, aVTransition: StepGeom_TransitionCode, aUSense: boolean, aVSense: boolean): void;

  SetParentSurface(aParentSurface: StepGeom_BoundedSurface): void;

  ParentSurface(): StepGeom_BoundedSurface;

  SetUTransition(aUTransition: StepGeom_TransitionCode): void;

  UTransition(): StepGeom_TransitionCode;

  SetVTransition(aVTransition: StepGeom_TransitionCode): void;

  VTransition(): StepGeom_TransitionCode;

  SetUSense(aUSense: boolean): void;

  USense(): boolean;

  SetVSense(aVSense: boolean): void;

  VSense(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SurfaceReplica: declare class StepGeom_SurfaceReplica extends StepGeom_Surface

  constructor

  Init(aName: TCollection_HAsciiString, aParentSurface: StepGeom_Surface, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aParentSurface: StepGeom_Surface, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
  Init(aName: TCollection_HAsciiString): void;

  SetParentSurface(aParentSurface: StepGeom_Surface): void;

  ParentSurface(): StepGeom_Surface;

  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator3d): void;

  Transformation(): StepGeom_CartesianTransformationOperator3d;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepGeom_SweptSurface: declare class StepGeom_SweptSurface extends StepGeom_Surface

  constructor

  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSweptCurve(aSweptCurve: StepGeom_Curve): void;

  SweptCurve(): StepGeom_Curve;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
