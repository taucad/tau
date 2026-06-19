import { createMiddleware } from 'langchain';
import type { AgentMiddleware } from 'langchain';
import type { BaseStore } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { recentSkillsIndexKey, recentSkillsRootNamespace } from '#api/chat/recent-skills-namespace.js';
import type { RecentSkillValue } from '#api/chat/recent-skills-namespace.js';
import { withTauInternalMetadata } from '#api/chat/utils/tau-internal-message.js';

type RecentSkillsIndex = {
  readonly names?: string[];
};

export type LoadRecentSkillsMessageInput = {
  readonly store?: BaseStore | undefined;
  readonly chatId?: string | undefined;
  readonly includeContent: boolean;
};

const recentSkillsSource = 'recent_skills';

function isRecentSkillValue(value: unknown): value is RecentSkillValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    'skillName' in value &&
    'resourceUri' in value &&
    typeof (value as { skillName: unknown }).skillName === 'string' &&
    typeof (value as { resourceUri: unknown }).resourceUri === 'string'
  );
}

function formatRecentSkills(
  skills: readonly RecentSkillValue[],
  options: { readonly includeContent: boolean },
): string {
  const lines = skills.map((skill) => {
    const metadata = [
      `resource=${skill.resourceUri}`,
      skill.skillPath ? `path=${skill.skillPath}` : undefined,
      skill.source ? `source=${skill.source}` : undefined,
      skill.fingerprint ? `fingerprint=${skill.fingerprint}` : undefined,
    ]
      .filter((entry): entry is string => entry !== undefined)
      .join(' ');
    const content =
      options.includeContent && skill.content
        ? `\n<skill_content name="${skill.skillName}">\n${skill.content}\n</skill_content>`
        : '';
    return `- ${skill.skillName} (${metadata})${content}`;
  });

  return `<recently_used_skills>
The following skills were activated earlier in this thread.${options.includeContent ? ' Preserve these exact previously-invoked instructions instead of re-reading the filesystem.' : ' This is metadata only; call use_skill again before applying a skill.'}

${lines.join('\n')}
</recently_used_skills>`;
}

export async function loadRecentSkillsMessage(input: LoadRecentSkillsMessageInput): Promise<HumanMessage | undefined> {
  const { store, chatId } = input;
  if (!store || !chatId || typeof store.get !== 'function') {
    return undefined;
  }

  const namespace = [...recentSkillsRootNamespace, chatId];
  const indexItem = await store.get(namespace, recentSkillsIndexKey);
  const names = (indexItem?.value as RecentSkillsIndex | undefined)?.names ?? [];
  if (names.length === 0) {
    return undefined;
  }

  const values = await Promise.all(names.map(async (name) => store.get(namespace, name)));
  const recentSkills = values
    .map((item) => item?.value)
    .filter((value): value is RecentSkillValue => isRecentSkillValue(value));

  if (recentSkills.length === 0) {
    return undefined;
  }

  return new HumanMessage({
    id: `tau:recent-skills:${chatId}:${input.includeContent ? 'content' : 'summary'}`,
    content: formatRecentSkills(recentSkills, { includeContent: input.includeContent }),
    // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
    additional_kwargs: withTauInternalMetadata(
      {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
        lc_source: recentSkillsSource,
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain metadata is snake_case.
        include_content: input.includeContent,
      },
      {
        kind: 'recent-skills',
        anchorId: chatId,
        pruning: 'replace-by-id',
      },
    ),
  });
}

export function isRecentSkillsMessage(message: BaseMessage): boolean {
  const source = (message as { additional_kwargs?: Record<string, unknown> }).additional_kwargs?.['lc_source'];
  if (source === recentSkillsSource) {
    return true;
  }
  return (
    message instanceof HumanMessage &&
    typeof message.content === 'string' &&
    message.content.startsWith('<recently_used_skills>')
  );
}

export function replaceRecentSkillsMessage(
  messages: readonly BaseMessage[],
  recentSkillsMessage: BaseMessage | undefined,
): BaseMessage[] {
  const withoutExisting = messages.filter((message) => !isRecentSkillsMessage(message));
  return recentSkillsMessage ? [recentSkillsMessage, ...withoutExisting] : withoutExisting;
}

export const createRecentSkillsMiddleware = (): AgentMiddleware =>
  createMiddleware({
    name: 'RecentSkills',

    async wrapModelCall(request, handler) {
      const runtime = request.runtime as {
        store?: BaseStore;
        context?: { chatId?: unknown; skillContentRestoreNeeded?: unknown };
      };
      const { store } = runtime;
      const chatId = typeof runtime.context?.chatId === 'string' ? runtime.context.chatId : undefined;
      const includeContent = runtime.context?.skillContentRestoreNeeded === true;
      const recentSkillsMessage = await loadRecentSkillsMessage({ store, chatId, includeContent });
      if (!recentSkillsMessage) {
        return handler(request);
      }

      return handler({
        ...request,
        messages: replaceRecentSkillsMessage(request.messages, recentSkillsMessage),
      });
    },
  });
