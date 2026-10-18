import { useMemo } from 'react';
import { ObservationService } from '@taucad/fs-client/observation-service';
import { useObservation } from '@taucad/fs-client/react/use-observation';
import { seemsBinary } from '@taucad/fs-client/seems-binary';
import type { RecordFilesClient } from '#hooks/use-file-manager.js';
import { useProject } from '#hooks/use-project.js';
import type { ContextPayload } from '@taucad/chat';
import { contextMemoryMaxBytes, contextMemoryMaxLines } from '@taucad/chat/schemas';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useSkillsCatalogState } from '#hooks/use-skills-catalog.js';

const agentsMdPath = '.tau/AGENTS.md';
const decoder = new TextDecoder();
const encoder = new TextEncoder();
/** Bound canonical instruction-file allocation before applying the smaller prompt budget. */
export const projectInstructionsMaxBytes = 1024 * 1024;

/** Read authored instructions through their canonical working-copy capability, never the selected checkout. */
export async function readCanonicalProjectInstructions(
  projectId: string,
  files: RecordFilesClient,
): Promise<Readonly<{ bytes?: Uint8Array<ArrayBuffer> }>> {
  const path = `/projects/${projectId}/${agentsMdPath}`;
  if (!(await files.exists(path))) {
    return {};
  }
  const stat = await files.stat(path, { content: 'head' });
  if (stat.type !== 'file' || stat.contentKind === 'binary') {
    throw new Error(
      'Project instructions contain binary data or are not a text file. Open .tau/AGENTS.md in the project working copy to repair them.',
    );
  }
  if (stat.size > projectInstructionsMaxBytes) {
    throw new Error(
      'Project instructions are too large to edit here. Open .tau/AGENTS.md in the project working copy.',
    );
  }
  const bytes = await files.readFile(path);
  if (bytes.byteLength > projectInstructionsMaxBytes) {
    throw new Error(
      'Project instructions are too large to load here. Open .tau/AGENTS.md in the project working copy.',
    );
  }
  if (seemsBinary(bytes)) {
    throw new Error(
      'Project instructions contain binary data. Open .tau/AGENTS.md in the project working copy to repair them.',
    );
  }
  return { bytes };
}

/** Fresh memory for a new logical turn; skills remain with their existing catalog owner. */
export async function readCanonicalProjectMemory(
  projectId: string,
  files: RecordFilesClient,
): Promise<ContextPayload['memory']> {
  const { bytes } = await readCanonicalProjectInstructions(projectId, files);
  return bytes === undefined ? undefined : { [agentsMdPath]: truncateMemoryHead(decoder.decode(bytes)) };
}

/**
 * CH-10 head truncation: memory content is capped at the first
 * `contextMemoryMaxLines` lines and `contextMemoryMaxBytes` bytes so an
 * oversized AGENTS.md cannot flood the uncached dynamic prompt block. The head
 * is kept (never the tail) and a one-line notice marks the cut.
 */
export function truncateMemoryHead(text: string): string {
  const lines = text.split('\n');
  let out = lines.length > contextMemoryMaxLines ? lines.slice(0, contextMemoryMaxLines).join('\n') : text;
  const bytes = encoder.encode(out);
  if (bytes.byteLength > contextMemoryMaxBytes) {
    out = new TextDecoder().decode(bytes.subarray(0, contextMemoryMaxBytes), { stream: true });
  }
  if (out.length === text.length) {
    return text;
  }
  return `${out}\n[AGENTS.md truncated: first ${String(contextMemoryMaxLines)} lines / ${String(contextMemoryMaxBytes)} bytes retained]`;
}

type InstructionsWatcher = ReturnType<typeof useFileManager>['watchRecordFile'];
const memories = new WeakMap<
  RecordFilesClient,
  Map<string, WeakMap<InstructionsWatcher, ObservationService<ContextPayload['memory']>>>
>();

function memoryFor(
  projectId: string,
  files: RecordFilesClient,
  watch: InstructionsWatcher,
): ObservationService<ContextPayload['memory']> {
  let projects = memories.get(files);
  if (!projects) {
    projects = new Map();
    memories.set(files, projects);
  }
  let watches = projects.get(projectId);
  if (!watches) {
    watches = new WeakMap();
    projects.set(projectId, watches);
  }
  let service = watches.get(watch);
  if (!service) {
    const path = `/projects/${projectId}/${agentsMdPath}`;
    service = new ObservationService({
      resource: path,
      watch: (invalidate) => watch(path, invalidate),
      read: async () => readCanonicalProjectMemory(projectId, files),
    });
    watches.set(watch, service);
  }
  return service;
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
  const { recordFiles, watchRecordFile } = useFileManager();
  const project = useProject({ enableNoContext: true });
  const projectId = project?.projectId;
  const catalog = useSkillsCatalogState();
  const skills = catalog.status === 'ready' ? catalog.prompt : undefined;
  const service = useMemo(
    () => (projectId === undefined ? undefined : memoryFor(projectId, recordFiles, watchRecordFile)),
    [projectId, recordFiles, watchRecordFile],
  );
  const observation = useObservation(service);
  const memory = observation.status === 'ready' ? observation.value : undefined;

  return useMemo((): ContextPayload | undefined => {
    if ((!skills || skills.length === 0) && !memory) {
      return undefined;
    }

    return {
      skills: skills && skills.length > 0 ? skills : undefined,
      memory,
    };
  }, [skills, memory]);
}
