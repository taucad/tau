import { defineConfiguration } from "@taucad/runtime/configuration";
import { defineMachine } from "@taucad/runtime/machine";
import { z } from "zod";

const bindingConfiguration = defineConfiguration({
  id: "bambu.machine.binding",
  version: "1.0.0",
  schema: z.object({
    logicalId: z.string().min(1).max(64),
    address: z.string().min(1).max(253).optional(),
    serial: z.string().min(1).max(64).optional(),
  }),
  ui: { version: 1, rjsf: {} },
});

const submissionConfiguration = defineConfiguration({
  id: "bambu.machine.submission",
  version: "1.0.0",
  schema: z.object({
    amsMapping: z.array(z.number().int().min(-1).max(15)).max(16).default([]),
    bedLeveling: z.boolean().default(true),
    expectedBedType: z.string().min(1).max(64),
    expectedFilamentDiameter: z.strictObject({
      value: z.number().positive(),
      unit: z.string().min(1).max(64),
      kind: z.string().min(1).max(256),
      space: z.literal("linear"),
    }),
    expectedMaterials: z
      .array(z.strictObject({ slot: z.number().int().min(0).max(15), materialId: z.string().min(1).max(128) }))
      .min(1)
      .max(16),
    expectedModel: z.literal("X1C"),
    expectedNozzleDiameter: z.strictObject({
      value: z.number().positive(),
      unit: z.string().min(1).max(64),
      kind: z.string().min(1).max(256),
      space: z.literal("linear"),
    }),
    operatorConfirmedBedType: z.string().min(1).max(64).optional(),
    flowCalibration: z.boolean().default(true),
    timelapse: z.boolean().default(false),
  }),
  ui: { version: 1, rjsf: {} },
});

/** `bambu` physical-machine capability. @public */
export const bambuMachine = defineMachine({
  id: "bambu",
  name: "Bambu Lab Developer LAN",
  version: "1.0.0",
  protocolVersion: 1,
  vendor: "Bambu Lab",
  technologies: ["additive.fff"],
  accepts: [
    {
      contract: { id: "manufacturing.toolpath.bambu-gcode-3mf", version: 1 },
      mediaType: "application/vnd.bambulab.gcode-3mf",
      requiredMembers: ["Metadata/plate_1.gcode"],
      payloadSelection: "plate",
      technology: "additive.fff",
    },
  ],
  bindingConfiguration,
  submissionConfiguration,
  async *discover(input, runtime) {
    // eslint-disable-next-line import-x/no-extraneous-dependencies -- lazy package-import self-reference resolves this package's host source.
    const { discoverBambuMachines } = await import("#bambu.host.js");
    yield* discoverBambuMachines(input, runtime);
  },
  async connect(input, runtime) {
    // eslint-disable-next-line import-x/no-extraneous-dependencies -- lazy package-import self-reference resolves this package's host source.
    const { connectBambuMachine } = await import("#bambu.host.js");
    return connectBambuMachine(input, runtime);
  },
});
