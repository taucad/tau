# @tscircuit/core — Connectivity

8 top-level symbols. Signatures are verbatim typescript.

// Category: Connectivity
// JSX element <port> with PortProps
<port>: PortProps extends CommonLayoutProps

  name?: string

  connectsTo?: string | string[]

  layers?: string[]

  direction?: "up" | "down" | "left" | "right"

  pinNumber?: number

  schStemLength?: number

  schPinLabelFontSize?: string | number

  aliases?: string[]

  kicadPinMetadata?: {electricalType?: "input" | "output" | "bidirectional" | "tri_state" | "passive" | "free" | "unspecified" | "power_in" | "power_out" | "open_collector" | "open_emitter" | "no_connect" | undefined; graphicStyle?: "line" | "inverted" | "clock" | "inverted_clock" | "input_low" | "clock_low" | "output_low" | "falling_edge_clock" | "nonlogic" | undefined; pinLength?: string | number | undefined; nameTextSize?: string | number | undefined; numberTextSize?: string | number | undefined; }

  hasInversionCircle?: boolean

// Category: Connectivity
// JSX element <netlabel> with NetLabelProps
<netlabel>: NetLabelProps

  net?: string

  connection?: string

  connectsTo?: string | string[]

  // Render the net name along its schematic trace instead of as an anchored label
  inline?: boolean

  schX?: number | string

  schY?: number | string

  schRotation?: number | string

  anchorSide?: "left" | "top" | "right" | "bottom"

// Category: Connectivity
// JSX element <net> with NetProps, required name
<net>: NetProps

  name: string

  connectsTo?: string | string[]

  routingPhaseIndex?: number | null

  highlightColor?: string

  isPowerNet?: boolean

  isGroundNet?: boolean

  nominalTraceWidth?: Distance

// Category: Connectivity
// JSX element <trace> with TraceProps
<trace>: TraceProps

  path: (string | {getPortSelector: () => string; })[]

  width?: string | number

  name?: string

  connectsTo?: string | string[]

  thickness?: string | number

  highlightColor?: string

  displayName?: string

  routingPhaseIndex?: number | null

  maxLength?: string | number

  pcbPath?: (string | {x: string | number; y: string | number; via?: boolean | undefined; fromLayer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; toLayer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; })[]

  schematicRouteHints?: {x: string | number; y: string | number; }[]

  pcbRouteHints?: {x: string | number; y: string | number; via?: boolean | undefined; to_layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; trace_width?: string | number | undefined; }[]

  pcbPathRelativeTo?: string

  pcbPaths?: (string | {x: string | number; y: string | number; via?: boolean | undefined; fromLayer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; toLayer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; })[][]

  pcbStraightLine?: boolean

  schDisplayLabel?: string

  schStroke?: string

  maxViaCount?: number

  from: string | {getPortSelector: () => string; }

  to: string | {getPortSelector: () => string; }

  start: string | {getPortSelector: () => string; }

  end: string | {getPortSelector: () => string; }

// Category: Connectivity
// JSX element <bus> with BusProps, required connections
<bus>: BusProps

  name?: string

  // One or more trace names or port selectors for the connections in the bus
  connections: string[]

  // If set, every trace in this bus is assigned to this autorouting phase
  routingPhaseIndex?: number | null

  // Maximum routed-length difference between bus members
  maxLengthSkew?: number | string

  // Intended single-ended characteristic impedance
  targetImpedance?: number | string

  // Explicit PCB trace width for every bus member
  pcbTraceWidth?: number | string

  // PCB layers on which the bus may be routed
  pcbAllowedLayers?: LayerRefInput[]

  // Preferred PCB layer for routing the bus
  preferredLayer?: LayerRefInput

  // Preferred PCB layers for routing the bus, in priority order
  preferredLayers?: LayerRefInput[]

// Category: Connectivity
// JSX element <differentialpair> with DifferentialPairProps, required positiveConnection, negativeConnection
<differentialpair>: DifferentialPairProps

  name?: string

  // Name of the trace or pin carrying the positive signal
  positiveConnection: string

  // Name of the trace or pin carrying the negative signal
  negativeConnection: string

  // Maximum permitted routed-length skew
  maxLengthSkew?: number | string

  // Intended differential characteristic impedance
  targetDifferentialImpedance?: number | string

  // Edge-to-edge PCB copper gap between the pair
  pcbTraceGap?: number | string

  // Maximum length over which the pair may be routed without coupling
  maxUncoupledLength?: number | string

// Category: Connectivity
// JSX element <tracehint> with TraceHintProps
<tracehint>: TraceHintProps

  offset?: {x: string | number; y: string | number; via?: boolean | undefined; to_layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; trace_width?: string | number | undefined; } | {x: string | number; y: string | number; via?: boolean | undefined; toLayer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; }

  offsets?: {x: string | number; y: string | number; via?: boolean | undefined; to_layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; trace_width?: string | number | undefined; }[] | {x: string | number; y: string | number; via?: boolean | undefined; toLayer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; }[]

  for?: string

  order?: number

  traceWidth?: number

// Category: Connectivity
// JSX element <pcbtrace> with PcbTraceProps, required route
<pcbtrace>: PcbTraceProps

  route: {x: string | number; y: string | number; via?: boolean | undefined; to_layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | {name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; } | undefined; trace_width?: string | number | undefined; }[]

  thickness?: string | number

  layer?: string
