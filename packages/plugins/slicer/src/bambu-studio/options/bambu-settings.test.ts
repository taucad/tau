import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { admitUnit } from '@taucad/units/unit';
import type { JSONSchema7 } from '@taucad/runtime/types';
import { describe, expect, it } from 'vitest';
import { bambuOptionCatalog, bambuOptionGroups, bambuSkippedKeys } from '#bambu-studio/options/catalog.js';
import { buildBambuSettingsSchema, encodeBambuSettings, flattenBambuSettings } from '#bambu-studio/options/index.js';
import type { BambuResolvedPresets } from '#bambu-studio/options/index.js';

/* eslint-disable @typescript-eslint/naming-convention -- Bambu Studio configuration keys are fixed snake_case names. */

type Presets = { process: Record<string, unknown>; filament: Record<string, unknown> };

// Synthetic values; only the key names and encodings mirror Bambu Studio presets.
const syntheticPresets = (): Presets => ({
  process: {
    name: 'Synthetic process',
    inherits: 'Parent process',
    from: 'system',
    setting_id: 'X0',
    instantiation: 'true',
    compatible_printers: ['Printer A', 'Printer B'],
    print_extruder_variant: ['Variant A', 'Variant B'],
    layer_height: '0.25',
    wall_loops: '3',
    sparse_infill_density: '20%',
    sparse_infill_pattern: 'gyroid',
    top_surface_pattern: 'future-pattern',
    enable_support: '1',
    small_perimeter_speed: ['40%', '40%'],
    inner_wall_speed: ['150', '250'],
    seam_position: 'back',
    wall_infill_order: 'infill/outer wall/inner wall',
    pre_start_fan_time: ['1'],
    tree_support_wall_count: 'many',
    enable_widget: '0',
    widget_count: '1',
    widget_ratio: '12.5%',
    widget_mix: ['3', '50%', '3'],
    widget_list: ['1', '2', '3'],
    widget_name: 'alpha',
    before_widget_gcode: 'G28',
  },
  filament: {
    name: 'Synthetic filament',
    filament_id: 'F0',
    filament_extruder_variant: ['Variant A', 'Variant B'],
    nozzle_temperature: ['215', '220'],
    hot_plate_temp: ['60'],
    fan_max_speed: ['90'],
    filament_flow_ratio: ['0.97', '0.97'],
    filament_retraction_length: ['nil', 'nil'],
    filament_z_hop_types: ['Normal Lift', 'Normal Lift'],
    filament_wipe: ['1', '1'],
    filament_shrink: ['99.5%'],
    overhang_fan_threshold: ['25%'],
    pre_start_fan_time: ['4'],
    filament_start_gcode: ['; start'],
    filament_widget_override: ['nil'],
  },
});

const leaf = (schema: JSONSchema7, path: readonly string[]): JSONSchema7 => {
  let node: JSONSchema7 = schema;
  for (const segment of path) {
    const next = node.properties?.[segment];
    if (next === undefined || typeof next === 'boolean') {
      throw new Error(`Missing schema node ${path.join('.')}`);
    }
    node = next;
  }
  return node;
};

const schemaKeys = (schema: JSONSchema7): Set<string> => {
  const keys = new Set<string>();
  for (const scope of Object.values(schema.properties ?? {})) {
    for (const group of Object.values((scope as JSONSchema7).properties ?? {})) {
      for (const key of Object.keys((group as JSONSchema7).properties ?? {})) {
        keys.add(key);
      }
    }
  }
  return keys;
};

const editableKeys = (presets: BambuResolvedPresets): Set<string> =>
  new Set(
    [...Object.entries(presets.process), ...Object.entries(presets.filament)]
      .filter(([key, value]) => !bambuSkippedKeys.has(key) && !key.endsWith('_gcode') && value !== undefined)
      .map(([key]) => key),
  );

const editablePart = (preset: Readonly<Record<string, unknown>>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(preset).filter(([key]) => !bambuSkippedKeys.has(key) && !key.endsWith('_gcode')));

describe('bambu-studio options', () => {
  describe('buildBambuSettingsSchema', () => {
    it('should expose every editable preset key and no preset metadata', () => {
      const presets = syntheticPresets();
      const { schema } = buildBambuSettingsSchema(presets);
      const keys = schemaKeys(schema);

      expect([...editableKeys(presets)].filter((key) => !keys.has(key))).toEqual([]);
      for (const hidden of ['name', 'inherits', 'setting_id', 'compatible_printers', 'print_extruder_variant']) {
        expect(keys.has(hidden)).toBe(false);
      }
      expect(keys.has('before_widget_gcode')).toBe(false);
      expect(keys.has('filament_start_gcode')).toBe(false);
    });

    it('should nest curated leaves by scope and group with decoded defaults and units', () => {
      const { schema, values } = buildBambuSettingsSchema(syntheticPresets());

      expect(leaf(schema, ['process', 'quality', 'layer_height'])).toMatchObject({
        type: 'number',
        title: 'Layer height',
        default: 0.25,
        'x-tau-unit': 'mm',
      });
      expect(leaf(schema, ['process', 'strength', 'wall_loops'])).toMatchObject({
        type: 'integer',
        default: 3,
        minimum: 0,
      });
      expect(leaf(schema, ['filament', 'temperatures', 'nozzle_temperature'])).toMatchObject({
        type: 'integer',
        default: 215,
        'x-tau-unit': 'Cel',
      });
      expect(values).toMatchObject({
        process: {
          quality: { layer_height: 0.25, seam_position: 'back' },
          strength: { wall_loops: 3, sparse_infill_density: 20 },
          support: { enable_support: true },
        },
        filament: {
          flow: { filament_flow_ratio: 0.97, filament_shrink: 99.5 },
          retraction: { filament_retraction_length: null, filament_wipe: true },
        },
      });
    });

    it('should describe enumerated options with Bambu values and keep unlisted preset values selectable', () => {
      const { schema } = buildBambuSettingsSchema(syntheticPresets());
      const pattern = leaf(schema, ['process', 'strength', 'sparse_infill_pattern']);
      const top = leaf(schema, ['process', 'strength', 'top_surface_pattern']);
      const hop = leaf(schema, ['filament', 'retraction', 'filament_z_hop_types']);

      expect(pattern.oneOf).toContainEqual({ const: 'gyroid', title: 'Gyroid' });
      expect(pattern.oneOf).toContainEqual({ const: 'zig-zag', title: 'Rectilinear' });
      expect(top.oneOf).toContainEqual({ const: 'future-pattern', title: 'future-pattern' });
      expect(hop).toMatchObject({ type: ['string', 'null'], default: 'Normal Lift' });
      expect(hop.oneOf).toContainEqual({ const: null, title: 'Printer value' });
    });

    it('should infer types for keys without a Tau descriptor', () => {
      const { schema, values } = buildBambuSettingsSchema(syntheticPresets());
      const other = (key: string) => leaf(schema, ['process', 'process-all', key]);

      expect(other('enable_widget')).toMatchObject({ type: 'boolean', title: 'Enable widget' });
      expect(other('widget_count')).toMatchObject({ type: 'number', default: 1 });
      expect(other('widget_ratio')).toMatchObject({ type: 'number', 'x-tau-unit': '%', default: 12.5 });
      expect(other('widget_mix')).toMatchObject({ type: 'array', items: { type: ['number', 'string'] } });
      expect(other('widget_name')).toMatchObject({ type: 'string', default: 'alpha' });
      expect(leaf(schema, ['filament', 'filament-all', 'filament_widget_override'])).toMatchObject({
        type: ['string', 'null'],
        default: null,
      });
      expect(flattenBambuSettings(values)).toMatchObject({ widget_list: [1, 2, 3], widget_mix: [3, '50%', 3] });
    });

    it('should degrade a curated option to an inferred one when the preset value does not fit', () => {
      const { schema } = buildBambuSettingsSchema(syntheticPresets());

      expect(leaf(schema, ['process', 'process-all', 'tree_support_wall_count'])).toMatchObject({
        type: 'string',
        default: 'many',
      });
    });

    it('should show Bambu defaults for curated options the presets omit, derived from legacy keys where present', () => {
      const flat = flattenBambuSettings(buildBambuSettingsSchema(syntheticPresets()).values);

      expect(flat).toMatchObject({
        brim_type: 'auto_brim',
        timelapse_type: '0',
        enable_pressure_advance: false,
        wall_sequence: 'outer wall/inner wall',
        is_infill_first: true,
      });
    });

    it('should list only non-empty groups in Bambu Studio tab order', () => {
      const { groups } = buildBambuSettingsSchema(syntheticPresets());

      expect(groups.map((group) => group.id)).toEqual([
        'quality',
        'strength',
        'speed',
        'support',
        'multimaterial',
        'others',
        'process-all',
        'temperatures',
        'cooling',
        'flow',
        'retraction',
        'filament-all',
      ]);
      expect(groups.find((group) => group.id === 'process-all')).toEqual({
        id: 'process-all',
        label: 'All other settings',
        scope: 'process',
      });
    });

    it('should assign a key in both presets to the filament and show its value', () => {
      const { values } = buildBambuSettingsSchema(syntheticPresets());

      expect(values['filament']).toMatchObject({ cooling: { pre_start_fan_time: 4 } });
    });
  });

  describe('encodeBambuSettings', () => {
    it('should round-trip every decoded value to the original encoding', () => {
      const presets = syntheticPresets();
      const flat = flattenBambuSettings(buildBambuSettingsSchema(presets).values);

      expect(encodeBambuSettings(flat, presets)).toEqual({
        process: editablePart(presets.process),
        filament: editablePart(presets.filament),
      });
    });

    it('should encode changed values in Bambu form and fill per-extruder arrays', () => {
      const encoded = encodeBambuSettings(
        {
          layer_height: 0.16,
          sparse_infill_density: 35,
          small_perimeter_speed: 30,
          inner_wall_speed: 180,
          nozzle_temperature: [230, 240],
          enable_support: false,
          filament_retraction_length: 0.6,
          filament_wipe: null,
          pre_start_fan_time: 6,
        },
        syntheticPresets(),
      );

      expect(encoded).toEqual({
        process: {
          layer_height: '0.16',
          sparse_infill_density: '35%',
          small_perimeter_speed: ['30', '30'],
          inner_wall_speed: ['180', '180'],
          enable_support: '0',
          pre_start_fan_time: ['6'],
        },
        filament: {
          nozzle_temperature: ['230', '240'],
          filament_retraction_length: ['0.6', '0.6'],
          filament_wipe: ['nil', 'nil'],
          pre_start_fan_time: ['6'],
        },
      });
    });

    it('should write changed defaults of omitted options to their scope and leave unchanged ones out', () => {
      const encoded = encodeBambuSettings(
        { brim_type: 'no_brim', timelapse_type: '0', enable_pressure_advance: true, pressure_advance: 0.04 },
        syntheticPresets(),
      );

      expect(encoded).toEqual({
        process: { brim_type: 'no_brim' },
        filament: { enable_pressure_advance: ['1'], pressure_advance: ['0.04'] },
      });
    });

    it('should not mutate the resolved presets', () => {
      const presets = syntheticPresets();
      const snapshot = structuredClone(presets);

      encodeBambuSettings({ inner_wall_speed: 100 }, presets);

      expect(presets).toEqual(snapshot);
    });

    it.each([
      [{ nonexistent_key: 1 }, TypeError, 'Unknown or read-only Bambu Studio setting "nonexistent_key".'],
      [{ setting_id: 'X9' }, TypeError, 'Unknown or read-only Bambu Studio setting "setting_id".'],
      [{ filament_start_gcode: 'G1' }, TypeError, 'Unknown or read-only Bambu Studio setting "filament_start_gcode".'],
      [{ layer_height: '0.2' }, TypeError, 'Bambu Studio setting "layer_height" expects a number; received "0.2".'],
      [{ wall_loops: 2.5 }, TypeError, 'Bambu Studio setting "wall_loops" expects an integer; received 2.5.'],
      [
        { sparse_infill_pattern: 'bogus' },
        TypeError,
        'Bambu Studio setting "sparse_infill_pattern" expects one of its choices; received "bogus".',
      ],
      [
        { enable_support: null },
        TypeError,
        'Bambu Studio setting "enable_support" expects true or false; received null.',
      ],
      [
        { widget_name: 'a\nG28' },
        TypeError,
        String.raw`Bambu Studio setting "widget_name" expects a single-line string; received "a\nG28".`,
      ],
      [{ layer_height: [0.2] }, TypeError, 'Bambu Studio setting "layer_height" takes a single value, not a list.'],
      [
        { small_perimeter_speed: '40' },
        TypeError,
        'Bambu Studio setting "small_perimeter_speed" expects a number or a percentage such as "50%"; received "40".',
      ],
      [
        { sparse_infill_density: 120 },
        RangeError,
        'Bambu Studio setting "sparse_infill_density" must be between 0 and 100; received 120.',
      ],
    ])('should reject %j', (settings, type, message) => {
      const run = () => encodeBambuSettings(settings, syntheticPresets());

      expect(run).toThrow(type);
      expect(run).toThrow(message);
    });
  });

  describe('catalog', () => {
    it('should give every descriptor a unique key, a known group of its scope and valid choices and units', () => {
      const groups = new Map(bambuOptionGroups.map((group) => [group.id, group.scope]));
      const keys = bambuOptionCatalog.map((descriptor) => descriptor.key);

      expect(new Set(keys).size).toBe(keys.length);
      for (const descriptor of bambuOptionCatalog) {
        expect(groups.get(descriptor.group), descriptor.key).toBe(descriptor.scope);
        expect(bambuSkippedKeys.has(descriptor.key), descriptor.key).toBe(false);
        if (descriptor.type === 'enum') {
          expect(descriptor.choices?.length, descriptor.key).toBeGreaterThan(1);
        }
        if (descriptor.unit !== undefined) {
          expect(admitUnit(descriptor.unit).status, descriptor.unit).toBe('success');
        }
      }
    });
  });
});

// Opt-in: resolves the real X1C presets from an installed Bambu Studio (macOS default location).
const profilesRoot =
  process.env['TAU_BAMBU_STUDIO_PROFILES'] ?? '/Applications/BambuStudio.app/Contents/Resources/profiles/BBL';

const findPreset = (directory: string, name: string): string | undefined => {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = findPreset(path, name);
      if (found !== undefined) {
        return found;
      }
    } else if (entry.name === `${name}.json`) {
      return path;
    }
  }
  return undefined;
};

/** Resolves `inherits` recursively, then each `include` in order, then the preset's own keys. */
const resolvePreset = (kind: string, name: string): Record<string, unknown> => {
  const path = findPreset(join(profilesRoot, kind), name);
  if (path === undefined) {
    throw new Error(`Preset ${kind}/${name} not found`);
  }
  const own = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const resolved: Record<string, unknown> =
    typeof own['inherits'] === 'string' && own['inherits'] !== '' ? resolvePreset(kind, own['inherits']) : {};
  for (const include of Array.isArray(own['include']) ? (own['include'] as string[]) : []) {
    Object.assign(resolved, resolvePreset(kind, include));
  }
  return { ...resolved, ...own };
};

describe.skipIf(!existsSync(profilesRoot))('bambu-studio options with installed X1C presets', () => {
  const presets = {
    process: resolvePreset('process', '0.20mm Standard @BBL X1C'),
    filament: resolvePreset('filament', 'Bambu PETG Basic @BBL X1C'),
  };

  it('should cover every editable key of the resolved process and filament presets', () => {
    const keys = schemaKeys(buildBambuSettingsSchema(presets).schema);

    expect([...editableKeys(presets)].filter((key) => !keys.has(key))).toEqual([]);
  });

  it('should decode every curated option present in the presets without degrading it', () => {
    const { schema } = buildBambuSettingsSchema(presets);
    const groupKeys = (scope: string, group: string) => Object.keys(leaf(schema, [scope, group]).properties ?? {});
    const degraded = bambuOptionCatalog
      .filter((descriptor) => descriptor.key in presets.process || descriptor.key in presets.filament)
      .filter((descriptor) => !groupKeys(descriptor.scope, descriptor.group).includes(descriptor.key))
      .map((descriptor) => descriptor.key);

    expect(degraded).toEqual([]);
  });

  it('should round-trip every decoded value to the original encoding', () => {
    const flat = flattenBambuSettings(buildBambuSettingsSchema(presets).values);

    expect(encodeBambuSettings(flat, presets)).toEqual({
      process: editablePart(presets.process),
      filament: editablePart(presets.filament),
    });
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End of Bambu Studio key fixtures. */
