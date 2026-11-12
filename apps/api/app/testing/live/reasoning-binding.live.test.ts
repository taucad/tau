import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import {
  hasLiveCredential,
  liveCredentialName,
  liveRepeats,
  startLiveGateway,
} from '#testing/live/live-gateway.harness.js';
import type { LiveGateway } from '#testing/live/live-gateway.harness.js';

/**
 * The reasoning binding control on the wire (provider reasoning replay contract, WP5).
 *
 * Anthropic binds a thinking block to the prefix it was minted under. Whether it then refuses an edited replay
 * depends on the model and on the account's age, unless the request says so: `thinking.block_binding` set to `error`
 * refuses, `drop_block` leaves the block out and reports it. Tau sends `drop_block` in production and `error` from
 * every live suite, so the replay rows in `provider-switch.live.test.ts` fail when Tau's own replay rule misses a
 * block. That only holds if the provider really honours the control for the model, which is what these rows prove:
 * a seeded edit, sent raw through Tau's gateway with no replay rule in the way, is refused under `error` and dropped
 * under `drop_block`.
 */

/* eslint-disable @typescript-eslint/naming-convention -- Anthropic's wire uses snake_case. */

const bindingBeta = 'thinking-binding-controls-2026-08-01';

let gateway: LiveGateway | undefined;
afterAll(async () => gateway?.close());

type WireBlock = Readonly<Record<string, unknown>>;
type WireReply = {
  readonly status: number;
  /** The gateway's refusal code when the request was refused. */
  readonly refusal?: string | undefined;
  /** The reply's content blocks, reassembled from the stream. */
  readonly blocks: readonly WireBlock[];
  /** What the provider reports it did to the request's input. */
  readonly transformations: readonly WireBlock[];
};

const sseData = (text: string): WireBlock[] =>
  text
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .flatMap((line) => {
      try {
        return [JSON.parse(line.slice(6)) as WireBlock];
      } catch {
        return [];
      }
    });

const post = async (
  model: string,
  behavior: 'error' | 'drop_block',
  messages: readonly unknown[],
): Promise<WireReply> => {
  gateway ??= await startLiveGateway();
  const response = await fetch(`${gateway.baseUrl}/v1/llm/anthropic/v1/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${gateway.bearer}`,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-beta': bindingBeta,
      'x-tau-attempt-id': randomUUID(),
    },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      stream: true,
      thinking: { type: 'adaptive', display: 'summarized', block_binding: { prefix_mismatch_behavior: behavior } },
      output_config: { effort: 'high' },
      messages,
    }),
  });
  const text = await response.text();
  if (response.status !== 200) {
    const parsed = JSON.parse(text) as { error?: { type?: string } };
    return { status: response.status, refusal: parsed.error?.type, blocks: [], transformations: [] };
  }
  const blocks: Array<Record<string, unknown>> = [];
  let transformations: readonly WireBlock[] = [];
  for (const event of sseData(text)) {
    const index = event['index'] as number;
    const reported = ((event['message'] as WireBlock | undefined) ?? event)['input_transformations'];
    transformations = Array.isArray(reported) ? (reported as WireBlock[]) : transformations;
    if (event['type'] === 'content_block_start') {
      blocks[index] = { ...(event['content_block'] as WireBlock) };
    }
    /* A delta carries one string under the key it extends: `thinking`, `signature` or `text`. */
    const block = blocks[index];
    for (const [key, piece] of Object.entries((event['delta'] as WireBlock | undefined) ?? {})) {
      if (block !== undefined && key !== 'type' && typeof piece === 'string') {
        block[key] = `${typeof block[key] === 'string' ? block[key] : ''}${piece}`;
      }
    }
  }
  return { status: 200, blocks, transformations };
};

const question = (limit: number): string =>
  `How many integers from 1 to ${String(limit)} are divisible by 6 or 14 but not by 4? Work it out step by step, then give the number.`;

/** The models the replay rows rely on the control for; Fable 5.2 refuses with or without it. */
const boundModelIds = [
  'anthropic-claude-fable-5.2',
  'anthropic-claude-opus-5.5',
  'anthropic-claude-sonnet-5.5',
  'anthropic-claude-haiku-5.5',
] as const;

for (const modelId of boundModelIds) {
  describe.skipIf(!hasLiveCredential(modelId))(
    `live reasoning binding control: ${modelId} (set ${liveCredentialName(modelId)} in apps/api/.env to run)`,
    { repeats: liveRepeats },
    () => {
      it('should refuse an edited replay under `error`, and drop and report it under `drop_block`', async () => {
        const first = await post(modelId, 'error', [{ role: 'user', content: question(27_182) }]);
        expect(first.status).toBe(200);
        const minted = first.blocks.filter((block) => block['type'] === 'thinking' && block['signature']);
        expect(minted.length, 'the model minted no signed thinking, so the row proves nothing').toBeGreaterThan(0);
        const replay = (asked: string): unknown[] => [
          { role: 'user', content: asked },
          { role: 'assistant', content: first.blocks },
          { role: 'user', content: 'Reply with the single word OK.' },
        ];

        /* The control: the same history, unedited, replays under `error`. */
        const intact = await post(modelId, 'error', replay(question(27_182)));
        expect(intact.status, 'an unedited replay was refused').toBe(200);
        expect(intact.transformations).toEqual([]);

        /* The seeded edit: the message the thinking followed now reads differently. */
        const refused = await post(modelId, 'error', replay(question(27_183)));
        expect(refused).toMatchObject({ status: 502, refusal: 'REASONING_REPLAY_REJECTED' });

        const dropped = await post(modelId, 'drop_block', replay(question(27_183)));
        expect(dropped.status).toBe(200);
        expect(dropped.transformations).toEqual(
          minted.map((): unknown =>
            expect.objectContaining({ type: 'thinking_dropped', reason: 'prefix_binding_mismatch' }),
          ),
        );
      });
    },
  );
}

/* eslint-enable @typescript-eslint/naming-convention -- End of the wire shapes. */
