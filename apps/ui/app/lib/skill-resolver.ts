import type { ResolveSkillRpcResult, SkillMetadata } from '@taucad/chat';
import { rpcClientErrorCode } from '@taucad/chat';
import { builtInSystemSkills } from '#lib/system-skills-catalog.js';
import { tauStoreSkills } from '#lib/tau-plugin-store-catalog.js';
import {
  canonicalSkillsDirectory,
  fingerprintSkillContent,
  legacySkillsDirectory,
  mergeSkillMetadata,
  parseSkillFrontmatter,
} from '#hooks/use-context-payload.utils.js';

const textDecoder = new TextDecoder();
const skillFileName = 'SKILL.md';
const manifestPath = '.agents/plugins/installed.json';
const promptSkillLimit = 80;

export type SkillResolverDirectoryEntry = {
  readonly name: string;
  readonly isFolder?: boolean;
};

export type SkillResolverDependencies = {
  readonly readFile: (path: string) => Promise<Uint8Array<ArrayBuffer>>;
  readonly listDirectory: (path: string) => Promise<readonly SkillResolverDirectoryEntry[]>;
};

export type SkillResolver = {
  readonly listSkills: () => Promise<SkillMetadata[]>;
  readonly resolveSkill: (skillName: string) => Promise<ResolveSkillRpcResult>;
  readonly getPromptSkillListing: () => Promise<SkillMetadata[]>;
};

type InstalledPluginManifest = {
  readonly skills?: Record<
    string,
    {
      readonly status: 'installed' | 'shadowed';
      readonly source: 'tau-store';
      readonly installedPath: string;
      readonly shadowPath?: string;
      readonly version: string;
      readonly updatedAt: string;
    }
  >;
};

export function createSkillResolver(deps: SkillResolverDependencies): SkillResolver {
  async function listSkills(): Promise<SkillMetadata[]> {
    const discovered = await Promise.all([
      discoverFilesystemSkills(deps, canonicalSkillsDirectory, 'user'),
      discoverTauStoreManifestSkills(deps),
      discoverSystemSkills(),
      discoverFilesystemSkills(deps, legacySkillsDirectory, 'legacy'),
    ]);

    return mergeSkillMetadata(discovered.flat());
  }

  return {
    listSkills,
    async resolveSkill(skillName: string): Promise<ResolveSkillRpcResult> {
      const normalized = normalizeSkillName(skillName);
      const skill = (await listSkills()).find((entry) => normalizeSkillName(entry.name) === normalized);

      if (!skill) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.skillNotFound,
          message: `Skill not found: ${skillName}`,
        };
      }

      const resourceUri = skill.resourceUri ?? (skill.skillPath ? `file:${skill.skillPath}` : undefined);
      if (!resourceUri) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.skillNotFound,
          message: `Skill cannot be resolved to a resource URI: ${skill.name}`,
        };
      }

      if (resourceUri.startsWith('system:')) {
        return resolveSystemSkill(skill);
      }

      const skillPath = skill.skillPath ?? (skill.path ? `${skill.path}/${skillFileName}` : undefined);
      if (!skillPath) {
        return {
          success: false,
          errorCode: rpcClientErrorCode.skillNotFound,
          message: `Skill cannot be resolved to readable content: ${skill.name}`,
        };
      }

      try {
        const content = textDecoder.decode(await deps.readFile(skillPath));
        const baseDirectory = skill.path ?? skillPath.replace(/\/SKILL\.md$/, '');

        return {
          success: true,
          skillName: skill.name,
          title: titleFromSkillName(skill.name),
          description: skill.description,
          source: skill.source ?? 'unknown',
          enabled: skill.enabled ?? true,
          resourceUri,
          skillPath,
          baseDirectory,
          ...(skill.version !== undefined && { version: skill.version }),
          ...(skill.whenToUse !== undefined && { whenToUse: skill.whenToUse }),
          fingerprint: fingerprintSkillContent(content),
          frontmatter: parseFrontmatterRecord(content),
          content,
          supportingFiles: await listSupportingFiles(deps, baseDirectory),
          ...(skill.shadowedSources !== undefined && { shadowedSources: skill.shadowedSources }),
        };
      } catch {
        return {
          success: false,
          errorCode: rpcClientErrorCode.skillNotFound,
          message: `Skill file not found: ${skillPath}`,
        };
      }
    },
    async getPromptSkillListing(): Promise<SkillMetadata[]> {
      const discovered = await listSkills();
      return discovered.slice(0, promptSkillLimit).map((skill) => normalizePromptSkillMetadata(skill));
    },
  };
}

function normalizeSkillName(skillName: string): string {
  return skillName.replace(/^\//, '').trim();
}

function titleFromSkillName(skillName: string): string {
  return skillName
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

async function discoverFilesystemSkills(
  deps: SkillResolverDependencies,
  directory: string,
  defaultSource: string,
): Promise<SkillMetadata[]> {
  const entries = await deps.listDirectory(directory).catch(() => []);
  const skillFiles = entries
    .filter((entry) => entry.isFolder)
    .map((entry) => ({
      baseDirectory: `${directory}/${entry.name}`,
      skillPath: `${directory}/${entry.name}/${skillFileName}`,
    }));

  const skills: Array<SkillMetadata | undefined> = await Promise.all(
    skillFiles.map(async ({ baseDirectory, skillPath }) => {
      try {
        const content = textDecoder.decode(await deps.readFile(skillPath));
        const metadata = parseSkillFrontmatter(content, skillPath, {
          resourceUri: `file:${skillPath}`,
          path: baseDirectory,
          skillPath,
        });

        if (!metadata) {
          return undefined;
        }

        return {
          ...metadata,
          source: defaultSource === 'legacy' ? 'legacy' : (metadata.source ?? defaultSource),
        };
      } catch {
        return undefined;
      }
    }),
  );

  return skills.filter((skill): skill is SkillMetadata => skill !== undefined);
}

async function discoverTauStoreManifestSkills(deps: SkillResolverDependencies): Promise<SkillMetadata[]> {
  const manifest = await readManifest(deps);
  const skills = manifest.skills ?? {};
  const discovered: Array<SkillMetadata | undefined> = await Promise.all(
    Object.entries(skills)
      .filter(([, installed]) => installed.status === 'shadowed')
      .map(async ([slug, installed]) => {
        const skillPath =
          installed.status === 'shadowed' && installed.shadowPath ? installed.shadowPath : installed.installedPath;
        try {
          const content = textDecoder.decode(await deps.readFile(skillPath));
          const metadata = parseSkillFrontmatter(content, skillPath, {
            source: 'tau-store',
            resourceUri: `file:${skillPath}`,
            path: skillPath.replace(/\/SKILL\.md$/, ''),
            skillPath,
          });
          return metadata ? { ...metadata, name: metadata.name || slug, source: 'tau-store' } : undefined;
        } catch {
          const storeSkill = tauStoreSkills.find((skill) => skill.slug === slug);
          if (!storeSkill) {
            return undefined;
          }

          const metadata = parseSkillFrontmatter(storeSkill.skillMarkdown, skillPath, {
            source: 'tau-store',
            resourceUri: `tau-store:skills/${slug}/SKILL.md`,
          });
          return metadata ? { ...metadata, source: 'tau-store' } : undefined;
        }
      }),
  );

  return discovered.filter((skill): skill is SkillMetadata => skill !== undefined);
}

async function readManifest(deps: SkillResolverDependencies): Promise<InstalledPluginManifest> {
  try {
    return JSON.parse(textDecoder.decode(await deps.readFile(manifestPath))) as InstalledPluginManifest;
  } catch {
    return {};
  }
}

function discoverSystemSkills(): SkillMetadata[] {
  const skills: Array<SkillMetadata | undefined> = builtInSystemSkills.map((skill) => {
    const resourceUri = `system:skills/${skill.slug}/SKILL.md`;
    const metadata = parseSkillFrontmatter(skill.skillMarkdown, resourceUri, {
      source: 'system',
      resourceUri,
    });

    if (!metadata) {
      return undefined;
    }

    const { path: _path, skillPath: _skillPath, ...virtualMetadata } = metadata;
    return {
      ...virtualMetadata,
      source: 'system',
      version: skill.version,
      whenToUse: skill.whenToUse,
    };
  });
  return skills.filter((skill): skill is SkillMetadata => skill !== undefined);
}

function resolveSystemSkill(skill: SkillMetadata): ResolveSkillRpcResult {
  const systemSkill = builtInSystemSkills.find(
    (entry) => normalizeSkillName(entry.slug) === normalizeSkillName(skill.name),
  );
  if (!systemSkill) {
    return {
      success: false,
      errorCode: rpcClientErrorCode.skillNotFound,
      message: `System skill not found: ${skill.name}`,
    };
  }

  return {
    success: true,
    skillName: skill.name,
    title: systemSkill.name,
    description: skill.description,
    source: 'system',
    enabled: skill.enabled ?? true,
    resourceUri: skill.resourceUri ?? `system:skills/${systemSkill.slug}/SKILL.md`,
    version: systemSkill.version,
    whenToUse: systemSkill.whenToUse,
    fingerprint: fingerprintSkillContent(systemSkill.skillMarkdown),
    frontmatter: parseFrontmatterRecord(systemSkill.skillMarkdown),
    content: systemSkill.skillMarkdown,
    supportingFiles: [],
    ...(skill.shadowedSources !== undefined && { shadowedSources: skill.shadowedSources }),
  };
}

async function listSupportingFiles(deps: SkillResolverDependencies, baseDirectory: string): Promise<string[]> {
  const entries = await deps.listDirectory(baseDirectory).catch(() => []);
  return entries.filter((entry) => entry.name !== skillFileName).map((entry) => `${baseDirectory}/${entry.name}`);
}

function parseFrontmatterRecord(content: string): Record<string, unknown> {
  const match = /^---\n([\S\s]*?)\n---/.exec(content);
  if (!match?.[1]) {
    return {};
  }

  const parsed: Record<string, unknown> = {};
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const rawValue = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']/, '')
      .replace(/["']$/, '');
    if (!key) {
      continue;
    }

    if (rawValue === 'true') {
      parsed[key] = true;
    } else if (rawValue === 'false') {
      parsed[key] = false;
    } else {
      parsed[key] = rawValue;
    }
  }

  return parsed;
}

function normalizePromptSkillMetadata(skill: SkillMetadata): SkillMetadata {
  return {
    name: skill.name,
    description: skill.description,
    resourceUri: skill.resourceUri,
    ...(skill.path !== undefined && { path: skill.path }),
    ...(skill.skillPath !== undefined && { skillPath: skill.skillPath }),
    ...(skill.source !== undefined && { source: skill.source }),
    ...(skill.version !== undefined && { version: skill.version }),
    ...(skill.whenToUse !== undefined && { whenToUse: skill.whenToUse }),
    ...(skill.fingerprint !== undefined && { fingerprint: skill.fingerprint }),
    enabled: skill.enabled ?? true,
    ...(skill.shadowedSources !== undefined && { shadowedSources: skill.shadowedSources }),
  };
}
