# libcascade — IGESGeom (2)

26 top-level symbols. Signatures are verbatim typescript.

IGESGeom_ToolCompositeCurve: declare class IGESGeom_ToolCompositeCurve

  // IGESGeom_ToolCompositeCurve.constructor (constructor)
  constructor();

  // IGESGeom_ToolCompositeCurve.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_CompositeCurve, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolCompositeCurve.DirChecker (method)
  DirChecker(ent: IGESGeom_CompositeCurve): IGESData_DirChecker;

  // IGESGeom_ToolCompositeCurve.OwnCheck (method)
  OwnCheck(ent: IGESGeom_CompositeCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolCompositeCurve.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_CompositeCurve, entto: IGESGeom_CompositeCurve, TC: Interface_CopyTool): void;

  // IGESGeom_ToolCompositeCurve.delete (method)
  delete(): void;

  // IGESGeom_ToolCompositeCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolConicArc: declare class IGESGeom_ToolConicArc

  // IGESGeom_ToolConicArc.constructor (constructor)
  constructor();

  // IGESGeom_ToolConicArc.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_ConicArc, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolConicArc.OwnCorrect (method)
  OwnCorrect(ent: IGESGeom_ConicArc): boolean;

  // IGESGeom_ToolConicArc.DirChecker (method)
  DirChecker(ent: IGESGeom_ConicArc): IGESData_DirChecker;

  // IGESGeom_ToolConicArc.OwnCheck (method)
  OwnCheck(ent: IGESGeom_ConicArc, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolConicArc.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_ConicArc, entto: IGESGeom_ConicArc, TC: Interface_CopyTool): void;

  // IGESGeom_ToolConicArc.delete (method)
  delete(): void;

  // IGESGeom_ToolConicArc.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolCopiousData: declare class IGESGeom_ToolCopiousData

  // IGESGeom_ToolCopiousData.constructor (constructor)
  constructor();

  // IGESGeom_ToolCopiousData.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_CopiousData, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolCopiousData.DirChecker (method)
  DirChecker(ent: IGESGeom_CopiousData): IGESData_DirChecker;

  // IGESGeom_ToolCopiousData.OwnCheck (method)
  OwnCheck(ent: IGESGeom_CopiousData, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolCopiousData.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_CopiousData, entto: IGESGeom_CopiousData, TC: Interface_CopyTool): void;

  // IGESGeom_ToolCopiousData.delete (method)
  delete(): void;

  // IGESGeom_ToolCopiousData.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolCurveOnSurface: declare class IGESGeom_ToolCurveOnSurface

  // IGESGeom_ToolCurveOnSurface.constructor (constructor)
  constructor();

  // IGESGeom_ToolCurveOnSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_CurveOnSurface, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolCurveOnSurface.OwnCorrect (method)
  OwnCorrect(ent: IGESGeom_CurveOnSurface): boolean;

  // IGESGeom_ToolCurveOnSurface.DirChecker (method)
  DirChecker(ent: IGESGeom_CurveOnSurface): IGESData_DirChecker;

  // IGESGeom_ToolCurveOnSurface.OwnCheck (method)
  OwnCheck(ent: IGESGeom_CurveOnSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolCurveOnSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_CurveOnSurface, entto: IGESGeom_CurveOnSurface, TC: Interface_CopyTool): void;

  // IGESGeom_ToolCurveOnSurface.delete (method)
  delete(): void;

  // IGESGeom_ToolCurveOnSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolDirection: declare class IGESGeom_ToolDirection

  // IGESGeom_ToolDirection.constructor (constructor)
  constructor();

  // IGESGeom_ToolDirection.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_Direction, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolDirection.DirChecker (method)
  DirChecker(ent: IGESGeom_Direction): IGESData_DirChecker;

  // IGESGeom_ToolDirection.OwnCheck (method)
  OwnCheck(ent: IGESGeom_Direction, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolDirection.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_Direction, entto: IGESGeom_Direction, TC: Interface_CopyTool): void;

  // IGESGeom_ToolDirection.delete (method)
  delete(): void;

  // IGESGeom_ToolDirection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolFlash: declare class IGESGeom_ToolFlash

  // IGESGeom_ToolFlash.constructor (constructor)
  constructor();

  // IGESGeom_ToolFlash.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_Flash, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolFlash.OwnCorrect (method)
  OwnCorrect(ent: IGESGeom_Flash): boolean;

  // IGESGeom_ToolFlash.DirChecker (method)
  DirChecker(ent: IGESGeom_Flash): IGESData_DirChecker;

  // IGESGeom_ToolFlash.OwnCheck (method)
  OwnCheck(ent: IGESGeom_Flash, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolFlash.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_Flash, entto: IGESGeom_Flash, TC: Interface_CopyTool): void;

  // IGESGeom_ToolFlash.delete (method)
  delete(): void;

  // IGESGeom_ToolFlash.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolLine: declare class IGESGeom_ToolLine

  // IGESGeom_ToolLine.constructor (constructor)
  constructor();

  // IGESGeom_ToolLine.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_Line, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolLine.DirChecker (method)
  DirChecker(ent: IGESGeom_Line): IGESData_DirChecker;

  // IGESGeom_ToolLine.OwnCheck (method)
  OwnCheck(ent: IGESGeom_Line, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolLine.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_Line, entto: IGESGeom_Line, TC: Interface_CopyTool): void;

  // IGESGeom_ToolLine.delete (method)
  delete(): void;

  // IGESGeom_ToolLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolOffsetCurve: declare class IGESGeom_ToolOffsetCurve

  // IGESGeom_ToolOffsetCurve.constructor (constructor)
  constructor();

  // IGESGeom_ToolOffsetCurve.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_OffsetCurve, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolOffsetCurve.OwnCorrect (method)
  OwnCorrect(ent: IGESGeom_OffsetCurve): boolean;

  // IGESGeom_ToolOffsetCurve.DirChecker (method)
  DirChecker(ent: IGESGeom_OffsetCurve): IGESData_DirChecker;

  // IGESGeom_ToolOffsetCurve.OwnCheck (method)
  OwnCheck(ent: IGESGeom_OffsetCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolOffsetCurve.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_OffsetCurve, entto: IGESGeom_OffsetCurve, TC: Interface_CopyTool): void;

  // IGESGeom_ToolOffsetCurve.delete (method)
  delete(): void;

  // IGESGeom_ToolOffsetCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolOffsetSurface: declare class IGESGeom_ToolOffsetSurface

  // IGESGeom_ToolOffsetSurface.constructor (constructor)
  constructor();

  // IGESGeom_ToolOffsetSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_OffsetSurface, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolOffsetSurface.DirChecker (method)
  DirChecker(ent: IGESGeom_OffsetSurface): IGESData_DirChecker;

  // IGESGeom_ToolOffsetSurface.OwnCheck (method)
  OwnCheck(ent: IGESGeom_OffsetSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolOffsetSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_OffsetSurface, entto: IGESGeom_OffsetSurface, TC: Interface_CopyTool): void;

  // IGESGeom_ToolOffsetSurface.delete (method)
  delete(): void;

  // IGESGeom_ToolOffsetSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolPlane: declare class IGESGeom_ToolPlane

  // IGESGeom_ToolPlane.constructor (constructor)
  constructor();

  // IGESGeom_ToolPlane.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_Plane, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolPlane.DirChecker (method)
  DirChecker(ent: IGESGeom_Plane): IGESData_DirChecker;

  // IGESGeom_ToolPlane.OwnCheck (method)
  OwnCheck(ent: IGESGeom_Plane, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolPlane.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_Plane, entto: IGESGeom_Plane, TC: Interface_CopyTool): void;

  // IGESGeom_ToolPlane.delete (method)
  delete(): void;

  // IGESGeom_ToolPlane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolPoint: declare class IGESGeom_ToolPoint

  // IGESGeom_ToolPoint.constructor (constructor)
  constructor();

  // IGESGeom_ToolPoint.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_Point, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolPoint.DirChecker (method)
  DirChecker(ent: IGESGeom_Point): IGESData_DirChecker;

  // IGESGeom_ToolPoint.OwnCheck (method)
  OwnCheck(ent: IGESGeom_Point, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolPoint.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_Point, entto: IGESGeom_Point, TC: Interface_CopyTool): void;

  // IGESGeom_ToolPoint.delete (method)
  delete(): void;

  // IGESGeom_ToolPoint.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolRuledSurface: declare class IGESGeom_ToolRuledSurface

  // IGESGeom_ToolRuledSurface.constructor (constructor)
  constructor();

  // IGESGeom_ToolRuledSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_RuledSurface, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolRuledSurface.DirChecker (method)
  DirChecker(ent: IGESGeom_RuledSurface): IGESData_DirChecker;

  // IGESGeom_ToolRuledSurface.OwnCheck (method)
  OwnCheck(ent: IGESGeom_RuledSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolRuledSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_RuledSurface, entto: IGESGeom_RuledSurface, TC: Interface_CopyTool): void;

  // IGESGeom_ToolRuledSurface.delete (method)
  delete(): void;

  // IGESGeom_ToolRuledSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolSplineCurve: declare class IGESGeom_ToolSplineCurve

  // IGESGeom_ToolSplineCurve.constructor (constructor)
  constructor();

  // IGESGeom_ToolSplineCurve.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_SplineCurve, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolSplineCurve.DirChecker (method)
  DirChecker(ent: IGESGeom_SplineCurve): IGESData_DirChecker;

  // IGESGeom_ToolSplineCurve.OwnCheck (method)
  OwnCheck(ent: IGESGeom_SplineCurve, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolSplineCurve.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_SplineCurve, entto: IGESGeom_SplineCurve, TC: Interface_CopyTool): void;

  // IGESGeom_ToolSplineCurve.delete (method)
  delete(): void;

  // IGESGeom_ToolSplineCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolSplineSurface: declare class IGESGeom_ToolSplineSurface

  // IGESGeom_ToolSplineSurface.constructor (constructor)
  constructor();

  // IGESGeom_ToolSplineSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_SplineSurface, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolSplineSurface.DirChecker (method)
  DirChecker(ent: IGESGeom_SplineSurface): IGESData_DirChecker;

  // IGESGeom_ToolSplineSurface.OwnCheck (method)
  OwnCheck(ent: IGESGeom_SplineSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolSplineSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_SplineSurface, entto: IGESGeom_SplineSurface, TC: Interface_CopyTool): void;

  // IGESGeom_ToolSplineSurface.delete (method)
  delete(): void;

  // IGESGeom_ToolSplineSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolSurfaceOfRevolution: declare class IGESGeom_ToolSurfaceOfRevolution

  // IGESGeom_ToolSurfaceOfRevolution.constructor (constructor)
  constructor();

  // IGESGeom_ToolSurfaceOfRevolution.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_SurfaceOfRevolution, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolSurfaceOfRevolution.DirChecker (method)
  DirChecker(ent: IGESGeom_SurfaceOfRevolution): IGESData_DirChecker;

  // IGESGeom_ToolSurfaceOfRevolution.OwnCheck (method)
  OwnCheck(ent: IGESGeom_SurfaceOfRevolution, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolSurfaceOfRevolution.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_SurfaceOfRevolution, entto: IGESGeom_SurfaceOfRevolution, TC: Interface_CopyTool): void;

  // IGESGeom_ToolSurfaceOfRevolution.delete (method)
  delete(): void;

  // IGESGeom_ToolSurfaceOfRevolution.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolTabulatedCylinder: declare class IGESGeom_ToolTabulatedCylinder

  // IGESGeom_ToolTabulatedCylinder.constructor (constructor)
  constructor();

  // IGESGeom_ToolTabulatedCylinder.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_TabulatedCylinder, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolTabulatedCylinder.DirChecker (method)
  DirChecker(ent: IGESGeom_TabulatedCylinder): IGESData_DirChecker;

  // IGESGeom_ToolTabulatedCylinder.OwnCheck (method)
  OwnCheck(ent: IGESGeom_TabulatedCylinder, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolTabulatedCylinder.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_TabulatedCylinder, entto: IGESGeom_TabulatedCylinder, TC: Interface_CopyTool): void;

  // IGESGeom_ToolTabulatedCylinder.delete (method)
  delete(): void;

  // IGESGeom_ToolTabulatedCylinder.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolTransformationMatrix: declare class IGESGeom_ToolTransformationMatrix

  // IGESGeom_ToolTransformationMatrix.constructor (constructor)
  constructor();

  // IGESGeom_ToolTransformationMatrix.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_TransformationMatrix, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolTransformationMatrix.OwnCorrect (method)
  OwnCorrect(ent: IGESGeom_TransformationMatrix): boolean;

  // IGESGeom_ToolTransformationMatrix.DirChecker (method)
  DirChecker(ent: IGESGeom_TransformationMatrix): IGESData_DirChecker;

  // IGESGeom_ToolTransformationMatrix.OwnCheck (method)
  OwnCheck(ent: IGESGeom_TransformationMatrix, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolTransformationMatrix.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_TransformationMatrix, entto: IGESGeom_TransformationMatrix, TC: Interface_CopyTool): void;

  // IGESGeom_ToolTransformationMatrix.delete (method)
  delete(): void;

  // IGESGeom_ToolTransformationMatrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_ToolTrimmedSurface: declare class IGESGeom_ToolTrimmedSurface

  // IGESGeom_ToolTrimmedSurface.constructor (constructor)
  constructor();

  // IGESGeom_ToolTrimmedSurface.WriteOwnParams (method)
  WriteOwnParams(ent: IGESGeom_TrimmedSurface, IW: IGESData_IGESWriter): void;

  // IGESGeom_ToolTrimmedSurface.DirChecker (method)
  DirChecker(ent: IGESGeom_TrimmedSurface): IGESData_DirChecker;

  // IGESGeom_ToolTrimmedSurface.OwnCheck (method)
  OwnCheck(ent: IGESGeom_TrimmedSurface, shares: Interface_ShareTool): { ach: Interface_Check; [Symbol.dispose](): void };

  // IGESGeom_ToolTrimmedSurface.OwnCopy (method)
  OwnCopy(entfrom: IGESGeom_TrimmedSurface, entto: IGESGeom_TrimmedSurface, TC: Interface_CopyTool): void;

  // IGESGeom_ToolTrimmedSurface.delete (method)
  delete(): void;

  // IGESGeom_ToolTrimmedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_TransformationMatrix: declare class IGESGeom_TransformationMatrix extends IGESData_TransfEntity

  // IGESGeom_TransformationMatrix.constructor (constructor)
  constructor();

  // IGESGeom_TransformationMatrix.Init (method)
  Init(aMatrix: NCollection_HArray2_double): void;

  // IGESGeom_TransformationMatrix.SetFormNumber (method)
  SetFormNumber(form: number): void;

  // IGESGeom_TransformationMatrix.Data (method)
  Data(I: number, J: number): number;

  // IGESGeom_TransformationMatrix.Value (method)
  Value(): gp_GTrsf;

  // IGESGeom_TransformationMatrix.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_TransformationMatrix.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_TransformationMatrix.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_TransformationMatrix.delete (method)
  delete(): void;

  // IGESGeom_TransformationMatrix.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_TrimmedSurface: declare class IGESGeom_TrimmedSurface extends IGESData_IGESEntity

  // IGESGeom_TrimmedSurface.constructor (constructor)
  constructor();

  // IGESGeom_TrimmedSurface.Init (method)
  Init(aSurface: IGESData_IGESEntity, aFlag: number, anOuter: IGESGeom_CurveOnSurface, allInners: NCollection_HArray1_handle_IGESGeom_CurveOnSurface): void;

  // IGESGeom_TrimmedSurface.Surface (method)
  Surface(): IGESData_IGESEntity;

  // IGESGeom_TrimmedSurface.HasOuterContour (method)
  HasOuterContour(): boolean;

  // IGESGeom_TrimmedSurface.OuterContour (method)
  OuterContour(): IGESGeom_CurveOnSurface;

  // IGESGeom_TrimmedSurface.OuterBoundaryType (method)
  OuterBoundaryType(): number;

  // IGESGeom_TrimmedSurface.NbInnerContours (method)
  NbInnerContours(): number;

  // IGESGeom_TrimmedSurface.InnerContour (method)
  InnerContour(Index: number): IGESGeom_CurveOnSurface;

  // IGESGeom_TrimmedSurface.get_type_name (method)
  static get_type_name(): string;

  // IGESGeom_TrimmedSurface.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // IGESGeom_TrimmedSurface.DynamicType (method)
  DynamicType(): Standard_Type;

  // IGESGeom_TrimmedSurface.delete (method)
  delete(): void;

  // IGESGeom_TrimmedSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

IGESGeom_Array1OfBoundary: NCollection_Array1_handle_IGESGeom_Boundary

IGESGeom_Array1OfCurveOnSurface: NCollection_Array1_handle_IGESGeom_CurveOnSurface

IGESGeom_Array1OfTransformationMatrix: NCollection_Array1_handle_IGESGeom_TransformationMatrix

IGESGeom_HArray1OfBoundary: NCollection_HArray1_handle_IGESGeom_Boundary

IGESGeom_HArray1OfCurveOnSurface: NCollection_HArray1_handle_IGESGeom_CurveOnSurface

IGESGeom_HArray1OfTransformationMatrix: NCollection_HArray1_handle_IGESGeom_TransformationMatrix
