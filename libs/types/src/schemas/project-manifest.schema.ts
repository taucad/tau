import { z } from 'zod';
import { parseProjectManifestBytes, projectManifestSchemaUrl, projectRelativePathSchema } from '@taucad/project-core';
import type { ProjectManifest, ProjectManifestParseIssue as CoreProjectManifestParseIssue } from '@taucad/project-core';

/* oxlint-disable no-barrel-files/no-barrel-files -- This private entrypoint forwards the public project manifest authority without duplicating schemas. */
export {
  convertLegacyProjectManifestBytes,
  parseProjectManifestBytes,
  projectIdSchema,
  projectManifestMaxBytes,
  projectManifestSchema,
  projectManifestSchemaUrl,
  projectRelativePathSchema,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/project-core';
export type { ProjectManifest, ProjectManifestParseResult } from '@taucad/project-core';
/* oxlint-enable no-barrel-files/no-barrel-files */

/** Strict parser issues plus discovery's missing-manifest issue. @public */
export type ProjectManifestParseIssue = CoreProjectManifestParseIssue | { readonly code: 'manifest-missing' };

/**
 * Result of reading `tau.json` for use, as opposed to validating it.
 *
 * Identity is resolved separately from this declaration. A malformed supported
 * declaration degrades without changing the mounted project identity. A degraded result carries the strict
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

const salvageDeclaration = (input: Record<string, unknown>): ProjectManifest => {
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
 * Recover recognizable declaration fields from malformed text without changing
 * the source bytes. Identity is outside the authored declaration.
 */
const recoverFromText = (text: string): Record<string, unknown> => {
  const [schema] = stringValuesOf(text, String.raw`\$schema`);
  return {
    ...(schema === undefined ? {} : { $schema: schema }),
    name: stringValuesOf(text, 'name')[0],
    assets: { main: { entryPath: stringValuesOf(text, 'entryPath')[0] } },
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Read `tau.json` bytes for use: strict when they are valid, degraded to a
 * normalized strict view when the declaration is defective.
 *
 * Unknown keys are reported and dropped, never retained. Oversize bytes and a
 * present `$schema` other than v1 are refused outright: an older reader must
 * not reinterpret a newer contract.
 *
 * @param bytes - Encoded `tau.json`.
 * @returns The strict, degraded, or refused reading.
 * @public
 */
export const readProjectManifestBytes = (bytes: Uint8Array<ArrayBuffer>): ProjectManifestReadResult => {
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

  return { success: true, data: salvageDeclaration(input), issue };
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
 * `undefined` when the replacement is a valid authored manifest. Agent write
 * paths call this before committing a manifest. Identity is stored separately.
 *
 * @param next - The proposed bytes.
 * @returns A message naming every defect, or `undefined`.
 * @public
 */
export const checkProjectManifestReplacement = (next: Uint8Array<ArrayBuffer>): string | undefined => {
  const proposed = parseProjectManifestBytes(next);
  if (!proposed.success) {
    return [
      'tau.json must stay a valid Tau project manifest.',
      ...describeProjectManifestIssue(proposed.issue),
      'It holds only $schema, name, description, tags, assets.main (entryPath, optional thumbnail), syncChats and syncLargeExports. Other source files need no manifest entry.',
    ].join('\n');
  }
  return undefined;
};
