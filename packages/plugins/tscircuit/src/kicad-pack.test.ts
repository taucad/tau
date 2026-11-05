import { readFile } from 'node:fs/promises';
import { fp } from '@tscircuit/footprinter';
import { describe, expect, it } from 'vitest';

import {
  footprinterCandidates,
  kicadFootprintCacheUrl,
  kicadNameOfModelUrl,
  loadKicadPack,
  loadPackFootprint,
  loadPackModel,
  loadPackPadCentre,
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

  it.each([
    ['soic8', ['soic8']],
    ['0603_color(green)', ['0603_color(green)', '0603']],
    ['pinrow2_nopinlabels', ['pinrow2_nopinlabels', 'pinrow2']],
    ['pinrow2_p2.54mm_id1mm_od1.5mm', ['pinrow2_p2.54mm_id1mm_od1.5mm', 'pinrow2']],
    ['pinrow2_p5.08mm_id1.3mm_od2.4mm', ['pinrow2_p5.08mm_id1.3mm_od2.4mm', 'pinrow2_p5.08mm']],
    // Parameters that change the part stay: a female or SMD row is not a vertical pin header.
    ['pinrow4_female_nopinlabels', ['pinrow4_female_nopinlabels', 'pinrow4_female']],
    ['soic8_p1.27mm', ['soic8_p1.27mm']],
  ])('matches %s by what it means', (value, candidates) => {
    expect(footprinterCandidates(value)).toEqual(candidates);
  });

  it('ignores colours, pin labels, ring sizes and the default pitch when it maps a footprinter string', () => {
    expect(pack.forFootprinter('0603_color(green)', 'simple_led')?.name).toBe('LED_SMD/LED_0603_1608Metric');
    expect(pack.forFootprinter('pinrow2_p2.54mm_nopinlabels')?.name).toBe(
      'Connector_PinHeader_2.54mm/PinHeader_1x02_P2.54mm_Vertical',
    );
    expect(pack.forFootprinter('pinrow2_p5.08mm_id1.3mm_od2.4mm')?.name).toBe(
      'TerminalBlock_Phoenix/TerminalBlock_Phoenix_MKDS-1,5-2-5.08_1x02_P5.08mm_Horizontal',
    );
    expect(pack.forFootprinter('pinrow3_p5.08mm')?.name).toBe(
      'TerminalBlock_Phoenix/TerminalBlock_Phoenix_MKDS-1,5-3-5.08_1x03_P5.08mm_Horizontal',
    );
    // A pitch the pack has no part for, or a different part, still gets tscircuit's own body.
    expect(pack.forFootprinter('pinrow2_p3.5mm')).toBeUndefined();
    expect(pack.forFootprinter('pinrow4_female')).toBeUndefined();
  });

  it('finds the pad centre of a KiCad footprint whose origin is pin 1', async () => {
    const header = pack.entry('Connector_PinHeader_2.54mm/PinHeader_1x02_P2.54mm_Vertical')!;
    expect(await loadPackPadCentre(header, noFetch)).toEqual({ x: 0, y: -1.27 });
    const terminal = pack.forFootprinter('pinrow2_p5.08mm')!;
    expect(await loadPackPadCentre(terminal, noFetch)).toEqual({ x: 2.54, y: 0 });
    // A centred SMD footprint keeps its origin.
    const soic = await loadPackPadCentre(pack.entry('Package_SO/SOIC-8_3.9x4.9mm_P1.27mm')!, noFetch);
    expect(soic.x).toBeCloseTo(0, 6);
    expect(soic.y).toBeCloseTo(0, 6);
  });
});
