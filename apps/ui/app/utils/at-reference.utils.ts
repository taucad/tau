import type { FileEntry } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import type { ChipType } from '#components/chat/context-chip.js';

/**
 * Matches `@path` references preceded by whitespace or at string start.
 * Path must contain `/` or `.` to avoid false positives on `@username`-style mentions.
 * Does not match email addresses (requires whitespace or start-of-string before `@`).
 */
export const atReferenceRegex = /(?:^|(?<=\s))@([\w$./-]+[./][\w$./-]*[\w$.-]|[\w$./-]*[./][\w$./-]+)/g;

export type AtReferenceSegment = { type: 'text'; value: string } | { type: 'reference'; path: string };

/**
 * Split text into alternating text and `@path` reference segments.
 * Only paths containing `/` or `.` are matched to avoid false positives.
 */
export function parseAtReferences(text: string): AtReferenceSegment[] {
  const segments: AtReferenceSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(atReferenceRegex.source, atReferenceRegex.flags);
  let match: RegExpExecArray | undefined;

  while ((match = regex.exec(text) ?? undefined) !== undefined) {
    const fullMatch = match[0];
    const path = match[1] ?? '';
    const matchStart = match.index + (fullMatch.length - path.length - 1);

    if (matchStart > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, matchStart) });
    }

    segments.push({ type: 'reference', path });
    lastIndex = matchStart + 1 + path.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

const transcriptPathRegex = /^\.tau\/transcripts\/([^/]+)\.jsonl$/;

/**
 * Check if a path matches the `.tau/transcripts/{id}.jsonl` pattern.
 */
export function isTranscriptPath(path: string): boolean {
  return transcriptPathRegex.test(path);
}

/**
 * Extract the chat ID from a transcript path.
 * Returns `undefined` if the path doesn't match the transcript pattern.
 */
export function extractChatIdFromTranscriptPath(path: string): string | undefined {
  const match = transcriptPathRegex.exec(path);
  return match?.[1];
}

export type ResolvedAtReference =
  | { type: 'file'; path: string; displayName: string; chipType: ChipType }
  | { type: 'folder'; path: string; displayName: string; chipType: ChipType }
  | { type: 'chat'; path: string; displayName: string; chipType: ChipType; chatId: string };

/**
 * Resolve an `@path` reference against the file tree and chats.
 * Returns resolved metadata for rendering, or `null` if the path is invalid.
 *
 * - Transcript paths (`.tau/transcripts/{id}.jsonl`) are resolved as chats via O(1) Map lookup
 * - All other paths are resolved against the file tree via O(1) Map lookup
 */
export function resolveAtReference(
  path: string,
  fileTree: Map<string, FileEntry>,
  chatsById: Map<string, Chat>,
): ResolvedAtReference | undefined {
  if (isTranscriptPath(path)) {
    const chatId = extractChatIdFromTranscriptPath(path);
    if (!chatId) {
      return undefined;
    }
    const chat = chatsById.get(chatId);
    if (!chat) {
      return undefined;
    }
    return { type: 'chat', path, displayName: chat.name, chipType: 'chat', chatId };
  }

  const entry = fileTree.get(path);
  if (!entry) {
    return undefined;
  }

  if (entry.type === 'dir') {
    return { type: 'folder', path, displayName: entry.name, chipType: 'folder' };
  }

  return { type: 'file', path, displayName: entry.name, chipType: 'file' };
}

/**
 * Matches `/command-name` preceded by whitespace or at string start.
 * Command names may contain word characters and hyphens.
 */
export const slashCommandRegex = /(?:^|(?<=\s))\/([\w-]+)/g;

export type SlashCommandSegment = { type: 'text'; value: string } | { type: 'slashCommand'; commandId: string };

/**
 * Split text into alternating text and `/command` segments.
 */
export function parseSlashCommands(text: string): SlashCommandSegment[] {
  const segments: SlashCommandSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(slashCommandRegex.source, slashCommandRegex.flags);
  let match: RegExpExecArray | undefined;

  while ((match = regex.exec(text) ?? undefined) !== undefined) {
    const fullMatch = match[0];
    const commandId = match[1] ?? '';
    const matchStart = match.index + (fullMatch.length - commandId.length - 1);

    if (matchStart > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, matchStart) });
    }

    segments.push({ type: 'slashCommand', commandId });
    lastIndex = matchStart + 1 + commandId.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

export type InlineReferenceSegment =
  | { type: 'text'; value: string }
  | { type: 'atReference'; path: string }
  | { type: 'slashCommand'; commandId: string };

/**
 * Compose `parseAtReferences` and `parseSlashCommands` into a single pass.
 * Runs `@path` parsing first, then scans remaining text segments for `/command` patterns.
 */
export function parseInlineReferences(text: string): InlineReferenceSegment[] {
  const atSegments = parseAtReferences(text);
  const result: InlineReferenceSegment[] = [];

  for (const segment of atSegments) {
    if (segment.type === 'reference') {
      result.push({ type: 'atReference', path: segment.path });
      continue;
    }

    const slashSegments = parseSlashCommands(segment.value);
    for (const slashSeg of slashSegments) {
      if (slashSeg.type === 'text') {
        result.push(slashSeg);
      } else {
        result.push(slashSeg);
      }
    }
  }

  return result;
}

export type ResolvedSlashCommand = { type: 'skill'; commandId: string; label: string };

/**
 * Resolve a `/command` against a set of known skill IDs.
 * O(1) Set lookup. Returns `undefined` for unknown commands.
 */
export function resolveSlashCommand(
  commandId: string,
  knownSkillIds: ReadonlySet<string>,
): ResolvedSlashCommand | undefined {
  if (!knownSkillIds.has(commandId)) {
    return undefined;
  }
  return { type: 'skill', commandId, label: `/${commandId}` };
}

export type PastedContentSegment =
  | { type: 'text'; value: string }
  | {
      type: 'chip';
      id: string;
      label: string;
      chipType: ChipType;
      path?: string;
      referenceToken?: string;
      geometryReference?: string;
    };

export type BuildPastedContentOptions = {
  fileTree: Map<string, FileEntry>;
  chats: Chat[];
  knownSkills?: ReadonlySet<string>;
};

/**
 * Parse pasted text and resolve `@path` and `/command` references.
 * Returns segments ready for insertion into the Tiptap editor.
 * Invalid references are kept as plain text.
 */
export function buildPastedContent(
  text: string,
  { fileTree, chats, knownSkills }: BuildPastedContentOptions,
): PastedContentSegment[] {
  const chatsById = new Map(chats.map((c) => [c.id, c]));
  const parsed = parseInlineReferences(text);
  const result: PastedContentSegment[] = [];

  for (const segment of parsed) {
    if (segment.type === 'text') {
      result.push(segment);
      continue;
    }

    if (segment.type === 'atReference') {
      const resolved = resolveAtReference(segment.path, fileTree, chatsById);
      if (!resolved) {
        result.push({ type: 'text', value: `@${segment.path}` });
        continue;
      }
      result.push({
        type: 'chip',
        id: resolved.type === 'chat' ? resolved.chatId : resolved.path,
        label: resolved.displayName,
        chipType: resolved.chipType,
        path: resolved.path,
      });
      continue;
    }

    if (knownSkills) {
      const resolved = resolveSlashCommand(segment.commandId, knownSkills);
      if (resolved) {
        result.push({
          type: 'chip',
          id: resolved.commandId,
          label: resolved.label,
          chipType: 'skill',
        });
        continue;
      }
    }

    result.push({ type: 'text', value: `/${segment.commandId}` });
  }

  return result;
}
