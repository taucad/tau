# libcascade — StepGeom (3)

37 top-level symbols. Signatures are verbatim typescript.

StepGeom_Polyline: declare class StepGeom_Polyline extends StepGeom_BoundedCurve

  // StepGeom_Polyline.constructor (constructor)
  constructor();

  // StepGeom_Polyline.Init (method)
  Init(aName: TCollection_HAsciiString, aPoints: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Polyline.SetPoints (method)
  SetPoints(aPoints: NCollection_HArray1_handle_StepGeom_CartesianPoint): void;

  // StepGeom_Polyline.Points (method)
  Points(): NCollection_HArray1_handle_StepGeom_CartesianPoint;

  // StepGeom_Polyline.PointsValue (method)
  PointsValue(num: number): StepGeom_CartesianPoint;

  // StepGeom_Polyline.NbPoints (method)
  NbPoints(): number;

  // StepGeom_Polyline.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Polyline.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Polyline.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Polyline.delete (method)
  delete(): void;

  // StepGeom_Polyline.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_PreferredSurfaceCurveRepresentation: typeof StepGeom_PreferredSurfaceCurveRepresentation[keyof typeof StepGeom_PreferredSurfaceCurveRepresentation]

  readonly StepGeom_pscrCurve3d: 'StepGeom_pscrCurve3d'

  readonly StepGeom_pscrPcurveS1: 'StepGeom_pscrPcurveS1'

  readonly StepGeom_pscrPcurveS2: 'StepGeom_pscrPcurveS2'

StepGeom_QuasiUniformCurve: declare class StepGeom_QuasiUniformCurve extends StepGeom_BSplineCurve

  // StepGeom_QuasiUniformCurve.constructor (constructor)
  constructor();

  // StepGeom_QuasiUniformCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_QuasiUniformCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_QuasiUniformCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_QuasiUniformCurve.delete (method)
  delete(): void;

  // StepGeom_QuasiUniformCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_QuasiUniformCurveAndRationalBSplineCurve: declare class StepGeom_QuasiUniformCurveAndRationalBSplineCurve extends StepGeom_BSplineCurve

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.constructor (constructor)
  constructor();

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformCurve: StepGeom_QuasiUniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.SetQuasiUniformCurve (method)
  SetQuasiUniformCurve(aQuasiUniformCurve: StepGeom_QuasiUniformCurve): void;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.QuasiUniformCurve (method)
  QuasiUniformCurve(): StepGeom_QuasiUniformCurve;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.SetRationalBSplineCurve (method)
  SetRationalBSplineCurve(aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.RationalBSplineCurve (method)
  RationalBSplineCurve(): StepGeom_RationalBSplineCurve;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.WeightsData (method)
  WeightsData(): NCollection_HArray1_double;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.WeightsDataValue (method)
  WeightsDataValue(num: number): number;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.NbWeightsData (method)
  NbWeightsData(): number;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.delete (method)
  delete(): void;

  // StepGeom_QuasiUniformCurveAndRationalBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_QuasiUniformSurface: declare class StepGeom_QuasiUniformSurface extends StepGeom_BSplineSurface

  // StepGeom_QuasiUniformSurface.constructor (constructor)
  constructor();

  // StepGeom_QuasiUniformSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_QuasiUniformSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_QuasiUniformSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_QuasiUniformSurface.delete (method)
  delete(): void;

  // StepGeom_QuasiUniformSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface: declare class StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface extends StepGeom_BSplineSurface

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.constructor (constructor)
  constructor();

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aQuasiUniformSurface: StepGeom_QuasiUniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.SetQuasiUniformSurface (method)
  SetQuasiUniformSurface(aQuasiUniformSurface: StepGeom_QuasiUniformSurface): void;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.QuasiUniformSurface (method)
  QuasiUniformSurface(): StepGeom_QuasiUniformSurface;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.SetRationalBSplineSurface (method)
  SetRationalBSplineSurface(aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.RationalBSplineSurface (method)
  RationalBSplineSurface(): StepGeom_RationalBSplineSurface;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray2_double): void;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.WeightsData (method)
  WeightsData(): NCollection_HArray2_double;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.WeightsDataValue (method)
  WeightsDataValue(num1: number, num2: number): number;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.NbWeightsDataI (method)
  NbWeightsDataI(): number;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.NbWeightsDataJ (method)
  NbWeightsDataJ(): number;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.delete (method)
  delete(): void;

  // StepGeom_QuasiUniformSurfaceAndRationalBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_RationalBSplineCurve: declare class StepGeom_RationalBSplineCurve extends StepGeom_BSplineCurve

  // StepGeom_RationalBSplineCurve.constructor (constructor)
  constructor();

  // StepGeom_RationalBSplineCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_RationalBSplineCurve.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  // StepGeom_RationalBSplineCurve.WeightsData (method)
  WeightsData(): NCollection_HArray1_double;

  // StepGeom_RationalBSplineCurve.WeightsDataValue (method)
  WeightsDataValue(num: number): number;

  // StepGeom_RationalBSplineCurve.NbWeightsData (method)
  NbWeightsData(): number;

  // StepGeom_RationalBSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_RationalBSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_RationalBSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_RationalBSplineCurve.delete (method)
  delete(): void;

  // StepGeom_RationalBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_RationalBSplineSurface: declare class StepGeom_RationalBSplineSurface extends StepGeom_BSplineSurface

  // StepGeom_RationalBSplineSurface.constructor (constructor)
  constructor();

  // StepGeom_RationalBSplineSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_RationalBSplineSurface.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray2_double): void;

  // StepGeom_RationalBSplineSurface.WeightsData (method)
  WeightsData(): NCollection_HArray2_double;

  // StepGeom_RationalBSplineSurface.WeightsDataValue (method)
  WeightsDataValue(num1: number, num2: number): number;

  // StepGeom_RationalBSplineSurface.NbWeightsDataI (method)
  NbWeightsDataI(): number;

  // StepGeom_RationalBSplineSurface.NbWeightsDataJ (method)
  NbWeightsDataJ(): number;

  // StepGeom_RationalBSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_RationalBSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_RationalBSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_RationalBSplineSurface.delete (method)
  delete(): void;

  // StepGeom_RationalBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_RectangularCompositeSurface: declare class StepGeom_RectangularCompositeSurface extends StepGeom_BoundedSurface

  // StepGeom_RectangularCompositeSurface.constructor (constructor)
  constructor();

  // StepGeom_RectangularCompositeSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aSegments: NCollection_HArray2_handle_StepGeom_SurfacePatch): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_RectangularCompositeSurface.SetSegments (method)
  SetSegments(aSegments: NCollection_HArray2_handle_StepGeom_SurfacePatch): void;

  // StepGeom_RectangularCompositeSurface.Segments (method)
  Segments(): NCollection_HArray2_handle_StepGeom_SurfacePatch;

  // StepGeom_RectangularCompositeSurface.SegmentsValue (method)
  SegmentsValue(num1: number, num2: number): StepGeom_SurfacePatch;

  // StepGeom_RectangularCompositeSurface.NbSegmentsI (method)
  NbSegmentsI(): number;

  // StepGeom_RectangularCompositeSurface.NbSegmentsJ (method)
  NbSegmentsJ(): number;

  // StepGeom_RectangularCompositeSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_RectangularCompositeSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_RectangularCompositeSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_RectangularCompositeSurface.delete (method)
  delete(): void;

  // StepGeom_RectangularCompositeSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_RectangularTrimmedSurface: declare class StepGeom_RectangularTrimmedSurface extends StepGeom_BoundedSurface

  // StepGeom_RectangularTrimmedSurface.constructor (constructor)
  constructor();

  // StepGeom_RectangularTrimmedSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aBasisSurface: StepGeom_Surface, aU1: number, aU2: number, aV1: number, aV2: number, aUsense: boolean, aVsense: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_RectangularTrimmedSurface.SetBasisSurface (method)
  SetBasisSurface(aBasisSurface: StepGeom_Surface): void;

  // StepGeom_RectangularTrimmedSurface.BasisSurface (method)
  BasisSurface(): StepGeom_Surface;

  // StepGeom_RectangularTrimmedSurface.SetU1 (method)
  SetU1(aU1: number): void;

  // StepGeom_RectangularTrimmedSurface.U1 (method)
  U1(): number;

  // StepGeom_RectangularTrimmedSurface.SetU2 (method)
  SetU2(aU2: number): void;

  // StepGeom_RectangularTrimmedSurface.U2 (method)
  U2(): number;

  // StepGeom_RectangularTrimmedSurface.SetV1 (method)
  SetV1(aV1: number): void;

  // StepGeom_RectangularTrimmedSurface.V1 (method)
  V1(): number;

  // StepGeom_RectangularTrimmedSurface.SetV2 (method)
  SetV2(aV2: number): void;

  // StepGeom_RectangularTrimmedSurface.V2 (method)
  V2(): number;

  // StepGeom_RectangularTrimmedSurface.SetUsense (method)
  SetUsense(aUsense: boolean): void;

  // StepGeom_RectangularTrimmedSurface.Usense (method)
  Usense(): boolean;

  // StepGeom_RectangularTrimmedSurface.SetVsense (method)
  SetVsense(aVsense: boolean): void;

  // StepGeom_RectangularTrimmedSurface.Vsense (method)
  Vsense(): boolean;

  // StepGeom_RectangularTrimmedSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_RectangularTrimmedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_RectangularTrimmedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_RectangularTrimmedSurface.delete (method)
  delete(): void;

  // StepGeom_RectangularTrimmedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_ReparametrisedCompositeCurveSegment: declare class StepGeom_ReparametrisedCompositeCurveSegment extends StepGeom_CompositeCurveSegment

  // StepGeom_ReparametrisedCompositeCurveSegment.constructor (constructor)
  constructor();

  // StepGeom_ReparametrisedCompositeCurveSegment.Init (method)
  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve, aParamLength: number): void;
  Init(aTransition: StepGeom_TransitionCode, aSameSense: boolean, aParentCurve: StepGeom_Curve): void;

  // StepGeom_ReparametrisedCompositeCurveSegment.SetParamLength (method)
  SetParamLength(aParamLength: number): void;

  // StepGeom_ReparametrisedCompositeCurveSegment.ParamLength (method)
  ParamLength(): number;

  // StepGeom_ReparametrisedCompositeCurveSegment.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_ReparametrisedCompositeCurveSegment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_ReparametrisedCompositeCurveSegment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_ReparametrisedCompositeCurveSegment.delete (method)
  delete(): void;

  // StepGeom_ReparametrisedCompositeCurveSegment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SeamCurve: declare class StepGeom_SeamCurve extends StepGeom_SurfaceCurve

  // StepGeom_SeamCurve.constructor (constructor)
  constructor();

  // StepGeom_SeamCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SeamCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SeamCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SeamCurve.delete (method)
  delete(): void;

  // StepGeom_SeamCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SphericalSurface: declare class StepGeom_SphericalSurface extends StepGeom_ElementarySurface

  // StepGeom_SphericalSurface.constructor (constructor)
  constructor();

  // StepGeom_SphericalSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_SphericalSurface.SetRadius (method)
  SetRadius(aRadius: number): void;

  // StepGeom_SphericalSurface.Radius (method)
  Radius(): number;

  // StepGeom_SphericalSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SphericalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SphericalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SphericalSurface.delete (method)
  delete(): void;

  // StepGeom_SphericalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SuParameters: declare class StepGeom_SuParameters extends StepGeom_GeometricRepresentationItem

  // StepGeom_SuParameters.constructor (constructor)
  constructor();

  // StepGeom_SuParameters.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theA: number, theAlpha: number, theB: number, theBeta: number, theC: number, theGamma: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_SuParameters.A (method)
  A(): number;

  // StepGeom_SuParameters.SetA (method)
  SetA(theA: number): void;

  // StepGeom_SuParameters.Alpha (method)
  Alpha(): number;

  // StepGeom_SuParameters.SetAlpha (method)
  SetAlpha(theAlpha: number): void;

  // StepGeom_SuParameters.B (method)
  B(): number;

  // StepGeom_SuParameters.SetB (method)
  SetB(theB: number): void;

  // StepGeom_SuParameters.Beta (method)
  Beta(): number;

  // StepGeom_SuParameters.SetBeta (method)
  SetBeta(theBeta: number): void;

  // StepGeom_SuParameters.C (method)
  C(): number;

  // StepGeom_SuParameters.SetC (method)
  SetC(theC: number): void;

  // StepGeom_SuParameters.Gamma (method)
  Gamma(): number;

  // StepGeom_SuParameters.SetGamma (method)
  SetGamma(theGamma: number): void;

  // StepGeom_SuParameters.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SuParameters.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SuParameters.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SuParameters.delete (method)
  delete(): void;

  // StepGeom_SuParameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Surface: declare class StepGeom_Surface extends StepGeom_GeometricRepresentationItem

  // StepGeom_Surface.constructor (constructor)
  constructor();

  // StepGeom_Surface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Surface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Surface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Surface.delete (method)
  delete(): void;

  // StepGeom_Surface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SurfaceBoundary: declare class StepGeom_SurfaceBoundary extends StepData_SelectType

  // StepGeom_SurfaceBoundary.constructor (constructor)
  constructor();

  // StepGeom_SurfaceBoundary.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepGeom_SurfaceBoundary.BoundaryCurve (method)
  BoundaryCurve(): StepGeom_BoundaryCurve;

  // StepGeom_SurfaceBoundary.DegeneratePcurve (method)
  DegeneratePcurve(): StepGeom_DegeneratePcurve;

  // StepGeom_SurfaceBoundary.delete (method)
  delete(): void;

  // StepGeom_SurfaceBoundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SurfaceCurve: declare class StepGeom_SurfaceCurve extends StepGeom_Curve

  // StepGeom_SurfaceCurve.constructor (constructor)
  constructor();

  // StepGeom_SurfaceCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aCurve3d: StepGeom_Curve, aAssociatedGeometry: NCollection_HArray1_StepGeom_PcurveOrSurface, aMasterRepresentation: StepGeom_PreferredSurfaceCurveRepresentation): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_SurfaceCurve.SetCurve3d (method)
  SetCurve3d(aCurve3d: StepGeom_Curve): void;

  // StepGeom_SurfaceCurve.Curve3d (method)
  Curve3d(): StepGeom_Curve;

  // StepGeom_SurfaceCurve.SetAssociatedGeometry (method)
  SetAssociatedGeometry(aAssociatedGeometry: NCollection_HArray1_StepGeom_PcurveOrSurface): void;

  // StepGeom_SurfaceCurve.AssociatedGeometry (method)
  AssociatedGeometry(): NCollection_HArray1_StepGeom_PcurveOrSurface;

  // StepGeom_SurfaceCurve.AssociatedGeometryValue (method)
  AssociatedGeometryValue(num: number): StepGeom_PcurveOrSurface;

  // StepGeom_SurfaceCurve.NbAssociatedGeometry (method)
  NbAssociatedGeometry(): number;

  // StepGeom_SurfaceCurve.SetMasterRepresentation (method)
  SetMasterRepresentation(aMasterRepresentation: StepGeom_PreferredSurfaceCurveRepresentation): void;

  // StepGeom_SurfaceCurve.MasterRepresentation (method)
  MasterRepresentation(): StepGeom_PreferredSurfaceCurveRepresentation;

  // StepGeom_SurfaceCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SurfaceCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SurfaceCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SurfaceCurve.delete (method)
  delete(): void;

  // StepGeom_SurfaceCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SurfaceCurveAndBoundedCurve: declare class StepGeom_SurfaceCurveAndBoundedCurve extends StepGeom_SurfaceCurve

  // StepGeom_SurfaceCurveAndBoundedCurve.constructor (constructor)
  constructor();

  // StepGeom_SurfaceCurveAndBoundedCurve.BoundedCurve (method)
  BoundedCurve(): StepGeom_BoundedCurve;

  // StepGeom_SurfaceCurveAndBoundedCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SurfaceCurveAndBoundedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SurfaceCurveAndBoundedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SurfaceCurveAndBoundedCurve.delete (method)
  delete(): void;

  // StepGeom_SurfaceCurveAndBoundedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SurfaceOfLinearExtrusion: declare class StepGeom_SurfaceOfLinearExtrusion extends StepGeom_SweptSurface

  // StepGeom_SurfaceOfLinearExtrusion.constructor (constructor)
  constructor();

  // StepGeom_SurfaceOfLinearExtrusion.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aExtrusionAxis: StepGeom_Vector): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_SurfaceOfLinearExtrusion.SetExtrusionAxis (method)
  SetExtrusionAxis(aExtrusionAxis: StepGeom_Vector): void;

  // StepGeom_SurfaceOfLinearExtrusion.ExtrusionAxis (method)
  ExtrusionAxis(): StepGeom_Vector;

  // StepGeom_SurfaceOfLinearExtrusion.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SurfaceOfLinearExtrusion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SurfaceOfLinearExtrusion.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SurfaceOfLinearExtrusion.delete (method)
  delete(): void;

  // StepGeom_SurfaceOfLinearExtrusion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SurfaceOfRevolution: declare class StepGeom_SurfaceOfRevolution extends StepGeom_SweptSurface

  // StepGeom_SurfaceOfRevolution.constructor (constructor)
  constructor();

  // StepGeom_SurfaceOfRevolution.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve, aAxisPosition: StepGeom_Axis1Placement): void;
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_SurfaceOfRevolution.SetAxisPosition (method)
  SetAxisPosition(aAxisPosition: StepGeom_Axis1Placement): void;

  // StepGeom_SurfaceOfRevolution.AxisPosition (method)
  AxisPosition(): StepGeom_Axis1Placement;

  // StepGeom_SurfaceOfRevolution.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SurfaceOfRevolution.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SurfaceOfRevolution.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SurfaceOfRevolution.delete (method)
  delete(): void;

  // StepGeom_SurfaceOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SurfacePatch: declare class StepGeom_SurfacePatch extends Standard_Transient

  // StepGeom_SurfacePatch.constructor (constructor)
  constructor();

  // StepGeom_SurfacePatch.Init (method)
  Init(aParentSurface: StepGeom_BoundedSurface, aUTransition: StepGeom_TransitionCode, aVTransition: StepGeom_TransitionCode, aUSense: boolean, aVSense: boolean): void;

  // StepGeom_SurfacePatch.SetParentSurface (method)
  SetParentSurface(aParentSurface: StepGeom_BoundedSurface): void;

  // StepGeom_SurfacePatch.ParentSurface (method)
  ParentSurface(): StepGeom_BoundedSurface;

  // StepGeom_SurfacePatch.SetUTransition (method)
  SetUTransition(aUTransition: StepGeom_TransitionCode): void;

  // StepGeom_SurfacePatch.UTransition (method)
  UTransition(): StepGeom_TransitionCode;

  // StepGeom_SurfacePatch.SetVTransition (method)
  SetVTransition(aVTransition: StepGeom_TransitionCode): void;

  // StepGeom_SurfacePatch.VTransition (method)
  VTransition(): StepGeom_TransitionCode;

  // StepGeom_SurfacePatch.SetUSense (method)
  SetUSense(aUSense: boolean): void;

  // StepGeom_SurfacePatch.USense (method)
  USense(): boolean;

  // StepGeom_SurfacePatch.SetVSense (method)
  SetVSense(aVSense: boolean): void;

  // StepGeom_SurfacePatch.VSense (method)
  VSense(): boolean;

  // StepGeom_SurfacePatch.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SurfacePatch.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SurfacePatch.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SurfacePatch.delete (method)
  delete(): void;

  // StepGeom_SurfacePatch.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SurfaceReplica: declare class StepGeom_SurfaceReplica extends StepGeom_Surface

  // StepGeom_SurfaceReplica.constructor (constructor)
  constructor();

  // StepGeom_SurfaceReplica.Init (method)
  Init(aName: TCollection_HAsciiString, aParentSurface: StepGeom_Surface, aTransformation: StepGeom_CartesianTransformationOperator3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_SurfaceReplica.SetParentSurface (method)
  SetParentSurface(aParentSurface: StepGeom_Surface): void;

  // StepGeom_SurfaceReplica.ParentSurface (method)
  ParentSurface(): StepGeom_Surface;

  // StepGeom_SurfaceReplica.SetTransformation (method)
  SetTransformation(aTransformation: StepGeom_CartesianTransformationOperator3d): void;

  // StepGeom_SurfaceReplica.Transformation (method)
  Transformation(): StepGeom_CartesianTransformationOperator3d;

  // StepGeom_SurfaceReplica.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SurfaceReplica.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SurfaceReplica.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SurfaceReplica.delete (method)
  delete(): void;

  // StepGeom_SurfaceReplica.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_SweptSurface: declare class StepGeom_SweptSurface extends StepGeom_Surface

  // StepGeom_SweptSurface.constructor (constructor)
  constructor();

  // StepGeom_SweptSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aSweptCurve: StepGeom_Curve): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_SweptSurface.SetSweptCurve (method)
  SetSweptCurve(aSweptCurve: StepGeom_Curve): void;

  // StepGeom_SweptSurface.SweptCurve (method)
  SweptCurve(): StepGeom_Curve;

  // StepGeom_SweptSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_SweptSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_SweptSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_SweptSurface.delete (method)
  delete(): void;

  // StepGeom_SweptSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_ToroidalSurface: declare class StepGeom_ToroidalSurface extends StepGeom_ElementarySurface

  // StepGeom_ToroidalSurface.constructor (constructor)
  constructor();

  // StepGeom_ToroidalSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d, aMajorRadius: number, aMinorRadius: number): void;
  Init(aName: TCollection_HAsciiString, aPosition: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_ToroidalSurface.SetMajorRadius (method)
  SetMajorRadius(aMajorRadius: number): void;

  // StepGeom_ToroidalSurface.MajorRadius (method)
  MajorRadius(): number;

  // StepGeom_ToroidalSurface.SetMinorRadius (method)
  SetMinorRadius(aMinorRadius: number): void;

  // StepGeom_ToroidalSurface.MinorRadius (method)
  MinorRadius(): number;

  // StepGeom_ToroidalSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_ToroidalSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_ToroidalSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_ToroidalSurface.delete (method)
  delete(): void;

  // StepGeom_ToroidalSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_TransitionCode: typeof StepGeom_TransitionCode[keyof typeof StepGeom_TransitionCode]

  readonly StepGeom_tcDiscontinuous: 'StepGeom_tcDiscontinuous'

  readonly StepGeom_tcContinuous: 'StepGeom_tcContinuous'

  readonly StepGeom_tcContSameGradient: 'StepGeom_tcContSameGradient'

  readonly StepGeom_tcContSameGradientSameCurvature: 'StepGeom_tcContSameGradientSameCurvature'

StepGeom_TrimmedCurve: declare class StepGeom_TrimmedCurve extends StepGeom_BoundedCurve

  // StepGeom_TrimmedCurve.constructor (constructor)
  constructor();

  // StepGeom_TrimmedCurve.SetBasisCurve (method)
  SetBasisCurve(aBasisCurve: StepGeom_Curve): void;

  // StepGeom_TrimmedCurve.BasisCurve (method)
  BasisCurve(): StepGeom_Curve;

  // StepGeom_TrimmedCurve.SetTrim1 (method)
  SetTrim1(aTrim1: NCollection_HArray1_StepGeom_TrimmingSelect): void;

  // StepGeom_TrimmedCurve.Trim1 (method)
  Trim1(): NCollection_HArray1_StepGeom_TrimmingSelect;

  // StepGeom_TrimmedCurve.Trim1Value (method)
  Trim1Value(num: number): StepGeom_TrimmingSelect;

  // StepGeom_TrimmedCurve.NbTrim1 (method)
  NbTrim1(): number;

  // StepGeom_TrimmedCurve.SetTrim2 (method)
  SetTrim2(aTrim2: NCollection_HArray1_StepGeom_TrimmingSelect): void;

  // StepGeom_TrimmedCurve.Trim2 (method)
  Trim2(): NCollection_HArray1_StepGeom_TrimmingSelect;

  // StepGeom_TrimmedCurve.Trim2Value (method)
  Trim2Value(num: number): StepGeom_TrimmingSelect;

  // StepGeom_TrimmedCurve.NbTrim2 (method)
  NbTrim2(): number;

  // StepGeom_TrimmedCurve.SetSenseAgreement (method)
  SetSenseAgreement(aSenseAgreement: boolean): void;

  // StepGeom_TrimmedCurve.SenseAgreement (method)
  SenseAgreement(): boolean;

  // StepGeom_TrimmedCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_TrimmedCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_TrimmedCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_TrimmedCurve.delete (method)
  delete(): void;

  // StepGeom_TrimmedCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_TrimmingMember: declare class StepGeom_TrimmingMember extends StepData_SelectReal

  // StepGeom_TrimmingMember.constructor (constructor)
  constructor();

  // StepGeom_TrimmingMember.HasName (method)
  HasName(): boolean;

  // StepGeom_TrimmingMember.Name (method)
  Name(): string;

  // StepGeom_TrimmingMember.SetName (method)
  SetName(name: string): boolean;

  // StepGeom_TrimmingMember.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_TrimmingMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_TrimmingMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_TrimmingMember.delete (method)
  delete(): void;

  // StepGeom_TrimmingMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_TrimmingPreference: typeof StepGeom_TrimmingPreference[keyof typeof StepGeom_TrimmingPreference]

  readonly StepGeom_tpCartesian: 'StepGeom_tpCartesian'

  readonly StepGeom_tpParameter: 'StepGeom_tpParameter'

  readonly StepGeom_tpUnspecified: 'StepGeom_tpUnspecified'

StepGeom_TrimmingSelect: declare class StepGeom_TrimmingSelect extends StepData_SelectType

  // StepGeom_TrimmingSelect.constructor (constructor)
  constructor();

  // StepGeom_TrimmingSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepGeom_TrimmingSelect.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepGeom_TrimmingSelect.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepGeom_TrimmingSelect.CartesianPoint (method)
  CartesianPoint(): StepGeom_CartesianPoint;

  // StepGeom_TrimmingSelect.SetParameterValue (method)
  SetParameterValue(aParameterValue: number): void;

  // StepGeom_TrimmingSelect.ParameterValue (method)
  ParameterValue(): number;

  // StepGeom_TrimmingSelect.delete (method)
  delete(): void;

  // StepGeom_TrimmingSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_UniformCurve: declare class StepGeom_UniformCurve extends StepGeom_BSplineCurve

  // StepGeom_UniformCurve.constructor (constructor)
  constructor();

  // StepGeom_UniformCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_UniformCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_UniformCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_UniformCurve.delete (method)
  delete(): void;

  // StepGeom_UniformCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_UniformCurveAndRationalBSplineCurve: declare class StepGeom_UniformCurveAndRationalBSplineCurve extends StepGeom_BSplineCurve

  // StepGeom_UniformCurveAndRationalBSplineCurve.constructor (constructor)
  constructor();

  // StepGeom_UniformCurveAndRationalBSplineCurve.Init (method)
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformCurve: StepGeom_UniformCurve, aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aDegree: number, aControlPointsList: NCollection_HArray1_handle_StepGeom_CartesianPoint, aCurveForm: StepGeom_BSplineCurveForm, aClosedCurve: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_UniformCurveAndRationalBSplineCurve.SetUniformCurve (method)
  SetUniformCurve(aUniformCurve: StepGeom_UniformCurve): void;

  // StepGeom_UniformCurveAndRationalBSplineCurve.UniformCurve (method)
  UniformCurve(): StepGeom_UniformCurve;

  // StepGeom_UniformCurveAndRationalBSplineCurve.SetRationalBSplineCurve (method)
  SetRationalBSplineCurve(aRationalBSplineCurve: StepGeom_RationalBSplineCurve): void;

  // StepGeom_UniformCurveAndRationalBSplineCurve.RationalBSplineCurve (method)
  RationalBSplineCurve(): StepGeom_RationalBSplineCurve;

  // StepGeom_UniformCurveAndRationalBSplineCurve.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray1_double): void;

  // StepGeom_UniformCurveAndRationalBSplineCurve.WeightsData (method)
  WeightsData(): NCollection_HArray1_double;

  // StepGeom_UniformCurveAndRationalBSplineCurve.WeightsDataValue (method)
  WeightsDataValue(num: number): number;

  // StepGeom_UniformCurveAndRationalBSplineCurve.NbWeightsData (method)
  NbWeightsData(): number;

  // StepGeom_UniformCurveAndRationalBSplineCurve.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_UniformCurveAndRationalBSplineCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_UniformCurveAndRationalBSplineCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_UniformCurveAndRationalBSplineCurve.delete (method)
  delete(): void;

  // StepGeom_UniformCurveAndRationalBSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_UniformSurface: declare class StepGeom_UniformSurface extends StepGeom_BSplineSurface

  // StepGeom_UniformSurface.constructor (constructor)
  constructor();

  // StepGeom_UniformSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_UniformSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_UniformSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_UniformSurface.delete (method)
  delete(): void;

  // StepGeom_UniformSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_UniformSurfaceAndRationalBSplineSurface: declare class StepGeom_UniformSurfaceAndRationalBSplineSurface extends StepGeom_BSplineSurface

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.constructor (constructor)
  constructor();

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.Init (method)
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aUniformSurface: StepGeom_UniformSurface, aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical, aWeightsData: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString, aUDegree: number, aVDegree: number, aControlPointsList: NCollection_HArray2_handle_StepGeom_CartesianPoint, aSurfaceForm: StepGeom_BSplineSurfaceForm, aUClosed: StepData_Logical, aVClosed: StepData_Logical, aSelfIntersect: StepData_Logical): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.SetUniformSurface (method)
  SetUniformSurface(aUniformSurface: StepGeom_UniformSurface): void;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.UniformSurface (method)
  UniformSurface(): StepGeom_UniformSurface;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.SetRationalBSplineSurface (method)
  SetRationalBSplineSurface(aRationalBSplineSurface: StepGeom_RationalBSplineSurface): void;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.RationalBSplineSurface (method)
  RationalBSplineSurface(): StepGeom_RationalBSplineSurface;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.SetWeightsData (method)
  SetWeightsData(aWeightsData: NCollection_HArray2_double): void;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.WeightsData (method)
  WeightsData(): NCollection_HArray2_double;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.WeightsDataValue (method)
  WeightsDataValue(num1: number, num2: number): number;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.NbWeightsDataI (method)
  NbWeightsDataI(): number;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.NbWeightsDataJ (method)
  NbWeightsDataJ(): number;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.delete (method)
  delete(): void;

  // StepGeom_UniformSurfaceAndRationalBSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Vector: declare class StepGeom_Vector extends StepGeom_GeometricRepresentationItem

  // StepGeom_Vector.constructor (constructor)
  constructor();

  // StepGeom_Vector.Init (method)
  Init(aName: TCollection_HAsciiString, aOrientation: StepGeom_Direction, aMagnitude: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepGeom_Vector.SetOrientation (method)
  SetOrientation(aOrientation: StepGeom_Direction): void;

  // StepGeom_Vector.Orientation (method)
  Orientation(): StepGeom_Direction;

  // StepGeom_Vector.SetMagnitude (method)
  SetMagnitude(aMagnitude: number): void;

  // StepGeom_Vector.Magnitude (method)
  Magnitude(): number;

  // StepGeom_Vector.get_type_name (method)
  static get_type_name(): string;

  // StepGeom_Vector.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepGeom_Vector.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepGeom_Vector.delete (method)
  delete(): void;

  // StepGeom_Vector.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_VectorOrDirection: declare class StepGeom_VectorOrDirection extends StepData_SelectType

  // StepGeom_VectorOrDirection.constructor (constructor)
  constructor();

  // StepGeom_VectorOrDirection.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepGeom_VectorOrDirection.Vector (method)
  Vector(): StepGeom_Vector;

  // StepGeom_VectorOrDirection.Direction (method)
  Direction(): StepGeom_Direction;

  // StepGeom_VectorOrDirection.delete (method)
  delete(): void;

  // StepGeom_VectorOrDirection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepGeom_Array1OfCartesianPoint: NCollection_Array1_handle_StepGeom_CartesianPoint

StepGeom_Array1OfCompositeCurveSegment: NCollection_Array1_handle_StepGeom_CompositeCurveSegment
