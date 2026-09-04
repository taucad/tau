/** Validate full-analysis data at the engine boundary without accepting live facets. */
import { z } from 'zod';
import { assertGeoSpecJsonValue } from '#engine/protocol.js';
import type { AnalyzeMeshResult } from '#mesh/load-mesh.js';
import type { GeometryStats } from '#mesh/types.js';
import { geometryDiagnosticSchema as diagnostic } from '#model/errors.js';

const vector = z.tuple([z.number(), z.number(), z.number()]);
const count = z.number().int().nonnegative();
const counts = { vertexCount: count, meshCount: count, triangleCount: count };
const triangleIdentity = { primitive: z.string(), triangleIndex: count };
const statistics = z.strictObject({
  ...counts,
  watertight: z.boolean(),
  meshQuality: z.strictObject({
    triangleCount: count,
    nonFiniteVertices: z.array(z.strictObject({ primitive: z.string(), vertexIndex: count, position: vector })),
    degenerateTriangles: z.array(z.strictObject({ ...triangleIdentity, area: z.number(), center: vector })),
    duplicateFaces: z.array(z.strictObject({ ...triangleIdentity, firstTriangleIndex: count })),
    triangles: z.array(
      z.strictObject({ ...triangleIdentity, a: vector, b: vector, c: vector, center: vector, area: z.number() }),
    ),
    surfaceArea: z.number(),
    signedVolume: z.number(),
    centerOfMass: vector.optional(),
  }),
  boundingBox: z
    .strictObject({
      size: vector,
      center: vector,
      primitives: z.array(
        z.strictObject({
          name: z.string(),
          color: z.string().optional(),
          vertices: count,
          aabb: z.strictObject({ min: vector, max: vector }),
        }),
      ),
    })
    .optional(),
}) satisfies z.ZodType<GeometryStats>;

const resultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    stats: statistics,
    subject: z.looseObject({
      kind: z.literal('geometry-subject'),
      subjectId: z.string().min(1),
      mesh: z.strictObject({ format: z.enum(['glb', 'gltf', 'mesh-buffer']), stats: z.strictObject(counts) }),
      provenance: z.looseObject({
        source: z.looseObject({ kind: z.string(), format: z.string() }),
        unit: z.string(),
        loader: z.string(),
      }),
      capabilities: z.array(z.looseObject({ kind: z.string(), feature: z.string() })),
      diagnostics: z.array(diagnostic),
    }),
  }),
  z.object({ success: z.literal(false), diagnostics: z.array(diagnostic).min(1) }),
]);

/**
 * Return an independent snapshot or reject malformed/non-finite evidence.
 * @param value - Untrusted host response.
 * @returns Detached, validated public data.
 */
export const parseMeshAnalysisResult = (value: unknown): AnalyzeMeshResult => {
  assertGeoSpecJsonValue(value);
  return structuredClone(resultSchema.parse(value)) as AnalyzeMeshResult;
};
