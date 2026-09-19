# libcascade — StepVisual (3)

40 top-level symbols. Signatures are verbatim typescript.

StepVisual_PresentationLayerAssignment: declare class StepVisual_PresentationLayerAssignment extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aDescription: TCollection_HAsciiString, aAssignedItems: NCollection_HArray1_StepVisual_LayeredItem): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetDescription(aDescription: TCollection_HAsciiString): void;

  Description(): TCollection_HAsciiString;

  SetAssignedItems(aAssignedItems: NCollection_HArray1_StepVisual_LayeredItem): void;

  AssignedItems(): NCollection_HArray1_StepVisual_LayeredItem;

  AssignedItemsValue(num: number): StepVisual_LayeredItem;

  NbAssignedItems(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationLayerUsage: declare class StepVisual_PresentationLayerUsage extends Standard_Transient

  constructor

  Init(aAssignment: StepVisual_PresentationLayerAssignment, aPresentation: StepVisual_PresentationRepresentation): void;

  SetAssignment(aAssignment: StepVisual_PresentationLayerAssignment): void;

  Assignment(): StepVisual_PresentationLayerAssignment;

  SetPresentation(aPresentation: StepVisual_PresentationRepresentation): void;

  Presentation(): StepVisual_PresentationRepresentation;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationRepresentation: declare class StepVisual_PresentationRepresentation extends StepRepr_Representation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationRepresentationSelect: declare class StepVisual_PresentationRepresentationSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  PresentationRepresentation(): StepVisual_PresentationRepresentation;

  PresentationSet(): StepVisual_PresentationSet;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationSet: declare class StepVisual_PresentationSet extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationSize: declare class StepVisual_PresentationSize extends Standard_Transient

  constructor

  Init(aUnit: StepVisual_PresentationSizeAssignmentSelect, aSize: StepVisual_PlanarBox): void;

  SetUnit(aUnit: StepVisual_PresentationSizeAssignmentSelect): void;

  Unit(): StepVisual_PresentationSizeAssignmentSelect;

  SetSize(aSize: StepVisual_PlanarBox): void;

  Size(): StepVisual_PlanarBox;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationSizeAssignmentSelect: declare class StepVisual_PresentationSizeAssignmentSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  PresentationView(): StepVisual_PresentationView;

  PresentationArea(): StepVisual_PresentationArea;

  AreaInSet(): StepVisual_AreaInSet;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationStyleAssignment: declare class StepVisual_PresentationStyleAssignment extends Standard_Transient

  constructor

  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

  SetStyles(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

  Styles(): NCollection_HArray1_StepVisual_PresentationStyleSelect;

  StylesValue(num: number): StepVisual_PresentationStyleSelect;

  NbStyles(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationStyleByContext: declare class StepVisual_PresentationStyleByContext extends StepVisual_PresentationStyleAssignment

  constructor

  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect, aStyleContext: StepVisual_StyleContextSelect): void;
  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;
  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect, aStyleContext: StepVisual_StyleContextSelect): void;
  Init(aStyles: NCollection_HArray1_StepVisual_PresentationStyleSelect): void;

  SetStyleContext(aStyleContext: StepVisual_StyleContextSelect): void;

  StyleContext(): StepVisual_StyleContextSelect;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationStyleSelect: declare class StepVisual_PresentationStyleSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  PointStyle(): StepVisual_PointStyle;

  CurveStyle(): StepVisual_CurveStyle;

  NullStyle(): StepVisual_NullStyleMember;

  SurfaceStyleUsage(): StepVisual_SurfaceStyleUsage;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentationView: declare class StepVisual_PresentationView extends StepVisual_PresentationRepresentation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentedItem: declare class StepVisual_PresentedItem extends Standard_Transient

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_PresentedItemRepresentation: declare class StepVisual_PresentedItemRepresentation extends Standard_Transient

  constructor

  Init(aPresentation: StepVisual_PresentationRepresentationSelect, aItem: StepVisual_PresentedItem): void;

  SetPresentation(aPresentation: StepVisual_PresentationRepresentationSelect): void;

  Presentation(): StepVisual_PresentationRepresentationSelect;

  SetItem(aItem: StepVisual_PresentedItem): void;

  Item(): StepVisual_PresentedItem;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_RenderingPropertiesSelect: declare class StepVisual_RenderingPropertiesSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  SurfaceStyleReflectanceAmbient(): StepVisual_SurfaceStyleReflectanceAmbient;

  SurfaceStyleTransparent(): StepVisual_SurfaceStyleTransparent;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_RepositionedTessellatedGeometricSet: declare class StepVisual_RepositionedTessellatedGeometricSet extends StepVisual_TessellatedGeometricSet

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Init(theName: TCollection_HAsciiString, theItems: any, theLocation: StepGeom_Axis2Placement3d): void;
  Init(theName: TCollection_HAsciiString, theItems: any): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theItems: any, theLocation: StepGeom_Axis2Placement3d): void;
  Init(theName: TCollection_HAsciiString, theItems: any): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theItems: any, theLocation: StepGeom_Axis2Placement3d): void;
  Init(theName: TCollection_HAsciiString, theItems: any): void;
  Init(aName: TCollection_HAsciiString): void;

  Location(): StepGeom_Axis2Placement3d;

  SetLocation(theLocation: StepGeom_Axis2Placement3d): void;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_RepositionedTessellatedItem: declare class StepVisual_RepositionedTessellatedItem extends StepVisual_TessellatedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  Init(theName: TCollection_HAsciiString, theLocation: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theName: TCollection_HAsciiString, theLocation: StepGeom_Axis2Placement3d): void;
  Init(aName: TCollection_HAsciiString): void;

  Location(): StepGeom_Axis2Placement3d;

  SetLocation(theLocation: StepGeom_Axis2Placement3d): void;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_ShadingSurfaceMethod: typeof StepVisual_ShadingSurfaceMethod[keyof typeof StepVisual_ShadingSurfaceMethod]

StepVisual_StyleContextSelect: declare class StepVisual_StyleContextSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  Representation(): StepRepr_Representation;

  RepresentationItem(): StepRepr_RepresentationItem;

  PresentationSet(): StepVisual_PresentationSet;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_StyledItem: declare class StepVisual_StyledItem extends StepRepr_RepresentationItem

  constructor

  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  SetStyles(aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment): void;

  Styles(): NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment;

  StylesValue(num: number): StepVisual_PresentationStyleAssignment;

  NbStyles(): number;

  SetItem(aItem: StepRepr_RepresentationItem): void;
  SetItem(aItem: StepVisual_StyledItemTarget): void;
  SetItem(aItem: StepRepr_RepresentationItem): void;
  SetItem(aItem: StepVisual_StyledItemTarget): void;

  Item(): StepRepr_RepresentationItem;

  ItemAP242(): StepVisual_StyledItemTarget;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_StyledItemTarget: declare class StepVisual_StyledItemTarget extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  GeometricRepresentationItem(): StepGeom_GeometricRepresentationItem;

  MappedItem(): StepRepr_MappedItem;

  Representation(): StepRepr_Representation;

  TopologicalRepresentationItem(): StepShape_TopologicalRepresentationItem;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceSide: typeof StepVisual_SurfaceSide[keyof typeof StepVisual_SurfaceSide]

StepVisual_SurfaceSideStyle: declare class StepVisual_SurfaceSideStyle extends Standard_Transient

  constructor

  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect): void;

  SetName(aName: TCollection_HAsciiString): void;

  Name(): TCollection_HAsciiString;

  SetStyles(aStyles: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect): void;

  Styles(): NCollection_HArray1_StepVisual_SurfaceStyleElementSelect;

  StylesValue(num: number): StepVisual_SurfaceStyleElementSelect;

  NbStyles(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleBoundary: declare class StepVisual_SurfaceStyleBoundary extends Standard_Transient

  constructor

  Init(aStyleOfBoundary: StepVisual_CurveStyle): void;

  SetStyleOfBoundary(aStyleOfBoundary: StepVisual_CurveStyle): void;

  StyleOfBoundary(): StepVisual_CurveStyle;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleControlGrid: declare class StepVisual_SurfaceStyleControlGrid extends Standard_Transient

  constructor

  Init(aStyleOfControlGrid: StepVisual_CurveStyle): void;

  SetStyleOfControlGrid(aStyleOfControlGrid: StepVisual_CurveStyle): void;

  StyleOfControlGrid(): StepVisual_CurveStyle;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleElementSelect: declare class StepVisual_SurfaceStyleElementSelect extends StepData_SelectType

  constructor

  CaseNum(ent: Standard_Transient): number;

  SurfaceStyleFillArea(): StepVisual_SurfaceStyleFillArea;

  SurfaceStyleBoundary(): StepVisual_SurfaceStyleBoundary;

  SurfaceStyleParameterLine(): StepVisual_SurfaceStyleParameterLine;

  SurfaceStyleRendering(): StepVisual_SurfaceStyleRendering;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleFillArea: declare class StepVisual_SurfaceStyleFillArea extends Standard_Transient

  constructor

  Init(aFillArea: StepVisual_FillAreaStyle): void;

  SetFillArea(aFillArea: StepVisual_FillAreaStyle): void;

  FillArea(): StepVisual_FillAreaStyle;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleParameterLine: declare class StepVisual_SurfaceStyleParameterLine extends Standard_Transient

  constructor

  Init(aStyleOfParameterLines: StepVisual_CurveStyle, aDirectionCounts: NCollection_HArray1_StepVisual_DirectionCountSelect): void;

  SetStyleOfParameterLines(aStyleOfParameterLines: StepVisual_CurveStyle): void;

  StyleOfParameterLines(): StepVisual_CurveStyle;

  SetDirectionCounts(aDirectionCounts: NCollection_HArray1_StepVisual_DirectionCountSelect): void;

  DirectionCounts(): NCollection_HArray1_StepVisual_DirectionCountSelect;

  DirectionCountsValue(num: number): StepVisual_DirectionCountSelect;

  NbDirectionCounts(): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleReflectanceAmbient: declare class StepVisual_SurfaceStyleReflectanceAmbient extends Standard_Transient

  constructor

  Init(theAmbientReflectance: number): void;

  AmbientReflectance(): number;

  SetAmbientReflectance(theAmbientReflectance: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleReflectanceAmbientDiffuse: declare class StepVisual_SurfaceStyleReflectanceAmbientDiffuse extends StepVisual_SurfaceStyleReflectanceAmbient

  constructor

  Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
  Init(theAmbientReflectance: number): void;
  Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
  Init(theAmbientReflectance: number): void;

  DiffuseReflectance(): number;

  SetDiffuseReflectance(theDiffuseReflectance: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular: declare class StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular extends StepVisual_SurfaceStyleReflectanceAmbientDiffuse

  constructor

  Init(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: StepVisual_Colour): void;
  Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
  Init(theAmbientReflectance: number): void;
  Init(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: StepVisual_Colour): void;
  Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
  Init(theAmbientReflectance: number): void;
  Init(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: StepVisual_Colour): void;
  Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
  Init(theAmbientReflectance: number): void;

  SpecularReflectance(): number;

  SetSpecularReflectance(theSpecularReflectance: number): void;

  SpecularExponent(): number;

  SetSpecularExponent(theSpecularExponent: number): void;

  SpecularColour(): StepVisual_Colour;

  SetSpecularColour(theSpecularColour: StepVisual_Colour): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleRendering: declare class StepVisual_SurfaceStyleRendering extends Standard_Transient

  constructor

  Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;

  RenderingMethod(): StepVisual_ShadingSurfaceMethod;

  SetRenderingMethod(theRenderingMethod: StepVisual_ShadingSurfaceMethod): void;

  SurfaceColour(): StepVisual_Colour;

  SetSurfaceColour(theSurfaceColour: StepVisual_Colour): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleRenderingWithProperties: declare class StepVisual_SurfaceStyleRenderingWithProperties extends StepVisual_SurfaceStyleRendering

  constructor

  Init(theSurfaceStyleRendering_RenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceStyleRendering_SurfaceColour: StepVisual_Colour, theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;
  Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;
  Init(theSurfaceStyleRendering_RenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceStyleRendering_SurfaceColour: StepVisual_Colour, theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;
  Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;

  Properties(): NCollection_HArray1_StepVisual_RenderingPropertiesSelect;

  SetProperties(theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleSegmentationCurve: declare class StepVisual_SurfaceStyleSegmentationCurve extends Standard_Transient

  constructor

  Init(aStyleOfSegmentationCurve: StepVisual_CurveStyle): void;

  SetStyleOfSegmentationCurve(aStyleOfSegmentationCurve: StepVisual_CurveStyle): void;

  StyleOfSegmentationCurve(): StepVisual_CurveStyle;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleSilhouette: declare class StepVisual_SurfaceStyleSilhouette extends Standard_Transient

  constructor

  Init(aStyleOfSilhouette: StepVisual_CurveStyle): void;

  SetStyleOfSilhouette(aStyleOfSilhouette: StepVisual_CurveStyle): void;

  StyleOfSilhouette(): StepVisual_CurveStyle;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleTransparent: declare class StepVisual_SurfaceStyleTransparent extends Standard_Transient

  constructor

  Init(theTransparency: number): void;

  Transparency(): number;

  SetTransparency(theTransparency: number): void;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_SurfaceStyleUsage: declare class StepVisual_SurfaceStyleUsage extends Standard_Transient

  constructor

  Init(aSide: StepVisual_SurfaceSide, aStyle: StepVisual_SurfaceSideStyle): void;

  SetSide(aSide: StepVisual_SurfaceSide): void;

  Side(): StepVisual_SurfaceSide;

  SetStyle(aStyle: StepVisual_SurfaceSideStyle): void;

  Style(): StepVisual_SurfaceSideStyle;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_Template: declare class StepVisual_Template extends StepRepr_Representation

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TemplateInstance: declare class StepVisual_TemplateInstance extends StepRepr_MappedItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedAnnotationOccurrence: declare class StepVisual_TessellatedAnnotationOccurrence extends StepVisual_StyledItem

  constructor

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;

StepVisual_TessellatedConnectingEdge: declare class StepVisual_TessellatedConnectingEdge extends StepVisual_TessellatedEdge

  constructor

  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedEdge_Coordinates: StepVisual_CoordinatesList, theHasTessellatedEdge_GeometricLink: boolean, theTessellatedEdge_GeometricLink: StepVisual_EdgeOrCurve, theTessellatedEdge_LineStrip: NCollection_HArray1_int, theSmooth: StepData_Logical, theFace1: StepVisual_TessellatedFace, theFace2: StepVisual_TessellatedFace, theLineStripFace1: NCollection_HArray1_int, theLineStripFace2: NCollection_HArray1_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedEdge_Coordinates: StepVisual_CoordinatesList, theHasTessellatedEdge_GeometricLink: boolean, theTessellatedEdge_GeometricLink: StepVisual_EdgeOrCurve, theTessellatedEdge_LineStrip: NCollection_HArray1_int, theSmooth: StepData_Logical, theFace1: StepVisual_TessellatedFace, theFace2: StepVisual_TessellatedFace, theLineStripFace1: NCollection_HArray1_int, theLineStripFace2: NCollection_HArray1_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedEdge_Coordinates: StepVisual_CoordinatesList, theHasTessellatedEdge_GeometricLink: boolean, theTessellatedEdge_GeometricLink: StepVisual_EdgeOrCurve, theTessellatedEdge_LineStrip: NCollection_HArray1_int, theSmooth: StepData_Logical, theFace1: StepVisual_TessellatedFace, theFace2: StepVisual_TessellatedFace, theLineStripFace1: NCollection_HArray1_int, theLineStripFace2: NCollection_HArray1_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;

  Smooth(): StepData_Logical;

  SetSmooth(theSmooth: StepData_Logical): void;

  Face1(): StepVisual_TessellatedFace;

  SetFace1(theFace1: StepVisual_TessellatedFace): void;

  Face2(): StepVisual_TessellatedFace;

  SetFace2(theFace2: StepVisual_TessellatedFace): void;

  LineStripFace1(): NCollection_HArray1_int;

  SetLineStripFace1(theLineStripFace1: NCollection_HArray1_int): void;

  NbLineStripFace1(): number;

  LineStripFace1Value(theNum: number): number;

  LineStripFace2(): NCollection_HArray1_int;

  SetLineStripFace2(theLineStripFace2: NCollection_HArray1_int): void;

  NbLineStripFace2(): number;

  LineStripFace2Value(theNum: number): number;

  static get_type_name(): string;

  static get_type_descriptor(): Standard_Type;

  DynamicType(): Standard_Type;

  delete(): void;

  [Symbol.dispose](): void;
