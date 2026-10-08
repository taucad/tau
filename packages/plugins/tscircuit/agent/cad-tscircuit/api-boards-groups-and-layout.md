# @tscircuit/core — Boards, groups and layout

14 top-level symbols. Signatures are verbatim typescript.

// Category: Boards, groups and layout
// JSX element <board> with BoardProps
<board>: BoardProps extends Omit<SubcircuitGroupProps, "connections">

  title?: string

  material?: "fr4" | "fr1" | "flex"

  // Number of layers for the PCB
  layers?: 1 | 2 | 4 | 6 | 8 | 10

  // Whether the autorouter may generate blind and buried vias
  allowBlindAndBuriedVias?: boolean

  borderRadius?: Distance

  thickness?: Distance

  boardAnchorPosition?: Point

  anchorAlignment?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  boardAnchorAlignment?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  // Color applied to both top and bottom solder masks
  solderMaskColor?: BoardColor

  // Color of the top solder mask
  topSolderMaskColor?: BoardColor

  // Color of the bottom solder mask
  bottomSolderMaskColor?: BoardColor

  // Color applied to both top and bottom silkscreens
  silkscreenColor?: BoardColor

  // Color of the top silkscreen
  topSilkscreenColor?: BoardColor

  // Color of the bottom silkscreen
  bottomSilkscreenColor?: BoardColor

  // Whether the board should be assembled on both sides
  doubleSidedAssembly?: boolean

  // Whether vias may be placed inside PCB pads
  isViaInPadAllowed?: boolean

  // Whether implicit copper pours should be generated automatically
  automaticPoursEnabled?: boolean

  // Whether this board should be omitted from the schematic view
  schematicDisabled?: boolean

// Category: Boards, groups and layout
// JSX element <drccheck> with DrcCheckProps, required checkFn
<drccheck>: DrcCheckProps

  name?: string

  checkFn: CustomDrcCheckFn

// Category: Boards, groups and layout
// JSX element <mountedboard> with MountedBoardProps
<mountedboard>: MountedBoardProps extends SubcircuitGroupProps

  boardToBoardDistance?: Distance

  mountOrientation?: "faceDown" | "faceUp"

  manufacturerPartNumber?: string

  pinLabels?: PinLabelsProp<SchematicPinLabel, PinLabel>

  // Whether to show pin aliases in the schematic
  showPinAliases?: boolean

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  pinCompatibleVariants?: PinCompatibleVariant[]

  noSchematicRepresentation?: boolean

  internallyConnectedPins?: (string | number)[][]

  externallyConnectedPins?: string[][]

// Category: Boards, groups and layout
// JSX element <panel> with PanelProps
<panel>: PanelProps extends BaseGroupProps

  anchorAlignment?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  // If true, prevent a solder mask from being applied to this panel
  noSolderMask?: boolean

  // Method used to separate boards in the panel
  panelizationMethod?: "tab-routing" | "outline_routing" | "none"

  // Gap between boards in a panel
  boardGap?: Distance

  row?: number

  col?: number

  cellWidth?: Distance

  cellHeight?: Distance

  tabWidth?: Distance

  tabLength?: Distance

  mouseBites?: boolean

  edgePadding?: Distance

  edgePaddingLeft?: Distance

  edgePaddingRight?: Distance

  edgePaddingTop?: Distance

  edgePaddingBottom?: Distance

// Category: Boards, groups and layout
// JSX element <subpanel> with SubpanelProps
<subpanel>: SubpanelProps extends BaseGroupProps

  anchorAlignment?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  // If true, prevent a solder mask from being applied to this panel
  noSolderMask?: boolean

  // Method used to separate boards in the panel
  panelizationMethod?: "tab-routing" | "outline_routing" | "none"

  // Gap between boards in a panel
  boardGap?: Distance

  row?: number

  col?: number

  cellWidth?: Distance

  cellHeight?: Distance

  tabWidth?: Distance

  tabLength?: Distance

  mouseBites?: boolean

  edgePadding?: Distance

  edgePaddingLeft?: Distance

  edgePaddingRight?: Distance

  edgePaddingTop?: Distance

  edgePaddingBottom?: Distance

// Category: Boards, groups and layout
// JSX element <group> with GroupProps
<group>: GroupProps extends SubcircuitGroupProps

  subcircuit: true

// Category: Boards, groups and layout
// JSX element <breakout> with BreakoutProps
<breakout>: BreakoutProps extends SubcircuitGroupProps

  // Minimum clearance between this fanout boundary and another fanout boundary
  fanoutMargin?: Distance

  // Fanout direction and boundary position for each named bus
  busFanoutDirections?: Record<BusName, BusFanoutDirection>

  // Padding between the union of the fanout source pads and the shared boundary where fanout traces terminate
  fanoutBoundaryPadding?: FanoutBoundaryPadding

  // Copper layers available to boundary-terminated fanout buses
  fanoutRoutingLayers?: LayerRefInput[]

  // Maps copper layers to the net or nets poured on them
  fanoutPourNetMap?: FanoutPourNetMap

// Category: Boards, groups and layout
// JSX element <breakoutpoint> with BreakoutPointProps, required connection
<breakoutpoint>: BreakoutPointProps extends Omit<PcbLayoutProps, "pcbRotation" | "layer">

  connection: string

// Category: Boards, groups and layout
// JSX element <autoroutingphase> with AutoroutingPhaseProps
<autoroutingphase>: AutoroutingPhaseProps

  name?: string

  autorouter?: AutorouterProp

  phaseIndex?: number

  region?: {shape?: "rect"; minX: number; maxX: number; minY: number; maxY: number; }

  connection?: string

  connections?: string[]

  reroute?: boolean

  minTraceWidth?: Distance

  minViaHoleEdgeToViaHoleEdgeClearance?: Distance

  minPlatedHoleDrillEdgeToDrillEdgeClearance?: Distance

  minTraceToPadEdgeClearance?: Distance

  minPadEdgeToPadEdgeClearance?: Distance

  minBoardEdgeClearance?: Distance

  minViaEdgeToPadEdgeClearance?: Distance

  minViaHoleDiameter?: Distance

  minViaPadDiameter?: Distance

  // Fanout direction and boundary position for each named bus
  busFanoutDirections?: Record<BusName, BusFanoutDirection>

  // Padding between the union of the fanout source pads and the shared boundary where fanout traces terminate
  fanoutBoundaryPadding?: FanoutBoundaryPadding

  // Copper layers available to boundary-terminated fanout buses
  fanoutRoutingLayers?: LayerRefInput[]

  // Maps copper layers to the net or nets poured on them
  fanoutPourNetMap?: FanoutPourNetMap

// Category: Boards, groups and layout
// JSX element <constraint> with ConstraintProps
<constraint>: ConstraintProps

  pcb?: true

  xDist: Distance

  // Selector for left component, e.g
  left: string

  // Selector for right component, e.g
  right: string

  // If true, the provided distance is the distance between the closest edges of the left and right components
  edgeToEdge?: true

  // If true, the provided distance is the distance between the centers of the left and right components
  centerToCenter?: true

  yDist: Distance

  // Selector for top component, e.g
  top: string

  // Selector for bottom component, e.g
  bottom: string

  sameY?: true

  // Selector for components, e.g
  for: string[]

  sameX?: true

// Category: Boards, groups and layout
// JSX element <constrainedlayout> with ConstrainedLayoutProps
<constrainedlayout>: ConstrainedLayoutProps

  name?: string

  pcbOnly?: boolean

  schOnly?: boolean

// Category: Boards, groups and layout
// JSX element <subcircuit> with SubcircuitGroupProps
<subcircuit>: SubcircuitGroupProps extends BaseGroupProps

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

// Category: Boards, groups and layout
// Same props as <breakout>
<fanout>: BreakoutProps extends SubcircuitGroupProps

// Category: Boards, groups and layout
// Same props as <breakoutpoint>
<fanoutpoint>: BreakoutPointProps extends Omit<PcbLayoutProps, "pcbRotation" | "layer">
