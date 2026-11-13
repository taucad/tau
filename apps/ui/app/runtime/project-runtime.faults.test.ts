/**
 * First-fault recording (MC-R12, charter D23, plan B2) for the project runtime's root and the two machines it composes.
 */
import { describe, expect, it, vi } from 'vitest';
import { createActor, createCallbackLogic, setup } from 'xstate';
import type { AnyStateMachine } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import { guardActors } from '@taucad/xstate-testing/inspect';
import { editorIgnoredEvents, editorMachine } from '#machines/editor.machine.js';
import { projectIgnoredEvents, projectMachine } from '#machines/project.machine.js';
import { projectRuntimeMachine, selectProjectRuntimeFault } from '#runtime/project-runtime.js';
import type {
  ManifestObservationEvent,
  ProjectChildInput,
  ProjectRuntimeFileManager,
} from '#runtime/project-runtime.js';
import type { MachineActors } from '@taucad/ui-core/lib/xstate.lib';

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
    expect(onError!({ context: {}, event: { type: 'xstate.error.execution', error: new Error('boom') } }, {})).toEqual({
      context: { fault: 'boom' },
    });
    expect(
      onError!(
        { context: { fault: 'boom' }, event: { type: 'xstate.error.communication', error: { message: 'later' } } },
        {},
      ),
    ).toEqual({ context: { fault: 'boom' } });
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
    guard.take();
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
    expect(selectProjectRuntimeFault(actor.getSnapshot())).toBe('the first child failed');
    const faults = guard
      .take('fault')
      .filter((finding) => finding.kind === 'fault' && finding.machineId === 'project-runtime');
    // One finding per failed child: each fault is recorded once, and the second does not replace the first.
    expect(faults).toHaveLength(2);
    expect(selectProjectRuntimeFault(actor.getSnapshot())).toBe('the first child failed');
    actor.send({ type: 'manifestObservationChanged', error: 'closed' });
    expect(actor.getSnapshot().context.manifestObservationError).toBe('closed');
    actor.stop();
    guard.take();
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
    expect(
      guard.take('fault').filter((finding) => finding.kind === 'fault' && finding.machineId === 'project-runtime'),
    ).toHaveLength(1);
    expect(selectProjectRuntimeFault(actor.getSnapshot())).toBe('the resources child failed');
    actor.stop();
    guard.take();
  });
});
