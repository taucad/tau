/**
 * `KernelModelView` — multi-client-from-one-spec dogfood test.
 *
 * Background: docs Replicad reference renders five `KernelModelView`
 * components, each driving its own `useRender` against the **same**
 * module-level `kernelModelViewClientOptions` spec. Before PR1 the
 * inline `fromMemoryFs()` aliased one shared `Map<string, ...>` across
 * all five `RuntimeClient`s, so whichever component opened last
 * overwrote `'main.ts'` for every other component (the vase-rendering-
 * inside-hollow-box symptom).
 *
 * Structural fix (PR1): the inline `RuntimeFileSystemHandle` is a
 * per-binding factory, so each `RuntimeClient` mints its own isolated
 * base from the shared spec. This component-level test pins the
 * dogfooded shape:
 *
 *   - The component declares its `clientOptions` at **module scope**
 *     (one allocation per app process, shared across every render).
 *   - Mounting N sibling `KernelModelView`s passes the **same**
 *     `clientOptions` reference to every `useRender` call.
 *   - Each `useRender` call receives a **distinct** `code` payload
 *     wrapped under the canonical `'main.ts'` entry key.
 *
 * The runtime-level "fresh `RuntimeFileSystemBase` per client"
 * invariant is pinned separately in
 * `packages/runtime/src/transport/multi-client-fs-isolation.test.ts`.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createContext } from 'react';

afterEach(() => {
  cleanup();
});

type CapturedUseRenderCall = {
  readonly clientOptions: unknown;
  readonly code: unknown;
  readonly enabled: boolean;
};

const capturedUseRenderCalls: CapturedUseRenderCall[] = [];

type RenderStatus = 'idle' | 'loading' | 'success' | 'error';
const idleStatus: RenderStatus = 'idle';

vi.mock('@taucad/react', () => ({
  useRender: ({
    clientOptions,
    code,
    enabled,
  }: {
    clientOptions: unknown;
    code: unknown;
    enabled: boolean;
  }): { geometries: unknown[]; status: RenderStatus; error: undefined } => {
    capturedUseRenderCalls.push({ clientOptions, code, enabled });
    return { geometries: [], status: idleStatus, error: undefined };
  },
}));

/* Stub the shared-renderer hook out — `KernelModelView` uses it inside
 * a `useCallback` that's never invoked because `useRender` is mocked
 * and never returns geometry. The provider is replaced with a context
 * that supplies a no-op renderer object satisfying the `useContext`
 * non-undefined check. */
const noopRender = (): undefined => undefined;
const noopDispose = (): undefined => undefined;

vi.mock('#components/docs/shared-renderer.js', () => {
  const StubContext = createContext<unknown>({ render: noopRender, dispose: noopDispose });
  return {
    SharedRendererProvider: ({ children }: { children: React.ReactNode }): React.ReactNode => children,
    useSharedRenderer: (): { render: typeof noopRender; dispose: typeof noopDispose } => ({
      render: noopRender,
      dispose: noopDispose,
    }),
    /* Marker class — the source module exports a `SharedRenderer`
     * value used only as a typeof guard in callers. The vitest mock
     * needs a stand-in; an empty class is the minimal shape. */
    // oxlint-disable-next-line @typescript-eslint/no-extraneous-class -- shared-renderer source exports a class; the mock mirrors the export shape
    SharedRenderer: class StubSharedRenderer {
      public stub = true;
    },
    SharedRendererContext: StubContext,
  };
});

/* OrbitControls and GLTFLoader pull in three.js add-ons that have heavy
 * side effects in jsdom. Stub them at the import boundary so the
 * component tree can mount without exercising the real Three.js stack. */
const noop = (): void => undefined;

vi.mock('three/addons/controls/OrbitControls.js', () => ({
  OrbitControls: class {
    public addEventListener = noop;
    public removeEventListener = noop;
    public dispose = noop;
    public update = noop;
    public readonly target = { copy: noop };
  },
}));

vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  // eslint-disable-next-line @typescript-eslint/naming-convention -- mock target name matches the upstream three.js export
  GLTFLoader: class {
    public async parseAsync(): Promise<{ scene: unknown }> {
      return { scene: {} };
    }
  },
}));

const { KernelModelView } = await import('./kernel-model-view.js');

describe('KernelModelView — multi-client-from-one-spec dogfood', () => {
  it('passes the same module-level clientOptions reference to every useRender invocation', () => {
    capturedUseRenderCalls.length = 0;

    const codeA = 'export default () => "A";';
    const codeB = 'export default () => "B";';
    const codeC = 'export default () => "C";';

    render(
      <>
        <KernelModelView code={codeA} />
        <KernelModelView code={codeB} />
        <KernelModelView code={codeC} />
      </>,
    );

    /* React 19's StrictMode is off in this test; one `useRender` call
     * per mount. (We assert ≥ N to be resilient to future StrictMode
     * double-invocation; reference-identity check below is the
     * structural assertion.) */
    expect(capturedUseRenderCalls.length).toBeGreaterThanOrEqual(3);

    const [first, second, third] = capturedUseRenderCalls;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(third).toBeDefined();

    /* Module-level options dogfood: all instances share one
     * `createRuntimeClientOptions(...)` reference. If anyone ever
     * regresses by lifting the spec into a `useMemo` inside the
     * component, this assertion breaks loudly — the antipattern bullet
     * in `docs/policy/library-api-policy.md` §23 is enforced here. */
    expect(first!.clientOptions).toBe(second!.clientOptions);
    expect(second!.clientOptions).toBe(third!.clientOptions);

    /* Each instance forwards its own `code` payload — no cross-prop
     * leakage between siblings. (The runtime FS isolation that
     * prevents cross-`Map` writes is pinned in
     * `multi-client-fs-isolation.test.ts`; here we only assert the
     * input plumbing.) */
    const mainEntryKey = 'main.ts';
    expect(first!.code).toEqual({ [mainEntryKey]: codeA });
    expect(second!.code).toEqual({ [mainEntryKey]: codeB });
    expect(third!.code).toEqual({ [mainEntryKey]: codeC });
  });
});
