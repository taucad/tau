import { z } from 'zod';

/** A KiCad pad as the atopile worker reports it, in KiCad millimetres (Y down). */
const atopilePadSchema = z.object({
  name: z.string(),
  type: z.string(),
  shape: z.string(),
  x: z.number(),
  y: z.number(),
  localX: z.number(),
  localY: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
  drill: z.number().nullable(),
  net: z.string().nullable(),
});

/** A 3D model a footprint references; `base64` is present when the worker could embed the file. */
const atopileModelSchema = z.object({
  path: z.string(),
  offset: z.tuple([z.number(), z.number(), z.number()]),
  rotate: z.tuple([z.number(), z.number(), z.number()]),
  scale: z.tuple([z.number(), z.number(), z.number()]),
  format: z.string().optional(),
  base64: z.string().optional(),
});

const atopileComponentSchema = z.object({
  designator: z.string(),
  address: z.string(),
  footprint: z.string(),
  layer: z.string(),
  x: z.number(),
  y: z.number(),
  rotation: z.number(),
  lcsc: z.string().nullish(),
  manufacturer: z.string().nullish(),
  mpn: z.string().nullish(),
  value: z.string().nullish(),
  datasheet: z.string().nullish(),
  pads: z.array(atopilePadSchema),
  models: z.array(atopileModelSchema),
});

/** A row of atopile's own `<build>.bom.json`. Only the fields Tau reads are typed. */
const atopileBomRowSchema = z.looseObject({
  lcsc: z.string().nullish(),
  manufacturer: z.string().nullish(),
  mpn: z.string().nullish(),
  type: z.string().nullish(),
  value: z.string().nullish(),
  package: z.string().nullish(),
  quantity: z.number(),
  datasheet: z.string().nullish(),
  usages: z.array(z.object({ address: z.string(), designator: z.string() })),
});

/** The board IR: everything Tau renders comes from atopile's KiCad PCB and BOM. */
export const atopileBoardSchema = z.object({
  irVersion: z.literal(1),
  build: z.string(),
  outline: z.array(z.tuple([z.number(), z.number()])),
  components: z.array(atopileComponentSchema),
  nets: z.array(
    z.object({
      name: z.string(),
      pads: z.array(z.tuple([z.string(), z.string()])),
    }),
  ),
  bom: z.array(atopileBomRowSchema),
  kicadPcb: z.string(),
});

const atopileWorkerIssueSchema = z.object({
  message: z.string(),
  severity: z.enum(['error', 'warning']),
  details: z.record(z.string(), z.unknown()),
});

/** One JSON document the worker prints on stdout. */
export const atopileWorkerResultSchema = z.discriminatedUnion('ok', [
  z.object({
    ok: z.literal(true),
    atopileVersion: z.string(),
    issues: z.array(atopileWorkerIssueSchema),
    ir: atopileBoardSchema,
  }),
  z.object({
    ok: z.literal(false),
    atopileVersion: z.string(),
    issues: z.array(atopileWorkerIssueSchema),
    log: z.string(),
  }),
]);

/** The board IR the worker reports. */
export type AtopileBoard = z.output<typeof atopileBoardSchema>;
/** One footprint of the board IR. */
export type AtopileComponent = AtopileBoard['components'][number];
/** One pad of a footprint. */
export type AtopilePad = AtopileComponent['pads'][number];
