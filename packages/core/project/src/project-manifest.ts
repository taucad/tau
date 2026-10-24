import { z } from 'zod';

/** Canonical JSON Schema URL embedded in every `tau.json`. @public */
export const projectManifestSchemaUrl = 'https://tau.new/schemas/tau-v1.json';
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
    name: z.string().max(200),
    description: z.string().max(10_000),
    tags: z.array(z.string().max(100)).max(64),
    assets: z
      .object({
        main: projectAssetSchema,
      })
      .strict(),
    /* Absent means on. A project that should stay files-only carries
     * `"syncChats": false` and no `refs/tau/chats/*` is ever written for it, so
     * nothing exists for a push to offer (D25, A30, W17). It lives here rather
     * than in a host store because it is a property of the project: a clone
     * inherits the decision instead of quietly re-enabling it. */
    syncChats: z
      .boolean()
      .optional()
      .describe(
        "Whether this project's chats sync with its remotes. Absent means on; false keeps the project files-only, and no refs/tau/chats/* is written for it.",
      ),
    /* Generated exports are large, reproducible records. They stay device-local
     * unless the project explicitly opts into their dedicated evidence ref. */
    syncLargeExports: z
      .boolean()
      .optional()
      .describe('Whether generated exports and evidence sync on refs/tau/evidence/exports. Absent means off.'),
  })
  .strict();

/** Validated project manifest stored as `tau.json`. @public */
export type ProjectManifest = z.infer<typeof projectManifestSchema>;

/**
 * Fatal reason a manifest could not be read or parsed safely.
 *
 * `manifest-unreadable` is never produced by parsing — it is raised by
 * discovery when the manifest bytes could not be obtained at all (a provider
 * failure that is not simple absence).
 *
 * @public
 */
export type ProjectManifestParseIssue =
  | { readonly code: 'manifest-unreadable'; readonly message: string }
  | { readonly code: 'manifest-too-large'; readonly maxBytes: number }
  | { readonly code: 'manifest-invalid-json'; readonly message: string }
  | {
      readonly code: 'manifest-unknown-schema';
      readonly found: unknown;
      readonly supported: typeof projectManifestSchemaUrl;
    }
  | { readonly code: 'manifest-invalid'; readonly issues: readonly z.core.$ZodIssue[] };

/** Result of parsing an authored manifest. @public */
export type ProjectManifestParseResult =
  | { readonly success: true; readonly data: ProjectManifest }
  | { readonly success: false; readonly issue: ProjectManifestParseIssue };

const decodeProjectManifestBytes = (
  bytes: Uint8Array<ArrayBuffer>,
  schemaUrl: string = projectManifestSchemaUrl,
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
  if (foundSchema !== schemaUrl) {
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

/**
 * Parse and validate encoded `tau.json` bytes.
 * @param bytes - Encoded authored manifest.
 * @returns A strict declaration or a structured validation issue.
 * @public
 */
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
 * Build the durable manifest from an app-owned project view. Extra local state
 * is deliberately ignored instead of leaking into `tau.json`.
 * @param project - Runtime project view or authored declaration.
 * @returns Only the authored manifest fields.
 * @public
 */
export const projectToManifest = <Project extends Omit<ProjectManifest, '$schema'>>(
  project: Project,
): ProjectManifest => ({
  $schema: projectManifestSchemaUrl,
  name: project.name,
  description: project.description,
  tags: [...project.tags],
  assets: {
    main: {
      entryPath: project.assets.main.entryPath,
      ...(project.assets.main.thumbnail === undefined ? {} : { thumbnail: project.assets.main.thumbnail }),
    },
  },
  ...(project.syncChats === undefined ? {} : { syncChats: project.syncChats }),
  ...(project.syncLargeExports === undefined ? {} : { syncLargeExports: project.syncLargeExports }),
});

/**
 * Validate and deterministically encode a project manifest.
 * @param manifest - Strict authored declaration.
 * @returns Encoded manifest bytes with a trailing newline.
 * @public
 */
export const serializeProjectManifest = (manifest: ProjectManifest): Uint8Array<ArrayBuffer> => {
  const parsed = projectManifestSchema.parse(manifest);
  return new TextEncoder().encode(`${JSON.stringify(parsed, null, 2)}\n`);
};

/** Result of explicitly converting the previous prerelease manifest contract. @public */
export type LegacyProjectManifestConversionResult =
  | { readonly success: true; readonly data: { readonly projectId: string; readonly manifest: ProjectManifest } }
  | { readonly success: false; readonly issue: ProjectManifestParseIssue };

const legacyManifestSchemaUrl = 'https://tau.new/schemas/tau-schema-v1.json';
const legacyManifestSchema = projectManifestSchema.extend({
  $schema: z.literal(legacyManifestSchemaUrl),
  id: projectIdSchema,
});

/**
 * Convert only the previous strict prerelease contract. The host must persist
 * the returned identity before conditionally replacing the original bytes.
 * This does not rewrite historical Git objects or relax normal parsing.
 * @param bytes - Unmodified previous-contract manifest bytes.
 * @returns Preserved identity and converted declaration, or a validation issue.
 * @public
 */
export const convertLegacyProjectManifestBytes = (
  bytes: Uint8Array<ArrayBuffer>,
): LegacyProjectManifestConversionResult => {
  const decoded = decodeProjectManifestBytes(bytes, legacyManifestSchemaUrl);
  if (!decoded.success) {
    return decoded;
  }
  const parsed = legacyManifestSchema.safeParse(decoded.input);
  if (!parsed.success) {
    return { success: false, issue: { code: 'manifest-invalid', issues: parsed.error.issues } };
  }
  return {
    success: true,
    data: {
      projectId: parsed.data.id,
      manifest: projectToManifest({
        ...parsed.data,
        $schema: projectManifestSchemaUrl,
      }),
    },
  };
};
