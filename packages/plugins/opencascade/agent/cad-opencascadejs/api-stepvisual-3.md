# libcascade — StepVisual (3)

37 top-level symbols. Signatures are verbatim typescript.

StepVisual_StyledItem: declare class StepVisual_StyledItem extends StepRepr_RepresentationItem

  // StepVisual_StyledItem.constructor (constructor)
  constructor();

  // StepVisual_StyledItem.Init (method)
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment, aItem: Standard_Transient): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_StyledItem.SetStyles (method)
  SetStyles(aStyles: NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment): void;

  // StepVisual_StyledItem.Styles (method)
  Styles(): NCollection_HArray1_handle_StepVisual_PresentationStyleAssignment;

  // StepVisual_StyledItem.StylesValue (method)
  StylesValue(num: number): StepVisual_PresentationStyleAssignment;

  // StepVisual_StyledItem.NbStyles (method)
  NbStyles(): number;

  // StepVisual_StyledItem.SetItem (method)
  SetItem(aItem: StepRepr_RepresentationItem): void;
  SetItem(aItem: StepVisual_StyledItemTarget): void;

  // StepVisual_StyledItem.Item (method)
  Item(): StepRepr_RepresentationItem;

  // StepVisual_StyledItem.ItemAP242 (method)
  ItemAP242(): StepVisual_StyledItemTarget;

  // StepVisual_StyledItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_StyledItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_StyledItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_StyledItem.delete (method)
  delete(): void;

  // StepVisual_StyledItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_StyledItemTarget: declare class StepVisual_StyledItemTarget extends StepData_SelectType

  // StepVisual_StyledItemTarget.constructor (constructor)
  constructor();

  // StepVisual_StyledItemTarget.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_StyledItemTarget.GeometricRepresentationItem (method)
  GeometricRepresentationItem(): StepGeom_GeometricRepresentationItem;

  // StepVisual_StyledItemTarget.MappedItem (method)
  MappedItem(): StepRepr_MappedItem;

  // StepVisual_StyledItemTarget.Representation (method)
  Representation(): StepRepr_Representation;

  // StepVisual_StyledItemTarget.TopologicalRepresentationItem (method)
  TopologicalRepresentationItem(): StepShape_TopologicalRepresentationItem;

  // StepVisual_StyledItemTarget.delete (method)
  delete(): void;

  // StepVisual_StyledItemTarget.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceSide: typeof StepVisual_SurfaceSide[keyof typeof StepVisual_SurfaceSide]

  readonly StepVisual_ssNegative: 'StepVisual_ssNegative'

  readonly StepVisual_ssPositive: 'StepVisual_ssPositive'

  readonly StepVisual_ssBoth: 'StepVisual_ssBoth'

StepVisual_SurfaceSideStyle: declare class StepVisual_SurfaceSideStyle extends Standard_Transient

  // StepVisual_SurfaceSideStyle.constructor (constructor)
  constructor();

  // StepVisual_SurfaceSideStyle.Init (method)
  Init(aName: TCollection_HAsciiString, aStyles: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect): void;

  // StepVisual_SurfaceSideStyle.SetName (method)
  SetName(aName: TCollection_HAsciiString): void;

  // StepVisual_SurfaceSideStyle.Name (method)
  Name(): TCollection_HAsciiString;

  // StepVisual_SurfaceSideStyle.SetStyles (method)
  SetStyles(aStyles: NCollection_HArray1_StepVisual_SurfaceStyleElementSelect): void;

  // StepVisual_SurfaceSideStyle.Styles (method)
  Styles(): NCollection_HArray1_StepVisual_SurfaceStyleElementSelect;

  // StepVisual_SurfaceSideStyle.StylesValue (method)
  StylesValue(num: number): StepVisual_SurfaceStyleElementSelect;

  // StepVisual_SurfaceSideStyle.NbStyles (method)
  NbStyles(): number;

  // StepVisual_SurfaceSideStyle.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceSideStyle.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceSideStyle.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceSideStyle.delete (method)
  delete(): void;

  // StepVisual_SurfaceSideStyle.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleBoundary: declare class StepVisual_SurfaceStyleBoundary extends Standard_Transient

  // StepVisual_SurfaceStyleBoundary.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleBoundary.Init (method)
  Init(aStyleOfBoundary: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleBoundary.SetStyleOfBoundary (method)
  SetStyleOfBoundary(aStyleOfBoundary: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleBoundary.StyleOfBoundary (method)
  StyleOfBoundary(): StepVisual_CurveStyle;

  // StepVisual_SurfaceStyleBoundary.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleBoundary.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleBoundary.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleBoundary.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleBoundary.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleControlGrid: declare class StepVisual_SurfaceStyleControlGrid extends Standard_Transient

  // StepVisual_SurfaceStyleControlGrid.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleControlGrid.Init (method)
  Init(aStyleOfControlGrid: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleControlGrid.SetStyleOfControlGrid (method)
  SetStyleOfControlGrid(aStyleOfControlGrid: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleControlGrid.StyleOfControlGrid (method)
  StyleOfControlGrid(): StepVisual_CurveStyle;

  // StepVisual_SurfaceStyleControlGrid.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleControlGrid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleControlGrid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleControlGrid.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleControlGrid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleElementSelect: declare class StepVisual_SurfaceStyleElementSelect extends StepData_SelectType

  // StepVisual_SurfaceStyleElementSelect.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleElementSelect.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_SurfaceStyleElementSelect.SurfaceStyleFillArea (method)
  SurfaceStyleFillArea(): StepVisual_SurfaceStyleFillArea;

  // StepVisual_SurfaceStyleElementSelect.SurfaceStyleBoundary (method)
  SurfaceStyleBoundary(): StepVisual_SurfaceStyleBoundary;

  // StepVisual_SurfaceStyleElementSelect.SurfaceStyleParameterLine (method)
  SurfaceStyleParameterLine(): StepVisual_SurfaceStyleParameterLine;

  // StepVisual_SurfaceStyleElementSelect.SurfaceStyleRendering (method)
  SurfaceStyleRendering(): StepVisual_SurfaceStyleRendering;

  // StepVisual_SurfaceStyleElementSelect.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleElementSelect.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleFillArea: declare class StepVisual_SurfaceStyleFillArea extends Standard_Transient

  // StepVisual_SurfaceStyleFillArea.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleFillArea.Init (method)
  Init(aFillArea: StepVisual_FillAreaStyle): void;

  // StepVisual_SurfaceStyleFillArea.SetFillArea (method)
  SetFillArea(aFillArea: StepVisual_FillAreaStyle): void;

  // StepVisual_SurfaceStyleFillArea.FillArea (method)
  FillArea(): StepVisual_FillAreaStyle;

  // StepVisual_SurfaceStyleFillArea.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleFillArea.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleFillArea.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleFillArea.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleFillArea.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleParameterLine: declare class StepVisual_SurfaceStyleParameterLine extends Standard_Transient

  // StepVisual_SurfaceStyleParameterLine.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleParameterLine.Init (method)
  Init(aStyleOfParameterLines: StepVisual_CurveStyle, aDirectionCounts: NCollection_HArray1_StepVisual_DirectionCountSelect): void;

  // StepVisual_SurfaceStyleParameterLine.SetStyleOfParameterLines (method)
  SetStyleOfParameterLines(aStyleOfParameterLines: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleParameterLine.StyleOfParameterLines (method)
  StyleOfParameterLines(): StepVisual_CurveStyle;

  // StepVisual_SurfaceStyleParameterLine.SetDirectionCounts (method)
  SetDirectionCounts(aDirectionCounts: NCollection_HArray1_StepVisual_DirectionCountSelect): void;

  // StepVisual_SurfaceStyleParameterLine.DirectionCounts (method)
  DirectionCounts(): NCollection_HArray1_StepVisual_DirectionCountSelect;

  // StepVisual_SurfaceStyleParameterLine.DirectionCountsValue (method)
  DirectionCountsValue(num: number): StepVisual_DirectionCountSelect;

  // StepVisual_SurfaceStyleParameterLine.NbDirectionCounts (method)
  NbDirectionCounts(): number;

  // StepVisual_SurfaceStyleParameterLine.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleParameterLine.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleParameterLine.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleParameterLine.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleParameterLine.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleReflectanceAmbient: declare class StepVisual_SurfaceStyleReflectanceAmbient extends Standard_Transient

  // StepVisual_SurfaceStyleReflectanceAmbient.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleReflectanceAmbient.Init (method)
  Init(theAmbientReflectance: number): void;

  // StepVisual_SurfaceStyleReflectanceAmbient.AmbientReflectance (method)
  AmbientReflectance(): number;

  // StepVisual_SurfaceStyleReflectanceAmbient.SetAmbientReflectance (method)
  SetAmbientReflectance(theAmbientReflectance: number): void;

  // StepVisual_SurfaceStyleReflectanceAmbient.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleReflectanceAmbient.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleReflectanceAmbient.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleReflectanceAmbient.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleReflectanceAmbient.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleReflectanceAmbientDiffuse: declare class StepVisual_SurfaceStyleReflectanceAmbientDiffuse extends StepVisual_SurfaceStyleReflectanceAmbient

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.Init (method)
  Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
  Init(theAmbientReflectance: number): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.DiffuseReflectance (method)
  DiffuseReflectance(): number;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.SetDiffuseReflectance (method)
  SetDiffuseReflectance(theDiffuseReflectance: number): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuse.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular: declare class StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular extends StepVisual_SurfaceStyleReflectanceAmbientDiffuse

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.Init (method)
  Init(theAmbientReflectance: number, theDiffuseReflectance: number, theSpecularReflectance: number, theSpecularExponent: number, theSpecularColour: StepVisual_Colour): void;
  Init(theAmbientReflectance: number, theDiffuseReflectance: number): void;
  Init(theAmbientReflectance: number): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.SpecularReflectance (method)
  SpecularReflectance(): number;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.SetSpecularReflectance (method)
  SetSpecularReflectance(theSpecularReflectance: number): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.SpecularExponent (method)
  SpecularExponent(): number;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.SetSpecularExponent (method)
  SetSpecularExponent(theSpecularExponent: number): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.SpecularColour (method)
  SpecularColour(): StepVisual_Colour;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.SetSpecularColour (method)
  SetSpecularColour(theSpecularColour: StepVisual_Colour): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleReflectanceAmbientDiffuseSpecular.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleRendering: declare class StepVisual_SurfaceStyleRendering extends Standard_Transient

  // StepVisual_SurfaceStyleRendering.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleRendering.Init (method)
  Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;

  // StepVisual_SurfaceStyleRendering.RenderingMethod (method)
  RenderingMethod(): StepVisual_ShadingSurfaceMethod;

  // StepVisual_SurfaceStyleRendering.SetRenderingMethod (method)
  SetRenderingMethod(theRenderingMethod: StepVisual_ShadingSurfaceMethod): void;

  // StepVisual_SurfaceStyleRendering.SurfaceColour (method)
  SurfaceColour(): StepVisual_Colour;

  // StepVisual_SurfaceStyleRendering.SetSurfaceColour (method)
  SetSurfaceColour(theSurfaceColour: StepVisual_Colour): void;

  // StepVisual_SurfaceStyleRendering.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleRendering.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleRendering.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleRendering.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleRendering.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleRenderingWithProperties: declare class StepVisual_SurfaceStyleRenderingWithProperties extends StepVisual_SurfaceStyleRendering

  // StepVisual_SurfaceStyleRenderingWithProperties.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleRenderingWithProperties.Init (method)
  Init(theSurfaceStyleRendering_RenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceStyleRendering_SurfaceColour: StepVisual_Colour, theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;
  Init(theRenderingMethod: StepVisual_ShadingSurfaceMethod, theSurfaceColour: StepVisual_Colour): void;

  // StepVisual_SurfaceStyleRenderingWithProperties.Properties (method)
  Properties(): NCollection_HArray1_StepVisual_RenderingPropertiesSelect;

  // StepVisual_SurfaceStyleRenderingWithProperties.SetProperties (method)
  SetProperties(theProperties: NCollection_HArray1_StepVisual_RenderingPropertiesSelect): void;

  // StepVisual_SurfaceStyleRenderingWithProperties.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleRenderingWithProperties.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleRenderingWithProperties.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleRenderingWithProperties.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleRenderingWithProperties.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleSegmentationCurve: declare class StepVisual_SurfaceStyleSegmentationCurve extends Standard_Transient

  // StepVisual_SurfaceStyleSegmentationCurve.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleSegmentationCurve.Init (method)
  Init(aStyleOfSegmentationCurve: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleSegmentationCurve.SetStyleOfSegmentationCurve (method)
  SetStyleOfSegmentationCurve(aStyleOfSegmentationCurve: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleSegmentationCurve.StyleOfSegmentationCurve (method)
  StyleOfSegmentationCurve(): StepVisual_CurveStyle;

  // StepVisual_SurfaceStyleSegmentationCurve.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleSegmentationCurve.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleSegmentationCurve.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleSegmentationCurve.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleSegmentationCurve.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleSilhouette: declare class StepVisual_SurfaceStyleSilhouette extends Standard_Transient

  // StepVisual_SurfaceStyleSilhouette.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleSilhouette.Init (method)
  Init(aStyleOfSilhouette: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleSilhouette.SetStyleOfSilhouette (method)
  SetStyleOfSilhouette(aStyleOfSilhouette: StepVisual_CurveStyle): void;

  // StepVisual_SurfaceStyleSilhouette.StyleOfSilhouette (method)
  StyleOfSilhouette(): StepVisual_CurveStyle;

  // StepVisual_SurfaceStyleSilhouette.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleSilhouette.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleSilhouette.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleSilhouette.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleSilhouette.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleTransparent: declare class StepVisual_SurfaceStyleTransparent extends Standard_Transient

  // StepVisual_SurfaceStyleTransparent.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleTransparent.Init (method)
  Init(theTransparency: number): void;

  // StepVisual_SurfaceStyleTransparent.Transparency (method)
  Transparency(): number;

  // StepVisual_SurfaceStyleTransparent.SetTransparency (method)
  SetTransparency(theTransparency: number): void;

  // StepVisual_SurfaceStyleTransparent.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleTransparent.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleTransparent.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleTransparent.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleTransparent.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_SurfaceStyleUsage: declare class StepVisual_SurfaceStyleUsage extends Standard_Transient

  // StepVisual_SurfaceStyleUsage.constructor (constructor)
  constructor();

  // StepVisual_SurfaceStyleUsage.Init (method)
  Init(aSide: StepVisual_SurfaceSide, aStyle: StepVisual_SurfaceSideStyle): void;

  // StepVisual_SurfaceStyleUsage.SetSide (method)
  SetSide(aSide: StepVisual_SurfaceSide): void;

  // StepVisual_SurfaceStyleUsage.Side (method)
  Side(): StepVisual_SurfaceSide;

  // StepVisual_SurfaceStyleUsage.SetStyle (method)
  SetStyle(aStyle: StepVisual_SurfaceSideStyle): void;

  // StepVisual_SurfaceStyleUsage.Style (method)
  Style(): StepVisual_SurfaceSideStyle;

  // StepVisual_SurfaceStyleUsage.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_SurfaceStyleUsage.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_SurfaceStyleUsage.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_SurfaceStyleUsage.delete (method)
  delete(): void;

  // StepVisual_SurfaceStyleUsage.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_Template: declare class StepVisual_Template extends StepRepr_Representation

  // StepVisual_Template.constructor (constructor)
  constructor();

  // StepVisual_Template.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_Template.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_Template.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_Template.delete (method)
  delete(): void;

  // StepVisual_Template.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TemplateInstance: declare class StepVisual_TemplateInstance extends StepRepr_MappedItem

  // StepVisual_TemplateInstance.constructor (constructor)
  constructor();

  // StepVisual_TemplateInstance.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TemplateInstance.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TemplateInstance.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TemplateInstance.delete (method)
  delete(): void;

  // StepVisual_TemplateInstance.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedAnnotationOccurrence: declare class StepVisual_TessellatedAnnotationOccurrence extends StepVisual_StyledItem

  // StepVisual_TessellatedAnnotationOccurrence.constructor (constructor)
  constructor();

  // StepVisual_TessellatedAnnotationOccurrence.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedAnnotationOccurrence.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedAnnotationOccurrence.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedAnnotationOccurrence.delete (method)
  delete(): void;

  // StepVisual_TessellatedAnnotationOccurrence.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedConnectingEdge: declare class StepVisual_TessellatedConnectingEdge extends StepVisual_TessellatedEdge

  // StepVisual_TessellatedConnectingEdge.constructor (constructor)
  constructor();

  // StepVisual_TessellatedConnectingEdge.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theTessellatedEdge_Coordinates: StepVisual_CoordinatesList, theHasTessellatedEdge_GeometricLink: boolean, theTessellatedEdge_GeometricLink: StepVisual_EdgeOrCurve, theTessellatedEdge_LineStrip: NCollection_HArray1_int, theSmooth: StepData_Logical, theFace1: StepVisual_TessellatedFace, theFace2: StepVisual_TessellatedFace, theLineStripFace1: NCollection_HArray1_int, theLineStripFace2: NCollection_HArray1_int): void;
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedConnectingEdge.Smooth (method)
  Smooth(): StepData_Logical;

  // StepVisual_TessellatedConnectingEdge.SetSmooth (method)
  SetSmooth(theSmooth: StepData_Logical): void;

  // StepVisual_TessellatedConnectingEdge.Face1 (method)
  Face1(): StepVisual_TessellatedFace;

  // StepVisual_TessellatedConnectingEdge.SetFace1 (method)
  SetFace1(theFace1: StepVisual_TessellatedFace): void;

  // StepVisual_TessellatedConnectingEdge.Face2 (method)
  Face2(): StepVisual_TessellatedFace;

  // StepVisual_TessellatedConnectingEdge.SetFace2 (method)
  SetFace2(theFace2: StepVisual_TessellatedFace): void;

  // StepVisual_TessellatedConnectingEdge.LineStripFace1 (method)
  LineStripFace1(): NCollection_HArray1_int;

  // StepVisual_TessellatedConnectingEdge.SetLineStripFace1 (method)
  SetLineStripFace1(theLineStripFace1: NCollection_HArray1_int): void;

  // StepVisual_TessellatedConnectingEdge.NbLineStripFace1 (method)
  NbLineStripFace1(): number;

  // StepVisual_TessellatedConnectingEdge.LineStripFace1Value (method)
  LineStripFace1Value(theNum: number): number;

  // StepVisual_TessellatedConnectingEdge.LineStripFace2 (method)
  LineStripFace2(): NCollection_HArray1_int;

  // StepVisual_TessellatedConnectingEdge.SetLineStripFace2 (method)
  SetLineStripFace2(theLineStripFace2: NCollection_HArray1_int): void;

  // StepVisual_TessellatedConnectingEdge.NbLineStripFace2 (method)
  NbLineStripFace2(): number;

  // StepVisual_TessellatedConnectingEdge.LineStripFace2Value (method)
  LineStripFace2Value(theNum: number): number;

  // StepVisual_TessellatedConnectingEdge.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedConnectingEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedConnectingEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedConnectingEdge.delete (method)
  delete(): void;

  // StepVisual_TessellatedConnectingEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedCurveSet: declare class StepVisual_TessellatedCurveSet extends StepVisual_TessellatedItem

  // StepVisual_TessellatedCurveSet.constructor (constructor)
  constructor();

  // StepVisual_TessellatedCurveSet.Init (method)
  Init(theName: TCollection_HAsciiString, theCoordList: StepVisual_CoordinatesList, theCurves: any): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedCurveSet.CoordList (method)
  CoordList(): StepVisual_CoordinatesList;

  // StepVisual_TessellatedCurveSet.Curves (method)
  Curves(): any;

  // StepVisual_TessellatedCurveSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedCurveSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedCurveSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedCurveSet.delete (method)
  delete(): void;

  // StepVisual_TessellatedCurveSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedEdge: declare class StepVisual_TessellatedEdge extends StepVisual_TessellatedStructuredItem

  // StepVisual_TessellatedEdge.constructor (constructor)
  constructor();

  // StepVisual_TessellatedEdge.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasGeometricLink: boolean, theGeometricLink: StepVisual_EdgeOrCurve, theLineStrip: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedEdge.Coordinates (method)
  Coordinates(): StepVisual_CoordinatesList;

  // StepVisual_TessellatedEdge.SetCoordinates (method)
  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  // StepVisual_TessellatedEdge.GeometricLink (method)
  GeometricLink(): StepVisual_EdgeOrCurve;

  // StepVisual_TessellatedEdge.SetGeometricLink (method)
  SetGeometricLink(theGeometricLink: StepVisual_EdgeOrCurve): void;

  // StepVisual_TessellatedEdge.HasGeometricLink (method)
  HasGeometricLink(): boolean;

  // StepVisual_TessellatedEdge.LineStrip (method)
  LineStrip(): NCollection_HArray1_int;

  // StepVisual_TessellatedEdge.SetLineStrip (method)
  SetLineStrip(theLineStrip: NCollection_HArray1_int): void;

  // StepVisual_TessellatedEdge.NbLineStrip (method)
  NbLineStrip(): number;

  // StepVisual_TessellatedEdge.LineStripValue (method)
  LineStripValue(theNum: number): number;

  // StepVisual_TessellatedEdge.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedEdge.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedEdge.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedEdge.delete (method)
  delete(): void;

  // StepVisual_TessellatedEdge.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedEdgeOrVertex: declare class StepVisual_TessellatedEdgeOrVertex extends StepData_SelectType

  // StepVisual_TessellatedEdgeOrVertex.constructor (constructor)
  constructor();

  // StepVisual_TessellatedEdgeOrVertex.CaseNum (method)
  CaseNum(ent: Standard_Transient): number;

  // StepVisual_TessellatedEdgeOrVertex.TessellatedEdge (method)
  TessellatedEdge(): StepVisual_TessellatedEdge;

  // StepVisual_TessellatedEdgeOrVertex.TessellatedVertex (method)
  TessellatedVertex(): StepVisual_TessellatedVertex;

  // StepVisual_TessellatedEdgeOrVertex.delete (method)
  delete(): void;

  // StepVisual_TessellatedEdgeOrVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedFace: declare class StepVisual_TessellatedFace extends StepVisual_TessellatedStructuredItem

  // StepVisual_TessellatedFace.constructor (constructor)
  constructor();

  // StepVisual_TessellatedFace.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double, theHasGeometricLink: boolean, theGeometricLink: StepVisual_FaceOrSurface): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedFace.Coordinates (method)
  Coordinates(): StepVisual_CoordinatesList;

  // StepVisual_TessellatedFace.SetCoordinates (method)
  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  // StepVisual_TessellatedFace.Pnmax (method)
  Pnmax(): number;

  // StepVisual_TessellatedFace.SetPnmax (method)
  SetPnmax(thePnmax: number): void;

  // StepVisual_TessellatedFace.Normals (method)
  Normals(): NCollection_HArray2_double;

  // StepVisual_TessellatedFace.SetNormals (method)
  SetNormals(theNormals: NCollection_HArray2_double): void;

  // StepVisual_TessellatedFace.NbNormals (method)
  NbNormals(): number;

  // StepVisual_TessellatedFace.GeometricLink (method)
  GeometricLink(): StepVisual_FaceOrSurface;

  // StepVisual_TessellatedFace.SetGeometricLink (method)
  SetGeometricLink(theGeometricLink: StepVisual_FaceOrSurface): void;

  // StepVisual_TessellatedFace.HasGeometricLink (method)
  HasGeometricLink(): boolean;

  // StepVisual_TessellatedFace.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedFace.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedFace.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedFace.delete (method)
  delete(): void;

  // StepVisual_TessellatedFace.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedGeometricSet: declare class StepVisual_TessellatedGeometricSet extends StepVisual_TessellatedItem

  // StepVisual_TessellatedGeometricSet.constructor (constructor)
  constructor();

  // StepVisual_TessellatedGeometricSet.Init (method)
  Init(theName: TCollection_HAsciiString, theItems: any): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedGeometricSet.Items (method)
  Items(): any;

  // StepVisual_TessellatedGeometricSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedGeometricSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedGeometricSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedGeometricSet.delete (method)
  delete(): void;

  // StepVisual_TessellatedGeometricSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedItem: declare class StepVisual_TessellatedItem extends StepGeom_GeometricRepresentationItem

  // StepVisual_TessellatedItem.constructor (constructor)
  constructor();

  // StepVisual_TessellatedItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedItem.delete (method)
  delete(): void;

  // StepVisual_TessellatedItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedPointSet: declare class StepVisual_TessellatedPointSet extends StepVisual_TessellatedItem

  // StepVisual_TessellatedPointSet.constructor (constructor)
  constructor();

  // StepVisual_TessellatedPointSet.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePointList: NCollection_HArray1_int): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedPointSet.Coordinates (method)
  Coordinates(): StepVisual_CoordinatesList;

  // StepVisual_TessellatedPointSet.SetCoordinates (method)
  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  // StepVisual_TessellatedPointSet.PointList (method)
  PointList(): NCollection_HArray1_int;

  // StepVisual_TessellatedPointSet.SetPointList (method)
  SetPointList(thePointList: NCollection_HArray1_int): void;

  // StepVisual_TessellatedPointSet.NbPointList (method)
  NbPointList(): number;

  // StepVisual_TessellatedPointSet.PointListValue (method)
  PointListValue(theNum: number): number;

  // StepVisual_TessellatedPointSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedPointSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedPointSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedPointSet.delete (method)
  delete(): void;

  // StepVisual_TessellatedPointSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedShapeRepresentation: declare class StepVisual_TessellatedShapeRepresentation extends StepShape_ShapeRepresentation

  // StepVisual_TessellatedShapeRepresentation.constructor (constructor)
  constructor();

  // StepVisual_TessellatedShapeRepresentation.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedShapeRepresentation.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedShapeRepresentation.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedShapeRepresentation.delete (method)
  delete(): void;

  // StepVisual_TessellatedShapeRepresentation.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedShapeRepresentationWithAccuracyParameters: declare class StepVisual_TessellatedShapeRepresentationWithAccuracyParameters extends StepVisual_TessellatedShapeRepresentation

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.constructor (constructor)
  constructor();

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.Init (method)
  Init(theRepresentation_Name: TCollection_HAsciiString, theRepresentation_Items: NCollection_HArray1_handle_StepRepr_RepresentationItem, theRepresentation_ContextOfItems: StepRepr_RepresentationContext, theTessellationAccuracyParameters: NCollection_HArray1_double): void;
  Init(aName: TCollection_HAsciiString, aItems: NCollection_HArray1_handle_StepRepr_RepresentationItem, aContextOfItems: StepRepr_RepresentationContext): void;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.TessellationAccuracyParameters (method)
  TessellationAccuracyParameters(): NCollection_HArray1_double;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.SetTessellationAccuracyParameters (method)
  SetTessellationAccuracyParameters(theTessellationAccuracyParameters: NCollection_HArray1_double): void;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.NbTessellationAccuracyParameters (method)
  NbTessellationAccuracyParameters(): number;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.TessellationAccuracyParametersValue (method)
  TessellationAccuracyParametersValue(theNum: number): number;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.delete (method)
  delete(): void;

  // StepVisual_TessellatedShapeRepresentationWithAccuracyParameters.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedShell: declare class StepVisual_TessellatedShell extends StepVisual_TessellatedItem

  // StepVisual_TessellatedShell.constructor (constructor)
  constructor();

  // StepVisual_TessellatedShell.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_ConnectedFaceSet): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedShell.Items (method)
  Items(): NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem;

  // StepVisual_TessellatedShell.SetItems (method)
  SetItems(theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem): void;

  // StepVisual_TessellatedShell.NbItems (method)
  NbItems(): number;

  // StepVisual_TessellatedShell.ItemsValue (method)
  ItemsValue(theNum: number): StepVisual_TessellatedStructuredItem;

  // StepVisual_TessellatedShell.TopologicalLink (method)
  TopologicalLink(): StepShape_ConnectedFaceSet;

  // StepVisual_TessellatedShell.SetTopologicalLink (method)
  SetTopologicalLink(theTopologicalLink: StepShape_ConnectedFaceSet): void;

  // StepVisual_TessellatedShell.HasTopologicalLink (method)
  HasTopologicalLink(): boolean;

  // StepVisual_TessellatedShell.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedShell.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedShell.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedShell.delete (method)
  delete(): void;

  // StepVisual_TessellatedShell.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedSolid: declare class StepVisual_TessellatedSolid extends StepVisual_TessellatedItem

  // StepVisual_TessellatedSolid.constructor (constructor)
  constructor();

  // StepVisual_TessellatedSolid.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem, theHasGeometricLink: boolean, theGeometricLink: StepShape_ManifoldSolidBrep): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedSolid.Items (method)
  Items(): NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem;

  // StepVisual_TessellatedSolid.SetItems (method)
  SetItems(theItems: NCollection_HArray1_handle_StepVisual_TessellatedStructuredItem): void;

  // StepVisual_TessellatedSolid.NbItems (method)
  NbItems(): number;

  // StepVisual_TessellatedSolid.ItemsValue (method)
  ItemsValue(theNum: number): StepVisual_TessellatedStructuredItem;

  // StepVisual_TessellatedSolid.GeometricLink (method)
  GeometricLink(): StepShape_ManifoldSolidBrep;

  // StepVisual_TessellatedSolid.SetGeometricLink (method)
  SetGeometricLink(theGeometricLink: StepShape_ManifoldSolidBrep): void;

  // StepVisual_TessellatedSolid.HasGeometricLink (method)
  HasGeometricLink(): boolean;

  // StepVisual_TessellatedSolid.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedSolid.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedSolid.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedSolid.delete (method)
  delete(): void;

  // StepVisual_TessellatedSolid.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedStructuredItem: declare class StepVisual_TessellatedStructuredItem extends StepVisual_TessellatedItem

  // StepVisual_TessellatedStructuredItem.constructor (constructor)
  constructor();

  // StepVisual_TessellatedStructuredItem.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedStructuredItem.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedStructuredItem.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedStructuredItem.delete (method)
  delete(): void;

  // StepVisual_TessellatedStructuredItem.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedSurfaceSet: declare class StepVisual_TessellatedSurfaceSet extends StepVisual_TessellatedItem

  // StepVisual_TessellatedSurfaceSet.constructor (constructor)
  constructor();

  // StepVisual_TessellatedSurfaceSet.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, thePnmax: number, theNormals: NCollection_HArray2_double): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedSurfaceSet.Coordinates (method)
  Coordinates(): StepVisual_CoordinatesList;

  // StepVisual_TessellatedSurfaceSet.SetCoordinates (method)
  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  // StepVisual_TessellatedSurfaceSet.Pnmax (method)
  Pnmax(): number;

  // StepVisual_TessellatedSurfaceSet.SetPnmax (method)
  SetPnmax(thePnmax: number): void;

  // StepVisual_TessellatedSurfaceSet.Normals (method)
  Normals(): NCollection_HArray2_double;

  // StepVisual_TessellatedSurfaceSet.SetNormals (method)
  SetNormals(theNormals: NCollection_HArray2_double): void;

  // StepVisual_TessellatedSurfaceSet.NbNormals (method)
  NbNormals(): number;

  // StepVisual_TessellatedSurfaceSet.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedSurfaceSet.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedSurfaceSet.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedSurfaceSet.delete (method)
  delete(): void;

  // StepVisual_TessellatedSurfaceSet.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedVertex: declare class StepVisual_TessellatedVertex extends StepVisual_TessellatedStructuredItem

  // StepVisual_TessellatedVertex.constructor (constructor)
  constructor();

  // StepVisual_TessellatedVertex.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theCoordinates: StepVisual_CoordinatesList, theHasTopologicalLink: boolean, theTopologicalLink: StepShape_VertexPoint, thePointIndex: number): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedVertex.Coordinates (method)
  Coordinates(): StepVisual_CoordinatesList;

  // StepVisual_TessellatedVertex.SetCoordinates (method)
  SetCoordinates(theCoordinates: StepVisual_CoordinatesList): void;

  // StepVisual_TessellatedVertex.TopologicalLink (method)
  TopologicalLink(): StepShape_VertexPoint;

  // StepVisual_TessellatedVertex.SetTopologicalLink (method)
  SetTopologicalLink(theTopologicalLink: StepShape_VertexPoint): void;

  // StepVisual_TessellatedVertex.HasTopologicalLink (method)
  HasTopologicalLink(): boolean;

  // StepVisual_TessellatedVertex.PointIndex (method)
  PointIndex(): number;

  // StepVisual_TessellatedVertex.SetPointIndex (method)
  SetPointIndex(thePointIndex: number): void;

  // StepVisual_TessellatedVertex.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedVertex.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedVertex.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedVertex.delete (method)
  delete(): void;

  // StepVisual_TessellatedVertex.[Symbol.dispose] (method)
  [Symbol.dispose](): void;

StepVisual_TessellatedWire: declare class StepVisual_TessellatedWire extends StepVisual_TessellatedItem

  // StepVisual_TessellatedWire.constructor (constructor)
  constructor();

  // StepVisual_TessellatedWire.Init (method)
  Init(theRepresentationItem_Name: TCollection_HAsciiString, theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex, theHasGeometricModelLink: boolean, theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;
  Init(aName: TCollection_HAsciiString): void;

  // StepVisual_TessellatedWire.Items (method)
  Items(): NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex;

  // StepVisual_TessellatedWire.SetItems (method)
  SetItems(theItems: NCollection_HArray1_StepVisual_TessellatedEdgeOrVertex): void;

  // StepVisual_TessellatedWire.NbItems (method)
  NbItems(): number;

  // StepVisual_TessellatedWire.ItemsValue (method)
  ItemsValue(theNum: number): StepVisual_TessellatedEdgeOrVertex;

  // StepVisual_TessellatedWire.GeometricModelLink (method)
  GeometricModelLink(): StepVisual_PathOrCompositeCurve;

  // StepVisual_TessellatedWire.SetGeometricModelLink (method)
  SetGeometricModelLink(theGeometricModelLink: StepVisual_PathOrCompositeCurve): void;

  // StepVisual_TessellatedWire.HasGeometricModelLink (method)
  HasGeometricModelLink(): boolean;

  // StepVisual_TessellatedWire.get_type_name (method)
  static get_type_name(): string;

  // StepVisual_TessellatedWire.get_type_descriptor (method)
  static get_type_descriptor(): Standard_Type;

  // StepVisual_TessellatedWire.DynamicType (method)
  DynamicType(): Standard_Type;

  // StepVisual_TessellatedWire.delete (method)
  delete(): void;

  // StepVisual_TessellatedWire.[Symbol.dispose] (method)
  [Symbol.dispose](): void;
