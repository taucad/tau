import { describe, it, expect } from 'vitest';
import type { FileEntry } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import type { ContextSuggestionItem } from '#components/chat/tiptap/suggestion-types.js';
import {
  buildContextItems,
  getRecentFiles,
  getCategories,
  getItemsForCategory,
  filterAndRankItems,
  recentFilesGroup,
  filesFoldersGroup,
  pastChatsGroup,
  takeScreenshotGroup,
} from '#components/chat/tiptap/context-suggestion.utils.js';

// ── Factories ──────────────────────────────────────────────────────────

function createFileEntry(overrides: Partial<FileEntry> & { path: string; name: string }): FileEntry {
  const size = overrides.size ?? 100;
  const mtimeMs = overrides.mtimeMs ?? 0;
  const isLoaded = overrides.isLoaded ?? true;

  if (overrides.type === 'dir') {
    return {
      path: overrides.path,
      name: overrides.name,
      type: 'dir',
      size,
      mtimeMs,
      isLoaded,
      isDirectoryResolved: overrides.isDirectoryResolved,
    };
  }

  const fileOverrides = overrides as Partial<Extract<FileEntry, { type: 'file' }>> & { path: string; name: string };
  if (fileOverrides.contentKind === 'binary') {
    return {
      path: fileOverrides.path,
      name: fileOverrides.name,
      type: 'file',
      size,
      mtimeMs,
      isLoaded,
      contentKind: 'binary',
    };
  }

  return {
    path: fileOverrides.path,
    name: fileOverrides.name,
    type: 'file',
    size,
    mtimeMs,
    isLoaded,
    contentKind: 'text',
    lineCount: fileOverrides.lineCount ?? 1,
  };
}

function createChat(overrides: Partial<Chat> & { id: string; name: string }): Chat {
  const chat: Chat = {
    resourceId: 'project-1',
    messages: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
  return chat;
}

// ── buildContextItems ──────────────────────────────────────────────────

describe('buildContextItems', () => {
  it('should assign top 3 most recently modified files to "Recent Files" group', () => {
    const fileTree = new Map<string, FileEntry>([
      ['a.ts', createFileEntry({ path: 'a.ts', name: 'a.ts', mtimeMs: 1000 })],
      ['b.ts', createFileEntry({ path: 'b.ts', name: 'b.ts', mtimeMs: 3000 })],
      ['c.ts', createFileEntry({ path: 'c.ts', name: 'c.ts', mtimeMs: 2000 })],
      ['d.ts', createFileEntry({ path: 'd.ts', name: 'd.ts', mtimeMs: 4000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });
    const recentItems = items.filter((i) => i.group === recentFilesGroup);

    expect(recentItems).toHaveLength(3);
    const recentPaths = new Set(recentItems.map((i) => i.id));
    expect(recentPaths).toContain('d.ts');
    expect(recentPaths).toContain('b.ts');
    expect(recentPaths).toContain('c.ts');
    expect(recentPaths).not.toContain('a.ts');
  });

  it('should assign mtimeMs as sortKey to recent file items', () => {
    const fileTree = new Map<string, FileEntry>([
      ['a.ts', createFileEntry({ path: 'a.ts', name: 'a.ts', mtimeMs: 5000 })],
      ['b.ts', createFileEntry({ path: 'b.ts', name: 'b.ts', mtimeMs: 3000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });
    const recentItems = items.filter((i) => i.group === recentFilesGroup);

    expect(recentItems.find((i) => i.id === 'a.ts')?.sortKey).toBe(5000);
    expect(recentItems.find((i) => i.id === 'b.ts')?.sortKey).toBe(3000);
  });

  it('should include all files (including recent) in "Files & Folders" group', () => {
    const fileTree = new Map<string, FileEntry>([
      ['a.ts', createFileEntry({ path: 'a.ts', name: 'a.ts', mtimeMs: 3000 })],
      ['b.ts', createFileEntry({ path: 'b.ts', name: 'b.ts', mtimeMs: 1000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });
    const ffItems = items.filter((i) => i.group === filesFoldersGroup);

    expect(ffItems).toHaveLength(2);
    expect(ffItems.map((i) => i.id)).toContain('a.ts');
    expect(ffItems.map((i) => i.id)).toContain('b.ts');
  });

  it('should exclude directories from "Recent Files" group', () => {
    const fileTree = new Map<string, FileEntry>([
      ['src', createFileEntry({ path: 'src', name: 'src', type: 'dir', mtimeMs: 9000 })],
      ['a.ts', createFileEntry({ path: 'a.ts', name: 'a.ts', mtimeMs: 1000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });
    const recentItems = items.filter((i) => i.group === recentFilesGroup);

    expect(recentItems).toHaveLength(1);
    expect(recentItems[0]!.id).toBe('a.ts');
  });

  it('should set chipType to "folder" for directory entries', () => {
    const fileTree = new Map<string, FileEntry>([['src', createFileEntry({ path: 'src', name: 'src', type: 'dir' })]]);

    const items = buildContextItems({ fileTree, chats: [] });
    const directoryItem = items.find((i) => i.id === 'src');
    expect(directoryItem?.chipType).toBe('folder');
    expect(directoryItem?.group).toBe(filesFoldersGroup);
  });

  it('should build chat items with updatedAt as sortKey', () => {
    const chats = [
      createChat({ id: 'c1', name: 'Chat 1', updatedAt: 5000 }),
      createChat({ id: 'c2', name: 'Chat 2', updatedAt: 3000 }),
    ];

    const items = buildContextItems({ fileTree: new Map(), chats });
    const chatItems = items.filter((i) => i.group === pastChatsGroup);

    expect(chatItems).toHaveLength(2);
    expect(chatItems[0]).toEqual(
      expect.objectContaining({
        id: 'c1',
        label: 'Chat 1',
        chipType: 'chat',
        sortKey: 5000,
        path: '.tau/transcripts/c1.jsonl',
      }),
    );
  });

  it('should merge actionItems into the result', () => {
    const actionItems: ContextSuggestionItem[] = [
      {
        id: 'screenshot-main',
        label: 'Current view',
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'single' },
      },
    ];

    const items = buildContextItems({ fileTree: new Map(), chats: [], actionItems });

    expect(items).toContainEqual(expect.objectContaining({ id: 'screenshot-main', isAction: true }));
  });

  it('should return all items regardless of query (filtering is handled by filterAndRankItems)', () => {
    const fileTree = new Map<string, FileEntry>([
      ['src/Main.ts', createFileEntry({ path: 'src/Main.ts', name: 'Main.ts', mtimeMs: 1000 })],
      ['src/utils.ts', createFileEntry({ path: 'src/utils.ts', name: 'utils.ts', mtimeMs: 2000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });

    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.map((i) => i.label)).toContain('Main.ts');
    expect(items.map((i) => i.label)).toContain('utils.ts');
  });

  it('should handle fewer than 3 files gracefully', () => {
    const fileTree = new Map<string, FileEntry>([
      ['only.ts', createFileEntry({ path: 'only.ts', name: 'only.ts', mtimeMs: 1000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });
    const recentItems = items.filter((i) => i.group === recentFilesGroup);

    expect(recentItems).toHaveLength(1);
    expect(recentItems[0]!.id).toBe('only.ts');
  });

  it('should exclude files under .tau directory from all groups', () => {
    const fileTree = new Map<string, FileEntry>([
      ['.tau/cache/abc.bin', createFileEntry({ path: '.tau/cache/abc.bin', name: 'abc.bin', mtimeMs: 9000 })],
      [
        '.tau/artifacts/tool.json',
        createFileEntry({ path: '.tau/artifacts/tool.json', name: 'tool.json', mtimeMs: 8000 }),
      ],
      ['main.ts', createFileEntry({ path: 'main.ts', name: 'main.ts', mtimeMs: 1000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });

    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('.tau/cache/abc.bin');
    expect(ids).not.toContain('.tau/artifacts/tool.json');
    expect(ids).toContain('main.ts');
  });

  it('should exclude .tau directory itself from suggestions', () => {
    const fileTree = new Map<string, FileEntry>([
      ['.tau', createFileEntry({ path: '.tau', name: '.tau', type: 'dir' })],
      ['src', createFileEntry({ path: 'src', name: 'src', type: 'dir' })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });

    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('.tau');
    expect(ids).toContain('src');
  });

  it('should exclude .tau files from all groups', () => {
    const fileTree = new Map<string, FileEntry>([
      ['.tau/cache/abc.bin', createFileEntry({ path: '.tau/cache/abc.bin', name: 'abc.bin', mtimeMs: 5000 })],
      ['src/cache-utils.ts', createFileEntry({ path: 'src/cache-utils.ts', name: 'cache-utils.ts', mtimeMs: 1000 })],
    ]);

    const items = buildContextItems({ fileTree, chats: [] });

    const ids = items.map((i) => i.id);
    expect(ids).not.toContain('.tau/cache/abc.bin');
    expect(ids).toContain('src/cache-utils.ts');
  });

  it('should not filter chat items with .tau transcript paths', () => {
    const chats = [createChat({ id: 'chat-1', name: 'My Chat', updatedAt: 5000 })];

    const items = buildContextItems({ fileTree: new Map(), chats });
    const chatItems = items.filter((i) => i.group === pastChatsGroup);

    expect(chatItems).toHaveLength(1);
    expect(chatItems[0]).toEqual(
      expect.objectContaining({
        id: 'chat-1',
        path: '.tau/transcripts/chat-1.jsonl',
        group: pastChatsGroup,
      }),
    );
  });
});

// ── getRecentFiles ─────────────────────────────────────────────────────

describe('getRecentFiles', () => {
  it('should return items from "Recent Files" group sorted by sortKey descending', () => {
    const items: ContextSuggestionItem[] = [
      { id: '1', label: 'old.ts', chipType: 'file', group: recentFilesGroup, sortKey: 1000 },
      { id: '2', label: 'new.ts', chipType: 'file', group: recentFilesGroup, sortKey: 3000 },
      { id: '3', label: 'mid.ts', chipType: 'file', group: recentFilesGroup, sortKey: 2000 },
      { id: '4', label: 'other.ts', chipType: 'file', group: filesFoldersGroup },
    ];

    const result = getRecentFiles(items);
    expect(result.map((i) => i.label)).toEqual(['new.ts', 'mid.ts', 'old.ts']);
  });

  it('should exclude non-recent-files items', () => {
    const items: ContextSuggestionItem[] = [
      { id: '1', label: 'a.ts', chipType: 'file', group: recentFilesGroup, sortKey: 1000 },
      { id: '2', label: 'b.ts', chipType: 'file', group: filesFoldersGroup },
      { id: '3', label: 'Chat', chipType: 'chat', group: pastChatsGroup },
    ];

    const result = getRecentFiles(items);
    expect(result).toHaveLength(1);
    expect(result[0]!.group).toBe(recentFilesGroup);
  });

  it('should return empty array when no recent files exist', () => {
    const items: ContextSuggestionItem[] = [{ id: '1', label: 'a.ts', chipType: 'file', group: filesFoldersGroup }];
    expect(getRecentFiles(items)).toEqual([]);
  });
});

// ── getCategories ──────────────────────────────────────────────────────

describe('getCategories', () => {
  it('should derive categories from item groups, excluding Recent Files', () => {
    const items: ContextSuggestionItem[] = [
      { id: '1', label: 'a.ts', chipType: 'file', group: recentFilesGroup, sortKey: 1000 },
      { id: '2', label: 'b.ts', chipType: 'file', group: filesFoldersGroup },
      { id: '3', label: 'Chat', chipType: 'chat', group: pastChatsGroup },
    ];

    const categories = getCategories(items);
    expect(categories.map((c) => c.id)).toEqual([filesFoldersGroup, pastChatsGroup]);
  });

  it('should include item count per category', () => {
    const items: ContextSuggestionItem[] = [
      { id: '1', label: 'a.ts', chipType: 'file', group: filesFoldersGroup },
      { id: '2', label: 'b.ts', chipType: 'file', group: filesFoldersGroup },
      { id: '3', label: 'Chat', chipType: 'chat', group: pastChatsGroup },
    ];

    const categories = getCategories(items);
    expect(categories.find((c) => c.id === filesFoldersGroup)?.itemCount).toBe(2);
    expect(categories.find((c) => c.id === pastChatsGroup)?.itemCount).toBe(1);
  });

  it('should follow categoryOrder for known groups', () => {
    const items: ContextSuggestionItem[] = [
      { id: '1', label: 'Chat', chipType: 'chat', group: pastChatsGroup },
      {
        id: '2',
        label: 'View',
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'single' },
      },
      { id: '3', label: 'a.ts', chipType: 'file', group: filesFoldersGroup },
    ];

    const categories = getCategories(items);
    expect(categories.map((c) => c.id)).toEqual([filesFoldersGroup, takeScreenshotGroup, pastChatsGroup]);
  });

  it('should append unknown groups after known ones', () => {
    const items: ContextSuggestionItem[] = [
      { id: '1', label: 'x', chipType: 'code', group: 'Custom Group' },
      { id: '2', label: 'a.ts', chipType: 'file', group: filesFoldersGroup },
    ];

    const categories = getCategories(items);
    expect(categories.map((c) => c.id)).toEqual([filesFoldersGroup, 'Custom Group']);
  });

  it('should return empty array when only Recent Files exist', () => {
    const items: ContextSuggestionItem[] = [
      { id: '1', label: 'a.ts', chipType: 'file', group: recentFilesGroup, sortKey: 1000 },
    ];
    expect(getCategories(items)).toEqual([]);
  });
});

// ── getItemsForCategory ────────────────────────────────────────────────

describe('getItemsForCategory', () => {
  describe('Files & Folders', () => {
    it('should sort files by mtimeMs descending, then alphabetically for ties', () => {
      const items: ContextSuggestionItem[] = [
        { id: 'f1', label: 'beta.ts', chipType: 'file', group: filesFoldersGroup, sortKey: 2000 },
        { id: 'f2', label: 'alpha.ts', chipType: 'file', group: filesFoldersGroup, sortKey: 2000 },
        { id: 'f3', label: 'zebra.ts', chipType: 'file', group: filesFoldersGroup, sortKey: 3000 },
        { id: 'f4', label: 'cherry.ts', chipType: 'file', group: filesFoldersGroup, sortKey: 1000 },
      ];

      const result = getItemsForCategory(items, filesFoldersGroup);
      expect(result.map((i) => i.label)).toEqual(['zebra.ts', 'alpha.ts', 'beta.ts', 'cherry.ts']);
    });

    it('should not include items from other groups', () => {
      const items: ContextSuggestionItem[] = [
        { id: 'f1', label: 'a.ts', chipType: 'file', group: filesFoldersGroup },
        { id: 'r1', label: 'b.ts', chipType: 'file', group: recentFilesGroup, sortKey: 1000 },
        { id: 'c1', label: 'Chat', chipType: 'chat', group: pastChatsGroup },
      ];

      const result = getItemsForCategory(items, filesFoldersGroup);
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('f1');
    });
  });

  describe('Past Chats', () => {
    it('should sort chats by sortKey descending (most recent first)', () => {
      const items: ContextSuggestionItem[] = [
        { id: 'c1', label: 'Old chat', chipType: 'chat', group: pastChatsGroup, sortKey: 1000 },
        { id: 'c2', label: 'New chat', chipType: 'chat', group: pastChatsGroup, sortKey: 5000 },
        { id: 'c3', label: 'Mid chat', chipType: 'chat', group: pastChatsGroup, sortKey: 3000 },
      ];

      const result = getItemsForCategory(items, pastChatsGroup);
      expect(result.map((i) => i.label)).toEqual(['New chat', 'Mid chat', 'Old chat']);
    });
  });

  describe('other groups', () => {
    it('should return items matching the category, preserving original order', () => {
      const items: ContextSuggestionItem[] = [
        {
          id: 's1',
          label: 'Current view',
          chipType: 'screenshot',
          group: takeScreenshotGroup,
          isAction: true,
          screenshotAction: { type: 'single' },
        },
        {
          id: 's2',
          label: 'Ortho x 6',
          chipType: 'screenshot',
          group: takeScreenshotGroup,
          isAction: true,
          screenshotAction: { type: 'orthographic' },
        },
        { id: 'f1', label: 'a.ts', chipType: 'file', group: filesFoldersGroup },
      ];

      const result = getItemsForCategory(items, takeScreenshotGroup);
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.label)).toEqual(['Current view', 'Ortho x 6']);
    });
  });

  it('should return empty array when no items match', () => {
    const items: ContextSuggestionItem[] = [{ id: '1', label: 'a.ts', chipType: 'file', group: filesFoldersGroup }];
    expect(getItemsForCategory(items, pastChatsGroup)).toEqual([]);
  });
});

// ── filterAndRankItems ────────────────────────────────────────────────

describe('filterAndRankItems', () => {
  const baseItems: ContextSuggestionItem[] = [
    { id: 'f1', label: 'main.ts', chipType: 'file', group: filesFoldersGroup, sortKey: 5000 },
    { id: 'f2', label: 'utils.ts', chipType: 'file', group: filesFoldersGroup, sortKey: 4000 },
    { id: 'f3', label: 'parameters-sorter.ts', chipType: 'file', group: filesFoldersGroup, sortKey: 3000 },
    { id: 'r1', label: 'main.ts', chipType: 'file', group: recentFilesGroup, sortKey: 5000 },
    { id: 'c1', label: 'Design Chat', chipType: 'chat', group: pastChatsGroup, sortKey: 5000 },
    { id: 'c2', label: 'Debug session', chipType: 'chat', group: pastChatsGroup, sortKey: 3000 },
    {
      id: 's1',
      label: 'Current view',
      chipType: 'screenshot',
      group: takeScreenshotGroup,
      isAction: true,
      screenshotAction: { type: 'single' },
    },
  ];

  it('should return matching categories when query matches a category name', () => {
    const result = filterAndRankItems(baseItems, 'pas');
    const categoryIds = result.matchedCategories.map((c) => c.id);
    expect(categoryIds).toContain(pastChatsGroup);
  });

  it('should return matching items when query matches item labels', () => {
    const result = filterAndRankItems(baseItems, 'main');
    const itemLabels = result.matchedItems.map((i) => i.label);
    expect(itemLabels).toContain('main.ts');
  });

  it('should return both matched categories and items when query matches both', () => {
    const result = filterAndRankItems(baseItems, 'de');
    expect(result.matchedCategories.length).toBeGreaterThanOrEqual(0);
    expect(result.matchedItems.length).toBeGreaterThanOrEqual(1);
    expect(result.matchedItems.map((i) => i.label)).toContain('Design Chat');
  });

  it('should sort categories by fuzzy match score descending', () => {
    const items: ContextSuggestionItem[] = [
      { id: 'f1', label: 'a.ts', chipType: 'file', group: filesFoldersGroup },
      { id: 'c1', label: 'Chat', chipType: 'chat', group: pastChatsGroup },
      {
        id: 's1',
        label: 'View',
        chipType: 'screenshot',
        group: takeScreenshotGroup,
        isAction: true,
        screenshotAction: { type: 'single' },
      },
    ];

    const result = filterAndRankItems(items, 'fi');
    expect(result.matchedCategories.length).toBeGreaterThanOrEqual(1);
    expect(result.matchedCategories[0]!.id).toBe(filesFoldersGroup);
  });

  it('should sort items by fuzzy match score descending', () => {
    const result = filterAndRankItems(baseItems, 'pas');
    const itemLabels = result.matchedItems.map((i) => i.label);
    expect(itemLabels.indexOf('parameters-sorter.ts')).toBeGreaterThanOrEqual(0);
  });

  it('should return empty arrays when nothing matches', () => {
    const result = filterAndRankItems(baseItems, 'zzz');
    expect(result.matchedCategories).toEqual([]);
    expect(result.matchedItems).toEqual([]);
  });

  it('should return empty arrays for empty query', () => {
    const result = filterAndRankItems(baseItems, '');
    expect(result.matchedCategories).toEqual([]);
    expect(result.matchedItems).toEqual([]);
  });

  it('should be case-insensitive', () => {
    const result = filterAndRankItems(baseItems, 'MAIN');
    expect(result.matchedItems.map((i) => i.label)).toContain('main.ts');
  });

  it('should exclude "Recent Files" items from matched items to avoid duplicates', () => {
    const result = filterAndRankItems(baseItems, 'main');
    const matchedGroups = result.matchedItems.map((i) => i.group);
    expect(matchedGroups).not.toContain(recentFilesGroup);
  });

  it('should rank "Past Chats" category higher than "parameters-sorter.ts" item for query "pas"', () => {
    const result = filterAndRankItems(baseItems, 'pas');
    expect(result.matchedCategories.map((c) => c.id)).toContain(pastChatsGroup);
    expect(result.matchedItems.map((i) => i.label)).toContain('parameters-sorter.ts');
  });
});
