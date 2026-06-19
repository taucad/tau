import { useEffect, useMemo, useRef, useState } from 'react';
import type { SkillMetadata } from '@taucad/chat';
import { useFileManager } from '#hooks/use-file-manager.js';
import { createSkillResolver } from '#lib/skill-resolver.js';

export function skillMetadataToSlashCommand(skill: SkillMetadata): {
  id: string;
  label: string;
  title: string;
  description: string;
  fullDescription: string | undefined;
  group: string;
  source: string | undefined;
} {
  const id = skill.name;
  const fullDescription = skill.whenToUse ? `${skill.description}. ${skill.whenToUse}` : skill.description;

  return {
    id,
    label: `/${id}`,
    title: titleFromSkillName(id),
    description: skill.description,
    fullDescription,
    group: 'Skills',
    source: skill.source,
  };
}

export function titleFromSkillName(skillName: string): string {
  return skillName
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Builds the merged, user-priority skills catalog from the workspace.
 *
 * `.agents/skills/<name>/SKILL.md` is canonical. `.tau/skills/<name>/SKILL.md`
 * is read as a lower-priority migration fallback so older workspaces still
 * surface their knowledge without becoming the source of truth.
 */
export function useSkillsCatalog(): SkillMetadata[] {
  const { readFile, treeService } = useFileManager();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [treeRevision, setTreeRevision] = useState(0);

  const readFileRef = useRef(readFile);
  readFileRef.current = readFile;

  const resolver = useMemo(() => {
    if (!treeService) {
      return undefined;
    }

    return createSkillResolver({
      readFile: (path) => readFileRef.current(path),
      listDirectory: (path) => treeService.listDirectory(path),
    });
  }, [treeService]);

  useEffect(() => {
    if (!treeService) {
      return;
    }

    return treeService.subscribeTree(() => {
      setTreeRevision((revision) => revision + 1);
    });
  }, [treeService]);

  useEffect(() => {
    let cancelled = false;

    async function loadSkills(): Promise<void> {
      if (!resolver) {
        setSkills([]);
        return;
      }

      const results = await resolver.listSkills();

      if (!cancelled) {
        setSkills(results);
      }
    }

    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [resolver, treeRevision]);

  return useMemo(() => skills, [skills]);
}

export function usePromptSkillsCatalog(chatId: string): SkillMetadata[] {
  const { readFile, treeService } = useFileManager();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const readFileRef = useRef(readFile);
  readFileRef.current = readFile;

  const resolver = useMemo(() => {
    if (!treeService) {
      return undefined;
    }

    return createSkillResolver({
      readFile: (path) => readFileRef.current(path),
      listDirectory: (path) => treeService.listDirectory(path),
    });
  }, [treeService]);

  useEffect(() => {
    let cancelled = false;

    async function loadSkills(): Promise<void> {
      if (!resolver) {
        setSkills([]);
        return;
      }

      const listing = await resolver.getPromptSkillListing(chatId);
      if (!cancelled) {
        setSkills(listing);
      }
    }

    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [chatId, resolver]);

  return useMemo(() => skills, [skills]);
}
