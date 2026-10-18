/** Commands handled by the project task host. */
export type ProjectTaskActions = Readonly<{
  send: (taskId: string, text: string) => Promise<void>;
  cancel: (taskId: string) => Promise<void>;
  resume: (taskId: string) => Promise<void>;
}>;
