/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import { z } from 'zod';
import type { BillableProviderWire } from '#api/billing/billable-model-invocation.types.js';

/* R1: a request may carry one maximal PDF (16 MiB, 22,369,624 base64 characters)
 * plus its turn. The agent host evicts older attachments past 24,000,000 base64
 * characters, and 32 MB is the request size the largest provider documents. */
const maximumBytes = 32_000_000;
const maximumDepth = 64;
/* Text, signatures and identifiers stay bounded per string; attachment bytes carry their own bounds. */
const maximumStringLength = 4_000_000;
const boundedString = z.string().max(maximumStringLength);
const cacheControlSchema = z.object({ type: z.literal('ephemeral'), ttl: z.literal('5m').optional() }).strict();
/* Linear on purpose: a backtracking group per quadruple overflows V8's regexp stack
 * on a multi-megabyte attachment. Length and padding position are checked apart. */
const isBase64 = (value: string): boolean => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/u.test(value);
/* Base64 spends four characters on every three bytes, with the final group padded out. */
const base64Length = (bytes: number): number => 4 * Math.ceil(bytes / 3);
/* D17: an image is capped at 4 MiB of raw bytes, captures included. */
const maximumImageBase64Length = base64Length(4 * 1024 * 1024);
const base64Schema = z.string().max(maximumImageBase64Length).refine(isBase64, 'Invalid base64 image data');
const imageMediaTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const dataImageUrlSchema = z
  .string()
  .max('data:image/jpeg;base64,'.length + maximumImageBase64Length)
  .refine((value) => {
    const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.*)$/u.exec(value);
    return match !== null && base64Schema.safeParse(match[2]).success;
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
  .refine((value) => {
    const match = /^data:application\/pdf;base64,(.*)$/u.exec(value);
    return match !== null && documentBase64Schema.safeParse(match[1]).success;
  }, 'Invalid PDF data URL');
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
const anthropicThinkingConfigSchema = z.union([
  z.object({ type: z.literal('adaptive'), display: z.enum(['summarized', 'omitted']).optional() }).strict(),
  z
    .object({
      type: z.literal('enabled'),
      budget_tokens: z.number().int().positive(),
      display: z.enum(['summarized', 'omitted']).optional(),
    })
    .strict(),
]);
const anthropicOutputConfigSchema = z.object({ effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']) }).strict();
const googleReasoningConfigSchema = z
  .object({
    google: z
      .object({
        /* The thinking pair travels together and only on a turn that asks for
         * reasoning; a reasoning-free Vertex turn sends the streamed-arguments
         * flag alone, so neither can be required. */
        thinking_config: z
          .object({
            include_thoughts: z.literal(true),
            thinking_level: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          })
          .strict()
          .optional(),
        thought_tag_marker: z.literal('think').optional(),
        /* Four tool-argument deltas per call instead of one. Round one refused
         * this flag after 14/14 function calls answered 499 CANCELLED; the
         * powered A/B on Tau's real body then measured 0/240, and every one of
         * those 499s fell inside a single window of shared-quota pressure
         * (blueprint Finding 1, ruling Q1). `true` is the only value Tau sends,
         * so it is the only one admitted, and a 499 to a request carrying it is
         * re-dispatched once without it in `executeGatewayProviderRequest`. */
        stream_function_call_arguments: z.literal(true).optional(),
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
    input: z.union([contentSchema, responseInputSchema]).optional(),
    messages: z.array(messageSchema).max(512).optional(),
    system: contentSchema.optional(),
    instructions: boundedString.optional(),
    include: z.array(z.literal('reasoning.encrypted_content')).max(1).optional(),
    reasoning: z
      .object({
        effort: z.enum(['none', 'low', 'medium', 'high', 'xhigh']),
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
                  strict: z.literal(false),
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
          ]),
        )
        .max(512),
    ]),
    stream: z.literal(true),
    store: z.literal(false).optional(),
    max_output_tokens: z.number(),
    reasoning: z
      .object({
        effort: z.enum(['none', 'low', 'medium', 'high', 'xhigh']),
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
                strict: z.literal(false),
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

const wireSchema = (wire: BillableProviderWire) =>
  wire === 'openai-responses'
    ? responsesWireSchema
    : wire === 'anthropic'
      ? anthropicWireSchema
      : completionsWireSchema;

/** Parse the closed native provider request after aggregate depth and UTF-8 byte bounds. */
export const safeParseBillableModelRequest = (
  body: unknown,
  providerWire: BillableProviderWire,
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
  if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > maximumBytes) {
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
  visit(body);
  if (unbounded.length > 0) {
    return undefined;
  }
  const textBytes = utf8Bytes(JSON.stringify(body)) - imageBytes;
  return (
    (textBytes < 0n ? 0n : textBytes) +
    conversationLength(body) * perMessageTokens +
    perRouteTokens +
    images * perImageTokens
  );
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
