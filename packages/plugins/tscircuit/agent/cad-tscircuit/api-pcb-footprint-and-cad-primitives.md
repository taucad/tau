# @tscircuit/core — PCB, footprint and CAD primitives

29 top-level symbols. Signatures are verbatim typescript.

// Category: PCB, footprint and CAD primitives
// JSX element <via> with ViaProps
<via>: ViaProps extends CommonLayoutProps

  name?: string

  fromLayer?: LayerRefInput

  toLayer?: LayerRefInput

  layers?: LayerRefInput[]

  holeDiameter?: number | string

  outerDiameter?: number | string

  connectsTo?: string | string[]

  netIsAssignable?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <smtpad> with SmtPadProps, required shape
<smtpad>: SmtPadProps extends Omit<PcbLayoutProps, "pcbRotation">

  name?: string

  shape: "rect"

  width: Distance

  height: Distance

  rectBorderRadius?: Distance

  cornerRadius?: Distance

  portHints?: PortHints

  coveredWithSolderMask?: boolean

  solderMaskMargin?: Distance

  solderMaskMarginLeft?: Distance

  solderMaskMarginRight?: Distance

  solderMaskMarginTop?: Distance

  solderMaskMarginBottom?: Distance

  solderPasteMargin?: Distance

  radius: Distance

  ccwRotation: number

  points: Point[]

// Category: PCB, footprint and CAD primitives
// JSX element <platedhole> with PlatedHoleProps, required shape
<platedhole>: PlatedHoleProps extends Omit<PcbLayoutProps, "layer">

  name?: string

  connectsTo?: string | string[]

  shape: "circle"

  holeDiameter: number | string

  outerDiameter: number | string

  padDiameter?: number | string

  portHints?: PortHints

  solderMaskMargin?: Distance

  coveredWithSolderMask?: boolean

  outerWidth: number | string

  outerHeight: number | string

  holeWidth: number | string

  holeHeight: number | string

  rectPad?: boolean

  holeOffsetX?: number | string

  holeOffsetY?: number | string

  rectPadWidth: number | string

  rectPadHeight: number | string

  rectBorderRadius?: number | string

  holeShape?: "circle"

  padShape?: "rect"

  padOutline: Point[]

// Category: PCB, footprint and CAD primitives
// JSX element <keepout> with PcbKeepoutProps, required shape
<keepout>: PcbKeepoutProps extends PcbLayoutProps

  shape: "circle"

  radius: string | number

  layers?: ("top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; })[]

  excludeRefs?: string[]

  width: string | number

  height: string | number

// Category: PCB, footprint and CAD primitives
// JSX element <hole> with HoleProps
<hole>: HoleProps extends PcbLayoutProps

  name?: string

  shape?: "circle"

  diameter?: Distance

  radius?: Distance

  solderMaskMargin?: Distance

  coveredWithSolderMask?: boolean

  width: Distance

  height: Distance

// Category: PCB, footprint and CAD primitives
// JSX element <cadmodel> with CadModelProps, required modelUrl
<cadmodel>: CadModelProps

  modelUrl: string

  stepUrl?: string

  pcbX?: Distance

  pcbY?: Distance

  pcbLeftEdgeX?: Distance

  pcbRightEdgeX?: Distance

  pcbTopEdgeY?: Distance

  pcbBottomEdgeY?: Distance

  pcbOffsetX?: Distance

  pcbOffsetY?: Distance

  pcbZ?: Distance

  rotationOffset?: number | {x: number | string; y: number | string; z: number | string; }

  positionOffset?: {x: number | string; y: number | string; z: number | string; }

  modelOriginPosition?: {x: number | string; y: number | string; z: number | string; }

  // Axis-aligned extent of the model measured in its own coordinate frame, the same frame as `modelOriginPosition`
  modelBounds?: {min: {x: number | string; y: number | string; z: number | string; }; max: {x: number | string; y: number | string; z: number | string; }; }

  size?: {x: number | string; y: number | string; z: number | string; }

  modelUnitToMmScale?: Distance

  modelBoardNormalDirection?: CadModelAxisDirection

  pcbRotationOffset?: number

  zOffsetFromSurface?: Distance

  showAsTranslucentModel?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <cadassembly> with CadAssemblyProps
<cadassembly>: CadAssemblyProps

  // The layer that the CAD assembly is designed for
  originalLayer?: LayerRef

  children?: any

// Category: PCB, footprint and CAD primitives
// JSX element <footprint> with FootprintProps & {name?
<footprint>: FootprintProps & {name?: string; }

  children?: any

  name?: string

  // The layer that the footprint is designed for
  originalLayer?: LayerRef

  // Serialized circuit JSON describing a precompiled footprint
  circuitJson?: any[]

  // Can be a footprint or kicad string
  src?: FootprintProp

  // Direction a cable or mating part is attached from, in the footprint's own frame -- the same frame its pads are drawn in
  insertionDirection?: FootprintInsertionDirection

  // Direction the part's enclosure opening faces, named the same way as `insertionDirection` and in the same unrotated part frame
  cutoutApertureDirection?: FootprintInsertionDirection

// Category: PCB, footprint and CAD primitives
// JSX element <silkscreentext> with SilkscreenTextProps, required text
<silkscreentext>: SilkscreenTextProps extends PcbLayoutProps

  text: string

  font?: "tscircuit2024"

  layers?: ("top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; })[]

  fontSize?: string | number

  anchorAlignment?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  isKnockout?: boolean

  knockoutPadding?: string | number

  knockoutPaddingLeft?: string | number

  knockoutPaddingRight?: string | number

  knockoutPaddingTop?: string | number

  knockoutPaddingBottom?: string | number

// Category: PCB, footprint and CAD primitives
// JSX element <silkscreengraphic> with SilkscreenGraphicProps, required imageUrl, width, height
<silkscreengraphic>: SilkscreenGraphicProps extends Omit<PcbLayoutProps, "pcbStyle" | "pcbSx">

  // URL or static-file import for the source image
  imageUrl: string

  // Width of the rendered silkscreen graphic on the PCB
  width: Distance

  // Height of the rendered silkscreen graphic on the PCB
  height: Distance

// Category: PCB, footprint and CAD primitives
// JSX element <coppertext> with CopperTextProps, required text
<coppertext>: CopperTextProps extends PcbLayoutProps

  text: string

  font?: "tscircuit2024"

  layers?: ("top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; })[]

  fontSize?: string | number

  anchorAlignment?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  knockout?: boolean

  mirrored?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <cutout> with CutoutProps, required shape
<cutout>: CutoutProps extends Omit<PcbLayoutProps, "pcbRotation" | "layer">

  name?: string

  shape: "rect"

  width: Distance

  height: Distance

  radius: Distance

  points: Point[]

// Category: PCB, footprint and CAD primitives
// JSX element <silkscreenpath> with SilkscreenPathProps, required route
<silkscreenpath>: SilkscreenPathProps

  route: {x: string | number; y: string | number; via?: boolean | undefined; to_layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; trace_width?: string | number | undefined; }[]

  layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; }

  pcbPositionAnchor?: string

  pcbPositionMode?: "relative_to_group_anchor" | "auto" | "relative_to_board_anchor" | "relative_to_component_anchor"

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbStyle?: {silkscreenFontSize?: string | number | undefined; viaPadDiameter?: string | number | undefined; viaHoleDiameter?: string | number | undefined; silkscreenTextPosition?: "centered" | "outside" | "none" | {offsetX: number; offsetY: number; } | undefined; silkscreenTextVisibility?: "hidden" | "visible" | "inherit" | undefined; }

  pcbSx?: PcbSx

  pcbRelative?: boolean

  relative?: boolean

  strokeWidth?: string | number

// Category: PCB, footprint and CAD primitives
// JSX element <silkscreenline> with SilkscreenLineProps, required strokeWidth, x1, y1, x2, y2
<silkscreenline>: SilkscreenLineProps

  strokeWidth: string | number

  x1: string | number

  y1: string | number

  x2: string | number

  y2: string | number

  layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; }

  pcbLeftEdgeX?: string | number

  pcbRightEdgeX?: string | number

  pcbTopEdgeY?: string | number

  pcbBottomEdgeY?: string | number

  pcbPositionAnchor?: string

  pcbPositionMode?: "relative_to_group_anchor" | "auto" | "relative_to_board_anchor" | "relative_to_component_anchor"

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbStyle?: {silkscreenFontSize?: string | number | undefined; viaPadDiameter?: string | number | undefined; viaHoleDiameter?: string | number | undefined; silkscreenTextPosition?: "centered" | "outside" | "none" | {offsetX: number; offsetY: number; } | undefined; silkscreenTextVisibility?: "hidden" | "visible" | "inherit" | undefined; }

  pcbSx?: PcbSx

  pcbRelative?: boolean

  relative?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <silkscreenrect> with SilkscreenRectProps, required width, height
<silkscreenrect>: SilkscreenRectProps extends Omit<PcbLayoutProps, "pcbRotation">

  width: string | number

  height: string | number

  strokeWidth?: string | number

  cornerRadius?: string | number

  filled?: boolean

  stroke?: "none" | "dashed" | "solid"

// Category: PCB, footprint and CAD primitives
// JSX element <silkscreencircle> with SilkscreenCircleProps, required radius
<silkscreencircle>: SilkscreenCircleProps extends Omit<PcbLayoutProps, "pcbRotation">

  radius: string | number

  strokeWidth?: string | number

  isFilled?: boolean

  isOutline?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <courtyardcircle> with CourtyardCircleProps, required radius
<courtyardcircle>: CourtyardCircleProps extends Omit<PcbLayoutProps, "pcbRotation">

  radius: string | number

// Category: PCB, footprint and CAD primitives
// JSX element <courtyardoutline> with CourtyardOutlineProps, required outline
<courtyardoutline>: CourtyardOutlineProps

  outline: {x: string | number; y: string | number; }[]

  layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; }

  pcbPositionAnchor?: string

  pcbPositionMode?: "relative_to_group_anchor" | "auto" | "relative_to_board_anchor" | "relative_to_component_anchor"

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbStyle?: {silkscreenFontSize?: string | number | undefined; viaPadDiameter?: string | number | undefined; viaHoleDiameter?: string | number | undefined; silkscreenTextPosition?: "centered" | "outside" | "none" | {offsetX: number; offsetY: number; } | undefined; silkscreenTextVisibility?: "hidden" | "visible" | "inherit" | undefined; }

  pcbSx?: PcbSx

  pcbRelative?: boolean

  relative?: boolean

  strokeWidth?: string | number

  color?: string

  isStrokeDashed?: boolean

  isClosed?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <courtyardrect> with CourtyardRectProps, required width, height
<courtyardrect>: CourtyardRectProps extends PcbLayoutProps

  width: string | number

  height: string | number

  strokeWidth?: string | number

  color?: string

  isFilled?: boolean

  hasStroke?: boolean

  isStrokeDashed?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <fabricationnoterect> with FabricationNoteRectProps, required width, height
<fabricationnoterect>: FabricationNoteRectProps extends Omit<PcbLayoutProps, "pcbRotation">

  width: string | number

  height: string | number

  strokeWidth?: string | number

  cornerRadius?: string | number

  color?: string

  isFilled?: boolean

  hasStroke?: boolean

  isStrokeDashed?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <pcbnoteline> with PcbNoteLineProps, required x1, y1, x2, y2
<pcbnoteline>: PcbNoteLineProps

  x1: string | number

  y1: string | number

  x2: string | number

  y2: string | number

  strokeWidth?: string | number

  color?: string

  isDashed?: boolean

  pcbStyle?: PcbStyle

  pcbPositionAnchor?: string

  pcbPositionMode?: PcbPositionMode

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbSx?: PcbSx

  layer?: LayerRefInput

  // If true, both pcb and schematic coordinates will be interpreted relative to the parent group
  relative?: boolean

  // If true, pcbX/pcbY will be interpreted relative to the parent group
  pcbRelative?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <pcbnoterect> with PcbNoteRectProps, required width, height
<pcbnoterect>: PcbNoteRectProps extends Omit<PcbLayoutProps, "pcbRotation">

  width: string | number

  height: string | number

  strokeWidth?: string | number

  isFilled?: boolean

  hasStroke?: boolean

  isStrokeDashed?: boolean

  color?: string

  cornerRadius?: string | number

// Category: PCB, footprint and CAD primitives
// JSX element <pcbnotetext> with PcbNoteTextProps, required text
<pcbnotetext>: PcbNoteTextProps extends PcbLayoutProps

  text: string

  anchorAlignment?: "center" | "top_left" | "top_right" | "bottom_left" | "bottom_right"

  font?: "tscircuit2024"

  fontSize?: string | number

  color?: string

// Category: PCB, footprint and CAD primitives
// JSX element <pcbnotepath> with PcbNotePathProps, required route
<pcbnotepath>: PcbNotePathProps

  route: RouteHintPointInput[]

  strokeWidth?: string | number

  color?: string

  pcbStyle?: PcbStyle

  pcbPositionAnchor?: string

  pcbPositionMode?: PcbPositionMode

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbSx?: PcbSx

  layer?: LayerRefInput

  // If true, both pcb and schematic coordinates will be interpreted relative to the parent group
  relative?: boolean

  // If true, pcbX/pcbY will be interpreted relative to the parent group
  pcbRelative?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <pcbnotedimension> with PcbNoteDimensionProps, required from, to
<pcbnotedimension>: PcbNoteDimensionProps

  from: string | Point

  to: string | Point

  text?: string

  offset?: string | number

  font?: "tscircuit2024"

  fontSize?: string | number

  color?: string

  arrowSize?: string | number

  units?: "in" | "mm"

  outerEdgeToEdge?: true

  centerToCenter?: true

  innerEdgeToEdge?: true

  pcbStyle?: PcbStyle

  pcbPositionAnchor?: string

  pcbPositionMode?: PcbPositionMode

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbSx?: PcbSx

  layer?: LayerRefInput

  // If true, both pcb and schematic coordinates will be interpreted relative to the parent group
  relative?: boolean

  // If true, pcbX/pcbY will be interpreted relative to the parent group
  pcbRelative?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <fabricationnotetext> with FabricationNoteTextProps, required text
<fabricationnotetext>: FabricationNoteTextProps extends PcbLayoutProps

  text: string

  anchorAlignment?: "center" | "top_left" | "top_right" | "bottom_left" | "bottom_right"

  font?: "tscircuit2024"

  fontSize?: string | number

  color?: string

// Category: PCB, footprint and CAD primitives
// JSX element <fabricationnotepath> with FabricationNotePathProps, required route
<fabricationnotepath>: FabricationNotePathProps

  route: {x: string | number; y: string | number; via?: boolean | undefined; to_layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; trace_width?: string | number | undefined; }[]

  layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; }

  pcbPositionAnchor?: string

  pcbPositionMode?: "relative_to_group_anchor" | "auto" | "relative_to_board_anchor" | "relative_to_component_anchor"

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbStyle?: {silkscreenFontSize?: string | number | undefined; viaPadDiameter?: string | number | undefined; viaHoleDiameter?: string | number | undefined; silkscreenTextPosition?: "centered" | "outside" | "none" | {offsetX: number; offsetY: number; } | undefined; silkscreenTextVisibility?: "hidden" | "visible" | "inherit" | undefined; }

  pcbSx?: PcbSx

  pcbRelative?: boolean

  relative?: boolean

  strokeWidth?: string | number

  color?: string

// Category: PCB, footprint and CAD primitives
// JSX element <fabricationnotedimension> with FabricationNoteDimensionProps, required from, to
<fabricationnotedimension>: FabricationNoteDimensionProps

  from: string | Point

  to: string | Point

  text?: string

  offset?: string | number

  font?: "tscircuit2024"

  fontSize?: string | number

  color?: string

  arrowSize?: string | number

  units?: "in" | "mm"

  outerEdgeToEdge?: true

  centerToCenter?: true

  innerEdgeToEdge?: true

  pcbStyle?: PcbStyle

  pcbPositionAnchor?: string

  pcbPositionMode?: PcbPositionMode

  shouldBeOnEdgeOfBoard?: boolean

  pcbMarginTop?: string | number

  pcbMarginRight?: string | number

  pcbMarginBottom?: string | number

  pcbMarginLeft?: string | number

  pcbMarginX?: string | number

  pcbMarginY?: string | number

  pcbSx?: PcbSx

  layer?: LayerRefInput

  // If true, both pcb and schematic coordinates will be interpreted relative to the parent group
  relative?: boolean

  // If true, pcbX/pcbY will be interpreted relative to the parent group
  pcbRelative?: boolean

// Category: PCB, footprint and CAD primitives
// JSX element <copperpour> with CopperPourProps, required layer, connectsTo
<copperpour>: CopperPourProps

  name?: string

  layer: LayerRefInput

  connectsTo: string

  // Reserves the pour region during autorouting so unrelated traces do not split it
  unbroken?: boolean

  padMargin?: Distance

  traceMargin?: Distance

  clearance?: Distance

  boardEdgeMargin?: Distance

  cutoutMargin?: Distance

  useThermalReliefs?: boolean

  outline?: Point[]

  coveredWithSolderMask?: boolean
