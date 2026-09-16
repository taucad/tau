# libcascade — IGESGeom (2)

25 top-level symbols. Signatures are verbatim typescript.

IGESGeom_ToolConicArc: declare class IGESGeom_ToolConicArc

  constructor

  WriteOwnParams(ent: IGESGeom_ConicArc, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGeom_ConicArc): boolean;

  DirChecker(ent: IGESGeom_ConicArc): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_ConicArc, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_ConicArc, entto: IGESGeom_ConicArc, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolCopiousData: declare class IGESGeom_ToolCopiousData

  constructor

  WriteOwnParams(ent: IGESGeom_CopiousData, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_CopiousData): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_CopiousData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_CopiousData, entto: IGESGeom_CopiousData, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolCurveOnSurface: declare class IGESGeom_ToolCurveOnSurface

  constructor

  WriteOwnParams(ent: IGESGeom_CurveOnSurface, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGeom_CurveOnSurface): boolean;

  DirChecker(ent: IGESGeom_CurveOnSurface): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_CurveOnSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_CurveOnSurface, entto: IGESGeom_CurveOnSurface, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolDirection: declare class IGESGeom_ToolDirection

  constructor

  WriteOwnParams(ent: IGESGeom_Direction, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_Direction): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_Direction, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_Direction, entto: IGESGeom_Direction, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolFlash: declare class IGESGeom_ToolFlash

  constructor

  WriteOwnParams(ent: IGESGeom_Flash, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGeom_Flash): boolean;

  DirChecker(ent: IGESGeom_Flash): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_Flash, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_Flash, entto: IGESGeom_Flash, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolLine: declare class IGESGeom_ToolLine

  constructor

  WriteOwnParams(ent: IGESGeom_Line, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_Line): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_Line, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_Line, entto: IGESGeom_Line, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolOffsetCurve: declare class IGESGeom_ToolOffsetCurve

  constructor

  WriteOwnParams(ent: IGESGeom_OffsetCurve, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGeom_OffsetCurve): boolean;

  DirChecker(ent: IGESGeom_OffsetCurve): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_OffsetCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_OffsetCurve, entto: IGESGeom_OffsetCurve, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolOffsetSurface: declare class IGESGeom_ToolOffsetSurface

  constructor

  WriteOwnParams(ent: IGESGeom_OffsetSurface, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_OffsetSurface): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_OffsetSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_OffsetSurface, entto: IGESGeom_OffsetSurface, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolPlane: declare class IGESGeom_ToolPlane

  constructor

  WriteOwnParams(ent: IGESGeom_Plane, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_Plane): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_Plane, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_Plane, entto: IGESGeom_Plane, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolPoint: declare class IGESGeom_ToolPoint

  constructor

  WriteOwnParams(ent: IGESGeom_Point, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_Point): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_Point, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_Point, entto: IGESGeom_Point, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolRuledSurface: declare class IGESGeom_ToolRuledSurface

  constructor

  WriteOwnParams(ent: IGESGeom_RuledSurface, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_RuledSurface): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_RuledSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_RuledSurface, entto: IGESGeom_RuledSurface, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolSplineCurve: declare class IGESGeom_ToolSplineCurve

  constructor

  WriteOwnParams(ent: IGESGeom_SplineCurve, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_SplineCurve): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_SplineCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_SplineCurve, entto: IGESGeom_SplineCurve, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolSplineSurface: declare class IGESGeom_ToolSplineSurface

  constructor

  WriteOwnParams(ent: IGESGeom_SplineSurface, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_SplineSurface): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_SplineSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_SplineSurface, entto: IGESGeom_SplineSurface, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolSurfaceOfRevolution: declare class IGESGeom_ToolSurfaceOfRevolution

  constructor

  WriteOwnParams(ent: IGESGeom_SurfaceOfRevolution, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_SurfaceOfRevolution): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_SurfaceOfRevolution, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_SurfaceOfRevolution, entto: IGESGeom_SurfaceOfRevolution, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolTabulatedCylinder: declare class IGESGeom_ToolTabulatedCylinder

  constructor

  WriteOwnParams(ent: IGESGeom_TabulatedCylinder, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_TabulatedCylinder): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_TabulatedCylinder, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_TabulatedCylinder, entto: IGESGeom_TabulatedCylinder, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolTransformationMatrix: declare class IGESGeom_ToolTransformationMatrix

  constructor

  WriteOwnParams(ent: IGESGeom_TransformationMatrix, IW: IGESData_IGESWriter): void;

  OwnCorrect(ent: IGESGeom_TransformationMatrix): boolean;

  DirChecker(ent: IGESGeom_TransformationMatrix): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_TransformationMatrix, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_TransformationMatrix, entto: IGESGeom_TransformationMatrix, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_ToolTrimmedSurface: declare class IGESGeom_ToolTrimmedSurface

  constructor

  WriteOwnParams(ent: IGESGeom_TrimmedSurface, IW: IGESData_IGESWriter): void;

  DirChecker(ent: IGESGeom_TrimmedSurface): IGESData_DirChecker;

  OwnCheck(ent: IGESGeom_TrimmedSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  OwnCopy(entfrom: IGESGeom_TrimmedSurface, entto: IGESGeom_TrimmedSurface, TC: Interface_CopyTool): void;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_TransformationMatrix: declare class IGESGeom_TransformationMatrix extends IGESData_TransfEntity

  constructor

  Init(aMatrix: NCollection_HArray2_double): void;

  SetFormNumber(form: number): void;

  Data(I: number, J: number): number;

  Value(): gp_GTrsf;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_TrimmedSurface: declare class IGESGeom_TrimmedSurface extends IGESData_IGESEntity

  constructor

  Init(aSurface: IGESData_IGESEntity, aFlag: number, anOuter: IGESGeom_CurveOnSurface, allInners: NCollection_HArray1_handle_IGESGeom_CurveOnSurface): void;

  Surface(): IGESData_IGESEntity;

  HasOuterContour(): boolean;

  OuterContour(): IGESGeom_CurveOnSurface;

  OuterBoundaryType(): number;

  NbInnerContours(): number;

  InnerContour(Index: number): IGESGeom_CurveOnSurface;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

IGESGeom_Array1OfBoundary: NCollection_Array1_handle_IGESGeom_Boundary

IGESGeom_Array1OfCurveOnSurface: NCollection_Array1_handle_IGESGeom_CurveOnSurface

IGESGeom_Array1OfTransformationMatrix: NCollection_Array1_handle_IGESGeom_TransformationMatrix

IGESGeom_HArray1OfBoundary: NCollection_HArray1_handle_IGESGeom_Boundary

IGESGeom_HArray1OfCurveOnSurface: NCollection_HArray1_handle_IGESGeom_CurveOnSurface

IGESGeom_HArray1OfTransformationMatrix: NCollection_HArray1_handle_IGESGeom_TransformationMatrix
