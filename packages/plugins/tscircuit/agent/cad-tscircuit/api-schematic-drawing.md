# @tscircuit/core — Schematic drawing

14 top-level symbols. Signatures are verbatim typescript.

// Category: Schematic drawing
// JSX element <schematicsection> with SchematicSectionProps, required name
<schematicsection>: SchematicSectionProps

  displayName?: string

  name: string

  sectionTitleFontSize?: number | string

// Category: Schematic drawing
// JSX element <schematicsheet> with SchematicSheetProps
<schematicsheet>: SchematicSheetProps

  name?: string

  displayName?: string

  sheetIndex?: number

  // Sheet size used to render the schematic
  sheetSize?: SchematicSheetSize

  // Explicit schematic sheet width
  sheetWidth?: Distance

  // Explicit schematic sheet height
  sheetHeight?: Distance

  children?: any

// Category: Schematic drawing
// JSX element <schematicgraphic> with SchematicGraphicProps
<schematicgraphic>: SchematicGraphicProps

  // URL or static-file import for the canonical source SVG asset
  imageUrl?: string

  // Complete SVG markup, including its dimensions or viewBox
  svgContent?: string

  // Optional rendered width of the graphic
  width?: Distance

  // Optional rendered height of the graphic
  height?: Distance

// Category: Schematic drawing
// JSX element <schematicbox> with SchematicBoxProps
<schematicbox>: SchematicBoxProps

  name?: string

  chipRef?: string

  pinLabels?: PinLabelsProp

  schPinArrangement?: SchematicPinArrangement

  // Per-pin schematic margin overrides keyed by pin number or label
  schPinStyle?: SchematicPinStyle

  schX?: Distance

  schY?: Distance

  schSectionName?: string

  schSheetName?: string

  width?: Distance

  height?: Distance

  overlay?: string[]

  padding?: Distance

  paddingLeft?: Distance

  paddingRight?: Distance

  paddingTop?: Distance

  paddingBottom?: Distance

  title?: string

  titleAlignment?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  titleColor?: string

  titleFontSize?: Distance

  titleInside?: boolean

  strokeStyle?: "solid" | "dashed"

// Category: Schematic drawing
// JSX element <schematicsymbol> with SchematicSymbolProps, required name, symbolName
<schematicsymbol>: SchematicSymbolProps

  // Stable name for this representation, such as `A` or `B`
  name: string

  // Optional human-facing name shown in the schematic
  displayName?: string

  // Selector for the physical component represented by this symbol
  chipRef?: string

  // Name of the symbol from the schematic-symbol library
  symbolName: string

  // Maps symbol port labels to physical component port selectors
  connections?: Connections

  schX?: Distance

  schY?: Distance

  schRotation?: number | string

  schSectionName?: string

  schSheetName?: string

// Category: Schematic drawing
// JSX element <schematicline> with SchematicLineProps, required x1, y1, x2, y2
<schematicline>: SchematicLineProps

  x1: Distance

  y1: Distance

  x2: Distance

  y2: Distance

  strokeWidth?: Distance

  color?: string

  isDashed?: boolean

  dashLength?: Distance

  dashGap?: Distance

// Category: Schematic drawing
// JSX element <schematicrect> with SchematicRectProps, required width, height
<schematicrect>: SchematicRectProps

  schX?: Distance

  schY?: Distance

  width: Distance

  height: Distance

  rotation?: number | string

  strokeWidth?: Distance

  color?: string

  isFilled?: boolean

  fillColor?: string

  isDashed?: boolean

// Category: Schematic drawing
// JSX element <schematicarc> with SchematicArcProps, required center, radius, startAngleDegrees, endAngleDegrees
<schematicarc>: SchematicArcProps

  center: Point

  radius: Distance

  startAngleDegrees: number | string

  endAngleDegrees: number | string

  direction?: "clockwise" | "counterclockwise"

  strokeWidth?: Distance

  color?: string

  isDashed?: boolean

// Category: Schematic drawing
// JSX element <schematiccircle> with SchematicCircleProps, required center, radius
<schematiccircle>: SchematicCircleProps

  center: Point

  radius: Distance

  strokeWidth?: Distance

  color?: string

  isFilled?: boolean

  fillColor?: string

  isDashed?: boolean

// Category: Schematic drawing
// JSX element <schematicpath> with SchematicPathProps
<schematicpath>: SchematicPathProps

  points?: Point[]

  svgPath?: string

  strokeWidth?: Distance

  strokeColor?: string

  dashLength?: Distance

  dashGap?: Distance

  isFilled?: boolean

  fillColor?: string

// Category: Schematic drawing
// JSX element <schematictext> with SchematicTextProps, required text
<schematictext>: SchematicTextProps

  schX?: Distance

  schY?: Distance

  text: string

  fontSize?: number

  anchor?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right" | "left" | "right" | "top" | "bottom"

  color?: string

  schRotation?: number | string

// Category: Schematic drawing
// JSX element <schematictable> with SchematicTableProps
<schematictable>: SchematicTableProps

  schX?: number | string

  schY?: number | string

  children?: any

  cellPadding?: number | string

  borderWidth?: number | string

  anchor?: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

  fontSize?: number | string

// Category: Schematic drawing
// JSX element <schematicrow> with SchematicRowProps
<schematicrow>: SchematicRowProps

  children?: any

  height?: number | string

// Category: Schematic drawing
// JSX element <schematiccell> with SchematicCellProps
<schematiccell>: SchematicCellProps

  children?: string

  horizontalAlign?: "left" | "center" | "right"

  verticalAlign?: "top" | "middle" | "bottom"

  fontSize?: number | string

  rowSpan?: number

  colSpan?: number

  width?: number | string

  text?: string
