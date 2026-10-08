import { z } from 'zod';
import {
  parseProjectManifestBytes,
  projectIdSchema,
  projectManifestSchemaUrl,
  projectRelativePathSchema,
  projectPartsSchema,
  projectToManifest,
} from '@taucad/project-core';
import type {
  AdoptableProjectManifest,
  ProjectManifest,
  ProjectManifestParseIssue as CoreProjectManifestParseIssue,
} from '@taucad/project-core';

/* oxlint-disable no-barrel-files/no-barrel-files -- This private entrypoint forwards the public project manifest authority without duplicating schemas. */
export {
  parseAdoptableProjectManifestBytes,
  parseProjectManifestBytes,
  projectIdSchema,
  projectManifestMaxBytes,
  projectManifestSchema,
  projectManifestSchemaUrl,
  projectRelativePathSchema,
  projectPartsSchema,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/project-core';
export type {
  AdoptableProjectManifest,
  AdoptableProjectManifestParseResult,
  ProjectManifest,
  ProjectManifestParseResult,
} from '@taucad/project-core';
/* oxlint-enable no-barrel-files/no-barrel-files */

/** Strict parser issues plus discovery's missing-manifest issue. @public */
export type ProjectManifestParseIssue = CoreProjectManifestParseIssue | { readonly code: 'manifest-missing' };

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
  parts: projectPartsSchema.optional().catch(undefined),
  syncChats: syncPreference,
  syncLargeExports: syncPreference,
});
/* oxlint-enable promise/prefer-await-to-then, unicorn/prefer-top-level-await */

const salvageDeclaration = (input: Record<string, unknown>): AdoptableProjectManifest => {
  const { name, description, tags, assets, parts, syncChats, syncLargeExports } = declarationSalvageSchema.parse(input);
  const { entryPath, thumbnail } = assets.main;
  return {
    $schema: projectManifestSchemaUrl,
    name,
    description,
    tags,
    assets: { main: { entryPath, ...(thumbnail === undefined ? {} : { thumbnail }) } },
    ...(parts === undefined ? {} : { parts }),
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
      'It holds only $schema, id, name, description, tags, assets.main (entryPath, optional thumbnail), syncChats, syncLargeExports and optional parts (include/exclude globs). Other source files need no manifest entry.',
    ].join('\n');
  }
  const existing = current === undefined ? undefined : readProjectManifestBytes(current);
  return existing?.success === true && existing.data.id !== proposed.data.id
    ? `tau.json must keep the project id ${existing.data.id}.`
    : undefined;
};
