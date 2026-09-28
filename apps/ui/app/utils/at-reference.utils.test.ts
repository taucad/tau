import { describe, it, expect } from 'vitest';
import type { FileEntry } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import {
  parseAtReferences,
  isChatLogPath,
  extractChatIdFromChatLogPath,
  resolveAtReference,
  buildPastedContent,
  commandInvocation,
  escapeDollarInvocations,
  parseInlineReferences,
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
    const result = parseAtReferences('check @apps/ui/app/routes/w.$workspace.$project/chat-message.tsx');

    expect(result).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'reference', path: 'apps/ui/app/routes/w.$workspace.$project/chat-message.tsx' },
    ]);
  });

  it('should handle transcript paths', () => {
    const result = parseAtReferences('see @.tau/chats/abc-123/events.jsonl');

    expect(result).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'reference', path: '.tau/chats/abc-123/events.jsonl' },
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

describe('isChatLogPath', () => {
  it('should return true for valid transcript path', () => {
    expect(isChatLogPath('.tau/chats/abc-123/events.jsonl')).toBe(true);
  });

  it('should return true for UUID transcript path', () => {
    expect(isChatLogPath('.tau/chats/f16fe8d6-97a1-4246-bad2-ef9e55e86888/events.jsonl')).toBe(true);
  });

  it('should return false for non-transcript path', () => {
    expect(isChatLogPath('src/app.ts')).toBe(false);
  });

  it('should return false for wrong extension', () => {
    expect(isChatLogPath('.tau/chats/abc-123/events.json')).toBe(false);
  });

  it('should return false for wrong directory', () => {
    expect(isChatLogPath('.tau/skills/abc-123.jsonl')).toBe(false);
  });
});

describe('extractChatIdFromChatLogPath', () => {
  it('should extract chat ID from valid transcript path', () => {
    expect(extractChatIdFromChatLogPath('.tau/chats/abc-123/events.jsonl')).toBe('abc-123');
  });

  it('should extract UUID from transcript path', () => {
    expect(extractChatIdFromChatLogPath('.tau/chats/f16fe8d6-97a1-4246-bad2-ef9e55e86888/events.jsonl')).toBe(
      'f16fe8d6-97a1-4246-bad2-ef9e55e86888',
    );
  });

  it('should return undefined for non-transcript path', () => {
    expect(extractChatIdFromChatLogPath('src/app.ts')).toBeUndefined();
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

    const result = resolveAtReference('.tau/chats/chat-abc/events.jsonl', fileTree, chatsById);

    expect(result).toEqual({
      type: 'chat',
      path: '.tau/chats/chat-abc/events.jsonl',
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

    expect(resolveAtReference('.tau/chats/missing-id/events.jsonl', fileTree, chatsById)).toBeUndefined();
  });

  it('should prioritize transcript resolution over file tree for transcript paths', () => {
    const fileTree = createFileTree([['.tau/chats/chat-1/events.jsonl', { name: 'chat-1.jsonl', type: 'file' }]]);
    const chatsById = createChatsById([{ id: 'chat-1', name: 'My Chat' }]);

    const result = resolveAtReference('.tau/chats/chat-1/events.jsonl', fileTree, chatsById);

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
    const result = buildPastedContent('see @.tau/chats/c1/events.jsonl', { fileTree: new Map(), chats });

    expect(result).toEqual([
      { type: 'text', value: 'see ' },
      { type: 'chip', id: 'c1', label: 'Design Review', chipType: 'chat', path: '.tau/chats/c1/events.jsonl' },
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

  it('should resolve /command as skill chip when knownTokens is provided', () => {
    const knownTokens = new Set(['/create-policy']);
    const result = buildPastedContent('/create-policy', { fileTree: new Map(), chats: [], knownTokens });

    expect(result).toEqual([{ type: 'chip', id: '/create-policy', label: '/create-policy', chipType: 'skill' }]);
  });

  it('should resolve a Codex $skill and a namespaced $skill as chips', () => {
    const knownTokens = new Set(['$imagegen', '$openai-templates:simple-dark']);
    const result = buildPastedContent('Render with $imagegen then $openai-templates:simple-dark.', {
      fileTree: new Map(),
      chats: [],
      knownTokens,
    });

    expect(result).toEqual([
      { type: 'text', value: 'Render with ' },
      { type: 'chip', id: '$imagegen', label: '$imagegen', chipType: 'skill' },
      { type: 'text', value: ' then ' },
      { type: 'chip', id: '$openai-templates:simple-dark', label: '$openai-templates:simple-dark', chipType: 'skill' },
      { type: 'text', value: '.' },
    ]);
  });

  it('should not chip a token under the other prefix', () => {
    const knownTokens = new Set(['$imagegen']);
    const result = buildPastedContent('/imagegen', { fileTree: new Map(), chats: [], knownTokens });

    expect(result).toEqual([{ type: 'text', value: '/imagegen' }]);
  });

  it('should keep unknown /command as plain text', () => {
    const knownTokens = new Set(['/create-policy']);
    const result = buildPastedContent('/unknown-skill', { fileTree: new Map(), chats: [], knownTokens });

    expect(result).toEqual([{ type: 'text', value: '/unknown-skill' }]);
  });

  it('should handle mixed @path and /command references', () => {
    const fileTree = createFileTree([['src/app.ts', { name: 'app.ts' }]]);
    const knownTokens = new Set(['/repos']);
    const result = buildPastedContent('/repos check @src/app.ts', { fileTree, chats: [], knownTokens });

    expect(result).toEqual([
      { type: 'chip', id: '/repos', label: '/repos', chipType: 'skill' },
      { type: 'text', value: ' check ' },
      { type: 'chip', id: 'src/app.ts', label: 'app.ts', chipType: 'file', path: 'src/app.ts' },
    ]);
  });

  it('should treat /command as plain text when knownTokens is not provided', () => {
    const result = buildPastedContent('/create-policy', { fileTree: new Map(), chats: [] });

    expect(result).toEqual([{ type: 'text', value: '/create-policy' }]);
  });
});

describe('parseInlineReferences', () => {
  it('should handle text with both @ and / references', () => {
    expect(parseInlineReferences('/repos check @src/app.ts')).toEqual([
      { type: 'invocation', token: '/repos' },
      { type: 'text', value: ' check ' },
      { type: 'atReference', path: 'src/app.ts' },
    ]);
  });

  it('should handle @-only text', () => {
    expect(parseInlineReferences('check @src/app.ts')).toEqual([
      { type: 'text', value: 'check ' },
      { type: 'atReference', path: 'src/app.ts' },
    ]);
  });

  it('should parse $ and namespaced tokens and stop before trailing punctuation', () => {
    expect(parseInlineReferences('use $imagegen: or $template-creator:template-creator, /compact!')).toEqual([
      { type: 'text', value: 'use ' },
      { type: 'invocation', token: '$imagegen' },
      { type: 'text', value: ': or ' },
      { type: 'invocation', token: '$template-creator:template-creator' },
      { type: 'text', value: ', ' },
      { type: 'invocation', token: '/compact' },
      { type: 'text', value: '!' },
    ]);
  });

  it('should leave paths and mid-word slashes as text', () => {
    expect(parseInlineReferences('see /usr/bin and path/to/file')).toEqual([
      { type: 'text', value: 'see /usr/bin and path/to/file' },
    ]);
  });

  it('should require whitespace or start before a token', () => {
    expect(parseInlineReferences('a$imagegen (/repos)')).toEqual([{ type: 'text', value: 'a$imagegen (/repos)' }]);
  });

  it('should handle plain text with no references', () => {
    expect(parseInlineReferences('hello world')).toEqual([{ type: 'text', value: 'hello world' }]);
  });

  it('should return no segments for empty text', () => {
    expect(parseInlineReferences('')).toEqual([]);
  });

  it('should preserve order of mixed references', () => {
    expect(parseInlineReferences('@src/a.ts /repos @src/b.ts')).toEqual([
      { type: 'atReference', path: 'src/a.ts' },
      { type: 'text', value: ' ' },
      { type: 'invocation', token: '/repos' },
      { type: 'text', value: ' ' },
      { type: 'atReference', path: 'src/b.ts' },
    ]);
  });
});

describe('commandInvocation', () => {
  it('keeps advertised prefixes and adds / to bare names', () => {
    expect(commandInvocation('$imagegen')).toBe('$imagegen');
    expect(commandInvocation('/review')).toBe('/review');
    expect(commandInvocation('compact')).toBe('/compact');
  });
});

describe('escapeDollarInvocations', () => {
  const knownTokens = new Set(['$imagegen', '$brep-design']);

  it('escapes known $ tokens so single-dollar math cannot pair them', () => {
    expect(escapeDollarInvocations('use $imagegen and $brep-design', knownTokens)).toBe(
      String.raw`use \$imagegen and \$brep-design`,
    );
  });

  it('leaves unknown dollars, slash tokens and code verbatim', () => {
    const markdown = 'costs $5, /review, `$imagegen` and\n```\n$brep-design\n```\nthen $imagegen';
    expect(escapeDollarInvocations(markdown, knownTokens)).toBe(
      'costs $5, /review, `$imagegen` and\n```\n$brep-design\n```\nthen \\$imagegen',
    );
  });
});
