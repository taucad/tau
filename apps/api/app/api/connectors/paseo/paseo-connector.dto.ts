import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const paseoPairRequestSchema = z
  .object({
    offer: z
      .string()
      .trim()
      .min(1)
      .max(2 ** 14),
    password: z
      .string()
      .min(1)
      .max(2 ** 10)
      .optional(),
    label: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export class PaseoPairRequestDto extends createZodDto(paseoPairRequestSchema) {}

/**
 * The directory record. Live session state (connected, last error, agent list)
 * belongs to whichever client holds the E2EE socket — since SP-10 that is the
 * browser, and the API cannot answer for it.
 */
export const paseoConnectionSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    serverId: z.string(),
    relayEndpoint: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export const paseoConnectionListSchema = z.object({ connections: z.array(paseoConnectionSchema) }).strict();

export class PaseoConnectionDto extends createZodDto(paseoConnectionSchema) {}
export class PaseoConnectionListDto extends createZodDto(paseoConnectionListSchema) {}

/**
 * Pairing material released to its owner so the page can open the session.
 *
 * Declared field-by-field rather than reused from `@getpaseo/protocol` so the
 * serializer is an explicit allowlist: a future upstream offer field cannot
 * start leaving Tau's API by accident.
 */
export const paseoConnectionOfferSchema = z
  .object({
    offer: z
      .object({
        v: z.literal(2),
        serverId: z.string(),
        daemonPublicKeyB64: z.string(),
        relay: z.object({ endpoint: z.string(), useTls: z.boolean().optional() }).strict(),
      })
      .strict(),
    password: z.string().optional(),
  })
  .strict();

export class PaseoConnectionOfferDto extends createZodDto(paseoConnectionOfferSchema) {}

export type PaseoPairRequest = z.infer<typeof paseoPairRequestSchema>;
export type PaseoPublicConnection = z.infer<typeof paseoConnectionSchema>;
export type PaseoConnectionOffer = z.infer<typeof paseoConnectionOfferSchema>;
