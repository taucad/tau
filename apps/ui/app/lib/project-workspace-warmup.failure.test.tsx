/**
 * A workspace shell import that fails (offline before its chunk arrived) settles once. Staging QA (2026-11-27) saw the
 * project route import it about 630 times a second: each render after the failure found the import forgotten and
 * started another, and each failure asked the server for its build. A render only reads the import; an open or a
 * person's intent asks again.
 */
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loadCode } = vi.hoisted(() => ({ loadCode: vi.fn() }));

vi.mock('@taucad/ui-core/lib/code-loading', () => ({ loadCode }));

const offline = (): Error => new TypeError('Failed to fetch dynamically imported module: project-live-sessions.js');

/**
 * React, the renderer and the warm-up module from one module graph: each row resets the graph for a fresh import
 * state, and a hook from one React copy cannot run under another's renderer.
 */
const load = async () => {
  const react = await import('react');
  const { act, render } = await import('@testing-library/react');
  const warmup = await import('#lib/project-workspace-warmup.js');
  /** Holds what a read throws, so a row sees the error instead of the test failing on it. */
  class Caught extends react.Component<{ readonly children: ReactNode }, { readonly error?: unknown }> {
    public static getDerivedStateFromError(error: unknown): { error: unknown } {
      return { error };
    }

    public override state: { readonly error?: unknown } = {};

    public override render(): ReactNode {
      return this.state.error === undefined ? this.props.children : <span>caught</span>;
    }
  }
  /** Lets the import settle and React finish the renders it pings. */
  const settle = async (): Promise<void> => {
    await act(async () => {
      for (let turn = 0; turn < 20; turn += 1) {
        // oxlint-disable-next-line no-await-in-loop -- each turn lets a rejection and its ping run.
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    });
  };
  return { ...react, ...warmup, Caught, render, settle };
};

beforeEach(() => {
  vi.resetModules();
  loadCode.mockReset();
  loadCode.mockImplementation(async () => {
    throw offline();
  });
});

describe('a failed workspace shell import', () => {
  it('is imported once however often a render reads it', async () => {
    const { Caught, Suspense, loadProjectWorkspace, render, settle, use } = await load();
    function Reader({ pass }: { readonly pass: number }): ReactNode {
      use(loadProjectWorkspace());
      return <span>{pass}</span>;
    }
    const tree = (pass: number): React.JSX.Element => (
      <Caught>
        <Suspense fallback={null}>
          <Reader pass={pass} />
        </Suspense>
      </Caught>
    );

    const { rerender } = render(tree(0));
    await settle();
    for (let pass = 1; pass <= 5; pass += 1) {
      rerender(tree(pass));
      // oxlint-disable-next-line no-await-in-loop -- each pass settles before the next.
      await settle();
    }

    expect(loadCode).toHaveBeenCalledOnce();
  });

  it('reads as no workspace in a render, which draws nothing instead of throwing', async () => {
    const { Caught, Suspense, render, settle, useProjectWorkspace } = await load();
    function Sessions(_props: { readonly pass: number }): ReactNode {
      return useProjectWorkspace() === undefined ? <span>no workspace</span> : <span>workspace</span>;
    }

    const tree = (pass: number): React.JSX.Element => (
      <Caught>
        <Suspense fallback={null}>
          <Sessions key='sessions' pass={pass} />
        </Suspense>
      </Caught>
    );
    const view = render(tree(0));
    await settle();
    /* The next render after the failure, whatever causes it, reads the settled failure. */
    view.rerender(tree(1));
    await settle();

    /* Drawn by the reader, not by the error boundary. */
    expect(view.container.textContent).toBe('no workspace');
    expect(loadCode).toHaveBeenCalledOnce();
  });

  it('is imported again when an open asks for it, once', async () => {
    const { loadProjectWorkspace, openProjectWorkspace, settle } = await load();
    await loadProjectWorkspace().catch(() => undefined);
    await settle();
    expect(loadCode).toHaveBeenCalledOnce();

    loadCode.mockResolvedValue({ LiveProjectSessions: () => null, warmWorkspaceLayout: () => undefined });
    await openProjectWorkspace();

    expect(loadCode).toHaveBeenCalledTimes(2);
    expect(loadProjectWorkspace()).toMatchObject({ status: 'fulfilled' });
  });
});
