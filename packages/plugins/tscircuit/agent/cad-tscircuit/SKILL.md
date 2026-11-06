---
name: cad-tscircuit
description: Guides tscircuit TSX electronics authoring in main.tsx. Use when creating or editing boards, schematics or PCB layouts in Tau.
---

# tscircuit TSX authoring

## Contract

1. Author `main.tsx` (or `.jsx`) and `export default` one board component. Helper components may live in local `.tsx` files imported relatively.
2. `React` is a global, so importing it is optional; `tscircuit` and `@tscircuit/core` both resolve to the core exports (`sel`, `useResistor`, …).
3. Elements are lower-case JSX tags: `<board>`, `<resistor>`, `<capacitor>`, `<led>`, `<diode>`, `<chip>`, `<pinheader>`, `<trace>`, `<net>`, `<group>`. Give every component a unique `name`.
4. `footprint` is a footprinter string (`0402`, `0805`, `soic8`, `dip8`, `tssop16`, `pinrow4_p2.54mm`, `axial_p10mm`, `radial_p5mm`, `to220_3`) or a `kicad:` footprint. Place with `pcbX`/`pcbY` (mm) and `schX`/`schY`.
5. Wire with `<trace from='.R1 > .pin1' to='.U1 > .VCC' />`, `to='net.GND'`, or `connections` on a part. Selectors name a pin by its label or `pinN`. Prefer named nets for power and ground.
6. Parameters: export `defaultParameters` (a plain object); Tau passes edited values as props.
7. Rendering and routing are offline by default. URL footprints and CAD models are never fetched and `jlcpcb:` parts remain unplaced. `kicad:` footprints in Tau's bundled KiCad pack render offline with their real KiCad 3D body (see Real parts); other `kicad:` names stay unplaced unless the kernel option `parts` is `'online'`, which loads them from tscircuit's part hosts.
8. Views: `board` (3D GLB, default; layered copper, mask and silkscreen; `finish` option `enig`, `hasl` or `bare`; edge lines follow the viewer's edge toggle), `schematic` (SVG sheets; `theme` option `light`, `dark` or `engineering`), `pcb` (SVG; `pinNumbers`, and `palette` option `fabrication` or `engineering`). `screenshot.view` selects one, `screenshot.instance` a sheet. Export IDs for `export_model.to`: `board` (`glb`), `bom` (`csv`), `netlist` (`txt`), `circuit` (`json`).

## Real parts

Plain footprinter strings already get real KiCad bodies offline: `res0201` to `res2512` and `cap0201` to `cap1812` (write `footprint='0603'` on a `<resistor>` or `<capacitor>`), `0402` to `1206` on `<led>` and `<inductor>`, `sot23`, `sot23_5`, `sot23_6`, `sot223`, `sot323`, `sot363`, `to220`, `soic8`, `soic14`, `soic16`, `qfn16`, `qfn20`, `qfn24`, `qfn32`, `lqfp48`, `lqfp64`, `dip8`, `dip14`, `dip16`, `pinrow2` to `pinrow10`, `pinrow2_p5.08mm` and `pinrow3_p5.08mm` (screw terminals), `hc49`, `sod123`, `sod123f`, `sod323`, `sod523`, `sma`, `smb`, `smc` and `minimelf`. Options that never change the part (`_color(green)`, `_nopinlabels`, `_id`/`_od` ring sizes) still match. Other strings (`tssop16`, `msop8`, `to92`, `axial`, `electrolytic`) keep generic bodies, and a part with an inline `<footprint>` gets a plain box sized from its `<courtyardrect>` (else its pads): add a courtyard to size it.

Write `kicad:<Library>/<Footprint>` for a part outside that list. The bundled pack (about a hundred footprints) also holds, among others:

- ICs: `kicad:Package_SO/TSSOP-8_4.4x3mm_P0.65mm` (and `TSSOP-14_4.4x5mm`, `TSSOP-16_4.4x5mm`, `TSSOP-20_4.4x6.5mm`, all `_P0.65mm`), `kicad:Package_SO/MSOP-8_3x3mm_P0.65mm`, `MSOP-10_3x3mm_P0.5mm`, `kicad:Package_QFP/TQFP-32_7x7mm_P0.8mm`, `TQFP-44_10x10mm_P0.8mm`, `kicad:Package_SON/WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm`, `kicad:Package_DFN_QFN/QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm`.
- Transistors and regulators: `kicad:Package_TO_SOT_SMD/SOT-89-3`, `TO-252-2`, `TO-263-2`, `kicad:Package_TO_SOT_THT/TO-92_Inline`.
- Passives and discretes: `kicad:Capacitor_SMD/CP_Elec_6.3x5.4`, `kicad:Capacitor_THT/CP_Radial_D5.0mm_P2.00mm`, `CP_Radial_D8.0mm_P3.50mm`, `kicad:Resistor_THT/R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal`, `kicad:Diode_THT/D_DO-41_SOD81_P10.16mm_Horizontal`, `kicad:Fuse/Fuse_1206_3216Metric`, `kicad:LED_THT/LED_D3.0mm`, `LED_D5.0mm`, `kicad:LED_SMD/LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm`, `kicad:Inductor_SMD/L_Coilcraft_XAL7070-XXX`, `L_Bourns_SRN6045TA`, `L_Bourns-SRN4018`, `kicad:Buzzer_Beeper/Buzzer_12x9.5RM7.6`.
- Crystals and switches: `kicad:Crystal/Crystal_SMD_3225-4Pin_3.2x2.5mm`, `Crystal_SMD_2520-4Pin_2.5x2.0mm`, `kicad:Button_Switch_SMD/SW_SPST_PTS810`, `SW_SPST_TL3342`, `SW_SPDT_PCM12`, `kicad:Button_Switch_THT/SW_PUSH_6mm`.
- Connectors: `kicad:Connector_USB/USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal`, `kicad:Connector_PinHeader_2.54mm/PinHeader_2x05_P2.54mm_Vertical`, `PinHeader_2x10_P2.54mm_Vertical`, `kicad:Connector_JST/JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical`, `JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal`, `JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical`, `JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal`, `JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal`, `kicad:Connector_BarrelJack/BarrelJack_Horizontal`, `kicad:Connector_Card/microSD_HC_Hirose_DM3AT-SF-PEJM5`, `kicad:Connector_Coaxial/U.FL_Hirose_U.FL-R-SMT-1_Vertical`, `kicad:TerminalBlock_Phoenix/TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal` (and `-3-5.08_1x03`).
- Modules: `kicad:RF_Module/ESP32-WROOM-32`, `kicad:RF_Module/ESP32-S3-WROOM-1`.

A `kicad:` footprint's pads keep their KiCad pad names. Numbered pads (`1`, `2`, …) match `pin1`, `pin2`, …, so map them with `pinLabels`: diodes are `pin1` cathode and `pin2` anode, and the 4-pin crystal is `pin1` to `pin4`. Named pads match nothing until a label carries the name, so give each such pin its pad name as an alias: `pinLabels={{ pin3: ['CC1', 'A5'], pin17: ['SHIELD', 'SH'] }}` on the USB-C receptacle (pads `A1` to `B12` and `SH`), and `pin4: ['MP_GND', 'MP']` on the JST SH connector. A pin without a pad is silently off the board: its net shows `is not connected … by a PCB trace` and its pads stay unrouted. Use `<connector>` or `<chip>` for connectors and terminal blocks. A custom `<footprint>` has no 3D body, so prefer a pack footprint when one fits.

## Layout and looks

- Set `solderMaskColor` (`green`, `blue`, `red`, `black`, `white`, `purple`, `yellow` or a CSS colour) and optionally `silkscreenColor` on `<board>`; the 3D board and the `pcb` view's fabrication palette both use them.
- Size the board for the parts' courtyards. Overlapping courtyards fail placement DRC, which skips autorouting and leaves every trace open. Keep `placementDrcChecksDisabled` for intended same-net pad overlaps, such as a USB-C receptacle's stacked VBUS and GND pads, and say why in a comment.
- Place decoupling capacitors beside their supply pins and use named nets. Dense boards autoroute slowly: a 60-net RP2040 board takes about four minutes. If the default router fails on a dense board (`SameNetViaMergerSolver could not find route transition`), set `autorouterVersion='beta_pipeline4'` on `<board>`. Route power with a `<net>` `nominalTraceWidth`, and pour ground with `<copperpour layer='bottom' connectsTo='net.GND' />`.
- Use `<schematicsheet>` only for designs split across sheets; a single sheet frames and shrinks the drawing.

## Check a board

1. After edits, call `evaluate_model` and read every issue; `ready` may still carry errors. Fix the first error before its consequences, then open pins, routing and placement.
2. Capture `schematic` and `pcb` separately, at most twice each per inspection cycle; use `board` for mechanical fit. In each capture, check that no part sits off the board or on another part, no pad shows an open ratsnest line, silkscreen labels do not cover pads, and schematic labels are readable.
3. For parts and open pins, prefer `netlist` and `bom` exports to circuit JSON: call `export_model`, then `read_file` on its artifact path and check its `sourceRevision`. Binary exports still need a user request.

## Wrong / Correct

- Wrong: `schPinArrangement={{ leftSide: { pins: ['IN'] } }}` (invalid props, chip not created). Correct: `leftSide: ['IN', 'GND']`, `{ pins: [...], direction: 'top-to-bottom' }` or `leftPinCount: 2`.
- Wrong: `cadModel='to220_5'` (throws `String cadModel not yet implemented`). Correct: omit `cadModel`; a footprinter or pack `kicad:` `footprint` already has a 3D body, and `cadModel={null}` hides it.
- Wrong: `footprint='kicad:Package_SO/SOIC-20W_7.5x12.8mm_P1.27mm'` offline (not in the pack; the part stays unplaced). Correct: a pack footprint or a footprinter string such as `soic16`, or ask for the `parts: 'online'` option.
- Wrong: `connections={{ anode: 'net.VBUS' }}` on a `kicad:Diode_SMD/D_SOD-123` diode. Correct: `pin2: 'net.VBUS'`; KiCad pads are numbered.
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
  // … 16 more members in the API reference: material, allowBlindAndBuriedVias, borderRadius, boardAnchorPosition, anchorAlignment, boardAnchorAlignment, solderMaskColor, topSolderMaskColor, bottomSolderMaskColor, silkscreenColor, topSilkscreenColor, bottomSilkscreenColor, doubleSidedAssembly, isViaInPadAllowed, automaticPoursEnabled, schematicDisabled

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
  // … 92 more members in the API reference: children, schTitle, schSheetName, showAsSchematicBox, schPinArrangement, schPinStyle, pcbWidth, pcbHeight, nominalTraceWidth, schWidth, schHeight, pcbLayout, schLayout, cellBorder, border, schPadding, schPaddingLeft, schPaddingRight, schPaddingTop, schPaddingBottom, pcbPadding, pcbPaddingLeft, pcbPaddingRight, pcbPaddingTop, pcbPaddingBottom, and 67 more

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
```

### Connectivity

```ts
// JSX element <net> with NetProps, required name
<net>: NetProps
  name: string
  connectsTo?: string | string[]
  routingPhaseIndex?: number | null
  highlightColor?: string
  isPowerNet?: boolean
  isGroundNet?: boolean
  nominalTraceWidth?: Distance
```

## API reference

To read any other signature, find its name in `api-index.md`, which lists all 1741 symbols by file with the lines that hold each, and read that range of the named file.

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
