import type { ProjectNameAgentConfigInput } from '@taucad/chat';

/**
 * Assemble the per-request agent config for the project-name generator
 * profile. The profile is fully parameter-free (the API derives the name
 * purely from the trailing user message), so this hook exists as a
 * symmetry point with {@link useCadAgentConfig}: every chat client composes
 * through an assembler hook so the wire body stays a single edit point.
 * @public
 */
export const useProjectNameAgentConfig = (): ProjectNameAgentConfigInput => ({ profile: 'project_name' });
