# libcascade — StepVisual

35 top-level symbols. Signatures are verbatim typescript.

StepVisual_AnnotationCurveOccurrence: declare class StepVisual_AnnotationCurveOccurrence extends StepVisual_AnnotationOccurrence

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationCurveOccurrenceAndGeomReprItem: declare class StepVisual_AnnotationCurveOccurrenceAndGeomReprItem extends StepVisual_AnnotationCurveOccurrence

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationFillArea: declare class StepVisual_AnnotationFillArea extends StepShape_GeometricCurveSet

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationFillAreaOccurrence: declare class StepVisual_AnnotationFillAreaOccurrence extends StepVisual_AnnotationOccurrence

  constructor

  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theFillStyleTarget: StepGeom_GeometricRepresentationItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theFillStyleTarget: StepGeom_GeometricRepresentationItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theFillStyleTarget: StepGeom_GeometricRepresentationItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  FillStyleTarget(): StepGeom_GeometricRepresentationItem;

  SetFillStyleTarget(theTarget: StepGeom_GeometricRepresentationItem): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationOccurrence: declare class StepVisual_AnnotationOccurrence extends StepVisual_StyledItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationPlane: declare class StepVisual_AnnotationPlane extends StepVisual_AnnotationOccurrence

  constructor

  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theElements: NCollection_HArray1_StepVisual_AnnotationPlaneElement): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theElements: NCollection_HArray1_StepVisual_AnnotationPlaneElement): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theElements: NCollection_HArray1_StepVisual_AnnotationPlaneElement): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  Elements(): NCollection_HArray1_StepVisual_AnnotationPlaneElement;

  SetElements(theElements: NCollection_HArray1_StepVisual_AnnotationPlaneElement): void;

  NbElements(): number;

  ElementsValue(theNum: number): StepVisual_AnnotationPlaneElement;

  SetElementsValue(theNum: number, theItem: StepVisual_AnnotationPlaneElement): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationPlaneElement: declare class StepVisual_AnnotationPlaneElement extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  DraughtingCallout(): StepVisual_DraughtingCallout;

  StyledItem(): StepVisual_StyledItem;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationText: declare class StepVisual_AnnotationText extends StepRepr_MappedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AnnotationTextOccurrence: declare class StepVisual_AnnotationTextOccurrence extends StepVisual_AnnotationOccurrence

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AreaInSet: declare class StepVisual_AreaInSet extends Standard_Transient

  constructor

  Init(aArea: StepVisual_PresentationArea, aInSet: StepVisual_PresentationSet): void;

  SetArea(aArea: StepVisual_PresentationArea): void;

  Area(): StepVisual_PresentationArea;

  SetInSet(aInSet: StepVisual_PresentationSet): void;

  InSet(): StepVisual_PresentationSet;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_AreaOrView: declare class StepVisual_AreaOrView extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  PresentationArea(): StepVisual_PresentationArea;

  PresentationView(): StepVisual_PresentationView;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_BackgroundColour: declare class StepVisual_BackgroundColour extends StepVisual_Colour

  constructor

  Init(aPresentation: StepVisual_AreaOrView): void;

  SetPresentation(aPresentation: StepVisual_AreaOrView): void;

  Presentation(): StepVisual_AreaOrView;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_BoxCharacteristicSelect: declare class StepVisual_BoxCharacteristicSelect

  constructor

  TypeOfContent(): number;

  SetTypeOfContent(aType: number): void;

  RealValue(): number;

  SetRealValue(aValue: number): void;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraImage: declare class StepVisual_CameraImage extends StepRepr_MappedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraImage2dWithScale: declare class StepVisual_CameraImage2dWithScale extends StepVisual_CameraImage

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraImage3dWithScale: declare class StepVisual_CameraImage3dWithScale extends StepVisual_CameraImage

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModel: declare class StepVisual_CameraModel extends StepGeom_GeometricRepresentationItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModelD2: declare class StepVisual_CameraModelD2 extends StepVisual_CameraModel

  constructor

  Init(aName: TCollection_HAsciiString, aViewWindow: StepVisual_PlanarBox, aViewWindowClipping: boolean): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aViewWindow: StepVisual_PlanarBox, aViewWindowClipping: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  SetViewWindow(aViewWindow: StepVisual_PlanarBox): void;

  ViewWindow(): StepVisual_PlanarBox;

  SetViewWindowClipping(aViewWindowClipping: boolean): void;

  ViewWindowClipping(): boolean;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModelD3: declare class StepVisual_CameraModelD3 extends StepVisual_CameraModel

  constructor

  Init(aName: TCollection_HAsciiString, aViewReferenceSystem: StepGeom_Axis2Placement3d, aPerspectiveOfVolume: StepVisual_ViewVolume): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aViewReferenceSystem: StepGeom_Axis2Placement3d, aPerspectiveOfVolume: StepVisual_ViewVolume): void;
  Init(aName: TCollection_HAsciiString): void;

  SetViewReferenceSystem(aViewReferenceSystem: StepGeom_Axis2Placement3d): void;

  ViewReferenceSystem(): StepGeom_Axis2Placement3d;

  SetPerspectiveOfVolume(aPerspectiveOfVolume: StepVisual_ViewVolume): void;

  PerspectiveOfVolume(): StepVisual_ViewVolume;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClipping: declare class StepVisual_CameraModelD3MultiClipping extends StepVisual_CameraModelD3

  constructor

  Init(theName: TCollection_HAsciiString, theViewReferenceSystem: StepGeom_Axis2Placement3d, thePerspectiveOfVolume: StepVisual_ViewVolume, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;
  Init(aName: TCollection_HAsciiString, aViewReferenceSystem: StepGeom_Axis2Placement3d, aPerspectiveOfVolume: StepVisual_ViewVolume): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theViewReferenceSystem: StepGeom_Axis2Placement3d, thePerspectiveOfVolume: StepVisual_ViewVolume, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;
  Init(aName: TCollection_HAsciiString, aViewReferenceSystem: StepGeom_Axis2Placement3d, aPerspectiveOfVolume: StepVisual_ViewVolume): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theViewReferenceSystem: StepGeom_Axis2Placement3d, thePerspectiveOfVolume: StepVisual_ViewVolume, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;
  Init(aName: TCollection_HAsciiString, aViewReferenceSystem: StepGeom_Axis2Placement3d, aPerspectiveOfVolume: StepVisual_ViewVolume): void;
  Init(aName: TCollection_HAsciiString): void;

  SetShapeClipping(theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;

  ShapeClipping(): NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingInterectionSelect: declare class StepVisual_CameraModelD3MultiClippingInterectionSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Plane(): StepGeom_Plane;

  CameraModelD3MultiClippingUnion(): StepVisual_CameraModelD3MultiClippingUnion;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingIntersection: declare class StepVisual_CameraModelD3MultiClippingIntersection extends StepGeom_GeometricRepresentationItem

  constructor

  Init(theName: TCollection_HAsciiString, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  SetShapeClipping(theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;

  ShapeClipping(): NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingUnion: declare class StepVisual_CameraModelD3MultiClippingUnion extends StepGeom_GeometricRepresentationItem

  constructor

  Init(theName: TCollection_HAsciiString, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  SetShapeClipping(theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect): void;

  ShapeClipping(): NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingUnionSelect: declare class StepVisual_CameraModelD3MultiClippingUnionSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Plane(): StepGeom_Plane;

  CameraModelD3MultiClippingIntersection(): StepVisual_CameraModelD3MultiClippingIntersection;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CameraUsage: declare class StepVisual_CameraUsage extends StepRepr_RepresentationMap

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CentralOrParallel: typeof StepVisual_CentralOrParallel[keyof typeof StepVisual_CentralOrParallel]

StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel: declare class StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel extends StepVisual_DraughtingModel

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_Colour: declare class StepVisual_Colour extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ColourRgb: declare class StepVisual_ColourRgb extends StepVisual_ColourSpecification

  constructor

  Init(aName: TCollection_HAsciiString, aRed: number, aGreen: number, aBlue: number): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aRed: number, aGreen: number, aBlue: number): void;
  Init(aName: TCollection_HAsciiString): void;

  SetRed(aRed: number): void;

  Red(): number;

  SetGreen(aGreen: number): void;

  Green(): number;

  SetBlue(aBlue: number): void;

  Blue(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ColourSpecification: declare class StepVisual_ColourSpecification extends StepVisual_Colour

  constructor

  Init(aName: TCollection_HAsciiString): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ComplexTriangulatedFace: declare class StepVisual_ComplexTriangulatedFace extends StepVisual_TessellatedFace

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  Pnindex(): NCollection_HArray1_int;

  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  NbPnindex(): number;

  PnindexValue(theNum: number): number;

  TriangleStrips(): NCollection_HArray1_handle_Standard_Transient;

  SetTriangleStrips(theTriangleStrips: NCollection_HArray1_handle_Standard_Transient): void;

  NbTriangleStrips(): number;

  TriangleFans(): NCollection_HArray1_handle_Standard_Transient;

  SetTriangleFans(theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;

  NbTriangleFans(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ComplexTriangulatedSurfaceSet: declare class StepVisual_ComplexTriangulatedSurfaceSet extends StepVisual_TessellatedSurfaceSet

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedSurfaceSet_Coordinates: StepVisual_CoordinatesList, theTessellatedSurfaceSet_Pnmax: number, theTessellatedSurfaceSet_Normals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedSurfaceSet_Coordinates: StepVisual_CoordinatesList, theTessellatedSurfaceSet_Pnmax: number, theTessellatedSurfaceSet_Normals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedSurfaceSet_Coordinates: StepVisual_CoordinatesList, theTessellatedSurfaceSet_Pnmax: number, theTessellatedSurfaceSet_Normals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;

  Pnindex(): NCollection_HArray1_int;

  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  NbPnindex(): number;

  PnindexValue(theNum: number): number;

  TriangleStrips(): NCollection_HArray1_handle_Standard_Transient;

  SetTriangleStrips(theTriangleStrips: NCollection_HArray1_handle_Standard_Transient): void;

  NbTriangleStrips(): number;

  TriangleFans(): NCollection_HArray1_handle_Standard_Transient;

  SetTriangleFans(theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;

  NbTriangleFans(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CompositeText: declare class StepVisual_CompositeText extends StepGeom_GeometricRepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
  Init(aName: TCollection_HAsciiString): void;

  SetCollectedText(aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;

  CollectedText(): NCollection_HArray1_StepVisual_TextOrCharacter;

  CollectedTextValue(num: number): StepVisual_TextOrCharacter;

  NbCollectedText(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_CompositeTextWithExtent: declare class StepVisual_CompositeTextWithExtent extends StepVisual_CompositeText

  constructor

  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter, aExtent: StepVisual_PlanarExtent): void;
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter, aExtent: StepVisual_PlanarExtent): void;
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter, aExtent: StepVisual_PlanarExtent): void;
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
  Init(aName: TCollection_HAsciiString): void;

  SetExtent(aExtent: StepVisual_PlanarExtent): void;

  Extent(): StepVisual_PlanarExtent;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ContextDependentInvisibility: declare class StepVisual_ContextDependentInvisibility extends StepVisual_Invisibility

  constructor

  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem, aPresentationContext: StepVisual_InvisibilityContext): void;
  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;
  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem, aPresentationContext: StepVisual_InvisibilityContext): void;
  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

  SetPresentationContext(aPresentationContext: StepVisual_InvisibilityContext): void;

  PresentationContext(): StepVisual_InvisibilityContext;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
