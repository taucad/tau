# libcascade — StepVisual

44 top-level symbols. Signatures are verbatim typescript.

StepVisual_AnnotationCurveOccurrence: declare class StepVisual_AnnotationCurveOccurrence extends StepVisual_AnnotationOccurrence

  // StepVisual_AnnotationCurveOccurrence.constructor (constructor)
  constructor();

  // StepVisual_AnnotationCurveOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationCurveOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationCurveOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationCurveOccurrence.delete (method)
  delete(): void;

  // StepVisual_AnnotationCurveOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationCurveOccurrenceAndGeomReprItem: declare class StepVisual_AnnotationCurveOccurrenceAndGeomReprItem extends StepVisual_AnnotationCurveOccurrence

  // StepVisual_AnnotationCurveOccurrenceAndGeomReprItem.constructor (constructor)
  constructor();

  // StepVisual_AnnotationCurveOccurrenceAndGeomReprItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationCurveOccurrenceAndGeomReprItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationCurveOccurrenceAndGeomReprItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationCurveOccurrenceAndGeomReprItem.delete (method)
  delete(): void;

  // StepVisual_AnnotationCurveOccurrenceAndGeomReprItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationFillArea: declare class StepVisual_AnnotationFillArea extends StepShape_GeometricCurveSet

  // StepVisual_AnnotationFillArea.constructor (constructor)
  constructor();

  // StepVisual_AnnotationFillArea.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationFillArea.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationFillArea.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationFillArea.delete (method)
  delete(): void;

  // StepVisual_AnnotationFillArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationFillAreaOccurrence: declare class StepVisual_AnnotationFillAreaOccurrence extends StepVisual_AnnotationOccurrence

  // StepVisual_AnnotationFillAreaOccurrence.constructor (constructor)
  constructor();

  // StepVisual_AnnotationFillAreaOccurrence.Init (method)
  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theFillStyleTarget: StepGeom_GeometricRepresentationItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_AnnotationFillAreaOccurrence.FillStyleTarget (method)
  FillStyleTarget(): StepGeom_GeometricRepresentationItem;

  // StepVisual_AnnotationFillAreaOccurrence.SetFillStyleTarget (method)
  SetFillStyleTarget(theTarget: StepGeom_GeometricRepresentationItem): void;

  // StepVisual_AnnotationFillAreaOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationFillAreaOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationFillAreaOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationFillAreaOccurrence.delete (method)
  delete(): void;

  // StepVisual_AnnotationFillAreaOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationOccurrence: declare class StepVisual_AnnotationOccurrence extends StepVisual_StyledItem

  // StepVisual_AnnotationOccurrence.constructor (constructor)
  constructor();

  // StepVisual_AnnotationOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationOccurrence.delete (method)
  delete(): void;

  // StepVisual_AnnotationOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationPlane: declare class StepVisual_AnnotationPlane extends StepVisual_AnnotationOccurrence

  // StepVisual_AnnotationPlane.constructor (constructor)
  constructor();

  // StepVisual_AnnotationPlane.Init (method)
  Init(theName: TCollection_HAsciiString, theStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, theItem: Standard_Transient, theElements: NCollection_HArray1_StepVisual_AnnotationPlaneElement): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_AnnotationPlane.Elements (method)
  Elements(): NCollection_HArray1_StepVisual_AnnotationPlaneElement;

  // StepVisual_AnnotationPlane.SetElements (method)
  SetElements(theElements: NCollection_HArray1_StepVisual_AnnotationPlaneElement): void;

  // StepVisual_AnnotationPlane.NbElements (method)
  NbElements(): number;

  // StepVisual_AnnotationPlane.ElementsValue (method)
  ElementsValue(theNum: number): StepVisual_AnnotationPlaneElement;

  // StepVisual_AnnotationPlane.SetElementsValue (method)
  SetElementsValue(theNum: number, theItem: StepVisual_AnnotationPlaneElement): void;

  // StepVisual_AnnotationPlane.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationPlane.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationPlane.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationPlane.delete (method)
  delete(): void;

  // StepVisual_AnnotationPlane.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationPlaneElement: declare class StepVisual_AnnotationPlaneElement extends StepData_SelectType

  // StepVisual_AnnotationPlaneElement.constructor (constructor)
  constructor();

  // StepVisual_AnnotationPlaneElement.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_AnnotationPlaneElement.DraughtingCallout (method)
  DraughtingCallout(): StepVisual_DraughtingCallout;

  // StepVisual_AnnotationPlaneElement.StyledItem (method)
  StyledItem(): StepVisual_StyledItem;

  // StepVisual_AnnotationPlaneElement.delete (method)
  delete(): void;

  // StepVisual_AnnotationPlaneElement.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationText: declare class StepVisual_AnnotationText extends StepRepr_MappedItem

  // StepVisual_AnnotationText.constructor (constructor)
  constructor();

  // StepVisual_AnnotationText.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationText.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationText.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationText.delete (method)
  delete(): void;

  // StepVisual_AnnotationText.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AnnotationTextOccurrence: declare class StepVisual_AnnotationTextOccurrence extends StepVisual_AnnotationOccurrence

  // StepVisual_AnnotationTextOccurrence.constructor (constructor)
  constructor();

  // StepVisual_AnnotationTextOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AnnotationTextOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AnnotationTextOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AnnotationTextOccurrence.delete (method)
  delete(): void;

  // StepVisual_AnnotationTextOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AreaInSet: declare class StepVisual_AreaInSet extends Standard_Transient

  // StepVisual_AreaInSet.constructor (constructor)
  constructor();

  // StepVisual_AreaInSet.Init (method)
  Init(aArea: StepVisual_PresentationArea, aInSet: StepVisual_PresentationSet): void;

  // StepVisual_AreaInSet.SetArea (method)
  SetArea(aArea: StepVisual_PresentationArea): void;

  // StepVisual_AreaInSet.Area (method)
  Area(): StepVisual_PresentationArea;

  // StepVisual_AreaInSet.SetInSet (method)
  SetInSet(aInSet: StepVisual_PresentationSet): void;

  // StepVisual_AreaInSet.InSet (method)
  InSet(): StepVisual_PresentationSet;

  // StepVisual_AreaInSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_AreaInSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_AreaInSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_AreaInSet.delete (method)
  delete(): void;

  // StepVisual_AreaInSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_AreaOrView: declare class StepVisual_AreaOrView extends StepData_SelectType

  // StepVisual_AreaOrView.constructor (constructor)
  constructor();

  // StepVisual_AreaOrView.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_AreaOrView.PresentationArea (method)
  PresentationArea(): StepVisual_PresentationArea;

  // StepVisual_AreaOrView.PresentationView (method)
  PresentationView(): StepVisual_PresentationView;

  // StepVisual_AreaOrView.delete (method)
  delete(): void;

  // StepVisual_AreaOrView.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_BackgroundColour: declare class StepVisual_BackgroundColour extends StepVisual_Colour

  // StepVisual_BackgroundColour.constructor (constructor)
  constructor();

  // StepVisual_BackgroundColour.Init (method)
  Init(aPresentation: StepVisual_AreaOrView): void;

  // StepVisual_BackgroundColour.SetPresentation (method)
  SetPresentation(aPresentation: StepVisual_AreaOrView): void;

  // StepVisual_BackgroundColour.Presentation (method)
  Presentation(): StepVisual_AreaOrView;

  // StepVisual_BackgroundColour.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_BackgroundColour.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_BackgroundColour.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_BackgroundColour.delete (method)
  delete(): void;

  // StepVisual_BackgroundColour.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_BoxCharacteristicSelect: declare class StepVisual_BoxCharacteristicSelect

  // StepVisual_BoxCharacteristicSelect.constructor (constructor)
  constructor();

  // StepVisual_BoxCharacteristicSelect.TypeOfContent (method)
  TypeOfContent(): number;

  // StepVisual_BoxCharacteristicSelect.SetTypeOfContent (method)
  SetTypeOfContent(aType: number): void;

  // StepVisual_BoxCharacteristicSelect.RealValue (method)
  RealValue(): number;

  // StepVisual_BoxCharacteristicSelect.SetRealValue (method)
  SetRealValue(aValue: number): void;

  // StepVisual_BoxCharacteristicSelect.delete (method)
  delete(): void;

  // StepVisual_BoxCharacteristicSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraImage: declare class StepVisual_CameraImage extends StepRepr_MappedItem

  // StepVisual_CameraImage.constructor (constructor)
  constructor();

  // StepVisual_CameraImage.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraImage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraImage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraImage.delete (method)
  delete(): void;

  // StepVisual_CameraImage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraImage2dWithScale: declare class StepVisual_CameraImage2dWithScale extends StepVisual_CameraImage

  // StepVisual_CameraImage2dWithScale.constructor (constructor)
  constructor();

  // StepVisual_CameraImage2dWithScale.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraImage2dWithScale.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraImage2dWithScale.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraImage2dWithScale.delete (method)
  delete(): void;

  // StepVisual_CameraImage2dWithScale.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraImage3dWithScale: declare class StepVisual_CameraImage3dWithScale extends StepVisual_CameraImage

  // StepVisual_CameraImage3dWithScale.constructor (constructor)
  constructor();

  // StepVisual_CameraImage3dWithScale.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraImage3dWithScale.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraImage3dWithScale.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraImage3dWithScale.delete (method)
  delete(): void;

  // StepVisual_CameraImage3dWithScale.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModel: declare class StepVisual_CameraModel extends StepGeom_GeometricRepresentationItem

  // StepVisual_CameraModel.constructor (constructor)
  constructor();

  // StepVisual_CameraModel.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraModel.delete (method)
  delete(): void;

  // StepVisual_CameraModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModelD2: declare class StepVisual_CameraModelD2 extends StepVisual_CameraModel

  // StepVisual_CameraModelD2.constructor (constructor)
  constructor();

  // StepVisual_CameraModelD2.Init (method)
  Init(aName: TCollection_HAsciiString, aViewWindow: StepVisual_PlanarBox, aViewWindowClipping: boolean): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CameraModelD2.SetViewWindow (method)
  SetViewWindow(aViewWindow: StepVisual_PlanarBox): void;

  // StepVisual_CameraModelD2.ViewWindow (method)
  ViewWindow(): StepVisual_PlanarBox;

  // StepVisual_CameraModelD2.SetViewWindowClipping (method)
  SetViewWindowClipping(aViewWindowClipping: boolean): void;

  // StepVisual_CameraModelD2.ViewWindowClipping (method)
  ViewWindowClipping(): boolean;

  // StepVisual_CameraModelD2.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraModelD2.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraModelD2.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraModelD2.delete (method)
  delete(): void;

  // StepVisual_CameraModelD2.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModelD3: declare class StepVisual_CameraModelD3 extends StepVisual_CameraModel

  // StepVisual_CameraModelD3.constructor (constructor)
  constructor();

  // StepVisual_CameraModelD3.Init (method)
  Init(aName: TCollection_HAsciiString, aViewReferenceSystem: StepGeom_Axis2Placement3d, aPerspectiveOfVolume: StepVisual_ViewVolume): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CameraModelD3.SetViewReferenceSystem (method)
  SetViewReferenceSystem(aViewReferenceSystem: StepGeom_Axis2Placement3d): void;

  // StepVisual_CameraModelD3.ViewReferenceSystem (method)
  ViewReferenceSystem(): StepGeom_Axis2Placement3d;

  // StepVisual_CameraModelD3.SetPerspectiveOfVolume (method)
  SetPerspectiveOfVolume(aPerspectiveOfVolume: StepVisual_ViewVolume): void;

  // StepVisual_CameraModelD3.PerspectiveOfVolume (method)
  PerspectiveOfVolume(): StepVisual_ViewVolume;

  // StepVisual_CameraModelD3.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraModelD3.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraModelD3.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraModelD3.delete (method)
  delete(): void;

  // StepVisual_CameraModelD3.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClipping: declare class StepVisual_CameraModelD3MultiClipping extends StepVisual_CameraModelD3

  // StepVisual_CameraModelD3MultiClipping.constructor (constructor)
  constructor();

  // StepVisual_CameraModelD3MultiClipping.Init (method)
  Init(theName: TCollection_HAsciiString, theViewReferenceSystem: StepGeom_Axis2Placement3d, thePerspectiveOfVolume: StepVisual_ViewVolume, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;
  Init(aName: TCollection_HAsciiString, aViewReferenceSystem: StepGeom_Axis2Placement3d, aPerspectiveOfVolume: StepVisual_ViewVolume): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CameraModelD3MultiClipping.SetShapeClipping (method)
  SetShapeClipping(theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;

  // StepVisual_CameraModelD3MultiClipping.ShapeClipping (method)
  ShapeClipping(): NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect;

  // StepVisual_CameraModelD3MultiClipping.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraModelD3MultiClipping.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraModelD3MultiClipping.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraModelD3MultiClipping.delete (method)
  delete(): void;

  // StepVisual_CameraModelD3MultiClipping.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingInterectionSelect: declare class StepVisual_CameraModelD3MultiClippingInterectionSelect extends StepData_SelectType

  // StepVisual_CameraModelD3MultiClippingInterectionSelect.constructor (constructor)
  constructor();

  // StepVisual_CameraModelD3MultiClippingInterectionSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_CameraModelD3MultiClippingInterectionSelect.Plane (method)
  Plane(): StepGeom_Plane;

  // StepVisual_CameraModelD3MultiClippingInterectionSelect.CameraModelD3MultiClippingUnion (method)
  CameraModelD3MultiClippingUnion(): StepVisual_CameraModelD3MultiClippingUnion;

  // StepVisual_CameraModelD3MultiClippingInterectionSelect.delete (method)
  delete(): void;

  // StepVisual_CameraModelD3MultiClippingInterectionSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingIntersection: declare class StepVisual_CameraModelD3MultiClippingIntersection extends StepGeom_GeometricRepresentationItem

  // StepVisual_CameraModelD3MultiClippingIntersection.constructor (constructor)
  constructor();

  // StepVisual_CameraModelD3MultiClippingIntersection.Init (method)
  Init(theName: TCollection_HAsciiString, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CameraModelD3MultiClippingIntersection.SetShapeClipping (method)
  SetShapeClipping(theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect): void;

  // StepVisual_CameraModelD3MultiClippingIntersection.ShapeClipping (method)
  ShapeClipping(): NCollection_HArray1_StepVisual_CameraModelD3MultiClippingInterectionSelect;

  // StepVisual_CameraModelD3MultiClippingIntersection.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraModelD3MultiClippingIntersection.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraModelD3MultiClippingIntersection.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraModelD3MultiClippingIntersection.delete (method)
  delete(): void;

  // StepVisual_CameraModelD3MultiClippingIntersection.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingUnion: declare class StepVisual_CameraModelD3MultiClippingUnion extends StepGeom_GeometricRepresentationItem

  // StepVisual_CameraModelD3MultiClippingUnion.constructor (constructor)
  constructor();

  // StepVisual_CameraModelD3MultiClippingUnion.Init (method)
  Init(theName: TCollection_HAsciiString, theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CameraModelD3MultiClippingUnion.SetShapeClipping (method)
  SetShapeClipping(theShapeClipping: NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect): void;

  // StepVisual_CameraModelD3MultiClippingUnion.ShapeClipping (method)
  ShapeClipping(): NCollection_HArray1_StepVisual_CameraModelD3MultiClippingUnionSelect;

  // StepVisual_CameraModelD3MultiClippingUnion.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraModelD3MultiClippingUnion.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraModelD3MultiClippingUnion.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraModelD3MultiClippingUnion.delete (method)
  delete(): void;

  // StepVisual_CameraModelD3MultiClippingUnion.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraModelD3MultiClippingUnionSelect: declare class StepVisual_CameraModelD3MultiClippingUnionSelect extends StepData_SelectType

  // StepVisual_CameraModelD3MultiClippingUnionSelect.constructor (constructor)
  constructor();

  // StepVisual_CameraModelD3MultiClippingUnionSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_CameraModelD3MultiClippingUnionSelect.Plane (method)
  Plane(): StepGeom_Plane;

  // StepVisual_CameraModelD3MultiClippingUnionSelect.CameraModelD3MultiClippingIntersection (method)
  CameraModelD3MultiClippingIntersection(): StepVisual_CameraModelD3MultiClippingIntersection;

  // StepVisual_CameraModelD3MultiClippingUnionSelect.delete (method)
  delete(): void;

  // StepVisual_CameraModelD3MultiClippingUnionSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CameraUsage: declare class StepVisual_CameraUsage extends StepRepr_RepresentationMap

  // StepVisual_CameraUsage.constructor (constructor)
  constructor();

  // StepVisual_CameraUsage.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CameraUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CameraUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CameraUsage.delete (method)
  delete(): void;

  // StepVisual_CameraUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CentralOrParallel: typeof StepVisual_CentralOrParallel[keyof typeof StepVisual_CentralOrParallel]

  readonly StepVisual_copCentral: 'StepVisual_copCentral'

  readonly StepVisual_copParallel: 'StepVisual_copParallel'

StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel: declare class StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel extends StepVisual_DraughtingModel

  // StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel.constructor (constructor)
  constructor();

  // StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel.delete (method)
  delete(): void;

  // StepVisual_CharacterizedObjAndRepresentationAndDraughtingModel.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_Colour: declare class StepVisual_Colour extends Standard_Transient

  // StepVisual_Colour.constructor (constructor)
  constructor();

  // StepVisual_Colour.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_Colour.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_Colour.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_Colour.delete (method)
  delete(): void;

  // StepVisual_Colour.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ColourRgb: declare class StepVisual_ColourRgb extends StepVisual_ColourSpecification

  // StepVisual_ColourRgb.constructor (constructor)
  constructor();

  // StepVisual_ColourRgb.Init (method)
  Init(aName: TCollection_HAsciiString, aRed: number, aGreen: number, aBlue: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_ColourRgb.SetRed (method)
  SetRed(aRed: number): void;

  // StepVisual_ColourRgb.Red (method)
  Red(): number;

  // StepVisual_ColourRgb.SetGreen (method)
  SetGreen(aGreen: number): void;

  // StepVisual_ColourRgb.Green (method)
  Green(): number;

  // StepVisual_ColourRgb.SetBlue (method)
  SetBlue(aBlue: number): void;

  // StepVisual_ColourRgb.Blue (method)
  Blue(): number;

  // StepVisual_ColourRgb.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ColourRgb.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ColourRgb.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ColourRgb.delete (method)
  delete(): void;

  // StepVisual_ColourRgb.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ColourSpecification: declare class StepVisual_ColourSpecification extends StepVisual_Colour

  // StepVisual_ColourSpecification.constructor (constructor)
  constructor();

  // StepVisual_ColourSpecification.Init (method)
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_ColourSpecification.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_ColourSpecification.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_ColourSpecification.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ColourSpecification.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ColourSpecification.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ColourSpecification.delete (method)
  delete(): void;

  // StepVisual_ColourSpecification.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ComplexTriangulatedFace: declare class StepVisual_ComplexTriangulatedFace extends StepVisual_TessellatedFace

  // StepVisual_ComplexTriangulatedFace.constructor (constructor)
  constructor();

  // StepVisual_ComplexTriangulatedFace.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_ComplexTriangulatedFace.Pnindex (method)
  Pnindex(): NCollection_HArray1_int;

  // StepVisual_ComplexTriangulatedFace.SetPnindex (method)
  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  // StepVisual_ComplexTriangulatedFace.NbPnindex (method)
  NbPnindex(): number;

  // StepVisual_ComplexTriangulatedFace.PnindexValue (method)
  PnindexValue(theNum: number): number;

  // StepVisual_ComplexTriangulatedFace.TriangleStrips (method)
  TriangleStrips(): NCollection_HArray1_handle_Standard_Transient;

  // StepVisual_ComplexTriangulatedFace.SetTriangleStrips (method)
  SetTriangleStrips(theTriangleStrips: NCollection_HArray1_handle_Standard_Transient): void;

  // StepVisual_ComplexTriangulatedFace.NbTriangleStrips (method)
  NbTriangleStrips(): number;

  // StepVisual_ComplexTriangulatedFace.TriangleFans (method)
  TriangleFans(): NCollection_HArray1_handle_Standard_Transient;

  // StepVisual_ComplexTriangulatedFace.SetTriangleFans (method)
  SetTriangleFans(theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;

  // StepVisual_ComplexTriangulatedFace.NbTriangleFans (method)
  NbTriangleFans(): number;

  // StepVisual_ComplexTriangulatedFace.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ComplexTriangulatedFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ComplexTriangulatedFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ComplexTriangulatedFace.delete (method)
  delete(): void;

  // StepVisual_ComplexTriangulatedFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ComplexTriangulatedSurfaceSet: declare class StepVisual_ComplexTriangulatedSurfaceSet extends StepVisual_TessellatedSurfaceSet

  // StepVisual_ComplexTriangulatedSurfaceSet.constructor (constructor)
  constructor();

  // StepVisual_ComplexTriangulatedSurfaceSet.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedSurfaceSet_Coordinates: StepVisual_CoordinatesList, theTessellatedSurfaceSet_Pnmax: number, theTessellatedSurfaceSet_Normals: NCollection_HArray2_double, thePnindex: NCollection_HArray1_int, theTriangleStrips: NCollection_HArray1_handle_Standard_Transient, theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_ComplexTriangulatedSurfaceSet.Pnindex (method)
  Pnindex(): NCollection_HArray1_int;

  // StepVisual_ComplexTriangulatedSurfaceSet.SetPnindex (method)
  SetPnindex(thePnindex: NCollection_HArray1_int): void;

  // StepVisual_ComplexTriangulatedSurfaceSet.NbPnindex (method)
  NbPnindex(): number;

  // StepVisual_ComplexTriangulatedSurfaceSet.PnindexValue (method)
  PnindexValue(theNum: number): number;

  // StepVisual_ComplexTriangulatedSurfaceSet.TriangleStrips (method)
  TriangleStrips(): NCollection_HArray1_handle_Standard_Transient;

  // StepVisual_ComplexTriangulatedSurfaceSet.SetTriangleStrips (method)
  SetTriangleStrips(theTriangleStrips: NCollection_HArray1_handle_Standard_Transient): void;

  // StepVisual_ComplexTriangulatedSurfaceSet.NbTriangleStrips (method)
  NbTriangleStrips(): number;

  // StepVisual_ComplexTriangulatedSurfaceSet.TriangleFans (method)
  TriangleFans(): NCollection_HArray1_handle_Standard_Transient;

  // StepVisual_ComplexTriangulatedSurfaceSet.SetTriangleFans (method)
  SetTriangleFans(theTriangleFans: NCollection_HArray1_handle_Standard_Transient): void;

  // StepVisual_ComplexTriangulatedSurfaceSet.NbTriangleFans (method)
  NbTriangleFans(): number;

  // StepVisual_ComplexTriangulatedSurfaceSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ComplexTriangulatedSurfaceSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ComplexTriangulatedSurfaceSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ComplexTriangulatedSurfaceSet.delete (method)
  delete(): void;

  // StepVisual_ComplexTriangulatedSurfaceSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CompositeText: declare class StepVisual_CompositeText extends StepGeom_GeometricRepresentationItem

  // StepVisual_CompositeText.constructor (constructor)
  constructor();

  // StepVisual_CompositeText.Init (method)
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CompositeText.SetCollectedText (method)
  SetCollectedText(aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;

  // StepVisual_CompositeText.CollectedText (method)
  CollectedText(): NCollection_HArray1_StepVisual_TextOrCharacter;

  // StepVisual_CompositeText.CollectedTextValue (method)
  CollectedTextValue(num: number): StepVisual_TextOrCharacter;

  // StepVisual_CompositeText.NbCollectedText (method)
  NbCollectedText(): number;

  // StepVisual_CompositeText.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CompositeText.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CompositeText.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CompositeText.delete (method)
  delete(): void;

  // StepVisual_CompositeText.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CompositeTextWithExtent: declare class StepVisual_CompositeTextWithExtent extends StepVisual_CompositeText

  // StepVisual_CompositeTextWithExtent.constructor (constructor)
  constructor();

  // StepVisual_CompositeTextWithExtent.Init (method)
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter, aExtent: StepVisual_PlanarExtent): void;
  Init(aName: TCollection_HAsciiString, aCollectedText: NCollection_HArray1_StepVisual_TextOrCharacter): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CompositeTextWithExtent.SetExtent (method)
  SetExtent(aExtent: StepVisual_PlanarExtent): void;

  // StepVisual_CompositeTextWithExtent.Extent (method)
  Extent(): StepVisual_PlanarExtent;

  // StepVisual_CompositeTextWithExtent.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CompositeTextWithExtent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CompositeTextWithExtent.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CompositeTextWithExtent.delete (method)
  delete(): void;

  // StepVisual_CompositeTextWithExtent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ContextDependentInvisibility: declare class StepVisual_ContextDependentInvisibility extends StepVisual_Invisibility

  // StepVisual_ContextDependentInvisibility.constructor (constructor)
  constructor();

  // StepVisual_ContextDependentInvisibility.Init (method)
  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem, aPresentationContext: StepVisual_InvisibilityContext): void;
  Init(aInvisibleItems: NCollection_HArray1_StepVisual_InvisibleItem): void;

  // StepVisual_ContextDependentInvisibility.SetPresentationContext (method)
  SetPresentationContext(aPresentationContext: StepVisual_InvisibilityContext): void;

  // StepVisual_ContextDependentInvisibility.PresentationContext (method)
  PresentationContext(): StepVisual_InvisibilityContext;

  // StepVisual_ContextDependentInvisibility.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ContextDependentInvisibility.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ContextDependentInvisibility.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ContextDependentInvisibility.delete (method)
  delete(): void;

  // StepVisual_ContextDependentInvisibility.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_ContextDependentOverRidingStyledItem: declare class StepVisual_ContextDependentOverRidingStyledItem extends StepVisual_OverRidingStyledItem

  // StepVisual_ContextDependentOverRidingStyledItem.constructor (constructor)
  constructor();

  // StepVisual_ContextDependentOverRidingStyledItem.Init (method)
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem, aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient, aOverRiddenStyle: StepVisual_StyledItem): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_ContextDependentOverRidingStyledItem.SetStyleContext (method)
  SetStyleContext(aStyleContext: NCollection_HArray1_StepVisual_StyleContextSelect): void;

  // StepVisual_ContextDependentOverRidingStyledItem.StyleContext (method)
  StyleContext(): NCollection_HArray1_StepVisual_StyleContextSelect;

  // StepVisual_ContextDependentOverRidingStyledItem.StyleContextValue (method)
  StyleContextValue(num: number): StepVisual_StyleContextSelect;

  // StepVisual_ContextDependentOverRidingStyledItem.NbStyleContext (method)
  NbStyleContext(): number;

  // StepVisual_ContextDependentOverRidingStyledItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_ContextDependentOverRidingStyledItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_ContextDependentOverRidingStyledItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_ContextDependentOverRidingStyledItem.delete (method)
  delete(): void;

  // StepVisual_ContextDependentOverRidingStyledItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CoordinatesList: declare class StepVisual_CoordinatesList extends StepVisual_TessellatedItem

  // StepVisual_CoordinatesList.constructor (constructor)
  constructor();

  // StepVisual_CoordinatesList.Init (method)
  Init(theName: TCollection_HAsciiString, thePoints: NCollection_HArray1_gp_XYZ): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CoordinatesList.Points (method)
  Points(): NCollection_HArray1_gp_XYZ;

  // StepVisual_CoordinatesList.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CoordinatesList.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CoordinatesList.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CoordinatesList.delete (method)
  delete(): void;

  // StepVisual_CoordinatesList.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CubicBezierTessellatedEdge: declare class StepVisual_CubicBezierTessellatedEdge extends StepVisual_TessellatedEdge

  // StepVisual_CubicBezierTessellatedEdge.constructor (constructor)
  constructor();

  // StepVisual_CubicBezierTessellatedEdge.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CubicBezierTessellatedEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CubicBezierTessellatedEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CubicBezierTessellatedEdge.delete (method)
  delete(): void;

  // StepVisual_CubicBezierTessellatedEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CubicBezierTriangulatedFace: declare class StepVisual_CubicBezierTriangulatedFace extends StepVisual_TessellatedFace

  // StepVisual_CubicBezierTriangulatedFace.constructor (constructor)
  constructor();

  // StepVisual_CubicBezierTriangulatedFace.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedFace_Coordinates: StepVisual_CoordinatesList, theTessellatedFace_Pnmax: number, theTessellatedFace_Normals: NCollection_HArray2_double, theHasTessellatedFace_GeometricLink: boolean, theTessellatedFace_GeometricLink: StepVisual_FaceOrSurface, theCtriangles: NCollection_HArray2_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_CubicBezierTriangulatedFace.Ctriangles (method)
  Ctriangles(): NCollection_HArray2_int;

  // StepVisual_CubicBezierTriangulatedFace.SetCtriangles (method)
  SetCtriangles(theCtriangles: NCollection_HArray2_int): void;

  // StepVisual_CubicBezierTriangulatedFace.NbCtriangles (method)
  NbCtriangles(): number;

  // StepVisual_CubicBezierTriangulatedFace.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CubicBezierTriangulatedFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CubicBezierTriangulatedFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CubicBezierTriangulatedFace.delete (method)
  delete(): void;

  // StepVisual_CubicBezierTriangulatedFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CurveStyle: declare class StepVisual_CurveStyle extends Standard_Transient

  // StepVisual_CurveStyle.constructor (constructor)
  constructor();

  // StepVisual_CurveStyle.Init (method)
  Init(aName: TCollection_HAsciiString, aCurveFont: StepVisual_CurveStyleFontSelect, aCurveWidth: StepBasic_SizeSelect, aCurveColour: StepVisual_Colour): void;

  // StepVisual_CurveStyle.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_CurveStyle.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_CurveStyle.SetCurveFont (method)
  SetCurveFont(aCurveFont: StepVisual_CurveStyleFontSelect): void;

  // StepVisual_CurveStyle.CurveFont (method)
  CurveFont(): StepVisual_CurveStyleFontSelect;

  // StepVisual_CurveStyle.SetCurveWidth (method)
  SetCurveWidth(aCurveWidth: StepBasic_SizeSelect): void;

  // StepVisual_CurveStyle.CurveWidth (method)
  CurveWidth(): StepBasic_SizeSelect;

  // StepVisual_CurveStyle.SetCurveColour (method)
  SetCurveColour(aCurveColour: StepVisual_Colour): void;

  // StepVisual_CurveStyle.CurveColour (method)
  CurveColour(): StepVisual_Colour;

  // StepVisual_CurveStyle.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CurveStyle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CurveStyle.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CurveStyle.delete (method)
  delete(): void;

  // StepVisual_CurveStyle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CurveStyleFont: declare class StepVisual_CurveStyleFont extends Standard_Transient

  // StepVisual_CurveStyleFont.constructor (constructor)
  constructor();

  // StepVisual_CurveStyleFont.Init (method)
  Init(aName: TCollection_HAsciiString, aPatternList: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern): void;

  // StepVisual_CurveStyleFont.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_CurveStyleFont.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_CurveStyleFont.SetPatternList (method)
  SetPatternList(aPatternList: NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern): void;

  // StepVisual_CurveStyleFont.PatternList (method)
  PatternList(): NCollection_HArray1_handle_StepVisual_CurveStyleFontPattern;

  // StepVisual_CurveStyleFont.PatternListValue (method)
  PatternListValue(num: number): StepVisual_CurveStyleFontPattern;

  // StepVisual_CurveStyleFont.NbPatternList (method)
  NbPatternList(): number;

  // StepVisual_CurveStyleFont.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CurveStyleFont.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CurveStyleFont.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CurveStyleFont.delete (method)
  delete(): void;

  // StepVisual_CurveStyleFont.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CurveStyleFontPattern: declare class StepVisual_CurveStyleFontPattern extends Standard_Transient

  // StepVisual_CurveStyleFontPattern.constructor (constructor)
  constructor();

  // StepVisual_CurveStyleFontPattern.Init (method)
  Init(aVisibleSegmentLength: number, aInvisibleSegmentLength: number): void;

  // StepVisual_CurveStyleFontPattern.SetVisibleSegmentLength (method)
  SetVisibleSegmentLength(aVisibleSegmentLength: number): void;

  // StepVisual_CurveStyleFontPattern.VisibleSegmentLength (method)
  VisibleSegmentLength(): number;

  // StepVisual_CurveStyleFontPattern.SetInvisibleSegmentLength (method)
  SetInvisibleSegmentLength(aInvisibleSegmentLength: number): void;

  // StepVisual_CurveStyleFontPattern.InvisibleSegmentLength (method)
  InvisibleSegmentLength(): number;

  // StepVisual_CurveStyleFontPattern.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_CurveStyleFontPattern.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_CurveStyleFontPattern.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_CurveStyleFontPattern.delete (method)
  delete(): void;

  // StepVisual_CurveStyleFontPattern.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_CurveStyleFontSelect: declare class StepVisual_CurveStyleFontSelect extends StepData_SelectType

  // StepVisual_CurveStyleFontSelect.constructor (constructor)
  constructor();

  // StepVisual_CurveStyleFontSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_CurveStyleFontSelect.CurveStyleFont (method)
  CurveStyleFont(): StepVisual_CurveStyleFont;

  // StepVisual_CurveStyleFontSelect.PreDefinedCurveFont (method)
  PreDefinedCurveFont(): StepVisual_PreDefinedCurveFont;

  // StepVisual_CurveStyleFontSelect.ExternallyDefinedCurveFont (method)
  ExternallyDefinedCurveFont(): StepVisual_ExternallyDefinedCurveFont;

  // StepVisual_CurveStyleFontSelect.delete (method)
  delete(): void;

  // StepVisual_CurveStyleFontSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_DirectionCountSelect: declare class StepVisual_DirectionCountSelect

  // StepVisual_DirectionCountSelect.constructor (constructor)
  constructor();

  // StepVisual_DirectionCountSelect.SetTypeOfContent (method)
  SetTypeOfContent(aTypeOfContent: number): void;

  // StepVisual_DirectionCountSelect.TypeOfContent (method)
  TypeOfContent(): number;

  // StepVisual_DirectionCountSelect.UDirectionCount (method)
  UDirectionCount(): number;

  // StepVisual_DirectionCountSelect.SetUDirectionCount (method)
  SetUDirectionCount(aUDirectionCount: number): void;

  // StepVisual_DirectionCountSelect.VDirectionCount (method)
  VDirectionCount(): number;

  // StepVisual_DirectionCountSelect.SetVDirectionCount (method)
  SetVDirectionCount(aUDirectionCount: number): void;

  // StepVisual_DirectionCountSelect.delete (method)
  delete(): void;

  // StepVisual_DirectionCountSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
