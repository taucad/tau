/**
 * Tau's local KiCad model pack.
 *
 * A versioned set of KiCad footprints (as circuit JSON) and their 3D models (as GLB), built from
 * the official KiCad libraries by `build-kicad-pack.ts`. It lets `kicad:` footprints and common
 * footprinter strings render with real part bodies while the kernel stays offline. GLBs keep KiCad's
 * native frame (Z-up millimetres, footprint origin), which circuit-json-to-gltf expects.
 *
 * The footprints and models are © KiCad library contributors, CC-BY-SA-4.0 with the KiCad
 * libraries exception (see `licenses/kicad-libraries.md`); boards made with them may use any licence.
 */

/** Bump when entries or tessellation change: it is part of the kernel's cache identity. @public */
export const kicadPackVersion = '2026.11.0';

/** The mirror the pack is built from, and where the online parts mode fetches KiCad footprints. @public */
export const kicadFootprintCacheUrl = 'https://kicad-mod-cache.tscircuit.com';

/** The URL scheme the kernel gives pack models in converter input; the fetch guard serves it. */
export const packModelScheme = 'tau-models:';

/** One footprint in the pack. @public */
export type KicadPackEntry = {
  /** KiCad `Library/Footprint` name, as written after `kicad:` in a `footprint` prop. */
  readonly name: string;
  /** Exact footprinter strings (`cad_component.footprinter_string`) that use this model. */
  readonly footprinterStrings: readonly string[];
  readonly footprint: URL;
  readonly model: URL;
};

/** Every footprint in the pack. @public */
export const kicadPack: readonly KicadPackEntry[] = [
  {
    name: 'Resistor_SMD/R_0402_1005Metric',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Resistor_SMD_R_0402_1005Metric.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Resistor_SMD_R_0402_1005Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_0603_1608Metric',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Resistor_SMD_R_0603_1608Metric.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Resistor_SMD_R_0603_1608Metric.glb', import.meta.url),
  },
  {
    name: 'Resistor_SMD/R_0805_2012Metric',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Resistor_SMD_R_0805_2012Metric.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Resistor_SMD_R_0805_2012Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_0402_1005Metric',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Capacitor_SMD_C_0402_1005Metric.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Capacitor_SMD_C_0402_1005Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_0603_1608Metric',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Capacitor_SMD_C_0603_1608Metric.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Capacitor_SMD_C_0603_1608Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_0805_2012Metric',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Capacitor_SMD_C_0805_2012Metric.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Capacitor_SMD_C_0805_2012Metric.glb', import.meta.url),
  },
  {
    name: 'Capacitor_SMD/C_1210_3225Metric',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Capacitor_SMD_C_1210_3225Metric.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Capacitor_SMD_C_1210_3225Metric.glb', import.meta.url),
  },
  {
    name: 'Package_SO/SOIC-8_3.9x4.9mm_P1.27mm',
    footprinterStrings: ['soic8'],
    footprint: new URL('assets/kicad/Package_SO_SOIC-8_3.9x4.9mm_P1.27mm.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Package_SO_SOIC-8_3.9x4.9mm_P1.27mm.glb', import.meta.url),
  },
  {
    name: 'Package_SON/WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Package_SON_WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Package_SON_WSON-8-1EP_6x5mm_P1.27mm_EP3.4x4.3mm.glb', import.meta.url),
  },
  {
    name: 'Package_TO_SOT_SMD/SOT-23-5',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Package_TO_SOT_SMD_SOT-23-5.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Package_TO_SOT_SMD_SOT-23-5.glb', import.meta.url),
  },
  {
    name: 'Package_DFN_QFN/QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm',
    footprinterStrings: [],
    footprint: new URL(
      'assets/kicad/Package_DFN_QFN_QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm.circuit.json',
      import.meta.url,
    ),
    model: new URL('assets/kicad/Package_DFN_QFN_QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SMA',
    footprinterStrings: ['sma'],
    footprint: new URL('assets/kicad/Diode_SMD_D_SMA.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Diode_SMD_D_SMA.glb', import.meta.url),
  },
  {
    name: 'Diode_SMD/D_SOD-123',
    footprinterStrings: ['sod123'],
    footprint: new URL('assets/kicad/Diode_SMD_D_SOD-123.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Diode_SMD_D_SOD-123.glb', import.meta.url),
  },
  {
    name: 'Inductor_SMD/L_Coilcraft_XAL7070-XXX',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Inductor_SMD_L_Coilcraft_XAL7070-XXX.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Inductor_SMD_L_Coilcraft_XAL7070-XXX.glb', import.meta.url),
  },
  {
    name: 'Crystal/Crystal_SMD_3225-4Pin_3.2x2.5mm',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Crystal_Crystal_SMD_3225-4Pin_3.2x2.5mm.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Crystal_Crystal_SMD_3225-4Pin_3.2x2.5mm.glb', import.meta.url),
  },
  {
    name: 'Button_Switch_SMD/SW_SPST_PTS810',
    footprinterStrings: [],
    footprint: new URL('assets/kicad/Button_Switch_SMD_SW_SPST_PTS810.circuit.json', import.meta.url),
    model: new URL('assets/kicad/Button_Switch_SMD_SW_SPST_PTS810.glb', import.meta.url),
  },
  {
    name: 'Connector_USB/USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal',
    footprinterStrings: [],
    footprint: new URL(
      'assets/kicad/Connector_USB_USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      'assets/kicad/Connector_USB_USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal.glb',
      import.meta.url,
    ),
  },
  {
    name: 'Connector_JST/JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal',
    footprinterStrings: [],
    footprint: new URL(
      'assets/kicad/Connector_JST_JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL('assets/kicad/Connector_JST_JST_SH_SM03B-SRSS-TB_1x03-1MP_P1.00mm_Horizontal.glb', import.meta.url),
  },
  {
    name: 'TerminalBlock_Phoenix/TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal',
    footprinterStrings: [],
    footprint: new URL(
      'assets/kicad/TerminalBlock_Phoenix_TerminalBlock_Phoenix_MKDS-1_5-2-5.08_1x02_P5.08mm_Horizontal.circuit.json',
      import.meta.url,
    ),
    model: new URL(
      'assets/kicad/TerminalBlock_Phoenix_TerminalBlock_Phoenix_MKDS-1_5-2-5.08_1x02_P5.08mm_Horizontal.glb',
      import.meta.url,
    ),
  },
];

const byName = new Map(kicadPack.map((entry) => [entry.name, entry]));
const byFootprinterString = new Map(
  kicadPack.flatMap((entry) => entry.footprinterStrings.map((value) => [value, entry] as const)),
);

/** The pack entry for a KiCad `Library/Footprint` name. @public */
export const kicadPackEntry = (name: string): KicadPackEntry | undefined => byName.get(name);

/** The pack entry whose model replaces the generic body for an exact footprinter string. @public */
export const kicadPackEntryForFootprinterString = (value: string): KicadPackEntry | undefined =>
  byFootprinterString.get(value);

/** The KiCad footprint name of a kicad-mod-cache model URL, without its extension. */
export const kicadNameOfModelUrl = (url: string): string | undefined => {
  if (!url.startsWith(`${kicadFootprintCacheUrl}/`)) {
    return undefined;
  }
  const path = decodeURIComponent(url.slice(kicadFootprintCacheUrl.length + 1).split('?')[0] ?? '');
  return path.replace(/\.(?:step|stp|wrl)$/iu, '');
};

/** The converter-input URL of an entry's model. */
export const packModelUrl = (entry: KicadPackEntry): string => `${packModelScheme}kicad/${entry.name}.glb`;

/** The entry a `tau-models:` URL names. */
export const entryOfPackModelUrl = (url: string): KicadPackEntry | undefined =>
  url.startsWith(`${packModelScheme}kicad/`) && url.endsWith('.glb')
    ? byName.get(url.slice(packModelScheme.length + 'kicad/'.length, -'.glb'.length))
    : undefined;

type NodeFs = { readFile: (path: URL) => Promise<Uint8Array<ArrayBuffer>> };

// The pack ships next to the module: bundlers serve it over http(s); Node test and CLI hosts load
// it from `file:`, which `fetch` does not read.
const readAsset = async (url: URL, fetchAsset: typeof globalThis.fetch): Promise<Uint8Array<ArrayBuffer>> => {
  if (url.protocol === 'file:') {
    const fs = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule?.(
      'node:fs/promises',
    ) as NodeFs | undefined;
    if (!fs) {
      throw new TypeError(`Cannot read the KiCad pack asset ${url.href} in this host.`);
    }
    return new Uint8Array(await fs.readFile(url));
  }
  const response = await fetchAsset(url);
  if (!response.ok) {
    throw new TypeError(`KiCad pack asset ${url.href} answered HTTP ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

/** An entry's footprint circuit JSON. */
export const loadPackFootprint = async (entry: KicadPackEntry, fetchAsset: typeof globalThis.fetch): Promise<unknown> =>
  JSON.parse(new TextDecoder().decode(await readAsset(entry.footprint, fetchAsset)));

/** An entry's GLB model bytes. */
export const loadPackModel = async (
  entry: KicadPackEntry,
  fetchAsset: typeof globalThis.fetch,
): Promise<Uint8Array<ArrayBuffer>> => readAsset(entry.model, fetchAsset);
