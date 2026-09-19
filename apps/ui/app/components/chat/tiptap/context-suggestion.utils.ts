import { classify, pathRegistry } from '@taucad/filesystem/path-registry';
import type { FileEntry, FileProvenance, FileStatEntry } from '@taucad/types';
import type { Chat } from '@taucad/chat';
import type { ContextSuggestionItem } from '#components/chat/tiptap/suggestion-types.js';
import { fuzzyMatch } from '#components/chat/tiptap/fuzzy-match.js';
import { getChatRecencyAt } from '#utils/chat-recency.utils.js';

const recentFilesLimit = 3;

/**
 * Whether a row is one of the user's own project files.
 *
 * A `@`-mention offers the design, not the host's bookkeeping: the reserved
 * `.tau` layout, regenerable cache and the control plane are out, and so are the
 * read-only overlays and mounts the composed view merges in (Exclusion Matrix
 * row `P`). Everything else the project owns is offerable whether or not a
 * revision carries it — an exported STL is the user's (a1 review R1).
 *
 * One rule for both callers: the view's answer wherever it rode along, and the
 * same registry the view derives its classes from for a row that never met a
 * view (the authority's own project search carries no provenance).
 */
const isOfferableProjectPath = (path: string, provenance: FileProvenance | undefined): boolean => {
  const { class: pathClass } = classify(path);
  if (pathClass === 'cache' || pathClass === 'control-plane' || isReservedPath(path)) {
    return false;
  }
  return provenance === undefined || provenance.source === 'project';
};

/**
 * Whether a path is part of the reserved project layout rather than the design.
 *
 * `.tau` itself names no registry row — its children do — so `classify` calls it
 * authored. Asking the registry which rows sit inside a container answers both
 * the container and everything under it, which keeps the answer in the one
 * table instead of restoring a `.tau` prefix test here.
 */
const isReservedPath = (path: string): boolean =>
  pathRegistry.some(
    (row) =>
      row.anchored &&
      row.prefix.includes('/') &&
      (row.prefix === path || row.prefix.startsWith(`${path}/`) || path.startsWith(`${row.prefix}/`)),
  );

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
    .filter(([path, entry]) => entry.type === 'file' && isOfferableProjectPath(path, entry.provenance))
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
    if (entry.type === 'dir' && isOfferableProjectPath(path, entry.provenance)) {
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
      path: `.tau/chats/${chat.id}/events.jsonl`,
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

  const filtered = fileEntries.filter((entry) => isOfferableProjectPath(entry.path, entry.provenance));
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
      path: `.tau/chats/${chat.id}/events.jsonl`,
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
