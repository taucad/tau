import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { printIntentPath, readPrintIntent, serializePrintIntent } from '#index.js';
import type { PrintIntent } from '#index.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio setting keys are fixed snake_case names. */

const encoder = new TextEncoder();
const bytesOf = (text: string): Uint8Array<ArrayBuffer> => encoder.encode(text);

const fullIntent: PrintIntent = {
  model: 'X1C',
  preset: 'fine',
  printer: 'Bambu Lab X1 Carbon 0.4 nozzle',
  process: '0.12mm Fine @BBL X1C',
  filaments: { '0': 'Bambu PLA Basic @BBL X1C', '15': 'Bambu PETG HF @BBL X1C' },
  plate: 'engineering',
  settings: {
    wall_loops: 3,
    enable_support: true,
    seam_position: 'back',
    filament_colour: ['#FFFFFF'],
    brim_width: null,
  },
  options: {
    layerHeight: 0.12,
    walls: 3,
    infillPercent: 20,
    infillPattern: 'grid',
    supports: true,
    nozzleTemperature: 225,
    bedTemperature: 60,
    printSpeed: 120,
    travelSpeed: 300,
  },
};

/** The same value with every object's keys in reverse order. */
const reversedKeys = (value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(
        Object.entries(value)
          .toReversed()
          .map(([key, member]) => [key, reversedKeys(member)]),
      )
    : value;

describe('print intent', () => {
  it('should live at the project path the Print pane and the agent tools read', () => {
    expect(printIntentPath).toBe('.tau/machines/printer.json');
  });

  describe('readPrintIntent', () => {
    it('should read an intent that names only the model', () => {
      expect(readPrintIntent(bytesOf('{"model":"X1C"}'))).toStrictEqual({
        status: 'current',
        intent: { model: 'X1C' },
      });
    });

    it('should read every setting a person can change', () => {
      expect(readPrintIntent(bytesOf(JSON.stringify(fullIntent)))).toStrictEqual({
        status: 'current',
        intent: fullIntent,
      });
    });

    it('should add no reference-slicer default the file did not hold', () => {
      /* `layerHeight` is the one option without a default, so any other key here would be a leak. */
      expect(readPrintIntent(bytesOf('{"model":"X1C","options":{"layerHeight":0.12}}'))).toStrictEqual({
        status: 'current',
        intent: { model: 'X1C', options: { layerHeight: 0.12 } },
      });
    });

    it.each([
      ['an unknown key', '{"model":"X1C","machineId":"workshop-x1c"}'],
      ['what the printer reports', '{"model":"X1C","hints":{"model":"X1C","materials":[]}}'],
      ['a version field', '{"version":1,"model":"X1C"}'],
      ['an option request_print refuses', '{"model":"X1C","options":{"engine":"service"}}'],
      ['the quality preset inside options', '{"model":"X1C","options":{"preset":"fine"}}'],
      ['an out-of-range option', '{"model":"X1C","options":{"walls":0}}'],
      ['a __proto__ key', '{"model":"X1C","__proto__":{"polluted":true}}'],
      ['a nested __proto__ key', '{"model":"X1C","settings":{"__proto__":1}}'],
      ['no model', '{"preset":"fine"}'],
      ['an empty model', '{"model":""}'],
      ['a model over 64 characters', JSON.stringify({ model: 'X'.repeat(65) })],
      ['filament slot 16', '{"model":"X1C","filaments":{"16":"Bambu PLA Basic @BBL X1C"}}'],
      ['a zero-padded filament slot', '{"model":"X1C","filaments":{"01":"Bambu PLA Basic @BBL X1C"}}'],
      ['a negative filament slot', '{"model":"X1C","filaments":{"-1":"Bambu PLA Basic @BBL X1C"}}'],
      ['filaments as a list', '{"model":"X1C","filaments":["Bambu PLA Basic @BBL X1C"]}'],
      ['an unknown plate', '{"model":"X1C","plate":"glass"}'],
      ['an array', '[{"model":"X1C"}]'],
      ['null', 'null'],
      ['a string', '"X1C"'],
      ['a number', '42'],
      ['truncated JSON', '{"model":"X1C"'],
      ['no bytes', ''],
    ])('should preserve %s as invalid', (_case, text) => {
      expect(readPrintIntent(bytesOf(text))).toStrictEqual({ status: 'invalid-preserved' });
    });

    it('should refuse invalid UTF-8 even where a lenient decoder would give a valid intent', () => {
      const bytes = Uint8Array.from([...bytesOf('{"model":"X1'), 0xff, ...bytesOf('"}')]);

      expect(readPrintIntent(bytesOf(new TextDecoder().decode(bytes)))).toMatchObject({ status: 'current' });
      expect(readPrintIntent(bytes)).toStrictEqual({ status: 'invalid-preserved' });
    });

    it('should accept exactly 64 KiB and refuse one byte more', () => {
      expect(readPrintIntent(bytesOf('{"model":"X1C"}'.padEnd(65_536)))).toStrictEqual({
        status: 'current',
        intent: { model: 'X1C' },
      });
      expect(readPrintIntent(bytesOf('{"model":"X1C"}'.padEnd(65_537)))).toStrictEqual({ status: 'invalid-preserved' });
    });
  });

  describe('serializePrintIntent', () => {
    it('should write sorted keys with a two-space indent and a trailing newline', () => {
      expect(
        serializePrintIntent({
          settings: { wall_loops: 3, brim_width: 5 },
          model: 'X1C',
          filaments: { '10': 'Bambu PETG HF @BBL X1C', '2': 'Bambu PLA Basic @BBL X1C' },
        }),
      ).toBe(
        [
          '{',
          '  "filaments": {',
          '    "2": "Bambu PLA Basic @BBL X1C",',
          '    "10": "Bambu PETG HF @BBL X1C"',
          '  },',
          '  "model": "X1C",',
          '  "settings": {',
          '    "brim_width": 5,',
          '    "wall_loops": 3',
          '  }',
          '}',
          '',
        ].join('\n'),
      );
    });

    it('should give equal intents equal bytes whatever their key order', () => {
      const reordered = reversedKeys(fullIntent) as PrintIntent;

      expect(Object.keys(reordered)).toStrictEqual(Object.keys(fullIntent).toReversed());
      expect(Object.keys(reordered.settings!)).toStrictEqual(Object.keys(fullIntent.settings!).toReversed());
      expect(serializePrintIntent(reordered)).toBe(serializePrintIntent(fullIntent));
    });

    it('should read back exactly the intent it wrote', () => {
      expect(readPrintIntent(bytesOf(serializePrintIntent(fullIntent)))).toStrictEqual({
        status: 'current',
        intent: fullIntent,
      });
    });

    it('should refuse an intent the reader would refuse', () => {
      try {
        serializePrintIntent({ model: 'X1C', options: { walls: 0 } });
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ZodError);
        expect((error as ZodError).issues.map((issue) => issue.path)).toStrictEqual([['options', 'walls']]);
      }
    });

    it('should refuse to write more than the reader accepts', () => {
      const oversized = (): string =>
        serializePrintIntent({ model: 'X1C', settings: { machine_start_gcode: 'G28\n'.repeat(16_384) } });

      expect(oversized).toThrow(RangeError);
      expect(oversized).toThrow('A print intent is at most 64 KiB; shorten its Bambu Studio setting overrides.');
    });
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio keys. */
