# libcascade — XCAFDoc (3)

7 top-level symbols. Signatures are verbatim typescript.

XCAFDoc_ViewTool: declare class XCAFDoc_ViewTool extends TDataStd_GenericEmpty

  // XCAFDoc_ViewTool.constructor (constructor)
  constructor();

  // XCAFDoc_ViewTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_ViewTool;

  // XCAFDoc_ViewTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_ViewTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_ViewTool.IsView (method)
  IsView(theLabel: TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetViewLabels (method)
  GetViewLabels(theLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_ViewTool.SetView (method)
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theNotes: NCollection_Sequence_TDF_Label, theAnnotations: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theClippingPlanes: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;
  SetView(theShapes: NCollection_Sequence_TDF_Label, theGDTs: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;

  // XCAFDoc_ViewTool.SetClippingPlanes (method)
  SetClippingPlanes(theClippingPlaneLabels: NCollection_Sequence_TDF_Label, theViewL: TDF_Label): void;

  // XCAFDoc_ViewTool.RemoveView (method)
  RemoveView(theViewL: TDF_Label): void;

  // XCAFDoc_ViewTool.GetViewLabelsForShape (method)
  GetViewLabelsForShape(theShapeL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetViewLabelsForGDT (method)
  GetViewLabelsForGDT(theGDTL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetViewLabelsForClippingPlane (method)
  GetViewLabelsForClippingPlane(theClippingPlaneL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetViewLabelsForNote (method)
  GetViewLabelsForNote(theNoteL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetViewLabelsForAnnotation (method)
  GetViewLabelsForAnnotation(theAnnotationL: TDF_Label, theViews: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.AddView (method)
  AddView(): TDF_Label;

  // XCAFDoc_ViewTool.GetRefShapeLabel (method)
  GetRefShapeLabel(theViewL: TDF_Label, theShapeLabels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetRefGDTLabel (method)
  GetRefGDTLabel(theViewL: TDF_Label, theGDTLabels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetRefClippingPlaneLabel (method)
  GetRefClippingPlaneLabel(theViewL: TDF_Label, theClippingPlaneLabels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetRefNoteLabel (method)
  GetRefNoteLabel(theViewL: TDF_Label, theNoteLabels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.GetRefAnnotationLabel (method)
  GetRefAnnotationLabel(theViewL: TDF_Label, theAnnotationLabels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ViewTool.IsLocked (method)
  IsLocked(theViewL: TDF_Label): boolean;

  // XCAFDoc_ViewTool.Lock (method)
  Lock(theViewL: TDF_Label): void;

  // XCAFDoc_ViewTool.Unlock (method)
  Unlock(theViewL: TDF_Label): void;

  // XCAFDoc_ViewTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_ViewTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_ViewTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_ViewTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_ViewTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_ViewTool.delete (method)
  delete(): void;

  // XCAFDoc_ViewTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_VisMaterial: declare class XCAFDoc_VisMaterial extends TDF_Attribute

  // XCAFDoc_VisMaterial.constructor (constructor)
  constructor();

  // XCAFDoc_VisMaterial.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_VisMaterial.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_VisMaterial.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_VisMaterial.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_VisMaterial.IsEmpty (method)
  IsEmpty(): boolean;

  // XCAFDoc_VisMaterial.FillAspect (method)
  FillAspect(theAspect: unknown): void;

  // XCAFDoc_VisMaterial.HasPbrMaterial (method)
  HasPbrMaterial(): boolean;

  // XCAFDoc_VisMaterial.PbrMaterial (method)
  PbrMaterial(): XCAFDoc_VisMaterialPBR;

  // XCAFDoc_VisMaterial.SetPbrMaterial (method)
  SetPbrMaterial(theMaterial: XCAFDoc_VisMaterialPBR): void;

  // XCAFDoc_VisMaterial.UnsetPbrMaterial (method)
  UnsetPbrMaterial(): void;

  // XCAFDoc_VisMaterial.HasCommonMaterial (method)
  HasCommonMaterial(): boolean;

  // XCAFDoc_VisMaterial.CommonMaterial (method)
  CommonMaterial(): XCAFDoc_VisMaterialCommon;

  // XCAFDoc_VisMaterial.SetCommonMaterial (method)
  SetCommonMaterial(theMaterial: XCAFDoc_VisMaterialCommon): void;

  // XCAFDoc_VisMaterial.UnsetCommonMaterial (method)
  UnsetCommonMaterial(): void;

  // XCAFDoc_VisMaterial.BaseColor (method)
  BaseColor(): Quantity_ColorRGBA;

  // XCAFDoc_VisMaterial.AlphaMode (method)
  AlphaMode(): unknown;

  // XCAFDoc_VisMaterial.AlphaCutOff (method)
  AlphaCutOff(): number;

  // XCAFDoc_VisMaterial.SetAlphaMode (method)
  SetAlphaMode(theMode: unknown, theCutOff?: number): void;

  // XCAFDoc_VisMaterial.FaceCulling (method)
  FaceCulling(): unknown;

  // XCAFDoc_VisMaterial.SetFaceCulling (method)
  SetFaceCulling(theFaceCulling: unknown): void;

  // DEPRECATED
  // XCAFDoc_VisMaterial.IsDoubleSided (method)
  IsDoubleSided(): boolean;

  // DEPRECATED
  // XCAFDoc_VisMaterial.SetDoubleSided (method)
  SetDoubleSided(theIsDoubleSided: boolean): void;

  // XCAFDoc_VisMaterial.RawName (method)
  RawName(): TCollection_HAsciiString;

  // XCAFDoc_VisMaterial.SetRawName (method)
  SetRawName(theName: TCollection_HAsciiString): void;

  // XCAFDoc_VisMaterial.IsEqual (method)
  IsEqual(theOther: XCAFDoc_VisMaterial): boolean;

  // XCAFDoc_VisMaterial.ConvertToCommonMaterial (method)
  ConvertToCommonMaterial(): XCAFDoc_VisMaterialCommon;

  // XCAFDoc_VisMaterial.ConvertToPbrMaterial (method)
  ConvertToPbrMaterial(): XCAFDoc_VisMaterialPBR;

  // XCAFDoc_VisMaterial.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_VisMaterial.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_VisMaterial.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_VisMaterial.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_VisMaterial.delete (method)
  delete(): void;

  // XCAFDoc_VisMaterial.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_VisMaterialCommon: declare class XCAFDoc_VisMaterialCommon

  // XCAFDoc_VisMaterialCommon.constructor (constructor)
  constructor();

  DiffuseTexture: unknown

  AmbientColor: Quantity_Color

  DiffuseColor: Quantity_Color

  SpecularColor: Quantity_Color

  EmissiveColor: Quantity_Color

  Shininess: number

  Transparency: number

  IsDefined: boolean

  // XCAFDoc_VisMaterialCommon.IsEqual (method)
  IsEqual(theOther: XCAFDoc_VisMaterialCommon): boolean;

  // XCAFDoc_VisMaterialCommon.delete (method)
  delete(): void;

  // XCAFDoc_VisMaterialCommon.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_VisMaterialPBR: declare class XCAFDoc_VisMaterialPBR

  // XCAFDoc_VisMaterialPBR.constructor (constructor)
  constructor();

  BaseColorTexture: unknown

  MetallicRoughnessTexture: unknown

  EmissiveTexture: unknown

  OcclusionTexture: unknown

  NormalTexture: unknown

  BaseColor: Quantity_ColorRGBA

  EmissiveFactor: [number, number, number]

  Metallic: number

  Roughness: number

  RefractionIndex: number

  IsDefined: boolean

  // XCAFDoc_VisMaterialPBR.IsEqual (method)
  IsEqual(theOther: XCAFDoc_VisMaterialPBR): boolean;

  // XCAFDoc_VisMaterialPBR.delete (method)
  delete(): void;

  // XCAFDoc_VisMaterialPBR.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_VisMaterialTool: declare class XCAFDoc_VisMaterialTool extends TDF_Attribute

  // XCAFDoc_VisMaterialTool.constructor (constructor)
  constructor();

  // XCAFDoc_VisMaterialTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_VisMaterialTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_VisMaterialTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_VisMaterialTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_VisMaterialTool;

  // XCAFDoc_VisMaterialTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_VisMaterialTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_VisMaterialTool.ShapeTool (method)
  ShapeTool(): XCAFDoc_ShapeTool;

  // XCAFDoc_VisMaterialTool.IsMaterial (method)
  IsMaterial(theLabel: TDF_Label): boolean;

  // XCAFDoc_VisMaterialTool.GetMaterial (method)
  static GetMaterial(theMatLabel: TDF_Label): XCAFDoc_VisMaterial;

  // XCAFDoc_VisMaterialTool.AddMaterial (method)
  AddMaterial(theMat: XCAFDoc_VisMaterial, theName: TCollection_AsciiString): TDF_Label;
  AddMaterial(theName: TCollection_AsciiString): TDF_Label;

  // XCAFDoc_VisMaterialTool.RemoveMaterial (method)
  RemoveMaterial(theLabel: TDF_Label): void;

  // XCAFDoc_VisMaterialTool.GetMaterials (method)
  GetMaterials(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_VisMaterialTool.SetShapeMaterial (method)
  SetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): void;
  SetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;

  // XCAFDoc_VisMaterialTool.UnSetShapeMaterial (method)
  UnSetShapeMaterial(theShapeLabel: TDF_Label): void;
  UnSetShapeMaterial(theShape: TopoDS_Shape): boolean;

  // XCAFDoc_VisMaterialTool.IsSetShapeMaterial (method)
  IsSetShapeMaterial(theLabel: TDF_Label): boolean;
  IsSetShapeMaterial(theShape: TopoDS_Shape): boolean;

  // XCAFDoc_VisMaterialTool.GetShapeMaterial (method)
  static GetShapeMaterial(theShapeLabel: TDF_Label): XCAFDoc_VisMaterial;
  static GetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): boolean;
  GetShapeMaterial(theShape: TopoDS_Shape): XCAFDoc_VisMaterial;
  GetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;

  // XCAFDoc_VisMaterialTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_VisMaterialTool.Restore (method)
  Restore(anAttribute: TDF_Attribute): void;

  // XCAFDoc_VisMaterialTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_VisMaterialTool.Paste (method)
  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  // XCAFDoc_VisMaterialTool.delete (method)
  delete(): void;

  // XCAFDoc_VisMaterialTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_Volume: declare class XCAFDoc_Volume extends TDataStd_Real

  // XCAFDoc_Volume.constructor (constructor)
  constructor();

  // XCAFDoc_Volume.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_Volume.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_Volume.Set (method)
  Set(V: number): void;
  static Set(label: TDF_Label, value: number): XCAFDoc_Volume;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;

  // XCAFDoc_Volume.Get (method)
  Get(): number;
  static Get(label: TDF_Label, vol?: number): { returnValue: boolean; vol: number };

  // XCAFDoc_Volume.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_Volume.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_Volume.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_Volume.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_Volume.delete (method)
  delete(): void;

  // XCAFDoc_Volume.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_DataMapOfShapeLabel: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher
