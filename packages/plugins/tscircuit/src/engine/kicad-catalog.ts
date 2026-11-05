/**
 * The KiCad pack's catalogue: which footprints it carries and which footprinter strings use them.
 *
 * It lives in the lazily loaded engine so the toolkit stays small; `#kicad-pack.js` loads it on the
 * first lookup. Asset URLs are relative to this module, which sits beside `assets/` both in `src/`
 * and in `dist/`. `build-kicad-pack.ts` builds the assets from these entries.
 */
import type { KicadPackEntry } from '#kicad-pack.js';

/**
 * Every footprint in the pack: common passives, LEDs, diodes, transistor and regulator packages,
 * ICs (SOIC, TSSOP, MSOP, QFN, QFP, DIP), headers and connectors, crystals, switches, inductors and
 * modules. `kicad-pack.test.ts` checks every footprinter mapping against the KiCad pads.
 * @public
 */
export const kicadCatalog: readonly KicadPackEntry[] = [
  {
    name: 'Resistor_SMD/R_0201_0603Metric',
    footprinters: [{ string: 'res0201' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_0201_0603Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_0201_0603Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_0402_1005Metric',
    footprinters: [{ string: 'res0402' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_0402_1005Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_0402_1005Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_0603_1608Metric',
    footprinters: [{ string: 'res0603' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_0603_1608Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_0603_1608Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_0805_2012Metric',
    footprinters: [{ string: 'res0805' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_0805_2012Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_0805_2012Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_1206_3216Metric',
    footprinters: [{ string: 'res1206' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_1206_3216Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_1206_3216Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_1210_3225Metric',
    footprinters: [{ string: 'res1210' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_1210_3225Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_1210_3225Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_2010_5025Metric',
    footprinters: [{ string: 'res2010' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_2010_5025Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_2010_5025Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_2512_6332Metric',
    footprinters: [{ string: 'res2512' }],
    footprint: new URL('../assets/kicad/Resistor_SMD_R_2512_6332Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Resistor_SMD_R_2512_6332Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_0201_0603Metric',
    footprinters: [{ string: 'cap0201' }],
    footprint: new URL('../assets/kicad/Capacitor_SMD_C_0201_0603Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_C_0201_0603Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_0402_1005Metric',
    footprinters: [{ string: 'cap0402' }],
    footprint: new URL('../assets/kicad/Capacitor_SMD_C_0402_1005Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_C_0402_1005Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_0603_1608Metric',
    footprinters: [{ string: 'cap0603' }],
    footprint: new URL('../assets/kicad/Capacitor_SMD_C_0603_1608Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_C_0603_1608Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_0805_2012Metric',
    footprinters: [{ string: 'cap0805' }],
    footprint: new URL('../assets/kicad/Capacitor_SMD_C_0805_2012Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_C_0805_2012Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_1206_3216Metric',
    footprinters: [{ string: 'cap1206' }],
    footprint: new URL('../assets/kicad/Capacitor_SMD_C_1206_3216Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_C_1206_3216Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_1210_3225Metric',
    footprinters: [{ string: 'cap1210' }],
    footprint: new URL('../assets/kicad/Capacitor_SMD_C_1210_3225Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_C_1210_3225Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_1812_4532Metric',
    footprinters: [{ string: '1812', ftype: 'simple_capacitor' }],
    footprint: new URL('../assets/kicad/Capacitor_SMD_C_1812_4532Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_C_1812_4532Metric.glb', import.meta.url),
  },
  {
    name: 'Inductor_SMD/L_0402_1005Metric',
    footprinters: [{ string: '0402', ftype: 'simple_inductor' }],
    footprint: new URL('../assets/kicad/Inductor_SMD_L_0402_1005Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Inductor_SMD_L_0402_1005Metric.glb', import.meta.url),
  },
  {
    name: 'Inductor_SMD/L_0603_1608Metric',
    footprinters: [{ string: '0603', ftype: 'simple_inductor' }],
    footprint: new URL('../assets/kicad/Inductor_SMD_L_0603_1608Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Inductor_SMD_L_0603_1608Metric.glb', import.meta.url),
  },
  {
    name: 'Inductor_SMD/L_0805_2012Metric',
    footprinters: [{ string: '0805', ftype: 'simple_inductor' }],
    footprint: new URL('../assets/kicad/Inductor_SMD_L_0805_2012Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Inductor_SMD_L_0805_2012Metric.glb', import.meta.url),
  },
  {
    name: 'Inductor_SMD/L_1206_3216Metric',
    footprinters: [{ string: '1206', ftype: 'simple_inductor' }],
    footprint: new URL('../assets/kicad/Inductor_SMD_L_1206_3216Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Inductor_SMD_L_1206_3216Metric.glb', import.meta.url),
  },
  {
    name: 'LED_SMD/LED_0402_1005Metric',
    footprinters: [{ string: '0402', ftype: 'simple_led' }],
    footprint: new URL('../assets/kicad/LED_SMD_LED_0402_1005Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/LED_SMD_LED_0402_1005Metric.glb', import.meta.url),
  },
  {
    name: 'LED_SMD/LED_0603_1608Metric',
    footprinters: [{ string: '0603', ftype: 'simple_led' }],
    footprint: new URL('../assets/kicad/LED_SMD_LED_0603_1608Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/LED_SMD_LED_0603_1608Metric.glb', import.meta.url),
  },
  {
    name: 'LED_SMD/LED_0805_2012Metric',
    footprinters: [{ string: '0805', ftype: 'simple_led' }],
    footprint: new URL('../assets/kicad/LED_SMD_LED_0805_2012Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/LED_SMD_LED_0805_2012Metric.glb', import.meta.url),
  },
  {
    name: 'LED_SMD/LED_1206_3216Metric',
    footprinters: [{ string: '1206', ftype: 'simple_led' }],
    footprint: new URL('../assets/kicad/LED_SMD_LED_1206_3216Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/LED_SMD_LED_1206_3216Metric.glb', import.meta.url),
  },
  {
    name: 'LED_SMD/LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/LED_SMD_LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/LED_SMD_LED_WS2812B_PLCC4_5.0x5.0mm_P3.2mm.glb', import.meta.url),
  },
  {
    name: 'LED_THT/LED_D3.0mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/LED_THT_LED_D3.0mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/LED_THT_LED_D3.0mm.glb', import.meta.url),
  },
  {
    name: 'LED_THT/LED_D5.0mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/LED_THT_LED_D5.0mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/LED_THT_LED_D5.0mm.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SOD-123',
    footprinters: [{ string: 'sod123' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_SOD-123.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_SOD-123.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SOD-123F',
    footprinters: [{ string: 'sod123f' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_SOD-123F.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_SOD-123F.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SOD-323',
    footprinters: [{ string: 'sod323' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_SOD-323.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_SOD-323.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SOD-523',
    footprinters: [{ string: 'sod523' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_SOD-523.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_SOD-523.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SMA',
    footprinters: [{ string: 'sma' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_SMA.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_SMA.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SMB',
    footprinters: [{ string: 'smb' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_SMB.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_SMB.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SMC',
    footprinters: [{ string: 'smc' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_SMC.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_SMC.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_MiniMELF',
    footprinters: [{ string: 'minimelf' }],
    footprint: new URL('../assets/kicad/Diode_SMD_D_MiniMELF.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_SMD_D_MiniMELF.glb', import.meta.url),
  },
  {
    name: 'Diode_THT/D_DO-41_SOD81_P10.16mm_Horizontal',
    footprinters: [],
    footprint: new URL('../assets/kicad/Diode_THT_D_DO-41_SOD81_P10.16mm_Horizontal.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Diode_THT_D_DO-41_SOD81_P10.16mm_Horizontal.glb', import.meta.url),
  },
  {
    name: 'Fuse/Fuse_1206_3216Metric',
    footprinters: [],
    footprint: new URL('../assets/kicad/Fuse_Fuse_1206_3216Metric.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Fuse_Fuse_1206_3216Metric.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-23',
    footprinters: [{ string: 'sot23' }],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-23.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-23.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-23-5',
    footprinters: [{ string: 'sot23_5' }, { string: 'sot25' }],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-23-5.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-23-5.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-23-6',
    footprinters: [{ string: 'sot23_6' }, { string: 'sot457' }],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-23-6.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-23-6.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-323_SC-70',
    footprinters: [{ string: 'sot323' }],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-323_SC-70.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-323_SC-70.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-363_SC-70-6',
    footprinters: [{ string: 'sot363' }],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-363_SC-70-6.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-363_SC-70-6.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-89-3',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-89-3.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-89-3.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-223',
    footprinters: [{ string: 'sot223' }],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-223.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_SOT-223.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/TO-252-2',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_TO-252-2.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_TO-252-2.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/TO-263-2',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_TO_SOT_SMD_TO-263-2.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_SMD_TO-263-2.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_THT/TO-92_Inline',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_TO_SOT_THT_TO-92_Inline.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_THT_TO-92_Inline.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_THT/TO-220-3_Vertical',
    footprinters: [{ string: 'to220' }],
    footprint: new URL('../assets/kicad/Package_TO_SOT_THT_TO-220-3_Vertical.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_TO_SOT_THT_TO-220-3_Vertical.glb', import.meta.url),
  },
  {
    name: 'Package_SO/SOIC-8_3.9x4.9mm_P1.27mm',
    footprinters: [{ string: 'soic8' }],
    footprint: new URL('../assets/kicad/Package_SO_SOIC-8_3.9x4.9mm_P1.27mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_SOIC-8_3.9x4.9mm_P1.27mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/SOIC-14_3.9x8.7mm_P1.27mm',
    footprinters: [{ string: 'soic14' }],
    footprint: new URL('../assets/kicad/Package_SO_SOIC-14_3.9x8.7mm_P1.27mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_SOIC-14_3.9x8.7mm_P1.27mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/SOIC-16_3.9x9.9mm_P1.27mm',
    footprinters: [{ string: 'soic16' }],
    footprint: new URL('../assets/kicad/Package_SO_SOIC-16_3.9x9.9mm_P1.27mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_SOIC-16_3.9x9.9mm_P1.27mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/TSSOP-8_4.4x3mm_P0.65mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_SO_TSSOP-8_4.4x3mm_P0.65mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_TSSOP-8_4.4x3mm_P0.65mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/TSSOP-14_4.4x5mm_P0.65mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_SO_TSSOP-14_4.4x5mm_P0.65mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_TSSOP-14_4.4x5mm_P0.65mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/TSSOP-16_4.4x5mm_P0.65mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_SO_TSSOP-16_4.4x5mm_P0.65mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_TSSOP-16_4.4x5mm_P0.65mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/TSSOP-20_4.4x6.5mm_P0.65mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_SO_TSSOP-20_4.4x6.5mm_P0.65mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_TSSOP-20_4.4x6.5mm_P0.65mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/MSOP-8_3x3mm_P0.65mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_SO_MSOP-8_3x3mm_P0.65mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_MSOP-8_3x3mm_P0.65mm.glb', import.meta.url),
  },
  {
    name: 'Package_SO/MSOP-10_3x3mm_P0.5mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_SO_MSOP-10_3x3mm_P0.5mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_SO_MSOP-10_3x3mm_P0.5mm.glb', import.meta.url),
  },
  {
    name: 'Package_SON/WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Package_SON_WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Package_SON_WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm.glb', import.meta.url),
  },
  {
    name: 'Package_DFN_QFN/QFN-16-1EP_3x3mm_P0.5mm_EP1.7x1.7mm',
    footprinters: [{ string: 'qfn16' }],
    footprint: new URL(
      '../assets/kicad/Package_DFN_QFN_QFN-16-1EP_3x3mm_P0.5mm_EP1.7x1.7mm.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Package_DFN_QFN_QFN-16-1EP_3x3mm_P0.5mm_EP1.7x1.7mm.glb', import.meta.url),
  },
  {
    name: 'Package_DFN_QFN/QFN-20-1EP_4x4mm_P0.5mm_EP2.5x2.5mm',
    footprinters: [{ string: 'qfn20' }],
    footprint: new URL(
      '../assets/kicad/Package_DFN_QFN_QFN-20-1EP_4x4mm_P0.5mm_EP2.5x2.5mm.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Package_DFN_QFN_QFN-20-1EP_4x4mm_P0.5mm_EP2.5x2.5mm.glb', import.meta.url),
  },
  {
    name: 'Package_DFN_QFN/QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm',
    footprinters: [{ string: 'qfn24' }],
    footprint: new URL(
      '../assets/kicad/Package_DFN_QFN_QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Package_DFN_QFN_QFN-24-1EP_4x4mm_P0.5mm_EP2.6x2.6mm.glb', import.meta.url),
  },
  {
    name: 'Package_DFN_QFN/QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm',
    footprinters: [{ string: 'qfn32' }],
    footprint: new URL(
      '../assets/kicad/Package_DFN_QFN_QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Package_DFN_QFN_QFN-32-1EP_5x5mm_P0.5mm_EP3.45x3.45mm.glb', import.meta.url),
  },
  {
    name: 'Package_DFN_QFN/QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Package_DFN_QFN_QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Package_DFN_QFN_QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm.glb', import.meta.url),
  },
  {
    name: 'Package_QFP/TQFP-32_7x7mm_P0.8mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_QFP_TQFP-32_7x7mm_P0.8mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_QFP_TQFP-32_7x7mm_P0.8mm.glb', import.meta.url),
  },
  {
    name: 'Package_QFP/TQFP-44_10x10mm_P0.8mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Package_QFP_TQFP-44_10x10mm_P0.8mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_QFP_TQFP-44_10x10mm_P0.8mm.glb', import.meta.url),
  },
  {
    name: 'Package_QFP/LQFP-48_7x7mm_P0.5mm',
    footprinters: [{ string: 'lqfp48' }, { string: 'tqfp48' }],
    footprint: new URL('../assets/kicad/Package_QFP_LQFP-48_7x7mm_P0.5mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_QFP_LQFP-48_7x7mm_P0.5mm.glb', import.meta.url),
  },
  {
    name: 'Package_QFP/LQFP-64_10x10mm_P0.5mm',
    footprinters: [{ string: 'lqfp64' }, { string: 'tqfp64' }],
    footprint: new URL('../assets/kicad/Package_QFP_LQFP-64_10x10mm_P0.5mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_QFP_LQFP-64_10x10mm_P0.5mm.glb', import.meta.url),
  },
  {
    name: 'Package_DIP/DIP-8_W7.62mm',
    footprinters: [{ string: 'dip8' }],
    footprint: new URL('../assets/kicad/Package_DIP_DIP-8_W7.62mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_DIP_DIP-8_W7.62mm.glb', import.meta.url),
  },
  {
    name: 'Package_DIP/DIP-14_W7.62mm',
    footprinters: [{ string: 'dip14' }],
    footprint: new URL('../assets/kicad/Package_DIP_DIP-14_W7.62mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_DIP_DIP-14_W7.62mm.glb', import.meta.url),
  },
  {
    name: 'Package_DIP/DIP-16_W7.62mm',
    footprinters: [{ string: 'dip16' }],
    footprint: new URL('../assets/kicad/Package_DIP_DIP-16_W7.62mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Package_DIP_DIP-16_W7.62mm.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_1x02_P2.54mm_Vertical',
    footprinters: [{ string: 'pinrow2' }, { string: 'pinrow2_nopinlabels' }],
    footprinterRotation: 90,
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x02_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x02_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_1x03_P2.54mm_Vertical',
    footprinters: [{ string: 'pinrow3' }, { string: 'pinrow3_nopinlabels' }],
    footprinterRotation: 90,
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x03_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x03_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_1x04_P2.54mm_Vertical',
    footprinters: [{ string: 'pinrow4' }, { string: 'pinrow4_nopinlabels' }],
    footprinterRotation: 90,
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x04_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x04_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_1x06_P2.54mm_Vertical',
    footprinters: [{ string: 'pinrow6' }, { string: 'pinrow6_nopinlabels' }],
    footprinterRotation: 90,
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x06_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x06_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_1x08_P2.54mm_Vertical',
    footprinters: [{ string: 'pinrow8' }, { string: 'pinrow8_nopinlabels' }],
    footprinterRotation: 90,
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x08_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x08_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_1x10_P2.54mm_Vertical',
    footprinters: [{ string: 'pinrow10' }, { string: 'pinrow10_nopinlabels' }],
    footprinterRotation: 90,
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x10_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_1x10_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_2x05_P2.54mm_Vertical',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_2x05_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_2x05_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_PinHeader_2.54mm/PinHeader_2x10_P2.54mm_Vertical',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_2x10_P2.54mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_PinHeader_2.54mm_PinHeader_2x10_P2.54mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_JST/JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_JST_JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_JST_JST_PH_B2B-PH-K_1x02_P2.00mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_JST/JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_JST_JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_JST_JST_PH_S2B-PH-K_1x02_P2.00mm_Horizontal.glb', import.meta.url),
  },
  {
    name: 'Connector_JST/JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_JST_JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_JST_JST_XH_B2B-XH-A_1x02_P2.50mm_Vertical.glb', import.meta.url),
  },
  {
    name: 'Connector_JST/JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_JST_JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      '../assets/kicad/Connector_JST_JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal.glb',
      import.meta.url,
    ),
  },
  {
    name: 'Connector_JST/JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_JST_JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      '../assets/kicad/Connector_JST_JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal.glb',
      import.meta.url,
    ),
  },
  {
    name: 'Connector_USB/USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_USB_USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      '../assets/kicad/Connector_USB_USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal.glb',
      import.meta.url,
    ),
  },
  {
    name: 'Connector_BarrelJack/BarrelJack_Horizontal',
    footprinters: [],
    footprint: new URL('../assets/kicad/Connector_BarrelJack_BarrelJack_Horizontal.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Connector_BarrelJack_BarrelJack_Horizontal.glb', import.meta.url),
  },
  {
    name: 'Connector_Card/microSD_HC_Hirose_DM3AT-SF-PEJM5',
    footprinters: [],
    footprint: new URL('../assets/kicad/Connector_Card_microSD_HC_Hirose_DM3AT-SF-PEJM5.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Connector_Card_microSD_HC_Hirose_DM3AT-SF-PEJM5.glb', import.meta.url),
  },
  {
    name: 'Connector_Coaxial/U.FL_Hirose_U.FL-R-SMT-1_Vertical',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Connector_Coaxial_U.FL_Hirose_U.FL-R-SMT-1_Vertical.circuit.json',
      import.meta.url,
    ),
    model: new URL('../assets/kicad/Connector_Coaxial_U.FL_Hirose_U.FL-R-SMT-1_Vertical.glb', import.meta.url),
  },
  {
    name: 'TerminalBlock_Phoenix/TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/TerminalBlock_Phoenix_TerminalBlock_Phoenix_MKDS-1_5-2-5.08_1x02_P5.08mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      '../assets/kicad/TerminalBlock_Phoenix_TerminalBlock_Phoenix_MKDS-1_5-2-5.08_1x02_P5.08mm_Horizontal.glb',
      import.meta.url,
    ),
  },
  {
    name: 'TerminalBlock_Phoenix/TerminalBlock_Phoenix_MKDS-1,5-3-5.08_1x03_P5.08mm_Horizontal',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/TerminalBlock_Phoenix_TerminalBlock_Phoenix_MKDS-1_5-3-5.08_1x03_P5.08mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      '../assets/kicad/TerminalBlock_Phoenix_TerminalBlock_Phoenix_MKDS-1_5-3-5.08_1x03_P5.08mm_Horizontal.glb',
      import.meta.url,
    ),
  },
  {
    name: 'Crystal/Crystal_SMD_3225-4Pin_3.2x2.5mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Crystal_Crystal_SMD_3225-4Pin_3.2x2.5mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Crystal_Crystal_SMD_3225-4Pin_3.2x2.5mm.glb', import.meta.url),
  },
  {
    name: 'Crystal/Crystal_SMD_2520-4Pin_2.5x2.0mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Crystal_Crystal_SMD_2520-4Pin_2.5x2.0mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Crystal_Crystal_SMD_2520-4Pin_2.5x2.0mm.glb', import.meta.url),
  },
  {
    name: 'Crystal/Crystal_HC49-U_Vertical',
    footprinters: [{ string: 'hc49' }],
    footprint: new URL('../assets/kicad/Crystal_Crystal_HC49-U_Vertical.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Crystal_Crystal_HC49-U_Vertical.glb', import.meta.url),
  },
  {
    name: 'Button_Switch_SMD/SW_SPST_PTS810',
    footprinters: [],
    footprint: new URL('../assets/kicad/Button_Switch_SMD_SW_SPST_PTS810.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Button_Switch_SMD_SW_SPST_PTS810.glb', import.meta.url),
  },
  {
    name: 'Button_Switch_SMD/SW_SPST_TL3342',
    footprinters: [],
    footprint: new URL('../assets/kicad/Button_Switch_SMD_SW_SPST_TL3342.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Button_Switch_SMD_SW_SPST_TL3342.glb', import.meta.url),
  },
  {
    name: 'Button_Switch_SMD/SW_SPDT_PCM12',
    footprinters: [],
    footprint: new URL('../assets/kicad/Button_Switch_SMD_SW_SPDT_PCM12.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Button_Switch_SMD_SW_SPDT_PCM12.glb', import.meta.url),
  },
  {
    name: 'Button_Switch_THT/SW_PUSH_6mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Button_Switch_THT_SW_PUSH_6mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Button_Switch_THT_SW_PUSH_6mm.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/CP_Elec_6.3x5.4',
    footprinters: [],
    footprint: new URL('../assets/kicad/Capacitor_SMD_CP_Elec_6.3x5.4.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_SMD_CP_Elec_6.3x5.4.glb', import.meta.url),
  },
  {
    name: 'Capacitor_THT/CP_Radial_D5.0mm_P2.00mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Capacitor_THT_CP_Radial_D5.0mm_P2.00mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_THT_CP_Radial_D5.0mm_P2.00mm.glb', import.meta.url),
  },
  {
    name: 'Capacitor_THT/CP_Radial_D8.0mm_P3.50mm',
    footprinters: [],
    footprint: new URL('../assets/kicad/Capacitor_THT_CP_Radial_D8.0mm_P3.50mm.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Capacitor_THT_CP_Radial_D8.0mm_P3.50mm.glb', import.meta.url),
  },
  {
    name: 'Resistor_THT/R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal',
    footprinters: [],
    footprint: new URL(
      '../assets/kicad/Resistor_THT_R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      '../assets/kicad/Resistor_THT_R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal.glb',
      import.meta.url,
    ),
  },
  {
    name: 'Inductor_SMD/L_Coilcraft_XAL7070-XXX',
    footprinters: [],
    footprint: new URL('../assets/kicad/Inductor_SMD_L_Coilcraft_XAL7070-XXX.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Inductor_SMD_L_Coilcraft_XAL7070-XXX.glb', import.meta.url),
  },
  {
    name: 'Inductor_SMD/L_Bourns_SRN6045TA',
    footprinters: [],
    footprint: new URL('../assets/kicad/Inductor_SMD_L_Bourns_SRN6045TA.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Inductor_SMD_L_Bourns_SRN6045TA.glb', import.meta.url),
  },
  {
    name: 'Inductor_SMD/L_Bourns-SRN4018',
    footprinters: [],
    footprint: new URL('../assets/kicad/Inductor_SMD_L_Bourns-SRN4018.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Inductor_SMD_L_Bourns-SRN4018.glb', import.meta.url),
  },
  {
    name: 'Buzzer_Beeper/Buzzer_12x9.5RM7.6',
    footprinters: [],
    footprint: new URL('../assets/kicad/Buzzer_Beeper_Buzzer_12x9.5RM7.6.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/Buzzer_Beeper_Buzzer_12x9.5RM7.6.glb', import.meta.url),
  },
  {
    name: 'RF_Module/ESP32-WROOM-32',
    footprinters: [],
    footprint: new URL('../assets/kicad/RF_Module_ESP32-WROOM-32.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/RF_Module_ESP32-WROOM-32.glb', import.meta.url),
  },
  {
    name: 'RF_Module/ESP32-S3-WROOM-1',
    footprinters: [],
    footprint: new URL('../assets/kicad/RF_Module_ESP32-S3-WROOM-1.circuit.json', import.meta.url),
    model: new URL('../assets/kicad/RF_Module_ESP32-S3-WROOM-1.glb', import.meta.url),
  },
];
