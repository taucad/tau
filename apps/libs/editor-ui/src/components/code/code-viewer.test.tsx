import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { loadLanguage } from '@taucad/grammars';
import { CodeViewer } from '#components/code/code-viewer.js';
import { maxHighlightedCodeLength } from '#components/code/use-highlighted-lines.js';

const root = (container: HTMLElement): HTMLElement => container.firstElementChild as HTMLElement;

describe('CodeViewer', () => {
  it('should highlight with the shared token classes once the grammar loads', async () => {
    const { container } = render(<CodeViewer text='const answer = 42;' language='typescript' />);

    expect(await screen.findByText('const', { selector: 'span.tok-keyword' })).toBeInTheDocument();
    expect(screen.getByText('42', { selector: 'span.tok-number' })).toBeInTheDocument();
    expect(root(container).dataset['highlightState']).toBe('ready');
    expect(container.querySelector('code')?.textContent).toBe('const answer = 42;');
  });

  it('should highlight synchronously on first render when the grammar is already loaded', async () => {
    await loadLanguage('kcl');
    const { container } = render(<CodeViewer text={'fn mk(@d) {\n  return d\n}'} language='kcl' />);

    expect(root(container).dataset['highlightState']).toBe('ready');
    expect(screen.getByText('fn', { selector: 'span.tok-keyword' })).toBeInTheDocument();
    expect(container.querySelector('code')?.textContent).toBe('fn mk(@d) {\n  return d\n}');
  });

  it('should resolve aliases and file extensions to the same grammar', async () => {
    render(<CodeViewer text='cube(10);' language='.scad' />);
    expect(await screen.findByText('cube', { selector: 'span.tok-function' })).toBeInTheDocument();
  });

  it('should render unsupported languages as plain text', () => {
    const { container } = render(<CodeViewer text='MOVE A TO B.' language='cobol' />);
    expect(root(container).dataset['language']).toBe('plaintext');
    expect(root(container).dataset['highlightState']).toBe('plain');
    expect(container.querySelector('[class^="tok-"]')).toBeNull();
  });

  it('should follow text changes without showing stale highlighting', async () => {
    const { container, rerender } = render(<CodeViewer text='first' language='typescript' />);
    await waitFor(() => {
      expect(root(container).dataset['highlightState']).toBe('ready');
    });
    rerender(<CodeViewer text='let latest = 1;' language='typescript' />);
    await waitFor(() => {
      expect(screen.getByText('let', { selector: 'span.tok-keyword' })).toBeInTheDocument();
    });
    expect(container.textContent).not.toContain('first');
  });

  /* D-UI-28: text this long is read for its shape and would hold the main thread while it parses. */
  it('should show code beyond the highlight cap as plain text', async () => {
    await loadLanguage('typescript');
    const large = 'x'.repeat(maxHighlightedCodeLength + 1);
    const { container } = render(<CodeViewer text={large} language='typescript' />);

    expect(root(container).dataset['highlightState']).toBe('plain');
    expect(container.querySelector('code')?.textContent).toBe(large);
  });
});
