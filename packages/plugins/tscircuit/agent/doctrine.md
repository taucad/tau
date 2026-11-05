## Contract

1. Author `main.tsx` (or `.jsx`) and `export default` one board component. Helper components may live in local `.tsx` files imported relatively.
2. `React` is a global, so importing it is optional; `tscircuit` and `@tscircuit/core` both resolve to the core exports (`sel`, `useResistor`, …).
3. Elements are lower-case JSX tags: `<board>`, `<resistor>`, `<capacitor>`, `<led>`, `<diode>`, `<chip>`, `<pinheader>`, `<trace>`, `<net>`, `<group>`. Give every component a unique `name`.
4. `footprint` is a footprinter string (`0402`, `0805`, `soic8`, `dip8`, `tssop16`, `pinrow4_p2.54mm`, `axial_p10mm`, `radial_p5mm`, `to220_3`) or a `kicad:` footprint. Place with `pcbX`/`pcbY` (mm) and `schX`/`schY`.
5. Wire with `<trace from='.R1 > .pin1' to='.U1 > .VCC' />`, `to='net.GND'`, or `connections` on a part. Selectors name a pin by its label or `pinN`. Prefer named nets for power and ground.
6. Parameters: export `defaultParameters` (a plain object); Tau passes edited values as props.
7. Rendering and routing are offline by default. URL footprints and CAD models are never fetched and `jlcpcb:` parts remain unplaced. `kicad:` footprints in Tau's bundled KiCad pack render offline with their real KiCad 3D body (see Real parts); other `kicad:` names stay unplaced unless the kernel option `parts` is `'online'`, which loads them from tscircuit's part hosts.
8. Views: `board` (3D GLB, default), `schematic` (SVG sheets; `theme` option `light`, `dark` or `engineering`), `pcb` (SVG; `pinNumbers`, and `palette` option `fabrication` or `engineering`). `screenshot.view` selects one, `screenshot.instance` a sheet. Export IDs for `export_model.to`: `board` (`glb`), `bom` (`csv`), `netlist` (`txt`), `circuit` (`json`).

## Real parts

Write `kicad:<Library>/<Footprint>` for a part with a real body. The bundled pack holds:

- Passives: `kicad:Resistor_SMD/R_0402_1005Metric`, `R_0603_1608Metric`, `R_0805_2012Metric`; `kicad:Capacitor_SMD/C_0402_1005Metric`, `C_0603_1608Metric`, `C_0805_2012Metric`, `C_1210_3225Metric`.
- ICs: `kicad:Package_SO/SOIC-8_3.9x4.9mm_P1.27mm` (also used for `soic8`), `kicad:Package_SON/WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm`, `kicad:Package_TO_SOT_SMD/SOT-23-5`, `kicad:Package_DFN_QFN/QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm`.
- Diodes, inductors, crystals, switches: `kicad:Diode_SMD/D_SMA` (also `sma`), `kicad:Diode_SMD/D_SOD-123` (also `sod123`), `kicad:Inductor_SMD/L_Coilcraft_XAL7070-XXX`, `kicad:Crystal/Crystal_SMD_3225-4Pin_3.2x2.5mm`, `kicad:Button_Switch_SMD/SW_SPST_PTS810`.
- Connectors: `kicad:Connector_USB/USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal`, `kicad:Connector_JST/JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal`, `kicad:TerminalBlock_Phoenix/TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal`.

A `kicad:` footprint's pads are `pin1`, `pin2`, … in KiCad pad order; map them with `pinLabels`. Diodes are `pin1` cathode and `pin2` anode; the 4-pin crystal is `pin1` to `pin4`; mounting and shield pads are extra pins (`pin17` on the USB-C receptacle). Use `<connector>` or `<chip>` for connectors and terminal blocks. Footprinter passives keep their own bodies. A custom `<footprint>` has no 3D body, so prefer a pack footprint when one fits.

## Layout and looks

- Set `solderMaskColor` (`green`, `blue`, `red`, `black`, `white`, `purple`, `yellow` or a CSS colour) and optionally `silkscreenColor` on `<board>`; the 3D board and the `pcb` view's fabrication palette both use them.
- Size the board for the parts' courtyards. Overlapping courtyards fail placement DRC, which skips autorouting and leaves every trace open. Keep `placementDrcChecksDisabled` for intended same-net pad overlaps, such as a USB-C receptacle's stacked VBUS and GND pads, and say why in a comment.
- Place decoupling capacitors beside their supply pins and use named nets; dense boards autoroute slowly, and a board with dozens of nets can take minutes. Route power with a `<net>` `nominalTraceWidth`, and pour ground with `<copperpour layer='bottom' connectsTo='net.GND' />`.
- Use `<schematicsheet>` only for designs split across sheets; a single sheet frames and shrinks the drawing.

## Check a board

1. After edits, call `evaluate_model` and read every issue; `ready` may still carry errors. Fix the first error before its consequences, then open pins, routing and placement.
2. Capture `schematic` and `pcb` separately, at most twice each per inspection cycle; use `board` for mechanical fit. In each capture, check that no part sits off the board or on another part, no pad shows an open ratsnest line, silkscreen labels do not cover pads, and schematic labels are readable.
3. For parts and open pins, prefer `netlist` and `bom` exports to circuit JSON: call `export_model`, then `read_file` on its artifact path and check its `sourceRevision`. Binary exports still need a user request.

## Wrong / Correct

- Wrong: `schPinArrangement={{ leftSide: { pins: ['IN'] } }}` (invalid props, chip not created). Correct: `leftSide: ['IN', 'GND']`, `{ pins: [...], direction: 'top-to-bottom' }` or `leftPinCount: 2`.
- Wrong: `cadModel='to220_5'` (throws `String cadModel not yet implemented`). Correct: omit `cadModel`; a footprinter or pack `kicad:` `footprint` already has a 3D body, and `cadModel={null}` hides it.
- Wrong: `footprint='kicad:Package_SO/SOIC-14_3.9x8.7mm_P1.27mm'` offline (not in the pack; the part stays unplaced). Correct: a pack footprint or a footprinter string such as `soic14`, or ask for the `parts: 'online'` option.
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
