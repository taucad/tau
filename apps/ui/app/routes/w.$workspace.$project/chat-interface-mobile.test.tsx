// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as ChatInterfaceNavModule from '#routes/w.$workspace.$project/chat-interface-nav.js';
import { ChatInterfaceMobile } from '#routes/w.$workspace.$project/chat-interface-mobile.js';

const state = vi.hoisted(() => ({
  drawerOpen: false,
  activeTab: 'viewer' as string,
  activeSnapPoint: 0.5,
  listeners: new Set<() => void>(),
}));
const setDrawerOpen = (open: boolean): void => {
  act(() => {
    state.drawerOpen = open;
    for (const listener of state.listeners) {
      listener();
    }
  });
};

vi.mock('#routes/w.$workspace.$project/use-chat-interface-state.js', () => ({
  useChatInterfaceState: () => ({
    activeTab: state.activeTab,
    handleTabChange: vi.fn(),
    drawerOpen: useSyncExternalStore(
      (listener) => {
        state.listeners.add(listener);
        return () => state.listeners.delete(listener);
      },
      () => state.drawerOpen,
    ),
    handleDrawerChange: vi.fn(),
    snapPoints: [0.5, 1],
    activeSnapPoint: state.activeSnapPoint,
    handleSnapChange: vi.fn(),
  }),
}));
vi.mock('#routes/w.$workspace.$project/focused-chat-gate.js', () => ({
  ChatHistoryGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
  ChatInterfaceSessionGate: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
}));
vi.mock('#routes/w.$workspace.$project/chat-viewer-dockview.js', () => ({
  ViewerDockview: () => <button type='button'>Viewer controls</button>,
}));
vi.mock('#routes/w.$workspace.$project/chat-history.js', () => ({
  ChatHistory: () => <textarea aria-label='Message' />,
}));
vi.mock('#routes/w.$workspace.$project/chat-file-tree.js', () => ({ ChatFileTree: () => <p>File tree</p> }));
vi.mock('#routes/w.$workspace.$project/chat-parameters.js', () => ({ ChatParameters: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-editor-layout.js', () => ({ ChatEditorLayout: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-details.js', () => ({ ChatDetails: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-converter.js', () => ({ ChatConverter: () => null }));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({ ProjectShareWorkbenchPanel: () => null }));
vi.mock('#routes/w.$workspace.$project/chat-revisions.js', () => ({ ChatRevisions: () => <p>Revision list</p> }));
vi.mock('#routes/w.$workspace.$project/project-unavailable-overlay.js', () => ({
  ProjectUnavailableOverlay: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-manifest-issue-banner.js', () => ({
  ProjectManifestIssueBanner: () => null,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface-nav.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ChatInterfaceNavModule>()),
  ChatInterfaceNav: () => null,
}));
vi.mock('#routes/w.$workspace.$project/workspace-skeleton.js', () => ({ WorkspaceSkeleton: () => null }));

/** The length, in px, of a CSS length expression, with each `var()` read from the arbitrary properties in `classes`. */
function resolveLength(
  expression: string,
  classes: string,
  environment: { readonly viewportHeight: number; readonly safeAreaBottom: number },
): number {
  const variables = new Map<string, string>([['--spacing', '4px']]);
  for (const [, name, value] of classes.matchAll(/\[(--[\w-]+):([^\s\]]+(?:\([^\]]*\))?)\]/gu)) {
    variables.set(name!, value!.replaceAll('_', ' '));
  }
  let source = expression;
  for (let depth = 0; /var\(|env\(/u.test(source); depth++) {
    if (depth > 10) {
      throw new Error(`Unresolved length: ${source}`);
    }
    source = source
      .replaceAll(/var\((--[\w-]+)\)/gu, (_, name: string) => {
        const value = variables.get(name);
        if (value === undefined) {
          throw new Error(`Undefined ${name} in ${expression}`);
        }
        return `(${value})`;
      })
      .replaceAll('env(safe-area-inset-bottom)', `(${environment.safeAreaBottom})`);
  }
  source = source
    .replaceAll('calc(', '(')
    .replaceAll(/([\d.]+)dvh/gu, (_, amount: string) => `(${(Number(amount) * environment.viewportHeight) / 100})`)
    .replaceAll('px', '');
  return evaluate(source);
}

/** Evaluates + - * / and parentheses over numbers. */
function evaluate(source: string): number {
  const tokens = source.match(/[\d.]+|[()+\-*/]/gu) ?? [];
  let index = 0;
  const factor = (): number => {
    const token = tokens[index++];
    if (token === '(') {
      const value = sum();
      index++;
      return value;
    }
    if (token === '-') {
      return -factor();
    }
    return Number(token);
  };
  const product = (): number => {
    let value = factor();
    while (tokens[index] === '*' || tokens[index] === '/') {
      value = tokens[index++] === '*' ? value * factor() : value / factor();
    }
    return value;
  };
  const sum = (): number => {
    let value = product();
    while (tokens[index] === '+' || tokens[index] === '-') {
      value = tokens[index++] === '+' ? value + product() : value - product();
    }
    return value;
  };
  return sum();
}

afterEach(() => {
  state.drawerOpen = false;
  state.activeTab = 'viewer';
  state.activeSnapPoint = 0.5;
});

describe('ChatInterfaceMobile', () => {
  it('should name the open surface by its title, with no tab panel left pointing at a missing tab', async () => {
    state.drawerOpen = true;
    state.activeTab = 'revisions';
    render(<ChatInterfaceMobile />);

    const surface = await screen.findByRole('region', { name: 'Revisions' });
    expect(await within(surface).findByText('Revision list')).toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    for (const labelled of document.querySelectorAll('[aria-labelledby]')) {
      for (const id of labelled.getAttribute('aria-labelledby')!.split(' ')) {
        expect(
          document.querySelector(`[id="${id}"]`),
          `#${id} labels ${labelled.outerHTML.slice(0, 80)}`,
        ).not.toBeNull();
      }
    }
  });

  it.each([
    { width: 320, viewportHeight: 640, safeAreaBottom: 0, snapPoint: 0.5 },
    { width: 390, viewportHeight: 844, safeAreaBottom: 34, snapPoint: 0.5 },
    { width: 390, viewportHeight: 844, safeAreaBottom: 34, snapPoint: 1 },
    { width: 320, viewportHeight: 640, safeAreaBottom: 0, snapPoint: 0.25 },
  ])(
    'should end the open surface at the top of the nav at $width×$viewportHeight (snap $snapPoint, inset $safeAreaBottom px)',
    async ({ viewportHeight, safeAreaBottom, snapPoint }) => {
      state.drawerOpen = true;
      state.activeTab = 'chat';
      state.activeSnapPoint = snapPoint;
      render(<ChatInterfaceMobile />);

      const surface = await screen.findByRole('region', { name: 'Chat' });
      const drawer = surface.closest<HTMLElement>('[data-slot="drawer-content"]')!;
      const environment = { viewportHeight, safeAreaBottom };
      // Vaul shows the top `snapPoint` of the viewport-tall sheet; the grabber row comes first, then the surface.
      const sheetTop = (1 - snapPoint) * viewportHeight;
      const grabber = resolveLength('var(--drawer-handle-height)', drawer.className, environment);
      const surfaceBottom = sheetTop + grabber + resolveLength(surface.style.height, drawer.className, environment);
      const navTop = viewportHeight - resolveLength('var(--nav-offset)', drawer.className, environment);

      expect(grabber).toBe(24);
      expect(surfaceBottom).toBeCloseTo(navTop);
    },
  );

  it('should hold the model above the nav and its home-indicator inset while no surface is open', () => {
    state.drawerOpen = false;
    state.activeTab = 'viewer';
    render(<ChatInterfaceMobile />);

    const viewerBox = screen.getByRole('button', { name: 'Viewer controls' }).parentElement!;
    expect(viewerBox.style.paddingBottom).toBe('var(--nav-offset)');
    expect(viewerBox.parentElement).toHaveClass('[--nav-offset:calc(var(--nav-height)_+_env(safe-area-inset-bottom))]');
  });

  it('should keep the viewer accessible while the docked panel opens and closes', async () => {
    state.drawerOpen = false;
    render(<ChatInterfaceMobile />);

    expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();

    setDrawerOpen(true);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();
    });
    expect(screen.getByText('Viewer controls').closest('[aria-hidden]')).toBeNull();
    expect(document.querySelector('[data-slot=drawer-overlay]')).toBeNull();

    setDrawerOpen(false);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Viewer controls' })).toBeInTheDocument();
    });
    expect(screen.getByText('Viewer controls').closest('[aria-hidden]')).toBeNull();
  });

  it('should move the viewer box in one step instead of animating its size through every frame', () => {
    // Every intermediate size reallocates the canvas and all of its render targets.
    state.drawerOpen = false;
    render(<ChatInterfaceMobile />);

    const viewerBox = screen.getByRole('button', {
      name: 'Viewer controls',
    }).parentElement!;

    expect(viewerBox.className).not.toMatch(/(?:^|\s)transition(?:-|\s|$)/u);
    expect(viewerBox.style.transition).toBe('');
  });
});
