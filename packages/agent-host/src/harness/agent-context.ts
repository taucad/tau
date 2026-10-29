import type { Agent, AgentMessage } from '@earendil-works/pi-agent-core';
import { createInitialSystemMessage, toToolDeclaration } from '@earendil-works/pi-ai';

/**
 * Rebuild Pi's leading system entry when Tau installs its canonical history.
 * @param agent - Agent whose tool declarations remain authoritative.
 * @param messages - Canonical conversation to install.
 * @param systemPrompt - Effective instruction text for the next request.
 * @returns A fresh history with the leading system/tool declaration entry.
 * @internal
 */
export const agentHistory = (
  agent: Agent,
  messages: readonly AgentMessage[],
  systemPrompt = agent.state.systemPrompt,
): AgentMessage[] => {
  const system = createInitialSystemMessage(
    systemPrompt,
    agent.state.tools.map((tool) => toToolDeclaration(tool)),
  );
  return [...(system ? [system] : []), ...messages.filter((message) => message.role !== 'system')];
};
