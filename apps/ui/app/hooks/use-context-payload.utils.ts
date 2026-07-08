import type { SkillMetadata } from '@taucad/chat';
import { hashString } from '@taucad/utils/hash';

const frontmatterMatch = /^---\n([\S\s]*?)\n---/;
const skillFileSuffix = /\/SKILL\.md$/;

export const canonicalSkillsDirectory = '.agents/skills';
export const legacySkillsDirectory = '.tau/skills';

export type SkillSourceLayer = {
  readonly directory: string;
  readonly source: string;
  readonly priority: number;
};

export const defaultSkillSourceLayers: readonly SkillSourceLayer[] = [
  { directory: canonicalSkillsDirectory, source: 'user', priority: 100 },
  { directory: legacySkillsDirectory, source: 'legacy', priority: 10 },
];

function parseScalar(frontmatter: string, key: string): string | undefined {
  return new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm').exec(frontmatter)?.[1];
}

function parseBoolean(frontmatter: string, key: string): boolean | undefined {
  const value = parseScalar(frontmatter, key);
  if (value === undefined) {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return undefined;
}

/**
 * Content fingerprint used for skill change-detection. Delegates to the
 * canonical djb2 `hashString`; the value is compared only for equality.
 */
export function fingerprintSkillContent(content: string): string {
  return hashString(content);
}

/**
 * Parse YAML frontmatter from a SKILL.md file to extract skill metadata.
 * Uses a small scalar parser because skill metadata only needs flat string and
 * boolean fields; the markdown body stays untouched for the agent.
 *
 * @param content - Raw file content of the SKILL.md
 * @param filePath - Path to the SKILL.md file (e.g. `.agents/skills/my-skill/SKILL.md`)
 * @returns Parsed skill metadata, or undefined if frontmatter is missing or incomplete
 */
export function parseSkillFrontmatter(
  content: string,
  filePath: string,
  options?: { source?: string; resourceUri?: string; path?: string; skillPath?: string },
): SkillMetadata | undefined {
  const match = frontmatterMatch.exec(content);
  if (!match?.[1]) {
    return undefined;
  }

  const frontmatter = match[1];
  const name = parseScalar(frontmatter, 'name');
  const description = parseScalar(frontmatter, 'description');

  if (!name || !description) {
    return undefined;
  }

  const skillPath = options?.skillPath ?? (skillFileSuffix.test(filePath) ? filePath : undefined);
  const path = options?.path ?? (skillPath ? filePath.replace(skillFileSuffix, '') : undefined);

  return {
    name,
    description,
    resourceUri: options?.resourceUri ?? `file:${filePath}`,
    ...(path !== undefined && { path }),
    ...(skillPath !== undefined && { skillPath }),
    source: parseScalar(frontmatter, 'source') ?? options?.source,
    version: parseScalar(frontmatter, 'version'),
    whenToUse: parseScalar(frontmatter, 'when_to_use') ?? parseScalar(frontmatter, 'whenToUse'),
    fingerprint: fingerprintSkillContent(content),
    enabled: parseBoolean(frontmatter, 'enabled') ?? true,
  };
}

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
    case 'legacy': {
      return 10;
    }
    default: {
      return 50;
    }
  }
}
