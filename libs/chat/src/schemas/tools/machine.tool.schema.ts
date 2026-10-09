import { machineSettingsProvenanceSchema } from '@taucad/runtime/machine/settings';
import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';

/*
 * The machine tools a CAD agent is offered. The machine host owns their behavior
 * (`@taucad/agent-tools` `createMachineToolRegistry`) and imports these inputs,
 * so the model, the registry and the transcript read one contract.
 */

/** A machine, component or job id, exactly as the machine host issued it. */
const machineIdentitySchema = z.string().min(1).max(256);

const machineChoiceSchema = machineIdentitySchema.optional().describe('Omit when exactly one machine is bound.');

/*
 * Slicer options stay a record of JSON values at runtime. The recursive JSON
 * schema serializes as `$ref` loops through `definitions` and its bounded keys
 * as `propertyNames`, both of which Vertex refuses; piping a typeless input
 * side into it keeps the full check while the wire form is the description.
 */
const slicerOptionsSchema = z
  .any()
  .describe('Slicer options: a JSON object mapping option names to JSON values.')
  .pipe(z.record(z.string().min(1).max(64), z.json()));

/*
 * Bambu Studio setting overrides, bounded like `@taucad/slicer`'s own
 * `bambuStudio.settings`. The same typeless wire side as the slicer options:
 * a bounded record key would serialize as `propertyNames`.
 */
const bambuSettingsSchema = z
  .any()
  .describe('Bambu Studio settings: a JSON object mapping setting keys from get_print_profiles to values.')
  .pipe(
    z.record(
      z.string().min(1).max(128),
      z.union([
        z.string().max(65_536),
        z.number(),
        z.boolean(),
        z.null().describe('The printer value (Bambu Studio nil)'),
        z.array(z.union([z.string().max(4096), z.number()])).max(64),
      ]),
    ),
  );

const presetNameSchema = z.string().min(1).max(256);

/** Bambu Studio presets by name, as get_print_profiles lists them; the machine's defaults fill any omitted. */
const printProfilesSchema = z.strictObject({
  printer: presetNameSchema.optional(),
  process: presetNameSchema.optional(),
  filaments: z
    .array(presetNameSchema)
    .min(1)
    .max(16)
    .optional()
    .describe('One per filament the model prints, filament 1 first; a one-colour model takes one.'),
});

/**
 * The slicer options `request_job` and `check_job` accept: print quality only. Slicing runs
 * before anyone approves the print, so the slicer engine and its service
 * endpoint stay with the host, and so do the keys that describe the machine
 * (profile, plate, bed size, nozzle and filament diameters). The preset is not
 * one of them: the call's top-level `preset` is its only way in. The machine
 * tool registry refuses every other key.
 *
 * @public
 */
export const printOptionKeys = [
  'layerHeight',
  'walls',
  'infillPercent',
  'infillPattern',
  'supports',
  'nozzleTemperature',
  'bedTemperature',
  'printSpeed',
  'travelSpeed',
] as const;

/** @public */
export const listMachinesInputSchema = z.strictObject({});

/** @public */
export const getMachineInputSchema = z.strictObject({ machineId: machineChoiceSchema });

/*
 * An action's parameters stay a JSON object at runtime; the typeless input side
 * keeps the recursive JSON check off the wire (see the slicer options above).
 * The machine's own schema, which get_machine summarizes, validates the values.
 */
const actionParametersSchema = z
  .any()
  .describe("The action's parameters as get_machine lists them; {} or omitted when it takes none.")
  .pipe(z.record(z.string().min(1).max(64), z.json()));

/** @public */
export const machineActionInputSchema = z.strictObject({
  machineId: machineChoiceSchema,
  componentId: machineIdentitySchema.describe('The component the action belongs to, as get_machine lists it.'),
  action: machineIdentitySchema.describe('The action id, such as switch.set or run.pause.'),
  parameters: actionParametersSchema.optional(),
});

/** @public */
export const stopMachineInputSchema = z.strictObject({ machineId: machineChoiceSchema });

/** What a job runs: a CAD source Tau slices, or a finished program run as is. Exactly one. */
const jobSourceShape = {
  targetFile: rootedFilePathSchema
    .max(512)
    .optional()
    .describe('Project-relative CAD source file Tau slices; only for a machine with an fff process (a 3D printer).'),
  artifact: rootedFilePathSchema
    .max(512)
    .optional()
    .describe(
      'Project-relative finished program the machine runs as is, such as a .nc file; get_machine lists what it accepts.',
    ),
};

/** The slicing choices; they apply to a `targetFile` only. */
const slicingFields = ['preset', 'options', 'bambuStudio'] as const;

/** @public */
export const requestJobInputSchema = z
  .strictObject({
    profileId: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
      .optional()
      .describe('Saved preference profile for this request only; does not change the shared active profile.'),
    machineId: machineChoiceSchema,
    ...jobSourceShape,
    preset: z.enum(['fast', 'standard', 'fine']).optional(),
    plate: z
      .string()
      .min(1)
      .max(64)
      .optional()
      .describe(
        'Build plate installed, by its manifest plate id. Required when the machine does not report its plate; ask the person which plate is on it rather than guess.',
      ),
    options: slicerOptionsSchema.optional(),
    bambuStudio: z
      .strictObject({ profiles: printProfilesSchema.optional(), settings: bambuSettingsSchema.optional() })
      .optional()
      .describe('Only when get_print_profiles reports engine "bambu-studio".'),
  })
  .superRefine((input, context) => {
    if ((input.targetFile === undefined) === (input.artifact === undefined)) {
      context.addIssue({
        code: 'custom',
        path: ['targetFile'],
        message: 'Pass exactly one of targetFile or artifact.',
      });
    }
    if (input.artifact !== undefined) {
      for (const field of slicingFields.filter((key) => input[key] !== undefined)) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} slices a targetFile; an artifact runs as is.`,
        });
      }
    }
  });

/** @public */
export const getPrintProfilesInputSchema = z.strictObject({
  profileId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u)
    .optional()
    .describe('Saved preference profile to inspect; omit to use the shared active profile.'),
  machineId: machineChoiceSchema,
  profiles: printProfilesSchema.optional(),
  keys: z
    .array(z.string().min(1).max(128))
    .max(64)
    .optional()
    .describe('Setting keys to describe in full: title, description, type, unit, range and choices.'),
});

/** `check_job` prepares exactly as `request_job` would and asks the machine, recording nothing. @public */
export const checkJobInputSchema = requestJobInputSchema;

/** Every state a job can be observed in: `MachineJobState`, `@taucad/runtime/machine`. */
const jobStateSchema = z.enum([
  'preparing',
  'awaiting-approval',
  'approved',
  'transferring',
  'starting',
  'awaiting-start',
  'confirming',
  'started',
  'denied',
  'withdrawn',
  'rejected',
  'unknown',
  'failed',
]);

/** One fact a start depends on, with what clears it in words. */
const jobCheckSchema = z.looseObject({
  id: z.string(),
  label: z.string(),
  state: z.enum(['passed', 'attention', 'blocked', 'unknown']),
  detail: z.string().optional(),
  remedy: z.string().optional(),
});

/** What the program is, as the machine host read it. */
const programSchema = z.looseObject({
  name: z.string(),
  estimatedDuration: z.number().optional().describe('Milliseconds.'),
  preferences: machineSettingsProvenanceSchema.optional(),
  facts: z
    .looseObject({ process: z.string(), layers: z.number().optional(), filamentLength: z.number().optional() })
    .optional(),
});

/** The job fields a transcript reads. Checks list only those that have not passed. */
const jobRecordSchema = z.looseObject({
  jobId: z.string(),
  machineId: z.string(),
  state: jobStateSchema,
  program: programSchema,
  checks: z.array(jobCheckSchema).optional(),
  failure: z.looseObject({ code: z.string(), message: z.string() }).optional(),
  run: z.looseObject({ outcome: z.string() }).optional(),
});

/** Exact saved profile used by a print call; call arguments take precedence. */
const machinePreferencesReportSchema = z
  .looseObject({
    path: z.string(),
    typeId: z.string(),
    profileId: z.string(),
    profileName: z.string(),
    configurationVersions: z.record(z.string(), z.string()),
    applied: z.record(z.string(), z.json()).optional(),
  })
  .optional();

const sliceWarningsSchema = z
  .array(kernelIssueSchema)
  .optional()
  .describe(
    'What the slice could not honour although it was made, such as a multi-colour model sliced in one colour; tell the person.',
  );

/** @public */
export const listMachinesOutputSchema = z.string().describe('Every bound machine, one line each.');

/** @public */
export const getMachineOutputSchema = z
  .string()
  .describe('The machine as last observed: state, run, components, activities, alerts, actions and recent jobs.');

/** What became of an action or a stop. @public */
export const machineActionOutputSchema = z.looseObject({
  status: z
    .enum(['done', 'confirming', 'refused', 'needs-approval', 'denied', 'rejected', 'unknown'])
    .describe(
      'done: the machine took it (and showed the change, when it reports one); confirming: sent, not yet shown; refused: nothing was sent; needs-approval: a person must do it in Tau; denied: the person declined; rejected: the machine refused; unknown: whether it happened is unknown.',
    ),
  message: z.string().describe('What to tell the person, with any remedy.'),
  operationId: z.string().optional(),
  code: z.string().optional().describe('The machine failure code, when refused or rejected.'),
});

/** @public */
export const stopMachineOutputSchema = machineActionOutputSchema;

/** @public */
export const requestJobOutputSchema = z.looseObject({
  job: jobRecordSchema,
  machineName: z.string().optional().describe('Display name of the machine.'),
  approval: z
    .enum(['approved', 'denied', 'cancelled'])
    .optional()
    .describe('How the person answered, when the call waited for them.'),
  nextStep: z
    .string()
    .optional()
    .describe(
      'What to tell the person and do next, such as whether to retry; absent while the host is still working on the job.',
    ),
  machinePreferences: machinePreferencesReportSchema,
  warnings: sliceWarningsSchema,
});

/** @public */
export const checkJobOutputSchema = z.looseObject({
  status: z.enum(['ready', 'blocked', 'refused']),
  program: programSchema.optional(),
  checks: z.array(jobCheckSchema).optional(),
  message: z.string().optional().describe('Why the machine refused the program.'),
  machinePreferences: machinePreferencesReportSchema,
  warnings: sliceWarningsSchema,
});

/** @public */
export const getPrintProfilesOutputSchema = z.looseObject({
  engine: z.enum(['bambu-studio', 'reference']),
  reason: z.string().optional().describe('Why the reference engine slices for this machine.'),
  version: z.string().optional().describe('Bambu Studio version.'),
  defaults: z
    .looseObject({ printer: z.string(), process: z.string(), filaments: z.array(z.string()) })
    .optional()
    .describe('Presets request_job uses when profiles are omitted.'),
  machinePreferences: machinePreferencesReportSchema,
});

/** @public */
export type ListMachinesInput = z.infer<typeof listMachinesInputSchema>;
/** @public */
export type ListMachinesOutput = z.infer<typeof listMachinesOutputSchema>;
/** @public */
export type GetMachineInput = z.infer<typeof getMachineInputSchema>;
/** @public */
export type GetMachineOutput = z.infer<typeof getMachineOutputSchema>;
/** @public */
export type MachineActionInput = z.infer<typeof machineActionInputSchema>;
/** @public */
export type MachineActionOutput = z.infer<typeof machineActionOutputSchema>;
/** @public */
export type StopMachineInput = z.infer<typeof stopMachineInputSchema>;
/** @public */
export type StopMachineOutput = z.infer<typeof stopMachineOutputSchema>;
/** @public */
export type RequestJobInput = z.infer<typeof requestJobInputSchema>;
/** @public */
export type RequestJobOutput = z.infer<typeof requestJobOutputSchema>;
/** @public */
export type CheckJobInput = z.infer<typeof checkJobInputSchema>;
/** @public */
export type CheckJobOutput = z.infer<typeof checkJobOutputSchema>;
/** @public */
export type GetPrintProfilesInput = z.infer<typeof getPrintProfilesInputSchema>;
/** @public */
export type GetPrintProfilesOutput = z.infer<typeof getPrintProfilesOutputSchema>;
