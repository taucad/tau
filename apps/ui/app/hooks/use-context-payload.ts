import { useState, useEffect, useMemo, useRef } from 'react';
import { Topic } from '@taucad/events';
import type { ContextPayload } from '@taucad/chat';
import { contextMemoryMaxBytes, contextMemoryMaxLines } from '@taucad/chat/schemas';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useSkillsCatalogState } from '#hooks/use-skills-catalog.js';

const agentsMdPath = '.tau/AGENTS.md';
const decoder = new TextDecoder();

/**
 * The settled context payload, published for dispatch.
 *
 * The skills catalog is pinned into a chat's cached system prefix on its first turn (prompt-cache identity I1), so
 * the first turn must carry the catalog: a seeded first turn fires at chat load, ahead of the catalog's first read.
 * The hook publishes whether its catalog has settled (`ready`, or failed for good) and the payload it would send;
 * {@link awaitContextPayload} hands that to the dispatch, which waits for it the way it waits for the host probe.
 */
type ContextPayloadPublication = Readonly<{ settled: boolean; payload: ContextPayload | undefined }>;
let publication: ContextPayloadPublication | undefined;
/* Emits the payload each time the catalog settles; a dispatch waiting on it subscribes once. */
const settledPayloads = new Topic<ContextPayload | undefined>({ name: 'context-payload.settled' });

const publishContextPayload = (next: ContextPayloadPublication | undefined): void => {
  publication = next;
  if (next?.settled) {
    settledPayloads.emit(next.payload);
  }
};

/** How long a dispatch waits for the skills catalog before sending the payload it has. */
export const contextPayloadWaitTimeout = 5000;

/**
 * The context payload a turn should carry, once the skills catalog has settled.
 *
 * Resolves at once when no hook publishes one (a chat surface outside a project) or when the catalog is settled, and
 * on the timeout with whatever payload is current otherwise: a slow catalog delays a turn briefly, never blocks it.
 *
 * @param timeout - Upper bound before the wait resolves with the current payload.
 * @returns The settled payload, or the current one on timeout.
 * @public
 */
export const awaitContextPayload = async (timeout = contextPayloadWaitTimeout): Promise<ContextPayload | undefined> => {
  if (publication === undefined || publication.settled) {
    return publication?.payload;
  }
  return new Promise<ContextPayload | undefined>((resolve) => {
    const unsubscribe = settledPayloads.subscribe((payload) => {
      globalThis.clearTimeout(catalogWaitExpiry);
      unsubscribe();
      resolve(payload);
    });
    const catalogWaitExpiry = globalThis.setTimeout(() => {
      unsubscribe();
      resolve(publication?.payload);
    }, timeout);
  });
};

/** Test-only reset of the module-level publication. @internal */
export const resetContextPayloadPublication = (): void => {
  publication = undefined;
};

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
  const catalog = useSkillsCatalogState();
  const skills = catalog.status === 'ready' ? catalog.prompt : undefined;

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

  const payload = useMemo((): ContextPayload | undefined => {
    if ((!skills || skills.length === 0) && !memory) {
      return undefined;
    }

    return {
      skills: skills && skills.length > 0 ? skills : undefined,
      memory,
    };
  }, [skills, memory]);

  /* `registering` and `pending` are the catalog still being read; every other status is its answer. */
  const catalogSettled = catalog.status !== 'registering' && catalog.status !== 'pending';
  useEffect(() => {
    publishContextPayload({ settled: catalogSettled, payload });
    return () => {
      publishContextPayload(undefined);
    };
  }, [catalogSettled, payload]);

  return payload;
}
