import { readFile } from 'node:fs/promises';
import { fp } from '@tscircuit/footprinter';
import { describe, expect, it } from 'vitest';

import {
  kicadFootprintCacheUrl,
  kicadNameOfModelUrl,
  loadKicadPack,
  loadPackFootprint,
  loadPackModel,
  packModelUrl,
} from '#kicad-pack.js';

const pack = await loadKicadPack();
const kicadPack = pack.entries;

const noFetch: typeof globalThis.fetch = async () => {
  throw new Error('pack assets load from disk in Node');
};

describe('KiCad pack', () => {
  it('names each footprint and footprinter mapping once', () => {
    const names = kicadPack.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    const aliases = kicadPack.flatMap((entry) =>
      entry.footprinters.map((footprinter) => `${footprinter.ftype ?? ''}:${footprinter.string}`),
    );
    expect(new Set(aliases).size).toBe(aliases.length);
  });

  // A mapped model sits on the footprinter's pads only when the KiCad pads, centred and turned by
  // `footprinterRotation`, land on the footprinter pads of the same number.
  it.each(kicadPack.flatMap((entry) => entry.footprinters.map((footprinter) => [footprinter.string, entry] as const)))(
    'fits the %s footprinter pads to the KiCad footprint',
    async (value, entry) => {
      type Pad = {
        type: string;
        x?: number;
        y?: number;
        points?: Array<{ x: number; y: number }>;
        port_hints?: string[];
      };
      const padsOf = (elements: Pad[]) =>
        elements
          .filter((element) => element.type === 'pcb_smtpad' || element.type === 'pcb_plated_hole')
          .map((element) => {
            const points = element.points ?? [{ x: element.x ?? 0, y: element.y ?? 0 }];
            return {
              number: element.port_hints?.find((hint) => /^\d+$/u.test(hint)),
              x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
              y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
            };
          });
      const centred = (pads: ReturnType<typeof padsOf>) => {
        const xs = pads.map((pad) => pad.x);
        const ys = pads.map((pad) => pad.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        return pads.map((pad) => ({ ...pad, x: pad.x - cx, y: pad.y - cy }));
      };
      const generated = centred(padsOf(fp.string(value).circuitJson() as Pad[]));
      const angle = ((entry.footprinterRotation ?? 0) * Math.PI) / 180;
      const [cos, sin] = [Math.round(Math.cos(angle)), Math.round(Math.sin(angle))];
      const kicad = centred(padsOf((await loadPackFootprint(entry, noFetch)) as Pad[])).map((pad) => ({
        ...pad,
        x: cos * pad.x - sin * pad.y,
        y: sin * pad.x + cos * pad.y,
      }));
      for (const pad of generated) {
        const distances = kicad
          .filter((candidate) => candidate.number === pad.number)
          .map((candidate) => Math.hypot(candidate.x - pad.x, candidate.y - pad.y));
        expect(distances.length, `pad ${pad.number}`).toBeGreaterThan(0);
        // Footprinter and KiCad differ by IPC land-pattern density, never by more than half a millimetre.
        expect(Math.min(...distances), `pad ${pad.number}`).toBeLessThan(0.5);
      }
    },
  );

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
    const entry = pack.entry(name);
    expect(entry?.name).toBe(name);
    expect(kicadNameOfModelUrl(`${kicadFootprintCacheUrl}/${name}.step`)).toBe(name);
    expect(kicadNameOfModelUrl(`${kicadFootprintCacheUrl}/${encodeURIComponent('Lib/A,B')}.wrl?x=1`)).toBe('Lib/A,B');
    expect(kicadNameOfModelUrl('https://example.com/Package_SO/x.step')).toBeUndefined();
    expect(pack.forFootprinter('soic8')).toBe(entry);
    expect(pack.forFootprinter('soic8', 'simple_chip')).toBe(entry);
    expect(pack.forFootprinter('soic8_w5.3mm')).toBeUndefined();
    // Bare sizes are shared by LEDs and inductors, so they resolve only with the source ftype.
    expect(pack.forFootprinter('0603')).toBeUndefined();
    expect(pack.forFootprinter('0603', 'simple_led')?.name).toBe('LED_SMD/LED_0603_1608Metric');
    expect(pack.forFootprinter('0603', 'simple_inductor')?.name).toBe('Inductor_SMD/L_0603_1608Metric');
    expect(pack.forFootprinter('res0603', 'simple_resistor')?.name).toBe('Resistor_SMD/R_0603_1608Metric');
    expect(pack.ofModelUrl(packModelUrl(entry!))).toBe(entry);
    expect(pack.ofModelUrl('tau-models:kicad/Unknown/Part.glb')).toBeUndefined();
  });
});
