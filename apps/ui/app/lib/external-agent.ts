/**
 * The words a surface uses for an external agent's refusal.
 *
 * The descriptor itself (`externalAgentDescriptorSchema`) is wire vocabulary
 * and lives in `@taucad/agent-host` beside the refusal codes, so every tier
 * parses one schema (VSC1, VI9); this module only owns the copy.
 */

import type { ExternalAgentRefusalCode } from '@taucad/agent-host';

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
/* eslint-enable @typescript-eslint/naming-convention -- end refusal codes */
