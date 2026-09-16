# libcascade — XCAFDoc (4)

3 top-level symbols. Signatures are verbatim typescript.

XCAFDoc_VisMaterialTool: declare class XCAFDoc_VisMaterialTool extends TDF_Attribute

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  static Set(L: TDF_Label): XCAFDoc_VisMaterialTool;

  static GetID(): Standard_GUID;

  BaseLabel(): TDF_Label;

  ShapeTool(): XCAFDoc_ShapeTool;

  IsMaterial(theLabel: TDF_Label): boolean;

  static GetMaterial(theMatLabel: TDF_Label): XCAFDoc_VisMaterial;

  AddMaterial(theMat: XCAFDoc_VisMaterial, theName: TCollection_AsciiString): TDF_Label;
  AddMaterial(theName: TCollection_AsciiString): TDF_Label;
  AddMaterial(theMat: XCAFDoc_VisMaterial, theName: TCollection_AsciiString): TDF_Label;
  AddMaterial(theName: TCollection_AsciiString): TDF_Label;

  RemoveMaterial(theLabel: TDF_Label): void;

  GetMaterials(Labels: NCollection_Sequence_TDF_Label): void;

  SetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): void;
  SetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;
  SetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): void;
  SetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;

  UnSetShapeMaterial(theShapeLabel: TDF_Label): void;
  UnSetShapeMaterial(theShape: TopoDS_Shape): boolean;
  UnSetShapeMaterial(theShapeLabel: TDF_Label): void;
  UnSetShapeMaterial(theShape: TopoDS_Shape): boolean;

  IsSetShapeMaterial(theLabel: TDF_Label): boolean;
  IsSetShapeMaterial(theShape: TopoDS_Shape): boolean;
  IsSetShapeMaterial(theLabel: TDF_Label): boolean;
  IsSetShapeMaterial(theShape: TopoDS_Shape): boolean;

  static GetShapeMaterial(theShapeLabel: TDF_Label): XCAFDoc_VisMaterial;
  static GetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): boolean;
  GetShapeMaterial(theShape: TopoDS_Shape): XCAFDoc_VisMaterial;
  GetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;
  static GetShapeMaterial(theShapeLabel: TDF_Label): XCAFDoc_VisMaterial;
  static GetShapeMaterial(theShapeLabel: TDF_Label, theMaterialLabel: TDF_Label): boolean;
  GetShapeMaterial(theShape: TopoDS_Shape): XCAFDoc_VisMaterial;
  GetShapeMaterial(theShape: TopoDS_Shape, theMaterialLabel: TDF_Label): boolean;

  ID(): Standard_GUID;

  Restore(anAttribute: TDF_Attribute): void;

  NewEmpty(): TDF_Attribute;

  Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_Volume: declare class XCAFDoc_Volume extends TDataStd_Real

  constructor

  static GetID(): Standard_GUID;

  ID(): Standard_GUID;

  Set(V: number): void;
  static Set(label: TDF_Label, value: number): XCAFDoc_Volume;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;
  static Set(label: TDF_Label, value: number): XCAFDoc_Volume;
  static Set(label: TDF_Label, guid: Standard_GUID, value: number): TDataStd_Real;

  Get(): number;
  static Get(label: TDF_Label, vol?: number): { returnValue: boolean; vol: number };

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  NewEmpty(): TDF_Attribute;

  delete(): void;

  [Symbol.dispose](): void;

XCAFDoc_DataMapOfShapeLabel: NCollection_DataMap_TopoDS_Shape_TDF_Label_TopTools_ShapeMapHasher
