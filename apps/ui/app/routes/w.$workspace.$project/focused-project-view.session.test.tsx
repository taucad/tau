/**
 * The shell's read of the focused project (A11): the focused editor session first, else the runtime's standalone
 * project, which the owned preview route publishes (programme-control ruling, 2026-11-15 20:42Z).
 */
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { createActor, createMachine } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { StandaloneProject } from '#runtime/standalone-project-port.js';

/* No project route: the owned preview's path (`/w/:workspace/:project/preview`) publishes no route state. */
vi.mock('#routes/w.$workspace.$project/project-route-state.js', () => ({
  useProjectRouteState: () => undefined,
}));
const registry = createActor(createMachine({ id: 'sessions', context: { sessions: new Map() } })).start();
vi.mock('#hooks/use-sessions.js', () => ({ useSessions: () => registry }));

const { useFocusedProjectSession } = await import('#routes/w.$workspace.$project/focused-project-view.session.js');
const { AppRuntimeProvider } = await import('#runtime/app-runtime-provider.js');
const { createAppRuntime } = await import('#runtime/app-runtime.js');
const { createFakeEnvironmentHost } = await import('#runtime/environment.fixture.js');
const { standaloneProjectPortOf } = await import('#runtime/standalone-project-port.js');

const runtimes: Array<ReturnType<typeof createAppRuntime>> = [];
afterEach(() => {
  for (const runtime of runtimes.splice(0)) {
    runtime.stop();
  }
});

describe('useFocusedProjectSession on the owned preview route (A11)', () => {
  it("reads the preview's project from the runtime port, and nothing once it is withdrawn", () => {
    const runtime = createAppRuntime({
      clock: new StepClock(),
      environment: () => createFakeEnvironmentHost(),
      idleFileManagers: true,
    });
    runtimes.push(runtime);
    const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
      <AppRuntimeProvider runtime={runtime}>{children}</AppRuntimeProvider>
    );
    const { result } = renderHook(() => useFocusedProjectSession(), { wrapper });
    expect(result.current).toBeUndefined();

    /* The shell only hands these on; the hook reads neither. */
    const preview: StandaloneProject = {
      projectId: 'proj_preview',
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the hook hands the file manager on unread, so any started actor stands in
      fileManagerRef: createActor(createMachine({ id: 'preview-files' })).start() as unknown as FileManagerRef,
      runtime: undefined,
    };
    let withdraw: () => void = () => undefined;
    act(() => {
      withdraw = standaloneProjectPortOf(runtime).publish(preview);
    });
    expect(result.current).toBe(preview);

    act(() => {
      withdraw();
    });
    expect(result.current).toBeUndefined();
  });
});
