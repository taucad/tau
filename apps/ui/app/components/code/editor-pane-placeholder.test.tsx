// @vitest-environment jsdom
/*
 * The code pane while its editor cannot mount yet (loading states UX blueprint, P-i; red-first row C12). The pane keeps
 * the editor's background, shows the file's own text read-only as soon as it is read, and draws no shape that stands
 * for text it does not have.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';

const source = 'function rotate(radius: number) {\n  return radius * Math.PI;\n}';

describe('EditorPanePlaceholder', () => {
  // Blueprint row C12: twelve grey bars stood in for the file (frames U18 12/12).
  it('renders the known text read-only and draws no Skeleton line (C12)', () => {
    const { container } = render(<EditorPanePlaceholder label='Loading main.ts' text={source} />);

    expect(container.querySelectorAll('[data-slot="skeleton"]'), 'Skeleton lines in the code pane').toHaveLength(0);
    const pane = screen.getByRole('group', { name: 'Loading main.ts' });
    expect(pane).toHaveAttribute('aria-busy', 'true');
    expect(pane).toHaveTextContent('return radius * Math.PI;');
    expect(pane.querySelector('[contenteditable]')).toBeNull();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The pane does not take focus by itself.
    expect(document.activeElement).toBe(document.body);
  });

  it('numbers every line in a gutter beside the text, and leaves the gutter out of the text', () => {
    render(<EditorPanePlaceholder label='Loading main.ts' text={source} />);

    const text = screen.getByRole('group', { name: 'Loading main.ts' }).querySelector('[data-slot="editor-pane-text"]');
    expect(text?.textContent).toBe(source);
    const gutter = text?.previousElementSibling;
    expect(gutter).toHaveAttribute('aria-hidden', 'true');
    expect(gutter?.textContent).toBe('1\n2\n3›');
  });

  it('shows only the editor background before the read, with no Skeleton line (C12)', () => {
    const { container } = render(<EditorPanePlaceholder label='Loading main.ts' />);

    expect(container.querySelectorAll('[data-slot="skeleton"]'), 'Skeleton lines in the code pane').toHaveLength(0);
    const pane = screen.getByRole('group', { name: 'Loading main.ts' });
    expect(pane).toHaveAttribute('aria-busy', 'true');
    expect(pane.querySelector('[data-slot="editor-pane-text"]')).toBeNull();
    // The wait's words belong to the pane that hosts this placeholder, which outlives it.
    expect(pane.querySelector('[data-slot="wait-indicator"]')).toBeNull();
  });
});
