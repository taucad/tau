import { z } from 'zod';

/** Canonical JSON Schema URL embedded in every `tau.json`. @public */
export const projectManifestSchemaUrl = 'https://tau.new/schemas/tau-schema-v1.json';
/** Maximum accepted encoded manifest size in bytes. @public */
export const projectManifestMaxBytes = 256 * 1024;

/** Runtime validator for stable Tau project identifiers. @public */
export const projectIdSchema = z.string().regex(/^proj_[\dA-Za-z]{21}$/);

/** Runtime validator for normalized project-relative POSIX paths. @public */
export const projectRelativePathSchema = z
  .string()
  .max(2048)
  .refine((path) => {
    if (path.length === 0 || path.includes('\0') || path.includes('\\') || path.startsWith('/')) {
      return false;
    }
    return path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
  }, 'Expected a normalized project-relative POSIX path');

const projectAssetSchema = z
  .object({
    entryPath: projectRelativePathSchema,
    thumbnail: projectRelativePathSchema.optional(),
  })
  .strict();

/** Strict runtime schema for the unreleased v1 `tau.json` contract. @public */
export const projectManifestSchema = z
  .object({
    $schema: z.literal(projectManifestSchemaUrl),
    id: projectIdSchema,
    name: z.string().max(200),
    description: z.string().max(10_000),
    tags: z.array(z.string().max(100)).max(64),
    assets: z
      .object({
        main: projectAssetSchema,
      })
      .strict(),
  })
  .strict();

/** Validated project manifest stored as `tau.json`. @public */
export type ProjectManifest = z.infer<typeof projectManifestSchema>;

/** Manifest fields accepted before assigning an identity during explicit adoption. @public */
export type AdoptableProjectManifest = Omit<ProjectManifest, 'id'>;

/** Fatal reason a manifest could not be parsed safely. @public */
export type ProjectManifestParseIssue =
  | { readonly code: 'manifest-too-large'; readonly maxBytes: number }
  | { readonly code: 'manifest-invalid-json'; readonly message: string }
  | {
      readonly code: 'manifest-unknown-schema';
      readonly found: unknown;
      readonly supported: typeof projectManifestSchemaUrl;
    }
  | { readonly code: 'manifest-invalid'; readonly issues: readonly z.core.$ZodIssue[] };

/** Result of parsing a fully identified manifest. @public */
export type ProjectManifestParseResult =
  | { readonly success: true; readonly data: ProjectManifest }
  | { readonly success: false; readonly issue: ProjectManifestParseIssue };

/** Result of parsing a manifest for explicit adoption. @public */
export type AdoptableProjectManifestParseResult =
  | { readonly success: true; readonly data: AdoptableProjectManifest }
  | { readonly success: false; readonly issue: ProjectManifestParseIssue };

const decodeProjectManifestBytes = (
  bytes: Uint8Array<ArrayBuffer>,
):
  | { readonly success: true; readonly input: unknown }
  | { readonly success: false; readonly issue: ProjectManifestParseIssue } => {
  if (bytes.byteLength > projectManifestMaxBytes) {
    return { success: false, issue: { code: 'manifest-too-large', maxBytes: projectManifestMaxBytes } };
  }

  let input: unknown;
  try {
    input = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    return {
      success: false,
      issue: { code: 'manifest-invalid-json', message: error instanceof Error ? error.message : String(error) },
    };
  }

  const foundSchema =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)['$schema']
      : undefined;
  if (foundSchema !== projectManifestSchemaUrl) {
    return {
      success: false,
      issue: {
        code: 'manifest-unknown-schema',
        found: foundSchema,
        supported: projectManifestSchemaUrl,
      },
    };
  }

  return { success: true, input };
};

/** Parse and validate encoded `tau.json` bytes. @public */
export const parseProjectManifestBytes = (bytes: Uint8Array<ArrayBuffer>): ProjectManifestParseResult => {
  const decoded = decodeProjectManifestBytes(bytes);
  if (!decoded.success) {
    return decoded;
  }
  const parsed = projectManifestSchema.safeParse(decoded.input);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, issue: { code: 'manifest-invalid', issues: parsed.error.issues } };
};

/**
 * Parse every manifest field except the identity used for an explicit Adopt
 * action. Only `id` is relaxed; every other field remains strict.
 * @public
 */
export const parseAdoptableProjectManifestBytes = (
  bytes: Uint8Array<ArrayBuffer>,
): AdoptableProjectManifestParseResult => {
  const decoded = decodeProjectManifestBytes(bytes);
  if (!decoded.success) {
    return decoded;
  }
  if (typeof decoded.input !== 'object' || decoded.input === null || Array.isArray(decoded.input)) {
    return { success: false, issue: { code: 'manifest-invalid', issues: [] } };
  }

  const { id: _ignoredId, ...input } = decoded.input as Record<string, unknown>;
  const parsed = projectManifestSchema.omit({ id: true }).safeParse(input);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, issue: { code: 'manifest-invalid', issues: parsed.error.issues } };
};

/**
 * Build the durable manifest from an app-owned project view. Extra local state
 * is deliberately ignored instead of leaking into `tau.json`.
 * @public
 */
export const projectToManifest = (project: Omit<ProjectManifest, '$schema'> | ProjectManifest): ProjectManifest => ({
  $schema: projectManifestSchemaUrl,
  id: project.id,
  name: project.name,
  description: project.description,
  tags: [...project.tags],
  assets: {
    main: {
      entryPath: project.assets.main.entryPath,
      ...(project.assets.main.thumbnail === undefined ? {} : { thumbnail: project.assets.main.thumbnail }),
    },
  },
});

/** Validate and deterministically encode a project manifest. @public */
export const serializeProjectManifest = (manifest: ProjectManifest): Uint8Array<ArrayBuffer> => {
  const parsed = projectManifestSchema.parse(manifest);
  return new TextEncoder().encode(`${JSON.stringify(parsed, null, 2)}\n`);
};
