import { describe, it, expect } from 'vitest';
import type { FileEntry } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import {
  parseAtReferences,
  isTranscriptPath,
  extractChatIdFromTranscriptPath,
  resolveAtReference,
  buildPastedContent,
  parseSlashCommands,
  parseInlineReferences,
  resolveSlashCommand,
} from '#utils/at-reference.utils.js';

describe('parseAtReferences', () => {
  it('should return empty array for empty text', () => {
    expect(parseAtReferences('')).toEqual([]);
  });

  it('should return single text segment when no references', () => {
    expect(parseAtReferences('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('should parse a single file reference', () => {
    const result = parseAtReferences('check @src/app.ts please');

    expect(result).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'reference', path: 'src/app.ts' },
      { type: 'text', value: ' please' },
    ]);
  });

  it('should parse reference at start of text', () => {
    const result = parseAtReferences('@main.scad what is in here');

    expect(result).toEqual([
      { type: 'reference', path: 'main.scad' },
      { type: 'text', value: ' what is in here' },
    ]);
  });

  it('should parse reference at end of text', () => {
    const result = parseAtReferences('look at @src/utils.ts');

    expect(result).toEqual([
      { type: 'text', value: 'look at ' },
      { type: 'reference', path: 'src/utils.ts' },
    ]);
  });

  it('should parse multiple references', () => {
    const result = parseAtReferences('compare @src/a.ts and @src/b.ts');

    expect(result).toEqual([
      { type: 'text', value: 'compare ' },
      { type: 'reference', path: 'src/a.ts' },
      { type: 'text', value: ' and ' },
      { type: 'reference', path: 'src/b.ts' },
    ]);
  });

  it('should handle paths with special characters', () => {
    const result = parseAtReferences('check @apps/ui/app/routes/projects_.$id/chat-message.tsx');

    expect(result).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'reference', path: 'apps/ui/app/routes/projects_.$id/chat-message.tsx' },
    ]);
  });

  it('should handle transcript paths', () => {
    const result = parseAtReferences('see @.tau/transcripts/abc-123.jsonl');

    expect(result).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'reference', path: '.tau/transcripts/abc-123.jsonl' },
    ]);
  });

  it('should NOT match @username without slash or dot', () => {
    const result = parseAtReferences('hello @username how are you');

    expect(result).toEqual([{ type: 'text', value: 'hello @username how are you' }]);
  });

  it('should NOT match email addresses', () => {
    const result = parseAtReferences('email user@domain.com for info');

    expect(result).toEqual([{ type: 'text', value: 'email user@domain.com for info' }]);
  });

  it('should handle adjacent references', () => {
    const result = parseAtReferences('@src/a.ts @src/b.ts');

    expect(result).toEqual([
      { type: 'reference', path: 'src/a.ts' },
      { type: 'text', value: ' ' },
      { type: 'reference', path: 'src/b.ts' },
    ]);
  });
});

describe('isTranscriptPath', () => {
  it('should return true for valid transcript path', () => {
    expect(isTranscriptPath('.tau/transcripts/abc-123.jsonl')).toBe(true);
  });

  it('should return true for UUID transcript path', () => {
    expect(isTranscriptPath('.tau/transcripts/f16fe8d6-97a1-4246-bad2-ef9e55e86888.jsonl')).toBe(true);
  });

  it('should return false for non-transcript path', () => {
    expect(isTranscriptPath('src/app.ts')).toBe(false);
  });

  it('should return false for wrong extension', () => {
    expect(isTranscriptPath('.tau/transcripts/abc-123.json')).toBe(false);
  });

  it('should return false for wrong directory', () => {
    expect(isTranscriptPath('.tau/skills/abc-123.jsonl')).toBe(false);
  });
});

describe('extractChatIdFromTranscriptPath', () => {
  it('should extract chat ID from valid transcript path', () => {
    expect(extractChatIdFromTranscriptPath('.tau/transcripts/abc-123.jsonl')).toBe('abc-123');
  });

  it('should extract UUID from transcript path', () => {
    expect(extractChatIdFromTranscriptPath('.tau/transcripts/f16fe8d6-97a1-4246-bad2-ef9e55e86888.jsonl')).toBe(
      'f16fe8d6-97a1-4246-bad2-ef9e55e86888',
    );
  });

  it('should return undefined for non-transcript path', () => {
    expect(extractChatIdFromTranscriptPath('src/app.ts')).toBeUndefined();
  });
});

describe('resolveAtReference', () => {
  const createFileTree = (entries: Array<[string, Partial<FileEntry>]>): Map<string, FileEntry> =>
    new Map(
      entries.map(([path, partial]) => {
        const name = partial.name ?? path.split('/').pop()!;
        const size = partial.size ?? 0;
        const isLoaded = partial.isLoaded ?? true;
        const mtimeMs = partial.mtimeMs ?? 0;
        const entry: FileEntry =
          partial.type === 'dir'
            ? { path, name, type: 'dir', size, isLoaded, mtimeMs }
            : {
                path,
                name,
                type: 'file',
                size,
                isLoaded,
                mtimeMs,
                contentKind: 'text',
                lineCount: (partial as Partial<Extract<FileEntry, { type: 'file' }>>).lineCount ?? 1,
              };
        return [path, entry] as const;
      }),
    );

  const createChatsById = (chats: Array<{ id: string; name: string }>): Map<string, Chat> =>
    new Map(
      chats.map((c) => [c.id, { id: c.id, name: c.name, resourceId: 'r1', messages: [], createdAt: 0, updatedAt: 0 }]),
    );

  it('should resolve existing file path', () => {
    const fileTree = createFileTree([['src/app.ts', { name: 'app.ts', type: 'file' }]]);
    const chatsById = createChatsById([]);

    const result = resolveAtReference('src/app.ts', fileTree, chatsById);

    expect(result).toEqual({
      type: 'file',
      path: 'src/app.ts',
      displayName: 'app.ts',
      chipType: 'file',
    });
  });

  it('should resolve existing folder path', () => {
    const fileTree = createFileTree([['src/components', { name: 'components', type: 'dir' }]]);
    const chatsById = createChatsById([]);

    const result = resolveAtReference('src/components', fileTree, chatsById);

    expect(result).toEqual({
      type: 'folder',
      path: 'src/components',
      displayName: 'components',
      chipType: 'folder',
    });
  });

  it('should resolve chat transcript path', () => {
    const fileTree = createFileTree([]);
    const chatsById = createChatsById([{ id: 'chat-abc', name: 'My Discussion' }]);

    const result = resolveAtReference('.tau/transcripts/chat-abc.jsonl', fileTree, chatsById);

    expect(result).toEqual({
      type: 'chat',
      path: '.tau/transcripts/chat-abc.jsonl',
      displayName: 'My Discussion',
      chipType: 'chat',
      chatId: 'chat-abc',
    });
  });

  it('should return undefined for non-existent file', () => {
    const fileTree = createFileTree([]);
    const chatsById = createChatsById([]);

    expect(resolveAtReference('does/not/exist.ts', fileTree, chatsById)).toBeUndefined();
  });

  it('should return undefined for transcript path with non-existent chat', () => {
    const fileTree = createFileTree([]);
    const chatsById = createChatsById([]);

    expect(resolveAtReference('.tau/transcripts/missing-id.jsonl', fileTree, chatsById)).toBeUndefined();
  });

  it('should prioritize transcript resolution over file tree for transcript paths', () => {
    const fileTree = createFileTree([['.tau/transcripts/chat-1.jsonl', { name: 'chat-1.jsonl', type: 'file' }]]);
    const chatsById = createChatsById([{ id: 'chat-1', name: 'My Chat' }]);

    const result = resolveAtReference('.tau/transcripts/chat-1.jsonl', fileTree, chatsById);

    expect(result?.type).toBe('chat');
    expect(result?.displayName).toBe('My Chat');
  });
});

describe('buildPastedContent', () => {
  const createFileTree = (entries: Array<[string, Partial<FileEntry>]>): Map<string, FileEntry> =>
    new Map(
      entries.map(([path, partial]) => {
        const name = partial.name ?? path.split('/').pop()!;
        const size = partial.size ?? 0;
        const isLoaded = partial.isLoaded ?? true;
        const mtimeMs = partial.mtimeMs ?? 0;
        const entry: FileEntry =
          partial.type === 'dir'
            ? { path, name, type: 'dir', size, isLoaded, mtimeMs }
            : {
                path,
                name,
                type: 'file',
                size,
                isLoaded,
                mtimeMs,
                contentKind: 'text',
                lineCount: (partial as Partial<Extract<FileEntry, { type: 'file' }>>).lineCount ?? 1,
              };
        return [path, entry] as const;
      }),
    );

  const createChats = (chats: Array<{ id: string; name: string }>): Chat[] =>
    chats.map((c) => ({ id: c.id, name: c.name, resourceId: 'r1', messages: [], createdAt: 0, updatedAt: 0 }));

  it('should return text-only for text without references', () => {
    const result = buildPastedContent('hello world', { fileTree: new Map(), chats: [] });

    expect(result).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('should create chip for valid file reference', () => {
    const fileTree = createFileTree([['src/app.ts', { name: 'app.ts' }]]);
    const result = buildPastedContent('check @src/app.ts', { fileTree, chats: [] });

    expect(result).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'chip', id: 'src/app.ts', label: 'app.ts', chipType: 'file', path: 'src/app.ts' },
    ]);
  });

  it('should keep invalid reference as plain text', () => {
    const result = buildPastedContent('check @far-out/some-path/deep', { fileTree: new Map(), chats: [] });

    expect(result).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'text', value: '@far-out/some-path/deep' },
    ]);
  });

  it('should create chat chip for valid transcript reference', () => {
    const chats = createChats([{ id: 'c1', name: 'Design Review' }]);
    const result = buildPastedContent('see @.tau/transcripts/c1.jsonl', { fileTree: new Map(), chats });

    expect(result).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'chip', id: 'c1', label: 'Design Review', chipType: 'chat', path: '.tau/transcripts/c1.jsonl' },
    ]);
  });

  it('should handle mixed valid and invalid references', () => {
    const fileTree = createFileTree([['src/app.ts', { name: 'app.ts' }]]);
    const result = buildPastedContent('@src/app.ts and @missing/file.ts', { fileTree, chats: [] });

    expect(result).toEqual([
      { type: 'chip', id: 'src/app.ts', label: 'app.ts', chipType: 'file', path: 'src/app.ts' },
      { type: 'text', value: ' and ' },
      { type: 'text', value: '@missing/file.ts' },
    ]);
  });

  it('should resolve /command as skill chip when knownSkills is provided', () => {
    const knownSkills = new Set(['create-policy']);
    const result = buildPastedContent('/create-policy', { fileTree: new Map(), chats: [], knownSkills });

    expect(result).toEqual([{ type: 'chip', id: 'create-policy', label: '/create-policy', chipType: 'skill' }]);
  });

  it('should keep unknown /command as plain text', () => {
    const knownSkills = new Set(['create-policy']);
    const result = buildPastedContent('/unknown-skill', { fileTree: new Map(), chats: [], knownSkills });

    expect(result).toEqual([{ type: 'text', value: '/unknown-skill' }]);
  });

  it('should handle mixed @path and /command references', () => {
    const fileTree = createFileTree([['src/app.ts', { name: 'app.ts' }]]);
    const knownSkills = new Set(['repos']);
    const result = buildPastedContent('/repos check @src/app.ts', { fileTree, chats: [], knownSkills });

    expect(result).toEqual([
      { type: 'chip', id: 'repos', label: '/repos', chipType: 'skill' },
      { type: 'text', value: ' check ' },
      { type: 'chip', id: 'src/app.ts', label: 'app.ts', chipType: 'file', path: 'src/app.ts' },
    ]);
  });

  it('should treat /command as plain text when knownSkills is not provided', () => {
    const result = buildPastedContent('/create-policy', { fileTree: new Map(), chats: [] });

    expect(result).toEqual([{ type: 'text', value: '/create-policy' }]);
  });
});

describe('parseSlashCommands', () => {
  it('should return single text segment when no commands', () => {
    expect(parseSlashCommands('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('should parse /command at start of text', () => {
    expect(parseSlashCommands('/create-policy some text')).toEqual([
      { type: 'slashCommand', commandId: 'create-policy' },
      { type: 'text', value: ' some text' },
    ]);
  });

  it('should parse /command after whitespace', () => {
    expect(parseSlashCommands('run /repos now')).toEqual([
      { type: 'text', value: 'run ' },
      { type: 'slashCommand', commandId: 'repos' },
      { type: 'text', value: ' now' },
    ]);
  });

  it('should not match slash mid-word', () => {
    expect(parseSlashCommands('path/to/file')).toEqual([{ type: 'text', value: 'path/to/file' }]);
  });

  it('should parse multiple commands', () => {
    expect(parseSlashCommands('/repos /create-policy')).toEqual([
      { type: 'slashCommand', commandId: 'repos' },
      { type: 'text', value: ' ' },
      { type: 'slashCommand', commandId: 'create-policy' },
    ]);
  });

  it('should return empty array for empty text', () => {
    expect(parseSlashCommands('')).toEqual([]);
  });
});

describe('parseInlineReferences', () => {
  it('should handle text with both @ and / references', () => {
    const result = parseInlineReferences('/repos check @src/app.ts');

    expect(result).toEqual([
      { type: 'slashCommand', commandId: 'repos' },
      { type: 'text', value: ' check ' },
      { type: 'atReference', path: 'src/app.ts' },
    ]);
  });

  it('should handle @-only text', () => {
    const result = parseInlineReferences('check @src/app.ts');

    expect(result).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'atReference', path: 'src/app.ts' },
    ]);
  });

  it('should handle /-only text', () => {
    const result = parseInlineReferences('/create-policy');

    expect(result).toEqual([{ type: 'slashCommand', commandId: 'create-policy' }]);
  });

  it('should handle plain text with no references', () => {
    expect(parseInlineReferences('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('should preserve order of mixed references', () => {
    const result = parseInlineReferences('@src/a.ts /repos @src/b.ts');

    expect(result).toEqual([
      { type: 'atReference', path: 'src/a.ts' },
      { type: 'text', value: ' ' },
      { type: 'slashCommand', commandId: 'repos' },
      { type: 'text', value: ' ' },
      { type: 'atReference', path: 'src/b.ts' },
    ]);
  });
});

describe('resolveSlashCommand', () => {
  const knownSkills = new Set(['create-policy', 'repos', 'new-kernel']);

  it('should resolve known skill', () => {
    expect(resolveSlashCommand('create-policy', knownSkills)).toEqual({
      type: 'skill',
      commandId: 'create-policy',
      label: '/create-policy',
    });
  });

  it('should return undefined for unknown command', () => {
    expect(resolveSlashCommand('nonexistent', knownSkills)).toBeUndefined();
  });

  it('should return undefined for empty set', () => {
    expect(resolveSlashCommand('repos', new Set())).toBeUndefined();
  });
});
