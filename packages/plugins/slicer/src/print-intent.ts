/**
 * A project's print intent: the printer model plus the print settings a person or agent changed.
 *
 * It lives in the project at {@link printIntentPath}, so it is versioned and travels with the
 * design. Only changed values are stored; an absent key means the default Bambu Studio or the
 * reference slicer resolves. The file never names a machine, an address or anything the printer
 * reports, and it carries no version: a retired shape reads as invalid and its bytes stay as they
 * are.
 *
 * @module
 */

import { z } from 'zod';

import { slicerOptionsSchema } from '#slicer-options.js';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
/** 64 KiB: the reader refuses anything larger and the serializer never writes it. */
const maximumPrintIntentBytes = 65_536;

const reference = slicerOptionsSchema.shape;
const bambuStudio = reference.bambuStudio.unwrap().shape;

/**
 * Project-relative path of a project's print intent.
 *
 * @public
 */
export const printIntentPath = '.tau/machines/printer.json';

/**
 * The strict shape of {@link printIntentPath}.
 *
 * Every piece is the slicer's own option schema, with the reference slicer's defaults removed so
 * that parsing never adds a key the file did not hold. An unknown key refuses the whole file.
 *
 * @public
 */
export const printIntentSchema = z.strictObject({
  /** The machine manifest's `identity.model`, for example `X1C`; readers apply the file only to that model. */
  model: bambuStudio.hints.unwrap().shape.model,
  /** Quality preset. */
  preset: reference.preset.unwrap().optional(),
  printer: bambuStudio.printer,
  process: bambuStudio.process,
  /** Bambu Studio filament preset per AMS slot, keyed `"0"` to `"15"`. */
  filaments: z.record(z.string().regex(/^(?:\d|1[0-5])$/u), bambuStudio.filaments.unwrap().element).optional(),
  plate: bambuStudio.plate,
  settings: bambuStudio.settings,
  /**
   * Reference-slicer options, limited to the print-quality keys `request_print` accepts
   * (`requestPrintOptionKeys` in the chat tool schemas, which this package cannot import).
   */
  options: z
    .strictObject({
      layerHeight: reference.layerHeight,
      walls: reference.walls.unwrap().optional(),
      infillPercent: reference.infillPercent.unwrap().optional(),
      infillPattern: reference.infillPattern.unwrap().optional(),
      supports: reference.supports.unwrap().optional(),
      nozzleTemperature: reference.nozzleTemperature.unwrap().optional(),
      bedTemperature: reference.bedTemperature.unwrap().optional(),
      printSpeed: reference.printSpeed.unwrap().optional(),
      travelSpeed: reference.travelSpeed.unwrap().optional(),
    })
    .optional(),
});

/** A validated print intent: `model` plus the changed settings. @public */
export type PrintIntent = z.output<typeof printIntentSchema>;

/**
 * Refuses an own `__proto__` key at any depth. zod skips that key instead of calling it unknown,
 * so the strict schema would pass the file and the next rewrite would drop the key unseen.
 *
 * @param key - The member name `JSON.parse` is building.
 * @param value - Its parsed value.
 * @returns `value` unchanged.
 */
const refuseProtoKey = (key: string, value: unknown): unknown => {
  if (key === '__proto__') {
    throw new SyntaxError('A print intent has no "__proto__" key.');
  }
  return value;
};

/**
 * Read a print intent from the bytes of {@link printIntentPath}.
 *
 * Never throws. Bytes over 64 KiB, invalid UTF-8, invalid JSON and anything the strict schema
 * refuses read as `invalid-preserved`: the caller falls back to defaults and leaves the bytes
 * untouched.
 *
 * @param bytes - The file's bytes.
 * @returns The intent, or `invalid-preserved` when the bytes are not one.
 * @public
 * @example <caption>Read the quality preset a project chose</caption>
 * ```typescript
 * import { readPrintIntent } from '@taucad/slicer';
 *
 * const read = readPrintIntent(new TextEncoder().encode('{"model":"X1C","preset":"fine"}'));
 * const preset = read.status === 'current' ? read.intent.preset : undefined; // 'fine'
 * ```
 */
export const readPrintIntent = (
  bytes: Uint8Array<ArrayBuffer>,
): { status: 'current'; intent: PrintIntent } | { status: 'invalid-preserved' } => {
  if (bytes.byteLength > maximumPrintIntentBytes) {
    return { status: 'invalid-preserved' };
  }
  try {
    const parsed = printIntentSchema.safeParse(JSON.parse(decoder.decode(bytes), refuseProtoKey));
    return parsed.success ? { status: 'current', intent: parsed.data } : { status: 'invalid-preserved' };
  } catch {
    return { status: 'invalid-preserved' };
  }
};

/**
 * Orders object keys at every level: index-like keys such as the filament slots numerically, as
 * every JavaScript object orders them, then the rest by UTF-16 code unit. Arrays keep their order.
 *
 * @param _key - The member name `JSON.stringify` is writing.
 * @param value - Its value.
 * @returns `value`, or a copy of an object with its keys sorted.
 */
const sortKeys = (_key: string, value: unknown): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).toSorted(([left], [right]) => (left < right ? -1 : 1)))
    : value;

/**
 * Serialize a print intent canonically: sorted keys at every level, a two-space indent and a
 * trailing newline, so equal intents give equal bytes.
 *
 * @param intent - The intent to write.
 * @returns The text of {@link printIntentPath}.
 * @throws ZodError - When `intent` fails {@link printIntentSchema}.
 * @throws RangeError - When the text is over the 64 KiB {@link readPrintIntent} accepts.
 * @public
 * @example <caption>Keys come out sorted whatever order they went in</caption>
 * ```typescript
 * import { serializePrintIntent } from '@taucad/slicer';
 *
 * const text = serializePrintIntent({ settings: { wall_loops: 3 }, model: 'X1C' });
 * // '{\n  "model": "X1C",\n  "settings": {\n    "wall_loops": 3\n  }\n}\n'
 * ```
 */
export const serializePrintIntent = (intent: PrintIntent): string => {
  const text = `${JSON.stringify(printIntentSchema.parse(intent), sortKeys, 2)}\n`;
  if (encoder.encode(text).byteLength > maximumPrintIntentBytes) {
    throw new RangeError('A print intent is at most 64 KiB; shorten its Bambu Studio setting overrides.');
  }
  return text;
};
