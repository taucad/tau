import type { AgentChannelAdmissionConfig } from '@taucad/agent-host/wire';
import { toolName, toolNames } from '@taucad/chat/constants';

/** Capture delegation opt-out in a new command; existing commands retain their admitted grant. */
export const projectThreadGrant = (
  config: AgentChannelAdmissionConfig,
  isEnabled: boolean,
): AgentChannelAdmissionConfig =>
  isEnabled
    ? config
    : { ...config, allowedTools: (config.allowedTools ?? toolNames).filter((name) => name !== toolName.taskSpawn) };
