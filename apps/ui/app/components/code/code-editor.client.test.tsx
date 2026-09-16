import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type * as CodeEditorModule from '#components/code/code-editor.client.js';
import type * as ThemeModule from '#hooks/use-theme.js';

const initialization = vi.hoisted(() => Promise.withResolvers<void>());
const configure = vi.hoisted(() => vi.fn(async () => initialization.promise));
vi.mock('#lib/monaco.lib.client.js', () => ({ configureMonaco: configure, registerCompletions: vi.fn() }));
vi.mock('#hooks/use-theme.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ThemeModule>()),
  useTheme: () => ({ theme: 'light', isHighContrast: false }),
}));
vi.mock('#hooks/use-cookie.js', () => ({ useCookie: () => [false] }));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@monaco-editor/react', () => ({ Editor: () => <textarea aria-label='Code' /> }));

it('should load the module before initialization and mount editors only after initialization', async () => {
  let loaded: typeof CodeEditorModule | undefined;
  const importing = (async () => {
    loaded = await import('#components/code/code-editor.client.js');
  })();
  try {
    await expect.poll(() => loaded, { timeout: 1000 }).toBeDefined();
    expect(configure).not.toHaveBeenCalled();
    const { CodeEditor } = loaded!;
    render(<CodeEditor onChange={() => undefined} loading={<span>Loading editor</span>} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading editor');
    expect(screen.queryByRole('textbox', { name: 'Code' })).not.toBeInTheDocument();
    await act(async () => {
      initialization.resolve();
      await initialization.promise;
    });
    expect(await screen.findByRole('textbox', { name: 'Code' })).toBeInTheDocument();
    expect(configure).toHaveBeenCalledTimes(1);
  } finally {
    initialization.resolve();
    await importing;
  }
});
