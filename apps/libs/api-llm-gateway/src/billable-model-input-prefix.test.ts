/* eslint-disable @typescript-eslint/naming-convention -- native provider wire keys. */
import { describe, expect, it } from 'vitest';
import { array, assert, constantFrom, integer, property, record, string, tuple } from 'fast-check';
import { billableModelInputPrefix, safeParseBillableModelRequest } from '#billable-model-request.js';
import type { BillableModelRequest } from '#billable-model-request.js';

/* A one-pixel PNG: an image the prefix bound counts at the per-image maximum, not by its bytes. */
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const perMessageTokens = 64n;
const bytes = (value: unknown): bigint => BigInt(new TextEncoder().encode(JSON.stringify(value)).byteLength);
const perImageTokens = 3000n;

type Item =
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly type: 'message';
      readonly role: 'assistant';
      readonly content: ReadonlyArray<{ type: 'output_text'; text: string; annotations: never[] }>;
    }
  | {
      readonly role: 'user';
      readonly content: ReadonlyArray<
        { type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }
      >;
    };

const user = (content: string): Item => ({ role: 'user', content });
const assistant = (text: string): Item => ({
  type: 'message',
  role: 'assistant',
  content: [{ type: 'output_text', text, annotations: [] }],
});

const responses = (input: readonly Item[], overrides: Record<string, unknown> = {}): BillableModelRequest => {
  const parsed = safeParseBillableModelRequest(
    { model: 'gpt-6-luna', stream: true, max_output_tokens: 1024, instructions: 'Be brief.', input, ...overrides },
    'openai-responses',
  );
  if (!parsed.success) {
    throw new Error(`fixture is outside the funded contract: ${JSON.stringify(parsed.error.issues)}`);
  }
  return parsed.data;
};

/**
 * The supplier's count modeled at its worst for the bound: one token per UTF-8 byte of every string the item
 * carries, each image at the per-image maximum and the per-message template constant. A real tokenizer never
 * spends more than one token per byte (see `billableModelInputBound`), so a bound that covers this covers the supplier.
 */
const worstCaseTokens = (items: readonly Item[]): bigint => {
  let total = 0n;
  for (const entry of items) {
    for (const part of typeof entry.content === 'string' ? [{ text: entry.content }] : entry.content) {
      total += 'text' in part ? BigInt(new TextEncoder().encode(part.text).byteLength) : perImageTokens;
    }
    total += perMessageTokens;
  }
  return total;
};

const text = string({ unit: 'grapheme', maxLength: 200 });
const item = constantFrom<'user' | 'assistant' | 'image'>('user', 'assistant', 'image').chain((kind) =>
  kind === 'image'
    ? text.map(
        (caption): Item => ({
          role: 'user',
          content: [
            { type: 'input_text', text: caption },
            { type: 'input_image', image_url: `data:image/png;base64,${png}` },
          ],
        }),
      )
    : text.map((content) => (kind === 'user' ? user(content) : assistant(content))),
);

describe('billableModelInputPrefix (WP-15 step 6, O-6)', () => {
  it('should hold the next step at most at the previous report plus what was appended, and never below the supplier', () => {
    assert(
      property(
        tuple(
          array(item, { minLength: 1, maxLength: 12 }),
          array(item, { minLength: 1, maxLength: 6 }),
          integer({ min: 0, max: 50_000 }),
        ),
        ([prefix, added, systemTokens]) => {
          const previous = responses(prefix);
          const next = responses([...prefix, ...added]);
          // What the supplier reported for the previous step: its items plus whatever the route adds once.
          const reported = worstCaseTokens(prefix) + BigInt(systemTokens);
          const own = billableModelInputPrefix(previous);
          const result = billableModelInputPrefix(next, { prefix: own!.prefix, inputTokens: reported });

          expect(result?.bound).toBeDefined();
          // An upper bound on the supplier's count of the next request under the worst-case model.
          expect(result!.bound!).toBeGreaterThanOrEqual(reported + worstCaseTokens(added));
          // And never looser than the previous report plus the appended items' serialized bytes and constants.
          const images = BigInt(added.filter((entry) => Array.isArray(entry.content) && entry.role === 'user').length);
          expect(result!.bound! - reported).toBeLessThanOrEqual(
            bytes(added) + images * perImageTokens + perMessageTokens * BigInt(added.length),
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it('should earn no bound when any member outside the appended items differs', () => {
    assert(
      property(
        array(item, { minLength: 2, maxLength: 8 }),
        record({ change: constantFrom('instructions', 'model', 'item', 'tools') }),
        (items, { change }) => {
          const own = billableModelInputPrefix(responses(items.slice(0, -1)))!;
          const changed =
            change === 'instructions'
              ? responses(items, { instructions: 'Be thorough.' })
              : change === 'model'
                ? responses(items, { model: 'gpt-6-sol' })
                : change === 'tools'
                  ? responses(items, {
                      tools: [{ type: 'function', name: 'read', parameters: { type: 'object' } }],
                    })
                  : responses([user(`${JSON.stringify(items[0])}!`), ...items.slice(1)]);

          expect(billableModelInputPrefix(changed, { prefix: own.prefix, inputTokens: 10n })?.bound).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('should ignore the output maximum, which the supplier does not count as input', () => {
    const own = billableModelInputPrefix(responses([user('hi')]))!;
    const next = responses([user('hi'), assistant('hello'), user('thanks')], { max_output_tokens: 2048 });

    expect(billableModelInputPrefix(next, { prefix: own.prefix, inputTokens: 5000n })?.bound).toBe(
      5000n + bytes([assistant('hello'), user('thanks')]) + 2n * perMessageTokens,
    );
  });

  it('should earn no bound for an identical resend, a longer previous step or an unbounded appended document', () => {
    const items: Item[] = [user('hi'), assistant('hello')];
    const own = billableModelInputPrefix(responses(items))!;
    const shorter = billableModelInputPrefix(responses(items.slice(0, 1)))!;

    expect(billableModelInputPrefix(responses(items), { prefix: own.prefix, inputTokens: 1n })?.bound).toBeUndefined();
    expect(
      billableModelInputPrefix(responses(items.slice(0, 1)), { prefix: own.prefix, inputTokens: 1n })?.bound,
    ).toBeUndefined();
    const withDocument = safeParseBillableModelRequest(
      {
        model: 'gpt-6-luna',
        stream: true,
        max_output_tokens: 1024,
        instructions: 'Be brief.',
        input: [
          items[0],
          {
            role: 'user',
            content: [{ type: 'input_file', filename: 'a.pdf', file_data: 'data:application/pdf;base64,JVBERi0=' }],
          },
        ],
      },
      'openai-responses',
    );
    if (!withDocument.success) {
      throw new Error('the document fixture is outside the funded contract');
    }
    expect(
      billableModelInputPrefix(withDocument.data, { prefix: shorter.prefix, inputTokens: 1n })?.bound,
    ).toBeUndefined();
  });
});
