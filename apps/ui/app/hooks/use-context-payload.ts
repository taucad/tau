import { useState, useEffect, useMemo, useRef } from 'react';
import type { ContextPayload } from '@taucad/chat';
import { contextMemoryMaxBytes, contextMemoryMaxLines } from '@taucad/chat/schemas';
import { useFileManager } from '#hooks/use-file-manager.js';
import { usePromptSkillsCatalog } from '#hooks/use-skills-catalog.js';

const agentsMdPath = '.tau/AGENTS.md';
const decoder = new TextDecoder();

/**
 * CH-10 head truncation: memory content is capped at the first
 * `contextMemoryMaxLines` lines and `contextMemoryMaxBytes` bytes so an
 * oversized AGENTS.md cannot flood the uncached dynamic prompt block. The head
 * is kept (never the tail) and a one-line notice marks the cut.
 */
export function truncateMemoryHead(text: string): string {
  const lines = text.split('\n');
  let out = lines.length > contextMemoryMaxLines ? lines.slice(0, contextMemoryMaxLines).join('\n') : text;
  if (out.length > contextMemoryMaxBytes) {
    out = out.slice(0, contextMemoryMaxBytes);
  }
  if (out.length === text.length) {
    return text;
  }
  return `${out}\n[AGENTS.md truncated: first ${String(contextMemoryMaxLines)} lines / ${String(contextMemoryMaxBytes)} bytes retained]`;
}

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
  useEffect(() => {
    readFileRef.current = readFile;
  }, [readFile]);

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
          setMemory({ [agentsMdPath]: truncateMemoryHead(text) });
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
