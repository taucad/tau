import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  entryOfPackModelUrl,
  kicadFootprintCacheUrl,
  kicadNameOfModelUrl,
  kicadPack,
  kicadPackEntry,
  kicadPackEntryForFootprinterString,
  loadPackFootprint,
  loadPackModel,
  packModelUrl,
} from '#kicad-pack.js';

const noFetch: typeof globalThis.fetch = async () => {
  throw new Error('pack assets load from disk in Node');
};

describe('KiCad pack', () => {
  it('names each footprint and footprinter string once', () => {
    const names = kicadPack.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    const aliases = kicadPack.flatMap((entry) => entry.footprinterStrings);
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  it.each(kicadPack.map((entry) => [entry.name, entry] as const))(
    'ships %s as a footprint and a GLB',
    async (_, entry) => {
      const footprint = await loadPackFootprint(entry, noFetch);
      expect(Array.isArray(footprint)).toBe(true);
      const elements = footprint as Array<{ type: string; text?: string }>;
      expect(elements.some((element) => element.type === 'pcb_smtpad' || element.type === 'pcb_plated_hole')).toBe(
        true,
      );
      // Fabrication notes are stripped and only the reference designator text is kept.
      expect(elements.some((element) => element.type.startsWith('pcb_fabrication_note'))).toBe(false);
      expect(
        elements
          .filter((element) => element.type === 'pcb_silkscreen_text')
          .every((element) => element.text === 'REF**'),
      ).toBe(true);
      const glb = await loadPackModel(entry, noFetch);
      expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe('glTF');
      expect(glb).toEqual(new Uint8Array(await readFile(entry.model)));
    },
  );

  it('maps KiCad names, model URLs and footprinter strings to entries', () => {
    const name = 'Package_SO/SOIC-8_3.9x4.9mm_P1.27mm';
    const entry = kicadPackEntry(name);
    expect(entry?.name).toBe(name);
    expect(kicadNameOfModelUrl(`${kicadFootprintCacheUrl}/${name}.step`)).toBe(name);
    expect(kicadNameOfModelUrl(`${kicadFootprintCacheUrl}/${encodeURIComponent('Lib/A,B')}.wrl?x=1`)).toBe('Lib/A,B');
    expect(kicadNameOfModelUrl('https://example.com/Package_SO/x.step')).toBeUndefined();
    expect(kicadPackEntryForFootprinterString('soic8')).toBe(entry);
    expect(kicadPackEntryForFootprinterString('soic8_w5.3mm')).toBeUndefined();
    expect(entryOfPackModelUrl(packModelUrl(entry!))).toBe(entry);
    expect(entryOfPackModelUrl('tau-models:kicad/Unknown/Part.glb')).toBeUndefined();
  });
});
