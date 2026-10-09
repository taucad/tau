# libcascade — StepVisual (2)

53 top-level symbols. Signatures are verbatim typescript.

StepVisual_DraughtingAnnotationOccurrence: declare class StepVisual_DraughtingAnnotationOccurrence extends StepVisual_AnnotationOccurrence

  // StepVisual_DraughtingAnnotationOccurrence.constructor (constructor)
  constructor();

  // StepVisual_DraughtingAnnotationOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_DraughtingAnnotationOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_DraughtingAnnotationOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_DraughtingAnnotationOccurrence.delete (method)
  delete(): void;

  // StepVisual_DraughtingAnnotationOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_DraughtingCallout: declare class StepVisual_DraughtingCallout extends StepGeom_GeometricRepresentationItem

  // StepVisual_DraughtingCallout.constructor (constructor)
  constructor();

  // StepVisual_DraughtingCallout.Init (method)
  Init(theName: TCollection_HAsciiString, theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_DraughtingCallout.Contents (method)
  Contents(): NCollection_HArray1_StepVisual_DraughtingCalloutElement;

  // StepVisual_DraughtingCallout.SetContents (method)
  SetContents(theContents: NCollection_HArray1_StepVisual_DraughtingCalloutElement): void;

  // StepVisual_DraughtingCallout.NbContents (method)
  NbContents(): number;

  // StepVisual_DraughtingCallout.ContentsValue (method)
  ContentsValue(theNum: number): StepVisual_DraughtingCalloutElement;

  // StepVisual_DraughtingCallout.SetContentsValue (method)
  SetContentsValue(theNum: number, theItem: StepVisual_DraughtingCalloutElement): void;

  // StepVisual_DraughtingCallout.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_DraughtingCallout.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_DraughtingCallout.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_DraughtingCallout.delete (method)
  delete(): void;

  // StepVisual_DraughtingCallout.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_DraughtingCalloutElement: declare class StepVisual_DraughtingCalloutElement extends StepData_SelectType

  // StepVisual_DraughtingCalloutElement.constructor (constructor)
  constructor();

  // StepVisual_DraughtingCalloutElement.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_DraughtingCalloutElement.AnnotationCurveOccurrence (method)
  AnnotationCurveOccurrence(): StepVisual_AnnotationCurveOccurrence;

  // StepVisual_DraughtingCalloutElement.AnnotationTextOccurrence (method)
  AnnotationTextOccurrence(): StepVisual_AnnotationTextOccurrence;

  // StepVisual_DraughtingCalloutElement.TessellatedAnnotationOccurrence (method)
  TessellatedAnnotationOccurrence(): StepVisual_TessellatedAnnotationOccurrence;

  // StepVisual_DraughtingCalloutElement.AnnotationFillAreaOccurrence (method)
  AnnotationFillAreaOccurrence(): StepVisual_AnnotationFillAreaOccurrence;

  // StepVisual_DraughtingCalloutElement.delete (method)
  delete(): void;

  // StepVisual_DraughtingCalloutElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_DraughtingModel: declare class StepVisual_DraughtingModel extends StepRepr_Representation

  // StepVisual_DraughtingModel.constructor (constructor)
  constructor();

  // StepVisual_DraughtingModel.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_DraughtingModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_DraughtingModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_DraughtingModel.delete (method)
  delete(): void;

  // StepVisual_DraughtingModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_DraughtingPreDefinedColour: declare class StepVisual_DraughtingPreDefinedColour extends StepVisual_PreDefinedColour

  // StepVisual_DraughtingPreDefinedColour.constructor (constructor)
  constructor();

  // StepVisual_DraughtingPreDefinedColour.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_DraughtingPreDefinedColour.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_DraughtingPreDefinedColour.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_DraughtingPreDefinedColour.delete (method)
  delete(): void;

  // StepVisual_DraughtingPreDefinedColour.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_DraughtingPreDefinedCurveFont: declare class StepVisual_DraughtingPreDefinedCurveFont extends StepVisual_PreDefinedCurveFont

  // StepVisual_DraughtingPreDefinedCurveFont.constructor (constructor)
  constructor();

  // StepVisual_DraughtingPreDefinedCurveFont.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_DraughtingPreDefinedCurveFont.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_DraughtingPreDefinedCurveFont.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_DraughtingPreDefinedCurveFont.delete (method)
  delete(): void;

  // StepVisual_DraughtingPreDefinedCurveFont.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_EdgeOrCurve: declare class StepVisual_EdgeOrCurve extends StepData_SelectType

  // StepVisual_EdgeOrCurve.constructor (constructor)
  constructor();

  // StepVisual_EdgeOrCurve.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_EdgeOrCurve.Curve (method)
  Curve(): StepGeom_Curve;

  // StepVisual_EdgeOrCurve.Edge (method)
  Edge(): StepShape_Edge;

  // StepVisual_EdgeOrCurve.delete (method)
  delete(): void;

  // StepVisual_EdgeOrCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ExternallyDefinedCurveFont: declare class StepVisual_ExternallyDefinedCurveFont extends StepBasic_ExternallyDefinedItem

  // StepVisual_ExternallyDefinedCurveFont.constructor (constructor)
  constructor();

  // StepVisual_ExternallyDefinedCurveFont.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ExternallyDefinedCurveFont.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ExternallyDefinedCurveFont.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ExternallyDefinedCurveFont.delete (method)
  delete(): void;

  // StepVisual_ExternallyDefinedCurveFont.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ExternallyDefinedTextFont: declare class StepVisual_ExternallyDefinedTextFont extends StepBasic_ExternallyDefinedItem

  // StepVisual_ExternallyDefinedTextFont.constructor (constructor)
  constructor();

  // StepVisual_ExternallyDefinedTextFont.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ExternallyDefinedTextFont.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ExternallyDefinedTextFont.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ExternallyDefinedTextFont.delete (method)
  delete(): void;

  // StepVisual_ExternallyDefinedTextFont.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_FaceOrSurface: declare class StepVisual_FaceOrSurface extends StepData_SelectType

  // StepVisual_FaceOrSurface.constructor (constructor)
  constructor();

  // StepVisual_FaceOrSurface.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_FaceOrSurface.Face (method)
  Face(): StepShape_Face;

  // StepVisual_FaceOrSurface.Surface (method)
  Surface(): StepGeom_Surface;

  // StepVisual_FaceOrSurface.delete (method)
  delete(): void;

  // StepVisual_FaceOrSurface.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_FillAreaStyle: declare class StepVisual_FillAreaStyle extends Standard_Transient

  // StepVisual_FillAreaStyle.constructor (constructor)
  constructor();

  // StepVisual_FillAreaStyle.Init (method)
  Init(aName: TCollection_HAsciiString, aFillStyles: NCollection_HArray1_StepVisual_FillStyleSelect): void;

  // StepVisual_FillAreaStyle.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_FillAreaStyle.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_FillAreaStyle.SetFillStyles (method)
  SetFillStyles(aFillStyles: NCollection_HArray1_StepVisual_FillStyleSelect): void;

  // StepVisual_FillAreaStyle.FillStyles (method)
  FillStyles(): NCollection_HArray1_StepVisual_FillStyleSelect;

  // StepVisual_FillAreaStyle.FillStylesValue (method)
  FillStylesValue(num: number): StepVisual_FillStyleSelect;

  // StepVisual_FillAreaStyle.NbFillStyles (method)
  NbFillStyles(): number;

  // StepVisual_FillAreaStyle.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_FillAreaStyle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_FillAreaStyle.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_FillAreaStyle.delete (method)
  delete(): void;

  // StepVisual_FillAreaStyle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_FillAreaStyleColour: declare class StepVisual_FillAreaStyleColour extends Standard_Transient

  // StepVisual_FillAreaStyleColour.constructor (constructor)
  constructor();

  // StepVisual_FillAreaStyleColour.Init (method)
  Init(aName: TCollection_HAsciiString, aFillColour: StepVisual_Colour): void;

  // StepVisual_FillAreaStyleColour.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_FillAreaStyleColour.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_FillAreaStyleColour.SetFillColour (method)
  SetFillColour(aFillColour: StepVisual_Colour): void;

  // StepVisual_FillAreaStyleColour.FillColour (method)
  FillColour(): StepVisual_Colour;

  // StepVisual_FillAreaStyleColour.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_FillAreaStyleColour.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_FillAreaStyleColour.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_FillAreaStyleColour.delete (method)
  delete(): void;

  // StepVisual_FillAreaStyleColour.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_FillStyleSelect: declare class StepVisual_FillStyleSelect extends StepData_SelectType

  // StepVisual_FillStyleSelect.constructor (constructor)
  constructor();

  // StepVisual_FillStyleSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_FillStyleSelect.FillAreaStyleColour (method)
  FillAreaStyleColour(): StepVisual_FillAreaStyleColour;

  // StepVisual_FillStyleSelect.delete (method)
  delete(): void;

  // StepVisual_FillStyleSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_FontSelect: declare class StepVisual_FontSelect extends StepData_SelectType

  // StepVisual_FontSelect.constructor (constructor)
  constructor();

  // StepVisual_FontSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_FontSelect.PreDefinedTextFont (method)
  PreDefinedTextFont(): StepVisual_PreDefinedTextFont;

  // StepVisual_FontSelect.ExternallyDefinedTextFont (method)
  ExternallyDefinedTextFont(): StepVisual_ExternallyDefinedTextFont;

  // StepVisual_FontSelect.delete (method)
  delete(): void;

  // StepVisual_FontSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_Invisibility: declare class StepVisual_Invisibility extends Standard_Transient

  // StepVisual_Invisibility.constructor (constructor)
  constructor();

  // StepVisual_Invisibility.Init (method)
  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

  // StepVisual_Invisibility.SetInvisibleItems (method)
  SetInvisibleItems(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

  // StepVisual_Invisibility.InvisibleItems (method)
  InvisibleItems(): NCollection_HArray1_StepVisual_InvisibleItem;

  // StepVisual_Invisibility.InvisibleItemsValue (method)
  InvisibleItemsValue(num: number): StepVisual_InvisibleItem;

  // StepVisual_Invisibility.NbInvisibleItems (method)
  NbInvisibleItems(): number;

  // StepVisual_Invisibility.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_Invisibility.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_Invisibility.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_Invisibility.delete (method)
  delete(): void;

  // StepVisual_Invisibility.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_InvisibilityContext: declare class StepVisual_InvisibilityContext extends StepData_SelectType

  // StepVisual_InvisibilityContext.constructor (constructor)
  constructor();

  // StepVisual_InvisibilityContext.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_InvisibilityContext.PresentationRepresentation (method)
  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  // StepVisual_InvisibilityContext.PresentationSet (method)
  PresentationSet(): StepVisual_PresentationSet;

  // StepVisual_InvisibilityContext.DraughtingModel (method)
  DraughtingModel(): StepVisual_DraughtingModel;

  // StepVisual_InvisibilityContext.delete (method)
  delete(): void;

  // StepVisual_InvisibilityContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_InvisibleItem: declare class StepVisual_InvisibleItem extends StepData_SelectType

  // StepVisual_InvisibleItem.constructor (constructor)
  constructor();

  // StepVisual_InvisibleItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_InvisibleItem.StyledItem (method)
  StyledItem(): StepVisual_StyledItem;

  // StepVisual_InvisibleItem.PresentationLayerAssignment (method)
  PresentationLayerAssignment(): StepVisual_PresentationLayerAssignment;

  // StepVisual_InvisibleItem.PresentationRepresentation (method)
  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  // StepVisual_InvisibleItem.delete (method)
  delete(): void;

  // StepVisual_InvisibleItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_LayeredItem: declare class StepVisual_LayeredItem extends StepData_SelectType

  // StepVisual_LayeredItem.constructor (constructor)
  constructor();

  // StepVisual_LayeredItem.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_LayeredItem.PresentationRepresentation (method)
  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  // StepVisual_LayeredItem.RepresentationItem (method)
  RepresentationItem(): StepRepr_RepresentationItem;

  // StepVisual_LayeredItem.delete (method)
  delete(): void;

  // StepVisual_LayeredItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_MarkerMember: declare class StepVisual_MarkerMember extends StepData_SelectInt

  // StepVisual_MarkerMember.constructor (constructor)
  constructor();

  // StepVisual_MarkerMember.HasName (method)
  HasName(): boolean;

  // StepVisual_MarkerMember.Name (method)
  Name(): string;

  // StepVisual_MarkerMember.SetName (method)
  SetName(name: string): boolean;

  // StepVisual_MarkerMember.EnumText (method)
  EnumText(): string;

  // StepVisual_MarkerMember.SetEnumText (method)
  SetEnumText(val: number, text: string): void;

  // StepVisual_MarkerMember.SetValue (method)
  SetValue(val: StepVisual_MarkerType): void;

  // StepVisual_MarkerMember.Value (method)
  Value(): StepVisual_MarkerType;

  // StepVisual_MarkerMember.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_MarkerMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_MarkerMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_MarkerMember.delete (method)
  delete(): void;

  // StepVisual_MarkerMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_MarkerSelect: declare class StepVisual_MarkerSelect extends StepData_SelectType

  // StepVisual_MarkerSelect.constructor (constructor)
  constructor();

  // StepVisual_MarkerSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_MarkerSelect.NewMember (method)
  NewMember(): StepData_SelectMember;

  // StepVisual_MarkerSelect.CaseMem (method)
  CaseMem(ent: StepData_SelectMember): number;

  // StepVisual_MarkerSelect.MarkerMember (method)
  MarkerMember(): StepVisual_MarkerMember;

  // StepVisual_MarkerSelect.delete (method)
  delete(): void;

  // StepVisual_MarkerSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_MarkerType: typeof StepVisual_MarkerType[keyof typeof StepVisual_MarkerType]

  readonly StepVisual_mtDot: 'StepVisual_mtDot'

  readonly StepVisual_mtX: 'StepVisual_mtX'

  readonly StepVisual_mtPlus: 'StepVisual_mtPlus'

  readonly StepVisual_mtAsterisk: 'StepVisual_mtAsterisk'

  readonly StepVisual_mtRing: 'StepVisual_mtRing'

  readonly StepVisual_mtSquare: 'StepVisual_mtSquare'

  readonly StepVisual_mtTriangle: 'StepVisual_mtTriangle'

StepVisual_MechanicalDesignGeometricPresentationArea: declare class StepVisual_MechanicalDesignGeometricPresentationArea extends StepVisual_PresentationArea

  // StepVisual_MechanicalDesignGeometricPresentationArea.constructor (constructor)
  constructor();

  // StepVisual_MechanicalDesignGeometricPresentationArea.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_MechanicalDesignGeometricPresentationArea.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_MechanicalDesignGeometricPresentationArea.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_MechanicalDesignGeometricPresentationArea.delete (method)
  delete(): void;

  // StepVisual_MechanicalDesignGeometricPresentationArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_MechanicalDesignGeometricPresentationRepresentation: declare class StepVisual_MechanicalDesignGeometricPresentationRepresentation extends StepVisual_PresentationRepresentation

  // StepVisual_MechanicalDesignGeometricPresentationRepresentation.constructor (constructor)
  constructor();

  // StepVisual_MechanicalDesignGeometricPresentationRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_MechanicalDesignGeometricPresentationRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_MechanicalDesignGeometricPresentationRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_MechanicalDesignGeometricPresentationRepresentation.delete (method)
  delete(): void;

  // StepVisual_MechanicalDesignGeometricPresentationRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_NullStyle: typeof StepVisual_NullStyle[keyof typeof StepVisual_NullStyle]

  readonly StepVisual_Null: 'StepVisual_Null'

StepVisual_NullStyleMember: declare class StepVisual_NullStyleMember extends StepData_SelectInt

  // StepVisual_NullStyleMember.constructor (constructor)
  constructor();

  // StepVisual_NullStyleMember.HasName (method)
  HasName(): boolean;

  // StepVisual_NullStyleMember.Name (method)
  Name(): string;

  // StepVisual_NullStyleMember.SetName (method)
  SetName(name: string): boolean;

  // StepVisual_NullStyleMember.Kind (method)
  Kind(): number;

  // StepVisual_NullStyleMember.EnumText (method)
  EnumText(): string;

  // StepVisual_NullStyleMember.SetEnumText (method)
  SetEnumText(val: number, text: string): void;

  // StepVisual_NullStyleMember.SetValue (method)
  SetValue(theValue: StepVisual_NullStyle): void;

  // StepVisual_NullStyleMember.Value (method)
  Value(): StepVisual_NullStyle;

  // StepVisual_NullStyleMember.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_NullStyleMember.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_NullStyleMember.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_NullStyleMember.delete (method)
  delete(): void;

  // StepVisual_NullStyleMember.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_OverRidingStyledItem: declare class StepVisual_OverRidingStyledItem extends StepVisual_StyledItem

  // StepVisual_OverRidingStyledItem.constructor (constructor)
  constructor();

  // StepVisual_OverRidingStyledItem.Init (method)
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_OverRidingStyledItem.SetOverRiddenStyle (method)
  SetOverRiddenStyle(aOverRiddenStyle: StepVisual_StyledItem): void;

  // StepVisual_OverRidingStyledItem.OverRiddenStyle (method)
  OverRiddenStyle(): StepVisual_StyledItem;

  // StepVisual_OverRidingStyledItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_OverRidingStyledItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_OverRidingStyledItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_OverRidingStyledItem.delete (method)
  delete(): void;

  // StepVisual_OverRidingStyledItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PathOrCompositeCurve: declare class StepVisual_PathOrCompositeCurve extends StepData_SelectType

  // StepVisual_PathOrCompositeCurve.constructor (constructor)
  constructor();

  // StepVisual_PathOrCompositeCurve.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_PathOrCompositeCurve.CompositeCurve (method)
  CompositeCurve(): StepGeom_CompositeCurve;

  // StepVisual_PathOrCompositeCurve.Path (method)
  Path(): StepShape_Path;

  // StepVisual_PathOrCompositeCurve.delete (method)
  delete(): void;

  // StepVisual_PathOrCompositeCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PlanarBox: declare class StepVisual_PlanarBox extends StepVisual_PlanarExtent

  // StepVisual_PlanarBox.constructor (constructor)
  constructor();

  // StepVisual_PlanarBox.Init (method)
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number, aPlacement: StepGeom_Axis2Placement): void;
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_PlanarBox.SetPlacement (method)
  SetPlacement(aPlacement: StepGeom_Axis2Placement): void;

  // StepVisual_PlanarBox.Placement (method)
  Placement(): StepGeom_Axis2Placement;

  // StepVisual_PlanarBox.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PlanarBox.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PlanarBox.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PlanarBox.delete (method)
  delete(): void;

  // StepVisual_PlanarBox.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PlanarExtent: declare class StepVisual_PlanarExtent extends StepGeom_GeometricRepresentationItem

  // StepVisual_PlanarExtent.constructor (constructor)
  constructor();

  // StepVisual_PlanarExtent.Init (method)
  Init(aName: TCollection_HAsciiString, aSizeInX: number, aSizeInY: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_PlanarExtent.SetSizeInX (method)
  SetSizeInX(aSizeInX: number): void;

  // StepVisual_PlanarExtent.SizeInX (method)
  SizeInX(): number;

  // StepVisual_PlanarExtent.SetSizeInY (method)
  SetSizeInY(aSizeInY: number): void;

  // StepVisual_PlanarExtent.SizeInY (method)
  SizeInY(): number;

  // StepVisual_PlanarExtent.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PlanarExtent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PlanarExtent.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PlanarExtent.delete (method)
  delete(): void;

  // StepVisual_PlanarExtent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PointStyle: declare class StepVisual_PointStyle extends Standard_Transient

  // StepVisual_PointStyle.constructor (constructor)
  constructor();

  // StepVisual_PointStyle.Init (method)
  Init(aName: TCollection_HAsciiString, aMarker: StepVisual_MarkerSelect, aMarkerSize: StepBasic_SizeSelect, aMarkerColour: StepVisual_Colour): void;

  // StepVisual_PointStyle.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_PointStyle.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_PointStyle.SetMarker (method)
  SetMarker(aMarker: StepVisual_MarkerSelect): void;

  // StepVisual_PointStyle.Marker (method)
  Marker(): StepVisual_MarkerSelect;

  // StepVisual_PointStyle.SetMarkerSize (method)
  SetMarkerSize(aMarkerSize: StepBasic_SizeSelect): void;

  // StepVisual_PointStyle.MarkerSize (method)
  MarkerSize(): StepBasic_SizeSelect;

  // StepVisual_PointStyle.SetMarkerColour (method)
  SetMarkerColour(aMarkerColour: StepVisual_Colour): void;

  // StepVisual_PointStyle.MarkerColour (method)
  MarkerColour(): StepVisual_Colour;

  // StepVisual_PointStyle.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PointStyle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PointStyle.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PointStyle.delete (method)
  delete(): void;

  // StepVisual_PointStyle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PreDefinedColour: declare class StepVisual_PreDefinedColour extends StepVisual_Colour

  // StepVisual_PreDefinedColour.constructor (constructor)
  constructor();

  // StepVisual_PreDefinedColour.SetPreDefinedItem (method)
  SetPreDefinedItem(item: StepVisual_PreDefinedItem): void;

  // StepVisual_PreDefinedColour.GetPreDefinedItem (method)
  GetPreDefinedItem(): StepVisual_PreDefinedItem;

  // StepVisual_PreDefinedColour.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PreDefinedColour.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PreDefinedColour.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PreDefinedColour.delete (method)
  delete(): void;

  // StepVisual_PreDefinedColour.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PreDefinedCurveFont: declare class StepVisual_PreDefinedCurveFont extends StepVisual_PreDefinedItem

  // StepVisual_PreDefinedCurveFont.constructor (constructor)
  constructor();

  // StepVisual_PreDefinedCurveFont.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PreDefinedCurveFont.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PreDefinedCurveFont.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PreDefinedCurveFont.delete (method)
  delete(): void;

  // StepVisual_PreDefinedCurveFont.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PreDefinedItem: declare class StepVisual_PreDefinedItem extends Standard_Transient

  // StepVisual_PreDefinedItem.constructor (constructor)
  constructor();

  // StepVisual_PreDefinedItem.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_PreDefinedItem.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_PreDefinedItem.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_PreDefinedItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PreDefinedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PreDefinedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PreDefinedItem.delete (method)
  delete(): void;

  // StepVisual_PreDefinedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PreDefinedTextFont: declare class StepVisual_PreDefinedTextFont extends StepVisual_PreDefinedItem

  // StepVisual_PreDefinedTextFont.constructor (constructor)
  constructor();

  // StepVisual_PreDefinedTextFont.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PreDefinedTextFont.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PreDefinedTextFont.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PreDefinedTextFont.delete (method)
  delete(): void;

  // StepVisual_PreDefinedTextFont.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationArea: declare class StepVisual_PresentationArea extends StepVisual_PresentationRepresentation

  // StepVisual_PresentationArea.constructor (constructor)
  constructor();

  // StepVisual_PresentationArea.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationArea.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationArea.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationArea.delete (method)
  delete(): void;

  // StepVisual_PresentationArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationLayerAssignment: declare class StepVisual_PresentationLayerAssignment extends Standard_Transient

  // StepVisual_PresentationLayerAssignment.constructor (constructor)
  constructor();

  // StepVisual_PresentationLayerAssignment.Init (method)
  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aAssignedItems: NCollection_HArray1_StepVisual_LayeredItem): void;

  // StepVisual_PresentationLayerAssignment.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_PresentationLayerAssignment.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_PresentationLayerAssignment.SetDescription (method)
  SetDescription(aDescription: TCollection_HAsciiString): void;

  // StepVisual_PresentationLayerAssignment.Description (method)
  Description(): TCollection_HAsciiString;

  // StepVisual_PresentationLayerAssignment.SetAssignedItems (method)
  SetAssignedItems(aAssignedItems: NCollection_HArray1_StepVisual_LayeredItem): void;

  // StepVisual_PresentationLayerAssignment.AssignedItems (method)
  AssignedItems(): NCollection_HArray1_StepVisual_LayeredItem;

  // StepVisual_PresentationLayerAssignment.AssignedItemsValue (method)
  AssignedItemsValue(num: number): StepVisual_LayeredItem;

  // StepVisual_PresentationLayerAssignment.NbAssignedItems (method)
  NbAssignedItems(): number;

  // StepVisual_PresentationLayerAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationLayerAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationLayerAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationLayerAssignment.delete (method)
  delete(): void;

  // StepVisual_PresentationLayerAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationLayerUsage: declare class StepVisual_PresentationLayerUsage extends Standard_Transient

  // StepVisual_PresentationLayerUsage.constructor (constructor)
  constructor();

  // StepVisual_PresentationLayerUsage.Init (method)
  Init(aAssignment: StepVisual_PresentationLayerAssignment, aPresentation: StepVisual_PresentationRepresentation): void;

  // StepVisual_PresentationLayerUsage.SetAssignment (method)
  SetAssignment(aAssignment: StepVisual_PresentationLayerAssignment): void;

  // StepVisual_PresentationLayerUsage.Assignment (method)
  Assignment(): StepVisual_PresentationLayerAssignment;

  // StepVisual_PresentationLayerUsage.SetPresentation (method)
  SetPresentation(aPresentation: StepVisual_PresentationRepresentation): void;

  // StepVisual_PresentationLayerUsage.Presentation (method)
  Presentation(): StepVisual_PresentationRepresentation;

  // StepVisual_PresentationLayerUsage.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationLayerUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationLayerUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationLayerUsage.delete (method)
  delete(): void;

  // StepVisual_PresentationLayerUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationRepresentation: declare class StepVisual_PresentationRepresentation extends StepRepr_Representation

  // StepVisual_PresentationRepresentation.constructor (constructor)
  constructor();

  // StepVisual_PresentationRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationRepresentation.delete (method)
  delete(): void;

  // StepVisual_PresentationRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationRepresentationSelect: declare class StepVisual_PresentationRepresentationSelect extends StepData_SelectType

  // StepVisual_PresentationRepresentationSelect.constructor (constructor)
  constructor();

  // StepVisual_PresentationRepresentationSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_PresentationRepresentationSelect.PresentationRepresentation (method)
  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  // StepVisual_PresentationRepresentationSelect.PresentationSet (method)
  PresentationSet(): StepVisual_PresentationSet;

  // StepVisual_PresentationRepresentationSelect.delete (method)
  delete(): void;

  // StepVisual_PresentationRepresentationSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationSet: declare class StepVisual_PresentationSet extends Standard_Transient

  // StepVisual_PresentationSet.constructor (constructor)
  constructor();

  // StepVisual_PresentationSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationSet.delete (method)
  delete(): void;

  // StepVisual_PresentationSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationSize: declare class StepVisual_PresentationSize extends Standard_Transient

  // StepVisual_PresentationSize.constructor (constructor)
  constructor();

  // StepVisual_PresentationSize.Init (method)
  Init(aUnit: StepVisual_PresentationSizeAssignmentSelect, aSize: StepVisual_PlanarBox): void;

  // StepVisual_PresentationSize.SetUnit (method)
  SetUnit(aUnit: StepVisual_PresentationSizeAssignmentSelect): void;

  // StepVisual_PresentationSize.Unit (method)
  Unit(): StepVisual_PresentationSizeAssignmentSelect;

  // StepVisual_PresentationSize.SetSize (method)
  SetSize(aSize: StepVisual_PlanarBox): void;

  // StepVisual_PresentationSize.Size (method)
  Size(): StepVisual_PlanarBox;

  // StepVisual_PresentationSize.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationSize.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationSize.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationSize.delete (method)
  delete(): void;

  // StepVisual_PresentationSize.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationSizeAssignmentSelect: declare class StepVisual_PresentationSizeAssignmentSelect extends StepData_SelectType

  // StepVisual_PresentationSizeAssignmentSelect.constructor (constructor)
  constructor();

  // StepVisual_PresentationSizeAssignmentSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_PresentationSizeAssignmentSelect.PresentationView (method)
  PresentationView(): StepVisual_PresentationView;

  // StepVisual_PresentationSizeAssignmentSelect.PresentationArea (method)
  PresentationArea(): StepVisual_PresentationArea;

  // StepVisual_PresentationSizeAssignmentSelect.AreaInSet (method)
  AreaInSet(): StepVisual_AreaInSet;

  // StepVisual_PresentationSizeAssignmentSelect.delete (method)
  delete(): void;

  // StepVisual_PresentationSizeAssignmentSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationStyleAssignment: declare class StepVisual_PresentationStyleAssignment extends Standard_Transient

  // StepVisual_PresentationStyleAssignment.constructor (constructor)
  constructor();

  // StepVisual_PresentationStyleAssignment.Init (method)
  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

  // StepVisual_PresentationStyleAssignment.SetStyles (method)
  SetStyles(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

  // StepVisual_PresentationStyleAssignment.Styles (method)
  Styles(): NCollection_HArray1_StepVisual_PresentationStyleSelect;

  // StepVisual_PresentationStyleAssignment.StylesValue (method)
  StylesValue(num: number): StepVisual_PresentationStyleSelect;

  // StepVisual_PresentationStyleAssignment.NbStyles (method)
  NbStyles(): number;

  // StepVisual_PresentationStyleAssignment.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationStyleAssignment.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationStyleAssignment.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationStyleAssignment.delete (method)
  delete(): void;

  // StepVisual_PresentationStyleAssignment.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationStyleByContext: declare class StepVisual_PresentationStyleByContext extends StepVisual_PresentationStyleAssignment

  // StepVisual_PresentationStyleByContext.constructor (constructor)
  constructor();

  // StepVisual_PresentationStyleByContext.Init (method)
  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect, aStyleContext: StepVisual_StyleContextSelect): void;
  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

  // StepVisual_PresentationStyleByContext.SetStyleContext (method)
  SetStyleContext(aStyleContext: StepVisual_StyleContextSelect): void;

  // StepVisual_PresentationStyleByContext.StyleContext (method)
  StyleContext(): StepVisual_StyleContextSelect;

  // StepVisual_PresentationStyleByContext.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationStyleByContext.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationStyleByContext.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationStyleByContext.delete (method)
  delete(): void;

  // StepVisual_PresentationStyleByContext.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationStyleSelect: declare class StepVisual_PresentationStyleSelect extends StepData_SelectType

  // StepVisual_PresentationStyleSelect.constructor (constructor)
  constructor();

  // StepVisual_PresentationStyleSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_PresentationStyleSelect.PointStyle (method)
  PointStyle(): StepVisual_PointStyle;

  // StepVisual_PresentationStyleSelect.CurveStyle (method)
  CurveStyle(): StepVisual_CurveStyle;

  // StepVisual_PresentationStyleSelect.NullStyle (method)
  NullStyle(): StepVisual_NullStyleMember;

  // StepVisual_PresentationStyleSelect.SurfaceStyleUsage (method)
  SurfaceStyleUsage(): StepVisual_SurfaceStyleUsage;

  // StepVisual_PresentationStyleSelect.delete (method)
  delete(): void;

  // StepVisual_PresentationStyleSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentationView: declare class StepVisual_PresentationView extends StepVisual_PresentationRepresentation

  // StepVisual_PresentationView.constructor (constructor)
  constructor();

  // StepVisual_PresentationView.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentationView.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentationView.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentationView.delete (method)
  delete(): void;

  // StepVisual_PresentationView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentedItem: declare class StepVisual_PresentedItem extends Standard_Transient

  // StepVisual_PresentedItem.constructor (constructor)
  constructor();

  // StepVisual_PresentedItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentedItem.delete (method)
  delete(): void;

  // StepVisual_PresentedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_PresentedItemRepresentation: declare class StepVisual_PresentedItemRepresentation extends Standard_Transient

  // StepVisual_PresentedItemRepresentation.constructor (constructor)
  constructor();

  // StepVisual_PresentedItemRepresentation.Init (method)
  Init(aPresentation: StepVisual_PresentationRepresentationSelect, aItem: StepVisual_PresentedItem): void;

  // StepVisual_PresentedItemRepresentation.SetPresentation (method)
  SetPresentation(aPresentation: StepVisual_PresentationRepresentationSelect): void;

  // StepVisual_PresentedItemRepresentation.Presentation (method)
  Presentation(): StepVisual_PresentationRepresentationSelect;

  // StepVisual_PresentedItemRepresentation.SetItem (method)
  SetItem(aItem: StepVisual_PresentedItem): void;

  // StepVisual_PresentedItemRepresentation.Item (method)
  Item(): StepVisual_PresentedItem;

  // StepVisual_PresentedItemRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_PresentedItemRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_PresentedItemRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_PresentedItemRepresentation.delete (method)
  delete(): void;

  // StepVisual_PresentedItemRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_RenderingPropertiesSelect: declare class StepVisual_RenderingPropertiesSelect extends StepData_SelectType

  // StepVisual_RenderingPropertiesSelect.constructor (constructor)
  constructor();

  // StepVisual_RenderingPropertiesSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_RenderingPropertiesSelect.SurfaceStyleReflectanceAmbient (method)
  SurfaceStyleReflectanceAmbient(): StepVisual_SurfaceStyleReflectanceAmbient;

  // StepVisual_RenderingPropertiesSelect.SurfaceStyleTransparent (method)
  SurfaceStyleTransparent(): StepVisual_SurfaceStyleTransparent;

  // StepVisual_RenderingPropertiesSelect.delete (method)
  delete(): void;

  // StepVisual_RenderingPropertiesSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_RepositionedTessellatedGeometricSet: declare class StepVisual_RepositionedTessellatedGeometricSet extends StepVisual_TessellatedGeometricSet

  // StepVisual_RepositionedTessellatedGeometricSet.constructor (constructor)
  constructor();

  // StepVisual_RepositionedTessellatedGeometricSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_RepositionedTessellatedGeometricSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_RepositionedTessellatedGeometricSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_RepositionedTessellatedGeometricSet.Init (method)
  Init(theName: TCollection_HAsciiString, theItems: any, theLocation: StepGeom_Axis2Placement3d): void;
  Init(theName: TCollection_HAsciiString, theItems: any): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_RepositionedTessellatedGeometricSet.Location (method)
  Location(): StepGeom_Axis2Placement3d;

  // StepVisual_RepositionedTessellatedGeometricSet.SetLocation (method)
  SetLocation(theLocation: StepGeom_Axis2Placement3d): void;

  // StepVisual_RepositionedTessellatedGeometricSet.delete (method)
  delete(): void;

  // StepVisual_RepositionedTessellatedGeometricSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_RepositionedTessellatedItem: declare class StepVisual_RepositionedTessellatedItem extends StepVisual_TessellatedItem

  // StepVisual_RepositionedTessellatedItem.constructor (constructor)
  constructor();

  // StepVisual_RepositionedTessellatedItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_RepositionedTessellatedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_RepositionedTessellatedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_RepositionedTessellatedItem.Init (method)
  Init(theName: TCollection_HAsciiString, theLocation: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_RepositionedTessellatedItem.Location (method)
  Location(): StepGeom_Axis2Placement3d;

  // StepVisual_RepositionedTessellatedItem.SetLocation (method)
  SetLocation(theLocation: StepGeom_Axis2Placement3d): void;

  // StepVisual_RepositionedTessellatedItem.delete (method)
  delete(): void;

  // StepVisual_RepositionedTessellatedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ShadingSurfaceMethod: typeof StepVisual_ShadingSurfaceMethod[keyof typeof StepVisual_ShadingSurfaceMethod]

  readonly StepVisual_ssmConstantShading: 'StepVisual_ssmConstantShading'

  readonly StepVisual_ssmColourShading: 'StepVisual_ssmColourShading'

  readonly StepVisual_ssmDotShading: 'StepVisual_ssmDotShading'

  readonly StepVisual_ssmNormalShading: 'StepVisual_ssmNormalShading'

StepVisual_StyleContextSelect: declare class StepVisual_StyleContextSelect extends StepData_SelectType

  // StepVisual_StyleContextSelect.constructor (constructor)
  constructor();

  // StepVisual_StyleContextSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_StyleContextSelect.Representation (method)
  Representation(): StepRepr_Representation;

  // StepVisual_StyleContextSelect.RepresentationItem (method)
  RepresentationItem(): StepRepr_RepresentationItem;

  // StepVisual_StyleContextSelect.PresentationSet (method)
  PresentationSet(): StepVisual_PresentationSet;

  // StepVisual_StyleContextSelect.delete (method)
  delete(): void;

  // StepVisual_StyleContextSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
