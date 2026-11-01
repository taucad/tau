import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { render, waitFor } from '@testing-library/react';
import { EditorState } from '@codemirror/state';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { highlightTree } from '@lezer/highlight';
import { highlightLanguages, loadLanguage, tauHighlighter } from '@taucad/grammars';
import type { HighlightLanguage } from '@taucad/grammars';
import { grammarFixtures } from '@taucad/grammars/fixtures';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import { describe, expect, it } from 'vitest';
import { CodeViewer } from '#components/code/code-viewer.js';
import { DiffViewer } from '#components/code/diff-viewer.js';
import { paintHighlightedCode, renderEditorDocumentation } from '#components/code/editor-documentation.js';
import { MarkdownViewer } from '#components/markdown/markdown-viewer.js';
import { loadEditorSyntax } from '#lib/editor-syntax.js';

/**
 * Every code surface highlights every language through the one grammar registry and token classes.
 * Each cell renders a language's fixture on a surface and checks the fixture's expected tokens, so a
 * surface that bypasses the registry, or a language one surface cannot resolve, fails here.
 */
type Surface = Readonly<{
  name: string;
  /** Mount the fixture and return the element that holds its highlighted text. */
  mount: (language: HighlightLanguage, source: string) => Promise<HTMLElement>;
}>;

/** A fence no fixture contains, so Markdown and its own code fences stay one block. */
const fence = '~~~~';

const surfaces: readonly Surface[] = [
  {
    name: 'editor',
    async mount(language, source) {
      const state = EditorState.create({ doc: source, extensions: [await loadEditorSyntax(language)] });
      const tree = ensureSyntaxTree(state, state.doc.length, 5000) ?? syntaxTree(state);
      const root = document.createElement('div');
      let position = 0;
      highlightTree(tree, tauHighlighter, (from, to, classes) => {
        root.append(state.sliceDoc(position, from));
        const span = document.createElement('span');
        span.className = classes;
        span.textContent = state.sliceDoc(from, to);
        root.append(span);
        position = to;
      });
      root.append(state.sliceDoc(position));
      return root;
    },
  },
  {
    name: 'code viewer',
    async mount(language, source) {
      const { container } = render(<CodeViewer text={source} language={language} />);
      await waitFor(() => {
        expect((container.firstElementChild as HTMLElement).dataset['highlightState']).toBe('ready');
      });
      return container;
    },
  },
  {
    name: 'diff viewer',
    async mount(language, source) {
      const { container } = render(<DiffViewer originalContent='' modifiedContent={source} language={language} />);
      await waitFor(() => {
        expect((container.firstElementChild as HTMLElement).dataset['highlightState']).toBe('ready');
      });
      return container;
    },
  },
  {
    name: 'chat Markdown fence',
    async mount(language, source) {
      const { container } = render(
        <TooltipProvider>
          <MarkdownViewer>{`${fence}${language}\n${source}\n${fence}\n`}</MarkdownViewer>
        </TooltipProvider>,
      );
      await waitFor(() => {
        expect(container.querySelector('[data-highlight-state="ready"]')).not.toBeNull();
      });
      return container;
    },
  },
  {
    name: 'documentation fence',
    async mount(language, source) {
      await loadLanguage(language);
      return renderEditorDocumentation(`${fence}${language}\n${source}\n${fence}`, document);
    },
  },
  {
    name: 'untagged documentation fence in its source language',
    async mount(language, source) {
      await loadLanguage(language);
      return renderEditorDocumentation(`${fence}\n${source}\n${fence}`, document, { languageId: language });
    },
  },
  {
    name: 'signature label',
    async mount(language, source) {
      await loadLanguage(language);
      const root = document.createElement('code');
      const emphasis = { from: 0, to: source.length, className: 'cm-signature-active-parameter' };
      paintHighlightedCode(root, { text: source, languageId: language, emphasis });
      expect(root.querySelector('.cm-signature-active-parameter')?.textContent).toBe(source);
      return root;
    },
  },
];

const classesOf = (root: HTMLElement, text: string): string[] =>
  [...root.querySelectorAll('span')].filter((span) => span.textContent === text).map((span) => span.className);

describe('code surfaces × languages', () => {
  it('should cover every highlight language with a grammar fixture', () => {
    expect(Object.keys(grammarFixtures).sort()).toEqual([...highlightLanguages].sort());
  });

  describe.each(surfaces)('$name', (surface) => {
    it.each(highlightLanguages)('should highlight %s with its grammar', async (language) => {
      const fixture = grammarFixtures[language];
      const root = await surface.mount(language, fixture.source);

      expect(root.textContent.replaceAll(/\s+/gu, '')).toContain(fixture.source.replaceAll(/\s+/gu, ''));
      for (const [text, className] of fixture.expect) {
        const found = classesOf(root, text);
        expect(
          found.some((classes) => className.split(' ').every((name) => classes.split(' ').includes(name))),
          `${surface.name} ${language}: ${JSON.stringify(text)} as ${className}, found ${JSON.stringify(found)}`,
        ).toBe(true);
      }
    });
  });

  /* A surface that pins a language bypasses the registry; resolve it from the file instead. */
  it('should never pin a code editor to a literal language', () => {
    const appRoot = join(import.meta.dirname, '../../..');
    const sources: string[] = [];
    const walk = (directory: string): void => {
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
          walk(path);
        } else if (path.endsWith('.tsx') && !path.endsWith('.test.tsx')) {
          sources.push(path);
        }
      }
    };
    walk(join(appRoot, 'app'));
    const pinned = sources.filter((path) => /<CodeEditor\b[^>]*\blanguageId=['"]/su.test(readFileSync(path, 'utf8')));
    expect(pinned.map((path) => relative(appRoot, path))).toEqual([]);
  });
});
