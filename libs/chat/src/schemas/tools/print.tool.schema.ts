import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

/*
 * The print tools a CAD agent is offered. The machine host owns their behavior
 * (`@taucad/agent-tools` `createMachineToolRegistry`) and imports these inputs,
 * so the model, the registry and the transcript read one contract.
 */

/** A machine, request or provider-run id, exactly as the machine host issued it. */
const machineIdentitySchema = z.string().min(1).max(256);

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

/**
 * The slicer options `request_print` accepts: print quality only. Slicing runs
 * before anyone approves the print, so the slicer engine and its service
 * endpoint stay with the host, and so do the keys that describe the machine
 * (profile, plate, bed size, nozzle and filament diameters). The preset is not
 * one of them: the call's top-level `preset` is its only way in. The machine
 * tool registry refuses every other key.
 *
 * @public
 */
export const requestPrintOptionKeys = [
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
export const getMachineInputSchema = z.strictObject({
  machineId: machineIdentitySchema.optional().describe('Omit when exactly one machine is bound.'),
});

/** @public */
export const requestPrintInputSchema = z.strictObject({
  machineId: machineIdentitySchema.optional().describe('Omit when exactly one machine is bound.'),
  targetFile: rootedFilePathSchema.max(512).describe('Project-relative CAD source file to slice and print.'),
  preset: z.enum(['fast', 'standard', 'fine']).optional(),
  options: slicerOptionsSchema.optional(),
});

/** @public */
export const getPrintRequestInputSchema = z.strictObject({
  requestId: machineIdentitySchema,
});

/** @public */
export const listPrintRequestsInputSchema = z.strictObject({
  machineId: machineIdentitySchema.optional().describe('Only requests for this machine.'),
});

/**
 * The fields `cancel_print` takes. Which combination is valid (a request alone,
 * or a machine with its observed provider run) is checked by the tool itself:
 * a refined object cannot be relaxed for a streaming tool part.
 *
 * @public
 */
export const cancelPrintInputSchema = z.strictObject({
  requestId: machineIdentitySchema.optional(),
  machineId: machineIdentitySchema.optional(),
  expectedProviderRunId: machineIdentitySchema.optional(),
});

/** Every state the machine host's print request ledger records. */
const printRequestStateSchema = z.enum([
  'preparing',
  'awaiting-approval',
  'approved',
  'uploading',
  'starting',
  'started',
  'denied',
  'withdrawn',
  'rejected',
  'unknown',
  'failed',
]);

/**
 * The print request fields a transcript reads. The ledger's record
 * (`PrintRequest`, `@taucad/runtime/machine`) carries more and passes through.
 */
const printRequestRecordSchema = z.looseObject({
  requestId: z.string(),
  machineId: z.string(),
  state: printRequestStateSchema,
  summary: z.looseObject({
    fileName: z.string(),
    layers: z.number().optional(),
    estimatedDuration: z.number().optional().describe('Seconds.'),
    filamentLength: z.number().optional().describe('Millimetres of filament.'),
  }),
  failure: z.looseObject({ code: z.string(), message: z.string() }).optional(),
});

/** @public */
export const getMachineOutputSchema = z.looseObject({ machineId: z.string() });

/** @public */
export const requestPrintOutputSchema = z.looseObject({
  request: printRequestRecordSchema,
  machineName: z.string().optional().describe('Display name of the machine.'),
  approval: z
    .enum(['approved', 'denied', 'cancelled'])
    .optional()
    .describe('How the person answered, when the call waited for them.'),
  nextStep: z.string().optional(),
});

/** @public */
export const getPrintRequestOutputSchema = z.looseObject({ request: printRequestRecordSchema });

/** @public */
export const listPrintRequestsOutputSchema = z.looseObject({
  requests: z.array(printRequestRecordSchema),
  total: z.number().int().nonnegative(),
});

/** A request it withdrew or cancelled, or the receipt of a run it cancelled directly. @public */
export const cancelPrintOutputSchema = z.looseObject({ request: printRequestRecordSchema.optional() });

/** @public */
export type GetMachineInput = z.infer<typeof getMachineInputSchema>;
/** @public */
export type GetMachineOutput = z.infer<typeof getMachineOutputSchema>;
/** @public */
export type RequestPrintInput = z.infer<typeof requestPrintInputSchema>;
/** @public */
export type RequestPrintOutput = z.infer<typeof requestPrintOutputSchema>;
/** @public */
export type GetPrintRequestInput = z.infer<typeof getPrintRequestInputSchema>;
/** @public */
export type GetPrintRequestOutput = z.infer<typeof getPrintRequestOutputSchema>;
/** @public */
export type ListPrintRequestsInput = z.infer<typeof listPrintRequestsInputSchema>;
/** @public */
export type ListPrintRequestsOutput = z.infer<typeof listPrintRequestsOutputSchema>;
/** @public */
export type CancelPrintInput = z.infer<typeof cancelPrintInputSchema>;
/** @public */
export type CancelPrintOutput = z.infer<typeof cancelPrintOutputSchema>;
