import { createAssistantMessageEventStream } from '@earendil-works/pi-ai';
import type {
  AssistantMessage,
  AssistantMessageEventStream,
  Message,
  ToolResultMessage,
  UserMessage,
} from '@earendil-works/pi-ai';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { util as zodUtility } from 'zod';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type {
  AgentToolChoice,
  JsonValue,
  ModelSystemPromptBlock,
  TurnContextSnapshot,
  TurnModelConfig,
  UserProviderMessage,
} from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ModelCallMiddleware } from '#harness/model-call-middleware.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { HostToolExecutionDetails } from '#harness/tools.js';

const mapFinalAssistant = async (
  upstream: AssistantMessageEventStream,
  transform: (message: AssistantMessage) => AssistantMessage,
): Promise<AssistantMessageEventStream> => {
  const output = createAssistantMessageEventStream();
  const forward = async (): Promise<void> => {
    for await (const event of upstream) {
      if (event.type === 'done') {
        output.push({ ...event, message: transform(event.message) });
        return;
      }
      if (event.type === 'error') {
        output.push({ ...event, error: transform(event.error) });
        return;
      }
      output.push(event);
    }
  };
  void forward();
  return output;
};

const codeOrTextSegment = /(```[\S\s]*?```|`[^`]*`)/g;
const doubleBackslashBeforeLetter = /\\\\([A-Za-z])/g;

/** Normalize Tau's renderer-specific math delimiters outside code spans. @public */
export const normalizeLatexDelimiters = (text: string): string => {
  const segments = text.split(codeOrTextSegment).map((segment) => {
    if (segment.startsWith('`')) {
      return segment;
    }
    const normalized = segment
      .replaceAll(String.raw`\(`, '$')
      .replaceAll(String.raw`\)`, '$')
      .replaceAll(String.raw`\[`, '$$$$')
      .replaceAll(String.raw`\]`, '$$$$')
      .replace(doubleBackslashBeforeLetter, String.raw`\$1`);
    return normalized;
  });
  return segments.join('');
};

/** Port of Tau's final-response LaTeX delimiter middleware. @public */
export const latexDelimiterMiddleware: ModelCallMiddleware = async (request, next) =>
  mapFinalAssistant(await next(request), (message) => ({
    ...message,
    content: message.content.map((block) => {
      if (block.type === 'text') {
        return { ...block, text: normalizeLatexDelimiters(block.text) };
      }
      if (block.type === 'thinking') {
        return { ...block, thinking: normalizeLatexDelimiters(block.thinking) };
      }
      return block;
    }),
  }));

/** Model-visible skill catalogue item supplied by the host client. @public */
export type ClientSkill = {
  readonly name: string;
  readonly description: string;
  readonly fingerprint?: string | undefined;
};

/** Portable subset of Tau's client-assembled context payload. @public */
export type ClientContext = {
  readonly skills?: readonly ClientSkill[] | undefined;
  readonly memory?: Readonly<Record<string, string>> | undefined;
};

const skillsPrompt = (skills: readonly ClientSkill[]): string => `
## Skills System

You have access to a skills library that provides specialized capabilities and domain knowledge.

**Skills Skills**: \`.agents/skills/\` (higher priority)

**Available Skills:**

${skills.map((skill) => `- **${skill.name}**: ${skill.description}\n  → Activate with \`use_skill({ skillName: "${skill.name}" })\` before applying`).join('\n')}

**How to Use Skills (Progressive Disclosure):**

Skills follow a **progressive disclosure** pattern - you know they exist (name + description above), but you only read the full instructions when needed:

1. **Recognize when a skill applies**: Check if the user's task matches any skill's description
2. **Activate the skill**: Call the \`use_skill\` tool with the skill name before applying its instructions
3. **Follow the instructions**: The skill file contains step-by-step guidance for the task

Only activate a skill when you're about to perform that task. Don't activate all skills upfront.`;

const memoryPrompt = (memory: Readonly<Record<string, string>>): string => `<system-reminder>
IMPORTANT: this context may or may not be relevant to your current task.

<agent_memory>
${Object.entries(memory)
  .filter(([, content]) => content.length > 0)
  .map(([path, content]) => `${path}\n${content}`)
  .join('\n\n')}
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
</memory_guidelines>
</system-reminder>`;

/** Inject Tau's skills catalogue and AGENTS.md memory onto pi's string/message seams. @public */
export const createClientContextMiddleware =
  (context?: ClientContext): ModelCallMiddleware =>
  async (request, next) => {
    if (!context) {
      return next(request);
    }
    const skills = context.skills ?? [];
    const memory = context.memory ?? {};
    const memoryMessage: UserMessage | undefined =
      Object.keys(memory).length === 0
        ? undefined
        : { role: 'user', content: [{ type: 'text', text: memoryPrompt(memory) }], timestamp: 0 };
    return next({
      ...request,
      context: {
        ...request.context,
        systemPrompt:
          skills.length === 0
            ? request.context.systemPrompt
            : `${request.context.systemPrompt ?? ''}\n\n${skillsPrompt(skills)}`,
        messages: memoryMessage ? [memoryMessage, ...request.context.messages] : request.context.messages,
      },
    });
  };

/** One previously activated skill retained by the host. @public */
export type RecentSkill = {
  readonly skillName: string;
  readonly resourceUri: string;
  readonly skillPath?: string | undefined;
  readonly source?: string | undefined;
  readonly fingerprint?: string | undefined;
  readonly content?: string | undefined;
};

/** Storage seam for Tau's recently activated skill set. @public */
export type RecentSkillsPort = {
  load(chatId: string): Promise<readonly RecentSkill[]>;
  remove?(chatId: string, skillName: string): Promise<void>;
};

const isRecentSkillsMessage = (message: AgentMessage): boolean => {
  if (message.role !== 'user') {
    return false;
  }
  const text =
    typeof message.content === 'string'
      ? message.content
      : message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return text.startsWith('<recently_used_skills>');
};

const formatRecentSkills = (skills: readonly RecentSkill[], includeContent: boolean): string =>
  `<recently_used_skills>
The following skills were activated earlier in this thread.${includeContent ? ' Preserve these exact previously-invoked instructions instead of re-reading the filesystem.' : ' This is metadata only; call use_skill again before applying a skill.'}

${skills
  .map((skill) => {
    const metadata = [
      `resource=${skill.resourceUri}`,
      skill.skillPath ? `path=${skill.skillPath}` : undefined,
      skill.source ? `source=${skill.source}` : undefined,
      skill.fingerprint ? `fingerprint=${skill.fingerprint}` : undefined,
    ]
      .filter((value): value is string => value !== undefined)
      .join(' ');
    const content =
      includeContent && skill.content
        ? `\n<skill_content name="${skill.skillName}">\n${skill.content}\n</skill_content>`
        : '';
    return `- ${skill.skillName} (${metadata})${content}`;
  })
  .join('\n')}
</recently_used_skills>`;

type RecentSkillsMiddlewareOptions = {
  readonly chatId: string;
  readonly store?: RecentSkillsPort | undefined;
  readonly currentSkills?: readonly ClientSkill[] | undefined;
  readonly includeContent: () => boolean;
};

const resolveRecentSkills = async (options: {
  readonly chatId: string;
  readonly store?: RecentSkillsPort | undefined;
  readonly currentSkills?: readonly ClientSkill[] | undefined;
}): Promise<readonly RecentSkill[]> => {
  const { store } = options;
  if (!store) {
    return [];
  }
  const current = new Map((options.currentSkills ?? []).map((skill) => [skill.name, skill.fingerprint]));
  const loaded = await store.load(options.chatId);
  const skills =
    current.size === 0
      ? loaded
      : loaded.filter((skill) => {
          const fingerprint = current.get(skill.skillName);
          return fingerprint !== undefined && fingerprint === skill.fingerprint;
        });
  const stale = current.size === 0 ? [] : loaded.filter((skill) => !skills.includes(skill));
  const { remove } = store;
  if (remove) {
    await Promise.all(stale.map(async (skill) => remove(options.chatId, skill.skillName)));
  }
  return skills;
};

const contextMessage = (input: {
  readonly id: string;
  readonly content: string;
  readonly kind: 'client-memory' | 'recent-skills';
  readonly anchorId?: string | undefined;
}): UserProviderMessage => ({
  id: input.id,
  role: 'user',
  content: input.content,
  metadata: {
    tauInternal: {
      kind: input.kind,
      ...(input.anchorId === undefined ? {} : { anchorId: input.anchorId }),
      pruning: 'replace-by-id',
    },
  },
});

/** Resolve the exact browser-safe system/client context committed with one turn. @internal */
export const createTurnContextSnapshot = async (options: {
  readonly chatId: string;
  readonly systemPrompt: string;
  readonly systemPromptBlocks?: readonly ModelSystemPromptBlock[] | undefined;
  readonly model?: TurnModelConfig | undefined;
  readonly toolChoice?: AgentToolChoice | undefined;
  readonly allowedTools?: readonly string[] | undefined;
  readonly snapshot?: JsonValue | undefined;
  readonly contextMessages?: readonly UserProviderMessage[] | undefined;
  readonly clientContext?: ClientContext | undefined;
  readonly recentSkills?: RecentSkillsPort | undefined;
}): Promise<TurnContextSnapshot> => {
  const skills = options.clientContext?.skills ?? [];
  const memory = options.clientContext?.memory ?? {};
  const recent = await resolveRecentSkills({
    chatId: options.chatId,
    store: options.recentSkills,
    currentSkills: skills,
  });
  const memoryMessage =
    Object.keys(memory).length === 0
      ? undefined
      : contextMessage({
          id: 'tau:client-memory',
          kind: 'client-memory',
          content: memoryPrompt(memory),
        });
  const recentMessage = (includeContent: boolean): UserProviderMessage | undefined =>
    recent.length === 0
      ? undefined
      : contextMessage({
          id: `tau:recent-skills:${options.chatId}:${includeContent ? 'content' : 'summary'}`,
          kind: 'recent-skills',
          anchorId: options.chatId,
          content: formatRecentSkills(recent, includeContent),
        });
  const initialRecent = recentMessage(false);
  const postCompactionRecent = recentMessage(true);
  const systemPromptBlocks = options.systemPromptBlocks
    ? [
        ...options.systemPromptBlocks.slice(0, -1),
        ...(skills.length === 0
          ? []
          : ([{ type: 'text', text: skillsPrompt(skills), cacheControl: { type: 'ephemeral' } }] as const)),
        ...options.systemPromptBlocks.slice(-1),
      ]
    : undefined;
  return {
    version: 1,
    systemPrompt: systemPromptBlocks
      ? systemPromptBlocks.map((block) => block.text).join('\n\n')
      : skills.length === 0
        ? options.systemPrompt
        : `${options.systemPrompt}\n\n${skillsPrompt(skills)}`,
    ...(systemPromptBlocks ? { systemPromptBlocks } : {}),
    ...(options.model ? { model: options.model } : {}),
    ...(options.toolChoice ? { toolChoice: options.toolChoice } : {}),
    ...(options.allowedTools ? { allowedTools: options.allowedTools } : {}),
    ...(options.snapshot === undefined ? {} : { snapshot: options.snapshot }),
    initialMessages: [initialRecent, memoryMessage, ...(options.contextMessages ?? [])].filter(
      (message): message is UserProviderMessage => message !== undefined,
    ),
    postCompactionMessages: [postCompactionRecent, memoryMessage, ...(options.contextMessages ?? [])].filter(
      (message): message is UserProviderMessage => message !== undefined,
    ),
  };
};

/** Reconcile and inject recently activated skills without persisting an ephemeral provider view. @public */
export const createRecentSkillsMiddleware =
  (options: RecentSkillsMiddlewareOptions): ModelCallMiddleware =>
  async (request, next) => {
    const skills = await resolveRecentSkills({
      chatId: options.chatId,
      store: options.store,
      currentSkills: options.currentSkills,
    });
    if (skills.length === 0) {
      return next(request);
    }
    const recent: UserMessage = {
      role: 'user',
      content: [{ type: 'text', text: formatRecentSkills(skills, options.includeContent()) }],
      timestamp: 0,
    };
    return next({
      ...request,
      context: {
        ...request.context,
        messages: [recent, ...request.context.messages.filter((message) => !isRecentSkillsMessage(message))],
      },
    });
  };

const toolJson = (message: ToolResultMessage): unknown => {
  const details = message.details as HostToolExecutionDetails | undefined;
  if (details && 'content' in details) {
    return details.content;
  }
  if (message.content.length !== 1 || message.content[0]?.type !== 'text') {
    return undefined;
  }
  try {
    return JSON.parse(message.content[0].text) as unknown;
  } catch {
    return undefined;
  }
};

const jsonLength = (value: unknown): number => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

const trimKernelIssueDetails = (code: unknown, details: unknown): unknown => {
  if (jsonLength(details) <= 6000) {
    return details;
  }
  if (code !== 'GEOMETRY_INVALID' || !zodUtility.isObject(details)) {
    return { _trimmed: true, reason: 'details exceeded 6000 characters' };
  }
  const geometrySource = zodUtility.isObject(details['geometry']) ? details['geometry'] : undefined;
  const geometry = geometrySource
    ? Object.fromEntries(
        ['partName', 'partIndex', 'sourceName', 'nativeValidation', 'exportValidation', 'topology', 'hints']
          .filter((key) => geometrySource[key] !== undefined)
          .map((key) => [key, geometrySource[key]]),
      )
    : undefined;
  const compact = {
    _trimmed: true,
    ...(details['producer'] === undefined ? {} : { producer: details['producer'] }),
    ...(geometry === undefined ? {} : { geometry }),
  };
  return jsonLength(compact) <= 6000 ? compact : { _trimmed: true, reason: 'details exceeded 6000 characters' };
};

const trimStructuredResult = (toolName: string, value: unknown): unknown => {
  if (!zodUtility.isObject(value)) {
    return value;
  }
  if (toolName === 'test_model' && Array.isArray(value['failures']) && typeof value['total'] === 'number') {
    return { failures: value['failures'], total: value['total'] };
  }
  if (
    (toolName === 'create_file' || toolName === 'edit_file' || toolName === 'delete_file') &&
    zodUtility.isObject(value['diffStats'])
  ) {
    const diff = value['diffStats'];
    return {
      ...(toolName !== 'edit_file' && typeof value['message'] === 'string' ? { message: value['message'] } : {}),
      diffStats: { linesAdded: diff['linesAdded'], linesRemoved: diff['linesRemoved'] },
    };
  }
  if (toolName === 'screenshot' && Array.isArray(value['images'])) {
    const { images } = value as { readonly images: unknown[] };
    return {
      images: images.map((image) => (zodUtility.isObject(image) ? { view: image['view'] } : image)),
      _trimmed: true,
    };
  }
  if (toolName === 'get_kernel_result' && typeof value['status'] === 'string') {
    const kernelIssues: unknown[] | undefined = Array.isArray(value['kernelIssues'])
      ? value['kernelIssues']
      : undefined;
    return {
      status: value['status'],
      ...(kernelIssues
        ? {
            kernelIssues: kernelIssues.map((issue) => {
              if (!zodUtility.isObject(issue)) {
                return issue;
              }
              return {
                code: issue['code'],
                message: issue['message'],
                ...(issue['location'] === undefined ? {} : { location: issue['location'] }),
                severity: issue['severity'],
                ...(issue['type'] === undefined ? {} : { type: issue['type'] }),
                ...(issue['stack'] === undefined ? {} : { stack: issue['stack'] }),
                ...(issue['stackFrames'] === undefined ? {} : { stackFrames: issue['stackFrames'] }),
                ...(issue['details'] === undefined
                  ? {}
                  : { details: trimKernelIssueDetails(issue['code'], issue['details']) }),
              };
            }),
          }
        : {}),
    };
  }
  return value;
};

/** Apply Tau's CAD-specific historical tool-result reductions to a provider view. @public */
export function trimToolResultContext(
  messages: readonly Message[],
  options?: { readonly allowImageBlocks?: boolean | undefined },
): Message[];
export function trimToolResultContext(
  messages: readonly AgentMessage[],
  options?: { readonly allowImageBlocks?: boolean | undefined },
): AgentMessage[];
/** @public */
export function trimToolResultContext(
  messages: readonly AgentMessage[],
  options: { readonly allowImageBlocks?: boolean | undefined } = {},
): AgentMessage[] {
  const lastScreenshot =
    options.allowImageBlocks === false
      ? -1
      : messages.findLastIndex((message) => message.role === 'toolResult' && message.toolName === 'screenshot');
  return messages.map((message, index) => {
    if (message.role !== 'toolResult') {
      return message;
    }
    if (index === lastScreenshot) {
      // The newest capture is already image blocks: `toPiToolContent` builds
      // them where the result is recorded, which is the only shape compaction
      // and the transport's own rehydration ever see. Rebuilding them here was
      // the request-time half of that job and is now redundant.
      return message;
    }
    if (message.content.some((block) => block.type === 'image')) {
      return {
        ...message,
        content: message.content.map((block) =>
          block.type === 'image' ? { type: 'text', text: '[screenshot image - previously captured]' } : block,
        ),
      };
    }
    const structured = toolJson(message);
    const trimmed = trimStructuredResult(message.toolName, structured);
    return trimmed === structured
      ? message
      : { ...message, content: [{ type: 'text', text: JSON.stringify(trimmed) }] };
  });
}

/** Port of Tau's ephemeral tool-result trimmer. @public */
export const createToolResultTrimmerMiddleware =
  (
    options: {
      readonly allowImageBlocks?: boolean | undefined;
    } = {},
  ): ModelCallMiddleware =>
  async (request, next) =>
    next({
      ...request,
      context: { ...request.context, messages: trimToolResultContext(request.context.messages, options) },
    });
