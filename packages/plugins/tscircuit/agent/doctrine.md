## Contract

1. Author `main.tsx` (or `.jsx`) and `export default` one board component. Extra components may live in project-local `.tsx` files and be imported relatively.
2. Write plain tscircuit TSX. `React` is a global in the render worker, so `import React from 'react'` is optional; `import { ... } from 'tscircuit'` or `@tscircuit/core` is available when helpers are needed.
3. Use intrinsic elements: `<board>`, `<resistor>`, `<capacitor>`, `<led>`, `<diode>`, `<chip>`, `<pinheader>`, `<trace>`, `<net>`, `<group>`. Give every component a unique `name`.
4. Set `footprint` as a footprinter string such as `"0402"`, `"0603"`, `"soic8"`, `"dip8"`, `"tssop16"`; place with `pcbX`/`pcbY` in millimetres and `schX`/`schY` for the schematic.
5. Wire with `<trace from=".R1 > .pin1" to=".U1 > .VCC" />` selectors or `<net name="GND" />` plus `connections` on a `<chip>`. Prefer named nets for power and ground.
6. Optional parameters: export `defaultParameters` (a plain object); Tau passes edited values as component props.
7. Rendering is offline. The local autorouter runs in the worker; no parts engine. `http(s)://` footprint and `cadModel` URLs are never fetched (each attempt becomes a warning issue), and `kicad:`/`jlcpcb:` references produce a warning and an unplaced part — use footprinter strings instead.
8. The `output` render option selects the artifact: `3d` (GLB board, default), `schematic` or `pcb` (SVG). Exports: `glb`, `csv` (BOM), `txt` (readable netlist), `json` (circuit JSON).

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
