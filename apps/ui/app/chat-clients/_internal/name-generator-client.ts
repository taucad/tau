import { useCallback } from 'react';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import type { MyUIMessage } from '@taucad/chat';
import { messageRole } from '@taucad/chat/constants';
import { ENV } from '#environment.config.js';
import { readIdentityState } from '#lib/identity-answer.js';
import { parseErrorForPersistence } from '@taucad/chat-ui/utils/error.utils';
import { recordApiRequestId } from '@taucad/ui-core/lib/api-request-id';
import { loadCode } from '@taucad/ui-core/lib/code-loading';

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
  public readonly code?: string;

  public constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type NameProfile = 'project_name' | 'commit_name';

type GenerateName = (prompt: string, projectId: string) => Promise<string>;
type GenerateNameFromParts = (parts: MyUIMessage['parts'], projectId: string) => Promise<string>;

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

/** @internal */
export type NameGeneratorPartsClient = {
  readonly generateFromParts: GenerateNameFromParts;
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
    const parsed = parseErrorForPersistence(new Error(detail));
    throw recordApiRequestId(
      new NameGeneratorRequestError(
        response.status,
        `POST /v1/chat failed with ${response.status} ${response.statusText}: ${parsed.message}`,
        parsed.code,
      ),
      response,
    );
  }

  if (!response.body) {
    throw new NameGeneratorRequestError(response.status, 'POST /v1/chat returned an empty response body stream');
  }

  return response;
};

/**
 * The two refusals an account causes: no session (401) and not enough credit (402). A name is a courtesy, so either
 * is no name, not a failure of naming; the turn itself says what the account must do (launch audit N-7).
 */
const isAccountRefusal = (error: unknown): boolean =>
  error instanceof NameGeneratorRequestError && (error.status === 401 || error.status === 402);

/**
 * Factory for the simple-text profile clients. The `profile` discriminator
 * is the only thing that varies between project-name and commit-name; the
 * wire body and streaming pipeline are delegated entirely to the AI SDK.
 *
 * @internal
 */
export const useNameGeneratorPartsClient = (profile: NameProfile): NameGeneratorPartsClient => {
  const generateFromParts = useCallback<GenerateNameFromParts>(
    async (parts, projectId) => {
      /* The naming profiles need a session. Once the identity owner has answered that nobody is signed in, the request
       * is certain to be refused, so none is made (launch audit N-7). The answer is read when a name is asked for; an
       * unknown or unverified identity is left to the API. */
      if (readIdentityState() === 'signed-out') {
        return '';
      }
      // Mounting the project manager does not need a naming transport.
      const sdk = await loadCode(async () => import('ai'));
      const chatId = generatePrefixedId(idPrefix.chat);
      const messageId = generatePrefixedId(idPrefix.message);
      const userMessage: MyUIMessage = {
        id: messageId,
        role: messageRole.user,
        parts,
      };

      const transport = new sdk.DefaultChatTransport<MyUIMessage>({
        api: `${ENV.TAU_API_URL}/v1/chat`,
        credentials: 'include',
        fetch: nameGeneratorFetch,
      });
      let stream: Awaited<ReturnType<typeof transport.sendMessages>>;
      try {
        stream = await transport.sendMessages({
          chatId,
          messageId: undefined,
          messages: [userMessage],
          trigger: 'submit-message',
          body: {
            projectId,
            agent: { profile },
            admission: {
              version: 1,
              idempotencyKey: generatePrefixedId(idPrefix.request),
            },
          },
          abortSignal: AbortSignal.timeout(10_000),
        });
      } catch (error) {
        if (isAccountRefusal(error)) {
          return '';
        }
        throw error;
      }

      let assembled: MyUIMessage | undefined;
      for await (const message of sdk.readUIMessageStream<MyUIMessage>({ stream })) {
        assembled = message;
      }

      const responseParts = assembled?.parts ?? [];
      let text = '';
      for (const part of responseParts) {
        if (part.type === 'text') {
          text += part.text;
        }
      }
      return text;
    },
    [profile],
  );

  return { generateFromParts };
};

export const useNameGeneratorClient = (profile: NameProfile): NameGeneratorClient => {
  const { generateFromParts } = useNameGeneratorPartsClient(profile);
  const generate = useCallback<GenerateName>(
    async (prompt, projectId) => generateFromParts([{ type: 'text', text: prompt }], projectId),
    [generateFromParts],
  );
  return { generate };
};
