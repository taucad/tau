import { useState, useCallback, useRef, useMemo } from 'react';
import { useEditor } from '@tiptap/react';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { HardBreak } from '@tiptap/extension-hard-break';
import { History } from '@tiptap/extension-history';
import { Placeholder } from '@tiptap/extension-placeholder';
import type { Editor, JSONContent } from '@tiptap/core';
import { Slice } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { Chat } from '@taucad/chat';
import type { FileEntry } from '@taucad/types';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { ChipType } from '#components/chat/context-chip.js';
import { buildPastedContent, slashCommandRegex } from '#utils/at-reference.utils.js';
import type { PastedContentSegment } from '#utils/at-reference.utils.js';
import { ContextChipNode } from '#components/chat/tiptap/context-chip-node.js';
import { SubmitOnEnter } from '#components/chat/tiptap/submit-on-enter.js';
import { ChatInputDropHandler } from '#components/chat/tiptap/chat-input-drop-handler.js';
import { ContextMention } from '#components/chat/tiptap/context-suggestion.js';
import {
  SlashCommand,
  defaultCommands,
  getEnabledSlashCommandItems,
} from '#components/chat/tiptap/slash-command-suggestion.js';
import { buildContextItemsFromSearch } from '#components/chat/tiptap/context-suggestion.utils.js';
import type { ClipboardPasteEvent } from '#components/chat/chat-paste-handler.js';
import type {
  ContextSuggestionItem,
  SlashCommandItem,
  SuggestionPopupState,
  SuggestionRenderCallbacks,
} from '#components/chat/tiptap/suggestion-types.js';

export type ContextChip = {
  id: string;
  label: string;
  chipType: ChipType;
  path?: string;
  referenceToken?: string;
  geometryReference?: string;
};

export type ChatInputContent = {
  text: string;
  contextChips: ContextChip[];
};

/**
 * Convert resolved paste segments into a Tiptap JSON document.
 * Rehydrates chip segments as `contextChip` nodes and handles
 * newline boundaries by creating separate paragraphs.
 *
 * Returns `undefined` when no chips are present (caller should use plain text).
 */
export function buildEditorContentJson(segments: PastedContentSegment[]): JSONContent | undefined {
  const hasChips = segments.some((s) => s.type === 'chip');
  if (!hasChips) {
    return undefined;
  }

  const paragraphs: JSONContent[] = [];
  let currentContent: JSONContent[] = [];

  const flushParagraph = (): void => {
    paragraphs.push({
      type: 'paragraph',
      content: currentContent.length > 0 ? currentContent : undefined,
    });
    currentContent = [];
  };

  for (const segment of segments) {
    if (segment.type === 'text') {
      const lines = segment.value.split('\n');
      let isFirst = true;
      for (const line of lines) {
        if (!isFirst) {
          flushParagraph();
        }
        isFirst = false;
        if (line.length > 0) {
          currentContent.push({ type: 'text', text: line });
        }
      }
    } else {
      currentContent.push({
        type: 'contextChip',
        attrs: {
          id: segment.id,
          label: segment.label,
          chipType: segment.chipType,
          path: segment.path,
          referenceToken: segment.referenceToken,
          geometryReference: segment.geometryReference,
        },
      });
    }
  }

  flushParagraph();

  return { type: 'doc', content: paragraphs };
}

function walkChildren(node: JSONContent, visitor: (child: JSONContent) => void): void {
  if (node.content) {
    for (const child of node.content) {
      visitor(child);
    }
  }
}

export function extractContent(editor: Editor): ChatInputContent {
  const editorDocument = editor.getJSON();
  const contextChips: ContextChip[] = [];
  const textParts: string[] = [];
  let paragraphCount = 0;

  function walk(node: JSONContent): void {
    if (node.type === 'contextChip') {
      const attributes = node.attrs as Record<string, string> | undefined;
      contextChips.push({
        id: attributes?.['id'] ?? '',
        label: attributes?.['label'] ?? '',
        chipType: (attributes?.['chipType'] as ChipType | undefined) ?? 'file',
        path: attributes?.['path'],
        referenceToken: attributes?.['referenceToken'],
        geometryReference: attributes?.['geometryReference'],
      });
      const chipPath = attributes?.['path'];
      const referenceToken = attributes?.['referenceToken'];
      textParts.push(referenceToken ?? (chipPath ? `@${chipPath}` : (attributes?.['label'] ?? '')));
      return;
    }
    if (node.type === 'text') {
      textParts.push(node.text ?? '');
      return;
    }
    if (node.type === 'hardBreak') {
      textParts.push('\n');
      return;
    }
    if (node.type === 'paragraph') {
      if (paragraphCount > 0) {
        textParts.push('\n');
      }
      paragraphCount++;
    }
    walkChildren(node, walk);
  }

  walk(editorDocument);

  return { text: textParts.join('').trim(), contextChips };
}

export type UseChatEditorOptions = {
  onSubmit: () => void;
  onEscape?: () => void;
  onUpdate?: (content: ChatInputContent) => void;
  handleImagePaste?: (event: ClipboardPasteEvent) => boolean;
  treeService: FileTreeService | undefined;
  chats: Chat[];
  actionItems?: ContextSuggestionItem[];
  slashCommandItems?: SlashCommandItem[];
  onSlashCommand?: (item: SlashCommandItem) => void;
  onContextAction?: (item: ContextSuggestionItem) => void;
  placeholder?: string;
};

export type UseChatEditorReturn = {
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- Tiptap returns null for uninitialized editor
  editor: Editor | null;
  contextSuggestionState: SuggestionPopupState<ContextSuggestionItem> | undefined;
  slashCommandState: SuggestionPopupState<SlashCommandItem> | undefined;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  contextKeydownRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React ref object
  slashKeydownRef: React.RefObject<((event: KeyboardEvent) => boolean) | undefined>;
  clearEditor: () => void;
};

/* oxlint-disable react/refs -- The `use no memo` boundary preserves Tiptap's long-lived editor callbacks while refs expose the latest React inputs. */
export function useChatEditor({
  onSubmit,
  onEscape,
  onUpdate,
  handleImagePaste,
  treeService,
  chats,
  actionItems,
  slashCommandItems,
  onSlashCommand,
  onContextAction,
  placeholder = 'Ask Tau to build anything...',
}: UseChatEditorOptions): UseChatEditorReturn {
  'use no memo';

  const [contextSuggestionState, setContextSuggestionState] = useState<
    SuggestionPopupState<ContextSuggestionItem> | undefined
  >(undefined);
  const [slashCommandState, setSlashCommandState] = useState<SuggestionPopupState<SlashCommandItem> | undefined>(
    undefined,
  );
  const contextKeydownRef = useRef<((event: KeyboardEvent) => boolean) | undefined>(undefined);
  const slashKeydownRef = useRef<((event: KeyboardEvent) => boolean) | undefined>(undefined);

  const treeServiceRef = useRef(treeService);
  treeServiceRef.current = treeService;
  const chatsRef = useRef(chats);
  chatsRef.current = chats;
  const actionItemsRef = useRef(actionItems);
  actionItemsRef.current = actionItems;
  const slashCommandItemsRef = useRef(slashCommandItems);
  slashCommandItemsRef.current = slashCommandItems;
  const onContextActionRef = useRef(onContextAction);
  onContextActionRef.current = onContextAction;
  const onSlashCommandRef = useRef(onSlashCommand);
  onSlashCommandRef.current = onSlashCommand;

  const contextRenderCallbacks = useMemo<SuggestionRenderCallbacks<ContextSuggestionItem>>(
    () => ({
      onStateChange: setContextSuggestionState,
      keydownHandlerRef: contextKeydownRef,
    }),
    [],
  );

  const slashRenderCallbacks = useMemo<SuggestionRenderCallbacks<SlashCommandItem>>(
    () => ({
      onStateChange: setSlashCommandState,
      keydownHandlerRef: slashKeydownRef,
    }),
    [],
  );

  const getContextItems = useCallback(async (query: string): Promise<ContextSuggestionItem[]> => {
    const service = treeServiceRef.current;
    if (!service) {
      return buildContextItemsFromSearch({
        fileEntries: [],
        chats: chatsRef.current,
        actionItems: actionItemsRef.current,
      });
    }
    const fileEntries = await service.searchFiles(query, { maxResults: 20 });
    return buildContextItemsFromSearch({
      fileEntries,
      chats: chatsRef.current,
      actionItems: actionItemsRef.current,
    });
  }, []);

  const handleContextAction = useCallback((item: ContextSuggestionItem) => {
    onContextActionRef.current?.(item);
  }, []);

  const handleSlashCommand = useCallback((item: SlashCommandItem) => {
    onSlashCommandRef.current?.(item);
  }, []);

  const getSlashCommandItems = useCallback((query: string): SlashCommandItem[] => {
    const all = getEnabledSlashCommandItems([...(slashCommandItemsRef.current ?? []), ...defaultCommands]);
    if (!query) {
      return all;
    }
    const q = query.toLowerCase();
    return all.filter((item) => item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
  }, []);

  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const handleImagePasteRef = useRef(handleImagePaste);
  handleImagePasteRef.current = handleImagePaste;

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      History,
      Placeholder.configure({ placeholder }),
      ContextChipNode,
      ChatInputDropHandler,
      SubmitOnEnter.configure({
        onSubmit: () => {
          onSubmitRef.current();
        },
        onEscape: () => {
          onEscapeRef.current?.();
        },
      }),
      ContextMention.configure({
        getItems: getContextItems,
        renderCallbacks: contextRenderCallbacks,
        onAction: handleContextAction,
      }),
      SlashCommand.configure({
        getItems: getSlashCommandItems,
        renderCallbacks: slashRenderCallbacks,
        onCommand: handleSlashCommand,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'outline-none',
        'aria-label': placeholder,
      },
      handlePaste: (_view: EditorView, event: ClipboardEvent) => {
        const imagePasteEvent: ClipboardPasteEvent = {
          clipboardData: event.clipboardData ?? undefined,
          preventDefault: () => {
            event.preventDefault();
          },
        };
        if (handleImagePasteRef.current?.(imagePasteEvent)) {
          return true;
        }

        const text = event.clipboardData?.getData('text/plain');
        if (!text) {
          return false;
        }

        const hasAtRef = text.includes('@');
        const slashTest = new RegExp(slashCommandRegex.source, slashCommandRegex.flags);
        const hasSlashCmd = slashTest.test(text);
        if (!hasAtRef && !hasSlashCmd) {
          return false;
        }

        const lazyTree: Map<string, FileEntry> =
          treeServiceRef.current?.getTreeSnapshot() ?? new Map<string, FileEntry>();
        const knownSkillIds = new Set(
          getEnabledSlashCommandItems(slashCommandItemsRef.current ?? []).map((item) => item.id),
        );
        const segments = buildPastedContent(text, {
          fileTree: lazyTree,
          chats: chatsRef.current,
          knownSkills: knownSkillIds,
        });
        const json = buildEditorContentJson(segments);
        if (!json) {
          return false;
        }

        const { schema } = _view.state;
        if (!schema.nodes['contextChip']) {
          return false;
        }

        const pastedDocument = schema.nodeFromJSON(json);
        _view.dispatch(_view.state.tr.replaceSelection(new Slice(pastedDocument.content, 1, 1)));

        return true;
      },
      handleKeyDown: (_view, event) => {
        const suggestionHandler = contextKeydownRef.current ?? slashKeydownRef.current;
        if (!suggestionHandler) {
          return false;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Enter' || event.key === 'Escape') {
          return suggestionHandler(event);
        }
        return false;
      },
    },
    onUpdate: ({ editor: updatedEditor }) => {
      onUpdateRef.current?.(extractContent(updatedEditor));
    },
  });

  const clearEditor = useCallback(() => {
    editor.commands.clearContent();
  }, [editor]);

  return {
    editor,
    contextSuggestionState,
    slashCommandState,
    contextKeydownRef,
    slashKeydownRef,
    clearEditor,
  };
}
/* oxlint-enable react/refs */
