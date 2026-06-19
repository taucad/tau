import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useChatEditor, extractContent, buildEditorContentJson } from '#components/chat/tiptap/use-chat-editor.js';
import type { UseChatEditorOptions } from '#components/chat/tiptap/use-chat-editor.js';
import { defaultCommands } from '#components/chat/tiptap/slash-command-suggestion.js';
import type { PastedContentSegment } from '#utils/at-reference.utils.js';
import { buildPastedContent } from '#utils/at-reference.utils.js';
import type { FileEntry } from '@taucad/types';
import type { FileTreeService } from '@taucad/fs-client/file-tree-service';
import type { ClipboardPasteEvent } from '#components/chat/chat-paste-handler.js';

Object.defineProperty(document, 'elementFromPoint', {
  configurable: true,
  value: () => document.body,
});

function createMockTreeService(fileTree: Map<string, FileEntry>): FileTreeService {
  return {
    getTreeSnapshot: () => fileTree,
    searchFiles: vi.fn().mockResolvedValue([]),
  } as unknown as FileTreeService;
}

function createDefaultOptions(overrides?: Partial<UseChatEditorOptions>): UseChatEditorOptions {
  return {
    onSubmit: vi.fn(),
    onUpdate: vi.fn(),
    treeService: undefined,
    chats: [],
    ...overrides,
  };
}

describe('useChatEditor', () => {
  it('should keep /compress and omit /plan from default slash commands', () => {
    expect(defaultCommands.map((command) => command.id)).toEqual(['compress']);
  });

  it('should open slash command suggestions after existing text and whitespace', async () => {
    const { result } = renderHook(() =>
      useChatEditor(
        createDefaultOptions({
          slashCommandItems: [
            {
              id: 'create-skill',
              label: '/create-skill',
              title: 'Create Skill',
              description: 'Create or update a skill',
              group: 'Skills',
              source: 'system',
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    act(() => {
      result.current.editor!.commands.focus();
      result.current.editor!.commands.insertContent('design this /');
    });

    await waitFor(() => {
      expect(result.current.slashCommandState?.items.map((item) => item.id)).toContain('create-skill');
    });
  });

  describe('editor initialization', () => {
    it('should create a non-null editor', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });
    });

    it('should start with an empty editor', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      expect(result.current.editor!.isEmpty).toBe(true);
    });
  });

  describe('onEscape callback', () => {
    it('should call onEscape when Escape key is pressed', async () => {
      const onEscape = vi.fn();
      const { result } = renderHook(() => useChatEditor(createDefaultOptions({ onEscape })));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.focus();
      });

      const { view } = editor;
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(onEscape).toHaveBeenCalledOnce();
    });

    it('should use latest onEscape ref when callback changes', async () => {
      const onEscapeFirst = vi.fn();
      const onEscapeSecond = vi.fn();

      const { result, rerender } = renderHook(({ onEscape }) => useChatEditor(createDefaultOptions({ onEscape })), {
        initialProps: { onEscape: onEscapeFirst },
      });

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      rerender({ onEscape: onEscapeSecond });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.focus();
      });

      const { view } = editor;
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

      expect(onEscapeFirst).not.toHaveBeenCalled();
      expect(onEscapeSecond).toHaveBeenCalledOnce();
    });

    it('should not throw when onEscape is undefined', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions({ onEscape: undefined })));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.focus();
      });

      const { view } = editor;
      expect(() =>
        view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
      ).not.toThrow();
    });
  });

  describe('onSubmit callback', () => {
    it('should call onSubmit when Enter is pressed', async () => {
      const onSubmit = vi.fn();
      const { result } = renderHook(() => useChatEditor(createDefaultOptions({ onSubmit })));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.focus();
      });

      const { view } = editor;
      view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

      expect(onSubmit).toHaveBeenCalledOnce();
    });
  });

  describe('content operations', () => {
    it('should set and extract text content', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.setContent('Hello world');
      });

      const content = extractContent(editor);
      expect(content.text).toBe('Hello world');
    });

    it('should clear content', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.setContent('Some content');
      });

      expect(editor.isEmpty).toBe(false);

      act(() => {
        result.current.clearEditor();
      });

      expect(editor.isEmpty).toBe(true);
    });

    it('should fire onUpdate when content changes', async () => {
      const onUpdate = vi.fn();
      const { result } = renderHook(() => useChatEditor(createDefaultOptions({ onUpdate })));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.setContent('Updated text');
      });

      expect(onUpdate).toHaveBeenCalled();
      expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'Updated text' }));
    });

    it('should extract multi-paragraph content with newline separators', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.setContent({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'World' }] },
          ],
        });
      });

      const content = extractContent(editor);
      expect(content.text).toBe('Hello\nWorld');
    });

    it('should extract three paragraphs with two newline separators', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.setContent({
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'C' }] },
          ],
        });
      });

      const content = extractContent(editor);
      expect(content.text).toBe('A\nB\nC');
    });

    it('should extract paragraphs with chips and newline separators', async () => {
      const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

      await waitFor(() => {
        expect(result.current.editor).not.toBeNull();
      });

      const editor = result.current.editor!;

      act(() => {
        editor.commands.setContent({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Check ' },
                {
                  type: 'contextChip',
                  attrs: { id: 'main.ts', label: 'main.ts', chipType: 'file', path: 'main.ts' },
                },
              ],
            },
            { type: 'paragraph', content: [{ type: 'text', text: 'for details' }] },
          ],
        });
      });

      const content = extractContent(editor);
      expect(content.text).toBe('Check @main.ts\nfor details');
      expect(content.contextChips).toHaveLength(1);
    });
  });
});

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

describe('useChatEditor — image paste delegation', () => {
  /**
   * Tiptap paste used to read image files itself, which caused desktop and
   * mobile paste to drift and limited multi-image clipboards to the first
   * image. The editor now delegates image paste events to the shared chat
   * paste handler and keeps only the structured-text fallback locally.
   */
  it('should delegate image paste events before running the structured text fallback', async () => {
    const handleImagePaste = vi.fn<(event: ClipboardPasteEvent) => boolean>(() => true);
    const { result } = renderHook(() => useChatEditor(createDefaultOptions({ handleImagePaste })));

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor!;

    act(() => {
      editor.commands.focus();
    });

    const file = new File([new Blob(['stub'])], 'pasted.png', { type: 'image/png' });
    const item: DataTransferItem = {
      kind: 'file',
      type: 'image/png',
      getAsFile: () => file,
      getAsString: () => undefined,
      webkitGetAsEntry: () => null,
    };
    const itemArray = [item];
    const items = Object.assign(itemArray, {
      add: () => null,
      clear: () => undefined,
      item: (index: number) => itemArray[index] ?? null,
      remove: () => undefined,
    }) as DataTransferItemList;
    const fileArray = [file];
    const files = Object.assign(fileArray, {
      item: (index: number) => fileArray[index] ?? null,
    }) as FileList;
    const clipboardData: DataTransfer = {
      dropEffect: 'none',
      effectAllowed: 'none',
      items,
      types: ['Files'],
      files,
      clearData: () => undefined,
      getData: (type: string) => (type === 'text/plain' ? '@main.ts' : ''),
      setData: () => undefined,
      setDragImage: () => undefined,
    };
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });

    editor.view.dom.dispatchEvent(event);

    expect(handleImagePaste).toHaveBeenCalledOnce();
    const delegatedEvent = handleImagePaste.mock.calls[0]?.[0];
    expect(delegatedEvent?.clipboardData).toBe(clipboardData);
    expect(typeof delegatedEvent?.preventDefault).toBe('function');
    expect(extractContent(editor)).toEqual({ text: '', contextChips: [] });
  });
});

describe('buildEditorContentJson', () => {
  it('should return undefined when segments contain no chips', () => {
    const segments: PastedContentSegment[] = [{ type: 'text', value: 'Hello world' }];
    expect(buildEditorContentJson(segments)).toBeUndefined();
  });

  it('should produce a doc with contextChip nodes for chip segments', () => {
    const segments: PastedContentSegment[] = [
      { type: 'text', value: 'Check ' },
      { type: 'chip', id: 'main.ts', label: 'main.ts', chipType: 'file', path: 'main.ts' },
    ];
    const result = buildEditorContentJson(segments);
    expect(result).toBeDefined();
    expect(result).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Check ' },
            {
              type: 'contextChip',
              attrs: { id: 'main.ts', label: 'main.ts', chipType: 'file', path: 'main.ts' },
            },
          ],
        },
      ],
    });
  });

  it('should preserve geometry chip structured attrs and @cad serialization', async () => {
    const geometryReference = JSON.stringify({
      scheme: 'tau-cad',
      filePath: 'main.ts',
      componentId: 'component:sun_gear',
      selector: '/nodes/0',
      label: 'Sun Gear',
      kind: 'part',
    });
    const segments: PastedContentSegment[] = [
      { type: 'text', value: 'Inspect ' },
      {
        type: 'chip',
        id: 'main.ts#component:sun_gear',
        label: 'Sun Gear',
        chipType: 'geometry',
        path: 'main.ts',
        referenceToken: '@cad[main.ts#component:sun_gear]',
        geometryReference,
      },
    ];
    const result = buildEditorContentJson(segments);
    expect(result).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Inspect ' },
            {
              type: 'contextChip',
              attrs: {
                id: 'main.ts#component:sun_gear',
                label: 'Sun Gear',
                chipType: 'geometry',
                path: 'main.ts',
                referenceToken: '@cad[main.ts#component:sun_gear]',
                geometryReference,
              },
            },
          ],
        },
      ],
    });

    const { result: hookResult } = renderHook(() => useChatEditor(createDefaultOptions()));
    await waitFor(() => {
      expect(hookResult.current.editor).not.toBeNull();
    });

    act(() => {
      hookResult.current.editor!.commands.setContent(result!);
    });

    const content = extractContent(hookResult.current.editor!);
    expect(content.text).toBe('Inspect @cad[main.ts#component:sun_gear]');
    expect(content.contextChips[0]).toEqual({
      id: 'main.ts#component:sun_gear',
      label: 'Sun Gear',
      chipType: 'geometry',
      path: 'main.ts',
      referenceToken: '@cad[main.ts#component:sun_gear]',
      geometryReference,
    });
  });

  it('should handle multiple adjacent chips', () => {
    const segments: PastedContentSegment[] = [
      { type: 'chip', id: 'main.ts', label: 'main.ts', chipType: 'file', path: 'main.ts' },
      { type: 'text', value: ' ' },
      { type: 'chip', id: 'main.scad', label: 'main.scad', chipType: 'file', path: 'main.scad' },
    ];
    const result = buildEditorContentJson(segments);
    expect(result).toBeDefined();

    const paragraph = result!.content?.[0];
    expect(paragraph?.content).toHaveLength(3);

    const first = paragraph?.content?.[0];
    expect(first?.type).toBe('contextChip');
    expect((first?.attrs as Record<string, string> | undefined)?.['path']).toBe('main.ts');

    const third = paragraph?.content?.[2];
    expect(third?.type).toBe('contextChip');
    expect((third?.attrs as Record<string, string> | undefined)?.['path']).toBe('main.scad');
  });

  it('should split text at newlines into separate paragraphs', () => {
    const segments: PastedContentSegment[] = [{ type: 'text', value: 'Line one\nLine two' }];
    const result = buildEditorContentJson(segments);
    expect(result).toBeUndefined();
  });

  it('should split text and chips across newline boundaries into paragraphs', () => {
    const segments: PastedContentSegment[] = [
      { type: 'chip', id: 'a.ts', label: 'a.ts', chipType: 'file', path: 'a.ts' },
      { type: 'text', value: '\n' },
      { type: 'chip', id: 'b.ts', label: 'b.ts', chipType: 'file', path: 'b.ts' },
    ];
    const result = buildEditorContentJson(segments);
    expect(result).toBeDefined();
    expect(result!.content).toHaveLength(2);
    expect(result!.content?.[0]?.content?.[0]?.type).toBe('contextChip');
    expect(result!.content?.[1]?.content?.[0]?.type).toBe('contextChip');
  });
});

describe('draft content restoration with chip rehydration', () => {
  it('should rehydrate @references as contextChip nodes in the editor', async () => {
    const fileTree = createFileTree([
      ['main.ts', { name: 'main.ts' }],
      ['main.scad', { name: 'main.scad' }],
    ]);

    const { result } = renderHook(() =>
      useChatEditor(createDefaultOptions({ treeService: createMockTreeService(fileTree) })),
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor!;
    const draftText = '@main.ts @main.scad';
    const segments = buildPastedContent(draftText, { fileTree, chats: [] });
    const json = buildEditorContentJson(segments);

    expect(json).toBeDefined();

    act(() => {
      editor.commands.setContent(json!);
    });

    const content = extractContent(editor);
    expect(content.contextChips).toHaveLength(2);
    expect(content.contextChips[0]?.path).toBe('main.ts');
    expect(content.contextChips[1]?.path).toBe('main.scad');
    expect(content.text).toBe('@main.ts @main.scad');
  });

  it('should preserve plain text around rehydrated chips', async () => {
    const fileTree = createFileTree([['main.ts', { name: 'main.ts' }]]);

    const { result } = renderHook(() =>
      useChatEditor(createDefaultOptions({ treeService: createMockTreeService(fileTree) })),
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor!;
    const draftText = 'Check @main.ts for details';
    const segments = buildPastedContent(draftText, { fileTree, chats: [] });
    const json = buildEditorContentJson(segments);

    expect(json).toBeDefined();

    act(() => {
      editor.commands.setContent(json!);
    });

    const content = extractContent(editor);
    expect(content.contextChips).toHaveLength(1);
    expect(content.contextChips[0]?.path).toBe('main.ts');
    expect(content.text).toBe('Check @main.ts for details');
  });

  it('should fall back to plain text for unresolvable @references', async () => {
    const fileTree = createFileTree([]);

    const { result } = renderHook(() =>
      useChatEditor(createDefaultOptions({ treeService: createMockTreeService(fileTree) })),
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor!;
    const draftText = 'Check @nonexistent.ts for details';
    const segments = buildPastedContent(draftText, { fileTree, chats: [] });
    const json = buildEditorContentJson(segments);

    expect(json).toBeUndefined();

    act(() => {
      editor.commands.setContent(draftText);
    });

    const content = extractContent(editor);
    expect(content.contextChips).toHaveLength(0);
    expect(content.text).toBe('Check @nonexistent.ts for details');
  });

  it('should rehydrate /command as skill contextChip nodes', async () => {
    const knownSkills = new Set(['create-policy']);
    const draftText = '/create-policy';
    const segments = buildPastedContent(draftText, { fileTree: new Map(), chats: [], knownSkills });
    const json = buildEditorContentJson(segments);

    expect(json).toBeDefined();

    const { result } = renderHook(() => useChatEditor(createDefaultOptions()));

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor!;

    act(() => {
      editor.commands.setContent(json!);
    });

    const content = extractContent(editor);
    expect(content.contextChips).toHaveLength(1);
    expect(content.contextChips[0]?.chipType).toBe('skill');
    expect(content.contextChips[0]?.label).toBe('/create-policy');
    expect(content.contextChips[0]?.path).toBeUndefined();
    expect(content.text).toBe('/create-policy');
  });

  it('should rehydrate catalog-backed slash skills without relying on static defaults', async () => {
    const knownSkills = new Set(['woodworking']);
    const draftText = '/woodworking make this joinery manufacturable';
    const segments = buildPastedContent(draftText, { fileTree: new Map(), chats: [], knownSkills });
    const json = buildEditorContentJson(segments);

    expect(json).toBeDefined();

    const { result } = renderHook(() =>
      useChatEditor(
        createDefaultOptions({
          slashCommandItems: [
            {
              id: 'woodworking',
              label: '/woodworking',
              title: 'Woodworking',
              description: 'Design for woodworking',
              group: 'Skills',
              source: 'tau-store',
            },
          ],
        }),
      ),
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor!;

    act(() => {
      editor.commands.setContent(json!);
    });

    const content = extractContent(editor);
    expect(content.contextChips).toHaveLength(1);
    expect(content.contextChips[0]).toEqual(
      expect.objectContaining({
        id: 'woodworking',
        label: '/woodworking',
        chipType: 'skill',
      }),
    );
    expect(content.text).toBe('/woodworking make this joinery manufacturable');
  });

  it('should produce skill chip without path in buildEditorContentJson', () => {
    const segments: PastedContentSegment[] = [{ type: 'chip', id: 'repos', label: '/repos', chipType: 'skill' }];
    const result = buildEditorContentJson(segments);

    expect(result).toBeDefined();
    expect(result).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contextChip',
              attrs: { id: 'repos', label: '/repos', chipType: 'skill', path: undefined },
            },
          ],
        },
      ],
    });
  });

  it('should handle mixed @file and /command rehydration', async () => {
    const knownSkills = new Set(['repos']);
    const fileTree = createFileTree([['main.ts', { name: 'main.ts' }]]);
    const draftText = '/repos check @main.ts';
    const segments = buildPastedContent(draftText, { fileTree, chats: [], knownSkills });
    const json = buildEditorContentJson(segments);

    expect(json).toBeDefined();

    const { result } = renderHook(() =>
      useChatEditor(createDefaultOptions({ treeService: createMockTreeService(fileTree) })),
    );

    await waitFor(() => {
      expect(result.current.editor).not.toBeNull();
    });

    const editor = result.current.editor!;

    act(() => {
      editor.commands.setContent(json!);
    });

    const content = extractContent(editor);
    expect(content.contextChips).toHaveLength(2);
    expect(content.contextChips[0]?.chipType).toBe('skill');
    expect(content.contextChips[0]?.label).toBe('/repos');
    expect(content.contextChips[1]?.chipType).toBe('file');
    expect(content.contextChips[1]?.path).toBe('main.ts');
  });
});
