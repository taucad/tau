import { useCallback } from 'react';
import { DefaultChatTransport, readUIMessageStream } from 'ai';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { MyUIMessage } from '@taucad/chat';
import { messageRole } from '@taucad/chat/constants';
import { ENV } from '#environment.config.js';

/**
 * Error thrown by the project-name / commit-name client when the
 * `POST /v1/chat` request fails (non-2xx) or the streaming body is missing.
 * Tests assert on `name` and `message` per the testing-policy "error
 * assertions" rule.
 *
 * @public
 */
export class NameGeneratorRequestError extends Error {
  public override readonly name = 'NameGeneratorRequestError';
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type NameProfile = 'project_name' | 'commit_name';

type GenerateName = (prompt: string) => Promise<string>;

/**
 * Public surface of the simple-text name clients (project + commit). These
 * profiles produce a single string (chat-name / commit-message), so the
 * client exposes `generate(prompt)` rather than the full CAD verb set.
 *
 * @public
 */
export type NameGeneratorClient = {
  readonly generate: GenerateName;
};

/**
 * Pre-flight fetch wrapper used by `nameGeneratorTransport`. Translates
 * non-2xx and empty-body responses into the structured
 * `NameGeneratorRequestError` before the AI SDK transport can collapse
 * them into bare `Error` instances (which would lose the numeric status
 * field that tests assert on).
 */
const nameGeneratorFetch: typeof globalThis.fetch = async (input, init) => {
  const response = await globalThis.fetch(input, init);

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new NameGeneratorRequestError(
      response.status,
      `POST /v1/chat failed with ${response.status} ${response.statusText}: ${detail}`,
    );
  }

  if (!response.body) {
    throw new NameGeneratorRequestError(response.status, 'POST /v1/chat returned an empty response body stream');
  }

  return response;
};

/**
 * Dedicated transport for the simple-text name profiles. Distinct from
 * `sharedChatTransport` (consumed by the CAD `Chat<MyUIMessage>` factory)
 * because we need a name-profile-specific fetch wrapper to preserve the
 * `NameGeneratorRequestError` contract; the CAD path uses the SDK's
 * default error shape.
 */
// oxlint-disable-next-line tau-lint/require-public-export-jsdoc -- @internal, scoped to name-generator-client
const nameGeneratorTransport = new DefaultChatTransport<MyUIMessage>({
  api: `${ENV.TAU_API_URL}/v1/chat`,
  credentials: 'include',
  fetch: nameGeneratorFetch,
});

/**
 * Factory for the simple-text profile clients. The `profile` discriminator
 * is the only thing that varies between project-name and commit-name; the
 * wire body and streaming pipeline are delegated entirely to the AI SDK.
 *
 * @internal
 */
export const useNameGeneratorClient = (profile: NameProfile): NameGeneratorClient => {
  const generate = useCallback<GenerateName>(
    async (prompt) => {
      const chatId = generatePrefixedId(idPrefix.chat);
      const messageId = generatePrefixedId(idPrefix.message);
      const userMessage: MyUIMessage = {
        id: messageId,
        role: messageRole.user,
        parts: [{ type: 'text', text: prompt }],
      };

      const stream = await nameGeneratorTransport.sendMessages({
        chatId,
        messageId: undefined,
        messages: [userMessage],
        trigger: 'submit-message',
        body: { agent: { profile } },
        abortSignal: undefined,
      });

      let assembled: MyUIMessage | undefined;
      for await (const message of readUIMessageStream<MyUIMessage>({ stream })) {
        assembled = message;
      }

      const parts = assembled?.parts ?? [];
      let text = '';
      for (const part of parts) {
        if (part.type === 'text') {
          text += part.text;
        }
      }
      return text;
    },
    [profile],
  );

  return { generate };
};
