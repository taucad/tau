# @tscircuit/core — Prop types

137 top-level symbols. Signatures are verbatim typescript.

// Category: Prop types
AmmeterPinLabels: "pin1" | "pin2" | "pos" | "neg"

// Category: Prop types
AntennaFrequencyBand: "2.4ghz" | "5ghz" | "6ghz" | "dual_band_2.4ghz_5ghz" | "tri_band_2.4ghz_5ghz_6ghz"

// Category: Prop types
AntennaShape: "2.4ghz_quarter_wave_monopole" | "2.4ghz_meandered_monopole" | "2.4ghz_inverted_f" | "2.4ghz_meandered_inverted_f" | "2.4ghz_folded_dipole"

// Category: Prop types
AutocompleteString<T extends string>: T | (string & {})

// Category: Prop types
AutorouterConfig: interface AutorouterConfig

  serverUrl?: string

  inputFormat?: "simplified" | "circuit-json"

  serverMode?: "job" | "solve-endpoint"

  serverCacheEnabled?: boolean

  cache?: PcbRouteCache

  traceClearance?: Distance

  availableJumperTypes?: Array<"1206x4" | "0603">

  allowViaInPad?: boolean

  groupMode?: "sequential_trace" | "subcircuit" | "sequential-trace"

  local?: boolean

  algorithmFn?: (simpleRouteJson: any) => Promise<any>

  // Override the solver used to place implicit breakout points
  implicitBreakoutPointSolverFn?: ImplicitBreakoutPointSolverFn

  preset?: "sequential_trace" | "subcircuit" | "default" | "auto" | "auto_local" | "auto_cloud" | "auto_jumper" | "tscircuit_beta" | "krt" | "freerouting" | "simplify" | "laser_prefab" | "single_layer_fanout" | "fanout" | "auto-jumper" | "sequential-trace" | "auto-local" | "auto-cloud"

// Category: Prop types
AutorouterPreset: "sequential_trace" | "subcircuit" | "default" | "auto" | "auto_local" | "auto_cloud" | "auto_jumper" | "tscircuit_beta" | "krt" | "freerouting" | "simplify" | "laser_prefab" | "single_layer_fanout" | "fanout" | "auto-jumper" | "sequential-trace" | "auto-local" | "auto-cloud"

// Category: Prop types
AutorouterProp: AutorouterConfig | AutocompleteString<AutorouterPreset>

// Category: Prop types
BasicFootprint: "0402" | "0603" | "0805" | "1206" | "1210" | "dip" | "axial" | "soic" | "bga" | "tssop" | "stampboard" | "stampreceiver" | "hc49" | "to92" | "to220" | "ssop" | "qfp" | "qfn" | "sot23" | "sot23_5" | "sot223" | "pinrow"

// Category: Prop types
BatteryPinLabels: "left" | "right" | "pin1" | "pin2" | "pos" | "neg" | "anode" | "cathode"

// Category: Prop types
BoardColor: AutocompleteString<BoardColorPreset>

// Category: Prop types
BoardColorPreset: "not_specified" | "green" | "red" | "blue" | "purple" | "black" | "white" | "yellow"

// Category: Prop types
Border: interface Border

  strokeWidth?: Distance

  dashed?: boolean

  solid?: boolean

// Category: Prop types
BusFanoutDirection: BusFanoutDirectionLiteral | {direction: BusFanoutDirectionLiteral; }

// Category: Prop types
BusFanoutDirectionLiteral: NinePointAnchor | CanonicalBusFanoutDirection

// Category: Prop types
BusName: string

// Category: Prop types
CadModelAxisDirection: "x+" | "x-" | "y+" | "y-" | "z+" | "z-"

// Category: Prop types
CadModelBase: interface CadModelBase

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

  stepUrl?: string

// Category: Prop types
// A Footprinter string used to procedurally generate the component's CAD model, independently of the component's PCB footprint
CadModelFootprinterString: string

// Category: Prop types
// Required glbUrl
CadModelGlb: interface CadModelGlb extends CadModelBase

  glbUrl: string

// Category: Prop types
// Required gltfUrl
CadModelGltf: interface CadModelGltf extends CadModelBase

  gltfUrl: string

// Category: Prop types
// Required jscad
CadModelJscad: interface CadModelJscad extends CadModelBase

  jscad: Record<string, any>

// Category: Prop types
// Required objUrl
CadModelObj: interface CadModelObj extends CadModelBase

  objUrl: string

  mtlUrl?: string

// Category: Prop types
CadModelProp: null | ReactElement | CadModelFootprinterString | CadModelStl | CadModelObj | CadModelGltf | CadModelGlb | CadModelStep | CadModelWrl | CadModelJscad

// Category: Prop types
// Required stepUrl
CadModelStep: interface CadModelStep extends CadModelBase

  stepUrl: string

// Category: Prop types
// Required stlUrl
CadModelStl: interface CadModelStl extends CadModelBase

  stlUrl: string

// Category: Prop types
// Required wrlUrl
CadModelWrl: interface CadModelWrl extends CadModelBase

  wrlUrl: string

// Category: Prop types
CanonicalBusFanoutDirection: "center" | "leftside_top" | "leftside_bottom" | "rightside_top" | "rightside_bottom" | "topside_left" | "topside_right" | "bottomside_left" | "bottomside_right" | "topside_center" | "rightside_center" | "bottomside_center" | "leftside_center"

// Category: Prop types
CapacitorPinLabels: "pin1" | "pin2" | "pos" | "neg" | "anode" | "cathode"

// Category: Prop types
CircuitJsonWarning: Extract<AnyCircuitElement, {warning_type: string; }>

// Category: Prop types
// Defines a mapping of strings to connection paths e.g
Connections<PinLabel extends string = string>: Partial<Record<PinLabel, ConnectionTarget | ConnectionTarget[] | readonly ConnectionTarget[]>>

// Category: Prop types
ConnectionTarget: string

// Category: Prop types
ConnectorStandard: "usb_c" | "m2" | "jst_sh" | "jst_gh" | "jst_zh" | "jst_ph" | "jst_xh" | "jst_vh"

// Category: Prop types
CrystalPinLabels: "left" | "right" | "pin1" | "pin2" | "pin3" | "pin4"

// Category: Prop types
CurrentSourcePinLabels: "pin1" | "pin2" | "pos" | "neg"

// Category: Prop types
// Required select, selectAll, isConnected, isPulledUp, isPulledDown, getResistanceBetween
CustomDrcCheckContext: interface CustomDrcCheckContext

  select: CustomDrcSelect

  selectAll: CustomDrcSelectAll

  isConnected: (a: CustomDrcConnectable, b: CustomDrcConnectable) => boolean

  isPulledUp: (a: CustomDrcConnectable) => boolean

  isPulledDown: (a: CustomDrcConnectable) => boolean

  getResistanceBetween: (a: CustomDrcConnectable, b: CustomDrcConnectable) => number | null

// Category: Prop types
CustomDrcCheckFn: (ctx: CustomDrcCheckContext) => MaybePromise<CustomDrcCheckInput | CustomDrcCheckInput[] | null | undefined | void>

// Category: Prop types
CustomDrcCheckInput: Partial<CircuitJsonError> | Partial<CircuitJsonWarning>

// Category: Prop types
CustomDrcConnectable: string | AnyCircuitElement | SelectionResult | null | undefined

// Category: Prop types
CustomDrcSelect: interface CustomDrcSelect

// Category: Prop types
CustomDrcSelectAll: interface CustomDrcSelectAll

// Category: Prop types
DiodePinLabels: "left" | "right" | "pin1" | "pin2" | "pos" | "neg" | "anode" | "cathode"

// Category: Prop types
DiodePinLabelsProp<PinLabel extends string = string>: Partial<Record<DiodePinLabels, PinLabel | PinLabel[] | readonly PinLabel[]>>

// Category: Prop types
DirectionalFanoutBoundaryPadding: interface DirectionalFanoutBoundaryPadding

  top?: Distance

  right?: Distance

  bottom?: Distance

  left?: Distance

// Category: Prop types
Distance: number | string

// Category: Prop types
// Padding between the union of the fanout source pads and the shared boundary where fanout traces terminate
FanoutBoundaryPadding: Distance | DirectionalFanoutBoundaryPadding

// Category: Prop types
FanoutPourNetMap: Partial<Record<Extract<LayerRef, string>, string | string[]>>

// Category: Prop types
FootprinterStringAutocomplete: BasicFootprint | FootprinterStringExample

// Category: Prop types
FootprinterStringExample: "0402_p1.02mm_pw0.54mm_ph0.64mm_w1.56mm_h0.64mm" | "0603_p1.65mm_pw0.8mm_ph0.95mm_w2.45mm_h0.95mm" | "0805_p1.825mm_pw1.025mm_ph1.4mm_w2.85mm_h1.4mm" | "1206_p2.925mm_pw1.125mm_ph1.75mm_w4.05mm_h1.75mm" | "1210_p2.925mm_pw1.125mm_ph2.65mm_w4.05mm_h2.65mm" | "dip6_w7.62mm_p2.54mm_id1mm_od1.5mm" | "axial_p2.54mm_id0.7mm_od1.4mm" | "soic8_w5.3mm_p1.27mm_pw0.6mm_pl1mm" | "bga64_grid8x8_p0.8mm_ball0.47mm_pad0.38mm_tlorigin" | "tssop8_w7.1mm_p0.65mm_pl1.35mm_pw0.4mm_legsoutside" | "stampboard_w22.58mm_left20_right20_top2_bottom2_p2.54mm_pw1.6mm_pl2.4mm_innerholeedgedistance1.61mm_silkscreenlabelmargin0.1mm" | "stampreceiver_w22.58mm_left20_right20_top2_bottom2_p2.54mm_pw1.6mm_pl3.2mm_innerholeedgedistance1.61mm" | "hc49_p4.88mm_id0.8mm_od1.5mm_w5.6mm_h3.5mm" | "to92_p1.27mm_id0.72mm_od0.95mm_w4.5mm_h4.5mm" | "to220_3_p2.6mm_id1mm_od1.9mm_w13mm_h7mm" | "ssop8_w3.9mm_p1.27mm_pw0.6mm_pl1mm" | "qfp64_w10mm_h10mm_p0.5mm_pw0.25mm_pl1mm_legsoutside" | "qfn64_w10mm_h10mm_p0.5mm_pw0.25mm_pl0.875mm" | "sot23_w1.92mm_h2.74mm_p0.95mm_pl0.8mm_pw0.764mm" | "sot23_5_w1.92mm_h2.74mm_p0.95mm_pl0.8mm_pw0.764mm" | "sot223_w8.5mm_h6.9mm_p2.3mm_pl2mm_pw1.5mm" | "pinrow6_rows1_p2.54mm_id1mm_od1.5mm_male"

// Category: Prop types
// Direction a cable or mating part is attached from, named for the side of the footprint it approaches from
FootprintInsertionDirection: InsertionDirectionInput

// Category: Prop types
FootprintProp: AutocompleteString<FootprinterStringAutocomplete> | KicadAutocompleteStringPath | JlcpcbAutocompleteStringPath | ReactElement | FootprintSoupElements[]

// Category: Prop types
// This is an abbreviated definition of the soup elements that you can find here
FootprintSoupElements: {type: "pcb_smtpad" | "pcb_plated_hole"; x: string | number; y: string | number; layer?: LayerRef; holeDiameter?: string | number; outerDiameter?: string | number; shape?: "circle" | "rect"; width?: string | number; height?: string | number; portHints?: string[]; }

// Category: Prop types
// Required minX, maxX, minY, maxY
ImplicitBreakoutBounds: interface ImplicitBreakoutBounds

  minX: number

  maxX: number

  minY: number

  maxY: number

// Category: Prop types
// Required busId, connectionIds
ImplicitBreakoutBus: interface ImplicitBreakoutBus

  busId: string

  connectionIds: readonly string[]

  // Ordered candidate layers that the solver may distribute this bus over
  targetLayers?: readonly string[]

// Category: Prop types
// Required connectionId, endpoints
ImplicitBreakoutConnection: interface ImplicitBreakoutConnection

  connectionId: string

  endpoints: readonly ImplicitBreakoutConnectionEndpoint[]

// Category: Prop types
// Required regionId, position
ImplicitBreakoutConnectionEndpoint: interface ImplicitBreakoutConnectionEndpoint

  regionId: string

  position: ImplicitBreakoutPoint

  // Optional PCB world-space routing destination, in millimeters, beyond this breakout region
  externalDestination?: ImplicitBreakoutPoint

// Category: Prop types
ImplicitBreakoutConnectionOrDifferentialPair: ImplicitBreakoutConnection | ImplicitBreakoutDifferentialPair

// Category: Prop types
// Required type, connections
ImplicitBreakoutDifferentialPair: interface ImplicitBreakoutDifferentialPair

  type: "differential"

  connections: readonly [ImplicitBreakoutConnection, ImplicitBreakoutConnection]

// Category: Prop types
ImplicitBreakoutEdge: "left" | "right" | "bottom" | "top"

// Category: Prop types
// Required x, y
ImplicitBreakoutPoint: interface ImplicitBreakoutPoint

  x: number

  y: number

// Category: Prop types
ImplicitBreakoutPointSolverFn: (input: ImplicitBreakoutPointSolverInput) => ImplicitBreakoutPointSolverOutput | Promise<ImplicitBreakoutPointSolverOutput>

// Category: Prop types
// Required regions, connections, buses, boundaryPointSpacing
ImplicitBreakoutPointSolverInput: interface ImplicitBreakoutPointSolverInput

  regions: readonly ImplicitBreakoutRegion[]

  connections: readonly ImplicitBreakoutConnectionOrDifferentialPair[]

  buses: readonly ImplicitBreakoutBus[]

  boundaryPointSpacing: number

// Category: Prop types
// Required breakoutPoints
ImplicitBreakoutPointSolverOutput: interface ImplicitBreakoutPointSolverOutput

  breakoutPoints: readonly ImplicitBreakoutSolverPoint[]

// Category: Prop types
// Required regionId, bounds, edge
ImplicitBreakoutRegion: interface ImplicitBreakoutRegion

  regionId: string

  bounds: ImplicitBreakoutBounds

  edge: ImplicitBreakoutEdge

// Category: Prop types
// Required regionId, connectionId, layer
ImplicitBreakoutSolverPoint: interface ImplicitBreakoutSolverPoint extends ImplicitBreakoutPoint

  regionId: string

  connectionId: string

  layer: string

// Category: Prop types
InductorPinLabels: "left" | "right" | "pin1" | "pin2"

// Category: Prop types
InternalCircuitElement: ReactElement<InternalCircuitProps, "internalcircuit">

// Category: Prop types
// Props for a semantic container that groups the functional components inside a physical chip package
InternalCircuitProps: interface InternalCircuitProps

  children?: ReactNode

// Category: Prop types
JlcpcbAutocompleteStringPath: AutocompleteString<`jlcpcb:${JlcpcbKnownPartNumber}`>

// Category: Prop types
// Required x, y
KicadAt: interface KicadAt

  x: number | string

  y: number | string

  rotation?: number | string

// Category: Prop types
KicadAutocompleteStringPath: AutocompleteString<`kicad:${KicadPath}`>

// Category: Prop types
KicadEffects: interface KicadEffects

  font?: KicadFont

// Category: Prop types
KicadFont: interface KicadFont

  size?: {x: number | string; y: number | string; }

  thickness?: number | string

// Category: Prop types
KicadFootprintAttributes: interface KicadFootprintAttributes

  through_hole?: boolean

  smd?: boolean

  exclude_from_pos_files?: boolean

  exclude_from_bom?: boolean

// Category: Prop types
KicadFootprintMetadata: interface KicadFootprintMetadata

  footprintName?: string

  version?: number | string

  generator?: string

  generatorVersion?: number | string

  layer?: string

  properties?: KicadFootprintProperties

  attributes?: KicadFootprintAttributes

  pads?: KicadFootprintPad[]

  embeddedFonts?: boolean

  model?: KicadFootprintModel

// Category: Prop types
// Required path
KicadFootprintModel: interface KicadFootprintModel

  path: string

  offset?: {x: number | string; y: number | string; z: number | string; }

  scale?: {x: number | string; y: number | string; z: number | string; }

  rotate?: {x: number | string; y: number | string; z: number | string; }

// Category: Prop types
// Required name, type
KicadFootprintPad: interface KicadFootprintPad

  name: string

  type: string

  shape?: string

  at?: KicadAt

  size?: {x: number | string; y: number | string; }

  drill?: number | string

  layers?: string[]

  removeUnusedLayers?: boolean

  uuid?: string

// Category: Prop types
KicadFootprintProperties: interface KicadFootprintProperties

  Reference?: KicadProperty

  Value?: KicadProperty

  Datasheet?: KicadProperty

  Description?: KicadProperty

// Category: Prop types
// Required value
KicadProperty: interface KicadProperty

  value: string

  at?: KicadAt

  layer?: string

  uuid?: string

  hide?: boolean

  effects?: KicadEffects

// Category: Prop types
KicadSymbolEffects: interface KicadSymbolEffects

  font?: KicadFont

  justify?: string | string[]

  hide?: boolean

// Category: Prop types
KicadSymbolMetadata: interface KicadSymbolMetadata

  symbolName?: string

  extends?: string

  pinNumbers?: KicadSymbolPinNumbers

  pinNames?: KicadSymbolPinNames

  excludeFromSim?: boolean

  inBom?: boolean

  onBoard?: boolean

  properties?: KicadSymbolProperties

  embeddedFonts?: boolean

// Category: Prop types
KicadSymbolPinNames: interface KicadSymbolPinNames

  offset?: number | string

  hide?: boolean

// Category: Prop types
KicadSymbolPinNumbers: interface KicadSymbolPinNumbers

  hide?: boolean

// Category: Prop types
KicadSymbolProperties: interface KicadSymbolProperties

  Reference?: KicadSymbolProperty

  Value?: KicadSymbolProperty

  Footprint?: KicadSymbolProperty

  Datasheet?: KicadSymbolProperty

  Description?: KicadSymbolProperty

  ki_keywords?: KicadSymbolProperty

  ki_fp_filters?: KicadSymbolProperty

// Category: Prop types
// Required value
KicadSymbolProperty: interface KicadSymbolProperty

  value: string

  id?: number | string

  at?: KicadAt

  effects?: KicadSymbolEffects

// Category: Prop types
LayoutConfig: interface LayoutConfig

  layoutMode?: "grid" | "flex" | "match-adapt" | "relative" | "none"

  position?: "absolute" | "relative"

  grid?: boolean

  gridCols?: number | string

  gridRows?: number | string

  gridTemplateRows?: string

  gridTemplateColumns?: string

  gridTemplate?: string

  gridGap?: number | string

  gridRowGap?: number | string

  gridColumnGap?: number | string

  flex?: boolean | string

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

// Category: Prop types
ManualEditsFileInput: { pcb_placements?: { center: { x: string | number; y: string | number; }; selector: string; relative_to?: string; }[]; manual_trace_hints?: { pcb_port_selector: string; offsets: { x: string | number; y: string | number; via?: boolean; to_layer?: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8" | { name: "top" | "bottom" | "inner1" | "inner2" | "inner3" | "inner4" | "inner5" | "inner6" | "inner7" | "inner8"; }; trace_width?: string | number; }[]; }[]; schematic_placements?: { center: { x: string | number; y: string | number; }; selector: string; relative_to?: string; }[]; }

// Category: Prop types
MaybePromise<T>: T | Promise<T>

// Category: Prop types
MosfetPinLabels: "pin1" | "pin2" | "pin3" | "drain" | "source" | "gate"

// Category: Prop types
NinePointAnchor: "top_left" | "top_center" | "top_right" | "center_left" | "center" | "center_right" | "bottom_left" | "bottom_center" | "bottom_right"

// Category: Prop types
// Pin labels for an op-amp component
OpAmpPinLabels: "inverting_input" | "non_inverting_input" | "output" | "positive_supply" | "negative_supply"

// Category: Prop types
PcbOrientation: "vertical" | "horizontal"

// Category: Prop types
PcbPath: Array<PcbPathPoint | string>

// Category: Prop types
PcbPathPoint: interface PcbPathPoint extends Point

  via?: boolean

  fromLayer?: LayerRefInput

  toLayer?: LayerRefInput

// Category: Prop types
PcbPositionMode: "relative_to_group_anchor" | "auto" | "relative_to_board_anchor" | "relative_to_component_anchor"

// Category: Prop types
// Required pcbTraces, cacheKey
PcbRouteCache: interface PcbRouteCache

  pcbTraces: PcbTrace[]

  cacheKey: string

// Category: Prop types
PcbStyle: interface PcbStyle

  silkscreenFontSize?: string | number

  viaPadDiameter?: string | number

  viaHoleDiameter?: string | number

  silkscreenTextPosition?: "centered" | "outside" | "none" | {offsetX: number; offsetY: number; }

  silkscreenTextVisibility?: "hidden" | "visible" | "inherit"

// Category: Prop types
PcbSx: PcbSxBase & {[K in PcbSxSelector]?: PcbSxValue; }

// Category: Prop types
PcbSxBase: Record<string, PcbSxValue>

// Category: Prop types
PcbSxSelector: "& footprint[src^='kicad:'] silkscreentext" | "& footprint[src^='jlcpcb:'] silkscreentext" | "& silkscreentext" | "& fabricationnotetext"

// Category: Prop types
PcbSxValue: interface PcbSxValue

  fontSize?: string | number

  pcbX?: string | number

  pcbY?: string | number

  visibility?: "hidden" | "visible" | "inherit"

// Category: Prop types
PinAttributeMap: interface PinAttributeMap

  capabilities?: Array<PinCapability>

  activeCapabilities?: Array<PinCapability>

  activeCapability?: PinCapability

  providesPower?: boolean

  requiresPower?: boolean

  providesGround?: boolean

  requiresGround?: boolean

  providesVoltage?: string | number

  requiresVoltage?: string | number

  doNotConnect?: boolean

  includeInBoardPinout?: boolean

  highlightColor?: string

  mustBeConnected?: boolean

  canUseInternalPullup?: boolean

  isUsingInternalPullup?: boolean

  needsExternalPullup?: boolean

  canUseInternalPulldown?: boolean

  isUsingInternalPulldown?: boolean

  needsExternalPulldown?: boolean

  canUseOpenDrain?: boolean

  isUsingOpenDrain?: boolean

  canUsePushPull?: boolean

  isUsingPushPull?: boolean

  shouldHaveDecouplingCapacitor?: boolean

  recommendedDecouplingCapacitorCapacitance?: string | number

  isGpio?: boolean

// Category: Prop types
PinCapability: "i2c_sda" | "i2c_scl" | "spi_cs" | "spi_sck" | "spi_mosi" | "spi_miso" | "uart_tx" | "uart_rx"

// Category: Prop types
PinCompatibleVariant: interface PinCompatibleVariant

  manufacturerPartNumber?: string

  supplierPartNumber?: SupplierPartNumbers

// Category: Prop types
PinLabelsProp<PinNumber extends string = string, PinLabel extends string = string>: Record<PinNumber, PinLabel | readonly PinLabel[] | PinLabel[]>

// Category: Prop types
// Required pins, direction
PinSideDefinition: interface PinSideDefinition

  pins: Array<number | string>

  direction: "top-to-bottom" | "left-to-right" | "bottom-to-top" | "right-to-left"

// Category: Prop types
PinSideDefinitionInput: PinSideDefinition | Array<number | string>

// Category: Prop types
PinVariant: "two_pin" | "four_pin"

// Category: Prop types
Point: {x: number | string; y: number | string; }

// Category: Prop types
PortHints: (string | number)[]

// Category: Prop types
PotentiometerPinLabels: "pin1" | "pin2" | "pin3"

// Category: Prop types
PotentiometerPinVariant: "two_pin" | "three_pin"

// Category: Prop types
ResistorPinLabels: "pin1" | "pin2" | "pos" | "neg"

// Category: Prop types
ResonatorPinVariant: "no_ground" | "ground_pin" | "two_ground_pins"

// Category: Prop types
SchematicOrientation: "vertical" | "horizontal" | "pos_top" | "pos_bottom" | "pos_left" | "pos_right" | "neg_top" | "neg_bottom" | "neg_left" | "neg_right"

// Category: Prop types
SchematicPinArrangement: SchematicPortArrangement

// Category: Prop types
SchematicPinLabel: string

// Category: Prop types
SchematicPinStyle: Record<string, {marginTop?: number | string; marginRight?: number | string; marginBottom?: number | string; marginLeft?: number | string; leftMargin?: number | string; rightMargin?: number | string; topMargin?: number | string; bottomMargin?: number | string; }>

// Category: Prop types
SchematicPortArrangement: interface SchematicPortArrangement extends SchematicPortArrangementWithSizes, SchematicPortArrangementWithSides, SchematicPortArrangementWithPinCounts

// Category: Prop types
// Specifies the number of pins on each side of the schematic box component
SchematicPortArrangementWithPinCounts: interface SchematicPortArrangementWithPinCounts

  leftPinCount?: number

  topPinCount?: number

  rightPinCount?: number

  bottomPinCount?: number

// Category: Prop types
SchematicPortArrangementWithSides: interface SchematicPortArrangementWithSides

  leftSide?: PinSideDefinitionInput

  topSide?: PinSideDefinitionInput

  rightSide?: PinSideDefinitionInput

  bottomSide?: PinSideDefinitionInput

// Category: Prop types
SchematicPortArrangementWithSizes: interface SchematicPortArrangementWithSizes

  leftSize?: number

  topSize?: number

  rightSize?: number

  bottomSize?: number

// Category: Prop types
SchematicSheetSize: "A4" | "ANSI_B"

// Category: Prop types
SchematicSymbolSize: string | number

// Category: Prop types
SchStyle: interface SchStyle

  defaultPassiveSize?: "xs" | "sm" | "md" | string | number

  defaultCapacitorOrientation?: "vertical" | "none"

// Category: Prop types
SelectionResult: SelectionResultComponent | SelectionResultPort | SelectionResultNet

// Category: Prop types
// Required getPort, getPorts, getPcbComponent, getSourceComponent
SelectionResultComponent: interface SelectionResultComponent

  getPort: (name: string) => SelectionResultPort | null

  getPorts: () => SelectionResultPort[]

  getPcbComponent: () => PcbComponent | null

  getSourceComponent: () => SourceComponentBase | null

// Category: Prop types
// Required getSourceNet
SelectionResultNet: interface SelectionResultNet

  getSourceNet: () => SourceNet | null

// Category: Prop types
// Required getPcbPort, getSourcePort
SelectionResultPort: interface SelectionResultPort

  getPcbPort: () => PcbPort | null

  getSourcePort: () => SourcePort | null

// Category: Prop types
SpiceModelElement: ReactElement<SpiceModelProps>

// Category: Prop types
// Required source
SpiceModelProps: interface SpiceModelProps

  source: string

  spicePinMapping?: Record<string, string>

// Category: Prop types
SpiceOptions: interface SpiceOptions

  method?: "trap" | "gear"

  reltol?: number | string

  abstol?: number | string

  vntol?: number | string

// Category: Prop types
SupplierName: "jlcpcb" | "macrofab" | "pcbway" | "digikey" | "mouser" | "lcsc"

// Category: Prop types
SupplierPartNumbers: {[k in SupplierName]?: string[]; }

// Category: Prop types
SymbolProp: string | ReactElement | AnyCircuitElement[]

// Category: Prop types
TestpointConnections: { pin1: string | readonly string[] | string[]; }

// Category: Prop types
VoltageSourcePinLabels: "pin1" | "pin2" | "pos" | "neg"

// Category: Prop types
WaveShape: "sinewave" | "square" | "triangle" | "sawtooth"
