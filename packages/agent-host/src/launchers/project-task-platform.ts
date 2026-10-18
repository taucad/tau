import type { AgentLauncher } from '#launchers/agent-launcher.js';
import type { AgentChannelSource } from '#launchers/agent-channel.js';
import type { ChatStore } from '#launchers/chat-store.js';
import type { ProjectTaskChannelPort } from '#wire/project-task-channel.schema.js';

/** Raw, exclusively owned project task journal storage. @public */
export type ProjectTaskStorage = Readonly<{
  read: () => Promise<Uint8Array<ArrayBuffer>>;
  append: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  truncate: (size: number) => Promise<void>;
  size: () => Promise<number>;
  exclusive: <Result>(section: () => Promise<Result>) => Promise<Result>;
  close: () => Promise<void>;
}>;

/** The elected project's channel and task authority. @public */
export type ProjectTaskOwner = Readonly<{
  source: AgentChannelSource;
  projectTasks: ProjectTaskChannelPort;
  stoppability: AgentLauncher['stoppability'];
  drain: (input: Readonly<{ signal: AbortSignal }>) => Promise<void>;
  close: () => Promise<void>;
}>;

/** Resources supplied only after the platform acquires project ownership. @public */
export type ProjectTaskOwnerInput = Readonly<{
  chats: ChatStore;
  storage: ProjectTaskStorage;
  signal: AbortSignal;
}>;

/** Constructor called once per fenced project term. @public */
export type OpenProjectTaskPlatformInput = Readonly<{
  projectId: string;
  createOwner: (input: ProjectTaskOwnerInput) => Promise<ProjectTaskOwner>;
}>;

declare const projectTaskPlatformBrand: unique symbol;

/** A platform that binds the task journal and chat writers to one project owner. @public */
export type ProjectTaskPlatform = Readonly<{
  [projectTaskPlatformBrand]: true;
  open: (input: OpenProjectTaskPlatformInput) => Promise<ProjectTaskOwner>;
}>;

/** Brand an environment-owned project task platform. @internal */
export const createProjectTaskPlatform = (open: ProjectTaskPlatform['open']): ProjectTaskPlatform => {
  const platform = { open };
  return platform as ProjectTaskPlatform;
};
