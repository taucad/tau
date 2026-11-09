/**
 * Which tool calls are an agent asking the person a question.
 *
 * Tau's own agent asks through `ask_questions`; external agents reach Tau through ACP under their native names (Claude's
 * `AskUserQuestion`, Codex's `request_user_input`), which the host keeps as the call's tool name. A question is a
 * decision (I5), so every surface that reads a call as one reads it through this predicate.
 */

import { toolName } from '@taucad/chat/constants';

const questionToolNames: ReadonlySet<string> = new Set([
  toolName.askQuestions,
  'AskUserQuestion',
  'request_user_input',
]);

/**
 * Whether a tool name is a question to the person.
 *
 * @param name - The call's tool name, native or as the agent reported it.
 * @returns Whether the call asks the person.
 * @public
 */
export const isQuestionTool = (name: unknown): boolean => typeof name === 'string' && questionToolNames.has(name);
