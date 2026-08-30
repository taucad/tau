import type { FileEntry, FileStatEntry } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import type { ContextSuggestionItem } from '#components/chat/tiptap/suggestion-types.js';
import { fuzzyMatch } from '#components/chat/tiptap/fuzzy-match.js';
import { getChatRecencyAt } from '#utils/chat-recency.utils.js';

const recentFilesLimit = 3;

const isTauInternal = (path: string): boolean => path === '.tau' || path.startsWith('.tau/');

export type BuildContextItemsOptions = {
  fileTree: Map<string, FileEntry>;
  chats: Chat[];
  actionItems?: ContextSuggestionItem[];
};

export type BuildContextItemsFromSearchOptions = {
  fileEntries: FileStatEntry[];
  chats: Chat[];
  actionItems?: ContextSuggestionItem[];
};

export const recentFilesGroup = 'Recent Files';
export const filesFoldersGroup = 'Files & Folders';
export const pastChatsGroup = 'Past Chats';
export const takeScreenshotGroup = 'Take Screenshot';

export const categoryOrder = [filesFoldersGroup, takeScreenshotGroup, pastChatsGroup] as const;

export type CategoryDescriptor = {
  id: string;
  label: string;
  itemCount: number;
};

export function buildContextItems({ fileTree, chats, actionItems }: BuildContextItemsOptions): ContextSuggestionItem[] {
  const items: ContextSuggestionItem[] = [];

  const fileEntries = [...fileTree.entries()]
    .filter(([path, entry]) => entry.type === 'file' && !isTauInternal(path))
    .sort(([, a], [, b]) => b.mtimeMs - a.mtimeMs);

  const recentPaths = new Set(fileEntries.slice(0, recentFilesLimit).map(([path]) => path));

  for (const [path, entry] of fileEntries) {
    if (recentPaths.has(path)) {
      items.push({
        id: path,
        label: entry.name,
        chipType: 'file',
        path,
        group: recentFilesGroup,
        sortKey: entry.mtimeMs,
      });
    }
    items.push({
      id: path,
      label: entry.name,
      chipType: 'file',
      path,
      group: filesFoldersGroup,
      sortKey: entry.mtimeMs,
    });
  }

  for (const [path, entry] of fileTree) {
    if (entry.type === 'dir' && !isTauInternal(path)) {
      items.push({
        id: path,
        label: entry.name,
        chipType: 'folder',
        path,
        group: filesFoldersGroup,
      });
    }
  }

  for (const chat of chats) {
    items.push({
      id: chat.id,
      label: chat.name,
      chipType: 'chat',
      path: `.tau/transcripts/${chat.id}.jsonl`,
      group: pastChatsGroup,
      sortKey: getChatRecencyAt(chat),
    });
  }

  if (actionItems) {
    items.push(...actionItems);
  }

  return items;
}

/**
 * Build context suggestion items from worker-side search results (`FileStatEntry[]`).
 * Used when `treeService.searchFiles()` provides file entries instead of the full tree.
 */
export function buildContextItemsFromSearch({
  fileEntries,
  chats,
  actionItems,
}: BuildContextItemsFromSearchOptions): ContextSuggestionItem[] {
  const items: ContextSuggestionItem[] = [];

  const filtered = fileEntries.filter((entry) => !isTauInternal(entry.path));
  const sorted = [...filtered].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const recentPaths = new Set(sorted.slice(0, recentFilesLimit).map((entry) => entry.path));

  for (const entry of sorted) {
    if (recentPaths.has(entry.path)) {
      items.push({
        id: entry.path,
        label: entry.name,
        chipType: entry.type === 'dir' ? 'folder' : 'file',
        path: entry.path,
        group: recentFilesGroup,
        sortKey: entry.mtimeMs,
      });
    }
    items.push({
      id: entry.path,
      label: entry.name,
      chipType: entry.type === 'dir' ? 'folder' : 'file',
      path: entry.path,
      group: filesFoldersGroup,
      sortKey: entry.mtimeMs,
    });
  }

  for (const chat of chats) {
    items.push({
      id: chat.id,
      label: chat.name,
      chipType: 'chat',
      path: `.tau/transcripts/${chat.id}.jsonl`,
      group: pastChatsGroup,
      sortKey: getChatRecencyAt(chat),
    });
  }

  if (actionItems) {
    items.push(...actionItems);
  }

  return items;
}

/**
 * Returns items from the "Recent Files" group, sorted by `sortKey` descending
 * (most recently modified first). The group is pre-populated by `buildContextItems`
 * with at most 3 entries.
 */
export function getRecentFiles(items: ContextSuggestionItem[]): ContextSuggestionItem[] {
  return items.filter((item) => item.group === recentFilesGroup).sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0));
}

/**
 * Derives drillable category descriptors from the item list.
 * Excludes "Recent Files" (shown directly at root level).
 * Returns categories in a stable order defined by `categoryOrder`.
 */
export function getCategories(items: ContextSuggestionItem[]): CategoryDescriptor[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (item.group === recentFilesGroup) {
      continue;
    }
    counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
  }

  const categories: CategoryDescriptor[] = [];
  for (const group of categoryOrder) {
    const count = counts.get(group);
    if (count) {
      categories.push({ id: group, label: group, itemCount: count });
    }
  }

  for (const [group, count] of counts) {
    if (!(categoryOrder as readonly string[]).includes(group)) {
      categories.push({ id: group, label: group, itemCount: count });
    }
  }

  return categories;
}

/**
 * Returns all items belonging to a specific group/category.
 * For "Files & Folders", items are sorted by modification time descending,
 * then alphabetically for ties.
 */
export function getItemsForCategory(items: ContextSuggestionItem[], categoryId: string): ContextSuggestionItem[] {
  if (categoryId === filesFoldersGroup) {
    return items
      .filter((item) => item.group === filesFoldersGroup)
      .sort((a, b) => {
        const timeDiff = (b.sortKey ?? 0) - (a.sortKey ?? 0);
        if (timeDiff !== 0) {
          return timeDiff;
        }
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
      });
  }

  if (categoryId === pastChatsGroup) {
    return items.filter((item) => item.group === pastChatsGroup).sort((a, b) => (b.sortKey ?? 0) - (a.sortKey ?? 0));
  }

  return items.filter((item) => item.group === categoryId);
}

export type FilterAndRankResult = {
  matchedCategories: CategoryDescriptor[];
  matchedItems: ContextSuggestionItem[];
};

/**
 * Fuzzy-matches `query` against both category header names and individual
 * item labels. Returns matched categories (sorted by score descending)
 * followed by matched items (sorted by score descending).
 *
 * Items in the "Recent Files" group are excluded (they are duplicates of
 * "Files & Folders" entries and should not appear twice in search results).
 */
export function filterAndRankItems(items: ContextSuggestionItem[], query: string): FilterAndRankResult {
  if (!query) {
    return { matchedCategories: [], matchedItems: [] };
  }

  const categories = getCategories(items);
  const scoredCategories: Array<{ category: CategoryDescriptor; score: number }> = [];
  for (const category of categories) {
    const match = fuzzyMatch(query, category.label);
    if (match) {
      scoredCategories.push({ category, score: match.score });
    }
  }
  scoredCategories.sort((a, b) => b.score - a.score);

  const scoredItems: Array<{ item: ContextSuggestionItem; score: number }> = [];
  for (const item of items) {
    if (item.group === recentFilesGroup) {
      continue;
    }
    const match = fuzzyMatch(query, item.label);
    if (match) {
      scoredItems.push({ item, score: match.score });
    }
  }
  scoredItems.sort((a, b) => b.score - a.score);

  return {
    matchedCategories: scoredCategories.map((s) => s.category),
    matchedItems: scoredItems.map((s) => s.item),
  };
}
