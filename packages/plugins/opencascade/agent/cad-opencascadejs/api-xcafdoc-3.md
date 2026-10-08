# libcascade — XCAFDoc (3)

9 top-level symbols. Signatures are verbatim typescript.

XCAFDoc_ShapeTool: declare class XCAFDoc_ShapeTool extends TDataStd_GenericEmpty

  // XCAFDoc_ShapeTool.constructor (constructor)
  constructor();

  // XCAFDoc_ShapeTool.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_ShapeTool.Set (method)
  static Set(L: TDF_Label): XCAFDoc_ShapeTool;

  // XCAFDoc_ShapeTool.IsTopLevel (method)
  IsTopLevel(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsFree (method)
  static IsFree(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsShape (method)
  static IsShape(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsSimpleShape (method)
  static IsSimpleShape(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsReference (method)
  static IsReference(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsAssembly (method)
  static IsAssembly(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsComponent (method)
  static IsComponent(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsCompound (method)
  static IsCompound(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.IsSubShape (method)
  static IsSubShape(L: TDF_Label): boolean;
  IsSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): boolean;

  // XCAFDoc_ShapeTool.SearchUsingMap (method)
  SearchUsingMap(S: TopoDS_Shape, L: TDF_Label, findWithoutLoc: boolean, findSubshape: boolean): boolean;

  // XCAFDoc_ShapeTool.Search (method)
  Search(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean, findComponent: boolean, findSubshape: boolean): boolean;

  // XCAFDoc_ShapeTool.FindShape (method)
  FindShape(S: TopoDS_Shape, L: TDF_Label, findInstance: boolean): boolean;
  FindShape(S: TopoDS_Shape, findInstance: boolean): TDF_Label;

  // XCAFDoc_ShapeTool.GetShape (method)
  static GetShape(L: TDF_Label, S: TopoDS_Shape): boolean;
  static GetShape(L: TDF_Label): TopoDS_Shape;

  // XCAFDoc_ShapeTool.GetOneShape (method)
  static GetOneShape(theLabels: NCollection_Sequence_TDF_Label): TopoDS_Shape;
  GetOneShape(): TopoDS_Shape;

  // XCAFDoc_ShapeTool.NewShape (method)
  NewShape(): TDF_Label;

  // XCAFDoc_ShapeTool.SetShape (method)
  SetShape(L: TDF_Label, S: TopoDS_Shape): void;

  // XCAFDoc_ShapeTool.AddShape (method)
  AddShape(S: TopoDS_Shape, makeAssembly?: boolean, makePrepare?: boolean): TDF_Label;

  // XCAFDoc_ShapeTool.RemoveShape (method)
  RemoveShape(L: TDF_Label, removeCompletely?: boolean): boolean;

  // XCAFDoc_ShapeTool.Init (method)
  Init(): void;

  // XCAFDoc_ShapeTool.SetAutoNaming (method)
  static SetAutoNaming(V: boolean): void;

  // XCAFDoc_ShapeTool.AutoNaming (method)
  static AutoNaming(): boolean;

  // XCAFDoc_ShapeTool.ComputeShapes (method)
  ComputeShapes(L: TDF_Label): void;

  // XCAFDoc_ShapeTool.ComputeSimpleShapes (method)
  ComputeSimpleShapes(): void;

  // XCAFDoc_ShapeTool.GetShapes (method)
  GetShapes(Labels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_ShapeTool.GetFreeShapes (method)
  GetFreeShapes(FreeLabels: NCollection_Sequence_TDF_Label): void;

  // XCAFDoc_ShapeTool.GetUsers (method)
  static GetUsers(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): number;

  // XCAFDoc_ShapeTool.GetLocation (method)
  static GetLocation(L: TDF_Label): TopLoc_Location;

  // XCAFDoc_ShapeTool.GetReferredShape (method)
  static GetReferredShape(L: TDF_Label, Label: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.NbComponents (method)
  static NbComponents(L: TDF_Label, getsubchilds?: boolean): number;

  // XCAFDoc_ShapeTool.GetComponents (method)
  static GetComponents(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label, getsubchilds: boolean): boolean;

  // XCAFDoc_ShapeTool.AddComponent (method)
  AddComponent(assembly: TDF_Label, comp: TDF_Label, Loc: TopLoc_Location): TDF_Label;
  AddComponent(assembly: TDF_Label, comp: TopoDS_Shape, expand: boolean): TDF_Label;

  // XCAFDoc_ShapeTool.RemoveComponent (method)
  RemoveComponent(comp: TDF_Label): void;

  // XCAFDoc_ShapeTool.UpdateAssemblies (method)
  UpdateAssemblies(): void;

  // XCAFDoc_ShapeTool.FindSubShape (method)
  FindSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.AddSubShape (method)
  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape): TDF_Label;
  AddSubShape(shapeL: TDF_Label, sub: TopoDS_Shape, addedSubShapeL: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.FindMainShapeUsingMap (method)
  FindMainShapeUsingMap(sub: TopoDS_Shape): TDF_Label;

  // XCAFDoc_ShapeTool.FindMainShape (method)
  FindMainShape(sub: TopoDS_Shape): TDF_Label;

  // XCAFDoc_ShapeTool.GetSubShapes (method)
  static GetSubShapes(L: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.BaseLabel (method)
  BaseLabel(): TDF_Label;

  // XCAFDoc_ShapeTool.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_ShapeTool.IsExternRef (method)
  static IsExternRef(L: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.SetExternRefs (method)
  SetExternRefs(SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): TDF_Label;
  SetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // XCAFDoc_ShapeTool.GetExternRefs (method)
  static GetExternRefs(L: TDF_Label, SHAS: NCollection_Sequence_handle_TCollection_HAsciiString): void;

  // XCAFDoc_ShapeTool.SetSHUO (method)
  SetSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; MainSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  // XCAFDoc_ShapeTool.GetSHUO (method)
  static GetSHUO(SHUOLabel: TDF_Label): { returnValue: boolean; aSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  // XCAFDoc_ShapeTool.GetAllComponentSHUO (method)
  static GetAllComponentSHUO(CompLabel: TDF_Label, SHUOAttrs: NCollection_Sequence_handle_TDF_Attribute): boolean;

  // XCAFDoc_ShapeTool.GetSHUOUpperUsage (method)
  static GetSHUOUpperUsage(NextUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.GetSHUONextUsage (method)
  static GetSHUONextUsage(UpperUsageL: TDF_Label, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.RemoveSHUO (method)
  RemoveSHUO(SHUOLabel: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.FindComponent (method)
  FindComponent(theShape: TopoDS_Shape, Labels: NCollection_Sequence_TDF_Label): boolean;

  // XCAFDoc_ShapeTool.GetSHUOInstance (method)
  GetSHUOInstance(theSHUO: XCAFDoc_GraphNode): TopoDS_Shape;

  // XCAFDoc_ShapeTool.SetInstanceSHUO (method)
  SetInstanceSHUO(theShape: TopoDS_Shape): XCAFDoc_GraphNode;

  // XCAFDoc_ShapeTool.GetAllSHUOInstances (method)
  GetAllSHUOInstances(theSHUO: XCAFDoc_GraphNode, theSHUOShapeSeq: NCollection_Sequence_TopoDS_Shape): boolean;

  // XCAFDoc_ShapeTool.FindSHUO (method)
  static FindSHUO(Labels: NCollection_Sequence_TDF_Label): { returnValue: boolean; theSHUOAttr: XCAFDoc_GraphNode; [Symbol.dispose](): void };

  // XCAFDoc_ShapeTool.SetLocation (method)
  SetLocation(theShapeLabel: TDF_Label, theLoc: TopLoc_Location, theRefLabel: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.Expand (method)
  Expand(Shape: TDF_Label): boolean;

  // XCAFDoc_ShapeTool.GetNamedProperties (method)
  GetNamedProperties(theLabel: TDF_Label, theToCreate: boolean): TDataStd_NamedData;
  GetNamedProperties(theShape: TopoDS_Shape, theToCreate: boolean): TDataStd_NamedData;

  // XCAFDoc_ShapeTool.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_ShapeTool.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_ShapeTool.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_ShapeTool.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_ShapeTool.delete (method)
  delete(): void;

  // XCAFDoc_ShapeTool.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

XCAFDoc_View: declare class XCAFDoc_View extends TDataStd_GenericEmpty

  // XCAFDoc_View.constructor (constructor)
  constructor();

  // XCAFDoc_View.GetID (method)
  static GetID(): Standard_GUID;

  // XCAFDoc_View.Set (method)
  static Set(theLabel: TDF_Label): XCAFDoc_View;

  // XCAFDoc_View.ID (method)
  ID(): Standard_GUID;

  // XCAFDoc_View.SetObject (method)
  SetObject(theViewObject: XCAFView_Object): void;

  // XCAFDoc_View.GetObject (method)
  GetObject(): XCAFView_Object;

  // XCAFDoc_View.get_type_name (method)
  static get_type_name(): string;

  // XCAFDoc_View.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // XCAFDoc_View.DynamicType (method)
  DynamicType(): Standard_Type;

  // XCAFDoc_View.NewEmpty (method)
  NewEmpty(): TDF_Attribute;

  // XCAFDoc_View.delete (method)
  delete(): void;

  // XCAFDoc_View.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

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
