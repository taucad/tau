# libcascade — StepVisual (2)

44 top-level symbols. Signatures are verbatim typescript.

StepVisual_ContextDependentOverRidingStyledItem: declare class StepVisual_ContextDependentOverRidingStyledItem extends StepVisual_OverRidingStyledItem

  constructor

  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  SetStyleContext(aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;

  StyleContext(): NCollection_HArray1_StepVisual_StyleContextSelect;

  StyleContextValue(num: number): StepVisual_StyleContextSelect;

  NbStyleContext(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CoordinatesList: declare class StepVisual_CoordinatesList extends StepVisual_TessellatedItem

  constructor

  Init(theName: TCollection_HAsciiString, thePoints: NCollection_HArray1_gp_XYZ): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, thePoints: NCollection_HArray1_gp_XYZ): void;
  Init(aName: TCollection_HAsciiString): void;

  Points(): NCollection_HArray1_gp_XYZ;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CubicBezierTessellatedEdge: declare class StepVisual_CubicBezierTessellatedEdge extends StepVisual_TessellatedEdge

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CubicBezierTriangulatedFace: declare class StepVisual_CubicBezierTriangulatedFace extends StepVisual_TessellatedFace

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, theCtriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, theCtriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, theCtriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  Ctriangles(): NCollection_HArray2_int;

  SetCtriangles(theCtriangles: NCollection_HArray2_int): void;

  NbCtriangles(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CurveStyle: declare class StepVisual_CurveStyle extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aCurveFont: StepVisual_CurveStyleFontSelect, aCurveWidth: StepBasic_SizeSelect, aCurveColour: StepVisual_Colour): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetCurveFont(aCurveFont: StepVisual_CurveStyleFontSelect): void;

  CurveFont(): StepVisual_CurveStyleFontSelect;

  SetCurveWidth(aCurveWidth: StepBasic_SizeSelect): void;

  CurveWidth(): StepBasic_SizeSelect;

  SetCurveColour(aCurveColour: StepVisual_Colour): void;

  CurveColour(): StepVisual_Colour;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CurveStyleFont: declare class StepVisual_CurveStyleFont extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aPatternList: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetPatternList(aPatternList: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern): void;

  PatternList(): NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern;

  PatternListValue(num: number): StepVisual_CurveStyleFontPattern;

  NbPatternList(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CurveStyleFontPattern: declare class StepVisual_CurveStyleFontPattern extends Standard_Transient

  constructor

  Init(aVisibleSegmentLength: number, aInvisibleSegmentLength: number): void;

  SetVisibleSegmentLength(aVisibleSegmentLength: number): void;

  VisibleSegmentLength(): number;

  SetInvisibleSegmentLength(aInvisibleSegmentLength: number): void;

  InvisibleSegmentLength(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CurveStyleFontSelect: declare class StepVisual_CurveStyleFontSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  CurveStyleFont(): StepVisual_CurveStyleFont;

  PreDefinedCurveFont(): StepVisual_PreDefinedCurveFont;

  ExternallyDefinedCurveFont(): StepVisual_ExternallyDefinedCurveFont;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_DirectionCountSelect: declare class StepVisual_DirectionCountSelect

  constructor

  SetTypeOfContent(aTypeOfContent: number): void;

  TypeOfContent(): number;

  UDirectionCount(): number;

  SetUDirectionCount(aUDirectionCount: number): void;

  VDirectionCount(): number;

  SetVDirectionCount(aUDirectionCount: number): void;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_DraughtingAnnotationOccurrence: declare class StepVisual_DraughtingAnnotationOccurrence extends StepVisual_AnnotationOccurrence

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_DraughtingCallout: declare class StepVisual_DraughtingCallout extends StepGeom_GeometricRepresentationItem

  constructor

  Init(theName: TCollection_HAsciiString, theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;
  Init(aName: TCollection_HAsciiString): void;

  Contents(): NCollection_HArray1_StepVisual_DraughtingCalloutElement;

  SetContents(theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;

  NbContents(): number;

  ContentsValue(theNum: number): StepVisual_DraughtingCalloutElement;

  SetContentsValue(theNum: number, theItem: StepVisual_DraughtingCalloutElement): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_DraughtingCalloutElement: declare class StepVisual_DraughtingCalloutElement extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  AnnotationCurveOccurrence(): StepVisual_AnnotationCurveOccurrence;

  AnnotationTextOccurrence(): StepVisual_AnnotationTextOccurrence;

  TessellatedAnnotationOccurrence(): StepVisual_TessellatedAnnotationOccurrence;

  AnnotationFillAreaOccurrence(): StepVisual_AnnotationFillAreaOccurrence;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_DraughtingModel: declare class StepVisual_DraughtingModel extends StepRepr_Representation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_DraughtingPreDefinedColour: declare class StepVisual_DraughtingPreDefinedColour extends StepVisual_PreDefinedColour

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_DraughtingPreDefinedCurveFont: declare class StepVisual_DraughtingPreDefinedCurveFont extends StepVisual_PreDefinedCurveFont

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_EdgeOrCurve: declare class StepVisual_EdgeOrCurve extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Curve(): StepGeom_Curve;

  Edge(): StepShape_Edge;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ExternallyDefinedCurveFont: declare class StepVisual_ExternallyDefinedCurveFont extends StepBasic_ExternallyDefinedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ExternallyDefinedTextFont: declare class StepVisual_ExternallyDefinedTextFont extends StepBasic_ExternallyDefinedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_FaceOrSurface: declare class StepVisual_FaceOrSurface extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Face(): StepShape_Face;

  Surface(): StepGeom_Surface;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_FillAreaStyle: declare class StepVisual_FillAreaStyle extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aFillStyles: NCollection_HArray1_StepVisual_FillStyleSelect): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetFillStyles(aFillStyles: NCollection_HArray1_StepVisual_FillStyleSelect): void;

  FillStyles(): NCollection_HArray1_StepVisual_FillStyleSelect;

  FillStylesValue(num: number): StepVisual_FillStyleSelect;

  NbFillStyles(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_FillAreaStyleColour: declare class StepVisual_FillAreaStyleColour extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aFillColour: StepVisual_Colour): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetFillColour(aFillColour: StepVisual_Colour): void;

  FillColour(): StepVisual_Colour;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_FillStyleSelect: declare class StepVisual_FillStyleSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  FillAreaStyleColour(): StepVisual_FillAreaStyleColour;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_FontSelect: declare class StepVisual_FontSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  PreDefinedTextFont(): StepVisual_PreDefinedTextFont;

  ExternallyDefinedTextFont(): StepVisual_ExternallyDefinedTextFont;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_Invisibility: declare class StepVisual_Invisibility extends Standard_Transient

  constructor

  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

  SetInvisibleItems(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

  InvisibleItems(): NCollection_HArray1_StepVisual_InvisibleItem;

  InvisibleItemsValue(num: number): StepVisual_InvisibleItem;

  NbInvisibleItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_InvisibilityContext: declare class StepVisual_InvisibilityContext extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  PresentationSet(): StepVisual_PresentationSet;

  DraughtingModel(): StepVisual_DraughtingModel;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_InvisibleItem: declare class StepVisual_InvisibleItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  StyledItem(): StepVisual_StyledItem;

  PresentationLayerAssignment(): StepVisual_PresentationLayerAssignment;

  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_LayeredItem: declare class StepVisual_LayeredItem extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  RepresentationItem(): StepRepr_RepresentationItem;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_MarkerMember: declare class StepVisual_MarkerMember extends StepData_SelectInt

  constructor

  HasName(): boolean;

  Name(): string;

  SetName(name: string): boolean;

  EnumText(): string;

  SetEnumText(val: number, text: string): void;

  SetValue(val: StepVisual_MarkerType): void;

  Value(): StepVisual_MarkerType;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_MarkerSelect: declare class StepVisual_MarkerSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  NewMember(): StepData_SelectMember;

  CaseMem(ent: StepData_SelectMember): number;

  MarkerMember(): StepVisual_MarkerMember;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_MarkerType: typeof StepVisual_MarkerType[keyof typeof StepVisual_MarkerType]

StepVisual_MechanicalDesignGeometricPresentationArea: declare class StepVisual_MechanicalDesignGeometricPresentationArea extends StepVisual_PresentationArea

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_MechanicalDesignGeometricPresentationRepresentation: declare class StepVisual_MechanicalDesignGeometricPresentationRepresentation extends StepVisual_PresentationRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_NullStyle: typeof StepVisual_NullStyle[keyof typeof StepVisual_NullStyle]

StepVisual_NullStyleMember: declare class StepVisual_NullStyleMember extends StepData_SelectInt

  constructor

  HasName(): boolean;

  Name(): string;

  SetName(name: string): boolean;

  Kind(): number;

  EnumText(): string;

  SetEnumText(val: number, text: string): void;

  SetValue(theValue: StepVisual_NullStyle): void;

  Value(): StepVisual_NullStyle;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_OverRidingStyledItem: declare class StepVisual_OverRidingStyledItem extends StepVisual_StyledItem

  constructor

  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  SetOverRiddenStyle(aOverRiddenStyle: StepVisual_StyledItem): void;

  OverRiddenStyle(): StepVisual_StyledItem;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PathOrCompositeCurve: declare class StepVisual_PathOrCompositeCurve extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  CompositeCurve(): StepGeom_CompositeCurve;

  Path(): StepShape_Path;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PlanarBox: declare class StepVisual_PlanarBox extends StepVisual_PlanarExtent

  constructor

  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number, aPlacement: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number, aPlacement: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number, aPlacement: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetPlacement(aPlacement: StepGeom_Axis2Placement): void;

  Placement(): StepGeom_Axis2Placement;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PlanarExtent: declare class StepVisual_PlanarExtent extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetSizeInX(aSizeInX: number): void;

  SizeInX(): number;

  SetSizeInY(aSizeInY: number): void;

  SizeInY(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PointStyle: declare class StepVisual_PointStyle extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aMarker: StepVisual_MarkerSelect, aMarkerSize: StepBasic_SizeSelect, aMarkerColour: StepVisual_Colour): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetMarker(aMarker: StepVisual_MarkerSelect): void;

  Marker(): StepVisual_MarkerSelect;

  SetMarkerSize(aMarkerSize: StepBasic_SizeSelect): void;

  MarkerSize(): StepBasic_SizeSelect;

  SetMarkerColour(aMarkerColour: StepVisual_Colour): void;

  MarkerColour(): StepVisual_Colour;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PreDefinedColour: declare class StepVisual_PreDefinedColour extends StepVisual_Colour

  constructor

  SetPreDefinedItem(item: StepVisual_PreDefinedItem): void;

  GetPreDefinedItem(): StepVisual_PreDefinedItem;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PreDefinedCurveFont: declare class StepVisual_PreDefinedCurveFont extends StepVisual_PreDefinedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PreDefinedItem: declare class StepVisual_PreDefinedItem extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PreDefinedTextFont: declare class StepVisual_PreDefinedTextFont extends StepVisual_PreDefinedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationArea: declare class StepVisual_PresentationArea extends StepVisual_PresentationRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
