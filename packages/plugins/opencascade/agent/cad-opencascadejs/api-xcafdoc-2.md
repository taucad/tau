# libcascade — XCAFDoc (2)

11 top-level symbols. Signatures are verbatim typescript.

XCAFDoc_DimTolTool: declare class XCAFDoc_DimTolTool extends TDataStd_GenericEmpty

constructor

static Set(L: TDF_Label): XCAFDoc_DimTolTool;

static GetID(): Standard_GUID;

BaseLabel(): TDF_Label;

ShapeTool(): XCAFDoc_ShapeTool;

IsDimension(theLab: TDF_Label): boolean;

GetDimensionLabels(theLabels: NCollection_Sequence_TDF_Label): void;

SetDimension(theL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstLS: NCollection_Sequence_TDF_Label, theSecondLS: NCollection_Sequence_TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstL: TDF_Label, theSecondL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstLS: NCollection_Sequence_TDF_Label, theSecondLS: NCollection_Sequence_TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstL: TDF_Label, theSecondL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theL: TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstLS: NCollection_Sequence_TDF_Label, theSecondLS: NCollection_Sequence_TDF_Label, theDimL: TDF_Label): void;
SetDimension(theFirstL: TDF_Label, theSecondL: TDF_Label, theDimL: TDF_Label): void;

GetRefDimensionLabels(theShapeL: TDF_Label, theDimensions: NCollection_Sequence_TDF_Label): boolean;

AddDimension(): TDF_Label;

IsGeomTolerance(theLab: TDF_Label): boolean;

GetGeomToleranceLabels(theLabels: NCollection_Sequence_TDF_Label): void;

SetGeomTolerance(theL: TDF_Label, theGeomTolL: TDF_Label): void;
SetGeomTolerance(theL: NCollection_Sequence_TDF_Label, theGeomTolL: TDF_Label): void;
SetGeomTolerance(theL: TDF_Label, theGeomTolL: TDF_Label): void;
SetGeomTolerance(theL: NCollection_Sequence_TDF_Label, theGeomTolL: TDF_Label): void;

GetRefGeomToleranceLabels(theShapeL: TDF_Label, theDimTols: NCollection_Sequence_TDF_Label): boolean;

AddGeomTolerance(): TDF_Label;

IsDimTol(theLab: TDF_Label): boolean;

GetDimTolLabels(Labels: NCollection_Sequence_TDF_Label): void;

FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, lab: TDF_Label): boolean;
FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;
FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, lab: TDF_Label): boolean;
FindDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

AddDimTol(theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

SetDimTol(theL: TDF_Label, theDimTolL: TDF_Label): void;
SetDimTol(theL: TDF_Label, theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;
SetDimTol(theL: TDF_Label, theDimTolL: TDF_Label): void;
SetDimTol(theL: TDF_Label, theKind: number, theVal: NCollection_HArray1_double, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString): TDF_Label;

static GetRefShapeLabel(theL: TDF_Label, theShapeLFirst: NCollection_Sequence_TDF_Label, theShapeLSecond: NCollection_Sequence_TDF_Label): boolean;

GetDimTol(theDimTolL: TDF_Label, theKind?: number): { returnValue: boolean; theKind: number; theVal: NCollection_HArray1_double; theName: TCollection_HAsciiString; theDescription: TCollection_HAsciiString; [Symbol.dispose](): void };

IsDatum(lab: TDF_Label): boolean;

GetDatumLabels(Labels: NCollection_Sequence_TDF_Label): void;

FindDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString, lab: TDF_Label): boolean;

AddDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): TDF_Label;
AddDatum(): TDF_Label;
AddDatum(theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): TDF_Label;
AddDatum(): TDF_Label;

SetDatum(theShapeLabels: NCollection_Sequence_TDF_Label, theDatumL: TDF_Label): void;
SetDatum(theL: TDF_Label, theTolerL: TDF_Label, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): void;
SetDatum(theShapeLabels: NCollection_Sequence_TDF_Label, theDatumL: TDF_Label): void;
SetDatum(theL: TDF_Label, theTolerL: TDF_Label, theName: TCollection_HAsciiString, theDescription: TCollection_HAsciiString, theIdentification: TCollection_HAsciiString): void;

SetDatumToGeomTol(theDatumL: TDF_Label, theTolerL: TDF_Label): void;

GetDatum(theDatumL: TDF_Label): { returnValue: boolean; theName: TCollection_HAsciiString; theDescription: TCollection_HAsciiString; theIdentification: TCollection_HAsciiString; [Symbol.dispose](): void };

static GetDatumOfTolerLabels(theDimTolL: TDF_Label, theDatums: NCollection_Sequence_TDF_Label): boolean;

static GetDatumWithObjectOfTolerLabels(theDimTolL: TDF_Label, theDatums: NCollection_Sequence_TDF_Label): boolean;

GetTolerOfDatumLabels(theDatumL: TDF_Label, theTols: NCollection_Sequence_TDF_Label): boolean;

GetRefDatumLabel(theShapeL: TDF_Label, theDatum: NCollection_Sequence_TDF_Label): boolean;

IsLocked(theViewL: TDF_Label): boolean;

Lock(theViewL: TDF_Label): void;

GetGDTPresentations(theGDTLabelToShape: NCollection_IndexedDataMap_TDF_Label_TopoDS_Shape): void;

SetGDTPresentations(theGDTLabelToPrs: NCollection_IndexedDataMap_TDF_Label_TopoDS_Shape): void;

Unlock(theViewL: TDF_Label): void;

ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_Dimension: declare class XCAFDoc_Dimension extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

static Set(theLabel: TDF_Label): XCAFDoc_Dimension;

ID(): Standard_GUID;

SetObject(theDimensionObject: XCAFDimTolObjects_DimensionObject): void;

GetObject(): XCAFDimTolObjects_DimensionObject;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_DocumentTool: declare class XCAFDoc_DocumentTool extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

static Set(L: TDF_Label, IsAcces?: boolean): XCAFDoc_DocumentTool;

static IsXCAFDocument(Doc: TDocStd_Document): boolean;

static DocLabel(acces: TDF_Label): TDF_Label;

static ShapesLabel(acces: TDF_Label): TDF_Label;

static ColorsLabel(acces: TDF_Label): TDF_Label;

static LayersLabel(acces: TDF_Label): TDF_Label;

static DGTsLabel(acces: TDF_Label): TDF_Label;

static MaterialsLabel(acces: TDF_Label): TDF_Label;

static ViewsLabel(acces: TDF_Label): TDF_Label;

static ClippingPlanesLabel(acces: TDF_Label): TDF_Label;

static NotesLabel(acces: TDF_Label): TDF_Label;

static VisMaterialLabel(theLabel: TDF_Label): TDF_Label;

static ShapeTool(acces: TDF_Label): XCAFDoc_ShapeTool;

static CheckShapeTool(theAcces: TDF_Label): boolean;

static ColorTool(acces: TDF_Label): XCAFDoc_ColorTool;

static CheckColorTool(theAcces: TDF_Label): boolean;

static VisMaterialTool(theLabel: TDF_Label): XCAFDoc_VisMaterialTool;

static CheckVisMaterialTool(theAcces: TDF_Label): boolean;

static LayerTool(acces: TDF_Label): XCAFDoc_LayerTool;

static CheckLayerTool(theAcces: TDF_Label): boolean;

static DimTolTool(acces: TDF_Label): XCAFDoc_DimTolTool;

static CheckDimTolTool(theAcces: TDF_Label): boolean;

static MaterialTool(acces: TDF_Label): XCAFDoc_MaterialTool;

static CheckMaterialTool(theAcces: TDF_Label): boolean;

static ViewTool(acces: TDF_Label): XCAFDoc_ViewTool;

static CheckViewTool(theAcces: TDF_Label): boolean;

static ClippingPlaneTool(acces: TDF_Label): XCAFDoc_ClippingPlaneTool;

static CheckClippingPlaneTool(theAcces: TDF_Label): boolean;

static NotesTool(acces: TDF_Label): XCAFDoc_NotesTool;

static CheckNotesTool(theAcces: TDF_Label): boolean;

static GetLengthUnit(theDoc: TDocStd_Document, theResut: number, theBaseUnit: UnitsMethods_LengthUnit): { returnValue: boolean; theResut: number };
static GetLengthUnit(theDoc: TDocStd_Document, theResut?: number): { returnValue: boolean; theResut: number };
static GetLengthUnit(theDoc: TDocStd_Document, theResut: number, theBaseUnit: UnitsMethods_LengthUnit): { returnValue: boolean; theResut: number };
static GetLengthUnit(theDoc: TDocStd_Document, theResut?: number): { returnValue: boolean; theResut: number };

static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number): void;
static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;
static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number): void;
static SetLengthUnit(theDoc: TDocStd_Document, theUnitValue: number, theBaseUnit: UnitsMethods_LengthUnit): void;

Init(): void;

ID(): Standard_GUID;

AfterRetrieval(forceIt?: boolean): boolean;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_Editor: declare class XCAFDoc_Editor

constructor

static Expand(theDoc: TDF_Label, theShape: TDF_Label, theRecursively: boolean): boolean;
static Expand(theDoc: TDF_Label, theRecursively: boolean): boolean;
static Expand(theDoc: TDF_Label, theShape: TDF_Label, theRecursively: boolean): boolean;
static Expand(theDoc: TDF_Label, theRecursively: boolean): boolean;

static Extract(theSrcLabels: NCollection_Sequence_TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;
static Extract(theSrcLabel: TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;
static Extract(theSrcLabels: NCollection_Sequence_TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;
static Extract(theSrcLabel: TDF_Label, theDstLabel: TDF_Label, theIsNoVisMat: boolean): boolean;

static CloneShapeLabel(theSrcLabel: TDF_Label, theSrcShapeTool: XCAFDoc_ShapeTool, theDstShapeTool: XCAFDoc_ShapeTool, theMap: NCollection_DataMap_TDF_Label_TDF_Label): TDF_Label;

static CloneMetaData(theSrcLabel: TDF_Label, theDstLabel: TDF_Label, theVisMatMap: NCollection_DataMap_handle_XCAFDoc_VisMaterial_handle_XCAFDoc_VisMaterial, theToCopyColor?: boolean, theToCopyLayer?: boolean, theToCopyMaterial?: boolean, theToCopyVisMaterial?: boolean, theToCopyAttributes?: boolean): void;

static GetParentShapeLabels(theLabel: TDF_Label, theRelatedLabels: NCollection_Map_TDF_Label): void;

static GetChildShapeLabels(theLabel: TDF_Label, theRelatedLabels: NCollection_Map_TDF_Label): void;

static FilterShapeTree(theShapeTool: XCAFDoc_ShapeTool, theLabelsToKeep: NCollection_Map_TDF_Label): boolean;

static RescaleGeometry(theLabel: TDF_Label, theScaleFactor: number, theForceIfNotRoot?: boolean): boolean;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_GeomTolerance: declare class XCAFDoc_GeomTolerance extends TDataStd_GenericEmpty

constructor

static GetID(): Standard_GUID;

static Set(theLabel: TDF_Label): XCAFDoc_GeomTolerance;

SetObject(theGeomToleranceObject: XCAFDimTolObjects_GeomToleranceObject): void;

GetObject(): XCAFDimTolObjects_GeomToleranceObject;

ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_GraphNode: declare class XCAFDoc_GraphNode extends TDF_Attribute

constructor

static Find(L: TDF_Label): { returnValue: boolean; G: XCAFDoc_GraphNode; [Symbol.dispose](): void };

static Set(L: TDF_Label): XCAFDoc_GraphNode;
static Set(L: TDF_Label, ExplicitGraphID: Standard_GUID): XCAFDoc_GraphNode;
static Set(L: TDF_Label): XCAFDoc_GraphNode;
static Set(L: TDF_Label, ExplicitGraphID: Standard_GUID): XCAFDoc_GraphNode;

static GetDefaultGraphID(): Standard_GUID;

SetGraphID(explicitID: Standard_GUID): void;

SetFather(F: XCAFDoc_GraphNode): number;

SetChild(Ch: XCAFDoc_GraphNode): number;

UnSetFather(F: XCAFDoc_GraphNode): void;
UnSetFather(Findex: number): void;
UnSetFather(F: XCAFDoc_GraphNode): void;
UnSetFather(Findex: number): void;

UnSetChild(Ch: XCAFDoc_GraphNode): void;
UnSetChild(Chindex: number): void;
UnSetChild(Ch: XCAFDoc_GraphNode): void;
UnSetChild(Chindex: number): void;

GetFather(Findex: number): XCAFDoc_GraphNode;

GetChild(Chindex: number): XCAFDoc_GraphNode;

FatherIndex(F: XCAFDoc_GraphNode): number;

ChildIndex(Ch: XCAFDoc_GraphNode): number;

IsFather(Ch: XCAFDoc_GraphNode): boolean;

IsChild(F: XCAFDoc_GraphNode): boolean;

NbFathers(): number;

NbChildren(): number;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

NewEmpty(): TDF_Attribute;

References(aDataSet: TDF_DataSet): void;

BeforeForget(): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_LayerTool: declare class XCAFDoc_LayerTool extends TDataStd_GenericEmpty

constructor

static Set(L: TDF_Label): XCAFDoc_LayerTool;

static GetID(): Standard_GUID;

BaseLabel(): TDF_Label;

ShapeTool(): XCAFDoc_ShapeTool;

IsLayer(lab: TDF_Label): boolean;

GetLayer(lab: TDF_Label, aLayer: TCollection_ExtendedString): boolean;

FindLayer(aLayer: TCollection_ExtendedString, lab: TDF_Label): boolean;
FindLayer(aLayer: TCollection_ExtendedString, theToFindWithProperty: boolean, theToFindVisible: boolean): TDF_Label;
FindLayer(aLayer: TCollection_ExtendedString, lab: TDF_Label): boolean;
FindLayer(aLayer: TCollection_ExtendedString, theToFindWithProperty: boolean, theToFindVisible: boolean): TDF_Label;

AddLayer(theLayer: TCollection_ExtendedString): TDF_Label;
AddLayer(theLayer: TCollection_ExtendedString, theToFindVisible: boolean): TDF_Label;
AddLayer(theLayer: TCollection_ExtendedString): TDF_Label;
AddLayer(theLayer: TCollection_ExtendedString, theToFindVisible: boolean): TDF_Label;

RemoveLayer(lab: TDF_Label): void;

GetLayerLabels(Labels: NCollection_Sequence_TDF_Label): void;

SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;
SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;
SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;
SetLayer(L: TDF_Label, LayerL: TDF_Label, shapeInOneLayer: boolean): void;
SetLayer(L: TDF_Label, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): void;
SetLayer(Sh: TopoDS_Shape, LayerL: TDF_Label, shapeInOneLayer: boolean): boolean;
SetLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString, shapeInOneLayer: boolean): boolean;

UnSetLayers(L: TDF_Label): void;
UnSetLayers(Sh: TopoDS_Shape): boolean;
UnSetLayers(L: TDF_Label): void;
UnSetLayers(Sh: TopoDS_Shape): boolean;

UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
UnSetOneLayer(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(L: TDF_Label, aLayerL: TDF_Label): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
UnSetOneLayer(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;

IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;
IsSet(L: TDF_Label, aLayer: TCollection_ExtendedString): boolean;
IsSet(L: TDF_Label, aLayerL: TDF_Label): boolean;
IsSet(Sh: TopoDS_Shape, aLayer: TCollection_ExtendedString): boolean;
IsSet(Sh: TopoDS_Shape, aLayerL: TDF_Label): boolean;

GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(L: TDF_Label): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(Sh: TopoDS_Shape): { returnValue: boolean; aLayerS: NCollection_HSequence_TCollection_ExtendedString; [Symbol.dispose](): void };
GetLayers(L: TDF_Label, aLayerLS: NCollection_Sequence_TDF_Label): boolean;
GetLayers(Sh: TopoDS_Shape, aLayerLS: NCollection_Sequence_TDF_Label): boolean;

static GetShapesOfLayer(theLayerL: TDF_Label, theShLabels: NCollection_Sequence_TDF_Label): void;

IsVisible(layerL: TDF_Label): boolean;

SetVisibility(layerL: TDF_Label, isvisible?: boolean): void;

ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_LengthUnit: declare class XCAFDoc_LengthUnit extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(theLabel: TDF_Label, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theGUID: Standard_GUID, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
Set(theUnitName: TCollection_AsciiString, theUnitValue: number): void;
static Set(theLabel: TDF_Label, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theGUID: Standard_GUID, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;
static Set(theLabel: TDF_Label, theGUID: Standard_GUID, theUnitName: TCollection_AsciiString, theUnitValue: number): XCAFDoc_LengthUnit;

GetUnitName(): TCollection_AsciiString;

GetUnitValue(): number;

IsEmpty(): boolean;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_Location: declare class XCAFDoc_Location extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label, Loc: TopLoc_Location): XCAFDoc_Location;
Set(Loc: TopLoc_Location): void;

Get(): TopLoc_Location;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_Material: declare class XCAFDoc_Material extends TDF_Attribute

constructor

static GetID(): Standard_GUID;

static Set(label: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): XCAFDoc_Material;
Set(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;

GetName(): TCollection_HAsciiString;

GetDescription(): TCollection_HAsciiString;

GetDensity(): number;

GetDensName(): TCollection_HAsciiString;

GetDensValType(): TCollection_HAsciiString;

ID(): Standard_GUID;

Restore(anAttribute: TDF_Attribute): void;

NewEmpty(): TDF_Attribute;

Paste(intoAttribute: TDF_Attribute, aRelocationTable: TDF_RelocationTable): void;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

delete(): void;

[Symbol.dispose](): void;

XCAFDoc_MaterialTool: declare class XCAFDoc_MaterialTool extends TDataStd_GenericEmpty

constructor

static Set(L: TDF_Label): XCAFDoc_MaterialTool;

static GetID(): Standard_GUID;

BaseLabel(): TDF_Label;

ShapeTool(): XCAFDoc_ShapeTool;

IsMaterial(lab: TDF_Label): boolean;

GetMaterialLabels(Labels: NCollection_Sequence_TDF_Label): void;

AddMaterial(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): TDF_Label;

SetMaterial(L: TDF_Label, MatL: TDF_Label): void;
SetMaterial(L: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;
SetMaterial(L: TDF_Label, MatL: TDF_Label): void;
SetMaterial(L: TDF_Label, aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aDensity: number, aDensName: TCollection_HAsciiString, aDensValType: TCollection_HAsciiString): void;

static GetMaterial(MatL: TDF_Label, aDensity?: number): { returnValue: boolean; aName: TCollection_HAsciiString; aDescription: TCollection_HAsciiString; aDensity: number; aDensName: TCollection_HAsciiString; aDensValType: TCollection_HAsciiString; [Symbol.dispose](): void };

static GetDensityForShape(ShapeL: TDF_Label): number;

ID(): Standard_GUID;

static get_type_name(): string;

static get_type_descriptor(): Standard_Type;

DynamicType(): Standard_Type;

NewEmpty(): TDF_Attribute;

delete(): void;

[Symbol.dispose](): void;
