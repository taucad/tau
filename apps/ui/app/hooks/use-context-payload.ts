import { useState, useEffect, useMemo, useRef } from 'react';
import { Topic } from '@taucad/events';
import type { ContextPayload } from '@taucad/chat';
import { contextMemoryMaxBytes } from '@taucad/chat/schemas';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useSkillsCatalogState } from '#hooks/use-skills-catalog.js';

/** The project's instruction file, at its root, as the AGENTS.md convention places it. */
const agentsMdPath = 'AGENTS.md';
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const noSkills: NonNullable<ContextPayload['skills']> = [];

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
 * CH-10 head truncation: memory content is capped at `contextMemoryMaxBytes` (32 KiB) of UTF-8, with no line limit,
 * so an oversized AGENTS.md cannot flood the uncached per-request prompt block. The cap is Codex's default
 * (`project_doc_max_bytes`), so the same file reads whole in both. A file within the cap is returned unchanged.
 * Past it, the longest head that fits is kept (never the tail), the cut never splits a character, and one notice
 * line naming the kept byte count marks it.
 *
 * @param text - The decoded file.
 * @returns The file, or its head and the notice line.
 */
export function truncateMemoryHead(text: string): string {
  const bytes = encoder.encode(text);
  if (bytes.length <= contextMemoryMaxBytes) {
    return text;
  }
  /* The first byte left out must start a character: a UTF-8 continuation byte (10xxxxxx) is 0x80 to 0xbf. */
  const isContinuationByte = (byte: number | undefined): boolean => byte !== undefined && byte >= 0x80 && byte < 0xc0;
  let end = contextMemoryMaxBytes;
  while (end > 0 && isContinuationByte(bytes[end])) {
    end -= 1;
  }
  return `${decoder.decode(bytes.subarray(0, end))}\n[AGENTS.md truncated: first ${String(end)} bytes retained]`;
}

/**
 * Hook that assembles a context payload from the project's agent files.
 *
 * Both follow the cross-agent conventions: skills come from the shared
 * `.agents/skills` catalog hook, and project instructions from `AGENTS.md` at
 * the project root. That file is the person's own; Tau reads it and never
 * generates into it. It is re-read whenever it changes, so a turn carries what
 * the file says now, including an edit the agent made on the turn before.
 *
 * @returns ContextPayload to attach to message metadata, or undefined if nothing to send
 */
export function useContextPayload(): ContextPayload | undefined {
  const { readFile, treeService, contentService } = useFileManager();
  const [memory, setMemory] = useState<Record<string, string> | undefined>();
  const catalog = useSkillsCatalogState();
  /* A failed catalog (its watch closed or errored) offers no skill, as the composer shows it: the turn says so with an
   * empty listing, because an absent one lets the host read the skills itself, past the failure. */
  const isCatalogUnavailable = catalog.status === 'closed' || catalog.status === 'error';
  const skills = catalog.status === 'ready' ? catalog.prompt : undefined;

  const readFileRef = useRef(readFile);
  useEffect(() => {
    readFileRef.current = readFile;
  }, [readFile]);

  useEffect(() => {
    if (!treeService || !contentService) {
      return;
    }
    let cancelled = false;
    let latest = 0;

    async function load(tree: NonNullable<typeof treeService>): Promise<void> {
      latest += 1;
      const read = latest;
      let next: Record<string, string> | undefined;
      try {
        const entry = await tree.getEntry(agentsMdPath);
        if (entry?.type === 'file') {
          next = { [agentsMdPath]: truncateMemoryHead(decoder.decode(await readFileRef.current(agentsMdPath))) };
        }
      } catch {
        next = undefined;
      }
      /* A later read supersedes this one: the file changed again while it was in flight. */
      if (!cancelled && read === latest) {
        setMemory((previous) => (previous?.[agentsMdPath] === next?.[agentsMdPath] ? previous : next));
      }
    }

    void load(treeService);
    const watch = contentService.watchReady({ paths: [agentsMdPath] }, () => {
      void load(treeService);
    });
    return () => {
      cancelled = true;
      watch.dispose();
    };
  }, [treeService, contentService]);

  const payload = useMemo((): ContextPayload | undefined => {
    if (isCatalogUnavailable) {
      return { skills: noSkills, memory };
    }
    if ((!skills || skills.length === 0) && !memory) {
      return undefined;
    }

    return {
      skills: skills && skills.length > 0 ? skills : undefined,
      memory,
    };
  }, [isCatalogUnavailable, skills, memory]);

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
