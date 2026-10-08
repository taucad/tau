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
