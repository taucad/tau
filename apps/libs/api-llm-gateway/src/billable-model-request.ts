/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import { createHash } from 'node:crypto';
import { attachmentImageMediaTypes } from '@taucad/agent-host/wire';
import { z } from 'zod';
import type { ModelProviderWire } from '#model-invocation.types.js';

/**
 * UTF-8 bytes one serialized funded model request may carry (R1).
 *
 * A request may carry one maximal PDF (16 MiB, 22,369,624 base64 characters)
 * plus its turn. The agent host evicts older attachments past 24,000,000 base64
 * characters, and 32 MB is the request size the largest provider documents. The
 * invocation owner's digest boundary reads this same bound.
 */
export const maximumModelRequestBytes = 32_000_000;
const maximumDepth = 64;
/* Text, signatures and identifiers stay bounded per string; attachment bytes carry their own bounds. */
const maximumStringLength = 4_000_000;
const boundedString = z.string().max(maximumStringLength);
/* `1h` is priced as its own `cache_write` tier; both lifetimes are Anthropic's documented values. */
const cacheControlSchema = z.object({ type: z.literal('ephemeral'), ttl: z.enum(['5m', '1h']).optional() }).strict();
/* Routes a conversation to one supplier server so its prefix cache is found again. The caller
 * sends a hash, never a Tau identifier (I4). OpenAI documents at most 64 characters. */
const promptCacheKeySchema = z.string().min(1).max(64);
/**
 * Whether `value` from `start` on is padded base64: a length and alphabet loop over the string in place (chat
 * performance WP-14 step 6), with no regular expression and no substring of a multi-megabyte attachment.
 *
 * @param value - The string.
 * @param start - Where the base64 begins (after a data URL's prefix).
 * @returns True for padded standard base64, the empty string included.
 */
const isBase64From = (value: string, start = 0): boolean => {
  if ((value.length - start) % 4 !== 0) {
    return false;
  }
  let padding = 0;
  for (let index = start; index < value.length; index += 1) {
    const code = value.codePointAt(index) ?? 0;
    if (code === 0x3d) {
      padding += 1;
    } else if (
      padding > 0 ||
      !(
        (code >= 0x41 && code <= 0x5a) ||
        (code >= 0x61 && code <= 0x7a) ||
        (code >= 0x30 && code <= 0x39) ||
        code === 0x2b ||
        code === 0x2f
      )
    ) {
      return false;
    }
  }
  return padding <= 2;
};
const isBase64 = (value: string): boolean => isBase64From(value);
/* Base64 spends four characters on every three bytes, with the final group padded out. */
const base64Length = (bytes: number): number => 4 * Math.ceil(bytes / 3);
/* D17: an image is capped at 4 MiB of raw bytes, captures included. */
const maximumImageBase64Length = base64Length(4 * 1024 * 1024);
const base64Schema = z.string().max(maximumImageBase64Length).refine(isBase64, 'Invalid base64 image data');
/* The stored image types (`attachmentMedia`, I2): GIF stays so that chats which already hold one still send. */
const imageMediaTypeSchema = z.enum(attachmentImageMediaTypes);
const base64Marker = ';base64,';
const dataImageUrlPrefixLength = Math.max(...attachmentImageMediaTypes.map((type) => `data:${type};base64,`.length));
const dataImageUrlSchema = z
  .string()
  .max(dataImageUrlPrefixLength + maximumImageBase64Length)
  .refine((value) => {
    /* The media type is one of the stored image types, so its end is found within the longest prefix. */
    const marker = value.startsWith('data:') ? value.slice(0, dataImageUrlPrefixLength).indexOf(base64Marker, 5) : -1;
    if (marker === -1 || marker + base64Marker.length > dataImageUrlPrefixLength) {
      return false;
    }
    const start = marker + base64Marker.length;
    return (
      imageMediaTypeSchema.safeParse(value.slice(5, marker)).success &&
      value.length - start <= maximumImageBase64Length &&
      isBase64From(value, start)
    );
  }, 'Invalid image data URL');
/* D24 (amended R1): a PDF attachment is capped at 16 MiB of raw bytes. */
const maximumDocumentBase64Length = base64Length(16 * 1024 * 1024);
const pdfDataUrlPrefix = 'data:application/pdf;base64,';
const documentBase64Schema = z
  .string()
  .max(maximumDocumentBase64Length)
  .refine(isBase64, 'Invalid base64 document data');
const pdfDataUrlSchema = z
  .string()
  .max(pdfDataUrlPrefix.length + maximumDocumentBase64Length)
  .refine(
    (value) =>
      value.startsWith(pdfDataUrlPrefix) &&
      value.length - pdfDataUrlPrefix.length <= maximumDocumentBase64Length &&
      isBase64From(value, pdfDataUrlPrefix.length),
    'Invalid PDF data URL',
  );
const documentNameSchema = z.string().min(1).max(256);

const textSchema = z
  .object({
    type: z.literal('text'),
    text: boundedString,
    cache_control: cacheControlSchema.optional(),
  })
  .strict();
const completionsTextSchema = z.object({ type: z.literal('text'), text: boundedString }).strict();
const inputTextSchema = z.object({ type: z.literal('input_text'), text: boundedString }).strict();
const inputImageSchema = z
  .object({
    type: z.literal('input_image'),
    image_url: dataImageUrlSchema,
    detail: z.enum(['auto', 'low', 'high']).optional(),
  })
  .strict();
const imageUrlSchema = z
  .object({
    type: z.literal('image_url'),
    image_url: z.object({ url: dataImageUrlSchema }).strict(),
  })
  .strict();
const anthropicImageSchema = z
  .object({
    type: z.literal('image'),
    source: z
      .object({
        type: z.literal('base64'),
        media_type: imageMediaTypeSchema,
        data: base64Schema,
      })
      .strict(),
    cache_control: cacheControlSchema.optional(),
  })
  .strict();
/* D24: the three native PDF document blocks, one per provider wire. */
const anthropicDocumentSchema = z
  .object({
    type: z.literal('document'),
    title: documentNameSchema.optional(),
    source: z
      .object({
        type: z.literal('base64'),
        media_type: z.literal('application/pdf'),
        data: documentBase64Schema,
      })
      .strict(),
    cache_control: cacheControlSchema.optional(),
  })
  .strict();
const inputFileSchema = z
  .object({
    type: z.literal('input_file'),
    filename: documentNameSchema,
    file_data: pdfDataUrlSchema,
  })
  .strict();
const completionsFileSchema = z
  .object({
    type: z.literal('file'),
    file: z.object({ filename: documentNameSchema, file_data: pdfDataUrlSchema }).strict(),
  })
  .strict();
const thinkingSchema = z
  .object({
    type: z.literal('thinking'),
    thinking: boundedString,
    signature: boundedString.optional(),
  })
  .strict();
const redactedThinkingSchema = z.object({ type: z.literal('redacted_thinking'), data: boundedString }).strict();
const toolUseSchema = z
  .object({
    type: z.literal('tool_use'),
    id: z.string().min(1).max(256),
    name: z.string().min(1).max(128),
    input: z.record(z.string(), z.unknown()),
  })
  .strict();
const anthropicToolResultContentSchema = z.array(z.union([textSchema, anthropicImageSchema])).max(512);
const toolResultSchema = z
  .object({
    type: z.literal('tool_result'),
    tool_use_id: z.string().min(1).max(256),
    content: z.union([boundedString, anthropicToolResultContentSchema]),
    is_error: z.boolean().optional(),
    cache_control: cacheControlSchema.optional(),
  })
  .strict();
const googleToolCallExtraContentSchema = z
  .object({ google: z.object({ thought_signature: boundedString }).strict() })
  .strict();
/**
 * How Anthropic treats a replayed thinking block whose prefix changed since it was minted: refuse the request, or
 * leave the block out and report it. Either value turns the check on whatever the account's age; it changes which
 * blocks the model reads, not what a token costs. It needs the `thinking-binding-controls-2026-08-01` beta.
 */
const anthropicBlockBindingSchema = z
  .object({ prefix_mismatch_behavior: z.enum(['error', 'drop_block']) })
  .strict()
  .optional();
const anthropicThinkingConfigSchema = z.union([
  z
    .object({
      type: z.literal('adaptive'),
      display: z.enum(['summarized', 'omitted']).optional(),
      block_binding: anthropicBlockBindingSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('enabled'),
      budget_tokens: z.number().int().positive(),
      display: z.enum(['summarized', 'omitted']).optional(),
      block_binding: anthropicBlockBindingSchema,
    })
    .strict(),
]);
const anthropicOutputConfigSchema = z.object({ effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']) }).strict();
/**
 * An effort level carried in the transcript instead of in a top-level field. A top-level change
 * rewrites the provider's cached messages; an appended marker is one more turn and the cache holds.
 * Anthropic reads an empty `system`-role message with `output_config` under the
 * `mid-conversation-output-config-2026-07-01` beta, OpenAI a `configuration_update` item. Each
 * carries the effort and nothing else, so neither can smuggle instructions past the system prompt.
 * Support is per model: the provider itself refuses the form on a model that does not read it.
 */
const anthropicEffortMessageSchema = z
  .object({ role: z.literal('system'), content: z.array(z.never()).max(0), output_config: anthropicOutputConfigSchema })
  .strict();
/** OpenAI's Responses levels; `max` is model-dependent (GPT-6.1 Terra) and the provider refuses it elsewhere. */
const responseReasoningEffortSchema = z.enum(['none', 'low', 'medium', 'high', 'xhigh', 'max']);
const responseConfigurationUpdateSchema = z
  .object({
    type: z.literal('configuration_update'),
    reasoning: z.object({ effort: responseReasoningEffortSchema }).strict(),
  })
  .strict();
const googleReasoningConfigSchema = z
  .object({
    google: z
      .object({
        thinking_config: z
          .object({
            include_thoughts: z.literal(true),
            thinking_level: z.enum(['LOW', 'MEDIUM', 'HIGH', 'XHIGH']),
          })
          .strict(),
        thought_tag_marker: z.literal('think'),
        /* `stream_function_call_arguments` is deliberately absent, and `.strict()`
         * therefore refuses it. Two measured mechanisms keep it off: Vertex sheds
         * requests carrying it with a pre-stream 499 under shared-quota pressure,
         * and its streamed-arguments serializer cancels a turn mid-stream — HTTP
         * 200, real deltas, then a bare `CANCELLED` error array — whenever a tool
         * call closes a nested object on a string value. `apply_parameter_operation`
         * does exactly that and measured 0/9 live with the flag, 9/9 without
         * (blueprint Finding 1; T13-AB and T3-BISECT). */
      })
      .strict(),
  })
  .strict();
const contentSchema = z.union([
  boundedString,
  z
    .array(
      z.union([
        textSchema,
        inputTextSchema,
        inputImageSchema,
        imageUrlSchema,
        anthropicImageSchema,
        anthropicDocumentSchema,
        inputFileSchema,
        completionsFileSchema,
        thinkingSchema,
        redactedThinkingSchema,
        toolUseSchema,
        toolResultSchema,
      ]),
    )
    .max(512),
]);
const messageSchema = z
  .object({
    role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
    content: contentSchema.nullable(),
    output_config: anthropicOutputConfigSchema.optional(),
    name: z.string().min(1).max(128).optional(),
    tool_call_id: z.string().min(1).max(256).optional(),
    tool_calls: z
      .array(
        z
          .object({
            id: z.string().min(1).max(256),
            type: z.literal('function'),
            function: z
              .object({
                name: z.string().min(1).max(128),
                arguments: boundedString,
              })
              .strict(),
            extra_content: googleToolCallExtraContentSchema.optional(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    reasoning_content: boundedString.optional(),
  })
  .strict();
const responseReasoningSchema = z
  .object({
    type: z.literal('reasoning'),
    id: z.string().min(1).max(256),
    summary: z.array(z.object({ type: z.literal('summary_text'), text: boundedString }).strict()).max(512),
    encrypted_content: boundedString.optional(),
    content: z
      .array(z.object({ type: z.literal('reasoning_text'), text: boundedString }).strict())
      .max(512)
      .optional(),
    status: z.enum(['in_progress', 'completed', 'incomplete']).optional(),
  })
  .strict();
const responseFunctionCallSchema = z
  .object({
    type: z.literal('function_call'),
    id: z.string().min(1).max(256).optional(),
    call_id: z.string().min(1).max(256),
    name: z.string().min(1).max(128),
    arguments: boundedString,
    status: z.enum(['in_progress', 'completed', 'incomplete']).optional(),
  })
  .strict();
const responseFunctionOutputSchema = z
  .object({
    type: z.literal('function_call_output'),
    call_id: z.string().min(1).max(256),
    output: z.union([boundedString, z.array(z.union([inputTextSchema, inputImageSchema])).max(512)]),
  })
  .strict();
const responseMessageSchema = z
  .object({
    type: z.literal('message'),
    role: z.literal('assistant'),
    content: z
      .array(
        z.union([
          z
            .object({
              type: z.literal('output_text'),
              text: boundedString,
              annotations: z.array(z.unknown()).max(512),
            })
            .strict(),
          z.object({ type: z.literal('refusal'), refusal: boundedString }).strict(),
        ]),
      )
      .max(512),
    id: z.string().min(1).max(256).optional(),
    status: z.enum(['in_progress', 'completed', 'incomplete']).optional(),
    phase: z.enum(['commentary', 'final_answer']).optional(),
  })
  .strict();
const responseInputSchema = z
  .array(
    z.union([
      messageSchema,
      responseReasoningSchema,
      responseFunctionCallSchema,
      responseFunctionOutputSchema,
      responseMessageSchema,
      responseConfigurationUpdateSchema,
    ]),
  )
  .max(512);

export const billableModelRequestSchema = z
  .object({
    model: z.string().min(1).max(128),
    max_output_tokens: z.number().int().positive().optional(),
    max_completion_tokens: z.number().int().positive().optional(),
    max_tokens: z.number().int().positive().optional(),
    stream: z.literal(true),
    stream_options: z
      .object({ include_usage: z.literal(true) })
      .strict()
      .optional(),
    store: z.literal(false).optional(),
    prompt_cache_key: promptCacheKeySchema.optional(),
    input: z.union([contentSchema, responseInputSchema]).optional(),
    messages: z.array(messageSchema).max(512).optional(),
    system: contentSchema.optional(),
    instructions: boundedString.optional(),
    include: z.array(z.literal('reasoning.encrypted_content')).max(1).optional(),
    reasoning: z
      .object({
        effort: responseReasoningEffortSchema,
        summary: z.enum(['auto', 'concise', 'detailed']).optional(),
      })
      .strict()
      .optional(),
    thinking: anthropicThinkingConfigSchema.optional(),
    output_config: anthropicOutputConfigSchema.optional(),
    extra_body: googleReasoningConfigSchema.optional(),
    tool_choice: z
      .union([
        z.enum(['auto', 'none', 'required']),
        z
          .object({
            type: z.literal('function'),
            name: z.string().min(1).max(128),
          })
          .strict(),
        z.object({ type: z.enum(['auto', 'any']) }).strict(),
        z.object({ type: z.literal('tool'), name: z.string().min(1).max(128) }).strict(),
      ])
      .optional(),
    tools: z
      .array(
        z.union([
          z
            .object({
              type: z.literal('function'),
              function: z
                .object({
                  name: z.string().min(1).max(128),
                  description: z.string().max(4096).optional(),
                  parameters: z.record(z.string(), z.unknown()),
                  strict: z.literal(false).optional(),
                })
                .strict(),
            })
            .strict(),
          z
            .object({
              type: z.literal('function'),
              name: z.string().min(1).max(128),
              description: z.string().max(4096).optional(),
              parameters: z.record(z.string(), z.unknown()),
            })
            .strict(),
          z
            .object({
              name: z.string().min(1).max(128),
              description: z.string().max(4096).optional(),
              eager_input_streaming: z.literal(true).optional(),
              input_schema: z.record(z.string(), z.unknown()),
              cache_control: cacheControlSchema.optional(),
            })
            .strict(),
        ]),
      )
      .max(128)
      .optional(),
  })
  .strict();

export type BillableModelRequest = z.infer<typeof billableModelRequestSchema>;
export type BillableModelRequestParseResult =
  | { readonly success: true; readonly data: BillableModelRequest }
  | { readonly success: false; readonly error: z.ZodError };

const withinDepth = (root: unknown): boolean => {
  const pending: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }];
  // oxlint-disable-next-line typescript/no-restricted-types -- WeakSet's native key constraint is object identity.
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.value === null || typeof current.value !== 'object') {
      continue;
    }
    if (current.depth >= maximumDepth || seen.has(current.value)) {
      return false;
    }
    seen.add(current.value);
    for (const value of Object.values(current.value as Record<string, unknown>)) {
      pending.push({ value, depth: current.depth + 1 });
    }
  }
  return true;
};

const responsesConversationSchema = z.union([
  z.object({ role: z.enum(['system', 'developer']), content: boundedString }).strict(),
  z
    .object({
      role: z.literal('user'),
      content: z.union([
        boundedString,
        z.array(z.union([inputTextSchema, inputImageSchema, inputFileSchema])).max(512),
      ]),
    })
    .strict(),
]);
const responsesWireSchema = z
  .object({
    model: z.string(),
    input: z.union([
      boundedString,
      z
        .array(
          z.union([
            responsesConversationSchema,
            responseReasoningSchema,
            responseFunctionCallSchema,
            responseFunctionOutputSchema,
            responseMessageSchema,
            responseConfigurationUpdateSchema,
          ]),
        )
        .max(512),
    ]),
    stream: z.literal(true),
    store: z.literal(false).optional(),
    prompt_cache_key: promptCacheKeySchema.optional(),
    max_output_tokens: z.number(),
    reasoning: z
      .object({
        effort: responseReasoningEffortSchema,
        summary: z.enum(['auto', 'concise', 'detailed']).optional(),
      })
      .strict()
      .optional(),
    stream_options: z
      .object({ include_usage: z.literal(true) })
      .strict()
      .optional(),
    instructions: boundedString.optional(),
    include: z.array(z.literal('reasoning.encrypted_content')).max(1).optional(),
    tools: z
      .array(
        z
          .object({
            type: z.literal('function'),
            name: z.string(),
            description: z.string().optional(),
            parameters: z.record(z.string(), z.unknown()),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    tool_choice: z
      .union([
        z.enum(['auto', 'none', 'required']),
        z.object({ type: z.literal('function'), name: z.string() }).strict(),
      ])
      .optional(),
  })
  .strict();
const anthropicUserContentSchema = z.union([
  boundedString,
  z.array(z.union([textSchema, anthropicImageSchema, anthropicDocumentSchema, toolResultSchema])).max(512),
]);
const anthropicAssistantContentSchema = z.union([
  boundedString,
  z.array(z.union([textSchema, thinkingSchema, redactedThinkingSchema, toolUseSchema])).max(512),
]);
const anthropicMessageSchema = z.union([
  z.object({ role: z.literal('user'), content: anthropicUserContentSchema }).strict(),
  z
    .object({
      role: z.literal('assistant'),
      content: anthropicAssistantContentSchema,
    })
    .strict(),
  anthropicEffortMessageSchema,
]);
const anthropicWireSchema = z
  .object({
    model: z.string(),
    messages: z.array(anthropicMessageSchema).max(512),
    max_tokens: z.number(),
    stream: z.literal(true),
    system: z.union([boundedString, z.array(textSchema).max(512)]).optional(),
    thinking: anthropicThinkingConfigSchema.optional(),
    output_config: anthropicOutputConfigSchema.optional(),
    tools: z
      .array(
        z
          .object({
            name: z.string(),
            description: z.string().optional(),
            eager_input_streaming: z.literal(true).optional(),
            input_schema: z.record(z.string(), z.unknown()),
            cache_control: cacheControlSchema.optional(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    tool_choice: z
      .union([
        z.object({ type: z.enum(['auto', 'any']) }).strict(),
        z.object({ type: z.literal('tool'), name: z.string() }).strict(),
      ])
      .optional(),
  })
  .strict();
const completionsContentSchema = z.union([
  boundedString,
  z.null(),
  z.array(z.union([completionsTextSchema, imageUrlSchema, completionsFileSchema])).max(512),
]);
const completionsMessageSchema = z
  .object({
    role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
    content: completionsContentSchema,
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z
      .array(
        z
          .object({
            id: z.string(),
            type: z.literal('function'),
            function: z.object({ name: z.string(), arguments: boundedString }).strict(),
            extra_content: googleToolCallExtraContentSchema.optional(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    reasoning_content: boundedString.optional(),
  })
  .strict();
const completionsWireSchema = z
  .object({
    model: z.string(),
    messages: z.array(completionsMessageSchema).max(512),
    stream: z.literal(true),
    stream_options: z
      .object({ include_usage: z.literal(true) })
      .strict()
      .optional(),
    store: z.literal(false).optional(),
    max_completion_tokens: z.number().optional(),
    max_tokens: z.number().optional(),
    extra_body: googleReasoningConfigSchema.optional(),
    tools: z
      .array(
        z
          .object({
            type: z.literal('function'),
            function: z
              .object({
                name: z.string(),
                description: z.string().optional(),
                parameters: z.record(z.string(), z.unknown()),
                strict: z.literal(false).optional(),
              })
              .strict(),
          })
          .strict(),
      )
      .max(128)
      .optional(),
    tool_choice: z
      .union([
        z.enum(['auto', 'none', 'required']),
        z.object({ type: z.literal('function'), name: z.string() }).strict(),
      ])
      .optional(),
  })
  .strict();

const wireSchema = (wire: ModelProviderWire) =>
  wire === 'openai-responses'
    ? responsesWireSchema
    : wire === 'anthropic'
      ? anthropicWireSchema
      : completionsWireSchema;

/** Parse the closed native provider request after aggregate depth and UTF-8 byte bounds. */
export const safeParseBillableModelRequest = (
  body: unknown,
  providerWire: ModelProviderWire,
): BillableModelRequestParseResult => {
  if (!withinDepth(body)) {
    return { success: false, error: new z.ZodError([]) };
  }
  let serialized: unknown;
  try {
    serialized = JSON.stringify(body);
  } catch {
    return { success: false, error: new z.ZodError([]) };
  }
  if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > maximumModelRequestBytes) {
    return { success: false, error: new z.ZodError([]) };
  }
  const parsed = billableModelRequestSchema.safeParse(body);
  if (!parsed.success || !wireSchema(providerWire).safeParse(body).success) {
    return parsed.success ? { success: false, error: new z.ZodError([]) } : parsed;
  }
  return parsed;
};

/** Read the request's single native output-token ceiling. */
export const billableModelOutputMaximum = (body: BillableModelRequest): bigint | undefined => {
  const values = [body.max_output_tokens, body.max_completion_tokens, body.max_tokens].filter(
    (value): value is number => value !== undefined,
  );
  return values.length === 1 ? BigInt(values[0]!) : undefined;
};

/* Q1 overhead constants, ratified 2026-09-12 with the byte-bound reserve promise. */
const perMessageTokens = 64n;
const perRouteTokens = 4096n;
const perImageTokens = 3000n;
const imageElementTypes = new Set(['image', 'image_url', 'input_image']);
/* Every `type` literal `billableModelRequestSchema` admits outside an image element.
 * A request element whose type is absent here has no documented token bound and
 * fails the whole request closed onto the provider's context limit. The document
 * elements `document`, `input_file` and `file` are deliberately absent: a PDF's
 * tokens come from its rendered pages, not from the length of its base64, so its
 * bytes are not a bound on them and the whole context is the only honest ceiling. */
const boundedElementTypes = new Set([
  'adaptive',
  'any',
  'auto',
  'configuration_update',
  'ephemeral',
  'enabled',
  'function',
  'function_call',
  'function_call_output',
  'message',
  'none',
  'output_text',
  'reasoning',
  'reasoning_text',
  'redacted_thinking',
  'refusal',
  'required',
  'summary_text',
  'text',
  'input_text',
  'thinking',
  'tool',
  'tool_result',
  'tool_use',
]);
/* Free-form JSON the caller supplies: tool schemas, tool-call arguments and provider
 * annotations. Their bytes are inside the serialized bound, and their own `type`
 * members are JSON-Schema vocabulary rather than request elements, so they are not
 * matched against the element registry. */
const freeFormMembers = new Set(['annotations', 'input_schema', 'parameters']);
const freeFormMember = (elementType: string | undefined, key: string): boolean =>
  freeFormMembers.has(key) || (elementType === 'tool_use' && key === 'input');

const utf8Bytes = (value: string): bigint => BigInt(new TextEncoder().encode(value).byteLength);

const conversationLength = (body: BillableModelRequest): bigint => {
  const count = (value: unknown): number => (Array.isArray(value) ? value.length : value === undefined ? 0 : 1);
  return BigInt(count(body.input) + count(body.messages) + count(body.system) + count(body.instructions));
};

/**
 * The image count and bytes inside `value`, or `undefined` when an element has no documented token bound.
 *
 * @param value - A whole request or part of one.
 * @returns What the byte bound subtracts and adds back for images.
 */
const elementBound = (value: unknown): { readonly images: bigint; readonly imageBytes: bigint } | undefined => {
  let images = 0n;
  let imageBytes = 0n;
  const unbounded: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item);
      }
      return;
    }
    if (node === null || typeof node !== 'object') {
      return;
    }
    const declared = (node as { type?: unknown }).type;
    const elementType = typeof declared === 'string' ? declared : undefined;
    if (elementType !== undefined && imageElementTypes.has(elementType)) {
      images += 1n;
      imageBytes += utf8Bytes(JSON.stringify(node));
      return;
    }
    if (elementType !== undefined && !boundedElementTypes.has(elementType)) {
      unbounded.push(elementType);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (!freeFormMember(elementType, key)) {
        visit(value);
      }
    }
  };
  visit(value);
  return unbounded.length > 0 ? undefined : { images, imageBytes };
};

/** The text bytes of `value` with its images replaced by their per-image maximum. */
const textAndImageBound = (value: unknown): bigint | undefined => {
  const bound = elementBound(value);
  if (bound === undefined) {
    return undefined;
  }
  const textBytes = utf8Bytes(JSON.stringify(value)) - bound.imageBytes;
  return (textBytes < 0n ? 0n : textBytes) + bound.images * perImageTokens;
};

/**
 * Upper bound on the input tokens a qualified request can be billed for.
 *
 * Every tokenizer these routes use — byte-level BPE, SentencePiece and unigram —
 * has a vocabulary of non-empty byte sequences, so a token never spans fewer than
 * one byte of the text it encodes. The serialized request is therefore a hard
 * bound on its own text tokens, and it is the exact payload the gateway forwards,
 * so JSON punctuation, member names and tool schemas are all inside the bound.
 * Image bytes are not a bound on image tokens, so each image element is removed
 * from the byte total and replaced by its documented per-image maximum. Chat
 * template and provider-injected system tokens are covered by the per-message and
 * per-route constants ratified in Q1.
 *
 * @param body - The parsed native provider request.
 * @returns The bound in tokens, or `undefined` when an element carries no documented bound.
 */
export const billableModelInputBound = (body: BillableModelRequest): bigint | undefined => {
  const bound = textAndImageBound(body);
  return bound === undefined ? undefined : bound + conversationLength(body) * perMessageTokens + perRouteTokens;
};

/**
 * A request's conversation prefix, stored with its operation so that the next step of the same conversation can
 * be held from the input tokens the supplier reported for it (chat performance WP-15 step 6, ruling O-6).
 */
export type BillableInputPrefix = {
  readonly version: 'input-prefix-v1';
  /** `sha256:` over the request without its output maximum and its conversation, then each conversation item. */
  readonly digest: string;
  /** How many conversation items the digest covers. */
  readonly items: number;
};

/* The output maximum changes nothing the supplier counts as input, and the conversation is digested per item. */
const nonInputMembers = new Set(['max_output_tokens', 'max_completion_tokens', 'max_tokens']);

const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_key, member: unknown) =>
    member !== null && typeof member === 'object' && !Array.isArray(member)
      ? Object.fromEntries(Object.entries(member).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : member,
  );

/** The conversation array a wire carries: `input` (Responses) or `messages` (Messages, Chat Completions). */
const conversationOf = (
  body: BillableModelRequest,
): { readonly key: 'input' | 'messages'; readonly items: readonly unknown[] } | undefined =>
  Array.isArray(body.input)
    ? { key: 'input', items: body.input }
    : Array.isArray(body.messages) && body.input === undefined
      ? { key: 'messages', items: body.messages }
      : undefined;

/**
 * Per-prefix digests: one hash over everything that is not the conversation, chained over each item, so that the
 * digest of every prefix is read in one pass over the body.
 */
const prefixDigests = (body: BillableModelRequest, key: 'input' | 'messages', items: readonly unknown[]): string[] => {
  const rest = Object.fromEntries(
    Object.entries(body).filter(([member]) => member !== key && !nonInputMembers.has(member)),
  );
  let chain = createHash('sha256')
    .update(`input-prefix-v1:${key}:${canonicalJson(rest)}`)
    .digest('hex');
  const digests = [`sha256:${chain}`];
  for (const item of items) {
    chain = createHash('sha256').update(chain).update(canonicalJson(item)).digest('hex');
    digests.push(`sha256:${chain}`);
  }
  return digests;
};

/**
 * The prefix this request offers the next step, and the hold bound it earns from the step before it.
 *
 * The bound is `undefined` unless `previous` covers a strict prefix of this conversation with every other member
 * equal. Then it is the supplier-reported input tokens of that step plus, for the items after it, one token per
 * serialized byte with each image at its per-image maximum and the per-message template constant. Every item of the
 * prefix was counted by the supplier in that step; appending items can only drop earlier reasoning, never count the
 * prefix again larger, so the sum stays an upper bound (`tau_billing_funded_operation_above_hold_settlements_total` watches it).
 *
 * @param body - The parsed native provider request.
 * @param previous - The prefix and reported input tokens of the conversation's previous settled step, if any.
 * @returns This request's own prefix and, when the previous one matches, the bound it earns.
 */
export const billableModelInputPrefix = (
  body: BillableModelRequest,
  previous?: { readonly prefix: BillableInputPrefix; readonly inputTokens: bigint },
): { readonly prefix: BillableInputPrefix; readonly bound?: bigint } | undefined => {
  const conversation = conversationOf(body);
  if (conversation === undefined || conversation.items.length === 0) {
    return undefined;
  }
  const digests = prefixDigests(body, conversation.key, conversation.items);
  const prefix: BillableInputPrefix = {
    version: 'input-prefix-v1',
    digest: digests.at(-1)!,
    items: conversation.items.length,
  };
  if (
    previous === undefined ||
    previous.prefix.items < 1 ||
    previous.prefix.items >= conversation.items.length ||
    digests[previous.prefix.items] !== previous.prefix.digest
  ) {
    return { prefix };
  }
  const added = conversation.items.slice(previous.prefix.items);
  const addedBound = textAndImageBound(added);
  return addedBound === undefined
    ? { prefix }
    : { prefix, bound: previous.inputTokens + addedBound + BigInt(added.length) * perMessageTokens };
};

/** Whether a qualified native request carries an image. */
export const billableModelRequestContainsImage = (body: BillableModelRequest): boolean => {
  const pending: unknown[] = [body];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object') {
      continue;
    }
    if ('type' in value && ['image', 'image_url', 'input_image'].includes(String(value.type))) {
      return true;
    }
    pending.push(...Object.values(value as Record<string, unknown>));
  }
  return false;
};
