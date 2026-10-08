# @tscircuit/core — Components

32 top-level symbols. Signatures are verbatim typescript.

// Category: Components
// JSX element <antenna> with AntennaProps, required name
<antenna>: AntennaProps extends CommonComponentProps

  // Band-qualified PCB-trace topology to generate
  antennaShape?: AntennaShape

  // Nominal operating band or multiband configuration
  frequencyBand?: AntennaFrequencyBand

  // Explicit antenna path
  pcbPath?: PcbPath

// Category: Components
// JSX element <resistor> with ResistorProps, required resistance, name
<resistor>: ResistorProps extends CommonComponentProps

  resistance: number | string

  tolerance?: number | string

  pullupFor?: string

  pullupTo?: string

  pulldownFor?: string

  pulldownTo?: string

  schOrientation?: SchematicOrientation

  schSize?: SchematicSymbolSize

  connections?: Connections<ResistorPinLabels>

// Category: Components
// JSX element <capacitor> with CapacitorProps, required capacitance, name
<capacitor>: CapacitorProps extends CommonComponentProps

  capacitance: number | string

  maxVoltageRating?: number | string

  schShowRatings?: boolean

  polarized?: boolean

  decouplingFor?: string

  decouplingTo?: string

  bypassFor?: string

  bypassTo?: string

  // Maximum allowed PCB trace length between this capacitor and the component it decouples
  maxDecouplingTraceLength?: number | string

  schOrientation?: SchematicOrientation

  schSize?: SchematicSymbolSize

  connections?: Connections<CapacitorPinLabels>

// Category: Components
// JSX element <inductor> with InductorProps, required inductance, name
<inductor>: InductorProps extends CommonComponentProps

  inductance: number | string

  maxCurrentRating?: number | string

  schOrientation?: SchematicOrientation

  connections?: Connections<InductorPinLabels>

// Category: Components
// JSX element <pushbutton> with PushButtonProps, required name
<pushbutton>: PushButtonProps extends CommonComponentProps

  pinLabels?: PinLabelsProp<SchematicPinLabel, PinLabel>

  // Whether to show pin aliases in the schematic
  showPinAliases?: boolean

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  schPinArrangement?: SchematicPortArrangement

  pinCompatibleVariants?: PinCompatibleVariant[]

  schPinStyle?: SchematicPinStyle

  schWidth?: Distance

  schHeight?: Distance

  noSchematicRepresentation?: boolean

  // Whether to show the components from `internalCircuit` in the schematic
  schShowInternalCircuit?: boolean

  internallyConnectedPins?: (string | number)[][]

  externallyConnectedPins?: string[][]

  // Pins intentionally left unconnected
  noConnect?: readonly PinLabel[] | PinLabel[]

  connections?: Connections<PinLabel>

  spiceModel?: SpiceModelElement

  // Functional components contained inside this physical chip package, wrapped in an `<internalcircuit />` element
  internalCircuit?: InternalCircuitElement

// Category: Components
// JSX element <diode> with DiodeProps, required name
<diode>: DiodeProps extends CommonComponentProps

  pinLabels?: DiodePinLabelsProp<PinLabel>

  connections?: {anode?: string | string[] | readonly string[]; cathode?: string | string[] | readonly string[]; pin1?: string | string[] | readonly string[]; pin2?: string | string[] | readonly string[]; pos?: string | string[] | readonly string[]; neg?: string | string[] | readonly string[]; }

  variant?: "standard" | "schottky" | "zener" | "avalanche" | "photo" | "tvs"

  standard?: boolean

  schottky?: boolean

  zener?: boolean

  avalanche?: boolean

  photo?: boolean

  tvs?: boolean

  schOrientation?: SchematicOrientation

// Category: Components
// JSX element <fuse> with FuseProps, required currentRating, name
<fuse>: FuseProps extends CommonComponentProps

  // Current rating of the fuse in amperes
  currentRating: number | string

  // Voltage rating of the fuse
  voltageRating?: number | string

  // Whether to show ratings on schematic
  schShowRatings?: boolean

  schOrientation?: SchematicOrientation

  // Connections to other components
  connections?: Connections<PinLabel>

// Category: Components
// JSX element <led> with LedProps, required name
<led>: LedProps extends CommonComponentProps

  connections?: Partial<Record<"left" | "right" | "pin1" | "pin2" | "anode" | "pos" | "cathode" | "neg", string | readonly string[] | string[]>>

  pinLabels?: Partial<Record<"left" | "right" | "pin1" | "pin2" | "anode" | "pos" | "cathode" | "neg", string | readonly string[] | string[]>> | Partial<Record<"1" | "2", string | readonly string[] | string[]>>

  schOrientation?: "vertical" | "horizontal" | "pos_top" | "pos_bottom" | "pos_left" | "pos_right" | "neg_top" | "neg_bottom" | "neg_left" | "neg_right"

  color?: string

  wavelength?: string

  schDisplayValue?: string

  laser?: boolean

// Category: Components
// JSX element <jumper> with JumperProps, required name
<jumper>: JumperProps extends CommonComponentProps

  pinLabels?: Record<number | SchematicPinLabel, SchematicPinLabel | SchematicPinLabel[]>

  schPinStyle?: SchematicPinStyle

  schWidth?: number | string

  schHeight?: number | string

  schDirection?: "left" | "right"

  schPinArrangement?: SchematicPortArrangement

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  // Number of pins on the jumper (2 or 3)
  pinCount?: 2 | 3

  // Groups of pins that are internally connected e.g., [["1","2"], ["2","3"]]
  internallyConnectedPins?: (string | number)[][]

  // Connections to other components
  connections?: Connections<string>

// Category: Components
// JSX element <interconnect> with InterconnectProps, required name
<interconnect>: InterconnectProps extends CommonComponentProps

  standard?: "TSC0001_36P_XALT_2025_11" | "0805" | "0603" | "1206"

  pinLabels?: Record<number | SchematicPinLabel, SchematicPinLabel | SchematicPinLabel[]>

  // Groups of pins that are internally connected e.g., [["1","2"], ["2","3"]]
  internallyConnectedPins?: (string | number)[][]

// Category: Components
// JSX element <solderjumper> with SolderJumperProps, required name
<solderjumper>: SolderJumperProps extends CommonComponentProps

  // Pins that are bridged with solder by default
  bridgedPins?: string[][]

  // If true, all pins are connected with cuttable traces
  bridged?: boolean

  pinLabels?: Record<number | SchematicPinLabel, SchematicPinLabel | SchematicPinLabel[]>

  schPinStyle?: SchematicPinStyle

  schWidth?: number | string

  schHeight?: number | string

  schDirection?: "left" | "right"

  schPinArrangement?: SchematicPortArrangement

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  // Number of pins on the jumper (2 or 3)
  pinCount?: 2 | 3

  // Groups of pins that are internally connected e.g., [["1","2"], ["2","3"]]
  internallyConnectedPins?: (string | number)[][]

  // Connections to other components
  connections?: Connections<string>

// Category: Components
// JSX element <potentiometer> with PotentiometerProps, required maxResistance, name
<potentiometer>: PotentiometerProps extends CommonComponentProps

  maxResistance: number | string

  pinVariant?: PotentiometerPinVariant

  connections?: Connections<PotentiometerPinLabels>

// Category: Components
// JSX element <chip> with ChipProps, required name
<chip>: ChipProps extends CommonComponentProps

  pinLabels?: PinLabelsProp<SchematicPinLabel, PinLabel>

  // Whether to show pin aliases in the schematic
  showPinAliases?: boolean

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  schPinArrangement?: SchematicPortArrangement

  pinCompatibleVariants?: PinCompatibleVariant[]

  schPinStyle?: SchematicPinStyle

  schWidth?: Distance

  schHeight?: Distance

  noSchematicRepresentation?: boolean

  // Whether to show the components from `internalCircuit` in the schematic
  schShowInternalCircuit?: boolean

  internallyConnectedPins?: (string | number)[][]

  externallyConnectedPins?: string[][]

  // Pins intentionally left unconnected
  noConnect?: readonly PinLabel[] | PinLabel[]

  connections?: Connections<PinLabel>

  spiceModel?: SpiceModelElement

  // Functional components contained inside this physical chip package, wrapped in an `<internalcircuit />` element
  internalCircuit?: InternalCircuitElement

// Category: Components
// JSX element <pinout> with PinoutProps, required name
<pinout>: PinoutProps extends CommonComponentProps

  pinLabels?: PinLabelsProp<SchematicPinLabel, PinLabel>

  // Whether to show pin aliases in the schematic
  showPinAliases?: boolean

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  schPinArrangement?: SchematicPortArrangement

  pinCompatibleVariants?: PinCompatibleVariant[]

  schPinStyle?: SchematicPinStyle

  schWidth?: Distance

  schHeight?: Distance

  noSchematicRepresentation?: boolean

  // Whether to show the components from `internalCircuit` in the schematic
  schShowInternalCircuit?: boolean

  internallyConnectedPins?: (string | number)[][]

  externallyConnectedPins?: string[][]

  // Pins intentionally left unconnected
  noConnect?: readonly PinLabel[] | PinLabel[]

  connections?: Connections<PinLabel>

  spiceModel?: SpiceModelElement

  // Functional components contained inside this physical chip package, wrapped in an `<internalcircuit />` element
  internalCircuit?: InternalCircuitElement

// Category: Components
// JSX element <powersource> with PowerSourceProps, required name, voltage
<powersource>: PowerSourceProps extends CommonComponentProps

  voltage: string | number

// Category: Components
// JSX element <opamp> with OpAmpProps, required name
<opamp>: OpAmpProps extends CommonComponentProps

  connections?: Connections<OpAmpPinLabels>

// Category: Components
// JSX element <component> with ComponentProps, required name
<component>: ComponentProps extends CommonComponentProps

// Category: Components
// JSX element <crystal> with CrystalProps, required frequency, loadCapacitance, name
<crystal>: CrystalProps extends CommonComponentProps

  frequency: number | string

  loadCapacitance: number | string

  // Maximum allowed PCB trace length between the crystal and its connected component
  maxTraceLength?: number | string

  mpn?: string

  pinVariant?: PinVariant

  schOrientation?: SchematicOrientation

  connections?: Connections<CrystalPinLabels>

// Category: Components
// JSX element <battery> with BatteryProps, required name
<battery>: BatteryProps extends CommonComponentProps

  capacity?: number | string

  voltage?: number | string

  standard?: "AA" | "AAA" | "9V" | "CR2032" | "18650" | "C"

  schOrientation?: SchematicOrientation

  connections?: Connections<BatteryPinLabels>

// Category: Components
// JSX element <connector> with ConnectorProps, required name
<connector>: ConnectorProps extends CommonComponentProps

  // Connector interface or product family, e.g
  standard?: ConnectorStandard

  // Number of electrical circuits in the connector
  pinCount?: number

  pinLabels?: PinLabelsProp<SchematicPinLabel, PinLabel>

  // Whether to show pin aliases in the schematic
  showPinAliases?: boolean

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  schPinArrangement?: SchematicPortArrangement

  pinCompatibleVariants?: PinCompatibleVariant[]

  schPinStyle?: SchematicPinStyle

  schWidth?: Distance

  schHeight?: Distance

  noSchematicRepresentation?: boolean

  // Whether to show the components from `internalCircuit` in the schematic
  schShowInternalCircuit?: boolean

  internallyConnectedPins?: (string | number)[][]

  externallyConnectedPins?: string[][]

  // Pins intentionally left unconnected
  noConnect?: readonly PinLabel[] | PinLabel[]

  connections?: Connections<PinLabel>

  spiceModel?: SpiceModelElement

  // Functional components contained inside this physical chip package, wrapped in an `<internalcircuit />` element
  internalCircuit?: InternalCircuitElement

// Category: Components
// JSX element <pinheader> with PinHeaderProps, required pinCount, name
<pinheader>: PinHeaderProps extends CommonComponentProps

  // Number of pins in the header
  pinCount: number

  // Distance between pins
  pitch?: number | string

  // Schematic facing direction
  schFacingDirection?: "up" | "down" | "left" | "right"

  // Whether the header is male, female, or unpopulated
  gender?: "male" | "female" | "unpopulated"

  // Mount the header on the top of the board, so it is connected to from above
  connectsFromAbove?: boolean

  // Mount the header on the underside of the board, so it is connected to from below
  connectsFromBelow?: boolean

  // Whether to show pin labels in silkscreen
  showSilkscreenPinLabels?: boolean

  // Labels for PCB pins
  pcbPinLabels?: Record<string, string>

  // Whether the header has two rows of pins
  doubleRow?: boolean

  // If true, the header is a right-angle style connector
  rightAngle?: boolean

  // Orientation of the header on the PCB
  pcbOrientation?: PcbOrientation

  // Diameter of the through-hole for each pin
  holeDiameter?: number | string

  // Diameter of the plated area around each hole
  platedDiameter?: number | string

  // Labels for each pin
  pinLabels?: Record<string, SchematicPinLabel> | SchematicPinLabel[]

  // Connections to other components
  connections?: Connections<string>

  // Direction the header is facing
  facingDirection?: "left" | "right"

  // Pin arrangement in schematic view
  schPinArrangement?: SchematicPinArrangement

  // Schematic pin style (margins, etc)
  schPinStyle?: SchematicPinStyle

  // Schematic width
  schWidth?: number | string

  // Schematic height
  schHeight?: number | string

// Category: Components
// JSX element <resonator> with ResonatorProps, required frequency, loadCapacitance, name
<resonator>: ResonatorProps extends CommonComponentProps

  frequency: number | string

  loadCapacitance: number | string

  pinVariant?: ResonatorPinVariant

// Category: Components
// JSX element <transistor> with TransistorProps, required type, name
<transistor>: TransistorProps extends CommonComponentProps

  type: "npn" | "pnp" | "bjt" | "jfet" | "mosfet" | "igbt"

  connections?: Connections<transistorPinsLabels>

// Category: Components
// JSX element <switch> with SwitchProps, required name
<switch>: SwitchProps extends CommonComponentProps

  type?: "spst" | "spdt" | "dpst" | "dpdt"

  pinLabels?: PinLabelsProp<SchematicPinLabel>

  isNormallyClosed?: boolean

  spdt?: boolean

  spst?: boolean

  dpst?: boolean

  dpdt?: boolean

  simSwitchFrequency?: number | string

  simCloseAt?: number | string

  simOpenAt?: number | string

  simStartClosed?: boolean

  simStartOpen?: boolean

  connections?: Connections<string>

// Category: Components
// JSX element <mosfet> with MosfetProps, required channelType, mosfetMode, name
<mosfet>: MosfetProps extends CommonComponentProps

  channelType: "n" | "p"

  mosfetMode: "enhancement" | "depletion"

  // The side of the schematic symbol where the drain port is placed
  symbolDrainSide?: "left" | "right" | "top" | "bottom"

  // The side of the schematic symbol where the source port is placed
  symbolSourceSide?: "left" | "right" | "top" | "bottom"

  // The side of the schematic symbol where the gate port is placed
  symbolGateSide?: "left" | "right" | "top" | "bottom"

  connections?: Connections<MosfetPinLabels>

// Category: Components
// JSX element <testpoint> with TestpointProps, required name
<testpoint>: TestpointProps extends CommonComponentProps

  // The footprint variant of the testpoint either a surface pad or through-hole
  footprintVariant?: "pad" | "through_hole"

  // The shape of the pad if using a pad variant
  padShape?: "rect" | "circle"

  // Diameter of the copper pad (applies to both SMD pads and plated holes)
  padDiameter?: number | string

  // Diameter of the hole if using a through-hole testpoint
  holeDiameter?: number | string

  // Width of the pad when padShape is rect
  width?: number | string

  // Height of the pad when padShape is rect
  height?: number | string

  connections?: TestpointConnections

// Category: Components
// JSX element <voltagesource> with VoltageSourceProps, required name
<voltagesource>: VoltageSourceProps extends CommonComponentProps

  voltage?: number | string

  frequency?: number | string

  peakToPeakVoltage?: number | string

  waveShape?: WaveShape

  phase?: number | string

  dutyCycle?: number | string

  pulseDelay?: number | string

  riseTime?: number | string

  fallTime?: number | string

  pulseWidth?: number | string

  period?: number | string

  // Small-signal AC magnitude
  acMagnitude?: number | string

  // Small-signal AC phase
  acPhase?: number | string

  connections?: Connections<VoltageSourcePinLabels>

// Category: Components
// JSX element <currentsource> with CurrentSourceProps, required name
<currentsource>: CurrentSourceProps extends CommonComponentProps

  current?: number | string

  frequency?: number | string

  peakToPeakCurrent?: number | string

  waveShape?: WaveShape

  phase?: number | string

  dutyCycle?: number | string

  // Small-signal AC magnitude
  acMagnitude?: number | string

  // Small-signal AC phase
  acPhase?: number | string

  connections?: Connections<CurrentSourcePinLabels>

// Category: Components
// JSX element <ammeter> with AmmeterProps, required connections, name
<ammeter>: AmmeterProps extends CommonComponentProps

  connections: Connections<AmmeterPinLabels>

  color?: string

  graphDisplayName?: string

  graphCenter?: number

  graphVerticalOffset?: number | string

  graphCurrentPerDiv?: number | string

// Category: Components
// JSX element <voltageprobe> with VoltageProbeProps, required connectsTo
<voltageprobe>: VoltageProbeProps extends CommonComponentProps

  connectsTo: string

  referenceTo?: string

  color?: string

  graphDisplayName?: string

  graphCenter?: number

  graphVerticalOffset?: number | string

  graphVoltagePerDiv?: number | string

// Category: Components
// JSX element <fiducial> with FiducialProps, required padDiameter, name
<fiducial>: FiducialProps extends CommonComponentProps

  soldermaskPullback?: Distance

  padDiameter: Distance

// Category: Components
// Same props as <chip>
<bug>: ChipProps extends CommonComponentProps
