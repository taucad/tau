import { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { Extension } from '@tiptap/core';
import { Suggestion } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { File as FileIcon, Folder, MessageSquare, Camera, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import type { VirtuosoHandle } from 'react-virtuoso';
import { FileExtensionIcon } from '#components/icons/file-extension-icon.js';
import { cn } from '#utils/ui.utils.js';
import { Separator } from '#components/ui/separator.js';
import {
  getRecentFiles,
  getCategories,
  getItemsForCategory,
  filterAndRankItems,
} from '#components/chat/tiptap/context-suggestion.utils.js';
import type {
  ContextSuggestionItem,
  SuggestionPopupState,
  SuggestionRenderCallbacks,
} from '#components/chat/tiptap/suggestion-types.js';
import type { CategoryDescriptor } from '#components/chat/tiptap/context-suggestion.utils.js';

const contextMentionPluginKey = new PluginKey('contextMention');

export const virtualizationThreshold = 50;

const groupIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  'Recent Files': FileIcon,
  'Files & Folders': Folder,
  'Past Chats': MessageSquare,
  'Take Screenshot': Camera,
  Screenshots: Camera,
  'Code Issues': AlertCircle,
};

export type ContextMentionOptions = {
  getItems: (query: string) => ContextSuggestionItem[] | Promise<ContextSuggestionItem[]>;
  renderCallbacks: SuggestionRenderCallbacks<ContextSuggestionItem>;
  onAction?: (item: ContextSuggestionItem) => void;
};

export const ContextMention = Extension.create<ContextMentionOptions>({
  name: 'contextMention',

  addOptions() {
    return {
      getItems: () => [],
      renderCallbacks: {
        onStateChange: () => undefined,
        keydownHandlerRef: { current: undefined },
      },
      onAction: undefined,
    };
  },

  addProseMirrorPlugins() {
    const { getItems, renderCallbacks, onAction } = this.options;

    return [
      // oxlint-disable-next-line new-cap -- Tiptap's Suggestion factory is PascalCase
      Suggestion<ContextSuggestionItem>({
        pluginKey: contextMentionPluginKey,
        editor: this.editor,
        char: '@',
        items: async ({ query }) => getItems(query),
        command: ({ editor, range, props }) => {
          const item = props as ContextSuggestionItem;
          if (item.isAction) {
            editor.chain().focus().deleteRange(range).run();
            onAction?.(item);
            return;
          }

          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: 'contextChip',
              attrs: {
                id: item.id,
                label: item.label,
                chipType: item.chipType,
                path: item.path,
              },
            })
            .insertContent(' ')
            .run();
        },
        render: () => ({
          onStart(properties) {
            renderCallbacks.onStateChange({
              query: properties.query,
              items: properties.items,
              command: properties.command as (item: ContextSuggestionItem) => void,
              clientRect: properties.clientRect ?? undefined,
            } as SuggestionPopupState<ContextSuggestionItem>);
          },
          onUpdate(properties) {
            renderCallbacks.onStateChange({
              query: properties.query,
              items: properties.items,
              command: properties.command as (item: ContextSuggestionItem) => void,
              clientRect: properties.clientRect ?? undefined,
            } as SuggestionPopupState<ContextSuggestionItem>);
          },
          onExit() {
            renderCallbacks.onStateChange(undefined);
          },
          onKeyDown({ event }) {
            return renderCallbacks.keydownHandlerRef.current?.(event) ?? false;
          },
        }),
      }),
    ];
  },
});

// --- Dropdown UI Component ---

function ItemIcon({
  item,
  className,
}: {
  readonly item: ContextSuggestionItem;
  readonly className?: string;
}): React.JSX.Element {
  if (item.chipType === 'file') {
    return <FileExtensionIcon filename={item.label} className={className} />;
  }

  const Icon = groupIcons[item.group] ?? FileIcon;
  return <Icon className={className} />;
}

type NavigableEntry =
  | { kind: 'item'; item: ContextSuggestionItem }
  | { kind: 'category'; category: CategoryDescriptor };

export const ContextSuggestionDropdown = memo(function ContextSuggestionDropdown({
  state,
  keydownHandlerRef,
}: {
  readonly state: SuggestionPopupState<ContextSuggestionItem>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  readonly keydownHandlerRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;
}): React.JSX.Element | undefined {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [drilledCategory, setDrilledCategory] = useState<string | undefined>(undefined);
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref requires null init
  const containerReference = useRef<HTMLDivElement>(null);
  const itemReferences = useRef<Map<number, HTMLButtonElement>>(new Map());
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref requires null init
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const { items, query, command, clientRect } = state;

  const hasQuery = query.length > 0;

  // Reset drill state and selection when items or query change
  useEffect(() => {
    setSelectedIndex(0);
    setDrilledCategory(undefined);
  }, [items, query]);

  useEffect(() => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: selectedIndex });
    } else {
      const element = itemReferences.current.get(selectedIndex);
      element?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const recentFiles = useMemo(() => getRecentFiles(items), [items]);
  const categories = useMemo(() => getCategories(items), [items]);
  const drilledItems = useMemo(
    () => (drilledCategory ? getItemsForCategory(items, drilledCategory) : []),
    [items, drilledCategory],
  );
  const searchResults = useMemo(
    () => (hasQuery ? filterAndRankItems(items, query) : undefined),
    [hasQuery, items, query],
  );

  const navigableEntries = useMemo((): NavigableEntry[] => {
    if (drilledCategory) {
      return drilledItems.map((item): NavigableEntry => ({ kind: 'item', item }));
    }

    if (hasQuery && searchResults) {
      const entries: NavigableEntry[] = [];
      for (const cat of searchResults.matchedCategories) {
        entries.push({ kind: 'category', category: cat });
      }
      for (const item of searchResults.matchedItems) {
        entries.push({ kind: 'item', item });
      }
      return entries;
    }

    const entries: NavigableEntry[] = [];
    for (const file of recentFiles) {
      entries.push({ kind: 'item', item: file });
    }
    for (const cat of categories) {
      entries.push({ kind: 'category', category: cat });
    }
    return entries;
  }, [hasQuery, searchResults, drilledCategory, drilledItems, recentFiles, categories]);

  const handleDrillBack = useCallback(() => {
    setDrilledCategory(undefined);
    setSelectedIndex(0);
  }, []);

  const selectEntry = useCallback(
    (index: number) => {
      const entry = navigableEntries[index];
      if (!entry) {
        return;
      }
      if (entry.kind === 'category') {
        setDrilledCategory(entry.category.id);
        setSelectedIndex(0);
      } else {
        command(entry.item);
      }
    },
    [navigableEntries, command],
  );

  useEffect(() => {
    keydownHandlerRef.current = (event: KeyboardEvent): boolean => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((previous) => (previous <= 0 ? navigableEntries.length - 1 : previous - 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((previous) => (previous >= navigableEntries.length - 1 ? 0 : previous + 1));
        return true;
      }
      if (event.key === 'Enter') {
        selectEntry(selectedIndex);
        return true;
      }
      if (event.key === 'Escape') {
        if (drilledCategory) {
          handleDrillBack();
          return true;
        }
        return false;
      }
      return false;
    };

    return () => {
      keydownHandlerRef.current = undefined;
    };
  }, [navigableEntries, selectedIndex, selectEntry, keydownHandlerRef, drilledCategory, handleDrillBack]);

  const rect = clientRect?.();
  if (!rect) {
    return undefined;
  }

  const renderEntry = (entry: NavigableEntry, index: number): React.JSX.Element => {
    if (entry.kind === 'category') {
      const { category } = entry;
      const Icon = groupIcons[category.id] ?? FileIcon;
      return (
        <button
          key={category.id}
          ref={(element) => {
            if (element) {
              itemReferences.current.set(index, element);
            } else {
              itemReferences.current.delete(index);
            }
          }}
          type='button'
          className={cn(
            'flex w-full items-center gap-2 rounded-sm px-2 h-7 text-left text-sm',
            'hover:bg-accent hover:text-accent-foreground',
            index === selectedIndex && 'bg-accent text-accent-foreground',
          )}
          onClick={() => {
            selectEntry(index);
          }}
          onMouseEnter={() => {
            setSelectedIndex(index);
          }}
        >
          <Icon className='size-3 shrink-0' />
          <span className='truncate'>{category.label}</span>
          <ChevronRight className='ml-auto size-3.5 shrink-0 text-muted-foreground' />
        </button>
      );
    }

    const { item } = entry;
    return (
      <button
        key={item.id}
        ref={(element) => {
          if (element) {
            itemReferences.current.set(index, element);
          } else {
            itemReferences.current.delete(index);
          }
        }}
        type='button'
        className={cn(
          'flex w-full items-center gap-2 rounded-sm px-2 h-7 text-left text-sm',
          'hover:bg-accent hover:text-accent-foreground',
          index === selectedIndex && 'bg-accent text-accent-foreground',
        )}
        onClick={() => {
          selectEntry(index);
        }}
        onMouseEnter={() => {
          setSelectedIndex(index);
        }}
      >
        <ItemIcon item={item} className='size-3 shrink-0' />
        <span className='truncate'>{item.label}</span>
        {item.path ? (
          <span className='ml-auto max-w-24 truncate text-xs text-muted-foreground'>{item.path}</span>
        ) : undefined}
      </button>
    );
  };

  const renderVirtualizedList = (entries: NavigableEntry[], height: string) => (
    <Virtuoso
      ref={virtuosoRef}
      style={{ height }}
      totalCount={entries.length}
      itemContent={(index) => renderEntry(entries[index]!, index)}
      components={{
        List: (properties) => <div {...properties} className='flex flex-col gap-0.5 px-0' />,
        Header: () => <div className='h-0.5' />,
        Footer: () => <div className='h-0.5' />,
      }}
    />
  );

  const renderRootView = () => {
    if (recentFiles.length === 0 && categories.length === 0) {
      return <div className='px-2 py-1.5 text-xs text-muted-foreground'>No results found</div>;
    }

    let entryIndex = 0;

    return (
      <>
        {recentFiles.length > 0 && (
          <div className='flex flex-col gap-0.5'>
            {recentFiles.map((file) => {
              const index = entryIndex++;
              return renderEntry({ kind: 'item', item: file }, index);
            })}
          </div>
        )}
        {recentFiles.length > 0 && categories.length > 0 && <Separator className='my-1' />}
        {categories.length > 0 && (
          <div className='flex flex-col gap-0.5'>
            {categories.map((category) => {
              const index = entryIndex++;
              return renderEntry({ kind: 'category', category }, index);
            })}
          </div>
        )}
      </>
    );
  };

  const renderDrilledView = () => {
    const Icon = groupIcons[drilledCategory ?? ''] ?? FileIcon;
    const backHeader = (
      <div className='sticky -top-1 z-10 -mt-1 bg-popover pt-1 pb-0.5'>
        <button
          type='button'
          className='flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          onClick={handleDrillBack}
        >
          <ChevronLeft className='size-3 shrink-0' />
          <Icon className='size-3 shrink-0' />
          {drilledCategory}
        </button>
      </div>
    );

    if (drilledItems.length === 0) {
      return (
        <>
          {backHeader}
          <div className='px-2 py-1.5 text-xs text-muted-foreground'>No items</div>
        </>
      );
    }

    if (navigableEntries.length > virtualizationThreshold) {
      return (
        <>
          {backHeader}
          {renderVirtualizedList(navigableEntries, '214px')}
        </>
      );
    }

    return (
      <>
        {backHeader}
        {drilledItems.map((item, index) => renderEntry({ kind: 'item', item }, index))}
      </>
    );
  };

  const renderFlatSearch = () => {
    if (!searchResults) {
      return undefined;
    }

    const { matchedCategories, matchedItems } = searchResults;
    if (matchedCategories.length === 0 && matchedItems.length === 0) {
      return <div className='px-2 py-1.5 text-xs text-muted-foreground'>No results found</div>;
    }

    if (navigableEntries.length > virtualizationThreshold) {
      return renderVirtualizedList(navigableEntries, '248px');
    }

    let entryIndex = 0;

    return (
      <>
        {matchedCategories.map((category) => {
          const index = entryIndex++;
          return renderEntry({ kind: 'category', category }, index);
        })}
        {matchedItems.map((item) => {
          const index = entryIndex++;
          return renderEntry({ kind: 'item', item }, index);
        })}
      </>
    );
  };

  return createPortal(
    <div
      ref={containerReference}
      className={cn(
        'fixed z-50 flex max-h-64 w-64 flex-col gap-0.5 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md scroll-shadows-y',
      )}
      style={{
        left: rect.left,
        top: rect.top - 8,
        transform: 'translateY(-100%)',
      }}
      data-testid='context-suggestion-dropdown'
    >
      {drilledCategory ? renderDrilledView() : hasQuery ? renderFlatSearch() : renderRootView()}
    </div>,
    document.body,
  );
});
