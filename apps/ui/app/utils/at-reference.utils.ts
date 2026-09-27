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

/* The chat's own session log, which is where a chat actually is (W17). The
 * `.tau/transcripts/<id>.jsonl` this used to spell was written by nothing and
 * read from disk by nothing: an @-mention of a chat named a file that did not
 * exist, so pasting one into the composer produced a chip pointing at ENOENT. */
const chatLogPathRegex = /^\.tau\/chats\/([^/]+)\/events\.jsonl$/;

/**
 * Check if a path matches the `.tau/chats/{id}/events.jsonl` pattern.
 */
export function isChatLogPath(path: string): boolean {
  return chatLogPathRegex.test(path);
}

/**
 * Extract the chat ID from a chat log path.
 * Returns `undefined` if the path doesn't match the chat log pattern.
 */
export function extractChatIdFromChatLogPath(path: string): string | undefined {
  const match = chatLogPathRegex.exec(path);
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
 * - Chat log paths (`.tau/chats/{id}/events.jsonl`) are resolved as chats via O(1) Map lookup
 * - All other paths are resolved against the file tree via O(1) Map lookup
 */
export function resolveAtReference(
  path: string,
  fileTree: Map<string, FileEntry>,
  chatsById: Map<string, Chat>,
): ResolvedAtReference | undefined {
  if (isChatLogPath(path)) {
    const chatId = extractChatIdFromChatLogPath(path);
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
 * Matches an agent invocation token — a Tau skill (`/brep-design`), a Codex skill
 * (`$imagegen`, `$openai-templates:simple-dark`) or an ACP command (`/compact`) —
 * preceded by whitespace or string start. Names are `:`-separated word/hyphen
 * segments; a following `/`, `$` or word character rejects the match, so paths
 * like `/usr/bin` stay prose.
 */
export const invocationTokenRegex = /(?:^|(?<=\s))[$/][\w-]+(?::[\w-]+)*(?![\w$/-])/g;

export type InlineReferenceSegment =
  | { type: 'text'; value: string }
  | { type: 'atReference'; path: string }
  | { type: 'invocation'; token: string };

/**
 * Split text into `@path` references, invocation tokens and plain text.
 * Runs `@path` parsing first, then scans remaining text for invocation tokens.
 * Whether a token is a real skill or command is the caller's decision.
 */
export function parseInlineReferences(text: string): InlineReferenceSegment[] {
  const result: InlineReferenceSegment[] = [];

  for (const segment of parseAtReferences(text)) {
    if (segment.type === 'reference') {
      result.push({ type: 'atReference', path: segment.path });
      continue;
    }

    let lastIndex = 0;
    for (const match of segment.value.matchAll(invocationTokenRegex)) {
      if (match.index > lastIndex) {
        result.push({ type: 'text', value: segment.value.slice(lastIndex, match.index) });
      }
      result.push({ type: 'invocation', token: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < segment.value.length) {
      result.push({ type: 'text', value: segment.value.slice(lastIndex) });
    }
  }

  return result;
}

/**
 * Backslash-escape the known `$` invocation tokens in markdown outside code, so
 * single-dollar math does not pair `$imagegen … $brep-design` into a formula.
 * Code spans and fences keep their text verbatim.
 */
export function escapeDollarInvocations(markdown: string, knownTokens: ReadonlySet<string>): string {
  if (!markdown.includes('$') || knownTokens.size === 0) {
    return markdown;
  }
  return markdown
    .split(/(```[\S\s]*?(?:```|$)|`[^\n`]*`)/)
    .map((chunk, index) =>
      index % 2 === 1
        ? chunk
        : chunk.replaceAll(invocationTokenRegex, (token) =>
            token.startsWith('$') && knownTokens.has(token) ? `\\${token}` : token,
          ),
    )
    .join('');
}

/** An agent command's exact invocation: `$`/`/`-prefixed names are kept, bare names get `/`. */
export function commandInvocation(name: string): string {
  return name.startsWith('$') || name.startsWith('/') ? name : `/${name}`;
}

/** Text of one inline segment exactly as the user wrote it. */
export function inlineSegmentText(segment: InlineReferenceSegment): string {
  if (segment.type === 'text') {
    return segment.value;
  }
  return segment.type === 'atReference' ? `@${segment.path}` : segment.token;
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
  /** Full invocation tokens the active agent offers (`/brep-design`, `$imagegen`). */
  knownTokens?: ReadonlySet<string>;
};

/**
 * Parse pasted text and resolve `@path` references and known invocation tokens.
 * Returns segments ready for insertion into the Tiptap editor.
 * Invalid references are kept as plain text.
 */
export function buildPastedContent(
  text: string,
  { fileTree, chats, knownTokens }: BuildPastedContentOptions,
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

    if (knownTokens?.has(segment.token)) {
      result.push({ type: 'chip', id: segment.token, label: segment.token, chipType: 'skill' });
      continue;
    }

    result.push({ type: 'text', value: segment.token });
  }

  return result;
}
