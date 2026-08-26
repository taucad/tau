import { useState, useEffect, useMemo, useRef } from 'react';
import type { ContextPayload } from '@taucad/chat';
import { useFileManager } from '#hooks/use-file-manager.js';
import { usePromptSkillsCatalog } from '#hooks/use-skills-catalog.js';

const agentsMdPath = '.tau/AGENTS.md';
const decoder = new TextDecoder();

/**
 * Hook that assembles a context payload from workspace agent metadata.
 * Skill discovery is delegated to the shared `.agents/skills` catalog hook;
 * AGENTS.md memory remains under `.tau/AGENTS.md` for the existing memory
 * contract.
 *
 * @returns ContextPayload to attach to message metadata, or undefined if nothing to send
 */
export function useContextPayload(): ContextPayload | undefined {
  const { readFile, treeService } = useFileManager();
  const [hasAgentsMd, setHasAgentsMd] = useState(false);
  const [memory, setMemory] = useState<Record<string, string> | undefined>();
  const skills = usePromptSkillsCatalog();

  useEffect(() => {
    if (!treeService) {
      return;
    }
    const ts = treeService;
    let cancelled = false;

    async function discover(): Promise<void> {
      const agentsEntry = await ts.getEntry(agentsMdPath);

      if (cancelled) {
        return;
      }

      setHasAgentsMd(agentsEntry?.type === 'file');
    }

    void discover();
    return () => {
      cancelled = true;
    };
  }, [treeService]);

  const readFileRef = useRef(readFile);
  readFileRef.current = readFile;

  useEffect(() => {
    let cancelled = false;

    async function loadMemory(): Promise<void> {
      if (!hasAgentsMd) {
        setMemory(undefined);
        return;
      }

      try {
        const bytes = await readFileRef.current(agentsMdPath);
        const text = decoder.decode(bytes);
        if (!cancelled) {
          setMemory({ [agentsMdPath]: text });
        }
      } catch {
        if (!cancelled) {
          setMemory(undefined);
        }
      }
    }

    void loadMemory();
    return () => {
      cancelled = true;
    };
  }, [hasAgentsMd]);

  return useMemo((): ContextPayload | undefined => {
    if (skills.length === 0 && !memory) {
      return undefined;
    }

    return {
      skills: skills.length > 0 ? skills : undefined,
      memory,
    };
  }, [skills, memory]);
}
