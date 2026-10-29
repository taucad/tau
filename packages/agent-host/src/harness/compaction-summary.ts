/* Summary prompt text adapted from Pi agent-core 0.84.4 (MIT).
 * Copyright (c) 2025 Mario Zechner.
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { contentText } from '@earendil-works/pi-ai';
import type { Api, Model, Models, Usage } from '@earendil-works/pi-ai';

const summarizationSystemPrompt = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;
const summarizationPrompt = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;
const updateSummarizationPrompt = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const serializeMessages = (messages: readonly AgentMessage[]): string =>
  messages
    .map((message) => {
      if (message.role === 'user') {
        return `[User]: ${contentText(message.content, '')}`;
      }
      if (message.role === 'toolResult') {
        const text = contentText(message.content, '');
        return `[Tool result]: ${text.length > 2000 ? `${text.slice(0, 2000)}\n[${text.length - 2000} more characters truncated]` : text}`;
      }
      if (message.role === 'assistant') {
        return message.content
          .map((block) => {
            if (block.type === 'text') {
              return `[Assistant]: ${block.text}`;
            }
            if (block.type === 'thinking') {
              return `[Assistant thinking]: ${block.thinking}`;
            }
            return `[Assistant tool calls]: ${block.name}(${JSON.stringify(block.arguments)})`;
          })
          .join('\n');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');

const fileLists = (messages: readonly AgentMessage[], previousSummary?: string): string => {
  const read = new Set<string>();
  const modified = new Set<string>();
  for (const [tag, paths] of [
    ['read-files', read],
    ['modified-files', modified],
  ] as const) {
    const contents = previousSummary?.split(`<${tag}>`)[1]?.split(`</${tag}>`)[0];
    for (const path of contents?.split('\n').filter(Boolean) ?? []) {
      paths.add(path);
    }
  }
  for (const message of messages) {
    if (message.role !== 'assistant') {
      continue;
    }
    for (const block of message.content) {
      if (block.type !== 'toolCall') {
        continue;
      }
      const path = block.arguments['targetFile'];
      if (typeof path !== 'string') {
        continue;
      }
      if (block.name === 'read_file') {
        read.add(path);
      }
      if (block.name === 'create_file' || block.name === 'edit_file') {
        modified.add(path);
      }
    }
  }
  const lists: ReadonlyArray<readonly [string, string[]]> = [
    ['read-files', [...read].filter((path) => !modified.has(path)).sort()],
    ['modified-files', [...modified].sort()],
  ];
  return lists
    .flatMap(([tag, paths]) => (paths.length > 0 ? [`<${tag}>\n${paths.join('\n')}\n</${tag}>`] : []))
    .join('\n');
};

/**
 * Summarize the exact evicted prefix through Tau's existing model transport.
 * @param options - Evicted messages, prior checkpoint and bounded model request.
 * @returns Checkpoint text with file provenance and reported generation usage.
 * @internal
 */
export const summarizeCompaction = async (options: {
  readonly messages: readonly AgentMessage[];
  readonly previousSummary?: string | undefined;
  readonly models: Pick<Models, 'completeSimple'>;
  readonly model: Model<Api>;
  readonly reserveTokens: number;
  readonly signal?: AbortSignal | undefined;
}): Promise<{ readonly summary: string; readonly usage: Usage }> => {
  const previous = options.previousSummary;
  const prompt =
    `<conversation>\n${serializeMessages(options.messages)}\n</conversation>\n\n` +
    (previous ? `<previous-summary>\n${previous}\n</previous-summary>\n\n` : '') +
    (previous ? updateSummarizationPrompt : summarizationPrompt);
  const result = await options.models.completeSimple(
    options.model,
    {
      systemPrompt: summarizationSystemPrompt,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }], timestamp: Date.now() }],
    },
    {
      maxTokens: Math.min(Math.floor(0.8 * options.reserveTokens), options.model.maxTokens || Number.POSITIVE_INFINITY),
      signal: options.signal,
    },
  );
  if (result.stopReason === 'aborted') {
    throw new DOMException('Compaction aborted', 'AbortError');
  }
  if (result.stopReason !== 'stop') {
    throw new Error(`Summarization failed: ${result.errorMessage ?? `Compaction ended with ${result.stopReason}.`}`);
  }
  const summary = contentText(result.content);
  return {
    summary: summary ? [summary, fileLists(options.messages, previous)].filter(Boolean).join('\n\n') : '',
    usage: result.usage,
  };
};
