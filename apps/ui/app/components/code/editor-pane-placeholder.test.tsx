// @vitest-environment jsdom
/*
 * The code pane while its editor cannot mount yet (loading states UX blueprint, P-i; red-first row C12). The pane keeps
 * the editor's background, shows the file's own text read-only as soon as it is read, and draws no shape that stands
 * for text it does not have.
 */
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorPanePlaceholder } from '#components/code/editor-pane-placeholder.js';

type PlaceholderProps = ComponentProps<typeof EditorPanePlaceholder>;

const source = 'function rotate(radius: number) {\n  return radius * Math.PI;\n}';

describe('EditorPanePlaceholder', () => {
  // Blueprint row C12: twelve grey bars stood in for the file (frames U18 12/12).
  it.fails('renders the known text read-only and draws no Skeleton line (C12)', () => {
    const known = { text: source };
    const props: PlaceholderProps = { label: 'Loading main.ts', ...known };
    const { container } = render(<EditorPanePlaceholder {...props} />);

    expect(container.querySelectorAll('[data-slot="skeleton"]'), 'Skeleton lines in the code pane').toHaveLength(0);
    const pane = screen.getByRole('group', { name: 'Loading main.ts' });
    expect(pane).toHaveAttribute('aria-busy', 'true');
    expect(pane).toHaveTextContent('return radius * Math.PI;');
    expect(pane.querySelector('[contenteditable]')).toBeNull();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The pane does not take focus by itself.
    expect(document.activeElement).toBe(document.body);
  });

  it.fails('shows only the editor background before the read, with no Skeleton line (C12)', () => {
    const { container } = render(<EditorPanePlaceholder label='Loading main.ts' />);

    expect(container.querySelectorAll('[data-slot="skeleton"]'), 'Skeleton lines in the code pane').toHaveLength(0);
    const pane = screen.getByRole('group', { name: 'Loading main.ts' });
    expect(pane).toHaveAttribute('aria-busy', 'true');
    expect(pane.querySelector('[data-slot="editor-pane-text"]')).toBeNull();
  });
});
