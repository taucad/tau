import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import { SystemMessage } from '@langchain/core/messages';
import type { ContentBlock } from '@langchain/core/messages';
import type { ContextPayload, SkillMetadata } from '@taucad/chat';
import { createTauInternalHumanMessage } from '#api/chat/utils/tau-internal-message.js';

const skillsSources = ['.agents/skills/'];

const skillsSystemPrompt = `
## Skills System

You have access to a skills library that provides specialized capabilities and domain knowledge.

{skills_locations}

**Available Skills:**

{skills_list}

**How to Use Skills (Progressive Disclosure):**

Skills follow a **progressive disclosure** pattern - you know they exist (name + description above), but you only read the full instructions when needed:

1. **Recognize when a skill applies**: Check if the user's task matches any skill's description
2. **Activate the skill**: Call the \`use_skill\` tool with the skill name before applying its instructions
3. **Follow the instructions**: The skill file contains step-by-step guidance for the task

Only activate a skill when you're about to perform that task. Don't activate all skills upfront.`;

const memorySystemPrompt = `<agent_memory>
{memory_contents}
</agent_memory>

<memory_guidelines>
    The above <agent_memory> was loaded in from files in your filesystem. As you learn from your interactions with the user, you can save new knowledge by calling the \`edit_file\` tool.

    **Learning from feedback:**
    - One of your MAIN PRIORITIES is to learn from your interactions with the user. These learnings can be implicit or explicit. This means that in the future, you will remember this important information.
    - When you need to remember something, updating memory must be your FIRST, IMMEDIATE action - before responding to the user, before calling other tools, before doing anything else. Just update memory immediately.
    - When user says something is better/worse, capture WHY and encode it as a pattern.
    - Each correction is a chance to improve permanently - don't just fix the immediate issue, update your instructions.
    - A great opportunity to update your memories is when the user interrupts a tool call and provides feedback. You should update your memories immediately before revising the tool call.
    - Look for the underlying principle behind corrections, not just the specific mistake.
    - The user might not explicitly ask you to remember something, but if they provide information that is useful for future use, you should update your memories immediately.
</memory_guidelines>`;

/**
 * Format skills source locations for display in the system prompt.
 */
export function formatSkillsLocations(sources: string[]): string {
  if (sources.length === 0) {
    return '**Skills Sources:** None configured';
  }

  const lines: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    const sourcePath = sources[i]!;
    const name =
      sourcePath
        .replace(/[/\\]$/, '')
        .split(/[/\\]/)
        .findLast(Boolean)
        ?.replace(/^./, (c) => c.toUpperCase()) ?? 'Skills';
    const suffix = i === sources.length - 1 ? ' (higher priority)' : '';
    lines.push(`**${name} Skills**: \`${sourcePath}\`${suffix}`);
  }

  return lines.join('\n');
}

/**
 * Format skills metadata entries as a bullet list for the system prompt.
 */
export function formatSkillsList(skills: SkillMetadata[], sources: string[]): string {
  if (skills.length === 0) {
    return `(No skills available yet. You can create skills in ${sources.map((s) => `\`${s}\``).join(' or ')})`;
  }

  const lines: string[] = [];
  for (const skill of skills) {
    lines.push(`- **${skill.name}**: ${skill.description}`);
    lines.push(`  → Activate with \`use_skill({ skillName: "${skill.name}" })\` before applying`);
  }

  return lines.join('\n');
}

/**
 * Build the complete skills system prompt section.
 */
export function formatSkillsPrompt(skills: SkillMetadata[], sources: string[]): string {
  const locations = formatSkillsLocations(sources);
  const list = formatSkillsList(skills, sources);
  return skillsSystemPrompt.replace('{skills_locations}', locations).replace('{skills_list}', list);
}

/**
 * Format loaded memory file contents for injection into the prompt.
 */
export function formatMemoryContents(contents: Record<string, string>, sources: string[]): string {
  if (Object.keys(contents).length === 0) {
    return '(No memory loaded)';
  }

  const sections: string[] = [];
  for (const path of sources) {
    if (contents[path]) {
      sections.push(`${path}\n${contents[path]}`);
    }
  }

  return sections.length > 0 ? sections.join('\n\n') : '(No memory loaded)';
}

/**
 * Build the complete memory prompt section.
 */
export function formatMemoryPrompt(contents: Record<string, string>, sources: string[]): string {
  const formatted = formatMemoryContents(contents, sources);
  return memorySystemPrompt.replace('{memory_contents}', formatted);
}

/**
 * Type for a content block with cache_control for skills insertion (Block 2).
 */
type ContentBlockWithCacheControl = ContentBlock & {
  cache_control?: { type: 'ephemeral' };
};

/**
 * Middleware that injects skills catalog and memory (AGENTS.md) into the
 * agent's context from a client-assembled context payload.
 *
 * Skills are injected as a new content block (Block 2) on the SystemMessage
 * with workspace-scoped cache_control, inserted between the static prompt
 * (Block 1) and the dynamic prompt (last block).
 *
 * Memory is injected as a HumanMessage prepended to the messages array,
 * wrapped in <system-reminder> tags (two-channel context injection: skills
 * sit on the system channel for cache reuse, memory rides the user channel
 * so per-request mutations don't invalidate the prefix cache).
 */
export const createClientContextMiddleware = (contextPayload?: ContextPayload): AgentMiddleware =>
  createMiddleware({
    name: 'ClientContext',
    async wrapModelCall(request, handler) {
      if (!contextPayload) {
        return handler(request);
      }

      let { systemMessage } = request;
      let { messages } = request;

      if (contextPayload.skills && contextPayload.skills.length > 0) {
        const skillsSection = formatSkillsPrompt(contextPayload.skills, skillsSources);
        const { content: existingContent } = systemMessage;

        const existingBlocks: ContentBlockWithCacheControl[] =
          typeof existingContent === 'string'
            ? [{ type: 'text', text: existingContent }]
            : Array.isArray(existingContent)
              ? (existingContent as ContentBlockWithCacheControl[])
              : [];

        const skillsBlock: ContentBlockWithCacheControl = {
          type: 'text',
          text: skillsSection,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API uses snake_case
          cache_control: { type: 'ephemeral' },
        };

        // Insert skills block before the last block (dynamic content)
        const insertIndex = Math.max(existingBlocks.length - 1, 1);
        const newBlocks = [...existingBlocks.slice(0, insertIndex), skillsBlock, ...existingBlocks.slice(insertIndex)];

        systemMessage = new SystemMessage({ content: newBlocks });
      }

      if (contextPayload.memory && Object.keys(contextPayload.memory).length > 0) {
        const memorySection = formatMemoryPrompt(contextPayload.memory, Object.keys(contextPayload.memory));
        const memoryMessage = createTauInternalHumanMessage({
          id: 'tau:client-memory',
          kind: 'client-memory',
          metadata: { pruning: 'replace-by-id' },
          content: `<system-reminder>
IMPORTANT: this context may or may not be relevant to your current task.

${memorySection}
</system-reminder>`,
        });
        messages = [memoryMessage, ...messages];
      }

      return handler({ ...request, systemMessage, messages });
    },
  });
