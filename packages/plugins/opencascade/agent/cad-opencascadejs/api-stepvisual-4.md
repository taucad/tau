# libcascade — StepVisual (4)

45 top-level symbols. Signatures are verbatim typescript.

StepVisual_TextLiteral: declare class StepVisual_TextLiteral extends StepGeom_GeometricRepresentationItem

  // StepVisual_TextLiteral.constructor (constructor)
  constructor();

  // StepVisual_TextLiteral.Init (method)
  Init(aName: TCollection_HAsciiString, aLiteral: TCollection_HAsciiString, aPlacement: StepGeom_Axis2Placement, aAlignment: TCollection_HAsciiString, aPath: StepVisual_TextPath, aFont: StepVisual_FontSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TextLiteral.SetLiteral (method)
  SetLiteral(aLiteral: TCollection_HAsciiString): void;

  // StepVisual_TextLiteral.Literal (method)
  Literal(): TCollection_HAsciiString;

  // StepVisual_TextLiteral.SetPlacement (method)
  SetPlacement(aPlacement: StepGeom_Axis2Placement): void;

  // StepVisual_TextLiteral.Placement (method)
  Placement(): StepGeom_Axis2Placement;

  // StepVisual_TextLiteral.SetAlignment (method)
  SetAlignment(aAlignment: TCollection_HAsciiString): void;

  // StepVisual_TextLiteral.Alignment (method)
  Alignment(): TCollection_HAsciiString;

  // StepVisual_TextLiteral.SetPath (method)
  SetPath(aPath: StepVisual_TextPath): void;

  // StepVisual_TextLiteral.Path (method)
  Path(): StepVisual_TextPath;

  // StepVisual_TextLiteral.SetFont (method)
  SetFont(aFont: StepVisual_FontSelect): void;

  // StepVisual_TextLiteral.Font (method)
  Font(): StepVisual_FontSelect;

  // StepVisual_TextLiteral.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TextLiteral.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TextLiteral.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TextLiteral.delete (method)
  delete(): void;

  // StepVisual_TextLiteral.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TextOrCharacter: declare class StepVisual_TextOrCharacter extends StepData_SelectType

  // StepVisual_TextOrCharacter.constructor (constructor)
  constructor();

  // StepVisual_TextOrCharacter.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_TextOrCharacter.AnnotationText (method)
  AnnotationText(): StepVisual_AnnotationText;

  // StepVisual_TextOrCharacter.CompositeText (method)
  CompositeText(): StepVisual_CompositeText;

  // StepVisual_TextOrCharacter.TextLiteral (method)
  TextLiteral(): StepVisual_TextLiteral;

  // StepVisual_TextOrCharacter.delete (method)
  delete(): void;

  // StepVisual_TextOrCharacter.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TextPath: typeof StepVisual_TextPath[keyof typeof StepVisual_TextPath]

  readonly StepVisual_tpUp: 'StepVisual_tpUp'

  readonly StepVisual_tpRight: 'StepVisual_tpRight'

  readonly StepVisual_tpDown: 'StepVisual_tpDown'

  readonly StepVisual_tpLeft: 'StepVisual_tpLeft'

StepVisual_TextStyle: declare class StepVisual_TextStyle extends Standard_Transient

  // StepVisual_TextStyle.constructor (constructor)
  constructor();

  // StepVisual_TextStyle.Init (method)
  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont): void;

  // StepVisual_TextStyle.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_TextStyle.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_TextStyle.SetCharacterAppearance (method)
  SetCharacterAppearance(aCharacterAppearance: StepVisual_TextStyleForDefinedFont): void;

  // StepVisual_TextStyle.CharacterAppearance (method)
  CharacterAppearance(): StepVisual_TextStyleForDefinedFont;

  // StepVisual_TextStyle.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TextStyle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TextStyle.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TextStyle.delete (method)
  delete(): void;

  // StepVisual_TextStyle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TextStyleForDefinedFont: declare class StepVisual_TextStyleForDefinedFont extends Standard_Transient

  // StepVisual_TextStyleForDefinedFont.constructor (constructor)
  constructor();

  // StepVisual_TextStyleForDefinedFont.Init (method)
  Init(aTextColour: StepVisual_Colour): void;

  // StepVisual_TextStyleForDefinedFont.SetTextColour (method)
  SetTextColour(aTextColour: StepVisual_Colour): void;

  // StepVisual_TextStyleForDefinedFont.TextColour (method)
  TextColour(): StepVisual_Colour;

  // StepVisual_TextStyleForDefinedFont.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TextStyleForDefinedFont.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TextStyleForDefinedFont.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TextStyleForDefinedFont.delete (method)
  delete(): void;

  // StepVisual_TextStyleForDefinedFont.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TextStyleWithBoxCharacteristics: declare class StepVisual_TextStyleWithBoxCharacteristics extends StepVisual_TextStyle

  // StepVisual_TextStyleWithBoxCharacteristics.constructor (constructor)
  constructor();

  // StepVisual_TextStyleWithBoxCharacteristics.Init (method)
  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont, aCharacteristics: NCollection_HArray1_StepVisual_BoxCharacteristicSelect): void;
  Init(aName: TCollection_HAsciiString, aCharacterAppearance: StepVisual_TextStyleForDefinedFont): void;

  // StepVisual_TextStyleWithBoxCharacteristics.SetCharacteristics (method)
  SetCharacteristics(aCharacteristics: NCollection_HArray1_StepVisual_BoxCharacteristicSelect): void;

  // StepVisual_TextStyleWithBoxCharacteristics.Characteristics (method)
  Characteristics(): NCollection_HArray1_StepVisual_BoxCharacteristicSelect;

  // StepVisual_TextStyleWithBoxCharacteristics.CharacteristicsValue (method)
  CharacteristicsValue(num: number): StepVisual_BoxCharacteristicSelect;

  // StepVisual_TextStyleWithBoxCharacteristics.NbCharacteristics (method)
  NbCharacteristics(): number;

  // StepVisual_TextStyleWithBoxCharacteristics.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TextStyleWithBoxCharacteristics.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TextStyleWithBoxCharacteristics.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TextStyleWithBoxCharacteristics.delete (method)
  delete(): void;

  // StepVisual_TextStyleWithBoxCharacteristics.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TriangulatedFace: declare class StepVisual_TriangulatedFace extends StepVisual_TessellatedFace

  // StepVisual_TriangulatedFace.constructor (constructor)
  constructor();

  // StepVisual_TriangulatedFace.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TriangulatedFace.Pnindex (method)
  Pnindex(): NCollection_HArray1_int;

  // StepVisual_TriangulatedFace.SetPnindex (method)
  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  // StepVisual_TriangulatedFace.NbPnindex (method)
  NbPnindex(): number;

  // StepVisual_TriangulatedFace.PnindexValue (method)
  PnindexValue(theNum: number): number;

  // StepVisual_TriangulatedFace.Triangles (method)
  Triangles(): NCollection_HArray2_int;

  // StepVisual_TriangulatedFace.SetTriangles (method)
  SetTriangles(theTriangles: NCollection_HArray2_int): void;

  // StepVisual_TriangulatedFace.NbTriangles (method)
  NbTriangles(): number;

  // StepVisual_TriangulatedFace.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TriangulatedFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TriangulatedFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TriangulatedFace.delete (method)
  delete(): void;

  // StepVisual_TriangulatedFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TriangulatedSurfaceSet: declare class StepVisual_TriangulatedSurfaceSet extends StepVisual_TessellatedSurfaceSet

  // StepVisual_TriangulatedSurfaceSet.constructor (constructor)
  constructor();

  // StepVisual_TriangulatedSurfaceSet.Init (method)
  Init(theRepresentationItemName: TCollection_HAsciiString, theTessellatedFaceCoordinates: StepVisual_CoordinatesList, theTessellatedFacePnmax: number, theTessellatedFaceNormals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TriangulatedSurfaceSet.Pnindex (method)
  Pnindex(): NCollection_HArray1_int;

  // StepVisual_TriangulatedSurfaceSet.SetPnindex (method)
  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  // StepVisual_TriangulatedSurfaceSet.NbPnindex (method)
  NbPnindex(): number;

  // StepVisual_TriangulatedSurfaceSet.PnindexValue (method)
  PnindexValue(theNum: number): number;

  // StepVisual_TriangulatedSurfaceSet.Triangles (method)
  Triangles(): NCollection_HArray2_int;

  // StepVisual_TriangulatedSurfaceSet.SetTriangles (method)
  SetTriangles(theTriangles: NCollection_HArray2_int): void;

  // StepVisual_TriangulatedSurfaceSet.NbTriangles (method)
  NbTriangles(): number;

  // StepVisual_TriangulatedSurfaceSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TriangulatedSurfaceSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TriangulatedSurfaceSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TriangulatedSurfaceSet.delete (method)
  delete(): void;

  // StepVisual_TriangulatedSurfaceSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ViewVolume: declare class StepVisual_ViewVolume extends Standard_Transient

  // StepVisual_ViewVolume.constructor (constructor)
  constructor();

  // StepVisual_ViewVolume.Init (method)
  Init(aProjectionType: StepVisual_CentralOrParallel, aProjectionPoint: StepGeom_CartesianPoint, aViewPlaneDistance: number, aFrontPlaneDistance: number, aFrontPlaneClipping: boolean, aBackPlaneDistance: number, aBackPlaneClipping: boolean, aViewVolumeSidesClipping: boolean, aViewWindow: StepVisual_PlanarBox): void;

  // StepVisual_ViewVolume.SetProjectionType (method)
  SetProjectionType(aProjectionType: StepVisual_CentralOrParallel): void;

  // StepVisual_ViewVolume.ProjectionType (method)
  ProjectionType(): StepVisual_CentralOrParallel;

  // StepVisual_ViewVolume.SetProjectionPoint (method)
  SetProjectionPoint(aProjectionPoint: StepGeom_CartesianPoint): void;

  // StepVisual_ViewVolume.ProjectionPoint (method)
  ProjectionPoint(): StepGeom_CartesianPoint;

  // StepVisual_ViewVolume.SetViewPlaneDistance (method)
  SetViewPlaneDistance(aViewPlaneDistance: number): void;

  // StepVisual_ViewVolume.ViewPlaneDistance (method)
  ViewPlaneDistance(): number;

  // StepVisual_ViewVolume.SetFrontPlaneDistance (method)
  SetFrontPlaneDistance(aFrontPlaneDistance: number): void;

  // StepVisual_ViewVolume.FrontPlaneDistance (method)
  FrontPlaneDistance(): number;

  // StepVisual_ViewVolume.SetFrontPlaneClipping (method)
  SetFrontPlaneClipping(aFrontPlaneClipping: boolean): void;

  // StepVisual_ViewVolume.FrontPlaneClipping (method)
  FrontPlaneClipping(): boolean;

  // StepVisual_ViewVolume.SetBackPlaneDistance (method)
  SetBackPlaneDistance(aBackPlaneDistance: number): void;

  // StepVisual_ViewVolume.BackPlaneDistance (method)
  BackPlaneDistance(): number;

  // StepVisual_ViewVolume.SetBackPlaneClipping (method)
  SetBackPlaneClipping(aBackPlaneClipping: boolean): void;

  // StepVisual_ViewVolume.BackPlaneClipping (method)
  BackPlaneClipping(): boolean;

  // StepVisual_ViewVolume.SetViewVolumeSidesClipping (method)
  SetViewVolumeSidesClipping(aViewVolumeSidesClipping: boolean): void;

  // StepVisual_ViewVolume.ViewVolumeSidesClipping (method)
  ViewVolumeSidesClipping(): boolean;

  // StepVisual_ViewVolume.SetViewWindow (method)
  SetViewWindow(aViewWindow: StepVisual_PlanarBox): void;

  // StepVisual_ViewVolume.ViewWindow (method)
  ViewWindow(): StepVisual_PlanarBox;

  // StepVisual_ViewVolume.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ViewVolume.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ViewVolume.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ViewVolume.delete (method)
  delete(): void;

  // StepVisual_ViewVolume.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_Array1OfAnnotationPlaneElement: NCollection_Array1_StepVisual_AnnotationPlaneElement

StepVisual_Array1OfBoxCharacteristicSelect: NCollection_Array1_StepVisual_BoxCharacteristicSelect

StepVisual_Array1OfCameraModelD3MultiClippingInterectionSelect: NCollection_Array1_StepVisual_CameraModelD3MultiClippingInterectionSelect

StepVisual_Array1OfCameraModelD3MultiClippingUnionSelect: NCollection_Array1_StepVisual_CameraModelD3MultiClippingUnionSelect

StepVisual_Array1OfCurveStyleFontPattern: NCollection_Array1_handle_StepVisual_CurveStyleFontPattern

StepVisual_Array1OfDirectionCountSelect: NCollection_Array1_StepVisual_DirectionCountSelect

StepVisual_Array1OfDraughtingCalloutElement: NCollection_Array1_StepVisual_DraughtingCalloutElement

StepVisual_Array1OfFillStyleSelect: NCollection_Array1_StepVisual_FillStyleSelect

StepVisual_Array1OfInvisibleItem: NCollection_Array1_StepVisual_InvisibleItem

StepVisual_Array1OfLayeredItem: NCollection_Array1_StepVisual_LayeredItem

StepVisual_Array1OfPresentationStyleAssignment: NCollection_Array1_handle_StepVisual_PresentationStyleAssignment

StepVisual_Array1OfPresentationStyleSelect: NCollection_Array1_StepVisual_PresentationStyleSelect

StepVisual_Array1OfRenderingPropertiesSelect: NCollection_Array1_StepVisual_RenderingPropertiesSelect

StepVisual_Array1OfStyleContextSelect: NCollection_Array1_StepVisual_StyleContextSelect

StepVisual_Array1OfSurfaceStyleElementSelect: NCollection_Array1_StepVisual_SurfaceStyleElementSelect

StepVisual_Array1OfTessellatedEdgeOrVertex: NCollection_Array1_StepVisual_TessellatedEdgeOrVertex

StepVisual_Array1OfTessellatedStructuredItem: NCollection_Array1_handle_StepVisual_TessellatedStructuredItem

StepVisual_Array1OfTextOrCharacter: NCollection_Array1_StepVisual_TextOrCharacter

StepVisual_HArray1OfAnnotationPlaneElement: NCollection_HArray1_StepVisual_AnnotationPlaneElement

StepVisual_HArray1OfBoxCharacteristicSelect: NCollection_HArray1_StepVisual_BoxCharacteristicSelect

StepVisual_HArray1OfCameraModelD3MultiClippingInterectionSelect: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect

StepVisual_HArray1OfCameraModelD3MultiClippingUnionSelect: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect

StepVisual_HArray1OfCurveStyleFontPattern: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern

StepVisual_HArray1OfDirectionCountSelect: NCollection_HArray1_StepVisual_DirectionCountSelect

StepVisual_HArray1OfDraughtingCalloutElement: NCollection_HArray1_StepVisual_DraughtingCalloutElement

StepVisual_HArray1OfFillStyleSelect: NCollection_HArray1_StepVisual_FillStyleSelect

StepVisual_HArray1OfInvisibleItem: NCollection_HArray1_StepVisual_InvisibleItem

StepVisual_HArray1OfLayeredItem: NCollection_HArray1_StepVisual_LayeredItem

StepVisual_HArray1OfPresentationStyleAssignment: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment

StepVisual_HArray1OfPresentationStyleSelect: NCollection_HArray1_StepVisual_PresentationStyleSelect

StepVisual_HArray1OfRenderingPropertiesSelect: NCollection_HArray1_StepVisual_RenderingPropertiesSelect

StepVisual_HArray1OfStyleContextSelect: NCollection_HArray1_StepVisual_StyleContextSelect

StepVisual_HArray1OfSurfaceStyleElementSelect: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect

StepVisual_HArray1OfTessellatedEdgeOrVertex: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex

StepVisual_HArray1OfTessellatedStructuredItem: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem

StepVisual_HArray1OfTextOrCharacter: NCollection_HArray1_StepVisual_TextOrCharacter
