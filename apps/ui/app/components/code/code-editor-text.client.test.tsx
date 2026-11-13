// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';

const runtime = vi.hoisted(() => ({ imported: vi.fn() }));
vi.mock('#components/code/code-editor-view.client.js', () => {
  runtime.imported();
  return {
    CodeEditorView: ({ document }: { readonly document: EditorDocument }) => (
      <div role='textbox' aria-label='Code editor' data-text={document.text} />
    ),
  };
});
vi.mock('#lib/editor-syntax.js', () => ({ loadEditorSyntax: async () => [] }));

const source = "import { box } from 'replicad';\n\nexport default function main() {\n  return box(10);\n}\n";

let idle: IdleRequestCallback[] = [];
beforeEach(() => {
  idle = [];
  Reflect.set(globalThis, 'requestIdleCallback', (start: IdleRequestCallback) => {
    idle.push(start);
    return idle.length;
  });
  Reflect.set(globalThis, 'cancelIdleCallback', vi.fn());
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, 'requestIdleCallback');
  Reflect.deleteProperty(globalThis, 'cancelIdleCallback');
});

/**
 * U18: while the editor runtime is held, the pane showed its background and then grey code-shaped
 * bars. The document is already in hand, so the pane shows its real text, read-only, in the box the
 * editor will take, and CodeMirror then replaces it in one commit.
 */
it("shows the file's own text, read-only, before CodeMirror mounts", async () => {
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  const document = new EditorDocument('main.geospec.ts', source);
  const { container } = render(
    <CodeEditor
      document={document}
      viewId='pane-text'
      languageId='typescript'
      loading={<EditorPanePlaceholder label='Loading main.geospec.ts' />}
    />,
  );

  expect(runtime.imported).not.toHaveBeenCalled();
  expect(screen.queryByRole('textbox', { name: 'Code editor' })).not.toBeInTheDocument();
  const text = container.querySelector('[data-slot="editor-pane-text"]');
  expect(text).not.toBeNull();
  expect(screen.getByText("import { box } from 'replicad';")).toBeInTheDocument();
  expect(screen.getByText('return box(10);')).toBeInTheDocument();
  expect(text?.querySelector('[data-slot="editor-pane-text-content"]')?.textContent).toBe(source.replaceAll('\n', ''));
  expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
  expect(container.querySelector('[contenteditable], textarea, input')).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('read-only');

  // The stand-in follows the document until the editor takes over; it never writes to it.
  act(() => {
    document.apply({
      expectedVersion: document.version,
      origin: 'filesystem',
      changes: [{ from: 0, to: 0, insert: '// header\n' }],
    });
  });
  expect(screen.getByText('// header')).toBeInTheDocument();
  expect(document.text).toBe(`// header\n${source}`);

  for (const start of idle) {
    start({ didTimeout: false, timeRemaining: () => 10 });
  }
  const editor = await screen.findByRole('textbox', { name: 'Code editor' });
  expect(editor).toHaveAttribute('data-text', `// header\n${source}`);
  expect(container.querySelector('[data-slot="editor-pane-text"]')).toBeNull();
});

it('keeps the caller placeholder, without code-shaped bars, until a document exists', async () => {
  const { CodeEditor } = await import('#components/code/code-editor.client.js');
  const { container } = render(
    <CodeEditor
      viewId='pane-empty'
      languageId='typescript'
      loading={<EditorPanePlaceholder label='Loading main.ts' />}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading main.ts');
  expect(container.querySelector('[data-slot="editor-pane-placeholder"]')).not.toBeNull();
  expect(container.querySelector('[data-slot="skeleton"]')).toBeNull();
});
