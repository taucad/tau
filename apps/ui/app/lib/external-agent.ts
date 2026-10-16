/**
 * The words a surface uses for an external agent's refusal.
 *
 * The descriptor itself (`externalAgentDescriptorSchema`) is wire vocabulary
 * and lives in `@taucad/agent-host` beside the refusal codes, so every tier
 * parses one schema (VSC1, VI9); this module only owns the copy.
 */

import type { ExternalAgentRefusalCode } from '@taucad/agent-host/wire';

/** Why a refused agent cannot run, in the words the user reads. @public */
/* eslint-disable @typescript-eslint/naming-convention -- keys are the wire's own refusal codes */
export const externalAgentRefusalReasons: Readonly<Record<ExternalAgentRefusalCode, string>> = {
  ADAPTER_NOT_INSTALLED: 'Its adapter is not installed on that host',
  ADAPTER_NO_BIN: 'Its adapter cannot be started on that host',
  CLI_NOT_FOUND: 'Its command-line tool is not installed on that host',
  CLI_TOO_OLD: 'Its command-line tool is too old for that host',
  EXTERNAL_AGENT_AUTH_REQUIRED: 'You are not logged in to it on that host',
  EXTERNAL_AGENT_MODEL_UNAVAILABLE: 'It does not offer the model this chat asked for',
  EXTERNAL_AGENT_UNAVAILABLE: 'That host cannot start it right now',
  EXTERNAL_AGENT_CONTENT_UNSUPPORTED: 'It cannot read the content this turn carries',
};

/** The shell family a host's fix command is written for. @public */
export type ExternalAgentHostShell = 'posix' | 'windows';

/* ponytail: a UI-side table for the pinned adapters; move it onto the
 * descriptor (the host knows each adapter's CLI) when another agent lands.
 * Only commands each vendor documents are listed; a pair is one command per
 * host shell. */
const fixCommands: Readonly<
  Record<string, Partial<Record<ExternalAgentRefusalCode, string | Readonly<Record<ExternalAgentHostShell, string>>>>>
> = {
  claude: {
    /* Anthropic's setup page leads with the native installer and lists npm
     * under advanced options. */
    CLI_NOT_FOUND: {
      posix: 'curl -fsSL https://claude.ai/install.sh | bash',
      windows: 'irm https://claude.ai/install.ps1 | iex',
    },
    CLI_TOO_OLD: 'claude update',
    EXTERNAL_AGENT_AUTH_REQUIRED: 'claude auth login',
  },
  codex: {
    CLI_NOT_FOUND: 'npm install -g @openai/codex',
    CLI_TOO_OLD: 'npm install -g @openai/codex@latest',
    EXTERNAL_AGENT_AUTH_REQUIRED: 'codex login',
  },
};
/* eslint-enable @typescript-eslint/naming-convention -- end refusal codes */

/**
 * The command that clears a refusal, when there is one to give; otherwise the
 * surface shows the reason and the code alone.
 *
 * @param agentId - The descriptor's agent id.
 * @param refusal - The host's refusal code.
 * @param shell - The shell the host runs commands in; POSIX unless it is Windows.
 * @returns A copyable command, or `undefined`.
 * @public
 */
export const externalAgentFixCommand = (
  agentId: string,
  refusal: ExternalAgentRefusalCode,
  shell: ExternalAgentHostShell = 'posix',
): string | undefined => {
  const command = fixCommands[agentId]?.[refusal];
  return typeof command === 'string' ? command : command?.[shell];
};
