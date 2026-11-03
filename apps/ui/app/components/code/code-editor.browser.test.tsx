import { editorSyntaxFixtures } from '#lib/editor-syntax.fixtures.js';
import { StateEffect } from '@codemirror/state';
import { showTooltip } from '@codemirror/view';
import { openLintPanel, setDiagnostics } from '@codemirror/lint';
import { gotoLine, openSearchPanel } from '@codemirror/search';
import { definitionProvider } from '#components/code/editor-definition.js';
import { renderTypeScriptDocumentation } from '#components/code/editor-documentation.js';
import '#styles/global.css';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { mock } from 'vitest-mock-extended';
import {
  autocompletion,
  closeCompletion,
  completionStatus,
  selectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import { CodeEditor } from '#components/code/code-editor.client.js';
import { VirtualDeclarationDialog } from '#components/code/virtual-declaration-dialog.js';
import { jsonDepthHighlighting } from '#components/code/json-depth-highlighting.js';
import { EditorDocument } from '#lib/editor-document.js';
import { EditorDiagnostics } from '#lib/editor-diagnostics.js';
import type { EditorDiagnostic } from '#lib/editor-diagnostics.js';
import { storeDiagnostics } from '#components/code/editor-lint.js';
import { EditorDocumentSession, maxBackgroundDocuments } from '#lib/editor-document-session.js';
import { clearEditorNavigation, registerEditorView, requestEditorNavigation } from '#lib/editor-navigation-service.js';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import type { EditorNavigationTarget } from '#lib/editor-language-environment.js';
import { Theme, ThemeProvider } from '#hooks/use-theme.js';
import type { EditorView } from '@codemirror/view';

const isMac = navigator.platform.includes('Mac');

function contrastRatio(foreground: string, background: string): number {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d')!;
  const luminance = (color: string): number => {
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const channels = context.getImageData(0, 0, 1, 1).data;
    const linear = [channels[0], channels[1], channels[2]].map((channel) => {
      const value = channel! / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

afterEach(() => {
  cleanup();
  document.documentElement.className = '';
});

it.each([
  [Theme.LIGHT, 1000, 600],
  [Theme.DARK, 1000, 600],
  [Theme.BLACK, 1000, 600],
  [Theme.HIGH_CONTRAST, 1000, 600],
  [Theme.LIGHT, 390, 720],
  [Theme.DARK, 390, 720],
  [Theme.BLACK, 390, 720],
  [Theme.HIGH_CONTRAST, 390, 720],
])('captures %s source editor at %spx', async (theme, width, height) => {
  await page.viewport(width, height);
  document.documentElement.className = theme === Theme.BLACK || theme === Theme.HIGH_CONTRAST ? `dark ${theme}` : theme;
  const source = 'function rotate(radius: number) {\n  return radius * Math.PI;\n}\n';
  const sourceDocument = new EditorDocument('main.ts', source);
  const { container } = render(
    <ThemeProvider specifiedTheme={theme} themeAction='/'>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: Math.min(width, 800),
          height: 300,
        }}
      >
        <CodeEditor document={sourceDocument} viewId='pane-one' languageId='typescript' />
      </div>
    </ThemeProvider>,
  );
  await expect.poll(() => container.querySelector('.cm-line')?.textContent).toContain('function rotate');
  await expect.poll(() => container.querySelectorAll('.cm-line span').length).toBeGreaterThan(1);
  const editor = container.querySelector('.cm-editor')!;
  expect(getComputedStyle(editor).fontFamily).toContain('Geist Mono');
  expect(getComputedStyle(editor).fontSize).toBe(width < 600 ? '16px' : '14px');
  await page.screenshot();
});

it('shares accepted text and undo across split views without sharing focus', async () => {
  await page.viewport(1000, 600);
  const sourceDocument = new EditorDocument('main.ts', 'alpha');
  const { container } = render(
    <div className='flex h-72'>
      <div className='w-1/2'>
        <CodeEditor document={sourceDocument} viewId='left' languageId='typescript' />
      </div>
      <div className='w-1/2'>
        <CodeEditor document={sourceDocument} viewId='right' languageId='typescript' />
      </div>
    </div>,
  );
  await expect.poll(() => container.querySelectorAll('.cm-content').length).toBe(2);
  const editors = page.getByRole('textbox', { name: 'Code editor' });
  await editors.nth(0).fill('alpha beta');
  await expect.poll(() => sourceDocument.text).toBe('alpha beta');
  await expect.poll(() => container.querySelectorAll('.cm-content')[1]?.textContent).toContain('alpha beta');
  await editors.nth(1).click();
  await userEvent.keyboard(isMac ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}');
  await expect.poll(() => sourceDocument.text).toBe('alpha');
  await expect.poll(() => container.querySelectorAll('.cm-content')[0]?.textContent).toContain('alpha');
});

it('moves navigation to a renamed path without remounting the editor view', async () => {
  const sourceDocument = new EditorDocument('before.ts', 'first line\nsecond line\n');
  let view: EditorView | undefined;
  const editor = (document: EditorDocument) => (
    <div className='h-72'>
      <CodeEditor
        document={document}
        viewId='rename-pane'
        languageId='typescript'
        onMount={(mounted, path) => {
          view = mounted;
          return registerEditorView({
            projectId: 'rename-browser',
            path,
            paneId: 'rename-pane',
            reveal: (line, column) => {
              const row = mounted.state.doc.line(line);
              mounted.dispatch({
                selection: { anchor: row.from + column - 1 },
              });
            },
          });
        }}
      />
    </div>
  );
  const { rerender, unmount } = render(editor(sourceDocument));
  try {
    await expect.poll(() => view).toBeDefined();
    const initialView = view;
    sourceDocument.rename('after.ts');
    rerender(editor(sourceDocument));
    requestEditorNavigation({
      projectId: 'rename-browser',
      path: 'before.ts',
      paneId: 'rename-pane',
      line: 2,
      column: 3,
    });
    expect(view?.state.selection.main.head).toBe(0);
    requestEditorNavigation({
      projectId: 'rename-browser',
      path: 'after.ts',
      paneId: 'rename-pane',
      line: 2,
      column: 3,
    });
    expect(view).toBe(initialView);
    expect(view?.state.selection.main.head).toBe(sourceDocument.text.indexOf('second') + 2);

    const replacement = new EditorDocument('after.ts', 'replacement\nnew second line\n');
    rerender(editor(replacement));
    await expect.poll(() => view === initialView).toBe(false);
    requestEditorNavigation({
      projectId: 'rename-browser',
      path: 'after.ts',
      paneId: 'rename-pane',
      line: 2,
      column: 3,
    });
    expect(view?.state.selection.main.head).toBe(replacement.text.indexOf('new second') + 2);
  } finally {
    unmount();
    clearEditorNavigation('rename-browser');
  }
});

it('opens editor context actions and its search panel', async () => {
  const sourceDocument = new EditorDocument('main.ts', 'const value = 1;');
  const { container } = render(
    <div className='h-72'>
      <CodeEditor document={sourceDocument} viewId='pane-menu' languageId='typescript' />
    </div>,
  );
  await expect.poll(() => container.querySelector('.cm-content')).toBeTruthy();
  fireEvent.contextMenu(container.querySelector('.cm-content')!);
  await expect.element(page.getByRole('menuitem', { name: 'Go to Type Definition' })).not.toBeInTheDocument();
  await page.getByRole('menuitem', { name: 'Find and Replace' }).click();
  await expect.element(page.getByRole('search', { name: 'Find and replace' })).toBeVisible();
});

it.each([Theme.LIGHT, Theme.DARK, Theme.BLACK, Theme.HIGH_CONTRAST])(
  'keeps the actual %s search controls readable on mobile',
  async (theme) => {
    await page.viewport(390, 720);
    document.documentElement.className =
      theme === Theme.BLACK || theme === Theme.HIGH_CONTRAST ? `dark ${theme}` : theme;
    const sourceDocument = new EditorDocument('main.ts', 'const value = 1;');
    const { container } = render(
      <ThemeProvider specifiedTheme={theme} themeAction='/'>
        <div className='h-72'>
          <CodeEditor document={sourceDocument} viewId='search-colors' languageId='typescript' />
        </div>
      </ThemeProvider>,
    );
    await expect.poll(() => container.querySelector('.cm-content')).toBeTruthy();
    fireEvent.contextMenu(container.querySelector('.cm-content')!);
    await page.getByRole('menuitem', { name: 'Find and Replace' }).click();
    await expect.element(page.getByRole('textbox', { name: 'Find', exact: true })).toBeVisible();
    const input = page.getByRole('textbox', { name: 'Find', exact: true }).element();
    const button = page.getByRole('button', { name: 'Match case', exact: true }).element();
    const panel = page.getByRole('search', { name: 'Find and replace' }).element();
    const panelBackground = getComputedStyle(container.querySelector('.cm-panels')!).backgroundColor;
    const inputStyle = getComputedStyle(input);
    expect(contrastRatio(inputStyle.color, inputStyle.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(inputStyle.borderTopColor, inputStyle.backgroundColor)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(getComputedStyle(button).color, panelBackground)).toBeGreaterThanOrEqual(4.5);
    expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(24);
    expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(390);
    expect(Number.parseFloat(inputStyle.fontSize)).toBeGreaterThanOrEqual(16);
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('value');
    await expect.element(page.getByRole('status')).toHaveTextContent('of 1');
    await page.getByRole('button', { name: 'Show replace' }).click();
    await page.getByRole('textbox', { name: 'Replace', exact: true }).fill('length');
    await page.getByRole('button', { name: 'Replace all', exact: true }).click();
    await expect.poll(() => sourceDocument.text).toBe('const length = 1;');
    await expect.element(page.getByRole('status')).toHaveTextContent('No matches');
    await page.getByRole('button', { name: 'Regular expression', exact: true }).click();
    await page.getByRole('textbox', { name: 'Find', exact: true }).fill('[');
    await expect.element(page.getByRole('status')).toHaveTextContent('Invalid expression');
    await expect.element(page.getByRole('button', { name: 'Next match', exact: true })).toBeDisabled();

    await page.screenshot();
  },
);

it('keeps a rejected read-only view transaction out of its document', async () => {
  const sourceDocument = new EditorDocument('__typescript_lib__/lib.es5.d.ts', 'interface Number {}');
  let view: EditorView | undefined;
  const { container } = render(
    <div className='h-72'>
      <CodeEditor
        document={sourceDocument}
        viewId='declaration'
        languageId='typescript'
        readOnly
        onApply={() => undefined}
        onHistory={() => undefined}
        onMount={(mounted) => {
          view = mounted;
        }}
      />
    </div>,
  );
  await expect.poll(() => view).toBeDefined();
  view!.dispatch({ changes: { from: 0, to: 0, insert: 'corruption' } });
  expect(sourceDocument.text).toBe('interface Number {}');
  expect(view!.state.doc.toString()).toBe('interface Number {}');
  expect(container.querySelector('.cm-content')).toHaveAttribute('contenteditable', 'false');
});

it('opens a real TypeScript standard-library definition as read-only source', async () => {
  const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
    import('#lib/typescript-language/typescript-service.js'),
    import('#lib/typescript-language/create-typescript-extensions.js'),
  ]);
  const sourceDocument = new EditorDocument(
    'main.ts',
    'const value: number = 1;\nvalue.toFixed(2);\nclass Shape { count = 1; }\nconst typed = new Shape();\ntyped.count;\n',
  );
  const service = await createTypeScriptService({ dynamicTypes: false });
  let view: EditorView | undefined;
  let target: EditorNavigationTarget | undefined;
  try {
    await service.attach(sourceDocument);
    const extensions = createTypeScriptExtensions({
      document: sourceDocument,
      service,
      navigate: async (next) => {
        target = next;
      },
    });
    const { container, rerender } = render(
      <div className='h-72'>
        <CodeEditor
          document={sourceDocument}
          viewId='definition-source'
          languageId='typescript'
          extensions={extensions}
          onMount={(mounted) => {
            view = mounted;
          }}
        />
      </div>,
    );
    await expect.poll(() => view).toBeDefined();
    view!.dispatch({
      selection: { anchor: sourceDocument.text.indexOf('toFixed') },
    });
    view!.focus();
    await userEvent.keyboard('{F12}');
    await expect.poll(() => target?.declaration?.text).toContain('toFixed');
    expect(target?.uri).toMatch(/^file:\/\/\/(?:__typescript_lib__|cdn-types)\//u);
    const valuePosition = sourceDocument.text.indexOf('typed.count') + 1;
    target = undefined;
    view!.dispatch({ selection: { anchor: valuePosition } });
    fireEvent.keyDown(view!.contentDOM, {
      key: 'F12',
      code: 'F12',
      altKey: true,
    });
    await expect.poll(() => target?.uri).toBe(sourceDocument.uri);
    target = undefined;
    fireEvent.contextMenu(view!.contentDOM);
    await page.screenshot();
    await page.getByRole('menuitem', { name: 'Go to Type Definition' }).click();
    await expect.poll(() => target?.uri).toBe(sourceDocument.uri);
    target = undefined;
    view!.dispatch({
      selection: { anchor: sourceDocument.text.indexOf('toFixed') },
    });
    await userEvent.keyboard('{F12}');
    await expect.poll(() => target?.declaration?.text).toContain('toFixed');
    const declarationDocument = new EditorDocument(target!.uri.replace('file:///', ''), target!.declaration!.text);
    rerender(
      <VirtualDeclarationDialog
        declaration={{
          uri: target!.uri,
          document: declarationDocument,
          line: target!.line,
          column: target!.column,
        }}
        onClose={() => undefined}
        restoreFocus={() => undefined}
      />,
    );
    await expect.poll(() => document.querySelector('[role="dialog"] .cm-content')).toBeTruthy();
    const declarationView = document.querySelector('[role="dialog"] .cm-content');
    expect(declarationView).toHaveAttribute('contenteditable', 'false');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Read-only TypeScript declaration');
    const originalText = declarationDocument.text;
    await page.getByRole('textbox', { name: 'Code editor' }).click();
    await userEvent.keyboard('corruption');
    expect(declarationDocument.text).toBe(originalText);
    expect(container.querySelector('.cm-content')).toBeNull();
  } finally {
    service.dispose();
  }
}, 60_000);

function modifierAt(view: EditorView, position: number, modifier = true): MouseEventInit {
  const coords = view.coordsAtPos(position)!;
  return {
    clientX: (coords.left + coords.right) / 2 + 1,
    clientY: (coords.top + coords.bottom) / 2,
    button: 0,
    metaKey: modifier && isMac,
    ctrlKey: modifier && !isMac,
  };
}

it('underlines a symbol under the definition modifier and opens it on Mod-click for any language provider', async () => {
  const sourceDocument = new EditorDocument('main.scad', 'module ring() {}\nring();\n');
  const opened: number[] = [];
  const extensions = [
    definitionProvider.of((_view, position) => {
      opened.push(position);
    }),
  ];
  let view: EditorView | undefined;
  render(
    <div className='h-72'>
      <CodeEditor
        document={sourceDocument}
        viewId='definition-click'
        languageId='openscad'
        extensions={extensions}
        onMount={(mounted) => {
          view = mounted;
        }}
      />
    </div>,
  );
  await expect.poll(() => view).toBeDefined();
  const usage = sourceDocument.text.lastIndexOf('ring') + 1;
  fireEvent.mouseMove(view!.contentDOM, modifierAt(view!, usage));
  await expect.poll(() => view!.dom.querySelector('.cm-definition-link')?.textContent).toBe('ring');
  expect(getComputedStyle(view!.dom.querySelector('.cm-definition-link')!).textDecorationLine).toBe('underline');
  fireEvent.mouseMove(view!.contentDOM, modifierAt(view!, usage, false));
  await expect.poll(() => view!.dom.querySelector('.cm-definition-link')).toBeNull();

  fireEvent.mouseDown(view!.contentDOM, modifierAt(view!, usage));
  expect(opened).toEqual([usage]);
  expect(view!.state.selection.main.head).toBe(usage);
  fireEvent.mouseDown(view!.contentDOM, modifierAt(view!, usage, false));
  expect(opened).toHaveLength(1);

  view!.dispatch({ selection: { anchor: 2 } });
  view!.focus();
  await userEvent.keyboard('{F12}');
  expect(opened).toEqual([usage, 2]);
  fireEvent.contextMenu(view!.contentDOM);
  await page.getByRole('menuitem', { name: 'Go to Definition' }).click();
  expect(opened).toEqual([usage, 2, 2]);
});

it('opens TypeScript definitions on Mod-click and from {@link} references in hover documentation', async () => {
  const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
    import('#lib/typescript-language/typescript-service.js'),
    import('#lib/typescript-language/create-typescript-extensions.js'),
  ]);
  const sourceDocument = new EditorDocument(
    'main.ts',
    [
      'interface Mechanism {',
      '  teeth: number;',
      '}',
      '/**',
      ' * Identical to {@link Mechanism} but {@link https://x.dev docs}.',
      ' * @see {@link Mechanism}',
      ' */',
      'const gear: Mechanism = { teeth: 12 };',
      'gear.teeth;',
      '',
    ].join('\n'),
  );
  const service = await createTypeScriptService({ dynamicTypes: false });
  let view: EditorView | undefined;
  let target: EditorNavigationTarget | undefined;
  try {
    await service.attach(sourceDocument);
    const extensions = createTypeScriptExtensions({
      document: sourceDocument,
      service,
      navigate: async (next) => {
        target = next;
      },
    });
    render(
      <div className='h-72'>
        <CodeEditor
          document={sourceDocument}
          viewId='definition-links'
          languageId='typescript'
          extensions={extensions}
          onMount={(mounted) => {
            view = mounted;
          }}
        />
      </div>,
    );
    await expect.poll(() => view).toBeDefined();
    const usage = sourceDocument.text.lastIndexOf('gear') + 1;
    fireEvent.mouseDown(view!.contentDOM, modifierAt(view!, usage));
    await expect.poll(() => target).toMatchObject({ uri: sourceDocument.uri, line: 8, column: 7 });

    target = undefined;
    fireEvent.mouseMove(view!.contentDOM, modifierAt(view!, usage, false));
    await expect.poll(() => document.querySelector('.cm-typescript-hover')?.textContent).toContain('@see');
    const links = [...document.querySelectorAll('.cm-typescript-hover a')];
    expect(links.map((link) => link.textContent)).toEqual(['Mechanism', 'docs', 'Mechanism']);
    expect(links[1]).toHaveAttribute('href', 'https://x.dev');
    expect(links[1]).toHaveAttribute('target', '_blank');
    await page.screenshot();
    (links[2] as HTMLAnchorElement).click();
    await expect.poll(() => target).toMatchObject({ uri: sourceDocument.uri, line: 1, column: 1 });
  } finally {
    service.dispose();
  }
}, 60_000);

it('offers VS Code symbol navigation, references, call hierarchy, occurrences and parameter hints for TypeScript', async () => {
  const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
    import('#lib/typescript-language/typescript-service.js'),
    import('#lib/typescript-language/create-typescript-extensions.js'),
  ]);
  const source = [
    'export function area(width: number): number {',
    '  let total = width;',
    '  total = total * 2;',
    '  return total;',
    '}',
    'export function report(): number {',
    '  return area(3);',
    '}',
    '',
  ].join('\n');
  const sourceDocument = new EditorDocument('shapes.ts', source);
  const service = await createTypeScriptService({ dynamicTypes: false });
  let view: EditorView | undefined;
  let target: EditorNavigationTarget | undefined;
  const modifier = { metaKey: isMac, ctrlKey: !isMac };
  const pickerItems = (): string[] =>
    [...document.querySelectorAll('.cm-picker-item .cm-picker-label')].map((label) => label.textContent);
  try {
    await service.attach(sourceDocument);
    const extensions = createTypeScriptExtensions({
      document: sourceDocument,
      service,
      navigate: async (next) => {
        target = next;
      },
      applyWorkspaceEdits: async (edits) => {
        for (const edit of edits) {
          sourceDocument.apply({
            expectedVersion: sourceDocument.version,
            origin: 'workspace-edit',
            changes: edit.changes,
          });
        }
        return true;
      },
    });
    const { container } = render(
      <div className='h-96'>
        <CodeEditor
          document={sourceDocument}
          viewId='language-features'
          languageId='typescript'
          extensions={extensions}
          onMount={(mounted) => {
            view = mounted;
          }}
        />
      </div>,
    );
    await expect.poll(() => view).toBeDefined();
    const editor = view!;
    editor.focus();

    // Semantic occurrences: two writes and two reads of `total`, and the cursor's symbol path above the editor.
    editor.dispatch({ selection: { anchor: source.indexOf('total') + 1 } });
    await expect.poll(() => container.querySelectorAll('.cm-occurrence').length).toBe(4);
    expect(container.querySelectorAll('.cm-occurrence-write')).toHaveLength(2);
    await expect.poll(() => container.querySelector('.cm-breadcrumbs')?.textContent).toContain('area');
    await page.screenshot();

    // Go to Symbol in Editor filters the outline and moves the cursor.
    fireEvent.keyDown(editor.contentDOM, {
      key: 'o',
      code: 'KeyO',
      shiftKey: true,
      ...modifier,
    });
    await expect.poll(pickerItems).toEqual(expect.arrayContaining(['area', 'report']));
    await page.screenshot();
    await userEvent.keyboard('rep');
    await expect.poll(pickerItems).toEqual(['report']);
    await userEvent.keyboard('{Enter}');
    await expect.poll(() => editor.state.selection.main.head).toBe(source.indexOf('report'));

    // Find All References lists each site with its source line, like VS Code's peek.
    editor.dispatch({ selection: { anchor: source.indexOf('area(3)') } });
    fireEvent.keyDown(editor.contentDOM, {
      key: 'F12',
      code: 'F12',
      shiftKey: true,
    });
    await expect.poll(() => document.querySelector('.cm-picker-title')?.textContent).toBe('2 references');
    expect([...document.querySelectorAll('.cm-picker-preview')].map((preview) => preview.textContent)).toEqual([
      'export function area(width: number): number {',
      'return area(3);',
    ]);
    await page.screenshot();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect.poll(() => target).toMatchObject({ uri: sourceDocument.uri, line: 7 });

    // Call hierarchy shows the caller, and Outgoing switches direction.
    editor.dispatch({ selection: { anchor: source.indexOf('area') } });
    editor.focus();
    fireEvent.keyDown(editor.contentDOM, {
      key: 'h',
      code: 'KeyH',
      shiftKey: true,
      altKey: true,
    });
    await expect.poll(pickerItems).toEqual(['report']);
    await page.getByRole('button', { name: 'Outgoing' }).click();
    await expect.poll(() => document.querySelector('.cm-picker-empty')?.textContent).toBe('No calls found');
    await userEvent.keyboard('{Escape}');
    await expect.poll(() => document.querySelector('.cm-picker')).toBeNull();

    // Typing `(` and `,` opens and advances parameter hints without a shortcut.
    editor.dispatch({ selection: { anchor: editor.state.doc.length } });
    editor.focus();
    await userEvent.keyboard('area(');
    await expect
      .poll(() => document.querySelector('.cm-signature-help .cm-signature-active-parameter')?.textContent)
      .toBe('width: number');
    await page.screenshot();
    await userEvent.keyboard('2)');
    await expect.poll(() => document.querySelector('.cm-signature-help')).toBeNull();

    // The context menu offers every language command the server supports.
    fireEvent.contextMenu(editor.contentDOM);
    for (const name of [
      'Go to Definition',
      'Go to Type Definition',
      'Go to Implementations',
      'Find All References',
      'Show Call Hierarchy',
      'Go to Symbol in Editor…',
      'Go to Symbol in Workspace…',
      'Rename Symbol',
      'Format Document',
      'Quick Fix…',
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- each menu item is checked in order.
      await expect.element(page.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
    await page.screenshot();
  } finally {
    service.dispose();
  }
}, 90_000);

it('adds the import when a TypeScript auto-import completion is accepted with Enter after more typing', async () => {
  const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
    import('#lib/typescript-language/typescript-service.js'),
    import('#lib/typescript-language/create-typescript-extensions.js'),
  ]);
  const sourceDocument = new EditorDocument(
    'layout.ts',
    "import type { MechanismSource } from '@taucad/kinematics';\n\nexport type Test = M",
  );
  const service = await createTypeScriptService({ dynamicTypes: false });
  let view: EditorView | undefined;
  try {
    await service.client.setExtraLib(
      'file:///node_modules/@taucad/kinematics/index.d.ts',
      'export interface Mechanism { name: string }\nexport interface MechanismSource { id: string }\nexport type MechanismUnits = "mm";\n',
    );
    await service.attach(sourceDocument);
    const extensions = createTypeScriptExtensions({
      document: sourceDocument,
      service,
      navigate: () => undefined,
      applyWorkspaceEdits: async (edits) => {
        for (const edit of edits) {
          if (edit.uri !== sourceDocument.uri || edit.baseText !== sourceDocument.text) {
            return false;
          }
          sourceDocument.apply({
            expectedVersion: sourceDocument.version,
            origin: 'workspace-edit',
            changes: edit.changes,
          });
        }
        return true;
      },
    });
    render(
      <div className='h-72'>
        <CodeEditor
          document={sourceDocument}
          viewId='auto-import'
          languageId='typescript'
          extensions={extensions}
          onMount={(mounted) => {
            view = mounted;
          }}
        />
      </div>,
    );
    await expect.poll(() => view).toBeDefined();
    view!.dispatch({ selection: { anchor: sourceDocument.text.length } });
    view!.focus();
    startCompletion(view!);
    await expect.poll(() => document.querySelector('.cm-tooltip-autocomplete')?.textContent).toContain('Mechanism');
    await userEvent.keyboard('ec');
    const editor = view!;
    // CodeMirror ignores list keys while a query is pending and for a short delay after the list opens.
    const listReady = async (): Promise<void> => {
      await expect.poll(() => completionStatus(editor.state)).toBe('active');
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
    };
    await expect
      .poll(() => document.querySelector('.cm-tooltip-autocomplete')?.textContent)
      .toContain('MechanismUnits');
    await listReady();
    for (let index = 0; index < 5 && selectedCompletion(editor.state)?.label !== 'Mechanism'; index += 1) {
      const selected = selectedCompletion(editor.state);
      // oxlint-disable-next-line no-await-in-loop -- arrow through the open list one row at a time.
      await userEvent.keyboard('{ArrowDown}');
      // oxlint-disable-next-line no-await-in-loop -- wait for each move before reading the next row.
      await expect.poll(() => selectedCompletion(editor.state)).not.toBe(selected);
    }
    expect(selectedCompletion(editor.state)?.label).toBe('Mechanism');
    await listReady();
    await userEvent.keyboard('{Enter}');
    await expect
      .poll(() => sourceDocument.text)
      .toBe("import type { Mechanism, MechanismSource } from '@taucad/kinematics';\n\nexport type Test = Mechanism");
  } finally {
    service.dispose();
  }
}, 60_000);

it('colors JSON keys by seven nesting levels and cycles brace colors', async () => {
  const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  let source = '"value"';
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const key = keys[index];
    if (key) {
      const indent = '  '.repeat(index);
      source = `{\n${indent}  "${key}": ${source}\n${indent}}`;
    }
  }
  const sourceDocument = new EditorDocument('nested.json', source);
  let view: EditorView | undefined;
  const { container } = render(
    <div style={{ position: 'fixed', top: 0, left: 0, width: 800, height: 480 }}>
      <CodeEditor
        document={sourceDocument}
        viewId='json-depth'
        languageId='json'
        onMount={(mounted) => {
          view = mounted;
        }}
      />
    </div>,
  );
  await expect.poll(() => view?.plugin(jsonDepthHighlighting)).toBeDefined();
  await expect.poll(() => view?.plugin(jsonDepthHighlighting)?.decorations.size).toBeGreaterThan(0);
  await expect.poll(() => container.querySelectorAll('.cm-json-key-depth0').length).toBe(2);
  const colors = Array.from({ length: 7 }, (_, index) => {
    const key = container.querySelector(`.cm-json-key-depth${String(index)}`);
    expect(key).toBeTruthy();
    return getComputedStyle(key!).color;
  });
  expect(new Set(colors).size).toBe(7);
  const editor = container.querySelector('.cm-editor')!;
  const swatch = document.createElement('span');
  editor.append(swatch);
  const valueColors = ['--cm-string', '--cm-number'].map((token) => {
    swatch.style.color = `var(${token})`;
    return getComputedStyle(swatch).color;
  });
  swatch.remove();
  for (const keyColor of colors.slice(0, 4)) {
    expect(valueColors).not.toContain(keyColor);
  }
  const quote = container.querySelector('.cm-json-key-quote')!;
  expect(getComputedStyle(quote).color).toBe(getComputedStyle(editor).color);
  const braceColors = Array.from({ length: 3 }, (_, index) => {
    const brace = container.querySelector(`.cm-json-bracket-depth${String(index)}`);
    expect(brace).toBeTruthy();
    return getComputedStyle(brace!).color;
  });
  expect(new Set(braceColors).size).toBe(3);
  for (const valueColor of valueColors) {
    expect(braceColors).not.toContain(valueColor);
  }
  await page.screenshot();
});

it('releases views and TypeScript mirrors across twenty open/switch/close cycles', async () => {
  const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
    import('#lib/typescript-language/typescript-service.js'),
    import('#lib/typescript-language/create-typescript-extensions.js'),
  ]);
  const content = mock<FileContentService>();
  const source = Array.from(
    { length: 80 },
    (_, index) => `const value${String(index)}: number = ${String(index)};`,
  ).join('\n');
  content.resolve.mockResolvedValue({
    kind: 'text',
    content: new TextEncoder().encode(source),
  });
  content.onDidContentChange.mockReturnValue(() => undefined);
  content.onDidChangeOutcome.mockReturnValue(() => undefined);
  const session = new EditorDocumentSession({
    contentService: content,
    projectId: 'browser-lifecycle',
  });
  const service = await createTypeScriptService({ dynamicTypes: false });
  const opened = vi.spyOn(service.client, 'open');
  const closed = vi.spyOn(service.client, 'close');
  const originalSubscribe = EditorDocument.prototype.subscribe;
  let subscriptions = 0;
  const subscriptionSpy = vi
    .spyOn(EditorDocument.prototype, 'subscribe')
    .mockImplementation(function (this: EditorDocument, listener, options) {
      subscriptions += 1;
      const stop = originalSubscribe.call(this, listener, options);
      let active = true;
      return () => {
        if (active) {
          active = false;
          subscriptions -= 1;
          stop();
        }
      };
    });
  let mounted = 0;
  const paths = new Set<string>();
  try {
    /* eslint-disable no-await-in-loop -- Each cycle must close its views and worker attachment before the next begins. */
    for (let cycle = 0; cycle < 20; cycle += 1) {
      const path = cycle < 2 ? 'main.ts' : `file-${String(cycle % 12)}.ts`;
      paths.add(path);
      const shared = await session.acquire(path);
      if (!shared) {
        throw new Error(`Source document unavailable: ${path}`);
      }
      const split = cycle < 2;
      await service.attach(shared);
      if (split) {
        await service.attach(shared);
      }
      const extensions = createTypeScriptExtensions({
        document: shared,
        service,
        navigate: async () => undefined,
      });
      const views: EditorView[] = [];
      // eslint-disable-next-line no-loop-func -- The rendered views close before the next cycle starts.
      const editor = (viewId: string): React.JSX.Element => (
        <div style={{ width: 390, height: 120 }}>
          <CodeEditor
            document={shared}
            viewId={viewId}
            languageId='typescript'
            extensions={extensions}
            onMount={(view) => {
              views.push(view);
              mounted += 1;
              return () => {
                mounted -= 1;
              };
            }}
          />
        </div>
      );
      const { container, unmount } = render(
        <div className='flex'>
          {editor(split ? 'left' : `pane-${String(cycle)}`)}
          {split && editor('right')}
        </div>,
      );
      await expect.poll(() => container.querySelectorAll('.cm-editor[data-view-id]').length).toBe(split ? 2 : 1);
      if (cycle === 0) {
        const [left, right] = views;
        if (!left || !right) {
          throw new Error('Split views did not mount');
        }
        left.dispatch({ selection: { anchor: source.indexOf('value30') } });
        right.dispatch({ selection: { anchor: source.indexOf('value50') } });
        expect(left.scrollDOM.scrollHeight).toBeGreaterThan(left.scrollDOM.clientHeight);
        expect(right.scrollDOM.scrollHeight).toBeGreaterThan(right.scrollDOM.clientHeight);
        left.scrollDOM.scrollTop = 600;
        right.scrollDOM.scrollTop = 1000;
        expect(left.scrollDOM.scrollTop).toBeGreaterThan(0);
        expect(right.scrollDOM.scrollTop).toBeGreaterThan(left.scrollDOM.scrollTop);
      }
      if (cycle === 1) {
        expect(views[0]?.state.selection.main.anchor).toBe(source.indexOf('value30'));
        expect(views[1]?.state.selection.main.anchor).toBe(source.indexOf('value50'));
        await expect.poll(() => views[0]?.scrollDOM.scrollTop).toBeGreaterThan(0);
        await expect.poll(() => views[1]?.scrollDOM.scrollTop).toBeGreaterThan(views[0]?.scrollDOM.scrollTop ?? 0);
      }
      unmount();
      await service.detach(shared);
      if (split) {
        await service.detach(shared);
      }
      session.release(path);
      expect(mounted).toBe(0);
      expect(subscriptions).toBe(0);
    }
    /* eslint-enable no-await-in-loop -- Sequential lifecycle loop ends here. */
    expect(opened).toHaveBeenCalledTimes(20);
    expect(closed).toHaveBeenCalledTimes(20);
    expect([...paths].filter((path) => session.get(path) !== undefined).length).toBeLessThanOrEqual(
      maxBackgroundDocuments,
    );
  } finally {
    subscriptionSpy.mockRestore();
    session.dispose();
    service.dispose();
  }
}, 120_000);

it.each([Theme.LIGHT, Theme.DARK, Theme.BLACK, Theme.HIGH_CONTRAST])(
  'renders real TypeScript widgets in %s',
  async (theme) => {
    const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
      import('#lib/typescript-language/typescript-service.js'),
      import('#lib/typescript-language/create-typescript-extensions.js'),
    ]);
    await page.viewport(1000, 700);
    document.documentElement.className =
      theme === Theme.BLACK || theme === Theme.HIGH_CONTRAST ? `dark ${theme}` : theme;
    const source =
      'function greet(name: string): string { return name; }\nconst value: number = "wrong";\nvalue.toF\ngreet(';
    const sourceDocument = new EditorDocument('widgets.ts', source);
    const service = await createTypeScriptService({ dynamicTypes: false });
    let view: EditorView | undefined;
    try {
      await service.attach(sourceDocument);
      const extensions = createTypeScriptExtensions({
        document: sourceDocument,
        service,
        navigate: async () => undefined,
      });
      const { container } = render(
        <ThemeProvider specifiedTheme={theme} themeAction='/'>
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: 800,
              height: 480,
            }}
          >
            <CodeEditor
              document={sourceDocument}
              viewId={`widgets-${theme}`}
              languageId='typescript'
              extensions={extensions}
              onMount={(mounted) => {
                view = mounted;
              }}
            />
          </div>
        </ThemeProvider>,
      );
      await expect.poll(() => view).toBeDefined();
      await expect.poll(() => container.querySelector('.cm-lintRange-error')).toBeTruthy();
      await page.screenshot();

      view!.dispatch({ selection: { anchor: source.indexOf('toF') + 3 } });
      view!.focus();
      startCompletion(view!);
      await expect.poll(() => document.querySelector('.cm-tooltip-autocomplete')?.textContent).toContain('toFixed');
      await page.screenshot();
      const completionLabel = [...document.querySelectorAll('.cm-completionLabel')].find(
        (element) => element.textContent === 'toFixed',
      );
      expect(completionLabel).toBeTruthy();
      await userEvent.hover(completionLabel!);
      await expect.poll(() => document.querySelector('.cm-completionInfo')?.textContent).toBeTruthy();
      await page.screenshot();
      fireEvent.keyDown(view!.contentDOM, { key: 'Escape', code: 'Escape' });

      const valueToken = [...view!.contentDOM.querySelectorAll('span')].find(
        (element) => element.textContent === 'value',
      );
      expect(valueToken).toBeTruthy();
      await userEvent.hover(valueToken!);
      await expect.poll(() => document.querySelector('.cm-typescript-hover')?.textContent).toBeTruthy();
      await page.screenshot();

      view!.dispatch({
        selection: { anchor: source.lastIndexOf('greet(') + 'greet('.length },
      });
      view!.focus();
      fireEvent.keyDown(view!.contentDOM, {
        key: ' ',
        code: 'Space',
        metaKey: isMac,
        ctrlKey: !isMac,
        shiftKey: true,
      });
      await expect.poll(() => document.querySelector('.cm-signature-help')?.textContent).toContain('name');
      await page.screenshot();

      view!.dispatch({ selection: { anchor: source.indexOf('value:') + 2 } });
      view!.focus();
      fireEvent.keyDown(view!.contentDOM, { key: 'F2', code: 'F2' });
      await expect.poll(() => document.querySelector('.cm-dialog input')).toBeTruthy();
      await page.screenshot();
    } finally {
      service.dispose();
    }
  },
  120_000,
);

it.each(
  [Theme.LIGHT, Theme.DARK, Theme.BLACK, Theme.HIGH_CONTRAST].flatMap((theme) => [
    { theme, width: 1000 },
    { theme, width: 390 },
  ]),
)('styles detached editor surfaces in $theme at $width', async ({ theme, width }) => {
  await page.viewport(width, 700);
  document.documentElement.className = theme === Theme.BLACK || theme === Theme.HIGH_CONTRAST ? `dark ${theme}` : theme;
  let editor: EditorView | undefined;
  const sourceDocument = new EditorDocument('surface.ts', 'rotate');
  const documentation = () =>
    renderTypeScriptDocumentation(
      [
        { text: 'function ', kind: 'keyword' },
        { text: 'rotate', kind: 'functionName' },
        { text: '(angle: number): Shape', kind: 'text' },
      ],
      '**Rotate** a shape with an `angle`.\n\n- Preserves the source\n- Returns a new shape\n\n[Reference](https://example.com)\n\n<script>alert(1)</script>[unsafe](javascript:alert(1))',
    );
  const { container } = render(
    <div style={{ height: 500 }}>
      <CodeEditor
        document={sourceDocument}
        viewId='surfaces'
        languageId='typescript'
        onMount={(view) => {
          editor = view;
        }}
        extensions={[
          autocompletion({
            override: [
              () => ({
                from: 0,
                options: [
                  {
                    label: 'rotate',
                    type: 'function',
                    detail: '(angle: number)',
                    info: documentation,
                  },
                  { label: 'rotation', type: 'property' },
                  { label: 'Rotation', type: 'class' },
                ],
              }),
            ],
          }),
        ]}
      />
    </div>,
  );
  await expect.poll(() => editor).toBeDefined();
  const view = editor!;
  const gutter = container.querySelector('.cm-gutters')!;
  expect(gutter.getBoundingClientRect().width).toBeLessThan(width < 600 ? 72 : 65);
  view.focus();
  view.dispatch({ selection: { anchor: 6 } });
  startCompletion(view);
  await expect.poll(() => document.querySelector('.cm-tooltip-autocomplete')).not.toBeNull();
  await expect.poll(() => document.querySelector('.cm-completionInfo strong')?.textContent).toBe('Rotate');
  const popup = document.querySelector('.cm-tooltip-autocomplete')!;
  expect(container.contains(popup)).toBe(false);
  const selected = popup.querySelector('[aria-selected]')!;
  const style = getComputedStyle(selected);
  expect(contrastRatio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  const icon = popup.querySelector('.codicon-symbol-method')!;
  await document.fonts.load('16px codicon');
  expect(document.fonts.check('16px codicon')).toBe(true);
  expect(getComputedStyle(icon, ':before').content).not.toBe('none');
  expect(getComputedStyle(icon).getPropertyValue('--cm-function').trim()).not.toBe('');
  expect(document.querySelector('.cm-documentation script')).toBeNull();
  expect(document.querySelector('.cm-documentation a[href^="javascript:"]')).toBeNull();
  await page.screenshot();
  expect(popup.getBoundingClientRect().right).toBeLessThanOrEqual(width);
  closeCompletion(view);
  view.dispatch({
    effects: StateEffect.appendConfig.of(
      showTooltip.of({
        pos: 0,
        above: false,
        create: () => ({ dom: documentation() }),
      }),
    ),
  });
  await expect.poll(() => document.querySelector('.cm-tooltip .cm-signature-keyword')).not.toBeNull();
  await page.screenshot();
  view.dispatch(
    setDiagnostics(view.state, [
      {
        from: 0,
        to: 6,
        severity: 'warning',
        message: 'Check the angle',
        actions: [{ name: 'Fix angle', apply: () => undefined }],
      },
    ]),
  );
  openLintPanel(view);
  openSearchPanel(view);
  gotoLine(view);
  await expect.poll(() => container.querySelector('.cm-panel-lint')).not.toBeNull();
  await page.screenshot();
});

it.each(editorSyntaxFixtures)('renders visible syntax styles for %s', async (language, source) => {
  await page.viewport(1000, 600);
  document.documentElement.className = 'dark';
  const sourceDocument = new EditorDocument(`fixture-${language}`, source);
  const { container } = render(
    <div className='h-72'>
      <CodeEditor document={sourceDocument} viewId={`syntax-${language}`} languageId={language} />
    </div>,
  );
  const editor = page.getByRole('textbox', { name: 'Code editor' });
  await expect.element(editor).toBeVisible();
  // Inspect rendered token styles rather than parser tags alone: a parsed token can still lack a theme rule.
  await expect
    .poll(() => {
      const root = editor.element();
      const base = getComputedStyle(root).color;
      return [...root.querySelectorAll('span')].filter((node) => getComputedStyle(node).color !== base).length;
    })
    .toBeGreaterThan(0);
  if (language === 'markdown') {
    await expect.element(page.getByText('# Title', { exact: true })).toBeVisible();
    const strong = [...container.querySelectorAll('span')].find((node) => node.textContent === 'strong');
    expect(strong).toBeDefined();
    expect(Number(getComputedStyle(strong!).fontWeight)).toBeGreaterThanOrEqual(600);
    await expect
      .poll(() => {
        const keyword = [...editor.element().querySelectorAll('span')].find((node) => node.textContent === 'const');
        return keyword ? getComputedStyle(keyword).color !== getComputedStyle(editor.element()).color : false;
      })
      .toBe(true);
  }
  await page.screenshot();
});

it.each([false, true])('refreshes delayed acquisition without editing (stale response: %s)', async (delayResponse) => {
  const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
    import('#lib/typescript-language/typescript-service.js'),
    import('#lib/typescript-language/create-typescript-extensions.js'),
  ]);
  let release: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const sourceDocument = new EditorDocument(
    'main.ts',
    "import type { Shape } from 'delayed'; export const shape: Shape = {size: 'wrong'};",
  );
  const dependencyReader = {
    readFile: vi.fn(async (path: string) =>
      new TextEncoder().encode(
        path.endsWith('package.json') ? '{"types":"index.d.ts"}' : 'export type Shape = {size: number};',
      ),
    ),
    readdir: vi.fn(async (path: string) => {
      await ready;
      return path === '/node_modules/delayed' ? ['index.d.ts'] : [];
    }),
  };
  const service = await createTypeScriptService({
    dynamicTypes: false,
    staticPackageNames: [],
    dependencyReader,
  });
  let releaseResponse: () => void = () => undefined;
  const responseReady = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let captured = false;
  const request = service.client.request.bind(service.client);
  if (delayResponse) {
    vi.spyOn(service.client, 'request').mockImplementation(async (command) => {
      const result = await request(command);
      if (command.kind === 'diagnostics' && !captured) {
        captured = true;
        await responseReady;
      }
      return result;
    });
  }
  let messages: string[] = [];
  try {
    await service.attach(sourceDocument);
    const extensions = createTypeScriptExtensions({
      document: sourceDocument,
      service,
      navigate: async () => undefined,
      publishDiagnostics: (_uri, _version, diagnostics) => {
        messages = diagnostics.map((row) => row.message);
      },
    });
    render(
      <div className='h-72'>
        <CodeEditor document={sourceDocument} viewId='delayed-types' languageId='typescript' extensions={extensions} />
      </div>,
    );
    await expect
      .poll(() => (delayResponse ? captured : messages.some((message) => message.includes('Cannot find module'))))
      .toBe(true);
    const { version } = sourceDocument;
    release();
    await expect.poll(() => service.environmentRevision).toBeGreaterThan(0);
    releaseResponse();
    await expect.poll(() => messages.some((message) => message.includes("not assignable to type 'number'"))).toBe(true);
    expect(messages.some((message) => message.includes('Cannot find module'))).toBe(false);
    expect(sourceDocument.version).toBe(version);
  } finally {
    release();
    releaseResponse();
    service.dispose();
  }
});

/** One-based rows of the lint gutter markers and of the underlined text, as drawn. */
function diagnosticRows(view: EditorView): {
  gutter: number[];
  underline: number[];
} {
  const rowAt = (element: Element): number => {
    const box = element.getBoundingClientRect();
    const block = view.lineBlockAtHeight(box.top + box.height / 2 - view.documentTop);
    return view.state.doc.lineAt(block.from).number;
  };
  const gutter = [...view.dom.querySelectorAll('.cm-gutter-lint .cm-lint-marker')].map((element) => rowAt(element));
  const underline = [...view.dom.querySelectorAll('.cm-lintRange')]
    .map((element) => view.state.doc.lineAt(view.posAtDOM(element)).number)
    .filter((row, index, rows) => rows.indexOf(row) === index);
  return {
    gutter: gutter.toSorted((a, b) => a - b),
    underline: underline.toSorted((a, b) => a - b),
  };
}

const lintSource = [
  'postD = 13mm',
  'pinD = 6mm',
  'pinChamfer = 0.5mm',
  'needleOD = 10mm',
  'washerOD = 13mm',
  'washerID = 6.4mm',
].join('\n');

/** Store offsets for `name` as the language reports it; `fromLineBreak` starts on the previous line's break like the KCL server. */
function lintAt(name: string, fromLineBreak = false): EditorDiagnostic {
  const from = lintSource.indexOf(name);
  return {
    from: fromLineBreak ? from - 1 : from,
    to: from + name.length,
    message: `${name} should be lowerCamelCase`,
    severity: 'info',
  };
}

it.each([
  { name: 'KCL', path: 'main.kcl', languageId: 'kcl', owner: 'kcl-lsp' },
  { name: 'OpenSCAD', path: 'main.scad', languageId: 'openscad', owner: 'openscad-lsp' },
  { name: 'C#', path: 'Main.cs', languageId: 'csharp', owner: 'csharp-lsp' },
  { name: 'kernel', path: 'main.kcl', languageId: 'kcl', owner: 'kernel' },
] as const)(
  'draws $name diagnostics with gutter markers on their underlined rows',
  async ({ path, languageId, owner }) => {
    await page.viewport(1000, 600);
    const sourceDocument = new EditorDocument(path, lintSource);
    const diagnostics = new EditorDiagnostics();
    diagnostics.set(sourceDocument.uri, owner, [lintAt('pinD'), lintAt('needleOD', true), lintAt('washerID', true)]);
    let view: EditorView | undefined;
    render(
      <div className='h-72'>
        <CodeEditor
          document={sourceDocument}
          viewId={`lint-${owner}`}
          languageId={languageId}
          diagnostics={diagnostics}
          extensions={owner === 'kernel' ? [] : storeDiagnostics(diagnostics, sourceDocument, owner)}
          onMount={(mounted) => {
            view = mounted;
          }}
        />
      </div>,
    );
    await expect.poll(() => view && diagnosticRows(view)).toEqual({ gutter: [2, 4, 6], underline: [2, 4, 6] });

    // Edits move diagnostics with their text, and a re-lint keeps them there until the owner publishes again.
    view!.dispatch({ changes: { from: 0, insert: '// header\n' } });
    await new Promise((resolve) => {
      setTimeout(resolve, 300);
    });
    expect(diagnosticRows(view!)).toEqual({
      gutter: [3, 5, 7],
      underline: [3, 5, 7],
    });
  },
);

it('shows kernel and language diagnostics together on their own rows', async () => {
  await page.viewport(1000, 600);
  const sourceDocument = new EditorDocument('main.kcl', lintSource);
  const diagnostics = new EditorDiagnostics();
  let view: EditorView | undefined;
  render(
    <div className='h-72'>
      <CodeEditor
        document={sourceDocument}
        viewId='lint-combined'
        languageId='kcl'
        diagnostics={diagnostics}
        extensions={storeDiagnostics(diagnostics, sourceDocument, 'kcl-lsp')}
        onMount={(mounted) => {
          view = mounted;
        }}
      />
    </div>,
  );
  await expect.poll(() => view).toBeDefined();
  diagnostics.set(sourceDocument.uri, 'kcl-lsp', [lintAt('needleOD', true)]);
  diagnostics.set(sourceDocument.uri, 'kernel', [{ ...lintAt('washerOD'), severity: 'error', message: 'kernel' }]);
  await expect.poll(() => diagnosticRows(view!)).toEqual({ gutter: [4, 5], underline: [4, 5] });
  view!.dispatch({ changes: { from: lintSource.length, insert: '\nx = 1' } });
  diagnostics.set(sourceDocument.uri, 'kcl-lsp', [lintAt('pinChamfer', true)]);
  await expect.poll(() => diagnosticRows(view!)).toEqual({ gutter: [3, 5], underline: [3, 5] });
});

it('draws real TypeScript diagnostics with gutter markers on their underlined rows', async () => {
  await page.viewport(1000, 600);
  const [{ createTypeScriptService }, { createTypeScriptExtensions }] = await Promise.all([
    import('#lib/typescript-language/typescript-service.js'),
    import('#lib/typescript-language/create-typescript-extensions.js'),
  ]);
  const sourceDocument = new EditorDocument(
    'main.ts',
    'const width = 1;\n\nmissing;\nconst height: number = "tall";\n',
  );
  const service = await createTypeScriptService({ dynamicTypes: false });
  let view: EditorView | undefined;
  try {
    await service.attach(sourceDocument);
    render(
      <div className='h-72'>
        <CodeEditor
          document={sourceDocument}
          viewId='lint-typescript'
          languageId='typescript'
          extensions={createTypeScriptExtensions({
            document: sourceDocument,
            service,
            navigate: async () => undefined,
          })}
          onMount={(mounted) => {
            view = mounted;
          }}
        />
      </div>,
    );
    await expect
      .poll(() => view && diagnosticRows(view), { timeout: 30_000 })
      .toEqual({ gutter: [3, 4], underline: [3, 4] });
  } finally {
    service.dispose();
  }
}, 60_000);
