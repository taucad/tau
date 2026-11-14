/**
 * First-fault recording (MC-R12, charter D23, plan B2) for the project runtime's root and the two machines it composes.
 */
import { describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic, setup } from 'xstate';
import type { AnyStateMachine } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { editorIgnoredEvents, editorMachine, reportEditorFault } from '#machines/editor.machine.js';
import { projectIgnoredEvents, projectMachine, reportProjectFault } from '#machines/project.machine.js';
import { projectRuntimeMachine, selectProjectRuntimeFault } from '#runtime/project-runtime.js';
import type {
  ManifestObservationEvent,
  ProjectChildInput,
  ProjectRuntimeFileManager,
} from '#runtime/project-runtime.js';
import type { MachineActors } from '@taucad/ui-core/lib/xstate.lib';

const reporter = vi.hoisted(() => ({ reportUiError: vi.fn(async () => undefined) }));
vi.mock('#lib/error-reporting.js', () => reporter);
/* The app runtime's one fault hook (D23), which the composed machines and the runtime root report through. */
const runtimeFaults = vi.hoisted(() => ({ reportAppRuntimeFault: vi.fn() }));
vi.mock('#runtime/app-runtime-faults.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#runtime/app-runtime-faults.js')>()),
  reportAppRuntimeFault: runtimeFaults.reportAppRuntimeFault,
}));

type RootErrorHandler = (
  args: Readonly<{ context: unknown; event: Readonly<{ type: string; error: unknown }> }>,
  enq: unknown,
) => unknown;

const projectId = 'proj_aaaaaaaaaaaaaaaaaaaaa';

const createFileManager = (): ProjectRuntimeFileManager['fileManagerRef'] => {
  const actor = createActor(setup({}).createMachine({ id: 'fake-file-manager', context: { rootDirectory: '/' } }));
  actor.start();
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a stand-in the project never reaches in these rows.
  return actor as unknown as ProjectRuntimeFileManager['fileManagerRef'];
};

describe('the root onError of the composed machines', () => {
  const owners: ReadonlyArray<readonly [name: string, machine: AnyStateMachine]> = [
    ['project', projectMachine],
    ['editor', editorMachine],
    ['project-runtime', projectRuntimeMachine],
  ];

  it.each(owners)('%s should record the first defect, keep it over later ones and name no target', (_name, machine) => {
    const { onError } = machine.config as { onError?: RootErrorHandler };
    expect(onError).toBeTypeOf('function');
    const enq = vi.fn();
    expect(onError!({ context: {}, event: { type: 'xstate.error.execution', error: new Error('boom') } }, enq)).toEqual(
      {
        context: { fault: 'boom' },
      },
    );
    expect(
      onError!(
        { context: { fault: 'boom' }, event: { type: 'xstate.error.communication', error: { message: 'later' } } },
        enq,
      ),
    ).toEqual({ context: { fault: 'boom' } });
  });

  it.each([
    ['project', projectMachine, reportProjectFault],
    ['editor', editorMachine, reportEditorFault],
  ] as const)('%s should report the first fault once and no later one', (_name, machine, report) => {
    const { onError } = machine.config as { onError?: RootErrorHandler };
    const enq = vi.fn();
    const first = new Error('boom');
    onError!({ context: { fault: undefined }, event: { type: 'xstate.error.execution', error: first } }, enq);
    expect(enq.mock.calls).toEqual([[report, first]]);
    onError!({ context: { fault: 'boom' }, event: { type: 'xstate.error.actor', error: new Error('later') } }, enq);
    expect(enq).toHaveBeenCalledTimes(1);
    // The named effect hands the fault to the app's error reporter.
    reporter.reportUiError.mockClear();
    report(first);
    expect(reporter.reportUiError.mock.calls).toEqual([[first]]);
  });

  it("should report a running project's first fault once through the error reporter, and no later one", () => {
    const guard = guardActors({ ignore: { project: projectIgnoredEvents } });
    reporter.reportUiError.mockClear();
    const first = new Error('the log child failed');
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a failing stand-in for the log child.
    const failingLogs = createCallbackLogic(() => {
      throw first;
    }) as unknown as MachineActors<typeof projectMachine>['logs'];
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a failing stand-in for the model interaction child.
    const failingInteraction = createCallbackLogic(() => {
      throw new Error('a later child failed');
    }) as unknown as MachineActors<typeof projectMachine>['modelInteraction'];
    const actor = createActor(
      projectMachine.provide({
        actors: { logs: failingLogs, modelInteraction: failingInteraction },
        guards: { isNotBrowser: () => false, shouldAutoLoad: () => false },
      }),
      {
        clock: new StepClock(),
        inspect: guard.inspect,
        input: { projectId, fileManagerRef: createFileManager(), fileSystemRoot: '/', kernelOptionsFactory: vi.fn() },
      },
    );
    actor.start();
    expect(guard.take('fault').length).toBeGreaterThanOrEqual(2);
    expect(actor.getSnapshot().context.fault).toBe('the log child failed');
    expect(reporter.reportUiError.mock.calls).toEqual([[first]]);
    actor.stop();
  });

  it('should keep the project running and answering after a child fails', () => {
    const guard = guardActors({ ignore: { project: projectIgnoredEvents } });
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a failing stand-in for the log child.
    const failingLogs = createCallbackLogic(() => {
      throw new Error('the log child failed');
    }) as unknown as MachineActors<typeof projectMachine>['logs'];
    const actor = createActor(
      projectMachine.provide({
        actors: { logs: failingLogs },
        guards: { isNotBrowser: () => false, shouldAutoLoad: () => false },
      }),
      {
        clock: new StepClock(),
        inspect: guard.inspect,
        input: { projectId, fileManagerRef: createFileManager(), fileSystemRoot: '/', kernelOptionsFactory: vi.fn() },
      },
    );
    actor.start();
    expect(actor.getSnapshot().status).toBe('active');
    expect(actor.getSnapshot().context.fault).toBe('the log child failed');
    expect(guard.take('fault')).toHaveLength(1);
    actor.send({ type: 'reloadProject' });
    expect(actor.getSnapshot().matches('loading')).toBe(true);
    actor.stop();
  });
});

describe('the project runtime root', () => {
  it('should record a child fault once and keep the first', () => {
    const guard = guardActors({ ignore: { project: projectIgnoredEvents, editor: editorIgnoredEvents } });
    const actor = createActor(
      projectRuntimeMachine.provide({
        actors: {
          project: projectMachine.provide({ guards: { isNotBrowser: () => false, shouldAutoLoad: () => false } }),
          parameterObservers: createCallbackLogic<{ type: 'never' }, ProjectChildInput>(() => {
            throw new Error('the first child failed');
          }),
          manifestObservation: createCallbackLogic<ManifestObservationEvent, ProjectChildInput>(() => {
            throw new Error('a later child failed');
          }),
        },
      }),
      {
        clock: new StepClock(),
        inspect: guard.inspect,
        input: {
          projectId,
          profile: 'shared',
          project: {
            projectId,
            fileManagerRef: createFileManager(),
            fileSystemRoot: '/',
            kernelOptionsFactory: vi.fn(),
          },
          editor: { projectId },
        },
      },
    );
    actor.start();
    expect(actor.getSnapshot().status).toBe('active');
    // Each failed child's own onError records it, and the second does not replace the first.
    expect(selectProjectRuntimeFault(actor.getSnapshot())).toBe('the first child failed');
    actor.send({ type: 'manifestObservationChanged', error: 'closed' });
    expect(actor.getSnapshot().context.manifestObservationError).toBe('closed');
    actor.stop();
  });

  it('should record a single child fault once', () => {
    const guard = guardActors({ ignore: { project: projectIgnoredEvents, editor: editorIgnoredEvents } });
    const actor = createActor(
      projectRuntimeMachine.provide({
        actors: {
          project: projectMachine.provide({ guards: { isNotBrowser: () => false, shouldAutoLoad: () => false } }),
          resources: createCallbackLogic<{ type: 'never' }, ProjectChildInput>(() => {
            throw new Error('the resources child failed');
          }),
        },
      }),
      {
        clock: new StepClock(),
        inspect: guard.inspect,
        input: {
          projectId,
          profile: 'editor',
          project: {
            projectId,
            fileManagerRef: createFileManager(),
            fileSystemRoot: '/',
            kernelOptionsFactory: vi.fn(),
          },
          editor: { projectId },
        },
      },
    );
    actor.start();
    expect(selectProjectRuntimeFault(actor.getSnapshot())).toBe('the resources child failed');
    actor.stop();
  });
});

/* A6b: the interim reporter of A6a (`reportUiError` behind each machine's own effect) is replaced by the app runtime's
 * single D23 hook, and the project runtime root reports its first child fault through it once. */
describe('the single D23 fault hook (A6b)', () => {
  /** Run what a root `onError` enqueued, as the interpreter would. */
  const runEnqueued = (fn: (...args: unknown[]) => void, ...args: unknown[]): void => {
    fn(...args);
  };

  it.each([
    ['project', projectMachine],
    ['editor', editorMachine],
  ] as const)("D23: %s reports its first fault through the app runtime's fault hook once", (_name, machine) => {
    runtimeFaults.reportAppRuntimeFault.mockClear();
    const { onError } = machine.config as { onError?: RootErrorHandler };
    const first = new Error('boom');
    onError!({ context: { fault: undefined }, event: { type: 'xstate.error.execution', error: first } }, runEnqueued);
    onError!(
      { context: { fault: 'boom' }, event: { type: 'xstate.error.actor', error: new Error('later') } },
      runEnqueued,
    );
    expect(runtimeFaults.reportAppRuntimeFault.mock.calls).toEqual([[first]]);
  });

  it("D23: the project runtime root reports its first child fault through the app runtime's fault hook once", () => {
    runtimeFaults.reportAppRuntimeFault.mockClear();
    const guard = guardActors({ ignore: { project: projectIgnoredEvents, editor: editorIgnoredEvents } });
    const first = new Error('the first child failed');
    const actor = createActor(
      projectRuntimeMachine.provide({
        actors: {
          project: projectMachine.provide({ guards: { isNotBrowser: () => false, shouldAutoLoad: () => false } }),
          parameterObservers: createCallbackLogic<{ type: 'never' }, ProjectChildInput>(() => {
            throw first;
          }),
          manifestObservation: createCallbackLogic<ManifestObservationEvent, ProjectChildInput>(() => {
            throw new Error('a later child failed');
          }),
        },
      }),
      {
        clock: new StepClock(),
        inspect: guard.inspect,
        input: {
          projectId,
          profile: 'shared',
          project: {
            projectId,
            fileManagerRef: createFileManager(),
            fileSystemRoot: '/',
            kernelOptionsFactory: vi.fn(),
          },
          editor: { projectId },
        },
      },
    );
    actor.start();
    expect(selectProjectRuntimeFault(actor.getSnapshot())).toBe('the first child failed');
    expect(runtimeFaults.reportAppRuntimeFault.mock.calls).toEqual([[first]]);
    actor.stop();
  });
});
