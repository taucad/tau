---
name: cad-tscircuit
description: Guides tscircuit TSX electronics authoring in main.tsx. Use when creating or editing boards, schematics or PCB layouts in Tau.
---

# tscircuit TSX authoring

## Contract

1. Author `main.tsx` (or `.jsx`) and `export default` one board component. Helper components may live in local `.tsx` files imported relatively.
2. `React` is a global, so importing it is optional; `tscircuit` and `@tscircuit/core` both resolve to the core exports (`sel`, `useResistor`, …).
3. Elements are lower-case JSX tags: `<board>`, `<resistor>`, `<capacitor>`, `<led>`, `<diode>`, `<chip>`, `<pinheader>`, `<trace>`, `<net>`, `<group>`. Give every component a unique `name`.
4. `footprint` is a footprinter string: `0402`, `0805`, `soic8`, `dip8`, `tssop16`, `pinrow4_p2.54mm`, `axial_p10mm`, `radial_p5mm`, `to220_3`. Place with `pcbX`/`pcbY` (mm) and `schX`/`schY`.
5. Wire with `<trace from='.R1 > .pin1' to='.U1 > .VCC' />`, `to='net.GND'`, or `connections` on a part. Selectors name a pin by its label or `pinN`. Prefer named nets for power and ground.
6. Parameters: export `defaultParameters` (a plain object); Tau passes edited values as props.
7. Rendering and routing are offline. URL footprints and CAD models are never fetched; `kicad:`/`jlcpcb:` parts remain unplaced.
8. Views: `board` (3D GLB, default), `schematic` (SVG sheets), `pcb` (SVG, `pinNumbers` option). `screenshot.view` selects one, `screenshot.instance` a sheet. Export IDs for `export_model.to`: `board` (`glb`), `bom` (`csv`), `netlist` (`txt`), `circuit` (`json`).

## Check a board

1. After edits, call `evaluate_model` and read every issue; `ready` may still carry errors. Fix the first error before its consequences, then open pins, routing and placement.
2. Capture `schematic` and `pcb` separately, at most twice each per inspection cycle; use `board` for mechanical fit.
3. For parts and open pins, prefer `netlist` and `bom` exports to circuit JSON: call `export_model`, then `read_file` on its artifact path and check its `sourceRevision`. Binary exports still need a user request.

## Wrong / Correct

- Wrong: `schPinArrangement={{ leftSide: { pins: ['IN'] } }}` (invalid props, chip not created). Correct: `leftSide: ['IN', 'GND']`, `{ pins: [...], direction: 'top-to-bottom' }` or `leftPinCount: 2`.
- Wrong: `cadModel='to220_5'` (throws `String cadModel not yet implemented`). Correct: omit `cadModel`; a footprinter `footprint` already has a 3D body, and `cadModel={null}` hides it.
- Wrong: invented footprint functions such as `cappr_d10mm_p5mm`. Correct: a function from the footprint strings reference, e.g. `radial_p5mm`.
- Wrong: editing traces for `Could not find port for selector ".U1 > .OUT"`. Correct: fix why `U1` was not created; its error is reported first.
- Wrong: chasing `No <schematicsheet> was found` or `missing schematic reference designator text`. Correct: leave them; they are schematic styling warnings on any board without a custom sheet or symbol. Fix `missing a trace` warnings instead.

## Verify

Test with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.tsx' })` loads the `board` view, the PCB plus every part's 3D body. Assert the outline with `toHaveBoundingBox({ size: { x, y } })`; z spans the board thickness and the part bodies. GeoSpec does not test connectivity: check open pins in `evaluate_model` issues and the `netlist` export.

## Canonical pattern

```tsx
export default () => (
  <board width='30mm' height='20mm'>
    <chip
      name='U1'
      footprint='soic8'
      pcbX={0}
      pcbY={0}
      pinLabels={{ pin1: 'VCC', pin4: 'GND', pin8: 'OUT' }}
      connections={{ VCC: 'net.VCC', GND: 'net.GND' }}
    />
    <resistor name='R1' resistance='10k' footprint='0402' pcbX={-8} pcbY={4} />
    <led name='LED1' color='red' footprint='0603' pcbX={8} pcbY={4} />
    <pinheader
      name='J1'
      pinCount={2}
      footprint='pinrow2'
      pcbX={0}
      pcbY={-6}
      pinLabels={{ pin1: 'VCC', pin2: 'GND' }}
      connections={{ VCC: 'net.VCC', GND: 'net.GND' }}
    />
    <trace from='.U1 > .OUT' to='.R1 > .pin1' />
    <trace from='.R1 > .pin2' to='.LED1 > .anode' />
    <trace from='.LED1 > .cathode' to='net.GND' />
  </board>
);
```

Keep boards small: fixed `width`/`height`, every part placed, every pin on a trace or net. Grep the reference for a tag (`<chip>`) for its props; shared props (`name`, `footprint`, `pcbX`, `cadModel`) are under `CommonComponentProps` and `CommonLayoutProps`.

## Core API

The symbols real Tau models use most, as verbatim declarations. Anything not shown is in the API reference below.

### Boards, groups and layout

```ts
// JSX element <board> with BoardProps
<board>: BoardProps extends Omit<SubcircuitGroupProps, "connections">
  title?: string
  // Number of layers for the PCB
  layers?: 1 | 2 | 4 | 6 | 8 | 10
  thickness?: Distance
  // … 16 more members in the API reference

Distance: number | string
```

### Shared props

```ts
// Props every element extending BaseGroupProps accepts
interface BaseGroupProps extends CommonLayoutProps
  name?: string
  // Mapping of external pin names to internal connection targets
  connections?: Connections
  minTraceWidth?: Distance
  width?: Distance
  height?: Distance
  // … 92 more members in the API reference

// Props every element extending CommonLayoutProps accepts
interface CommonLayoutProps extends PcbLayoutProps
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

FootprintProp: AutocompleteString<FootprinterStringAutocomplete> | KicadAutocompleteStringPath | JlcpcbAutocompleteStringPath | ReactElement | FootprintSoupElements[]

SymbolProp: string | ReactElement | AnyCircuitElement[]

interface SchStyle
  defaultPassiveSize?: "xs" | "sm" | "md" | string | number
  defaultCapacitorOrientation?: "vertical" | "none"

// Props every element extending CommonComponentProps accepts
interface CommonComponentProps extends CommonLayoutProps
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

interface PinAttributeMap
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

SupplierPartNumbers: {[k in SupplierName]?: string[]; }

CadModelProp: null | ReactElement | CadModelFootprinterString | CadModelStl | CadModelObj | CadModelGltf | CadModelGlb | CadModelStep | CadModelWrl | CadModelJscad

interface KicadFootprintMetadata
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

interface KicadSymbolMetadata
  symbolName?: string
  extends?: string
  pinNumbers?: KicadSymbolPinNumbers
  pinNames?: KicadSymbolPinNames
  excludeFromSim?: boolean
  inBom?: boolean
  onBoard?: boolean
  properties?: KicadSymbolProperties
  embeddedFonts?: boolean

PinCapability: "i2c_sda" | "i2c_scl" | "spi_cs" | "spi_sck" | "spi_mosi" | "spi_miso" | "uart_tx" | "uart_rx"

SupplierName: "jlcpcb" | "macrofab" | "pcbway" | "digikey" | "mouser" | "lcsc"

// A Footprinter string used to procedurally generate the component's CAD model, independently of the…
CadModelFootprinterString: string

// Required stlUrl
interface CadModelStl extends CadModelBase
  stlUrl: string

// Required objUrl
interface CadModelObj extends CadModelBase
  objUrl: string
  mtlUrl?: string

// Required gltfUrl
interface CadModelGltf extends CadModelBase
  gltfUrl: string

// Required glbUrl
interface CadModelGlb extends CadModelBase
  glbUrl: string

// Required stepUrl
interface CadModelStep extends CadModelBase
  stepUrl: string

// Required wrlUrl
interface CadModelWrl extends CadModelBase
  wrlUrl: string

// Required jscad
interface CadModelJscad extends CadModelBase
  jscad: Record<string, any>

interface KicadFootprintProperties
  Reference?: KicadProperty
  Value?: KicadProperty
  Datasheet?: KicadProperty
  Description?: KicadProperty

interface KicadFootprintAttributes
  through_hole?: boolean
  smd?: boolean
  exclude_from_pos_files?: boolean
  exclude_from_bom?: boolean

// Required name, type
interface KicadFootprintPad
  name: string
  type: string
  shape?: string
  at?: KicadAt
  size?: {x: number | string; y: number | string; }
  drill?: number | string
  layers?: string[]
  removeUnusedLayers?: boolean
  uuid?: string

// Required path
interface KicadFootprintModel
  path: string
  offset?: {x: number | string; y: number | string; z: number | string; }
  scale?: {x: number | string; y: number | string; z: number | string; }
  rotate?: {x: number | string; y: number | string; z: number | string; }

interface KicadSymbolPinNumbers
  hide?: boolean

interface KicadSymbolPinNames
  offset?: number | string
  hide?: boolean

interface KicadSymbolProperties
  Reference?: KicadSymbolProperty
  Value?: KicadSymbolProperty
  Footprint?: KicadSymbolProperty
  Datasheet?: KicadSymbolProperty
  Description?: KicadSymbolProperty
  ki_keywords?: KicadSymbolProperty
  ki_fp_filters?: KicadSymbolProperty

// Props every element extending PcbLayoutProps accepts
interface PcbLayoutProps
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
  // If true, both pcb and schematic coordinates will be interpreted relative to the parent…
  relative?: boolean

PcbPositionMode: "relative_to_group_anchor" | "auto" | "relative_to_board_anchor" | "relative_to_component_anchor"

interface PcbStyle
  silkscreenFontSize?: string | number
  viaPadDiameter?: string | number
  viaHoleDiameter?: string | number
  silkscreenTextPosition?: "centered" | "outside" | "none" | {offsetX: number; offsetY: number; }
  silkscreenTextVisibility?: "hidden" | "visible" | "inherit"

PcbSx: PcbSxBase & {[K in PcbSxSelector]?: PcbSxValue; }

PcbSxBase: Record<string, PcbSxValue>

PcbSxSelector: "& footprint[src^='kicad:'] silkscreentext" | "& footprint[src^='jlcpcb:'] silkscreentext" | "& silkscreentext" | "& fabricationnotetext"

interface PcbSxValue
  fontSize?: string | number
  pcbX?: string | number
  pcbY?: string | number
  visibility?: "hidden" | "visible" | "inherit"
```

### Components

```ts
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

SchematicPinLabel: string

interface SchematicPortArrangement extends SchematicPortArrangementWithSizes, SchematicPortArrangementWithSides, SchematicPortArrangementWithPinCounts

interface PinCompatibleVariant
  manufacturerPartNumber?: string
  supplierPartNumber?: SupplierPartNumbers

SchematicPinStyle: Record<string, {marginTop?: number | string; marginRight?: number | string; marginBottom?: number | string; marginLeft?: number | string; leftMargin?: number | string; rightMargin?: number | string; topMargin?: number | string; bottomMargin?: number | string; }>

SpiceModelElement: ReactElement<SpiceModelProps>

InternalCircuitElement: ReactElement<InternalCircuitProps, "internalcircuit">

interface SchematicPortArrangementWithSizes
  leftSize?: number
  topSize?: number
  rightSize?: number
  bottomSize?: number

interface SchematicPortArrangementWithSides
  leftSide?: PinSideDefinitionInput
  topSide?: PinSideDefinitionInput
  rightSide?: PinSideDefinitionInput
  bottomSide?: PinSideDefinitionInput

// Specifies the number of pins on each side of the schematic box component
interface SchematicPortArrangementWithPinCounts
  leftPinCount?: number
  topPinCount?: number
  rightPinCount?: number
  bottomPinCount?: number

// Required source
interface SpiceModelProps
  source: string
  spicePinMapping?: Record<string, string>

// Props for a semantic container that groups the functional components inside a physical chip…
interface InternalCircuitProps
  children?: ReactNode

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

SchematicOrientation: "vertical" | "horizontal" | "pos_top" | "pos_bottom" | "pos_left" | "pos_right" | "neg_top" | "neg_bottom" | "neg_left" | "neg_right"

SchematicSymbolSize: string | number

ResistorPinLabels: "pin1" | "pin2" | "pos" | "neg"

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

CapacitorPinLabels: "pin1" | "pin2" | "pos" | "neg" | "anode" | "cathode"

// JSX element <led> with LedProps, required name
<led>: LedProps extends CommonComponentProps
  connections?: Partial<Record<"left" | "right" | "pin1" | "pin2" | "anode" | "pos" | "cathode" | "neg", string | readonly string[] | string[]>>
  pinLabels?: Partial<Record<"left" | "right" | "pin1" | "pin2" | "anode" | "pos" | "cathode" | "neg", string | readonly string[] | string[]>> | Partial<Record<"1" | "2", string | readonly string[] | string[]>>
  schOrientation?: "vertical" | "horizontal" | "pos_top" | "pos_bottom" | "pos_left" | "pos_right" | "neg_top" | "neg_bottom" | "neg_left" | "neg_right"
  color?: string
  wavelength?: string
  schDisplayValue?: string
  laser?: boolean

// JSX element <pinheader> with PinHeaderProps, required pinCount, name
<pinheader>: PinHeaderProps extends CommonComponentProps
  // Number of pins in the header
  pinCount: number
  // Diameter of the through-hole for each pin
  holeDiameter?: number | string
  // Labels for each pin
  pinLabels?: Record<string, SchematicPinLabel> | SchematicPinLabel[]
  // Connections to other components
  connections?: Connections<string>
  // … 16 more members in the API reference
```

### PCB, footprint and CAD primitives

```ts
// JSX element <silkscreencircle> with SilkscreenCircleProps, required radius
<silkscreencircle>: SilkscreenCircleProps extends Omit<PcbLayoutProps, "pcbRotation">
  radius: string | number
  strokeWidth?: string | number
  isFilled?: boolean
  isOutline?: boolean
```

## API reference

To read any other signature, grep the skill directory for the name followed by `(` (or the bare type name): each hit is the declaration line and names its file; read a few lines around it for overloads and parameter notes. `api-index.md` lists all 1741 symbols by file.

- `api-components.md` — Components
- `api-boards-groups-and-layout.md` — Boards, groups and layout
- `api-schematic-drawing.md` — Schematic drawing
- `api-pcb-footprint-and-cad-primitives.md` — PCB, footprint and CAD primitives
- `api-connectivity.md` — Connectivity
- `api-simulation.md` — Simulation
- `api-shared-props.md` — Shared props
- `api-prop-types.md` — Prop types
- `api-footprint-strings.md` — Footprint strings
- `api-helpers.md` — Helpers

Read ranges, not whole files. Never copy a reference into a source file.
