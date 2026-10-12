# @tscircuit/core — Shared props

5 top-level symbols. Signatures are verbatim typescript.

// Category: Shared props
// Props every element extending CommonComponentProps accepts
CommonComponentProps: interface CommonComponentProps extends CommonLayoutProps

  name: string

  displayName?: string

  datasheetUrl?: string

  pinAttributes?: Record<PinLabel, PinAttributeMap>

  supplierPartNumbers?: SupplierPartNumbers

  cadModel?: CadModelProp

  kicadFootprintMetadata?: KicadFootprintMetadata

  kicadSymbolMetadata?: KicadSymbolMetadata

  children?: any

  symbolName?: string

  doNotPlace?: boolean

  // Allows the PCB component to hang off the board (e.g
  allowOffBoard?: boolean

  // Does this component take up all the space within its bounds on a layer
  obstructsWithinBounds?: boolean

  // Whether to show this component's CAD model as translucent in the 3D viewer
  showAsTranslucentModel?: boolean

  mfn?: string

  manufacturerPartNumber?: string

  // This component will be drawn as part of this section e.g
  schSectionName?: string

  // This component will be drawn as part of this sheet e.g
  schSheetName?: string

// Category: Shared props
// Props every element extending SubcircuitGroupProps accepts
SubcircuitGroupProps: interface SubcircuitGroupProps extends BaseGroupProps

  manualEdits?: ManualEditsFileInput

  routingDisabled?: boolean

  // Skip the PCB placement design rule checks for this subcircuit
  placementDrcChecksDisabled?: boolean

  bomDisabled?: boolean

  defaultTraceWidth?: Distance

  pcbRouteCache?: PcbRouteCache

  autorouter?: AutorouterProp

  autorouterEffortLevel?: "1x" | "2x" | "5x" | "10x" | "100x"

  // Selects the local autorouting pipeline
  autorouterVersion?: "beta_pipeline1" | "beta_pipeline3" | "beta_pipeline4" | "beta_pipeline5" | "beta_pipeline7" | "beta_pipeline9" | "latest" | (string & {})

  // Serialized circuit JSON describing a precompiled subcircuit
  circuitJson?: any[]

  // Nets from this subcircuit that should be exposed to parent circuits
  exposedNets?: string[]

  // If true, all nets defined within this subcircuit are exposed to parent circuits
  exposeNets?: boolean

  // If true, we'll automatically layout the schematic for this group
  schAutoLayoutEnabled?: boolean

  // If true, net labels will automatically be created for complex traces
  schTraceAutoLabelEnabled?: boolean

  // Maximum length a trace can span on the schematic
  schMaxTraceDistance?: Distance

  partsEngine?: PartsEngine

  // When autosizing, the board will be made square
  square?: boolean

  // Desired empty area of the board e.g
  emptyArea?: string

  // Desired filled area of the board e.g
  filledArea?: string

  outline?: Point[]

  outlineOffsetX?: number | string

  outlineOffsetY?: number | string

  minViaHoleEdgeToViaHoleEdgeClearance?: Distance

  minPlatedHoleDrillEdgeToDrillEdgeClearance?: Distance

  minTraceToPadEdgeClearance?: Distance

  minPadEdgeToPadEdgeClearance?: Distance

  minBoardEdgeClearance?: Distance

  minViaEdgeToPadEdgeClearance?: Distance

  minViaHoleDiameter?: Distance

  minViaPadDiameter?: Distance

// Category: Shared props
// Props every element extending BaseGroupProps accepts
BaseGroupProps: interface BaseGroupProps extends CommonLayoutProps

  name?: string

  children?: any

  // Title to display above this group in the schematic view
  schTitle?: string

  // This group will be drawn as part of this sheet e.g
  schSheetName?: string

  // If true, render this group as a single schematic box
  showAsSchematicBox?: boolean

  // Mapping of external pin names to internal connection targets
  connections?: Connections

  // Arrangement for pins when rendered as a schematic box
  schPinArrangement?: SchematicPinArrangement

  // Styles to apply to individual pins in the schematic box representation
  schPinStyle?: SchematicPinStyle

  pcbWidth?: Distance

  pcbHeight?: Distance

  minTraceWidth?: Distance

  nominalTraceWidth?: Distance

  schWidth?: Distance

  schHeight?: Distance

  pcbLayout?: LayoutConfig

  schLayout?: LayoutConfig

  cellBorder?: Border | null

  border?: Border | null

  schPadding?: Distance

  schPaddingLeft?: Distance

  schPaddingRight?: Distance

  schPaddingTop?: Distance

  schPaddingBottom?: Distance

  pcbPadding?: Distance

  pcbPaddingLeft?: Distance

  pcbPaddingRight?: Distance

  pcbPaddingTop?: Distance

  pcbPaddingBottom?: Distance

  // Anchor to use when interpreting pcbX/pcbY/pcbOffsetX/pcbOffsetY relative to pcbPosition
  pcbAnchorAlignment?: AutocompleteString<"top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right">

  pcbGrid?: boolean

  pcbGridCols?: number | string

  pcbGridRows?: number | string

  pcbGridTemplateRows?: string

  pcbGridTemplateColumns?: string

  pcbGridTemplate?: string

  pcbGridGap?: number | string

  pcbGridRowGap?: number | string

  pcbGridColumnGap?: number | string

  pcbFlex?: boolean | string

  pcbFlexGap?: number | string

  pcbFlexDirection?: "row" | "column"

  pcbAlignItems?: "start" | "center" | "end" | "stretch"

  pcbJustifyContent?: "start" | "center" | "end" | "stretch" | "space-between" | "space-around" | "space-evenly"

  pcbFlexRow?: boolean

  pcbFlexColumn?: boolean

  pcbGap?: number | string

  pcbPack?: boolean

  pcbPackGap?: number | string

  schGrid?: boolean

  schGridCols?: number | string

  schGridRows?: number | string

  schGridTemplateRows?: string

  schGridTemplateColumns?: string

  schGridTemplate?: string

  schGridGap?: number | string

  schGridRowGap?: number | string

  schGridColumnGap?: number | string

  schFlex?: boolean | string

  schFlexGap?: number | string

  schFlexDirection?: "row" | "column"

  schAlignItems?: "start" | "center" | "end" | "stretch"

  schJustifyContent?: "start" | "center" | "end" | "stretch" | "space-between" | "space-around" | "space-evenly"

  schFlexRow?: boolean

  schFlexColumn?: boolean

  schGap?: number | string

  schPack?: boolean

  schMatchAdapt?: boolean

  layoutMode?: "grid" | "flex" | "match-adapt" | "relative" | "none"

  position?: "absolute" | "relative"

  gridCols?: number | string

  gridRows?: number | string

  gridTemplateRows?: string

  gridTemplateColumns?: string

  gridTemplate?: string

  gridGap?: number | string

  gridRowGap?: number | string

  gridColumnGap?: number | string

  flexDirection?: "row" | "column"

  alignItems?: "start" | "center" | "end" | "stretch"

  justifyContent?: "start" | "center" | "end" | "stretch" | "space-between" | "space-around" | "space-evenly"

  flexRow?: boolean

  flexColumn?: boolean

  gap?: number | string

  pack?: boolean

  packOrderStrategy?: "largest_to_smallest" | "first_to_last" | "highest_to_lowest_pin_count"

  packPlacementStrategy?: "shortest_connection_along_outline"

  padding?: Distance

  paddingLeft?: Distance

  paddingRight?: Distance

  paddingTop?: Distance

  paddingBottom?: Distance

  paddingX?: Distance

  paddingY?: Distance

  width?: Distance

  height?: Distance

  matchAdapt?: boolean

  matchAdaptTemplate?: any

// Category: Shared props
// Props every element extending CommonLayoutProps accepts
CommonLayoutProps: interface CommonLayoutProps extends PcbLayoutProps

  schMarginTop?: string | number

  schMarginRight?: string | number

  schMarginBottom?: string | number

  schMarginLeft?: string | number

  schMarginX?: string | number

  schMarginY?: string | number

  schX?: string | number

  schY?: string | number

  schRotation?: string | number

  footprint?: FootprintProp

  symbol?: SymbolProp

  schStyle?: SchStyle

  // If true, schX/schY will be interpreted relative to the parent group
  schRelative?: boolean

// Category: Shared props
// Props every element extending PcbLayoutProps accepts
PcbLayoutProps: interface PcbLayoutProps

  pcbX?: string | number

  pcbY?: string | number

  // Position the left, right, top, or bottom edge of the component
  pcbLeftEdgeX?: string | number

  pcbRightEdgeX?: string | number

  pcbTopEdgeY?: string | number

  pcbBottomEdgeY?: string | number

  pcbOffsetX?: string | number

  pcbOffsetY?: string | number

  pcbRotation?: string | number

  pcbPositionAnchor?: string

  pcbPositionMode?: PcbPositionMode

  shouldBeOnEdgeOfBoard?: boolean

  layer?: LayerRefInput

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbStyle?: PcbStyle

  pcbSx?: PcbSx

  // If true, pcbX/pcbY will be interpreted relative to the parent group
  pcbRelative?: boolean

  // If true, both pcb and schematic coordinates will be interpreted relative to the parent group
  relative?: boolean
