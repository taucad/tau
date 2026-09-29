/**
 * Schema-bearing description of one physical machine model.
 *
 * The manifest is plain frozen data. Its geometry drives the printer viewer
 * scene, its editable subsets project into the shared Parameters renderer, its
 * action descriptors decide which controls a surface may offer, and its
 * observation groups carry the freshness budgets the monitor shows. Every
 * provider definition carries exactly one manifest (blueprint D7, R3).
 *
 * @module
 */

import { z } from 'zod';

const label = z.string().min(1).max(128);
const identifier = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9._-]*$/u);
const millimetres = z.number().positive().max(10_000);

/** One declared physical quantity with its native unit. @public */
export const machineManifestQuantitySchema = z.strictObject({
  value: z.number(),
  unit: z.string().min(1).max(32),
});

/** Axis-aligned size in millimetres. @public */
export const machineManifestSizeSchema = z.strictObject({ x: millimetres, y: millimetres, z: millimetres });

/** One declared machine action and how far it is qualified. @public */
export const machineActionDescriptorSchema = z.strictObject({
  id: identifier,
  label,
  description: z.string().max(512).optional(),
  /** Physical effect class the host admits this action under. */
  effect: z.enum(['none', 'observe', 'thermal', 'motion', 'material', 'print', 'storage']),
  /** `qualified` actions may be enabled; `designed` and `unsupported` stay disabled with a reason. */
  qualification: z.enum(['qualified', 'designed', 'unsupported']),
  /** Draft-7 object schema for the action's parameters, when it takes any. */
  parameters: z.record(z.string(), z.unknown()).optional(),
  /** Human-readable preconditions the surface shows before offering the action. */
  preconditions: z.array(z.string().max(256)).max(16).optional(),
});

/** Complete machine manifest. @public */
export const machineManifestSchema = z.strictObject({
  version: z.literal(1),
  identity: z.strictObject({
    vendor: label,
    model: identifier,
    displayName: label,
    family: label.optional(),
    /** Firmware versions this provider has qualified on hardware. */
    qualifiedFirmware: z.array(z.string().max(64)).max(32).default([]),
  }),
  technology: z.enum(['additive.fff']),
  geometry: z.strictObject({
    unit: z.literal('mm'),
    buildVolume: machineManifestSizeSchema,
    enclosure: z.strictObject({
      outer: machineManifestSizeSchema,
      enclosed: z.boolean(),
      doors: z
        .array(z.enum(['front', 'top', 'side']))
        .max(4)
        .default([]),
    }),
    kinematics: z.enum(['corexy', 'cartesian-bedslinger', 'cartesian-gantry', 'delta']),
    /** Which axis the build plate itself travels on. */
    bedMotion: z.enum(['z', 'y', 'none']),
    origin: z.enum(['front-left', 'center']),
    toolheadHome: machineManifestSizeSchema,
    materialSystemMount: z.enum(['top', 'side', 'external', 'none']).default('none'),
  }),
  toolhead: z.strictObject({
    filamentDiameter: machineManifestQuantitySchema,
    nozzles: z
      .array(
        z.strictObject({
          id: identifier,
          diameter: machineManifestQuantitySchema,
          maximumTemperature: machineManifestQuantitySchema,
          material: z.enum(['stainless', 'hardened']),
        }),
      )
      .min(1)
      .max(8),
  }),
  bed: z.strictObject({
    maximumTemperature: machineManifestQuantitySchema,
    plates: z
      .array(z.strictObject({ id: identifier, label }))
      .min(1)
      .max(16),
  }),
  chamber: z.strictObject({
    enclosed: z.boolean(),
    heated: z.boolean(),
    maximumTemperature: machineManifestQuantitySchema.optional(),
    light: z.boolean(),
    fans: z.array(z.strictObject({ id: z.enum(['part', 'auxiliary', 'chamber']), label })).max(3),
  }),
  materialSystem: z.strictObject({
    units: z.number().int().min(0).max(8),
    slotsPerUnit: z.number().int().min(0).max(8),
    externalSpool: z.boolean(),
    /** The slot the external spool reports and is printed from, beside the unit slots; the provider's own numbering. */
    externalSpoolSlot: z.number().int().min(0).max(255).optional(),
    drying: z.boolean(),
  }),
  /** Whether the machine's camera can capture a still; no live-stream contract exists. */
  camera: z.strictObject({ stills: z.boolean() }),
  storage: z.strictObject({ removable: z.boolean() }),
  network: z.strictObject({ lanMode: z.boolean(), cloud: z.boolean() }),
  speedProfiles: z.array(z.strictObject({ id: identifier, label, percent: z.number().int().min(1).max(400) })).max(8),
  actions: z.array(machineActionDescriptorSchema).max(64),
  observations: z
    .array(
      z.strictObject({
        group: identifier,
        label,
        /** Milliseconds after which an observation of this group is presented as stale. */
        staleAfter: z.number().int().positive().max(3_600_000),
      }),
    )
    .max(32),
  slicing: z.strictObject({
    recommended: z.strictObject({
      layerHeight: machineManifestQuantitySchema,
      walls: z.number().int().min(1).max(16),
      infillPercent: z.number().int().min(0).max(100),
      nozzleTemperature: machineManifestQuantitySchema,
      bedTemperature: machineManifestQuantitySchema,
    }),
    presets: z
      .array(
        z.strictObject({
          id: z.enum(['fast', 'standard', 'fine']),
          label,
          layerHeight: machineManifestQuantitySchema,
        }),
      )
      .length(3),
  }),
});

/** One declared machine action. @public */
export type MachineActionDescriptor = z.infer<typeof machineActionDescriptorSchema>;

/** Frozen machine model description carried by every provider. @public */
export type MachineManifest = z.infer<typeof machineManifestSchema>;

/**
 * Admit one manifest, refusing unknown keys and out-of-range values.
 *
 * @param candidate - Plain data claiming to be a manifest.
 * @returns The frozen manifest.
 * @throws ZodError when the candidate is not a manifest.
 * @public
 */
export const parseMachineManifest = (candidate: unknown): MachineManifest =>
  Object.freeze(machineManifestSchema.parse(candidate));
