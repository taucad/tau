import { createAgentLauncher } from '@taucad/agent-host/launcher';
import type {
  AgentChannelSource,
  AgentLauncherOptions,
  ProjectTaskOwner,
  ProjectTaskPlatform,
} from '@taucad/agent-host/launcher';
import type { FileSystemProvider } from '@taucad/filesystem';

import { createProjectTaskComposition } from '#project-tasks/core.js';
import type {
  ProjectTaskCandidate as Candidate,
  ProjectTaskCandidateInput as CandidateInput,
} from '#project-tasks/core.js';

/** Candidate allocation request sent to the revision owner. @public */
export type ProjectTaskCandidateInput = CandidateInput;
/** Trusted candidate identity returned by the revision owner. @public */
export type ProjectTaskCandidate = Candidate;

/** Browser-safe project task host inputs. @public */
export type ProjectTaskHostOptions = Readonly<{
  projectId: string;
  platform: ProjectTaskPlatform;
  launcher: Omit<AgentLauncherOptions, 'chats' | 'turnPlacement'> &
    Readonly<{ turnPlacement: NonNullable<AgentLauncherOptions['turnPlacement']> }>;
  filesystem: Required<Pick<FileSystemProvider, 'exists' | 'readFile' | 'readFileStream' | 'writeFileChecked'>>;
  createCandidate: (input: ProjectTaskCandidateInput) => Promise<ProjectTaskCandidate>;
  resolveModel?:
    | ((
        input: Readonly<{ modelId: string; signal: AbortSignal }>,
      ) => Promise<NonNullable<AgentLauncherOptions['model']> | undefined>)
    | undefined;
  /** Called only after the candidate run settled and its placement lease retired. */
  onCandidateReleased?: ((runId: string, checkoutId: string) => void | Promise<void>) | undefined;
}>;

/** One elected project task authority and its existing channel source. @public */
export type ProjectTaskHost = ProjectTaskOwner;

/**
 * Open the shared task authority under the browser platform's project ownership.
 *
 * @param options - Project identity, launcher, canonical filesystem and revision allocator.
 * @returns The elected owner with its task channel and drain lifecycle.
 * @public
 */
export const createProjectTaskHost = async (options: ProjectTaskHostOptions): Promise<ProjectTaskHost> =>
  options.platform.open({
    projectId: options.projectId,
    createOwner: async ({ chats, storage, signal }) => {
      const core = createProjectTaskComposition({
        projectId: options.projectId,
        filesystem: options.filesystem,
        createCandidate: options.createCandidate,
        systemPrompt: options.launcher.systemPrompt,
        model: options.launcher.model,
        resolveModel: options.resolveModel,
        admitting: () => !signal.aborted,
        onCandidateReleased: options.onCandidateReleased,
        signal,
      });
      const launcher = createAgentLauncher({
        ...options.launcher,
        chats,
        toolRegistry: core.decorateTools(options.launcher.toolRegistry),
        turnPlacement: core.wrapPlacement(options.launcher.turnPlacement),
        admitting: () => !signal.aborted,
      });
      core.bindLauncher(launcher);
      try {
        await core.initialize(storage);
      } catch (error) {
        await launcher.close();
        throw error;
      }
      const source: AgentChannelSource = {
        execute: core.execute,
        read: launcher.read,
        catchUp: launcher.catchUp,
        liveEvents: launcher.liveEvents,
        host: {
          ledger: launcher.host.ledger,
          snapshot: launcher.host.snapshot,
          waitForAdmission: launcher.host.waitForAdmission,
        },
      };
      let closing: Promise<void> | undefined;
      return {
        source,
        projectTasks: core.projectTasks,
        stoppability: launcher.stoppability,
        drain: async ({ signal: drainSignal }) => core.drain(drainSignal),
        close: async () => {
          closing ??= (async () => {
            const retry = await core.closeBeforeLauncher();
            await launcher.close();
            await core.closeAfterLauncher(retry);
          })();
          const attempt = closing;
          try {
            await attempt;
          } catch (error) {
            if (closing === attempt) {
              closing = undefined;
            }
            throw error;
          }
        },
      };
    },
  });
