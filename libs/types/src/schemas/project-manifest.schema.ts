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

/** Manifest fields accepted before assigning an identity during explicit adoption. @public */
export type AdoptableProjectManifest = Omit<ProjectManifest, 'id'>;

/**
 * Why a manifest is not strictly valid.
 *
 * `manifest-unreadable` and `manifest-missing` are never produced by parsing:
 * discovery raises them when the bytes could not be obtained (a provider
 * failure that is not simple absence), or when a directory holding Tau state
 * has lost its `tau.json`.
 *
 * @public
 */
export type ProjectManifestParseIssue =
  | { readonly code: 'manifest-unreadable'; readonly message: string }
  | { readonly code: 'manifest-missing' }
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

/**
 * Result of reading `tau.json` for use, as opposed to validating it.
 *
 * Identity (`$schema` and `id`) decides whether a project can be routed; the
 * rest of the declaration only degrades. A degraded result carries the strict
 * `issue` beside a normalized, strictly valid view of what could be kept.
 *
 * @public
 */
export type ProjectManifestReadResult =
  | {
      readonly success: true;
      /** Strictly valid: the bytes themselves, or their normalized view when `issue` is set. */
      readonly data: ProjectManifest;
      /** Present only when the bytes are identifiable but not strictly valid. */
      readonly issue?: ProjectManifestParseIssue;
    }
  | {
      readonly success: false;
      readonly issue: ProjectManifestParseIssue;
      /** The salvaged declaration an explicit Adopt would write, present when only the identity is missing. */
      readonly adoptable?: AdoptableProjectManifest;
    };

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

/** What a degraded manifest names as its main entry when its own `entryPath` is unusable. */
const fallbackEntryPath = 'main.ts';

/** The same file, spelled canonically: no `./`, leading `/`, backslashes or empty segments. */
const normalizeEntryPath = (path: string): string =>
  path
    .replaceAll('\\', '/')
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/');

/* oxlint-disable promise/prefer-await-to-then, unicorn/prefer-top-level-await -- zod's `.catch()` is a schema fallback, not Promise.catch(). */
const clampedString = (max: number) =>
  z
    .string()
    .transform((value) => value.slice(0, max))
    .catch('');

/* An unreadable sync preference fails closed: a project whose author wrote
 * `"syncChats": "no"` must not start pushing chats because Tau could not read it. */
const syncPreference = z.boolean().optional().catch(false);

/** Every declaration field of the strict schema, each with the fallback that keeps what is usable. */
const declarationSalvageSchema = z.object({
  name: clampedString(200),
  description: clampedString(10_000),
  tags: z
    .array(z.unknown())
    .transform((tags) =>
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.slice(0, 100))
        .slice(0, 64),
    )
    .catch([]),
  assets: z
    .object({
      main: z.object({
        entryPath: z.string().transform(normalizeEntryPath).pipe(projectRelativePathSchema).catch(fallbackEntryPath),
        thumbnail: projectRelativePathSchema.optional().catch(undefined),
      }),
    })
    .catch({ main: { entryPath: fallbackEntryPath, thumbnail: undefined } }),
  syncChats: syncPreference,
  syncLargeExports: syncPreference,
});
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */

const salvageDeclaration = (input: Record<string, unknown>): AdoptableProjectManifest => {
  const { name, description, tags, assets, syncChats, syncLargeExports } = declarationSalvageSchema.parse(input);
  const { entryPath, thumbnail } = assets.main;
  return {
    $schema: projectManifestSchemaUrl,
    name,
    description,
    tags,
    assets: { main: { entryPath, ...(thumbnail === undefined ? {} : { thumbnail }) } },
    ...(syncChats === undefined ? {} : { syncChats }),
    ...(syncLargeExports === undefined ? {} : { syncLargeExports }),
  };
};

/** Every value a string-valued key holds in text that is not JSON, decoded as JSON strings. */
const stringValuesOf = (text: string, key: string): string[] =>
  [...text.matchAll(new RegExp(String.raw`"${key}"\s*:\s*("(?:[^"\\\n]|\\.)*")`, 'g'))].flatMap(([, literal]) => {
    if (literal === undefined) {
      return [];
    }
    try {
      const value: unknown = JSON.parse(literal);
      return typeof value === 'string' ? [value] : [];
    } catch {
      return [];
    }
  });

/**
 * The manifest fields a syntax error left recognizable. The id counts only when
 * every occurrence agrees, so a merge conflict between two identities stays
 * unidentified. ponytail: key-level recovery, not a JSON repair — the person
 * fixes the text; this only keeps the project reachable while they do.
 */
const recoverFromText = (text: string): Record<string, unknown> => {
  const ids = new Set(stringValuesOf(text, 'id'));
  const [schema] = stringValuesOf(text, String.raw`\$schema`);
  return {
    ...(schema === undefined ? {} : { $schema: schema }),
    ...(ids.size === 1 ? { id: [...ids][0] } : {}),
    name: stringValuesOf(text, 'name')[0],
    assets: { main: { entryPath: stringValuesOf(text, 'entryPath')[0] } },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read `tau.json` bytes for use: strict when they are valid, degraded to a
 * normalized strict view when only the declaration is defective, and
 * unidentified — with the declaration an explicit Adopt would write — when the
 * identity is missing.
 *
 * Unknown keys are reported and dropped, never retained. Oversize bytes and a
 * present `$schema` other than v1 are refused outright: an older reader must
 * not reinterpret a newer contract.
 *
 * @param bytes - Encoded `tau.json`.
 * @param options - `id` is the identity of the mounted project these bytes were read through; it stands in only when the bytes carry no usable id.
 * @returns The strict, degraded, or unidentified reading.
 * @public
 */
export const readProjectManifestBytes = (
  bytes: Uint8Array<ArrayBuffer>,
  options: { readonly id?: string } = {},
): ProjectManifestReadResult => {
  const strict = parseProjectManifestBytes(bytes);
  if (strict.success) {
    return strict;
  }
  const { issue } = strict;
  if (issue.code === 'manifest-too-large' || (issue.code === 'manifest-unknown-schema' && issue.found !== undefined)) {
    return { success: false, issue };
  }

  let input: Record<string, unknown>;
  if (issue.code === 'manifest-invalid-json') {
    input = recoverFromText(new TextDecoder().decode(bytes));
    if (input['$schema'] !== undefined && input['$schema'] !== projectManifestSchemaUrl) {
      return {
        success: false,
        issue: { code: 'manifest-unknown-schema', found: input['$schema'], supported: projectManifestSchemaUrl },
      };
    }
  } else {
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
    input = isRecord(decoded) ? decoded : {};
  }

  const declaration = salvageDeclaration(input);
  const parsedId = projectIdSchema.safeParse(input['id']);
  const id = parsedId.success ? parsedId.data : options.id;
  return id === undefined
    ? { success: false, issue, adoptable: declaration }
    : { success: true, data: projectToManifest({ ...declaration, id }), issue };
};

/**
 * One readable line per defect, for people and for agent tool errors.
 *
 * @param issue - Why a manifest is not strictly valid.
 * @returns Lines such as `assets: Unrecognized key: "extra"`.
 * @public
 */
export const describeProjectManifestIssue = (issue: ProjectManifestParseIssue): readonly string[] => {
  switch (issue.code) {
    case 'manifest-unreadable': {
      return [`tau.json could not be read: ${issue.message}`];
    }
    case 'manifest-missing': {
      return ['tau.json is missing.'];
    }
    case 'manifest-too-large': {
      return [`tau.json is larger than ${issue.maxBytes} bytes.`];
    }
    case 'manifest-invalid-json': {
      return [`tau.json is not valid JSON: ${issue.message}`];
    }
    case 'manifest-unknown-schema': {
      return issue.found === undefined
        ? [`$schema is missing; expected ${issue.supported}.`]
        : [`$schema ${JSON.stringify(issue.found)} is not supported by this version of Tau.`];
    }
    case 'manifest-invalid': {
      return issue.issues.length === 0
        ? ['tau.json is not a JSON object.']
        : issue.issues.map(({ path, message }) =>
            path.length === 0 ? message : `${path.map(String).join('.')}: ${message}`,
          );
    }
  }
};

/**
 * Why replacing `tau.json` with `next` would damage the project, or
 * `undefined` when the replacement is a valid manifest that keeps the current
 * identity. Agent write paths call this before they commit a manifest.
 *
 * @param next - The proposed bytes.
 * @param current - The bytes on disk, when there are any.
 * @returns A message naming every defect, or `undefined`.
 * @public
 */
export const checkProjectManifestReplacement = (
  next: Uint8Array<ArrayBuffer>,
  current: Uint8Array<ArrayBuffer> | undefined,
): string | undefined => {
  const proposed = parseProjectManifestBytes(next);
  if (!proposed.success) {
    return [
      'tau.json must stay a valid Tau project manifest.',
      ...describeProjectManifestIssue(proposed.issue),
      'It holds only $schema, id, name, description, tags, assets.main (entryPath, optional thumbnail), syncChats and syncLargeExports. Other source files need no manifest entry.',
    ].join('\n');
  }
  const existing = current === undefined ? undefined : readProjectManifestBytes(current);
  return existing?.success === true && existing.data.id !== proposed.data.id
    ? `tau.json must keep the project id ${existing.data.id}.`
    : undefined;
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
  ...(project.syncChats === undefined ? {} : { syncChats: project.syncChats }),
  ...(project.syncLargeExports === undefined ? {} : { syncLargeExports: project.syncLargeExports }),
});

/** Validate and deterministically encode a project manifest. @public */
export const serializeProjectManifest = (manifest: ProjectManifest): Uint8Array<ArrayBuffer> => {
  const parsed = projectManifestSchema.parse(manifest);
  return new TextEncoder().encode(`${JSON.stringify(parsed, null, 2)}\n`);
};
