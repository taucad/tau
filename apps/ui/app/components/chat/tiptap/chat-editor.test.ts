import { describe, it, expect, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import { Document } from '@tiptap/extension-document';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Text } from '@tiptap/extension-text';
import { HardBreak } from '@tiptap/extension-hard-break';
import { ContextChipNode } from '#components/chat/tiptap/context-chip-node.js';
import { SubmitOnEnter } from '#components/chat/tiptap/submit-on-enter.js';
import { SlashCommand, shouldAllowSlashCommandTrigger } from '#components/chat/tiptap/slash-command-suggestion.js';
import { extractContent } from '#components/chat/tiptap/use-chat-editor.js';

import type { Extensions } from '@tiptap/core';

function createTestEditor(extensions: Extensions = []) {
  return new Editor({
    extensions: [Document, Paragraph, Text, HardBreak, ContextChipNode, ...extensions],
  });
}

describe('extractContent', () => {
  it('should return empty text and no chips for an empty editor', () => {
    const editor = createTestEditor();

    const result = extractContent(editor);

    expect(result.text).toBe('');
    expect(result.contextChips).toEqual([]);

    editor.destroy();
  });

  it('should extract plain text content', () => {
    const editor = createTestEditor();
    editor.commands.setContent('<p>Hello world</p>');

    const result = extractContent(editor);

    expect(result.text).toBe('Hello world');
    expect(result.contextChips).toEqual([]);

    editor.destroy();
  });

  it('should extract a single context chip', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contextChip',
              attrs: {
                id: '/main.scad',
                label: 'main.scad',
                chipType: 'file',
                path: '/main.scad',
              },
            },
          ],
        },
      ],
    });

    const result = extractContent(editor);

    expect(result.text).toBe('@/main.scad');
    expect(result.contextChips).toEqual([
      { id: '/main.scad', label: 'main.scad', chipType: 'file', path: '/main.scad' },
    ]);

    editor.destroy();
  });

  it('should extract mixed text and chips', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Fix the bug in ' },
            {
              type: 'contextChip',
              attrs: { id: '/src/app.ts', label: 'app.ts', chipType: 'file', path: '/src/app.ts' },
            },
            { type: 'text', text: ' please' },
          ],
        },
      ],
    });

    const result = extractContent(editor);

    expect(result.text).toBe('Fix the bug in @/src/app.ts please');
    expect(result.contextChips).toHaveLength(1);
    expect(result.contextChips[0]).toEqual({
      id: '/src/app.ts',
      label: 'app.ts',
      chipType: 'file',
      path: '/src/app.ts',
    });

    editor.destroy();
  });

  it('should extract multiple chips of different types', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Look at ' },
            {
              type: 'contextChip',
              attrs: { id: 'chat_123', label: 'Previous chat', chipType: 'chat' },
            },
            { type: 'text', text: ' and ' },
            {
              type: 'contextChip',
              attrs: { id: '/src', label: 'src', chipType: 'folder', path: '/src' },
            },
          ],
        },
      ],
    });

    const result = extractContent(editor);

    expect(result.text).toBe('Look at Previous chat and @/src');
    expect(result.contextChips).toHaveLength(2);
    expect(result.contextChips[0]?.chipType).toBe('chat');
    expect(result.contextChips[1]?.chipType).toBe('folder');

    editor.destroy();
  });

  it('should handle hard breaks as newlines', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'line one' }, { type: 'hardBreak' }, { type: 'text', text: 'line two' }],
        },
      ],
    });

    const result = extractContent(editor);

    expect(result.text).toBe('line one\nline two');

    editor.destroy();
  });

  it('should handle chips with default attributes gracefully', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contextChip',
              attrs: { id: '', label: '', chipType: 'file' },
            },
          ],
        },
      ],
    });

    const result = extractContent(editor);

    expect(result.contextChips).toHaveLength(1);
    expect(result.contextChips[0]).toEqual({
      id: '',
      label: '',
      chipType: 'file',
      path: undefined,
    });

    editor.destroy();
  });
});

describe('ContextChipNode serialization', () => {
  it('should round-trip through renderHTML and parseHTML', () => {
    const editor = createTestEditor();

    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contextChip',
              attrs: {
                id: '/src/utils.ts',
                label: 'utils.ts',
                chipType: 'file',
                path: '/src/utils.ts',
              },
            },
          ],
        },
      ],
    });

    const html = editor.getHTML();
    expect(html).toContain('data-type="context-chip"');
    expect(html).toContain('data-label="utils.ts"');
    expect(html).toContain('data-id="/src/utils.ts"');

    const editor2 = createTestEditor();
    editor2.commands.setContent(html);

    const result = extractContent(editor2);
    expect(result.contextChips).toHaveLength(1);
    expect(result.contextChips[0]).toEqual({
      id: '/src/utils.ts',
      label: 'utils.ts',
      chipType: 'file',
      path: '/src/utils.ts',
    });

    editor.destroy();
    editor2.destroy();
  });

  it('should preserve chip type through round-trip', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contextChip',
              attrs: { id: 'chat_1', label: 'My Chat', chipType: 'chat', path: undefined },
            },
          ],
        },
      ],
    });

    const html = editor.getHTML();
    const editor2 = createTestEditor();
    editor2.commands.setContent(html);

    const result = extractContent(editor2);
    expect(result.contextChips[0]?.chipType).toBe('chat');
    expect(result.contextChips[0]?.label).toBe('My Chat');

    editor.destroy();
    editor2.destroy();
  });

  it('should default chipType to file when absent in HTML', () => {
    const editor = createTestEditor();
    editor.commands.setContent(
      '<p><span data-type="context-chip" data-id="test" data-label="test.ts">test.ts</span></p>',
    );

    const result = extractContent(editor);
    expect(result.contextChips[0]?.chipType).toBe('file');

    editor.destroy();
  });
});

describe('SubmitOnEnter', () => {
  it('should call onSubmit when Enter is pressed', () => {
    const onSubmit = vi.fn();
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, SubmitOnEnter.configure({ onSubmit })],
      content: '<p>Hello</p>',
    });

    editor.commands.focus();
    editor.commands.enter();

    expect(onSubmit).toHaveBeenCalledOnce();

    editor.destroy();
  });

  it('should call onEscape when Escape is pressed', () => {
    const onSubmit = vi.fn();
    const onEscape = vi.fn();
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, SubmitOnEnter.configure({ onSubmit, onEscape })],
      content: '<p>Hello</p>',
    });

    editor.commands.focus();
    editor.view.someProp('handleKeyDown', (handler) =>
      handler(editor.view, new KeyboardEvent('keydown', { key: 'Escape' })),
    );

    expect(onEscape).toHaveBeenCalledOnce();

    editor.destroy();
  });

  it('should register the extension with correct name', () => {
    const editor = new Editor({
      extensions: [Document, Paragraph, Text, SubmitOnEnter.configure({ onSubmit: vi.fn() })],
    });

    const extension = editor.extensionManager.extensions.find((registered) => registered.name === 'submitOnEnter');
    expect(extension).toBeDefined();

    editor.destroy();
  });
});

describe('skill chip insertion', () => {
  it('should extract a skill chip from editor content', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contextChip',
              attrs: {
                id: 'create-policy',
                label: '/create-policy',
                chipType: 'skill',
              },
            },
            { type: 'text', text: ' ' },
          ],
        },
      ],
    });

    const result = extractContent(editor);

    expect(result.contextChips).toHaveLength(1);
    expect(result.contextChips[0]).toEqual({
      id: 'create-policy',
      label: '/create-policy',
      chipType: 'skill',
      path: undefined,
    });

    editor.destroy();
  });

  it('should insert a skill chip (not plain text) when a skill slash command is selected', () => {
    const noopCallbacks = {
      onStateChange: () => undefined,
      keydownHandlerRef: { current: undefined },
    };

    const editor = new Editor({
      extensions: [
        Document,
        Paragraph,
        Text,
        ContextChipNode,
        SlashCommand.configure({
          renderCallbacks: noopCallbacks,
        }),
      ],
      content: '<p>/</p>',
    });

    const range = { from: 1, to: 2 };
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'contextChip',
        attrs: {
          id: 'create-skill',
          label: '/create-skill',
          chipType: 'skill',
        },
      })
      .insertContent(' ')
      .run();

    const result = extractContent(editor);

    expect(result.contextChips).toHaveLength(1);
    expect(result.contextChips[0]?.chipType).toBe('skill');
    expect(result.contextChips[0]?.label).toBe('/create-skill');
    expect(result.text).toContain('/create-skill');

    editor.destroy();
  });

  it('should round-trip skill chip through HTML serialization', () => {
    const editor = createTestEditor();
    editor.commands.setContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'contextChip',
              attrs: { id: 'repos', label: '/repos', chipType: 'skill' },
            },
          ],
        },
      ],
    });

    const html = editor.getHTML();
    expect(html).toContain('data-type="context-chip"');
    expect(html).toContain('data-label="/repos"');

    const editor2 = createTestEditor();
    editor2.commands.setContent(html);

    const result = extractContent(editor2);
    expect(result.contextChips).toHaveLength(1);
    expect(result.contextChips[0]?.chipType).toBe('skill');
    expect(result.contextChips[0]?.label).toBe('/repos');

    editor.destroy();
    editor2.destroy();
  });
});

describe('slash command trigger boundaries', () => {
  function expectSlashTrigger(content: string, expected: boolean) {
    const editor = createTestEditor();
    editor.commands.setContent(`<p>${content}</p>`);
    const slashIndex = content.lastIndexOf('/');

    expect(slashIndex).toBeGreaterThanOrEqual(0);
    expect(
      shouldAllowSlashCommandTrigger({
        state: editor.state,
        range: { from: slashIndex + 1 },
      }),
    ).toBe(expected);

    editor.destroy();
  }

  it('should allow slash commands at paragraph start and after whitespace', () => {
    expectSlashTrigger('/', true);
    expectSlashTrigger('design this /', true);
  });

  it('should not trigger slash command suggestions inside paths or words', () => {
    expectSlashTrigger('src/foo/', false);
    expectSlashTrigger('open/http/', false);
  });
});
