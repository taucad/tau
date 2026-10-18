/**
 * The schema a host parses a native kernel composition with where it crosses a process boundary: a worker's or a
 * runtime child's input is untyped, so each composed row is checked against its own adopter's options schema.
 *
 * @module
 */
import { z } from 'zod';

import { nativeKernelAdopters } from '#adopters.js';
import type { NativeKernelComposition } from '#adopters.js';
import type { UnavailableNativeKernel } from '#unavailable-kernels.js';

const composedRowSchemas = nativeKernelAdopters.map((adopter) =>
  z.object({
    package: z.literal(adopter.package),
    kernel: z.string().min(1),
    closureRoot: z.string().min(1),
    options: adopter.optionsSchema,
  }),
);

type RowSchema = (typeof composedRowSchemas)[number];

const unavailableNativeKernelSchema: z.ZodType<UnavailableNativeKernel> = z.object({
  kernel: z.string().min(1),
  package: z.string().min(1),
  extensions: z.array(z.string()),
  reason: z.enum(['not-prepared', 'unsupported-target']),
  byteLength: z.number().int().nonnegative(),
  detail: z.string().optional(),
  refusal: z.string().optional(),
});

/**
 * Parses a {@link NativeKernelComposition} received from another process: every composed row's options against its
 * own adopter's schema, discriminated by `package`.
 * @public
 */
export const nativeCompositionSchema = z.object({
  // `Array.prototype.map` widens the roster tuple to an array, which is never empty.
  kernels: z.array(z.discriminatedUnion('package', composedRowSchemas as [RowSchema, ...RowSchema[]])),
  unavailable: z.array(unavailableNativeKernelSchema),
  closureRoots: z.array(z.string().min(1)),
  // Each row's options are parsed by the schema of the adopter its `package` names, which the widened row type cannot
  // express; the output is a `NativeKernelComposition`.
}) as z.ZodType<NativeKernelComposition>;
