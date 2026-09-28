import { useEffect, useMemo, useState } from 'react';
import type { SkillMetadata } from '@taucad/chat';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
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
 * Call `onChange` when the tree changes under `.agents/`, the only place skills and installed
 * plugins live. Every other file write (a parameter commit, an agent edit) leaves the catalog as it was.
 */
function subscribeAgentsTree(treeService: FileTreeService, onChange: () => void): () => void {
  const signature = (): string => {
    let value = '';
    for (const entry of treeService.getTreeSnapshot().values()) {
      if (entry.path === '.agents' || entry.path.startsWith('.agents/')) {
        value += `${entry.path}:${entry.type}:${String(entry.size)}:${String(entry.mtimeMs)}\n`;
      }
    }
    return value;
  };
  let last = signature();
  return treeService.subscribeTree(() => {
    const next = signature();
    if (next !== last) {
      last = next;
      onChange();
    }
  });
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
    let cancelled = false;
    let loadSequence = 0;

    async function loadSkills(): Promise<void> {
      const sequence = ++loadSequence;
      if (!resolver) {
        setSkills([]);
        return;
      }

      const results = await resolver.listSkills();

      if (!cancelled && sequence === loadSequence) {
        setSkills(results);
      }
    }

    void loadSkills();
    const unsubscribe =
      treeService &&
      subscribeAgentsTree(treeService, () => {
        void loadSkills();
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [resolver, treeService]);

  return useMemo(() => skills, [skills]);
}

export function usePromptSkillsCatalog(): SkillMetadata[] {
  const { readFile, treeService } = useFileManager();
  const [skills, setSkills] = useState<SkillMetadata[]>([]);
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
    let cancelled = false;
    let loadSequence = 0;

    async function loadSkills(): Promise<void> {
      const sequence = ++loadSequence;
      if (!resolver) {
        setSkills([]);
        return;
      }

      const listing = await resolver.getPromptSkillListing();
      if (!cancelled && sequence === loadSequence) {
        setSkills(listing);
      }
    }

    void loadSkills();
    const unsubscribe =
      treeService &&
      subscribeAgentsTree(treeService, () => {
        void loadSkills();
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [resolver, treeService]);

  return useMemo(() => skills, [skills]);
}
