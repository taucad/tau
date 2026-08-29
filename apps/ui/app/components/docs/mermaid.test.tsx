import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Mermaid } from '#components/docs/mermaid.js';

const useThemeMock = vi.hoisted(() => vi.fn());
const mermaidInitializeMock = vi.hoisted(() => vi.fn());
const mermaidRenderMock = vi.hoisted(() => vi.fn(async () => ({ svg: '<svg aria-label="diagram" />' })));

vi.mock('#hooks/use-theme.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Mirrors the production Theme values.
  Theme: { DARK: 'dark' },
  useTheme: useThemeMock,
}));
vi.mock('mermaid', () => ({
  default: {
    initialize: mermaidInitializeMock,
    render: mermaidRenderMock,
  },
}));

describe('Mermaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useThemeMock.mockReturnValue({ theme: 'dark', isHighContrast: false });
  });

  it('should rerender when contrast changes without changing the color scheme', async () => {
    const view = render(<Mermaid chart='flowchart LR; A --> B' />);
    await waitFor(() => {
      expect(mermaidRenderMock).toHaveBeenCalledTimes(1);
    });

    useThemeMock.mockReturnValue({ theme: 'dark', isHighContrast: true });
    view.rerender(<Mermaid chart='flowchart LR; A --> B' />);

    await waitFor(() => {
      expect(mermaidRenderMock).toHaveBeenCalledTimes(2);
    });
    const lastInitializeOptions: unknown = mermaidInitializeMock.mock.lastCall?.[0];
    expect(lastInitializeOptions).toMatchObject({ theme: 'base' });
    expect(lastInitializeOptions).toHaveProperty('themeVariables');
  });
});
