/**
 * `ProjectProvider` over a leased project runtime (app state orchestration plan § 4 A6b; inventory S11, S40; B3).
 *
 * The provider creates nothing: it reads a project runtime from the app runtime's lease store, keyed by its mount and
 * its kernel selection, and exposes that runtime's actors. So a StrictMode remount keeps one runtime, an unmount
 * releases it after the lease grace on the runtime's clock instead of stopping it at once (B3), and the producer set a
 * flush walks is the runtime's, which a runtime child registers in without a mount (S40).
 */
import { StrictMode, act } from 'react';
import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createActor, createMachine } from 'xstate';
import { StepClock, flush } from '@taucad/xstate-testing/clock';
import { afterEach, describe, expect, it, vi } from 'vitest';

const fileManager = vi.hoisted(() => ({ current: undefined as unknown }));

/* The project's file manager, which the session subtree's provider hands down; it never becomes ready here. */
vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => fileManager.current,
}));
/* Main's provider reads the library through this hook; the runtime's provider reads the runtime's library. */
vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    projectManagerRef: createActor(createMachine({ id: 'idle-project-manager' })).start(),
    touchProject: async () => undefined,
    getChatRecordsForResource: async () => [],
    createNavigationRepairChat: async () => ({ id: 'chat_never' }),
  }),
}));
vi.mock('#hooks/object-store.worker.js?worker', () => ({
  default: class MockWorker {
    public terminate = vi.fn();
  },
}));

const { ProjectProvider, useProject } = await import('#hooks/use-project.js');
const { AppRuntimeProvider } = await import('#runtime/app-runtime-provider.js');
const { createAppRuntime, selectRuntimeQueryClient } = await import('#runtime/app-runtime.js');
const { createFakeEnvironmentHost } = await import('#runtime/environment.fixture.js');
const { leaseGraceMilliseconds } = await import('#runtime/leases.machine.js');

type ProjectContextValue = ReturnType<typeof useProject>;

const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';

/** A file manager that never becomes ready, and a parameter client the test can replace. */
const createFileManagerFixture = () => {
  const fileManagerRef = createActor(
    createMachine({ id: 'fixture-file-manager', context: { rootDirectory: `/projects/${projectId}` } }),
  ).start();
  const parameterFiles = { readFile: vi.fn(), exists: vi.fn() };
  return {
    fileManagerRef,
    parameterFiles,
    contentService: undefined,
    watchRecordFile: vi.fn(() => ({
      ready: Promise.resolve(),
      closed: Promise.withResolvers<void>().promise,
      dispose: () => undefined,
    })),
  };
};

const runtimes: Array<ReturnType<typeof createAppRuntime>> = [];

const createRuntime = (clock: StepClock): ReturnType<typeof createAppRuntime> => {
  const runtime = createAppRuntime({ clock, environment: () => createFakeEnvironmentHost(), idleFileManagers: true });
  runtimes.push(runtime);
  return runtime;
};

afterEach(() => {
  for (const runtime of runtimes.splice(0)) {
    runtime.stop();
  }
});

function Probe({ seen }: { readonly seen: ProjectContextValue[] }): undefined {
  seen.push(useProject());
  return undefined;
}

const tree = (runtime: ReturnType<typeof createAppRuntime>, children: ReactNode): React.JSX.Element => (
  <AppRuntimeProvider runtime={runtime}>
    <QueryClientProvider client={selectRuntimeQueryClient(runtime)}>{children}</QueryClientProvider>
  </AppRuntimeProvider>
);

describe('ProjectProvider over a leased project runtime (A6b)', () => {
  it('B3: keeps the project actor running through an unmount until the lease grace passes, then stops it', async () => {
    fileManager.current = createFileManagerFixture();
    const clock = new StepClock();
    const runtime = createRuntime(clock);
    const seen: ProjectContextValue[] = [];
    const view = render(
      tree(
        runtime,
        <ProjectProvider projectId={projectId} profile='shared'>
          <Probe seen={seen} />
        </ProjectProvider>,
      ),
    );
    await act(flush);
    const { projectRef, editorRef } = seen.at(-1)!;
    expect(projectRef.getSnapshot().status).toBe('active');

    view.unmount();
    await act(flush);
    // B3: an unmount releases the lease; the runtime keeps its actors until the grace passes.
    expect(projectRef.getSnapshot().status).toBe('active');
    expect(editorRef.getSnapshot().status).toBe('active');

    await act(async () => {
      clock.advance(leaseGraceMilliseconds);
      await flush();
    });
    expect(projectRef.getSnapshot().status).toBe('stopped');
    expect(editorRef.getSnapshot().status).toBe('stopped');
  });

  it('keeps one project runtime across a StrictMode remount', async () => {
    fileManager.current = createFileManagerFixture();
    const clock = new StepClock();
    const runtime = createRuntime(clock);
    const seen: ProjectContextValue[] = [];
    render(
      tree(
        runtime,
        <StrictMode>
          <ProjectProvider projectId={projectId} profile='shared'>
            <Probe seen={seen} />
          </ProjectProvider>
        </StrictMode>,
      ),
    );
    await act(async () => {
      await flush();
      clock.advance(leaseGraceMilliseconds);
      await flush();
    });
    const { projectRef } = seen.at(-1)!;
    expect(projectRef.getSnapshot().status).toBe('active');
    expect(new Set(seen.slice(-2).map((value) => value.projectRef)).size).toBe(1);
  });

  it('leases a fresh project runtime when the session remounts the provider for a new kernel selection', async () => {
    fileManager.current = createFileManagerFixture();
    const clock = new StepClock();
    const runtime = createRuntime(clock);
    const seen: ProjectContextValue[] = [];
    const page = (selection: string): React.JSX.Element =>
      tree(
        runtime,
        <ProjectProvider key={selection} projectId={projectId} profile='shared'>
          <Probe seen={seen} />
        </ProjectProvider>,
      );
    const view = render(page('local:0:0'));
    await act(flush);
    const first = seen.at(-1)!.projectRef;
    view.rerender(page('device_1:1'));
    await act(flush);
    const second = seen.at(-1)!.projectRef;
    // Today's rebuild on a kernel selection change is kept: the remount builds a new runtime, not the one in its grace.
    expect(second).not.toBe(first);
    expect(second.getSnapshot().status).toBe('active');
  });

  it('S40: flushes a producer that registered in the runtime producer set without a mount', async () => {
    fileManager.current = createFileManagerFixture();
    const clock = new StepClock();
    const runtime = createRuntime(clock);
    const seen: ProjectContextValue[] = [];
    render(
      tree(
        runtime,
        <ProjectProvider projectId={projectId} profile='shared'>
          <Probe seen={seen} />
        </ProjectProvider>,
      ),
    );
    await act(flush);
    const context = seen.at(-1)! as ProjectContextValue & {
      projectRuntime?: { producers: { register: (flush: () => Promise<void>) => () => void } };
    };
    // The set belongs to the runtime (D26, R3-F5): a runtime child reaches it with no React in between.
    expect(context.projectRuntime?.producers).toBeDefined();
    const producer = vi.fn(async () => undefined);
    const unregister = context.projectRuntime!.producers.register(producer);
    // The provider's function keeps its signature and walks the runtime's set.
    await context.flushWorkbenchRecordProducers();
    expect(producer).toHaveBeenCalledTimes(1);
    unregister();
    await context.flushWorkbenchRecordProducers();
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the runtime's parameter service when the provider's file manager replaces its parameter client", async () => {
    const fixture = createFileManagerFixture();
    fileManager.current = fixture;
    const clock = new StepClock();
    const runtime = createRuntime(clock);
    const seen: ProjectContextValue[] = [];
    const page = (): React.JSX.Element =>
      tree(
        runtime,
        <ProjectProvider projectId={projectId} profile='shared'>
          <Probe seen={seen} />
        </ProjectProvider>,
      );
    const view = render(page());
    await act(flush);
    const before = seen.at(-1)!.parameterService;
    const close = vi.spyOn(before, 'close');

    // A new bridge opener: the file manager hands down a new parameter client (A6a R-b feeds it from the provider).
    fileManager.current = { ...fixture, parameterFiles: { readFile: vi.fn(), exists: vi.fn() } };
    view.rerender(page());
    await act(flush);
    const after = seen.at(-1)!.parameterService;
    expect(after).not.toBe(before);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
