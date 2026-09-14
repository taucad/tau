# libcascade — IGESGeom

32 top-level symbols. Signatures are verbatim typescript.

IGESGeom: declare class IGESGeom

  constructor

  static Init(): void;

  static Protocol(): IGESGeom_Protocol;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_BSplineCurve: declare class IGESGeom_BSplineCurve extends IGESData_IGESEntity

  constructor

  Init(anIndex: number, aDegree: number, aPlanar: boolean, aClosed: boolean, aPolynom: boolean, aPeriodic: boolean, allKnots: NCollection_HArray1_double, allWeights: NCollection_HArray1_double, allPoles: NCollection_HArray1_gp_XYZ, aUmin: number, aUmax: number, aNorm: gp_XYZ): void;

  SetFormNumber(form: number): void;

  UpperIndex(): number;

  Degree(): number;

  IsPlanar(): boolean;

  IsClosed(): boolean;

  IsPolynomial(flag?: boolean): boolean;

  IsPeriodic(): boolean;

  NbKnots(): number;

  Knot(anIndex: number): number;

  NbPoles(): number;

  Weight(anIndex: number): number;

  Pole(anIndex: number): gp_Pnt;

  TransformedPole(anIndex: number): gp_Pnt;

  UMin(): number;

  UMax(): number;

  Normal(): gp_XYZ;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_BSplineSurface: declare class IGESGeom_BSplineSurface extends IGESData_IGESEntity

  constructor

  Init(anIndexU: number, anIndexV: number, aDegU: number, aDegV: number, aCloseU: boolean, aCloseV: boolean, aPolynom: boolean, aPeriodU: boolean, aPeriodV: boolean, allKnotsU: NCollection_HArray1_double, allKnotsV: NCollection_HArray1_double, allWeights: NCollection_HArray2_double, allPoles: NCollection_HArray2_gp_XYZ, aUmin: number, aUmax: number, aVmin: number, aVmax: number): void;

  SetFormNumber(form: number): void;

  UpperIndexU(): number;

  UpperIndexV(): number;

  DegreeU(): number;

  DegreeV(): number;

  IsClosedU(): boolean;

  IsClosedV(): boolean;

  IsPolynomial(flag?: boolean): boolean;

  IsPeriodicU(): boolean;

  IsPeriodicV(): boolean;

  NbKnotsU(): number;

  NbKnotsV(): number;

  KnotU(anIndex: number): number;

  KnotV(anIndex: number): number;

  NbPolesU(): number;

  NbPolesV(): number;

  Weight(anIndex1: number, anIndex2: number): number;

  Pole(anIndex1: number, anIndex2: number): gp_Pnt;

  TransformedPole(anIndex1: number, anIndex2: number): gp_Pnt;

  UMin(): number;

  UMax(): number;

  VMin(): number;

  VMax(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Boundary: declare class IGESGeom_Boundary extends IGESData_IGESEntity

  constructor

  Init(aType: number, aPreference: number, aSurface: IGESData_IGESEntity, allModelCurves: NCollection_HArray1_handle_IGESData_IGESEntity, allSenses: NCollection_HArray1_int, allParameterCurves: IGESBasic_HArray1OfHArray1OfIGESEntity): void;

  BoundaryType(): number;

  PreferenceType(): number;

  Surface(): IGESData_IGESEntity;

  NbModelSpaceCurves(): number;

  ModelSpaceCurve(Index: number): IGESData_IGESEntity;

  Sense(Index: number): number;

  NbParameterCurves(Index: number): number;

  ParameterCurves(Index: number): NCollection_HArray1_handle_IGESData_IGESEntity;

  ParameterCurve(Index: number, Num: number): IGESData_IGESEntity;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_BoundedSurface: declare class IGESGeom_BoundedSurface extends IGESData_IGESEntity

  constructor

  Init(aType: number, aSurface: IGESData_IGESEntity, allBounds: NCollection_HArray1_handle_IGESGeom_Boundary): void;

  RepresentationType(): number;

  Surface(): IGESData_IGESEntity;

  NbBoundaries(): number;

  Boundary(Index: number): IGESGeom_Boundary;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_CircularArc: declare class IGESGeom_CircularArc extends IGESData_IGESEntity

  constructor

  Init(aZT: number, aCenter: gp_XY, aStart: gp_XY, anEnd: gp_XY): void;

  Center(): gp_Pnt2d;

  TransformedCenter(): gp_Pnt;

  StartPoint(): gp_Pnt2d;

  TransformedStartPoint(): gp_Pnt;

  ZPlane(): number;

  EndPoint(): gp_Pnt2d;

  TransformedEndPoint(): gp_Pnt;

  Radius(): number;

  Angle(): number;

  Axis(): gp_Dir;

  TransformedAxis(): gp_Dir;

  IsClosed(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_CompositeCurve: declare class IGESGeom_CompositeCurve extends IGESData_IGESEntity

  constructor

  Init(allEntities: NCollection_HArray1_handle_IGESData_IGESEntity): void;

  NbCurves(): number;

  Curve(Index: number): IGESData_IGESEntity;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ConicArc: declare class IGESGeom_ConicArc extends IGESData_IGESEntity

  constructor

  Init(A: number, B: number, C: number, D: number, E: number, F: number, ZT: number, aStart: gp_XY, anEnd: gp_XY): void;

  OwnCorrect(): boolean;

  ComputedFormNumber(): number;

  Equation(A?: number, B?: number, C?: number, D?: number, E?: number, F?: number): { A: number; B: number; C: number; D: number; E: number; F: number };

  ZPlane(): number;

  StartPoint(): gp_Pnt2d;

  TransformedStartPoint(): gp_Pnt;

  EndPoint(): gp_Pnt2d;

  TransformedEndPoint(): gp_Pnt;

  IsFromEllipse(): boolean;

  IsFromParabola(): boolean;

  IsFromHyperbola(): boolean;

  IsClosed(): boolean;

  Axis(): gp_Dir;

  TransformedAxis(): gp_Dir;

  Definition(Center: gp_Pnt, MainAxis: gp_Dir, rmin?: number, rmax?: number): { rmin: number; rmax: number };

  TransformedDefinition(Center: gp_Pnt, MainAxis: gp_Dir, rmin?: number, rmax?: number): { rmin: number; rmax: number };

  ComputedDefinition(Xcen?: number, Ycen?: number, Xax?: number, Yax?: number, Rmin?: number, Rmax?: number): { Xcen: number; Ycen: number; Xax: number; Yax: number; Rmin: number; Rmax: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_CopiousData: declare class IGESGeom_CopiousData extends IGESData_IGESEntity

  constructor

  Init(aDataType: number, aZPlane: number, allData: NCollection_HArray1_double): void;

  SetPolyline(mode: boolean): void;

  SetClosedPath2D(): void;

  IsPointSet(): boolean;

  IsPolyline(): boolean;

  IsClosedPath2D(): boolean;

  DataType(): number;

  NbPoints(): number;

  Data(NumPoint: number, NumData: number): number;

  ZPlane(): number;

  Point(anIndex: number): gp_Pnt;

  TransformedPoint(anIndex: number): gp_Pnt;

  Vector(anIndex: number): gp_Vec;

  TransformedVector(anIndex: number): gp_Vec;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_CurveOnSurface: declare class IGESGeom_CurveOnSurface extends IGESData_IGESEntity

  constructor

  Init(aMode: number, aSurface: IGESData_IGESEntity, aCurveUV: IGESData_IGESEntity, aCurve3D: IGESData_IGESEntity, aPreference: number): void;

  CreationMode(): number;

  Surface(): IGESData_IGESEntity;

  CurveUV(): IGESData_IGESEntity;

  Curve3D(): IGESData_IGESEntity;

  PreferenceMode(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Direction: declare class IGESGeom_Direction extends IGESData_IGESEntity

  constructor

  Init(aDirection: gp_XYZ): void;

  Value(): gp_Vec;

  TransformedValue(): gp_Vec;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Flash: declare class IGESGeom_Flash extends IGESData_IGESEntity

  constructor

  Init(aPoint: gp_XY, aDim: number, anotherDim: number, aRotation: number, aReference: IGESData_IGESEntity): void;

  SetFormNumber(form: number): void;

  ReferencePoint(): gp_Pnt2d;

  TransformedReferencePoint(): gp_Pnt;

  Dimension1(): number;

  Dimension2(): number;

  Rotation(): number;

  ReferenceEntity(): IGESData_IGESEntity;

  HasReferenceEntity(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_GeneralModule: declare class IGESGeom_GeneralModule extends IGESData_GeneralModule

  constructor

  DirChecker(CN: number, ent: IGESData_IGESEntity): IGESData_DirChecker;

  OwnCheckCase(CN: number, ent: IGESData_IGESEntity, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  NewVoid(CN: number): { returnValue: boolean; entto: Standard_Transient; [Symbol.dispose](): void };

  OwnCopyCase(CN: number, entfrom: IGESData_IGESEntity, entto: IGESData_IGESEntity, TC: Interface_CopyTool): void;

  CategoryNumber(CN: number, ent: Standard_Transient, shares: Interface_ShareTool): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Line: declare class IGESGeom_Line extends IGESData_IGESEntity

  constructor

  Init(aStart: gp_XYZ, anEnd: gp_XYZ): void;

  Infinite(): number;

  SetInfinite(status: number): void;

  StartPoint(): gp_Pnt;

  TransformedStartPoint(): gp_Pnt;

  EndPoint(): gp_Pnt;

  TransformedEndPoint(): gp_Pnt;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_OffsetCurve: declare class IGESGeom_OffsetCurve extends IGESData_IGESEntity

  constructor

  Init(aBaseCurve: IGESData_IGESEntity, anOffsetType: number, aFunction: IGESData_IGESEntity, aFunctionCoord: number, aTaperedOffsetType: number, offDistance1: number, arcLength1: number, offDistance2: number, arcLength2: number, aNormalVec: gp_XYZ, anOffsetParam: number, anotherOffsetParam: number): void;

  BaseCurve(): IGESData_IGESEntity;

  OffsetType(): number;

  Function(): IGESData_IGESEntity;

  HasFunction(): boolean;

  FunctionParameter(): number;

  TaperedOffsetType(): number;

  FirstOffsetDistance(): number;

  ArcLength1(): number;

  SecondOffsetDistance(): number;

  ArcLength2(): number;

  NormalVector(): gp_Vec;

  TransformedNormalVector(): gp_Vec;

  Parameters(StartParam?: number, EndParam?: number): { StartParam: number; EndParam: number };

  StartParameter(): number;

  EndParameter(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_OffsetSurface: declare class IGESGeom_OffsetSurface extends IGESData_IGESEntity

  constructor

  Init(anIndicatoR: gp_XYZ, aDistance: number, aSurface: IGESData_IGESEntity): void;

  OffsetIndicator(): gp_Vec;

  TransformedOffsetIndicator(): gp_Vec;

  Distance(): number;

  Surface(): IGESData_IGESEntity;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Plane: declare class IGESGeom_Plane extends IGESData_IGESEntity

  constructor

  Init(A: number, B: number, C: number, D: number, aCurve: IGESData_IGESEntity, attach: gp_XYZ, aSize: number): void;

  SetFormNumber(form: number): void;

  Equation(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

  TransformedEquation(A?: number, B?: number, C?: number, D?: number): { A: number; B: number; C: number; D: number };

  HasBoundingCurve(): boolean;

  HasBoundingCurveHole(): boolean;

  BoundingCurve(): IGESData_IGESEntity;

  HasSymbolAttach(): boolean;

  SymbolAttach(): gp_Pnt;

  TransformedSymbolAttach(): gp_Pnt;

  SymbolSize(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Point: declare class IGESGeom_Point extends IGESData_IGESEntity

  constructor

  Init(aPoint: gp_XYZ, aSymbol: IGESBasic_SubfigureDef): void;

  Value(): gp_Pnt;

  TransformedValue(): gp_Pnt;

  HasDisplaySymbol(): boolean;

  DisplaySymbol(): IGESBasic_SubfigureDef;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Protocol: declare class IGESGeom_Protocol extends IGESData_Protocol

  constructor

  NbResources(): number;

  Resource(num: number): Interface_Protocol;

  TypeNumber(atype: Standard_Type): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ReadWriteModule: declare class IGESGeom_ReadWriteModule extends IGESData_ReadWriteModule

  constructor

  CaseIGES(typenum: number, formnum: number): number;

  WriteOwnParams(CN: number, ent: IGESData_IGESEntity, IW: IGESData_IGESWriter): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_RuledSurface: declare class IGESGeom_RuledSurface extends IGESData_IGESEntity

  constructor

  Init(aCurve: IGESData_IGESEntity, anotherCurve: IGESData_IGESEntity, aDirFlag: number, aDevFlag: number): void;

  SetRuledByParameter(mode: boolean): void;

  IsRuledByParameter(): boolean;

  FirstCurve(): IGESData_IGESEntity;

  SecondCurve(): IGESData_IGESEntity;

  DirectionFlag(): number;

  IsDevelopable(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_SpecificModule: declare class IGESGeom_SpecificModule extends IGESData_SpecificModule

  constructor

  OwnCorrect(CN: number, ent: IGESData_IGESEntity): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_SplineCurve: declare class IGESGeom_SplineCurve extends IGESData_IGESEntity

  constructor

  Init(aType: number, aDegree: number, nbDimensions: number, allBreakPoints: NCollection_HArray1_double, allXPolynomials: NCollection_HArray2_double, allYPolynomials: NCollection_HArray2_double, allZPolynomials: NCollection_HArray2_double, allXvalues: NCollection_HArray1_double, allYvalues: NCollection_HArray1_double, allZvalues: NCollection_HArray1_double): void;

  SplineType(): number;

  Degree(): number;

  NbDimensions(): number;

  NbSegments(): number;

  BreakPoint(Index: number): number;

  XCoordPolynomial(Index: number, AX?: number, BX?: number, CX?: number, DX?: number): { AX: number; BX: number; CX: number; DX: number };

  YCoordPolynomial(Index: number, AY?: number, BY?: number, CY?: number, DY?: number): { AY: number; BY: number; CY: number; DY: number };

  ZCoordPolynomial(Index: number, AZ?: number, BZ?: number, CZ?: number, DZ?: number): { AZ: number; BZ: number; CZ: number; DZ: number };

  XValues(TPX0?: number, TPX1?: number, TPX2?: number, TPX3?: number): { TPX0: number; TPX1: number; TPX2: number; TPX3: number };

  YValues(TPY0?: number, TPY1?: number, TPY2?: number, TPY3?: number): { TPY0: number; TPY1: number; TPY2: number; TPY3: number };

  ZValues(TPZ0?: number, TPZ1?: number, TPZ2?: number, TPZ3?: number): { TPZ0: number; TPZ1: number; TPZ2: number; TPZ3: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_SplineSurface: declare class IGESGeom_SplineSurface extends IGESData_IGESEntity

  constructor

  Init(aBoundaryType: number, aPatchType: number, allUBreakpoints: NCollection_HArray1_double, allVBreakpoints: NCollection_HArray1_double, allXCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double, allYCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double, allZCoeffs: NCollection_HArray2_handle_NCollection_HArray1_double): void;

  NbUSegments(): number;

  NbVSegments(): number;

  BoundaryType(): number;

  PatchType(): number;

  UBreakPoint(anIndex: number): number;

  VBreakPoint(anIndex: number): number;

  XPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

  YPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

  ZPolynomial(anIndex1: number, anIndex2: number): NCollection_HArray1_double;

  Polynomials(): { XCoef: NCollection_HArray2_handle_NCollection_HArray1_double; YCoef: NCollection_HArray2_handle_NCollection_HArray1_double; ZCoef: NCollection_HArray2_handle_NCollection_HArray1_double; [Symbol.dispose](): void };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_SurfaceOfRevolution: declare class IGESGeom_SurfaceOfRevolution extends IGESData_IGESEntity

  constructor

  Init(anAxis: IGESGeom_Line, aGeneratrix: IGESData_IGESEntity, aStartAngle: number, anEndAngle: number): void;

  AxisOfRevolution(): IGESGeom_Line;

  Generatrix(): IGESData_IGESEntity;

  StartAngle(): number;

  EndAngle(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_TabulatedCylinder: declare class IGESGeom_TabulatedCylinder extends IGESData_IGESEntity

  constructor

  Init(aDirectrix: IGESData_IGESEntity, anEnd: gp_XYZ): void;

  Directrix(): IGESData_IGESEntity;

  EndPoint(): gp_Pnt;

  TransformedEndPoint(): gp_Pnt;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolBSplineCurve: declare class IGESGeom_ToolBSplineCurve

  constructor

  WriteOwnParams(ent: IGESGeom_BSplineCurve, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_BSplineCurve): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_BSplineCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_BSplineCurve, entto: IGESGeom_BSplineCurve, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolBSplineSurface: declare class IGESGeom_ToolBSplineSurface

  constructor

  WriteOwnParams(ent: IGESGeom_BSplineSurface, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_BSplineSurface): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_BSplineSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_BSplineSurface, entto: IGESGeom_BSplineSurface, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolBoundary: declare class IGESGeom_ToolBoundary

  constructor

  WriteOwnParams(ent: IGESGeom_Boundary, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGeom_Boundary): boolean;

  DirChecker(ent: IGESGeom_Boundary): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_Boundary, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_Boundary, entto: IGESGeom_Boundary, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolBoundedSurface: declare class IGESGeom_ToolBoundedSurface

  constructor

  WriteOwnParams(ent: IGESGeom_BoundedSurface, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_BoundedSurface): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_BoundedSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_BoundedSurface, entto: IGESGeom_BoundedSurface, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolCircularArc: declare class IGESGeom_ToolCircularArc

  constructor

  WriteOwnParams(ent: IGESGeom_CircularArc, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_CircularArc): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_CircularArc, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_CircularArc, entto: IGESGeom_CircularArc, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolCompositeCurve: declare class IGESGeom_ToolCompositeCurve

  constructor

  WriteOwnParams(ent: IGESGeom_CompositeCurve, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_CompositeCurve): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_CompositeCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_CompositeCurve, entto: IGESGeom_CompositeCurve, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;
