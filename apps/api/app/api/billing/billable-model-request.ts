/* eslint-disable @typescript-eslint/naming-convention -- provider wire keys use native snake_case. */
import { z } from 'zod';
import type { BillableProviderWire } from '#api/billing/billable-model-invocation.types.js';

const maximumBytes = 4_000_000;
const maximumDepth = 64;
const boundedString = z.string().max(maximumBytes);
const cacheControlSchema = z.object({ type: z.literal('ephemeral'), ttl: z.literal('5m').optional() }).strict();
const base64Schema = boundedString.refine(
  (value) => value.length % 4 === 0 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value),
  'Invalid base64 image data',
);
const imageMediaTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const dataImageUrlSchema = boundedString.refine((value) => {
  const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.*)$/u.exec(value);
  return match !== null && base64Schema.safeParse(match[2]).success;
}, 'Invalid image data URL');

const textSchema = z
  .object({ type: z.literal('text'), text: boundedString, cache_control: cacheControlSchema.optional() })
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
  .object({ type: z.literal('image_url'), image_url: z.object({ url: dataImageUrlSchema }).strict() })
  .strict();
const anthropicImageSchema = z
  .object({
    type: z.literal('image'),
    source: z.object({ type: z.literal('base64'), media_type: imageMediaTypeSchema, data: base64Schema }).strict(),
    cache_control: cacheControlSchema.optional(),
  })
  .strict();
const thinkingSchema = z
  .object({ type: z.literal('thinking'), thinking: boundedString, signature: boundedString.optional() })
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
            function: z.object({ name: z.string().min(1).max(128), arguments: boundedString }).strict(),
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
            .object({ type: z.literal('output_text'), text: boundedString, annotations: z.array(z.unknown()).max(512) })
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
        effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']),
        summary: z.enum(['auto', 'concise', 'detailed']).optional(),
      })
      .strict()
      .optional(),
    thinking: z
      .object({ type: z.literal('adaptive') })
      .strict()
      .optional(),
    tool_choice: z
      .union([
        z.enum(['auto', 'none', 'required']),
        z.object({ type: z.literal('function'), name: z.string().min(1).max(128) }).strict(),
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
      content: z.union([boundedString, z.array(z.union([inputTextSchema, inputImageSchema])).max(512)]),
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
        effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']),
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
  z.array(z.union([textSchema, anthropicImageSchema, toolResultSchema])).max(512),
]);
const anthropicAssistantContentSchema = z.union([
  boundedString,
  z.array(z.union([textSchema, thinkingSchema, redactedThinkingSchema, toolUseSchema])).max(512),
]);
const anthropicMessageSchema = z.union([
  z.object({ role: z.literal('user'), content: anthropicUserContentSchema }).strict(),
  z.object({ role: z.literal('assistant'), content: anthropicAssistantContentSchema }).strict(),
]);
const anthropicWireSchema = z
  .object({
    model: z.string(),
    messages: z.array(anthropicMessageSchema).max(512),
    max_tokens: z.number(),
    stream: z.literal(true),
    system: z.union([boundedString, z.array(textSchema).max(512)]).optional(),
    thinking: z
      .object({ type: z.literal('adaptive') })
      .strict()
      .optional(),
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
  z.array(z.union([completionsTextSchema, imageUrlSchema])).max(512),
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
