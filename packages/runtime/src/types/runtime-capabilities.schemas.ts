/** Runtime capability manifest wire admission shared by the document protocol. @internal */
import { z } from 'zod';
import { runtimeCapabilityKinds } from '#plugins/plugin-types.js';
import { runtimeContentSchema } from '#types/runtime-content.types.js';
import { exportFidelityValues } from '@taucad/types/constants';
import type { JSONSchema7 } from '@taucad/json-schema';
import { isJsonSchema, isWireJson } from '#types/runtime-metadata-validation.js';

/**
 * Keep exact registration branches while emitting a Zod 4.0-compatible union type.
 * @param discriminator - The wire discriminator.
 * @param branches - The validated registration variants.
 * @returns The discriminated parser under the stable union type.
 */
const discriminatedRegistrationUnion = <
  const Branches extends readonly [z.core.$ZodTypeDiscriminable, ...z.core.$ZodTypeDiscriminable[]],
>(
  discriminator: string,
  branches: Branches,
): z.ZodUnion<Branches> => z.discriminatedUnion(discriminator, branches);

const runtimePluginPermissionsSchema = z
  .object({
    network: z.array(z.string()).readonly().optional(),
    filesystemWrite: z.boolean().optional(),
  })
  .catchall(z.unknown());

const runtimeRegistrationCommonShape = {
  id: z.string(),
  permissions: runtimePluginPermissionsSchema.optional(),
} as const;

const knownRuntimeCapabilityRegistrationSchema = discriminatedRegistrationUnion('kind', [
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('kernel'),
      extensions: z.array(z.string()).readonly(),
    })
    .catchall(z.unknown()),
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('middleware'),
    })
    .catchall(z.unknown()),
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('bundler'),
    })
    .catchall(z.unknown()),
  z
    .object({
      ...runtimeRegistrationCommonShape,
      kind: z.literal('transcoder'),
    })
    .catchall(z.unknown()),
]);

const unknownRuntimeCapabilityRegistrationSchema = z
  .object({
    kind: z.string(),
    id: z.string(),
  })
  .catchall(z.unknown())
  .refine(({ kind }) => !runtimeCapabilityKinds.includes(kind as (typeof runtimeCapabilityKinds)[number]));

const runtimeCapabilityRegistrationSchema = z.union([
  knownRuntimeCapabilityRegistrationSchema,
  unknownRuntimeCapabilityRegistrationSchema,
]);

const contentCapabilitySchema = z
  .object({
    schema: z.custom<JSONSchema7>(isJsonSchema),
    defaults: runtimeContentSchema,
  })
  .catchall(z.unknown());

const exportRouteSchema = z
  .object({
    targetFormat: z.string().min(1),
    kernelId: z.string(),
    sourceFormat: z.string().min(1),
    transcoderId: z.string().optional(),
    fidelity: z.enum(exportFidelityValues),
    exportOptions: z
      .object({
        schema: z.custom<JSONSchema7>(isJsonSchema),
        defaults: z.record(z.string(), z.custom<unknown>(isWireJson)),
      })
      .catchall(z.unknown()),
    content: contentCapabilitySchema.optional(),
  })
  .catchall(z.unknown());

const renderCapabilitySchema = z
  .object({
    renderOptions: z
      .object({
        schema: z.custom<JSONSchema7>(isJsonSchema),
        defaults: z.record(z.string(), z.custom<unknown>(isWireJson)),
      })
      .catchall(z.unknown()),
    content: contentCapabilitySchema.optional(),
    cancellation: z.literal('cooperative').optional(),
  })
  .catchall(z.unknown());

export const capabilitiesManifestSchema = z
  .object({
    registrations: z
      .array(runtimeCapabilityRegistrationSchema)
      .transform((registrations) =>
        registrations.filter(
          (registration): registration is z.output<typeof knownRuntimeCapabilityRegistrationSchema> =>
            runtimeCapabilityKinds.includes(registration.kind as (typeof runtimeCapabilityKinds)[number]),
        ),
      )
      .readonly(),
    routes: z.array(exportRouteSchema).readonly(),
    renderCapabilities: z.record(z.string(), renderCapabilitySchema.optional()),
  })
  .catchall(z.unknown());
