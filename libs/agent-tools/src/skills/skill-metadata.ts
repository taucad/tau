/**
 * Skill frontmatter parsing, validation, fingerprinting and shadow merging.
 *
 * A `SKILL.md` follows the Agent Skills specification (agentskills.io): its
 * frontmatter is YAML with `name` and `description`, and optionally `license`,
 * `compatibility`, `metadata` and `allowed-tools`. Nothing else is a top-level
 * field. What Tau itself keeps about a skill (`source`, `version`, `enabled`)
 * lives under `metadata`, the specification's own extension point.
 *
 * Pure over strings, so the same rules apply whether the SKILL.md came off a
 * browser filesystem bridge, a daemon's disk, or a compiled-in catalog.
 *
 * @module
 */

import { load } from 'js-yaml';
import type { SkillMetadata } from '@taucad/chat';
import { hashString } from '@taucad/utils/hash';

const frontmatterMatch = /^---\r?\n([\S\s]*?)\r?\n---(?:\r?\n|$)/;
const skillFileSuffix = /\/SKILL\.md$/;

/** The one workspace directory a host discovers authored skills in. @public */
export const canonicalSkillsDirectory = '.agents/skills';

/** The top-level frontmatter fields the Agent Skills specification defines. @public */
export const skillFrontmatterFields: readonly string[] = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
];

const nameMaxLength = 64;
const descriptionMaxLength = 1024;
const compatibilityMaxLength = 500;
/* Lowercase letters, digits and single hyphens, neither leading nor trailing. */
const namePattern = /^[\da-z]+(?:-[\da-z]+)*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Quote plain scalars that hold `: `, the one malformation skills written for
 * other clients commonly carry (`description: Use when: the user asks`). The
 * specification's client guide suggests this retry before giving a file up.
 */
const quoteColonValues = (yaml: string): string =>
  yaml.replaceAll(/^([A-Za-z][\w-]*):[\t ]+(?!["'>|])(.*:\s.*)$/gmu, (_line, key: string, value: string) => {
    return `${key}: ${JSON.stringify(value)}`;
  });

/**
 * Read a SKILL.md's YAML frontmatter.
 *
 * @param content - Raw SKILL.md text.
 * @returns The frontmatter mapping, or `undefined` when the file has none or it cannot be parsed.
 * @public
 */
export function readSkillFrontmatter(content: string): Record<string, unknown> | undefined {
  const block = frontmatterMatch.exec(content)?.[1];
  if (block === undefined) {
    return undefined;
  }
  for (const candidate of [block, quoteColonValues(block)]) {
    try {
      const parsed = load(candidate);
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Unparseable as written: the quoted retry follows, then the file is skipped.
    }
  }
  return undefined;
}

/**
 * A frontmatter `metadata` mapping as the specification types it: string keys to string values.
 *
 * @param frontmatter - Parsed frontmatter.
 * @returns Every scalar entry as a string; nested values are left out.
 */
const metadataOf = (frontmatter: Record<string, unknown>): Record<string, string> => {
  const { metadata } = frontmatter;
  if (!isRecord(metadata)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => [key, String(value)]),
  );
};

/**
 * Check a skill's frontmatter against the Agent Skills specification.
 *
 * These never stop a skill loading: the specification's client guide asks a
 * client to warn and load, so skills written for other clients keep working.
 * Only a missing `name` or `description`, or YAML that cannot be parsed, skips
 * a skill, and {@link parseSkillFrontmatter} decides that.
 *
 * @param frontmatter - Parsed frontmatter.
 * @param directoryName - The skill's parent directory name, when it has one.
 * @returns One sentence per departure from the specification; empty when it conforms.
 * @public
 */
export function validateSkillFrontmatter(frontmatter: Record<string, unknown>, directoryName?: string): string[] {
  const diagnostics: string[] = [];
  const { name, description, compatibility, metadata } = frontmatter;
  if (typeof name === 'string') {
    if (name.length > nameMaxLength) {
      diagnostics.push(`name is ${String(name.length)} characters; the limit is ${String(nameMaxLength)}.`);
    }
    if (!namePattern.test(name)) {
      diagnostics.push(
        'name may hold only lowercase letters, digits and single hyphens, and may not start or end with a hyphen.',
      );
    }
    if (directoryName !== undefined && name !== directoryName) {
      diagnostics.push(`name "${name}" does not match its directory "${directoryName}".`);
    }
  }
  if (typeof description === 'string' && description.length > descriptionMaxLength) {
    diagnostics.push(
      `description is ${String(description.length)} characters; the limit is ${String(descriptionMaxLength)}.`,
    );
  }
  if (compatibility !== undefined && (typeof compatibility !== 'string' || compatibility.length === 0)) {
    diagnostics.push('compatibility must be a non-empty string when present.');
  } else if (typeof compatibility === 'string' && compatibility.length > compatibilityMaxLength) {
    diagnostics.push(
      `compatibility is ${String(compatibility.length)} characters; the limit is ${String(compatibilityMaxLength)}.`,
    );
  }
  if (
    metadata !== undefined &&
    (!isRecord(metadata) || Object.values(metadata).some((value) => typeof value !== 'string'))
  ) {
    diagnostics.push('metadata must map string keys to string values.');
  }
  for (const key of Object.keys(frontmatter)) {
    if (!skillFrontmatterFields.includes(key)) {
      diagnostics.push(`"${key}" is not a field of the Agent Skills specification; put client data under metadata.`);
    }
  }
  return diagnostics;
}

/**
 * Content fingerprint used for skill change-detection. Delegates to the
 * canonical djb2 `hashString`; the value is compared only for equality.
 *
 * @param content - Raw SKILL.md text.
 * @returns The content fingerprint.
 * @public
 */
export function fingerprintSkillContent(content: string): string {
  return hashString(content);
}

/**
 * Parse a SKILL.md's frontmatter into the skill's catalog metadata.
 *
 * `name` and `description` come from the specification's own fields. Tau's
 * `source`, `version` and `enabled` are read from `metadata`, each a string as
 * the specification types that mapping (`enabled: "false"` hides a skill). The
 * markdown body stays untouched for the agent.
 *
 * @param content - Raw file content of the SKILL.md
 * @param filePath - Path to the SKILL.md file (e.g. `.agents/skills/my-skill/SKILL.md`)
 * @param options - Source, resource URI and path overrides for virtual skills.
 * @returns Parsed skill metadata, or undefined when the frontmatter is missing,
 *   unparseable, or lacks a name or a description.
 * @public
 */
export function parseSkillFrontmatter(
  content: string,
  filePath: string,
  options?: { source?: string; resourceUri?: string; path?: string; skillPath?: string },
): SkillMetadata | undefined {
  const frontmatter = readSkillFrontmatter(content);
  if (frontmatter === undefined) {
    return undefined;
  }

  const { name, description } = frontmatter;
  if (typeof name !== 'string' || name === '' || typeof description !== 'string' || description.trim() === '') {
    return undefined;
  }

  const skillPath = options?.skillPath ?? (filePath.endsWith('/SKILL.md') ? filePath : undefined);
  const path = options?.path ?? (skillPath ? filePath.replace(skillFileSuffix, '') : undefined);
  const metadata = metadataOf(frontmatter);
  const diagnostics = validateSkillFrontmatter(frontmatter, path?.slice(path.lastIndexOf('/') + 1));

  return {
    name,
    description: description.trim(),
    resourceUri: options?.resourceUri ?? `file:${filePath}`,
    ...(path !== undefined && { path }),
    ...(skillPath !== undefined && { skillPath }),
    source: metadata['source'] ?? options?.source,
    version: metadata['version'],
    fingerprint: fingerprintSkillContent(content),
    enabled: metadata['enabled'] !== 'false',
    ...(diagnostics.length > 0 && { diagnostics }),
  };
}

/**
 * Collapse same-named skills to one active entry, recording what it shadows.
 *
 * @param skills - Every discovered skill across all sources.
 * @returns One entry per name, sorted by name.
 * @public
 */
export function mergeSkillMetadata(skills: SkillMetadata[]): SkillMetadata[] {
  const byName = new Map<string, SkillMetadata[]>();
  for (const skill of skills) {
    const existing = byName.get(skill.name) ?? [];
    existing.push(skill);
    byName.set(skill.name, existing);
  }

  const merged: SkillMetadata[] = [];
  for (const entries of byName.values()) {
    const sorted = [...entries].sort((a, b) => sourcePriority(b.source) - sourcePriority(a.source));
    const active = sorted[0]!;
    const shadowedSources = sorted.slice(1).map((entry) => ({
      source: entry.source ?? 'unknown',
      ...(entry.resourceUri !== undefined && { resourceUri: entry.resourceUri }),
      ...(entry.path !== undefined && { path: entry.path }),
      ...(entry.skillPath !== undefined && { skillPath: entry.skillPath }),
      ...(entry.fingerprint !== undefined && { fingerprint: entry.fingerprint }),
    }));
    merged.push({
      ...active,
      ...(shadowedSources.length > 0 && { shadowedSources }),
    });
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

function sourcePriority(source: string | undefined): number {
  switch (source) {
    case 'user': {
      return 100;
    }
    case 'tau-store': {
      return 80;
    }
    case 'system': {
      return 60;
    }
    default: {
      return 50;
    }
  }
}
