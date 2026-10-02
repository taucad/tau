---
name: cad-tscircuit
description: Guides tscircuit TSX electronics authoring in main.tsx. Use when creating or editing boards, schematics or PCB layouts in Tau.
---

# tscircuit TSX authoring

## Contract

1. Author `main.tsx` (or `.jsx`) and `export default` one board component. Extra components may live in project-local `.tsx` files and be imported relatively.
2. Write plain tscircuit TSX. `React` is a global in the render worker, so `import React from 'react'` is optional; `import { ... } from 'tscircuit'` or `@tscircuit/core` is available when helpers are needed.
3. Use intrinsic elements: `<board>`, `<resistor>`, `<capacitor>`, `<led>`, `<diode>`, `<chip>`, `<pinheader>`, `<trace>`, `<net>`, `<group>`. Give every component a unique `name`.
4. Set `footprint` as a footprinter string such as `"0402"`, `"0603"`, `"soic8"`, `"dip8"`, `"tssop16"`; place with `pcbX`/`pcbY` in millimetres and `schX`/`schY` for the schematic.
5. Wire with `<trace from=".R1 > .pin1" to=".U1 > .VCC" />` selectors or `<net name="GND" />` plus `connections` on a `<chip>`. Prefer named nets for power and ground.
6. Optional parameters: export `defaultParameters` (a plain object); Tau passes edited values as component props.
7. Rendering and routing are offline. URL-based footprints/CAD models are never fetched; `kicad:`/`jlcpcb:` parts remain unplaced. Use footprinter strings.
8. Views: `board` (3D GLB, default), `schematic` (SVG sheets), `pcb` (SVG, `pinNumbers` option). Select with `screenshot.view` and a sheet with `screenshot.instance`; no `output` option. Export IDs: `board` (`glb`), `bom` (`csv`), `netlist` (`txt`), `circuit` (`json`). Use ID or unambiguous extension as `export_model.to`.

## Check a board

1. After edits, call `evaluate_model` and read every issue. `ready` may still carry error-severity findings. Fix open pins, routing and placement before calling the board clean. Request `includeCapabilities` for options.
2. Capture `schematic` and `pcb` separately; a sheet is an instance, not a camera angle. Limit each view to two captures per inspection cycle. Use `board` for mechanical fit.
3. For parts/open pins, prefer `netlist` (`txt`) and `bom` (`csv`) to large circuit JSON. Where the export-evidence gate permits text, call `export_model`, then `read_file` on its artifact path; compare `sourceRevision` with current source. Binary/mixed outputs still require a user export request.

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
    <trace from='.U1 > .OUT' to='.R1 > .pin1' />
    <trace from='.R1 > .pin2' to='.LED1 > .anode' />
    <trace from='.LED1 > .cathode' to='net.GND' />
  </board>
);
```

Keep boards small and explicit: fixed `width`/`height`, every part placed, every pin connected through a trace or a net. Unrouted or overlapping parts appear as kernel warnings; fix placement before adding parts.
