// @vitest-environment jsdom
/**
 * STO-25 SP5: the open warms the layout its viewport will mount, and only that one (D13: a phone never asks for the
 * desktop shell). Each layout's factory records its own import, so "requested" is what the module map saw.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requested = vi.hoisted(() => [] as string[]);

/*
 * A test that needs another desktop import sets it here, and the one mock `beforeEach` registers calls it. A second
 * `vi.doMock` of the same path is not deterministic: Vitest resolves consecutive `vi.doMock` calls in parallel and
 * registers each one when its path resolves, so the test's mock could lose to the `beforeEach` one and import the
 * working layout (run 44134956458).
 */
let importDesktop: (() => Promise<unknown>) | undefined;

function stubViewport(phone: boolean | undefined): void {
  vi.stubGlobal(
    'matchMedia',
    phone === undefined
      ? undefined
      : vi.fn((query: string) => ({ matches: phone && query === '(max-width: 767px)', media: query })),
  );
}

describe('warmWorkspaceLayout', () => {
  beforeEach(() => {
    requested.length = 0;
    vi.resetModules();
    importDesktop = undefined;
    vi.doMock('#routes/w.$workspace.$project/chat-interface-desktop.js', async () => {
      if (importDesktop !== undefined) {
        return importDesktop();
      }
      requested.push('desktop');
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the React component's exported name.
      return { ChatInterfaceDesktop: () => null };
    });
    vi.doMock('#routes/w.$workspace.$project/chat-interface-mobile.js', () => {
      requested.push('mobile');
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Mock the React component's exported name.
      return { ChatInterfaceMobile: () => null };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.doUnmock('#routes/w.$workspace.$project/chat-interface-desktop.js');
    vi.doUnmock('#routes/w.$workspace.$project/chat-interface-mobile.js');
  });

  it('should request only the desktop shell at a desktop viewport', async () => {
    stubViewport(false);
    const { warmWorkspaceLayout } = await import('#routes/w.$workspace.$project/chat-interface-layouts.js');

    warmWorkspaceLayout();

    await vi.waitFor(() => {
      expect(requested).toEqual(['desktop']);
    });
  });

  it('should request only the phone shell at a phone viewport', async () => {
    stubViewport(true);
    const { warmWorkspaceLayout } = await import('#routes/w.$workspace.$project/chat-interface-layouts.js');

    warmWorkspaceLayout();

    await vi.waitFor(() => {
      expect(requested).toEqual(['mobile']);
    });
  });

  it('should request nothing where no viewport is measured', async () => {
    stubViewport(undefined);
    const { warmWorkspaceLayout } = await import('#routes/w.$workspace.$project/chat-interface-layouts.js');

    warmWorkspaceLayout();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });

    expect(requested).toEqual([]);
  });

  it('should warm nothing and never throw when the viewport cannot be measured', async () => {
    vi.stubGlobal('matchMedia', () => undefined);
    const { warmWorkspaceLayout } = await import('#routes/w.$workspace.$project/chat-interface-layouts.js');
    expect(() => {
      warmWorkspaceLayout();
    }).not.toThrow();

    vi.stubGlobal('matchMedia', () => {
      throw new Error('no viewport');
    });
    expect(() => {
      warmWorkspaceLayout();
    }).not.toThrow();
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
    expect(requested).toEqual([]);
  });

  it('should share one import between the warm-up and the render', async () => {
    stubViewport(false);
    const { loadChatInterfaceDesktop, warmWorkspaceLayout } =
      await import('#routes/w.$workspace.$project/chat-interface-layouts.js');

    warmWorkspaceLayout();
    const render = loadChatInterfaceDesktop();

    expect(loadChatInterfaceDesktop()).toBe(render);
    await render;
    expect(requested).toEqual(['desktop']);
  });

  it('should hand the warm-up and the render one failure, and import afresh after it', async () => {
    stubViewport(false);
    const importLayout = vi.fn(async () => {
      throw new Error('chunk unavailable');
    });
    importDesktop = importLayout;
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const { loadChatInterfaceDesktop, warmWorkspaceLayout } =
      await import('#routes/w.$workspace.$project/chat-interface-layouts.js');

    try {
      warmWorkspaceLayout();
      const render = loadChatInterfaceDesktop();
      await expect(render).rejects.toThrow();
      expect(importLayout).toHaveBeenCalledOnce();

      /* The failed import is forgotten: the next caller, a retry, gets a new import rather than the old failure. */
      const retry = loadChatInterfaceDesktop();
      expect(retry).not.toBe(render);
      await expect(retry).rejects.toThrow();
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
