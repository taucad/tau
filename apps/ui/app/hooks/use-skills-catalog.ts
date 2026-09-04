import { useEffect, useMemo, useState } from 'react';
import type { SkillMetadata } from '@taucad/chat';
import { useFileManager } from '#hooks/use-file-manager.js';
import { createSkillResolver, titleFromSkillName } from '#lib/skill-resolver.js';

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

/**
 * Builds the merged, user-priority skills catalog from the workspace.
 *
 * `.agents/skills/<name>/SKILL.md` is the only filesystem skills root; the
 * legacy `.tau/skills` fallback was deleted (blueprint L7).
 */
export function useSkillsCatalog(): SkillMetadata[] {
  const { readFile, treeService } = useFileManager();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [treeRevision, setTreeRevision] = useState(0);

  const resolver = useMemo(() => {
    if (!treeService) {
      return undefined;
    }

    return createSkillResolver({
      readFile,
      listDirectory: async (path) => treeService.listDirectory(path),
    });
  }, [readFile, treeService]);

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

export function usePromptSkillsCatalog(): SkillMetadata[] {
  const { readFile, treeService } = useFileManager();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
  const [treeRevision, setTreeRevision] = useState(0);
  const resolver = useMemo(() => {
    if (!treeService) {
      return undefined;
    }

    return createSkillResolver({
      readFile,
      listDirectory: async (path) => treeService.listDirectory(path),
    });
  }, [readFile, treeService]);

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

      const listing = await resolver.getPromptSkillListing();
      if (!cancelled) {
        setSkills(listing);
      }
    }

    void loadSkills();
    return () => {
      cancelled = true;
    };
  }, [resolver, treeRevision]);

  return useMemo(() => skills, [skills]);
}
