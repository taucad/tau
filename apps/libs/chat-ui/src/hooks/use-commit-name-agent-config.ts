import type { CommitNameAgentConfigInput } from '@taucad/chat';

/**
 * Assemble the per-request agent config for the commit-name generator
 * profile. Like {@link useProjectNameAgentConfig}, this is parameter-free.
 * @public
 */
export const useCommitNameAgentConfig = (): CommitNameAgentConfigInput => ({ profile: 'commit_name' });
