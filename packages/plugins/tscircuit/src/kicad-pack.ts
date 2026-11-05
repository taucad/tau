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
export const kicadPackVersion = '2026.11.1';

/** The mirror the pack is built from, and where the online parts mode fetches KiCad footprints. @public */
export const kicadFootprintCacheUrl = 'https://kicad-mod-cache.tscircuit.com';

/** The URL scheme the kernel gives pack models in converter input; the fetch guard serves it. */
export const packModelScheme = 'tau-models:';

/** A footprinter footprint the pack's model replaces the generic body of. @public */
export type KicadPackFootprinter = {
  /** Exact `cad_component.footprinter_string`, as core writes it (`res0402`, `soic8`, `pinrow4`). */
  readonly string: string;
  /** Only for source components of this `ftype`, for strings shared across kinds (`0603` LED or inductor). */
  readonly ftype?: string;
};

/** One footprint in the pack. @public */
export type KicadPackEntry = {
  /** KiCad `Library/Footprint` name, as written after `kicad:` in a `footprint` prop. */
  readonly name: string;
  /** Footprinter footprints whose pads match this KiCad footprint, so they render with its model. */
  readonly footprinters: readonly KicadPackFootprinter[];
  /** Degrees about +Z that turn the KiCad model onto the footprinter pads (KiCad headers run along Y). */
  readonly footprinterRotation?: number;
  readonly footprint: URL;
  readonly model: URL;
};

/** The loaded pack: its entries and their lookups. @public */
export type KicadPack = {
  readonly entries: readonly KicadPackEntry[];
  /** The entry for a KiCad `Library/Footprint` name. */
  readonly entry: (name: string) => KicadPackEntry | undefined;
  /**
   * The entry whose model replaces the generic body for an exact footprinter string, preferring a
   * mapping for the source component's `ftype`.
   */
  readonly forFootprinter: (value: string, ftype?: string) => KicadPackEntry | undefined;
  /** The entry a `tau-models:` URL names. */
  readonly ofModelUrl: (url: string) => KicadPackEntry | undefined;
};

const footprinterKey = (value: string, ftype?: string): string => (ftype === undefined ? value : `${ftype}:${value}`);

const indexPack = (entries: readonly KicadPackEntry[]): KicadPack => {
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const byFootprinter = new Map(
    entries.flatMap((entry) =>
      entry.footprinters.map((footprinter) => [footprinterKey(footprinter.string, footprinter.ftype), entry] as const),
    ),
  );
  const modelPrefix = `${packModelScheme}kicad/`;
  return {
    entries,
    entry: (name) => byName.get(name),
    forFootprinter: (value, ftype) =>
      (ftype === undefined ? undefined : byFootprinter.get(footprinterKey(value, ftype))) ?? byFootprinter.get(value),
    ofModelUrl: (url) =>
      url.startsWith(modelPrefix) && url.endsWith('.glb')
        ? byName.get(url.slice(modelPrefix.length, -'.glb'.length))
        : undefined,
  };
};

let loadedPack: KicadPack | undefined;

/** The pack, loading its catalogue from the engine on first use. @public */
export const loadKicadPack = async (): Promise<KicadPack> => {
  if (!loadedPack) {
    const { kicadCatalog } = await import('#engine/kicad-catalog.js');
    loadedPack = indexPack(kicadCatalog);
  }
  return loadedPack;
};

/** The KiCad footprint name of a kicad-mod-cache model URL, without its extension. */
export const kicadNameOfModelUrl = (url: string): string | undefined => {
  if (!url.startsWith(`${kicadFootprintCacheUrl}/`)) {
    return undefined;
  }
  const path = decodeURIComponent(url.slice(kicadFootprintCacheUrl.length + 1).split('?')[0] ?? '');
  return path.replace(/\.(?:step|stp|wrl)$/iu, '');
};

/** The converter-input URL of an entry's model. */
export const packModelUrl = (entry: Pick<KicadPackEntry, 'name'>): string =>
  `${packModelScheme}kicad/${entry.name}.glb`;

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
