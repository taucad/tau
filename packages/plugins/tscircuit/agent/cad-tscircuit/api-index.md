# @tscircuit/core API index

@tscircuit/core 0.0.1844 · 1741 symbols · extracted by TypeScript 5.9.3 over @tscircuit/props 0.0.646 and @tscircuit/footprinter 0.0.426.

Every symbol appears here exactly once. The heading above each block names the file with its signature, and each top-level symbol names the lines of that file which hold its declaration and members: read only that range.

## Components — `api-components.md`

<antenna> (interface) [lines 5-16] [3 members] [category: Components] — JSX element <antenna> with AntennaProps, required name
  <antenna>.antennaShape (property) — Band-qualified PCB-trace topology to generate
  <antenna>.frequencyBand (property) — Nominal operating band or multiband configuration
  <antenna>.pcbPath (property) — Explicit antenna path
<resistor> (interface) [lines 18-38] [9 members] [category: Components] — JSX element <resistor> with ResistorProps, required resistance, name
  <resistor>.resistance (property)
  <resistor>.tolerance (property)
  <resistor>.pullupFor (property)
  <resistor>.pullupTo (property)
  <resistor>.pulldownFor (property)
  <resistor>.pulldownTo (property)
  <resistor>.schOrientation (property)
  <resistor>.schSize (property)
  <resistor>.connections (property)
<capacitor> (interface) [lines 40-67] [12 members] [category: Components] — JSX element <capacitor> with CapacitorProps, required capacitance, name
  <capacitor>.capacitance (property)
  <capacitor>.maxVoltageRating (property)
  <capacitor>.schShowRatings (property)
  <capacitor>.polarized (property)
  <capacitor>.decouplingFor (property)
  <capacitor>.decouplingTo (property)
  <capacitor>.bypassFor (property)
  <capacitor>.bypassTo (property)
  <capacitor>.maxDecouplingTraceLength (property) — Maximum allowed PCB trace length between this capacitor and the…
  <capacitor>.schOrientation (property)
  <capacitor>.schSize (property)
  <capacitor>.connections (property)
<inductor> (interface) [lines 69-79] [4 members] [category: Components] — JSX element <inductor> with InductorProps, required inductance, name
  <inductor>.inductance (property)
  <inductor>.maxCurrentRating (property)
  <inductor>.schOrientation (property)
  <inductor>.connections (property)
<pushbutton> (interface) [lines 81-120] [16 members] [category: Components] — JSX element <pushbutton> with PushButtonProps, required name
  <pushbutton>.pinLabels (property)
  <pushbutton>.showPinAliases (property) — Whether to show pin aliases in the schematic
  <pushbutton>.pcbPinLabels (property) — Labels for PCB pins
  <pushbutton>.schPinArrangement (property)
  <pushbutton>.pinCompatibleVariants (property)
  <pushbutton>.schPinStyle (property)
  <pushbutton>.schWidth (property)
  <pushbutton>.schHeight (property)
  <pushbutton>.noSchematicRepresentation (property)
  <pushbutton>.schShowInternalCircuit (property) — Whether to show the components from `internalCircuit` in the schematic
  <pushbutton>.internallyConnectedPins (property)
  <pushbutton>.externallyConnectedPins (property)
  <pushbutton>.noConnect (property) — Pins intentionally left unconnected
  <pushbutton>.connections (property)
  <pushbutton>.spiceModel (property)
  <pushbutton>.internalCircuit (property) — Functional components contained inside this physical chip package, wrapped in…
<diode> (interface) [lines 122-144] [10 members] [category: Components] — JSX element <diode> with DiodeProps, required name
  <diode>.pinLabels (property)
  <diode>.connections (property)
  <diode>.variant (property)
  <diode>.standard (property)
  <diode>.schottky (property)
  <diode>.zener (property)
  <diode>.avalanche (property)
  <diode>.photo (property)
  <diode>.tvs (property)
  <diode>.schOrientation (property)
<fuse> (interface) [lines 146-162] [5 members] [category: Components] — JSX element <fuse> with FuseProps, required currentRating, name
  <fuse>.currentRating (property) — Current rating of the fuse in amperes
  <fuse>.voltageRating (property) — Voltage rating of the fuse
  <fuse>.schShowRatings (property) — Whether to show ratings on schematic
  <fuse>.schOrientation (property)
  <fuse>.connections (property) — Connections to other components
<led> (interface) [lines 164-180] [7 members] [category: Components] — JSX element <led> with LedProps, required name
  <led>.connections (property)
  <led>.pinLabels (property)
  <led>.schOrientation (property)
  <led>.color (property)
  <led>.wavelength (property)
  <led>.schDisplayValue (property)
  <led>.laser (property)
<jumper> (interface) [lines 182-208] [10 members] [category: Components] — JSX element <jumper> with JumperProps, required name
  <jumper>.pinLabels (property)
  <jumper>.schPinStyle (property)
  <jumper>.schWidth (property)
  <jumper>.schHeight (property)
  <jumper>.schDirection (property)
  <jumper>.schPinArrangement (property)
  <jumper>.pcbPinLabels (property) — Labels for PCB pins
  <jumper>.pinCount (property) — Number of pins on the jumper (2 or 3)
  <jumper>.internallyConnectedPins (property) — Groups of pins that are internally connected e.g., [["1","2"], ["2","3"]]
  <jumper>.connections (property) — Connections to other components
<interconnect> (interface) [lines 210-219] [3 members] [category: Components] — JSX element <interconnect> with InterconnectProps, required name
  <interconnect>.standard (property)
  <interconnect>.pinLabels (property)
  <interconnect>.internallyConnectedPins (property) — Groups of pins that are internally connected e.g., [["1","2"], ["2","3"]]
<solderjumper> (interface) [lines 221-253] [12 members] [category: Components] — JSX element <solderjumper> with SolderJumperProps, required name
  <solderjumper>.bridgedPins (property) — Pins that are bridged with solder by default
  <solderjumper>.bridged (property) — If true, all pins are connected with cuttable traces
  <solderjumper>.pinLabels (property)
  <solderjumper>.schPinStyle (property)
  <solderjumper>.schWidth (property)
  <solderjumper>.schHeight (property)
  <solderjumper>.schDirection (property)
  <solderjumper>.schPinArrangement (property)
  <solderjumper>.pcbPinLabels (property) — Labels for PCB pins
  <solderjumper>.pinCount (property) — Number of pins on the jumper (2 or 3)
  <solderjumper>.internallyConnectedPins (property) — Groups of pins that are internally connected e.g., [["1","2"], ["2","3"]]
  <solderjumper>.connections (property) — Connections to other components
<potentiometer> (interface) [lines 255-263] [3 members] [category: Components] — JSX element <potentiometer> with PotentiometerProps, required maxResistance, name
  <potentiometer>.maxResistance (property)
  <potentiometer>.pinVariant (property)
  <potentiometer>.connections (property)
<chip> (interface) [lines 265-304] [16 members] [category: Components] — JSX element <chip> with ChipProps, required name
  <chip>.pinLabels (property)
  <chip>.showPinAliases (property) — Whether to show pin aliases in the schematic
  <chip>.pcbPinLabels (property) — Labels for PCB pins
  <chip>.schPinArrangement (property)
  <chip>.pinCompatibleVariants (property)
  <chip>.schPinStyle (property)
  <chip>.schWidth (property)
  <chip>.schHeight (property)
  <chip>.noSchematicRepresentation (property)
  <chip>.schShowInternalCircuit (property) — Whether to show the components from `internalCircuit` in the schematic
  <chip>.internallyConnectedPins (property)
  <chip>.externallyConnectedPins (property)
  <chip>.noConnect (property) — Pins intentionally left unconnected
  <chip>.connections (property)
  <chip>.spiceModel (property)
  <chip>.internalCircuit (property) — Functional components contained inside this physical chip package, wrapped in…
<pinout> (interface) [lines 306-345] [16 members] [category: Components] — JSX element <pinout> with PinoutProps, required name
  <pinout>.pinLabels (property)
  <pinout>.showPinAliases (property) — Whether to show pin aliases in the schematic
  <pinout>.pcbPinLabels (property) — Labels for PCB pins
  <pinout>.schPinArrangement (property)
  <pinout>.pinCompatibleVariants (property)
  <pinout>.schPinStyle (property)
  <pinout>.schWidth (property)
  <pinout>.schHeight (property)
  <pinout>.noSchematicRepresentation (property)
  <pinout>.schShowInternalCircuit (property) — Whether to show the components from `internalCircuit` in the schematic
  <pinout>.internallyConnectedPins (property)
  <pinout>.externallyConnectedPins (property)
  <pinout>.noConnect (property) — Pins intentionally left unconnected
  <pinout>.connections (property)
  <pinout>.spiceModel (property)
  <pinout>.internalCircuit (property) — Functional components contained inside this physical chip package, wrapped in…
<powersource> (interface) [lines 347-351] [1 members] [category: Components] — JSX element <powersource> with PowerSourceProps, required name, voltage
  <powersource>.voltage (property)
<opamp> (interface) [lines 353-357] [1 members] [category: Components] — JSX element <opamp> with OpAmpProps, required name
  <opamp>.connections (property)
<component> (interface) [lines 359-361] [category: Components] — JSX element <component> with ComponentProps, required name
<crystal> (interface) [lines 363-380] [7 members] [category: Components] — JSX element <crystal> with CrystalProps, required frequency, loadCapacitance, name
  <crystal>.frequency (property)
  <crystal>.loadCapacitance (property)
  <crystal>.maxTraceLength (property) — Maximum allowed PCB trace length between the crystal and its…
  <crystal>.mpn (property)
  <crystal>.pinVariant (property)
  <crystal>.schOrientation (property)
  <crystal>.connections (property)
<battery> (interface) [lines 382-394] [5 members] [category: Components] — JSX element <battery> with BatteryProps, required name
  <battery>.capacity (property)
  <battery>.voltage (property)
  <battery>.standard (property)
  <battery>.schOrientation (property)
  <battery>.connections (property)
<connector> (interface) [lines 396-441] [18 members] [category: Components] — JSX element <connector> with ConnectorProps, required name
  <connector>.standard (property) — Connector interface or product family, e.g
  <connector>.pinCount (property) — Number of electrical circuits in the connector
  <connector>.pinLabels (property)
  <connector>.showPinAliases (property) — Whether to show pin aliases in the schematic
  <connector>.pcbPinLabels (property) — Labels for PCB pins
  <connector>.schPinArrangement (property)
  <connector>.pinCompatibleVariants (property)
  <connector>.schPinStyle (property)
  <connector>.schWidth (property)
  <connector>.schHeight (property)
  <connector>.noSchematicRepresentation (property)
  <connector>.schShowInternalCircuit (property) — Whether to show the components from `internalCircuit` in the schematic
  <connector>.internallyConnectedPins (property)
  <connector>.externallyConnectedPins (property)
  <connector>.noConnect (property) — Pins intentionally left unconnected
  <connector>.connections (property)
  <connector>.spiceModel (property)
  <connector>.internalCircuit (property) — Functional components contained inside this physical chip package, wrapped in…
<pinheader> (interface) [lines 443-505] [20 members] [category: Components] — JSX element <pinheader> with PinHeaderProps, required pinCount, name
  <pinheader>.pinCount (property) — Number of pins in the header
  <pinheader>.pitch (property) — Distance between pins
  <pinheader>.schFacingDirection (property) — Schematic facing direction
  <pinheader>.gender (property) — Whether the header is male, female, or unpopulated
  <pinheader>.connectsFromAbove (property) — Mount the header on the top of the board, so…
  <pinheader>.connectsFromBelow (property) — Mount the header on the underside of the board, so…
  <pinheader>.showSilkscreenPinLabels (property) — Whether to show pin labels in silkscreen
  <pinheader>.pcbPinLabels (property) — Labels for PCB pins
  <pinheader>.doubleRow (property) — Whether the header has two rows of pins
  <pinheader>.rightAngle (property) — If true, the header is a right-angle style connector
  <pinheader>.pcbOrientation (property) — Orientation of the header on the PCB
  <pinheader>.holeDiameter (property) — Diameter of the through-hole for each pin
  <pinheader>.platedDiameter (property) — Diameter of the plated area around each hole
  <pinheader>.pinLabels (property) — Labels for each pin
  <pinheader>.connections (property) — Connections to other components
  <pinheader>.facingDirection (property) — Direction the header is facing
  <pinheader>.schPinArrangement (property) — Pin arrangement in schematic view
  <pinheader>.schPinStyle (property) — Schematic pin style (margins, etc)
  <pinheader>.schWidth (property) — Schematic width
  <pinheader>.schHeight (property) — Schematic height
<resonator> (interface) [lines 507-515] [3 members] [category: Components] — JSX element <resonator> with ResonatorProps, required frequency, loadCapacitance, name
  <resonator>.frequency (property)
  <resonator>.loadCapacitance (property)
  <resonator>.pinVariant (property)
<transistor> (interface) [lines 517-523] [2 members] [category: Components] — JSX element <transistor> with TransistorProps, required type, name
  <transistor>.type (property)
  <transistor>.connections (property)
<switch> (interface) [lines 525-553] [13 members] [category: Components] — JSX element <switch> with SwitchProps, required name
  <switch>.type (property)
  <switch>.pinLabels (property)
  <switch>.isNormallyClosed (property)
  <switch>.spdt (property)
  <switch>.spst (property)
  <switch>.dpst (property)
  <switch>.dpdt (property)
  <switch>.simSwitchFrequency (property)
  <switch>.simCloseAt (property)
  <switch>.simOpenAt (property)
  <switch>.simStartClosed (property)
  <switch>.simStartOpen (property)
  <switch>.connections (property)
<mosfet> (interface) [lines 555-572] [6 members] [category: Components] — JSX element <mosfet> with MosfetProps, required channelType, mosfetMode, name
  <mosfet>.channelType (property)
  <mosfet>.mosfetMode (property)
  <mosfet>.symbolDrainSide (property) — The side of the schematic symbol where the drain port…
  <mosfet>.symbolSourceSide (property) — The side of the schematic symbol where the source port…
  <mosfet>.symbolGateSide (property) — The side of the schematic symbol where the gate port…
  <mosfet>.connections (property)
<testpoint> (interface) [lines 574-596] [7 members] [category: Components] — JSX element <testpoint> with TestpointProps, required name
  <testpoint>.footprintVariant (property) — The footprint variant of the testpoint either a surface pad…
  <testpoint>.padShape (property) — The shape of the pad if using a pad variant
  <testpoint>.padDiameter (property) — Diameter of the copper pad (applies to both SMD pads…
  <testpoint>.holeDiameter (property) — Diameter of the hole if using a through-hole testpoint
  <testpoint>.width (property) — Width of the pad when padShape is rect
  <testpoint>.height (property) — Height of the pad when padShape is rect
  <testpoint>.connections (property)
<voltagesource> (interface) [lines 598-630] [14 members] [category: Components] — JSX element <voltagesource> with VoltageSourceProps, required name
  <voltagesource>.voltage (property)
  <voltagesource>.frequency (property)
  <voltagesource>.peakToPeakVoltage (property)
  <voltagesource>.waveShape (property)
  <voltagesource>.phase (property)
  <voltagesource>.dutyCycle (property)
  <voltagesource>.pulseDelay (property)
  <voltagesource>.riseTime (property)
  <voltagesource>.fallTime (property)
  <voltagesource>.pulseWidth (property)
  <voltagesource>.period (property)
  <voltagesource>.acMagnitude (property) — Small-signal AC magnitude
  <voltagesource>.acPhase (property) — Small-signal AC phase
  <voltagesource>.connections (property)
<currentsource> (interface) [lines 632-654] [9 members] [category: Components] — JSX element <currentsource> with CurrentSourceProps, required name
  <currentsource>.current (property)
  <currentsource>.frequency (property)
  <currentsource>.peakToPeakCurrent (property)
  <currentsource>.waveShape (property)
  <currentsource>.phase (property)
  <currentsource>.dutyCycle (property)
  <currentsource>.acMagnitude (property) — Small-signal AC magnitude
  <currentsource>.acPhase (property) — Small-signal AC phase
  <currentsource>.connections (property)
<ammeter> (interface) [lines 656-670] [6 members] [category: Components] — JSX element <ammeter> with AmmeterProps, required connections, name
  <ammeter>.connections (property)
  <ammeter>.color (property)
  <ammeter>.graphDisplayName (property)
  <ammeter>.graphCenter (property)
  <ammeter>.graphVerticalOffset (property)
  <ammeter>.graphCurrentPerDiv (property)
<voltageprobe> (interface) [lines 672-688] [7 members] [category: Components] — JSX element <voltageprobe> with VoltageProbeProps, required connectsTo
  <voltageprobe>.connectsTo (property)
  <voltageprobe>.referenceTo (property)
  <voltageprobe>.color (property)
  <voltageprobe>.graphDisplayName (property)
  <voltageprobe>.graphCenter (property)
  <voltageprobe>.graphVerticalOffset (property)
  <voltageprobe>.graphVoltagePerDiv (property)
<fiducial> (interface) [lines 690-696] [2 members] [category: Components] — JSX element <fiducial> with FiducialProps, required padDiameter, name
  <fiducial>.soldermaskPullback (property)
  <fiducial>.padDiameter (property)
<bug> (interface) [lines 698-700] [category: Components] — Same props as <chip>

## Boards, groups and layout — `api-boards-groups-and-layout.md`

<board> (interface) [lines 5-57] [19 members] [category: Boards, groups and layout] — JSX element <board> with BoardProps
  <board>.title (property)
  <board>.material (property)
  <board>.layers (property) — Number of layers for the PCB
  <board>.allowBlindAndBuriedVias (property) — Whether the autorouter may generate blind and buried vias
  <board>.borderRadius (property)
  <board>.thickness (property)
  <board>.boardAnchorPosition (property)
  <board>.anchorAlignment (property)
  <board>.boardAnchorAlignment (property)
  <board>.solderMaskColor (property) — Color applied to both top and bottom solder masks
  <board>.topSolderMaskColor (property) — Color of the top solder mask
  <board>.bottomSolderMaskColor (property) — Color of the bottom solder mask
  <board>.silkscreenColor (property) — Color applied to both top and bottom silkscreens
  <board>.topSilkscreenColor (property) — Color of the top silkscreen
  <board>.bottomSilkscreenColor (property) — Color of the bottom silkscreen
  <board>.doubleSidedAssembly (property) — Whether the board should be assembled on both sides
  <board>.isViaInPadAllowed (property) — Whether vias may be placed inside PCB pads
  <board>.automaticPoursEnabled (property) — Whether implicit copper pours should be generated automatically
  <board>.schematicDisabled (property) — Whether this board should be omitted from the schematic view
<drccheck> (interface) [lines 59-65] [2 members] [category: Boards, groups and layout] — JSX element <drccheck> with DrcCheckProps, required checkFn
  <drccheck>.name (property)
  <drccheck>.checkFn (property)
<mountedboard> (interface) [lines 67-91] [10 members] [category: Boards, groups and layout] — JSX element <mountedboard> with MountedBoardProps
  <mountedboard>.boardToBoardDistance (property)
  <mountedboard>.mountOrientation (property)
  <mountedboard>.manufacturerPartNumber (property)
  <mountedboard>.pinLabels (property)
  <mountedboard>.showPinAliases (property) — Whether to show pin aliases in the schematic
  <mountedboard>.pcbPinLabels (property) — Labels for PCB pins
  <mountedboard>.pinCompatibleVariants (property)
  <mountedboard>.noSchematicRepresentation (property)
  <mountedboard>.internallyConnectedPins (property)
  <mountedboard>.externallyConnectedPins (property)
<panel> (interface) [lines 93-130] [16 members] [category: Boards, groups and layout] — JSX element <panel> with PanelProps
  <panel>.anchorAlignment (property)
  <panel>.noSolderMask (property) — If true, prevent a solder mask from being applied to…
  <panel>.panelizationMethod (property) — Method used to separate boards in the panel
  <panel>.boardGap (property) — Gap between boards in a panel
  <panel>.row (property)
  <panel>.col (property)
  <panel>.cellWidth (property)
  <panel>.cellHeight (property)
  <panel>.tabWidth (property)
  <panel>.tabLength (property)
  <panel>.mouseBites (property)
  <panel>.edgePadding (property)
  <panel>.edgePaddingLeft (property)
  <panel>.edgePaddingRight (property)
  <panel>.edgePaddingTop (property)
  <panel>.edgePaddingBottom (property)
<subpanel> (interface) [lines 132-169] [16 members] [category: Boards, groups and layout] — JSX element <subpanel> with SubpanelProps
  <subpanel>.anchorAlignment (property)
  <subpanel>.noSolderMask (property) — If true, prevent a solder mask from being applied to…
  <subpanel>.panelizationMethod (property) — Method used to separate boards in the panel
  <subpanel>.boardGap (property) — Gap between boards in a panel
  <subpanel>.row (property)
  <subpanel>.col (property)
  <subpanel>.cellWidth (property)
  <subpanel>.cellHeight (property)
  <subpanel>.tabWidth (property)
  <subpanel>.tabLength (property)
  <subpanel>.mouseBites (property)
  <subpanel>.edgePadding (property)
  <subpanel>.edgePaddingLeft (property)
  <subpanel>.edgePaddingRight (property)
  <subpanel>.edgePaddingTop (property)
  <subpanel>.edgePaddingBottom (property)
<group> (interface) [lines 171-175] [1 members] [category: Boards, groups and layout] — JSX element <group> with GroupProps
  <group>.subcircuit (property)
<breakout> (interface) [lines 177-194] [5 members] [category: Boards, groups and layout] — JSX element <breakout> with BreakoutProps
  <breakout>.fanoutMargin (property) — Minimum clearance between this fanout boundary and another fanout boundary
  <breakout>.busFanoutDirections (property) — Fanout direction and boundary position for each named bus
  <breakout>.fanoutBoundaryPadding (property) — Padding between the union of the fanout source pads and…
  <breakout>.fanoutRoutingLayers (property) — Copper layers available to boundary-terminated fanout buses
  <breakout>.fanoutPourNetMap (property) — Maps copper layers to the net or nets poured on…
<breakoutpoint> (interface) [lines 196-200] [1 members] [category: Boards, groups and layout] — JSX element <breakoutpoint> with BreakoutPointProps, required connection
  <breakoutpoint>.connection (property)
<autoroutingphase> (interface) [lines 202-248] [20 members] [category: Boards, groups and layout] — JSX element <autoroutingphase> with AutoroutingPhaseProps
  <autoroutingphase>.name (property)
  <autoroutingphase>.autorouter (property)
  <autoroutingphase>.phaseIndex (property)
  <autoroutingphase>.region (property)
  <autoroutingphase>.connection (property)
  <autoroutingphase>.connections (property)
  <autoroutingphase>.reroute (property)
  <autoroutingphase>.minTraceWidth (property)
  <autoroutingphase>.minViaHoleEdgeToViaHoleEdgeClearance (property)
  <autoroutingphase>.minPlatedHoleDrillEdgeToDrillEdgeClearance (property)
  <autoroutingphase>.minTraceToPadEdgeClearance (property)
  <autoroutingphase>.minPadEdgeToPadEdgeClearance (property)
  <autoroutingphase>.minBoardEdgeClearance (property)
  <autoroutingphase>.minViaEdgeToPadEdgeClearance (property)
  <autoroutingphase>.minViaHoleDiameter (property)
  <autoroutingphase>.minViaPadDiameter (property)
  <autoroutingphase>.busFanoutDirections (property) — Fanout direction and boundary position for each named bus
  <autoroutingphase>.fanoutBoundaryPadding (property) — Padding between the union of the fanout source pads and…
  <autoroutingphase>.fanoutRoutingLayers (property) — Copper layers available to boundary-terminated fanout buses
  <autoroutingphase>.fanoutPourNetMap (property) — Maps copper layers to the net or nets poured on…
<constraint> (interface) [lines 250-283] [12 members] [category: Boards, groups and layout] — JSX element <constraint> with ConstraintProps
  <constraint>.pcb (property)
  <constraint>.xDist (property)
  <constraint>.left (property) — Selector for left component, e.g
  <constraint>.right (property) — Selector for right component, e.g
  <constraint>.edgeToEdge (property) — If true, the provided distance is the distance between the…
  <constraint>.centerToCenter (property) — If true, the provided distance is the distance between the…
  <constraint>.yDist (property)
  <constraint>.top (property) — Selector for top component, e.g
  <constraint>.bottom (property) — Selector for bottom component, e.g
  <constraint>.sameY (property)
  <constraint>.for (property) — Selector for components, e.g
  <constraint>.sameX (property)
<constrainedlayout> (interface) [lines 285-293] [3 members] [category: Boards, groups and layout] — JSX element <constrainedlayout> with ConstrainedLayoutProps
  <constrainedlayout>.name (property)
  <constrainedlayout>.pcbOnly (property)
  <constrainedlayout>.schOnly (property)
<subcircuit> (interface) [lines 295-368] [30 members] [category: Boards, groups and layout] — JSX element <subcircuit> with SubcircuitGroupProps
  <subcircuit>.manualEdits (property)
  <subcircuit>.routingDisabled (property)
  <subcircuit>.placementDrcChecksDisabled (property) — Skip the PCB placement design rule checks for this subcircuit
  <subcircuit>.bomDisabled (property)
  <subcircuit>.defaultTraceWidth (property)
  <subcircuit>.pcbRouteCache (property)
  <subcircuit>.autorouter (property)
  <subcircuit>.autorouterEffortLevel (property)
  <subcircuit>.autorouterVersion (property) — Selects the local autorouting pipeline
  <subcircuit>.circuitJson (property) — Serialized circuit JSON describing a precompiled subcircuit
  <subcircuit>.exposedNets (property) — Nets from this subcircuit that should be exposed to parent…
  <subcircuit>.exposeNets (property) — If true, all nets defined within this subcircuit are exposed…
  <subcircuit>.schAutoLayoutEnabled (property) — If true, we'll automatically layout the schematic for this group
  <subcircuit>.schTraceAutoLabelEnabled (property) — If true, net labels will automatically be created for complex…
  <subcircuit>.schMaxTraceDistance (property) — Maximum length a trace can span on the schematic
  <subcircuit>.partsEngine (property)
  <subcircuit>.square (property) — When autosizing, the board will be made square
  <subcircuit>.emptyArea (property) — Desired empty area of the board e.g
  <subcircuit>.filledArea (property) — Desired filled area of the board e.g
  <subcircuit>.outline (property)
  <subcircuit>.outlineOffsetX (property)
  <subcircuit>.outlineOffsetY (property)
  <subcircuit>.minViaHoleEdgeToViaHoleEdgeClearance (property)
  <subcircuit>.minPlatedHoleDrillEdgeToDrillEdgeClearance (property)
  <subcircuit>.minTraceToPadEdgeClearance (property)
  <subcircuit>.minPadEdgeToPadEdgeClearance (property)
  <subcircuit>.minBoardEdgeClearance (property)
  <subcircuit>.minViaEdgeToPadEdgeClearance (property)
  <subcircuit>.minViaHoleDiameter (property)
  <subcircuit>.minViaPadDiameter (property)
<fanout> (interface) [lines 370-372] [category: Boards, groups and layout] — Same props as <breakout>
<fanoutpoint> (interface) [lines 374-376] [category: Boards, groups and layout] — Same props as <breakoutpoint>

## Schematic drawing — `api-schematic-drawing.md`

<schematicsection> (interface) [lines 5-13] [3 members] [category: Schematic drawing] — JSX element <schematicsection> with SchematicSectionProps, required name
  <schematicsection>.displayName (property)
  <schematicsection>.name (property)
  <schematicsection>.sectionTitleFontSize (property)
<schematicsheet> (interface) [lines 15-34] [7 members] [category: Schematic drawing] — JSX element <schematicsheet> with SchematicSheetProps
  <schematicsheet>.name (property)
  <schematicsheet>.displayName (property)
  <schematicsheet>.sheetIndex (property)
  <schematicsheet>.sheetSize (property) — Sheet size used to render the schematic
  <schematicsheet>.sheetWidth (property) — Explicit schematic sheet width
  <schematicsheet>.sheetHeight (property) — Explicit schematic sheet height
  <schematicsheet>.children (property)
<schematicgraphic> (interface) [lines 36-50] [4 members] [category: Schematic drawing] — JSX element <schematicgraphic> with SchematicGraphicProps
  <schematicgraphic>.imageUrl (property) — URL or static-file import for the canonical source SVG asset
  <schematicgraphic>.svgContent (property) — Complete SVG markup, including its dimensions or viewBox
  <schematicgraphic>.width (property) — Optional rendered width of the graphic
  <schematicgraphic>.height (property) — Optional rendered height of the graphic
<schematicbox> (interface) [lines 52-101] [23 members] [category: Schematic drawing] — JSX element <schematicbox> with SchematicBoxProps
  <schematicbox>.name (property)
  <schematicbox>.chipRef (property)
  <schematicbox>.pinLabels (property)
  <schematicbox>.schPinArrangement (property)
  <schematicbox>.schPinStyle (property) — Per-pin schematic margin overrides keyed by pin number or label
  <schematicbox>.schX (property)
  <schematicbox>.schY (property)
  <schematicbox>.schSectionName (property)
  <schematicbox>.schSheetName (property)
  <schematicbox>.width (property)
  <schematicbox>.height (property)
  <schematicbox>.overlay (property)
  <schematicbox>.padding (property)
  <schematicbox>.paddingLeft (property)
  <schematicbox>.paddingRight (property)
  <schematicbox>.paddingTop (property)
  <schematicbox>.paddingBottom (property)
  <schematicbox>.title (property)
  <schematicbox>.titleAlignment (property)
  <schematicbox>.titleColor (property)
  <schematicbox>.titleFontSize (property)
  <schematicbox>.titleInside (property)
  <schematicbox>.strokeStyle (property)
<schematicsymbol> (interface) [lines 103-130] [10 members] [category: Schematic drawing] — JSX element <schematicsymbol> with SchematicSymbolProps, required name, symbolName
  <schematicsymbol>.name (property) — Stable name for this representation, such as `A` or `B`
  <schematicsymbol>.displayName (property) — Optional human-facing name shown in the schematic
  <schematicsymbol>.chipRef (property) — Selector for the physical component represented by this symbol
  <schematicsymbol>.symbolName (property) — Name of the symbol from the schematic-symbol library
  <schematicsymbol>.connections (property) — Maps symbol port labels to physical component port selectors
  <schematicsymbol>.schX (property)
  <schematicsymbol>.schY (property)
  <schematicsymbol>.schRotation (property)
  <schematicsymbol>.schSectionName (property)
  <schematicsymbol>.schSheetName (property)
<schematicline> (interface) [lines 132-152] [9 members] [category: Schematic drawing] — JSX element <schematicline> with SchematicLineProps, required x1, y1, x2, y2
  <schematicline>.x1 (property)
  <schematicline>.y1 (property)
  <schematicline>.x2 (property)
  <schematicline>.y2 (property)
  <schematicline>.strokeWidth (property)
  <schematicline>.color (property)
  <schematicline>.isDashed (property)
  <schematicline>.dashLength (property)
  <schematicline>.dashGap (property)
<schematicrect> (interface) [lines 154-176] [10 members] [category: Schematic drawing] — JSX element <schematicrect> with SchematicRectProps, required width, height
  <schematicrect>.schX (property)
  <schematicrect>.schY (property)
  <schematicrect>.width (property)
  <schematicrect>.height (property)
  <schematicrect>.rotation (property)
  <schematicrect>.strokeWidth (property)
  <schematicrect>.color (property)
  <schematicrect>.isFilled (property)
  <schematicrect>.fillColor (property)
  <schematicrect>.isDashed (property)
<schematicarc> (interface) [lines 178-196] [8 members] [category: Schematic drawing] — JSX element <schematicarc> with SchematicArcProps, required center, radius, startAngleDegrees, endAngleDegrees
  <schematicarc>.center (property)
  <schematicarc>.radius (property)
  <schematicarc>.startAngleDegrees (property)
  <schematicarc>.endAngleDegrees (property)
  <schematicarc>.direction (property)
  <schematicarc>.strokeWidth (property)
  <schematicarc>.color (property)
  <schematicarc>.isDashed (property)
<schematiccircle> (interface) [lines 198-214] [7 members] [category: Schematic drawing] — JSX element <schematiccircle> with SchematicCircleProps, required center, radius
  <schematiccircle>.center (property)
  <schematiccircle>.radius (property)
  <schematiccircle>.strokeWidth (property)
  <schematiccircle>.color (property)
  <schematiccircle>.isFilled (property)
  <schematiccircle>.fillColor (property)
  <schematiccircle>.isDashed (property)
<schematicpath> (interface) [lines 216-234] [8 members] [category: Schematic drawing] — JSX element <schematicpath> with SchematicPathProps
  <schematicpath>.points (property)
  <schematicpath>.svgPath (property)
  <schematicpath>.strokeWidth (property)
  <schematicpath>.strokeColor (property)
  <schematicpath>.dashLength (property)
  <schematicpath>.dashGap (property)
  <schematicpath>.isFilled (property)
  <schematicpath>.fillColor (property)
<schematictext> (interface) [lines 236-252] [7 members] [category: Schematic drawing] — JSX element <schematictext> with SchematicTextProps, required text
  <schematictext>.schX (property)
  <schematictext>.schY (property)
  <schematictext>.text (property)
  <schematictext>.fontSize (property)
  <schematictext>.anchor (property)
  <schematictext>.color (property)
  <schematictext>.schRotation (property)
<schematictable> (interface) [lines 254-270] [7 members] [category: Schematic drawing] — JSX element <schematictable> with SchematicTableProps
  <schematictable>.schX (property)
  <schematictable>.schY (property)
  <schematictable>.children (property)
  <schematictable>.cellPadding (property)
  <schematictable>.borderWidth (property)
  <schematictable>.anchor (property)
  <schematictable>.fontSize (property)
<schematicrow> (interface) [lines 272-278] [2 members] [category: Schematic drawing] — JSX element <schematicrow> with SchematicRowProps
  <schematicrow>.children (property)
  <schematicrow>.height (property)
<schematiccell> (interface) [lines 280-298] [8 members] [category: Schematic drawing] — JSX element <schematiccell> with SchematicCellProps
  <schematiccell>.children (property)
  <schematiccell>.horizontalAlign (property)
  <schematiccell>.verticalAlign (property)
  <schematiccell>.fontSize (property)
  <schematiccell>.rowSpan (property)
  <schematiccell>.colSpan (property)
  <schematiccell>.width (property)
  <schematiccell>.text (property)

## PCB, footprint and CAD primitives — `api-pcb-footprint-and-cad-primitives.md`

<via> (interface) [lines 5-23] [8 members] [category: PCB, footprint and CAD primitives] — JSX element <via> with ViaProps
  <via>.name (property)
  <via>.fromLayer (property)
  <via>.toLayer (property)
  <via>.layers (property)
  <via>.holeDiameter (property)
  <via>.outerDiameter (property)
  <via>.connectsTo (property)
  <via>.netIsAssignable (property)
<smtpad> (interface) [lines 25-61] [17 members] [category: PCB, footprint and CAD primitives] — JSX element <smtpad> with SmtPadProps, required shape
  <smtpad>.name (property)
  <smtpad>.shape (property)
  <smtpad>.width (property)
  <smtpad>.height (property)
  <smtpad>.rectBorderRadius (property)
  <smtpad>.cornerRadius (property)
  <smtpad>.portHints (property)
  <smtpad>.coveredWithSolderMask (property)
  <smtpad>.solderMaskMargin (property)
  <smtpad>.solderMaskMarginLeft (property)
  <smtpad>.solderMaskMarginRight (property)
  <smtpad>.solderMaskMarginTop (property)
  <smtpad>.solderMaskMarginBottom (property)
  <smtpad>.solderPasteMargin (property)
  <smtpad>.radius (property)
  <smtpad>.ccwRotation (property)
  <smtpad>.points (property)
<platedhole> (interface) [lines 63-109] [22 members] [category: PCB, footprint and CAD primitives] — JSX element <platedhole> with PlatedHoleProps, required shape
  <platedhole>.name (property)
  <platedhole>.connectsTo (property)
  <platedhole>.shape (property)
  <platedhole>.holeDiameter (property)
  <platedhole>.outerDiameter (property)
  <platedhole>.padDiameter (property)
  <platedhole>.portHints (property)
  <platedhole>.solderMaskMargin (property)
  <platedhole>.coveredWithSolderMask (property)
  <platedhole>.outerWidth (property)
  <platedhole>.outerHeight (property)
  <platedhole>.holeWidth (property)
  <platedhole>.holeHeight (property)
  <platedhole>.rectPad (property)
  <platedhole>.holeOffsetX (property)
  <platedhole>.holeOffsetY (property)
  <platedhole>.rectPadWidth (property)
  <platedhole>.rectPadHeight (property)
  <platedhole>.rectBorderRadius (property)
  <platedhole>.holeShape (property)
  <platedhole>.padShape (property)
  <platedhole>.padOutline (property)
<keepout> (interface) [lines 111-125] [6 members] [category: PCB, footprint and CAD primitives] — JSX element <keepout> with PcbKeepoutProps, required shape
  <keepout>.shape (property)
  <keepout>.radius (property)
  <keepout>.layers (property)
  <keepout>.excludeRefs (property)
  <keepout>.width (property)
  <keepout>.height (property)
<hole> (interface) [lines 127-145] [8 members] [category: PCB, footprint and CAD primitives] — JSX element <hole> with HoleProps
  <hole>.name (property)
  <hole>.shape (property)
  <hole>.diameter (property)
  <hole>.radius (property)
  <hole>.solderMaskMargin (property)
  <hole>.coveredWithSolderMask (property)
  <hole>.width (property)
  <hole>.height (property)
<cadmodel> (interface) [lines 147-192] [21 members] [category: PCB, footprint and CAD primitives] — JSX element <cadmodel> with CadModelProps, required modelUrl
  <cadmodel>.modelUrl (property)
  <cadmodel>.stepUrl (property)
  <cadmodel>.pcbX (property)
  <cadmodel>.pcbY (property)
  <cadmodel>.pcbLeftEdgeX (property)
  <cadmodel>.pcbRightEdgeX (property)
  <cadmodel>.pcbTopEdgeY (property)
  <cadmodel>.pcbBottomEdgeY (property)
  <cadmodel>.pcbOffsetX (property)
  <cadmodel>.pcbOffsetY (property)
  <cadmodel>.pcbZ (property)
  <cadmodel>.rotationOffset (property)
  <cadmodel>.positionOffset (property)
  <cadmodel>.modelOriginPosition (property)
  <cadmodel>.modelBounds (property) — Axis-aligned extent of the model measured in its own coordinate…
  <cadmodel>.size (property)
  <cadmodel>.modelUnitToMmScale (property)
  <cadmodel>.modelBoardNormalDirection (property)
  <cadmodel>.pcbRotationOffset (property)
  <cadmodel>.zOffsetFromSurface (property)
  <cadmodel>.showAsTranslucentModel (property)
<cadassembly> (interface) [lines 194-201] [2 members] [category: PCB, footprint and CAD primitives] — JSX element <cadassembly> with CadAssemblyProps
  <cadassembly>.originalLayer (property) — The layer that the CAD assembly is designed for
  <cadassembly>.children (property)
<footprint> (interface) [lines 203-224] [7 members] [category: PCB, footprint and CAD primitives] — JSX element <footprint> with FootprintProps & {name?
  <footprint>.children (property)
  <footprint>.name (property)
  <footprint>.originalLayer (property) — The layer that the footprint is designed for
  <footprint>.circuitJson (property) — Serialized circuit JSON describing a precompiled footprint
  <footprint>.src (property) — Can be a footprint or kicad string
  <footprint>.insertionDirection (property) — Direction a cable or mating part is attached from, in…
  <footprint>.cutoutApertureDirection (property) — Direction the part's enclosure opening faces, named the same way…
<silkscreentext> (interface) [lines 226-250] [11 members] [category: PCB, footprint and CAD primitives] — JSX element <silkscreentext> with SilkscreenTextProps, required text
  <silkscreentext>.text (property)
  <silkscreentext>.font (property)
  <silkscreentext>.layers (property)
  <silkscreentext>.fontSize (property)
  <silkscreentext>.anchorAlignment (property)
  <silkscreentext>.isKnockout (property)
  <silkscreentext>.knockoutPadding (property)
  <silkscreentext>.knockoutPaddingLeft (property)
  <silkscreentext>.knockoutPaddingRight (property)
  <silkscreentext>.knockoutPaddingTop (property)
  <silkscreentext>.knockoutPaddingBottom (property)
<silkscreengraphic> (interface) [lines 252-263] [3 members] [category: PCB, footprint and CAD primitives] — JSX element <silkscreengraphic> with SilkscreenGraphicProps, required imageUrl, width, height
  <silkscreengraphic>.imageUrl (property) — URL or static-file import for the source image
  <silkscreengraphic>.width (property) — Width of the rendered silkscreen graphic on the PCB
  <silkscreengraphic>.height (property) — Height of the rendered silkscreen graphic on the PCB
<coppertext> (interface) [lines 265-281] [7 members] [category: PCB, footprint and CAD primitives] — JSX element <coppertext> with CopperTextProps, required text
  <coppertext>.text (property)
  <coppertext>.font (property)
  <coppertext>.layers (property)
  <coppertext>.fontSize (property)
  <coppertext>.anchorAlignment (property)
  <coppertext>.knockout (property)
  <coppertext>.mirrored (property)
<cutout> (interface) [lines 283-297] [6 members] [category: PCB, footprint and CAD primitives] — JSX element <cutout> with CutoutProps, required shape
  <cutout>.name (property)
  <cutout>.shape (property)
  <cutout>.width (property)
  <cutout>.height (property)
  <cutout>.radius (property)
  <cutout>.points (property)
<silkscreenpath> (interface) [lines 299-333] [16 members] [category: PCB, footprint and CAD primitives] — JSX element <silkscreenpath> with SilkscreenPathProps, required route
  <silkscreenpath>.route (property)
  <silkscreenpath>.layer (property)
  <silkscreenpath>.pcbPositionAnchor (property)
  <silkscreenpath>.pcbPositionMode (property)
  <silkscreenpath>.shouldBeOnEdgeOfBoard (property)
  <silkscreenpath>.pcbMarginTop (property)
  <silkscreenpath>.pcbMarginRight (property)
  <silkscreenpath>.pcbMarginBottom (property)
  <silkscreenpath>.pcbMarginLeft (property)
  <silkscreenpath>.pcbMarginX (property)
  <silkscreenpath>.pcbMarginY (property)
  <silkscreenpath>.pcbStyle (property)
  <silkscreenpath>.pcbSx (property)
  <silkscreenpath>.pcbRelative (property)
  <silkscreenpath>.relative (property)
  <silkscreenpath>.strokeWidth (property)
<silkscreenline> (interface) [lines 335-383] [23 members] [category: PCB, footprint and CAD primitives] — JSX element <silkscreenline> with SilkscreenLineProps, required strokeWidth, x1, y1, x2,…
  <silkscreenline>.strokeWidth (property)
  <silkscreenline>.x1 (property)
  <silkscreenline>.y1 (property)
  <silkscreenline>.x2 (property)
  <silkscreenline>.y2 (property)
  <silkscreenline>.layer (property)
  <silkscreenline>.pcbLeftEdgeX (property)
  <silkscreenline>.pcbRightEdgeX (property)
  <silkscreenline>.pcbTopEdgeY (property)
  <silkscreenline>.pcbBottomEdgeY (property)
  <silkscreenline>.pcbPositionAnchor (property)
  <silkscreenline>.pcbPositionMode (property)
  <silkscreenline>.shouldBeOnEdgeOfBoard (property)
  <silkscreenline>.pcbMarginTop (property)
  <silkscreenline>.pcbMarginRight (property)
  <silkscreenline>.pcbMarginBottom (property)
  <silkscreenline>.pcbMarginLeft (property)
  <silkscreenline>.pcbMarginX (property)
  <silkscreenline>.pcbMarginY (property)
  <silkscreenline>.pcbStyle (property)
  <silkscreenline>.pcbSx (property)
  <silkscreenline>.pcbRelative (property)
  <silkscreenline>.relative (property)
<silkscreenrect> (interface) [lines 385-399] [6 members] [category: PCB, footprint and CAD primitives] — JSX element <silkscreenrect> with SilkscreenRectProps, required width, height
  <silkscreenrect>.width (property)
  <silkscreenrect>.height (property)
  <silkscreenrect>.strokeWidth (property)
  <silkscreenrect>.cornerRadius (property)
  <silkscreenrect>.filled (property)
  <silkscreenrect>.stroke (property)
<silkscreencircle> (interface) [lines 401-411] [4 members] [category: PCB, footprint and CAD primitives] — JSX element <silkscreencircle> with SilkscreenCircleProps, required radius
  <silkscreencircle>.radius (property)
  <silkscreencircle>.strokeWidth (property)
  <silkscreencircle>.isFilled (property)
  <silkscreencircle>.isOutline (property)
<courtyardcircle> (interface) [lines 413-417] [1 members] [category: PCB, footprint and CAD primitives] — JSX element <courtyardcircle> with CourtyardCircleProps, required radius
  <courtyardcircle>.radius (property)
<courtyardoutline> (interface) [lines 419-459] [19 members] [category: PCB, footprint and CAD primitives] — JSX element <courtyardoutline> with CourtyardOutlineProps, required outline
  <courtyardoutline>.outline (property)
  <courtyardoutline>.layer (property)
  <courtyardoutline>.pcbPositionAnchor (property)
  <courtyardoutline>.pcbPositionMode (property)
  <courtyardoutline>.shouldBeOnEdgeOfBoard (property)
  <courtyardoutline>.pcbMarginTop (property)
  <courtyardoutline>.pcbMarginRight (property)
  <courtyardoutline>.pcbMarginBottom (property)
  <courtyardoutline>.pcbMarginLeft (property)
  <courtyardoutline>.pcbMarginX (property)
  <courtyardoutline>.pcbMarginY (property)
  <courtyardoutline>.pcbStyle (property)
  <courtyardoutline>.pcbSx (property)
  <courtyardoutline>.pcbRelative (property)
  <courtyardoutline>.relative (property)
  <courtyardoutline>.strokeWidth (property)
  <courtyardoutline>.color (property)
  <courtyardoutline>.isStrokeDashed (property)
  <courtyardoutline>.isClosed (property)
<courtyardrect> (interface) [lines 461-477] [7 members] [category: PCB, footprint and CAD primitives] — JSX element <courtyardrect> with CourtyardRectProps, required width, height
  <courtyardrect>.width (property)
  <courtyardrect>.height (property)
  <courtyardrect>.strokeWidth (property)
  <courtyardrect>.color (property)
  <courtyardrect>.isFilled (property)
  <courtyardrect>.hasStroke (property)
  <courtyardrect>.isStrokeDashed (property)
<fabricationnoterect> (interface) [lines 479-497] [8 members] [category: PCB, footprint and CAD primitives] — JSX element <fabricationnoterect> with FabricationNoteRectProps, required width, height
  <fabricationnoterect>.width (property)
  <fabricationnoterect>.height (property)
  <fabricationnoterect>.strokeWidth (property)
  <fabricationnoterect>.cornerRadius (property)
  <fabricationnoterect>.color (property)
  <fabricationnoterect>.isFilled (property)
  <fabricationnoterect>.hasStroke (property)
  <fabricationnoterect>.isStrokeDashed (property)
<pcbnoteline> (interface) [lines 499-545] [21 members] [category: PCB, footprint and CAD primitives] — JSX element <pcbnoteline> with PcbNoteLineProps, required x1, y1, x2, y2
  <pcbnoteline>.x1 (property)
  <pcbnoteline>.y1 (property)
  <pcbnoteline>.x2 (property)
  <pcbnoteline>.y2 (property)
  <pcbnoteline>.strokeWidth (property)
  <pcbnoteline>.color (property)
  <pcbnoteline>.isDashed (property)
  <pcbnoteline>.pcbStyle (property)
  <pcbnoteline>.pcbPositionAnchor (property)
  <pcbnoteline>.pcbPositionMode (property)
  <pcbnoteline>.shouldBeOnEdgeOfBoard (property)
  <pcbnoteline>.pcbMarginTop (property)
  <pcbnoteline>.pcbMarginRight (property)
  <pcbnoteline>.pcbMarginBottom (property)
  <pcbnoteline>.pcbMarginLeft (property)
  <pcbnoteline>.pcbMarginX (property)
  <pcbnoteline>.pcbMarginY (property)
  <pcbnoteline>.pcbSx (property)
  <pcbnoteline>.layer (property)
  <pcbnoteline>.relative (property) — If true, both pcb and schematic coordinates will be interpreted…
  <pcbnoteline>.pcbRelative (property) — If true, pcbX/pcbY will be interpreted relative to the parent…
<pcbnoterect> (interface) [lines 547-565] [8 members] [category: PCB, footprint and CAD primitives] — JSX element <pcbnoterect> with PcbNoteRectProps, required width, height
  <pcbnoterect>.width (property)
  <pcbnoterect>.height (property)
  <pcbnoterect>.strokeWidth (property)
  <pcbnoterect>.isFilled (property)
  <pcbnoterect>.hasStroke (property)
  <pcbnoterect>.isStrokeDashed (property)
  <pcbnoterect>.color (property)
  <pcbnoterect>.cornerRadius (property)
<pcbnotetext> (interface) [lines 567-579] [5 members] [category: PCB, footprint and CAD primitives] — JSX element <pcbnotetext> with PcbNoteTextProps, required text
  <pcbnotetext>.text (property)
  <pcbnotetext>.anchorAlignment (property)
  <pcbnotetext>.font (property)
  <pcbnotetext>.fontSize (property)
  <pcbnotetext>.color (property)
<pcbnotepath> (interface) [lines 581-619] [17 members] [category: PCB, footprint and CAD primitives] — JSX element <pcbnotepath> with PcbNotePathProps, required route
  <pcbnotepath>.route (property)
  <pcbnotepath>.strokeWidth (property)
  <pcbnotepath>.color (property)
  <pcbnotepath>.pcbStyle (property)
  <pcbnotepath>.pcbPositionAnchor (property)
  <pcbnotepath>.pcbPositionMode (property)
  <pcbnotepath>.shouldBeOnEdgeOfBoard (property)
  <pcbnotepath>.pcbMarginTop (property)
  <pcbnotepath>.pcbMarginRight (property)
  <pcbnotepath>.pcbMarginBottom (property)
  <pcbnotepath>.pcbMarginLeft (property)
  <pcbnotepath>.pcbMarginX (property)
  <pcbnotepath>.pcbMarginY (property)
  <pcbnotepath>.pcbSx (property)
  <pcbnotepath>.layer (property)
  <pcbnotepath>.relative (property) — If true, both pcb and schematic coordinates will be interpreted…
  <pcbnotepath>.pcbRelative (property) — If true, pcbX/pcbY will be interpreted relative to the parent…
<pcbnotedimension> (interface) [lines 621-677] [26 members] [category: PCB, footprint and CAD primitives] — JSX element <pcbnotedimension> with PcbNoteDimensionProps, required from, to
  <pcbnotedimension>.from (property)
  <pcbnotedimension>.to (property)
  <pcbnotedimension>.text (property)
  <pcbnotedimension>.offset (property)
  <pcbnotedimension>.font (property)
  <pcbnotedimension>.fontSize (property)
  <pcbnotedimension>.color (property)
  <pcbnotedimension>.arrowSize (property)
  <pcbnotedimension>.units (property)
  <pcbnotedimension>.outerEdgeToEdge (property)
  <pcbnotedimension>.centerToCenter (property)
  <pcbnotedimension>.innerEdgeToEdge (property)
  <pcbnotedimension>.pcbStyle (property)
  <pcbnotedimension>.pcbPositionAnchor (property)
  <pcbnotedimension>.pcbPositionMode (property)
  <pcbnotedimension>.shouldBeOnEdgeOfBoard (property)
  <pcbnotedimension>.pcbMarginTop (property)
  <pcbnotedimension>.pcbMarginRight (property)
  <pcbnotedimension>.pcbMarginBottom (property)
  <pcbnotedimension>.pcbMarginLeft (property)
  <pcbnotedimension>.pcbMarginX (property)
  <pcbnotedimension>.pcbMarginY (property)
  <pcbnotedimension>.pcbSx (property)
  <pcbnotedimension>.layer (property)
  <pcbnotedimension>.relative (property) — If true, both pcb and schematic coordinates will be interpreted…
  <pcbnotedimension>.pcbRelative (property) — If true, pcbX/pcbY will be interpreted relative to the parent…
<fabricationnotetext> (interface) [lines 679-691] [5 members] [category: PCB, footprint and CAD primitives] — JSX element <fabricationnotetext> with FabricationNoteTextProps, required text
  <fabricationnotetext>.text (property)
  <fabricationnotetext>.anchorAlignment (property)
  <fabricationnotetext>.font (property)
  <fabricationnotetext>.fontSize (property)
  <fabricationnotetext>.color (property)
<fabricationnotepath> (interface) [lines 693-729] [17 members] [category: PCB, footprint and CAD primitives] — JSX element <fabricationnotepath> with FabricationNotePathProps, required route
  <fabricationnotepath>.route (property)
  <fabricationnotepath>.layer (property)
  <fabricationnotepath>.pcbPositionAnchor (property)
  <fabricationnotepath>.pcbPositionMode (property)
  <fabricationnotepath>.shouldBeOnEdgeOfBoard (property)
  <fabricationnotepath>.pcbMarginTop (property)
  <fabricationnotepath>.pcbMarginRight (property)
  <fabricationnotepath>.pcbMarginBottom (property)
  <fabricationnotepath>.pcbMarginLeft (property)
  <fabricationnotepath>.pcbMarginX (property)
  <fabricationnotepath>.pcbMarginY (property)
  <fabricationnotepath>.pcbStyle (property)
  <fabricationnotepath>.pcbSx (property)
  <fabricationnotepath>.pcbRelative (property)
  <fabricationnotepath>.relative (property)
  <fabricationnotepath>.strokeWidth (property)
  <fabricationnotepath>.color (property)
<fabricationnotedimension> (interface) [lines 731-787] [26 members] [category: PCB, footprint and CAD primitives] — JSX element <fabricationnotedimension> with FabricationNoteDimensionProps, required from, to
  <fabricationnotedimension>.from (property)
  <fabricationnotedimension>.to (property)
  <fabricationnotedimension>.text (property)
  <fabricationnotedimension>.offset (property)
  <fabricationnotedimension>.font (property)
  <fabricationnotedimension>.fontSize (property)
  <fabricationnotedimension>.color (property)
  <fabricationnotedimension>.arrowSize (property)
  <fabricationnotedimension>.units (property)
  <fabricationnotedimension>.outerEdgeToEdge (property)
  <fabricationnotedimension>.centerToCenter (property)
  <fabricationnotedimension>.innerEdgeToEdge (property)
  <fabricationnotedimension>.pcbStyle (property)
  <fabricationnotedimension>.pcbPositionAnchor (property)
  <fabricationnotedimension>.pcbPositionMode (property)
  <fabricationnotedimension>.shouldBeOnEdgeOfBoard (property)
  <fabricationnotedimension>.pcbMarginTop (property)
  <fabricationnotedimension>.pcbMarginRight (property)
  <fabricationnotedimension>.pcbMarginBottom (property)
  <fabricationnotedimension>.pcbMarginLeft (property)
  <fabricationnotedimension>.pcbMarginX (property)
  <fabricationnotedimension>.pcbMarginY (property)
  <fabricationnotedimension>.pcbSx (property)
  <fabricationnotedimension>.layer (property)
  <fabricationnotedimension>.relative (property) — If true, both pcb and schematic coordinates will be interpreted…
  <fabricationnotedimension>.pcbRelative (property) — If true, pcbX/pcbY will be interpreted relative to the parent…
<copperpour> (interface) [lines 789-816] [12 members] [category: PCB, footprint and CAD primitives] — JSX element <copperpour> with CopperPourProps, required layer, connectsTo
  <copperpour>.name (property)
  <copperpour>.layer (property)
  <copperpour>.connectsTo (property)
  <copperpour>.unbroken (property) — Reserves the pour region during autorouting so unrelated traces do…
  <copperpour>.padMargin (property)
  <copperpour>.traceMargin (property)
  <copperpour>.clearance (property)
  <copperpour>.boardEdgeMargin (property)
  <copperpour>.cutoutMargin (property)
  <copperpour>.useThermalReliefs (property)
  <copperpour>.outline (property)
  <copperpour>.coveredWithSolderMask (property)

## Connectivity — `api-connectivity.md`

<port> (interface) [lines 5-27] [10 members] [category: Connectivity] — JSX element <port> with PortProps
  <port>.name (property)
  <port>.connectsTo (property)
  <port>.layers (property)
  <port>.direction (property)
  <port>.pinNumber (property)
  <port>.schStemLength (property)
  <port>.schPinLabelFontSize (property)
  <port>.aliases (property)
  <port>.kicadPinMetadata (property)
  <port>.hasInversionCircle (property)
<netlabel> (interface) [lines 29-48] [8 members] [category: Connectivity] — JSX element <netlabel> with NetLabelProps
  <netlabel>.net (property)
  <netlabel>.connection (property)
  <netlabel>.connectsTo (property)
  <netlabel>.inline (property) — Render the net name along its schematic trace instead of…
  <netlabel>.schX (property)
  <netlabel>.schY (property)
  <netlabel>.schRotation (property)
  <netlabel>.anchorSide (property)
<net> (interface) [lines 50-66] [7 members] [category: Connectivity] — JSX element <net> with NetProps, required name
  <net>.name (property)
  <net>.connectsTo (property)
  <net>.routingPhaseIndex (property)
  <net>.highlightColor (property)
  <net>.isPowerNet (property)
  <net>.isGroundNet (property)
  <net>.nominalTraceWidth (property)
<trace> (interface) [lines 68-114] [22 members] [category: Connectivity] — JSX element <trace> with TraceProps
  <trace>.path (property)
  <trace>.width (property)
  <trace>.name (property)
  <trace>.connectsTo (property)
  <trace>.thickness (property)
  <trace>.highlightColor (property)
  <trace>.displayName (property)
  <trace>.routingPhaseIndex (property)
  <trace>.maxLength (property)
  <trace>.pcbPath (property)
  <trace>.schematicRouteHints (property)
  <trace>.pcbRouteHints (property)
  <trace>.pcbPathRelativeTo (property)
  <trace>.pcbPaths (property)
  <trace>.pcbStraightLine (property)
  <trace>.schDisplayLabel (property)
  <trace>.schStroke (property)
  <trace>.maxViaCount (property)
  <trace>.from (property)
  <trace>.to (property)
  <trace>.start (property)
  <trace>.end (property)
<bus> (interface) [lines 116-144] [9 members] [category: Connectivity] — JSX element <bus> with BusProps, required connections
  <bus>.name (property)
  <bus>.connections (property) — One or more trace names or port selectors for the…
  <bus>.routingPhaseIndex (property) — If set, every trace in this bus is assigned to…
  <bus>.maxLengthSkew (property) — Maximum routed-length difference between bus members
  <bus>.targetImpedance (property) — Intended single-ended characteristic impedance
  <bus>.pcbTraceWidth (property) — Explicit PCB trace width for every bus member
  <bus>.pcbAllowedLayers (property) — PCB layers on which the bus may be routed
  <bus>.preferredLayer (property) — Preferred PCB layer for routing the bus
  <bus>.preferredLayers (property) — Preferred PCB layers for routing the bus, in priority order
<differentialpair> (interface) [lines 146-168] [7 members] [category: Connectivity] — JSX element <differentialpair> with DifferentialPairProps, required positiveConnection, negativeConnection
  <differentialpair>.name (property)
  <differentialpair>.positiveConnection (property) — Name of the trace or pin carrying the positive signal
  <differentialpair>.negativeConnection (property) — Name of the trace or pin carrying the negative signal
  <differentialpair>.maxLengthSkew (property) — Maximum permitted routed-length skew
  <differentialpair>.targetDifferentialImpedance (property) — Intended differential characteristic impedance
  <differentialpair>.pcbTraceGap (property) — Edge-to-edge PCB copper gap between the pair
  <differentialpair>.maxUncoupledLength (property) — Maximum length over which the pair may be routed without…
<tracehint> (interface) [lines 170-182] [5 members] [category: Connectivity] — JSX element <tracehint> with TraceHintProps
  <tracehint>.offset (property)
  <tracehint>.offsets (property)
  <tracehint>.for (property)
  <tracehint>.order (property)
  <tracehint>.traceWidth (property)
<pcbtrace> (interface) [lines 184-192] [3 members] [category: Connectivity] — JSX element <pcbtrace> with PcbTraceProps, required route
  <pcbtrace>.route (property)
  <pcbtrace>.thickness (property)
  <pcbtrace>.layer (property)

## Simulation — `api-simulation.md`

<analogsimulation> (interface) [lines 5-23] [8 members] [category: Simulation] — JSX element <analogsimulation> with AnalogSimulationProps
  <analogsimulation>.name (property)
  <analogsimulation>.simulationType (property)
  <analogsimulation>.duration (property)
  <analogsimulation>.startTime (property)
  <analogsimulation>.timePerStep (property)
  <analogsimulation>.spiceEngine (property)
  <analogsimulation>.spiceOptions (property)
  <analogsimulation>.graphIndependentAxes (property)
<analogtransientsimulation> (interface) [lines 25-51] [8 members] [category: Simulation] — JSX element <analogtransientsimulation> with AnalogTransientSimulationProps
  <analogtransientsimulation>.duration (property) — Simulation duration
  <analogtransientsimulation>.startTime (property) — Time at which recording starts
  <analogtransientsimulation>.timePerStep (property) — Maximum simulation timestep
  <analogtransientsimulation>.name (property) — Stable identity for the simulation experiment
  <analogtransientsimulation>.spiceEngine (property) — SPICE implementation used to run this analysis
  <analogtransientsimulation>.spiceOptions (property) — Numerical solver settings forwarded to the selected SPICE engine
  <analogtransientsimulation>.graphIndependentAxes (property) — Render each probe with an independent vertical graph scale
  <analogtransientsimulation>.children (property) — Optional nested sweep parameter for repeated analysis runs
<analogdcoperatingpointsimulation> (interface) [lines 53-70] [5 members] [category: Simulation] — JSX element <analogdcoperatingpointsimulation> with AnalogDcOperatingPointSimulationProps
  <analogdcoperatingpointsimulation>.name (property) — Stable identity for the simulation experiment
  <analogdcoperatingpointsimulation>.spiceEngine (property) — SPICE implementation used to run this analysis
  <analogdcoperatingpointsimulation>.spiceOptions (property) — Numerical solver settings forwarded to the selected SPICE engine
  <analogdcoperatingpointsimulation>.graphIndependentAxes (property) — Render each probe with an independent vertical graph scale
  <analogdcoperatingpointsimulation>.children (property) — Optional nested sweep parameter for repeated analysis runs
<analogdcsweepsimulation> (interface) [lines 72-101] [9 members] [category: Simulation] — JSX element <analogdcsweepsimulation> with AnalogDcSweepSimulationProps, required sweepSource, sweepStart, sweepStop, sweepStep
  <analogdcsweepsimulation>.sweepSource (property) — Selector for the independent voltage or current source being swept
  <analogdcsweepsimulation>.sweepStart (property) — First source level
  <analogdcsweepsimulation>.sweepStop (property) — Last source level
  <analogdcsweepsimulation>.sweepStep (property) — Nonzero increment directed from sweepStart toward sweepStop
  <analogdcsweepsimulation>.name (property) — Stable identity for the simulation experiment
  <analogdcsweepsimulation>.spiceEngine (property) — SPICE implementation used to run this analysis
  <analogdcsweepsimulation>.spiceOptions (property) — Numerical solver settings forwarded to the selected SPICE engine
  <analogdcsweepsimulation>.graphIndependentAxes (property) — Render each probe with an independent vertical graph scale
  <analogdcsweepsimulation>.children (property) — Optional nested sweep parameter for repeated analysis runs
<analogacsweepsimulation> (interface) [lines 103-135] [10 members] [category: Simulation] — JSX element <analogacsweepsimulation> with AnalogAcSweepSimulationProps, required sweepType, startFrequency, stopFrequency
  <analogacsweepsimulation>.sweepType (property) — Frequency spacing used by the AC analysis
  <analogacsweepsimulation>.startFrequency (property) — First positive frequency
  <analogacsweepsimulation>.stopFrequency (property) — Last frequency, which must be greater than startFrequency
  <analogacsweepsimulation>.samplesPerInterval (property) — Samples per decade or octave
  <analogacsweepsimulation>.sampleCount (property) — Total samples
  <analogacsweepsimulation>.name (property) — Stable identity for the simulation experiment
  <analogacsweepsimulation>.spiceEngine (property) — SPICE implementation used to run this analysis
  <analogacsweepsimulation>.spiceOptions (property) — Numerical solver settings forwarded to the selected SPICE engine
  <analogacsweepsimulation>.graphIndependentAxes (property) — Render each probe with an independent vertical graph scale
  <analogacsweepsimulation>.children (property) — Optional nested sweep parameter for repeated analysis runs
<analogsweepparameter> (interface) [lines 137-171] [11 members] [category: Simulation] — JSX element <analogsweepparameter> with AnalogSweepParameterProps, required parameterType
  <analogsweepparameter>.parameterType (property)
  <analogsweepparameter>.resistorRef (property) — Selector for the resistor whose simulation-only resistance is swept
  <analogsweepparameter>.name (property) — Stable identity for this sweep parameter
  <analogsweepparameter>.values (property) — Explicit parameter coordinates
  <analogsweepparameter>.start (property) — First generated parameter coordinate
  <analogsweepparameter>.stop (property) — Last generated parameter coordinate
  <analogsweepparameter>.step (property) — Nonzero parameter increment directed from start toward stop
  <analogsweepparameter>.capacitorRef (property) — Selector for the capacitor whose simulation-only capacitance is swept
  <analogsweepparameter>.inductorRef (property) — Selector for the inductor whose simulation-only inductance is swept
  <analogsweepparameter>.net (property) — Net whose simulation-only voltage is swept
  <analogsweepparameter>.currentSourceRef (property) — Selector for the current source whose simulation-only current is swept
<spicemodel> (interface) [lines 173-179] [2 members] [category: Simulation] — JSX element <spicemodel> with SpiceModelProps, required source
  <spicemodel>.source (property)
  <spicemodel>.spicePinMapping (property)

## Shared props — `api-shared-props.md`

CommonComponentProps (interface) [lines 5-48] [18 members] [category: Shared props] — Props every element extending CommonComponentProps accepts
  CommonComponentProps.name (property)
  CommonComponentProps.displayName (property)
  CommonComponentProps.datasheetUrl (property)
  CommonComponentProps.pinAttributes (property)
  CommonComponentProps.supplierPartNumbers (property)
  CommonComponentProps.cadModel (property)
  CommonComponentProps.kicadFootprintMetadata (property)
  CommonComponentProps.kicadSymbolMetadata (property)
  CommonComponentProps.children (property)
  CommonComponentProps.symbolName (property)
  CommonComponentProps.doNotPlace (property)
  CommonComponentProps.allowOffBoard (property) — Allows the PCB component to hang off the board (e.g
  CommonComponentProps.obstructsWithinBounds (property) — Does this component take up all the space within its…
  CommonComponentProps.showAsTranslucentModel (property) — Whether to show this component's CAD model as translucent in…
  CommonComponentProps.mfn (property)
  CommonComponentProps.manufacturerPartNumber (property)
  CommonComponentProps.schSectionName (property) — This component will be drawn as part of this section…
  CommonComponentProps.schSheetName (property) — This component will be drawn as part of this sheet…
SubcircuitGroupProps (interface) [lines 50-123] [30 members] [category: Shared props] — Props every element extending SubcircuitGroupProps accepts
  SubcircuitGroupProps.manualEdits (property)
  SubcircuitGroupProps.routingDisabled (property)
  SubcircuitGroupProps.placementDrcChecksDisabled (property) — Skip the PCB placement design rule checks for this subcircuit
  SubcircuitGroupProps.bomDisabled (property)
  SubcircuitGroupProps.defaultTraceWidth (property)
  SubcircuitGroupProps.pcbRouteCache (property)
  SubcircuitGroupProps.autorouter (property)
  SubcircuitGroupProps.autorouterEffortLevel (property)
  SubcircuitGroupProps.autorouterVersion (property) — Selects the local autorouting pipeline
  SubcircuitGroupProps.circuitJson (property) — Serialized circuit JSON describing a precompiled subcircuit
  SubcircuitGroupProps.exposedNets (property) — Nets from this subcircuit that should be exposed to parent…
  SubcircuitGroupProps.exposeNets (property) — If true, all nets defined within this subcircuit are exposed…
  SubcircuitGroupProps.schAutoLayoutEnabled (property) — If true, we'll automatically layout the schematic for this group
  SubcircuitGroupProps.schTraceAutoLabelEnabled (property) — If true, net labels will automatically be created for complex…
  SubcircuitGroupProps.schMaxTraceDistance (property) — Maximum length a trace can span on the schematic
  SubcircuitGroupProps.partsEngine (property)
  SubcircuitGroupProps.square (property) — When autosizing, the board will be made square
  SubcircuitGroupProps.emptyArea (property) — Desired empty area of the board e.g
  SubcircuitGroupProps.filledArea (property) — Desired filled area of the board e.g
  SubcircuitGroupProps.outline (property)
  SubcircuitGroupProps.outlineOffsetX (property)
  SubcircuitGroupProps.outlineOffsetY (property)
  SubcircuitGroupProps.minViaHoleEdgeToViaHoleEdgeClearance (property)
  SubcircuitGroupProps.minPlatedHoleDrillEdgeToDrillEdgeClearance (property)
  SubcircuitGroupProps.minTraceToPadEdgeClearance (property)
  SubcircuitGroupProps.minPadEdgeToPadEdgeClearance (property)
  SubcircuitGroupProps.minBoardEdgeClearance (property)
  SubcircuitGroupProps.minViaEdgeToPadEdgeClearance (property)
  SubcircuitGroupProps.minViaHoleDiameter (property)
  SubcircuitGroupProps.minViaPadDiameter (property)
BaseGroupProps (interface) [lines 125-328] [97 members] [category: Shared props] — Props every element extending BaseGroupProps accepts
  BaseGroupProps.name (property)
  BaseGroupProps.children (property)
  BaseGroupProps.schTitle (property) — Title to display above this group in the schematic view
  BaseGroupProps.schSheetName (property) — This group will be drawn as part of this sheet…
  BaseGroupProps.showAsSchematicBox (property) — If true, render this group as a single schematic box
  BaseGroupProps.connections (property) — Mapping of external pin names to internal connection targets
  BaseGroupProps.schPinArrangement (property) — Arrangement for pins when rendered as a schematic box
  BaseGroupProps.schPinStyle (property) — Styles to apply to individual pins in the schematic box…
  BaseGroupProps.pcbWidth (property)
  BaseGroupProps.pcbHeight (property)
  BaseGroupProps.minTraceWidth (property)
  BaseGroupProps.nominalTraceWidth (property)
  BaseGroupProps.schWidth (property)
  BaseGroupProps.schHeight (property)
  BaseGroupProps.pcbLayout (property)
  BaseGroupProps.schLayout (property)
  BaseGroupProps.cellBorder (property)
  BaseGroupProps.border (property)
  BaseGroupProps.schPadding (property)
  BaseGroupProps.schPaddingLeft (property)
  BaseGroupProps.schPaddingRight (property)
  BaseGroupProps.schPaddingTop (property)
  BaseGroupProps.schPaddingBottom (property)
  BaseGroupProps.pcbPadding (property)
  BaseGroupProps.pcbPaddingLeft (property)
  BaseGroupProps.pcbPaddingRight (property)
  BaseGroupProps.pcbPaddingTop (property)
  BaseGroupProps.pcbPaddingBottom (property)
  BaseGroupProps.pcbAnchorAlignment (property) — Anchor to use when interpreting pcbX/pcbY/pcbOffsetX/pcbOffsetY relative to pcbPosition
  BaseGroupProps.pcbGrid (property)
  BaseGroupProps.pcbGridCols (property)
  BaseGroupProps.pcbGridRows (property)
  BaseGroupProps.pcbGridTemplateRows (property)
  BaseGroupProps.pcbGridTemplateColumns (property)
  BaseGroupProps.pcbGridTemplate (property)
  BaseGroupProps.pcbGridGap (property)
  BaseGroupProps.pcbGridRowGap (property)
  BaseGroupProps.pcbGridColumnGap (property)
  BaseGroupProps.pcbFlex (property)
  BaseGroupProps.pcbFlexGap (property)
  BaseGroupProps.pcbFlexDirection (property)
  BaseGroupProps.pcbAlignItems (property)
  BaseGroupProps.pcbJustifyContent (property)
  BaseGroupProps.pcbFlexRow (property)
  BaseGroupProps.pcbFlexColumn (property)
  BaseGroupProps.pcbGap (property)
  BaseGroupProps.pcbPack (property)
  BaseGroupProps.pcbPackGap (property)
  BaseGroupProps.schGrid (property)
  BaseGroupProps.schGridCols (property)
  BaseGroupProps.schGridRows (property)
  BaseGroupProps.schGridTemplateRows (property)
  BaseGroupProps.schGridTemplateColumns (property)
  BaseGroupProps.schGridTemplate (property)
  BaseGroupProps.schGridGap (property)
  BaseGroupProps.schGridRowGap (property)
  BaseGroupProps.schGridColumnGap (property)
  BaseGroupProps.schFlex (property)
  BaseGroupProps.schFlexGap (property)
  BaseGroupProps.schFlexDirection (property)
  BaseGroupProps.schAlignItems (property)
  BaseGroupProps.schJustifyContent (property)
  BaseGroupProps.schFlexRow (property)
  BaseGroupProps.schFlexColumn (property)
  BaseGroupProps.schGap (property)
  BaseGroupProps.schPack (property)
  BaseGroupProps.schMatchAdapt (property)
  BaseGroupProps.layoutMode (property)
  BaseGroupProps.position (property)
  BaseGroupProps.gridCols (property)
  BaseGroupProps.gridRows (property)
  BaseGroupProps.gridTemplateRows (property)
  BaseGroupProps.gridTemplateColumns (property)
  BaseGroupProps.gridTemplate (property)
  BaseGroupProps.gridGap (property)
  BaseGroupProps.gridRowGap (property)
  BaseGroupProps.gridColumnGap (property)
  BaseGroupProps.flexDirection (property)
  BaseGroupProps.alignItems (property)
  BaseGroupProps.justifyContent (property)
  BaseGroupProps.flexRow (property)
  BaseGroupProps.flexColumn (property)
  BaseGroupProps.gap (property)
  BaseGroupProps.pack (property)
  BaseGroupProps.packOrderStrategy (property)
  BaseGroupProps.packPlacementStrategy (property)
  BaseGroupProps.padding (property)
  BaseGroupProps.paddingLeft (property)
  BaseGroupProps.paddingRight (property)
  BaseGroupProps.paddingTop (property)
  BaseGroupProps.paddingBottom (property)
  BaseGroupProps.paddingX (property)
  BaseGroupProps.paddingY (property)
  BaseGroupProps.width (property)
  BaseGroupProps.height (property)
  BaseGroupProps.matchAdapt (property)
  BaseGroupProps.matchAdaptTemplate (property)
CommonLayoutProps (interface) [lines 330-359] [13 members] [category: Shared props] — Props every element extending CommonLayoutProps accepts
  CommonLayoutProps.schMarginTop (property)
  CommonLayoutProps.schMarginRight (property)
  CommonLayoutProps.schMarginBottom (property)
  CommonLayoutProps.schMarginLeft (property)
  CommonLayoutProps.schMarginX (property)
  CommonLayoutProps.schMarginY (property)
  CommonLayoutProps.schX (property)
  CommonLayoutProps.schY (property)
  CommonLayoutProps.schRotation (property)
  CommonLayoutProps.footprint (property)
  CommonLayoutProps.symbol (property)
  CommonLayoutProps.schStyle (property)
  CommonLayoutProps.schRelative (property) — If true, schX/schY will be interpreted relative to the parent…
PcbLayoutProps (interface) [lines 361-412] [23 members] [category: Shared props] — Props every element extending PcbLayoutProps accepts
  PcbLayoutProps.pcbX (property)
  PcbLayoutProps.pcbY (property)
  PcbLayoutProps.pcbLeftEdgeX (property) — Position the left, right, top, or bottom edge of the…
  PcbLayoutProps.pcbRightEdgeX (property)
  PcbLayoutProps.pcbTopEdgeY (property)
  PcbLayoutProps.pcbBottomEdgeY (property)
  PcbLayoutProps.pcbOffsetX (property)
  PcbLayoutProps.pcbOffsetY (property)
  PcbLayoutProps.pcbRotation (property)
  PcbLayoutProps.pcbPositionAnchor (property)
  PcbLayoutProps.pcbPositionMode (property)
  PcbLayoutProps.shouldBeOnEdgeOfBoard (property)
  PcbLayoutProps.layer (property)
  PcbLayoutProps.pcbMarginTop (property)
  PcbLayoutProps.pcbMarginRight (property)
  PcbLayoutProps.pcbMarginBottom (property)
  PcbLayoutProps.pcbMarginLeft (property)
  PcbLayoutProps.pcbMarginX (property)
  PcbLayoutProps.pcbMarginY (property)
  PcbLayoutProps.pcbStyle (property)
  PcbLayoutProps.pcbSx (property)
  PcbLayoutProps.pcbRelative (property) — If true, pcbX/pcbY will be interpreted relative to the parent…
  PcbLayoutProps.relative (property) — If true, both pcb and schematic coordinates will be interpreted…

## Prop types — `api-prop-types.md`

AmmeterPinLabels (type) [lines 5-6] [category: Prop types]
AntennaFrequencyBand (type) [lines 8-9] [category: Prop types]
AntennaShape (type) [lines 11-12] [category: Prop types]
AutocompleteString<T extends string> (type) [lines 14-15] [category: Prop types]
AutorouterConfig (interface) [lines 17-45] [13 members] [category: Prop types]
  AutorouterConfig.serverUrl (property)
  AutorouterConfig.inputFormat (property)
  AutorouterConfig.serverMode (property)
  AutorouterConfig.serverCacheEnabled (property)
  AutorouterConfig.cache (property)
  AutorouterConfig.traceClearance (property)
  AutorouterConfig.availableJumperTypes (property)
  AutorouterConfig.allowViaInPad (property)
  AutorouterConfig.groupMode (property)
  AutorouterConfig.local (property)
  AutorouterConfig.algorithmFn (property)
  AutorouterConfig.implicitBreakoutPointSolverFn (property) — Override the solver used to place implicit breakout points
  AutorouterConfig.preset (property)
AutorouterPreset (type) [lines 47-48] [category: Prop types]
AutorouterProp (type) [lines 50-51] [category: Prop types]
BasicFootprint (type) [lines 53-54] [category: Prop types]
BatteryPinLabels (type) [lines 56-57] [category: Prop types]
BoardColor (type) [lines 59-60] [category: Prop types]
BoardColorPreset (type) [lines 62-63] [category: Prop types]
Border (interface) [lines 65-72] [3 members] [category: Prop types]
  Border.strokeWidth (property)
  Border.dashed (property)
  Border.solid (property)
BusFanoutDirection (type) [lines 74-75] [category: Prop types]
BusFanoutDirectionLiteral (type) [lines 77-78] [category: Prop types]
BusName (type) [lines 80-81] [category: Prop types]
CadModelAxisDirection (type) [lines 83-84] [category: Prop types]
CadModelBase (interface) [lines 86-110] [11 members] [category: Prop types]
  CadModelBase.rotationOffset (property)
  CadModelBase.positionOffset (property)
  CadModelBase.modelOriginPosition (property)
  CadModelBase.modelBounds (property) — Axis-aligned extent of the model measured in its own coordinate…
  CadModelBase.size (property)
  CadModelBase.modelUnitToMmScale (property)
  CadModelBase.modelBoardNormalDirection (property)
  CadModelBase.pcbRotationOffset (property)
  CadModelBase.zOffsetFromSurface (property)
  CadModelBase.showAsTranslucentModel (property)
  CadModelBase.stepUrl (property)
CadModelFootprinterString (type) [lines 112-114] [category: Prop types] — A Footprinter string used to procedurally generate the component's CAD…
CadModelGlb (interface) [lines 116-120] [1 members] [category: Prop types] — Required glbUrl
  CadModelGlb.glbUrl (property)
CadModelGltf (interface) [lines 122-126] [1 members] [category: Prop types] — Required gltfUrl
  CadModelGltf.gltfUrl (property)
CadModelJscad (interface) [lines 128-132] [1 members] [category: Prop types] — Required jscad
  CadModelJscad.jscad (property)
CadModelObj (interface) [lines 134-140] [2 members] [category: Prop types] — Required objUrl
  CadModelObj.objUrl (property)
  CadModelObj.mtlUrl (property)
CadModelProp (type) [lines 142-143] [category: Prop types]
CadModelStep (interface) [lines 145-149] [1 members] [category: Prop types] — Required stepUrl
  CadModelStep.stepUrl (property)
CadModelStl (interface) [lines 151-155] [1 members] [category: Prop types] — Required stlUrl
  CadModelStl.stlUrl (property)
CadModelWrl (interface) [lines 157-161] [1 members] [category: Prop types] — Required wrlUrl
  CadModelWrl.wrlUrl (property)
CanonicalBusFanoutDirection (type) [lines 163-164] [category: Prop types]
CapacitorPinLabels (type) [lines 166-167] [category: Prop types]
CircuitJsonWarning (type) [lines 169-170] [category: Prop types]
Connections<PinLabel extends string = string> (type) [lines 172-174] [category: Prop types] — Defines a mapping of strings to connection paths e.g
ConnectionTarget (type) [lines 176-177] [category: Prop types]
ConnectorStandard (type) [lines 179-180] [category: Prop types]
CrystalPinLabels (type) [lines 182-183] [category: Prop types]
CurrentSourcePinLabels (type) [lines 185-186] [category: Prop types]
CustomDrcCheckContext (interface) [lines 188-202] [6 members] [category: Prop types] — Required select, selectAll, isConnected, isPulledUp, isPulledDown, getResistanceBetween
  CustomDrcCheckContext.select (property)
  CustomDrcCheckContext.selectAll (property)
  CustomDrcCheckContext.isConnected (property)
  CustomDrcCheckContext.isPulledUp (property)
  CustomDrcCheckContext.isPulledDown (property)
  CustomDrcCheckContext.getResistanceBetween (property)
CustomDrcCheckFn (type) [lines 204-205] [category: Prop types]
CustomDrcCheckInput (type) [lines 207-208] [category: Prop types]
CustomDrcConnectable (type) [lines 210-211] [category: Prop types]
CustomDrcSelect (interface) [lines 213-214] [category: Prop types]
CustomDrcSelectAll (interface) [lines 216-217] [category: Prop types]
DiodePinLabels (type) [lines 219-220] [category: Prop types]
DiodePinLabelsProp<PinLabel extends string = string> (type) [lines 222-223] [category: Prop types]
DirectionalFanoutBoundaryPadding (interface) [lines 225-234] [4 members] [category: Prop types]
  DirectionalFanoutBoundaryPadding.top (property)
  DirectionalFanoutBoundaryPadding.right (property)
  DirectionalFanoutBoundaryPadding.bottom (property)
  DirectionalFanoutBoundaryPadding.left (property)
Distance (type) [lines 236-237] [category: Prop types]
FanoutBoundaryPadding (type) [lines 239-241] [category: Prop types] — Padding between the union of the fanout source pads and…
FanoutPourNetMap (type) [lines 243-244] [category: Prop types]
FootprinterStringAutocomplete (type) [lines 246-247] [category: Prop types]
FootprinterStringExample (type) [lines 249-250] [category: Prop types]
FootprintInsertionDirection (type) [lines 252-254] [category: Prop types] — Direction a cable or mating part is attached from, named…
FootprintProp (type) [lines 256-257] [category: Prop types]
FootprintSoupElements (type) [lines 259-261] [category: Prop types] — This is an abbreviated definition of the soup elements that…
ImplicitBreakoutBounds (interface) [lines 263-273] [4 members] [category: Prop types] — Required minX, maxX, minY, maxY
  ImplicitBreakoutBounds.minX (property)
  ImplicitBreakoutBounds.maxX (property)
  ImplicitBreakoutBounds.minY (property)
  ImplicitBreakoutBounds.maxY (property)
ImplicitBreakoutBus (interface) [lines 275-284] [3 members] [category: Prop types] — Required busId, connectionIds
  ImplicitBreakoutBus.busId (property)
  ImplicitBreakoutBus.connectionIds (property)
  ImplicitBreakoutBus.targetLayers (property) — Ordered candidate layers that the solver may distribute this bus…
ImplicitBreakoutConnection (interface) [lines 286-292] [2 members] [category: Prop types] — Required connectionId, endpoints
  ImplicitBreakoutConnection.connectionId (property)
  ImplicitBreakoutConnection.endpoints (property)
ImplicitBreakoutConnectionEndpoint (interface) [lines 294-303] [3 members] [category: Prop types] — Required regionId, position
  ImplicitBreakoutConnectionEndpoint.regionId (property)
  ImplicitBreakoutConnectionEndpoint.position (property)
  ImplicitBreakoutConnectionEndpoint.externalDestination (property) — Optional PCB world-space routing destination, in millimeters, beyond this breakout…
ImplicitBreakoutConnectionOrDifferentialPair (type) [lines 305-306] [category: Prop types]
ImplicitBreakoutDifferentialPair (interface) [lines 308-314] [2 members] [category: Prop types] — Required type, connections
  ImplicitBreakoutDifferentialPair.type (property)
  ImplicitBreakoutDifferentialPair.connections (property)
ImplicitBreakoutEdge (type) [lines 316-317] [category: Prop types]
ImplicitBreakoutPoint (interface) [lines 319-325] [2 members] [category: Prop types] — Required x, y
  ImplicitBreakoutPoint.x (property)
  ImplicitBreakoutPoint.y (property)
ImplicitBreakoutPointSolverFn (type) [lines 327-328] [category: Prop types]
ImplicitBreakoutPointSolverInput (interface) [lines 330-340] [4 members] [category: Prop types] — Required regions, connections, buses, boundaryPointSpacing
  ImplicitBreakoutPointSolverInput.regions (property)
  ImplicitBreakoutPointSolverInput.connections (property)
  ImplicitBreakoutPointSolverInput.buses (property)
  ImplicitBreakoutPointSolverInput.boundaryPointSpacing (property)
ImplicitBreakoutPointSolverOutput (interface) [lines 342-346] [1 members] [category: Prop types] — Required breakoutPoints
  ImplicitBreakoutPointSolverOutput.breakoutPoints (property)
ImplicitBreakoutRegion (interface) [lines 348-356] [3 members] [category: Prop types] — Required regionId, bounds, edge
  ImplicitBreakoutRegion.regionId (property)
  ImplicitBreakoutRegion.bounds (property)
  ImplicitBreakoutRegion.edge (property)
ImplicitBreakoutSolverPoint (interface) [lines 358-366] [3 members] [category: Prop types] — Required regionId, connectionId, layer
  ImplicitBreakoutSolverPoint.regionId (property)
  ImplicitBreakoutSolverPoint.connectionId (property)
  ImplicitBreakoutSolverPoint.layer (property)
InductorPinLabels (type) [lines 368-369] [category: Prop types]
InternalCircuitElement (type) [lines 371-372] [category: Prop types]
InternalCircuitProps (interface) [lines 374-378] [1 members] [category: Prop types] — Props for a semantic container that groups the functional components…
  InternalCircuitProps.children (property)
JlcpcbAutocompleteStringPath (type) [lines 380-381] [category: Prop types]
KicadAt (interface) [lines 383-391] [3 members] [category: Prop types] — Required x, y
  KicadAt.x (property)
  KicadAt.y (property)
  KicadAt.rotation (property)
KicadAutocompleteStringPath (type) [lines 393-394] [category: Prop types]
KicadEffects (interface) [lines 396-399] [1 members] [category: Prop types]
  KicadEffects.font (property)
KicadFont (interface) [lines 401-406] [2 members] [category: Prop types]
  KicadFont.size (property)
  KicadFont.thickness (property)
KicadFootprintAttributes (interface) [lines 408-417] [4 members] [category: Prop types]
  KicadFootprintAttributes.through_hole (property)
  KicadFootprintAttributes.smd (property)
  KicadFootprintAttributes.exclude_from_pos_files (property)
  KicadFootprintAttributes.exclude_from_bom (property)
KicadFootprintMetadata (interface) [lines 419-440] [10 members] [category: Prop types]
  KicadFootprintMetadata.footprintName (property)
  KicadFootprintMetadata.version (property)
  KicadFootprintMetadata.generator (property)
  KicadFootprintMetadata.generatorVersion (property)
  KicadFootprintMetadata.layer (property)
  KicadFootprintMetadata.properties (property)
  KicadFootprintMetadata.attributes (property)
  KicadFootprintMetadata.pads (property)
  KicadFootprintMetadata.embeddedFonts (property)
  KicadFootprintMetadata.model (property)
KicadFootprintModel (interface) [lines 442-452] [4 members] [category: Prop types] — Required path
  KicadFootprintModel.path (property)
  KicadFootprintModel.offset (property)
  KicadFootprintModel.scale (property)
  KicadFootprintModel.rotate (property)
KicadFootprintPad (interface) [lines 454-474] [9 members] [category: Prop types] — Required name, type
  KicadFootprintPad.name (property)
  KicadFootprintPad.type (property)
  KicadFootprintPad.shape (property)
  KicadFootprintPad.at (property)
  KicadFootprintPad.size (property)
  KicadFootprintPad.drill (property)
  KicadFootprintPad.layers (property)
  KicadFootprintPad.removeUnusedLayers (property)
  KicadFootprintPad.uuid (property)
KicadFootprintProperties (interface) [lines 476-485] [4 members] [category: Prop types]
  KicadFootprintProperties.Reference (property)
  KicadFootprintProperties.Value (property)
  KicadFootprintProperties.Datasheet (property)
  KicadFootprintProperties.Description (property)
KicadProperty (interface) [lines 487-501] [6 members] [category: Prop types] — Required value
  KicadProperty.value (property)
  KicadProperty.at (property)
  KicadProperty.layer (property)
  KicadProperty.uuid (property)
  KicadProperty.hide (property)
  KicadProperty.effects (property)
KicadSymbolEffects (interface) [lines 503-510] [3 members] [category: Prop types]
  KicadSymbolEffects.font (property)
  KicadSymbolEffects.justify (property)
  KicadSymbolEffects.hide (property)
KicadSymbolMetadata (interface) [lines 512-531] [9 members] [category: Prop types]
  KicadSymbolMetadata.symbolName (property)
  KicadSymbolMetadata.extends (property)
  KicadSymbolMetadata.pinNumbers (property)
  KicadSymbolMetadata.pinNames (property)
  KicadSymbolMetadata.excludeFromSim (property)
  KicadSymbolMetadata.inBom (property)
  KicadSymbolMetadata.onBoard (property)
  KicadSymbolMetadata.properties (property)
  KicadSymbolMetadata.embeddedFonts (property)
KicadSymbolPinNames (interface) [lines 533-538] [2 members] [category: Prop types]
  KicadSymbolPinNames.offset (property)
  KicadSymbolPinNames.hide (property)
KicadSymbolPinNumbers (interface) [lines 540-543] [1 members] [category: Prop types]
  KicadSymbolPinNumbers.hide (property)
KicadSymbolProperties (interface) [lines 545-560] [7 members] [category: Prop types]
  KicadSymbolProperties.Reference (property)
  KicadSymbolProperties.Value (property)
  KicadSymbolProperties.Footprint (property)
  KicadSymbolProperties.Datasheet (property)
  KicadSymbolProperties.Description (property)
  KicadSymbolProperties.ki_keywords (property)
  KicadSymbolProperties.ki_fp_filters (property)
KicadSymbolProperty (interface) [lines 562-572] [4 members] [category: Prop types] — Required value
  KicadSymbolProperty.value (property)
  KicadSymbolProperty.id (property)
  KicadSymbolProperty.at (property)
  KicadSymbolProperty.effects (property)
LayoutConfig (interface) [lines 574-639] [32 members] [category: Prop types]
  LayoutConfig.layoutMode (property)
  LayoutConfig.position (property)
  LayoutConfig.grid (property)
  LayoutConfig.gridCols (property)
  LayoutConfig.gridRows (property)
  LayoutConfig.gridTemplateRows (property)
  LayoutConfig.gridTemplateColumns (property)
  LayoutConfig.gridTemplate (property)
  LayoutConfig.gridGap (property)
  LayoutConfig.gridRowGap (property)
  LayoutConfig.gridColumnGap (property)
  LayoutConfig.flex (property)
  LayoutConfig.flexDirection (property)
  LayoutConfig.alignItems (property)
  LayoutConfig.justifyContent (property)
  LayoutConfig.flexRow (property)
  LayoutConfig.flexColumn (property)
  LayoutConfig.gap (property)
  LayoutConfig.pack (property)
  LayoutConfig.packOrderStrategy (property)
  LayoutConfig.packPlacementStrategy (property)
  LayoutConfig.padding (property)
  LayoutConfig.paddingLeft (property)
  LayoutConfig.paddingRight (property)
  LayoutConfig.paddingTop (property)
  LayoutConfig.paddingBottom (property)
  LayoutConfig.paddingX (property)
  LayoutConfig.paddingY (property)
  LayoutConfig.width (property)
  LayoutConfig.height (property)
  LayoutConfig.matchAdapt (property)
  LayoutConfig.matchAdaptTemplate (property)
ManualEditsFileInput (type) [lines 641-642] [category: Prop types]
MaybePromise<T> (type) [lines 644-645] [category: Prop types]
MosfetPinLabels (type) [lines 647-648] [category: Prop types]
NinePointAnchor (type) [lines 650-651] [category: Prop types]
OpAmpPinLabels (type) [lines 653-655] [category: Prop types] — Pin labels for an op-amp component
PcbOrientation (type) [lines 657-658] [category: Prop types]
PcbPath (type) [lines 660-661] [category: Prop types]
PcbPathPoint (interface) [lines 663-670] [3 members] [category: Prop types]
  PcbPathPoint.via (property)
  PcbPathPoint.fromLayer (property)
  PcbPathPoint.toLayer (property)
PcbPositionMode (type) [lines 672-673] [category: Prop types]
PcbRouteCache (interface) [lines 675-681] [2 members] [category: Prop types] — Required pcbTraces, cacheKey
  PcbRouteCache.pcbTraces (property)
  PcbRouteCache.cacheKey (property)
PcbStyle (interface) [lines 683-694] [5 members] [category: Prop types]
  PcbStyle.silkscreenFontSize (property)
  PcbStyle.viaPadDiameter (property)
  PcbStyle.viaHoleDiameter (property)
  PcbStyle.silkscreenTextPosition (property)
  PcbStyle.silkscreenTextVisibility (property)
PcbSx (type) [lines 696-697] [category: Prop types]
PcbSxBase (type) [lines 699-700] [category: Prop types]
PcbSxSelector (type) [lines 702-703] [category: Prop types]
PcbSxValue (interface) [lines 705-714] [4 members] [category: Prop types]
  PcbSxValue.fontSize (property)
  PcbSxValue.pcbX (property)
  PcbSxValue.pcbY (property)
  PcbSxValue.visibility (property)
PinAttributeMap (interface) [lines 716-769] [26 members] [category: Prop types]
  PinAttributeMap.capabilities (property)
  PinAttributeMap.activeCapabilities (property)
  PinAttributeMap.activeCapability (property)
  PinAttributeMap.providesPower (property)
  PinAttributeMap.requiresPower (property)
  PinAttributeMap.providesGround (property)
  PinAttributeMap.requiresGround (property)
  PinAttributeMap.providesVoltage (property)
  PinAttributeMap.requiresVoltage (property)
  PinAttributeMap.doNotConnect (property)
  PinAttributeMap.includeInBoardPinout (property)
  PinAttributeMap.highlightColor (property)
  PinAttributeMap.mustBeConnected (property)
  PinAttributeMap.canUseInternalPullup (property)
  PinAttributeMap.isUsingInternalPullup (property)
  PinAttributeMap.needsExternalPullup (property)
  PinAttributeMap.canUseInternalPulldown (property)
  PinAttributeMap.isUsingInternalPulldown (property)
  PinAttributeMap.needsExternalPulldown (property)
  PinAttributeMap.canUseOpenDrain (property)
  PinAttributeMap.isUsingOpenDrain (property)
  PinAttributeMap.canUsePushPull (property)
  PinAttributeMap.isUsingPushPull (property)
  PinAttributeMap.shouldHaveDecouplingCapacitor (property)
  PinAttributeMap.recommendedDecouplingCapacitorCapacitance (property)
  PinAttributeMap.isGpio (property)
PinCapability (type) [lines 771-772] [category: Prop types]
PinCompatibleVariant (interface) [lines 774-779] [2 members] [category: Prop types]
  PinCompatibleVariant.manufacturerPartNumber (property)
  PinCompatibleVariant.supplierPartNumber (property)
PinLabelsProp<PinNumber extends string = string, PinLabel extends string = string> (type) [lines 781-782] [category: Prop types]
PinSideDefinition (interface) [lines 784-790] [2 members] [category: Prop types] — Required pins, direction
  PinSideDefinition.pins (property)
  PinSideDefinition.direction (property)
PinSideDefinitionInput (type) [lines 792-793] [category: Prop types]
PinVariant (type) [lines 795-796] [category: Prop types]
Point (type) [lines 798-799] [category: Prop types]
PortHints (type) [lines 801-802] [category: Prop types]
PotentiometerPinLabels (type) [lines 804-805] [category: Prop types]
PotentiometerPinVariant (type) [lines 807-808] [category: Prop types]
ResistorPinLabels (type) [lines 810-811] [category: Prop types]
ResonatorPinVariant (type) [lines 813-814] [category: Prop types]
SchematicOrientation (type) [lines 816-817] [category: Prop types]
SchematicPinArrangement (type) [lines 819-820] [category: Prop types]
SchematicPinLabel (type) [lines 822-823] [category: Prop types]
SchematicPinStyle (type) [lines 825-826] [category: Prop types]
SchematicPortArrangement (interface) [lines 828-829] [category: Prop types]
SchematicPortArrangementWithPinCounts (interface) [lines 831-841] [4 members] [category: Prop types] — Specifies the number of pins on each side of the…
  SchematicPortArrangementWithPinCounts.leftPinCount (property)
  SchematicPortArrangementWithPinCounts.topPinCount (property)
  SchematicPortArrangementWithPinCounts.rightPinCount (property)
  SchematicPortArrangementWithPinCounts.bottomPinCount (property)
SchematicPortArrangementWithSides (interface) [lines 843-852] [4 members] [category: Prop types]
  SchematicPortArrangementWithSides.leftSide (property)
  SchematicPortArrangementWithSides.topSide (property)
  SchematicPortArrangementWithSides.rightSide (property)
  SchematicPortArrangementWithSides.bottomSide (property)
SchematicPortArrangementWithSizes (interface) [lines 854-863] [4 members] [category: Prop types]
  SchematicPortArrangementWithSizes.leftSize (property)
  SchematicPortArrangementWithSizes.topSize (property)
  SchematicPortArrangementWithSizes.rightSize (property)
  SchematicPortArrangementWithSizes.bottomSize (property)
SchematicSheetSize (type) [lines 865-866] [category: Prop types]
SchematicSymbolSize (type) [lines 868-869] [category: Prop types]
SchStyle (interface) [lines 871-876] [2 members] [category: Prop types]
  SchStyle.defaultPassiveSize (property)
  SchStyle.defaultCapacitorOrientation (property)
SelectionResult (type) [lines 878-879] [category: Prop types]
SelectionResultComponent (interface) [lines 881-891] [4 members] [category: Prop types] — Required getPort, getPorts, getPcbComponent, getSourceComponent
  SelectionResultComponent.getPort (property)
  SelectionResultComponent.getPorts (property)
  SelectionResultComponent.getPcbComponent (property)
  SelectionResultComponent.getSourceComponent (property)
SelectionResultNet (interface) [lines 893-897] [1 members] [category: Prop types] — Required getSourceNet
  SelectionResultNet.getSourceNet (property)
SelectionResultPort (interface) [lines 899-905] [2 members] [category: Prop types] — Required getPcbPort, getSourcePort
  SelectionResultPort.getPcbPort (property)
  SelectionResultPort.getSourcePort (property)
SpiceModelElement (type) [lines 907-908] [category: Prop types]
SpiceModelProps (interface) [lines 910-916] [2 members] [category: Prop types] — Required source
  SpiceModelProps.source (property)
  SpiceModelProps.spicePinMapping (property)
SpiceOptions (interface) [lines 918-927] [4 members] [category: Prop types]
  SpiceOptions.method (property)
  SpiceOptions.reltol (property)
  SpiceOptions.abstol (property)
  SpiceOptions.vntol (property)
SupplierName (type) [lines 929-930] [category: Prop types]
SupplierPartNumbers (type) [lines 932-933] [category: Prop types]
SymbolProp (type) [lines 935-936] [category: Prop types]
TestpointConnections (type) [lines 938-939] [category: Prop types]
VoltageSourcePinLabels (type) [lines 941-942] [category: Prop types]
WaveShape (type) [lines 944-945] [category: Prop types]

## Footprint strings — `api-footprint-strings.md`

footprint strings (type) [lines 5-215] [104 members] [category: Footprint strings] — Valid footprint functions — a footprint string is a function…
  footprint strings.dip (property)
  footprint strings.dpak (property)
  footprint strings.d2pak (property)
  footprint strings.to252 (property)
  footprint strings.to263 (property)
  footprint strings.cap (property)
  footprint strings.crystal (property)
  footprint strings.res (property)
  footprint strings.diode (property)
  footprint strings.led (property)
  footprint strings.led2835 (property)
  footprint strings.led5050 (property)
  footprint strings.lr (property)
  footprint strings.qfp (property)
  footprint strings.quad (property)
  footprint strings.bga (property)
  footprint strings.qfn (property)
  footprint strings.tqfp (property)
  footprint strings.soic (property)
  footprint strings.mlp (property)
  footprint strings.ssop (property)
  footprint strings.tssop (property)
  footprint strings.dfn (property)
  footprint strings.pinrow (property)
  footprint strings.headermodule (property)
  footprint strings.smdpinheader (property)
  footprint strings.axial (property)
  footprint strings.radial (property)
  footprint strings.rj45 (property)
  footprint strings.hc49 (property)
  footprint strings.to220 (property)
  footprint strings.to220f (property)
  footprint strings.sot363 (property)
  footprint strings.sot886 (property)
  footprint strings.sot457 (property)
  footprint strings.sot563 (property)
  footprint strings.sot723 (property)
  footprint strings.sot23 (property)
  footprint strings.sot25 (property)
  footprint strings.sot (property)
  footprint strings.sot143 (property)
  footprint strings.sot323 (property)
  footprint strings.sot89 (property)
  footprint strings.sot343 (property)
  footprint strings.sod323w (property)
  footprint strings.smc (property)
  footprint strings.minimelf (property)
  footprint strings.melf (property)
  footprint strings.jst (property)
  footprint strings.micromelf (property)
  footprint strings.ms013 (property)
  footprint strings.ms012 (property)
  footprint strings.lqfp (property)
  footprint strings.lga (property)
  footprint strings.sma (property)
  footprint strings.smf (property)
  footprint strings.smb (property)
  footprint strings.smbf (property)
  footprint strings.potentiometer (property)
  footprint strings.electrolytic (property)
  footprint strings.sod923 (property)
  footprint strings.sod323 (property)
  footprint strings.sod80 (property)
  footprint strings.sod882 (property)
  footprint strings.sod882d (property)
  footprint strings.sod723 (property)
  footprint strings.sod523 (property)
  footprint strings.sod323f (property)
  footprint strings.sod323fl (property)
  footprint strings.sod128 (property)
  footprint strings.sod123f (property)
  footprint strings.sod123fl (property)
  footprint strings.sod123 (property)
  footprint strings.sod123w (property)
  footprint strings.sod110 (property)
  footprint strings.to92 (property)
  footprint strings.to92s (property)
  footprint strings.to92l (property)
  footprint strings.sot223 (property)
  footprint strings.m2host (property)
  footprint strings.son (property)
  footprint strings.vson (property)
  footprint strings.wson (property)
  footprint strings.vssop (property)
  footprint strings.msop (property)
  footprint strings.sot23w (property)
  footprint strings.pushbutton (property)
  footprint strings.smdpushbutton (property)
  footprint strings.smdslideswitch (property)
  footprint strings.fpc (property)
  footprint strings.stampboard (property)
  footprint strings.stampreceiver (property)
  footprint strings.breakoutheaders (property)
  footprint strings.smtpad (property)
  footprint strings.platedhole (property)
  footprint strings.smdpads (property)
  footprint strings.pad (property)
  footprint strings.solderjumper (property)
  footprint strings.usbcmidmount (property)
  footprint strings.params (property)
  footprint strings.soup (property)
  footprint strings.circuitJson (property)
  footprint strings.json (property)
  footprint strings.getFootprintNames (property)

## Helpers — `api-helpers.md`

sel (function) [lines 5-8] [category: Helpers] — Typed selector builder — sel.U1.VCC is ".U1 > .VCC", sel.net.GND…
useChip (function) [lines 10-12] [category: Helpers]
useResistor (function) [lines 14-16] [category: Helpers]
useCapacitor (function) [lines 18-20] [category: Helpers]
useDiode (function) [lines 22-24] [category: Helpers]
createUseComponent (function) [lines 26-29] [category: Helpers]
