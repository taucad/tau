import type { Evidence } from '#contract.js';
import { contentLimits, evidenceLimits } from '#contract.js';
import { redactSource, retainText, utf8Prefix } from '#content-redaction.js';
import { sha256Hex } from '#identity.js';

/*
 * Host content (LW6, LQ2, LQ3, LQ16): what a run's committed rows say in words, as the content contract carries it.
 * A tool's arguments go in and its result comes out; a run's root takes this turn's message in and its reply, the
 * design it left at its final revision and one line per check out. Every text part is source-redacted (`content-v1`)
 * and capped; a tool result over the 64 KiB cap keeps only its size and digest, an image only its type and size, and
 * design source past 128 KiB in total only its size and digest. Nothing is read from the live workspace, so a later
 * projection of the same rows writes the same bytes.
 */

type ContentPayload = Extract<Evidence['payload'], { plane: 'content' }>;
type MaybeSection = ContentPayload['input'];
type Section = NonNullable<MaybeSection>;
type Message = Section['messages'][number];
type Part = Message['parts'][number];
type MediaPart = Extract<Part, { kind: 'media' }>;
type Coverage = Evidence['coverage']['input'];

/** One model file as the run's final revision holds it: its text, or none when it is not UTF-8 text. @public */
export type DesignFile = Readonly<{ path: string; text: string | undefined; bytes: number }>;

/**
 * Reads the changed model files at a revision, never from the live workspace. A path the revision does not hold (a
 * deleted file) is left out. @public
 */
export type DesignReader = (
  input: Readonly<{ revision: string; paths: readonly string[] }>,
) => Promise<readonly DesignFile[]>;

/** How much text one envelope keeps; each smaller scale is tried when the one before did not fit. */
export type ContentScale = Readonly<{ part: number; design: number }>;

/** The scales tried in order: the contract's 64 KiB part and the 128 KiB design cap, then a quarter, then a sixteenth. */
export const contentScales: readonly ContentScale[] = [1, 4, 16].map((divisor) => ({
  part: evidenceLimits.text / divisor,
  design: 131_072 / divisor,
}));

/** An image or file is digested only up to this size, so hashing a large attachment never blocks the host. */
const digestLimitBytes = 1_048_576;
const mimeShape = /^[\w.+-]{1,64}\/[\w.+-]{1,64}$/u;
const encoder = new TextEncoder();
const utf8Bytes = (text: string): number => encoder.encode(text).byteLength;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const decodedBytes = (base64: string): number =>
  Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0));

const mediaPart = async (mime: unknown, bytes: number, body: string | undefined): Promise<MediaPart> => ({
  kind: 'media',
  mime: typeof mime === 'string' && mimeShape.test(mime) ? mime : 'application/octet-stream',
  bytes,
  digest: body !== undefined && bytes <= digestLimitBytes ? await sha256Hex(body) : null,
});

/**
 * A row's content as text and media: a string as it is, content blocks as their text joined by newlines with images
 * and file references as media, and any other value as its JSON. Readable thinking and tool calls inside an assistant
 * message are not text: a reply is only what the model said.
 */
const textAndMedia = async (value: unknown): Promise<Readonly<{ text: string | undefined; media: MediaPart[] }>> => {
  if (typeof value === 'string') {
    return { text: value, media: [] };
  }
  if (!Array.isArray(value)) {
    return { text: value === undefined ? undefined : JSON.stringify(value), media: [] };
  }
  const texts: string[] = [];
  const media: MediaPart[] = [];
  for (const block of value as readonly unknown[]) {
    const type = isRecord(block) ? block['type'] : undefined;
    if (!isRecord(block) || type === 'thinking' || type === 'toolCall' || type === 'redactedThinking') {
      continue;
    }
    if (type === 'text' && typeof block['text'] === 'string') {
      texts.push(block['text']);
    } else if (type === 'image' && typeof block['data'] === 'string') {
      // oxlint-disable-next-line no-await-in-loop -- one digest per image, in order
      media.push(await mediaPart(block['mimeType'], decodedBytes(block['data']), block['data']));
    } else if (type === 'file-ref') {
      const bytes = block['byteLength'];
      // oxlint-disable-next-line no-await-in-loop -- in order with the images
      media.push(await mediaPart(block['mimeType'], typeof bytes === 'number' && bytes >= 0 ? bytes : 0, undefined));
    } else {
      texts.push(JSON.stringify(block));
    }
  }
  return { text: texts.length === 0 ? undefined : texts.join('\n'), media };
};

/** What a section's parts say about its coverage: the strongest label any part carries. */
export const sectionCoverage = (section: MaybeSection, absent: Coverage): Coverage => {
  if (section === null) {
    return absent;
  }
  const labels = new Set(
    section.messages.flatMap((message) => message.parts.map((part) => ('redaction' in part ? part.redaction : 'none'))),
  );
  if (section.omitted > 0 || labels.has('truncated')) {
    return 'truncated';
  }
  return labels.has('redacted') ? 'redacted' : 'complete';
};

/** At most the contract's parts in one message; the rest are counted as omitted. */
const bounded = (role: Message['role'], parts: readonly Part[]): Readonly<{ message: Message; omitted: number }> => ({
  message: { role, parts: parts.slice(0, contentLimits.parts) },
  omitted: Math.max(0, parts.length - contentLimits.parts),
});

/** A tool's arguments and result as the content contract carries them. @public */
export type ToolContentInput = Readonly<{
  call: string;
  name: string;
  failed: boolean;
  arguments: unknown;
  /** Absent while the call has no committed result. */
  result?: unknown;
  hasResult: boolean;
}>;

/**
 * A tool call's content (LQ3(b)): its arguments in, as the call the model made, and its result out. A result over the
 * part cap keeps only its size and the digest of its whole text; an image only its type and size.
 *
 * @param tool - The call, its reported name and what its rows recorded.
 * @param scale - How much text to keep.
 * @returns The input and output sections, the output `null` while the call has no result.
 * @public
 */
export const toolContent = async (
  tool: ToolContentInput,
  scale: ContentScale,
): Promise<Readonly<{ input: Section; output: MaybeSection }>> => {
  const args = typeof tool.arguments === 'string' ? tool.arguments : JSON.stringify(tool.arguments ?? {});
  const input: Section = {
    messages: [
      {
        role: 'assistant',
        parts: [{ kind: 'tool-call', call: tool.call, name: tool.name, ...retainText(args, scale.part) }],
      },
    ],
    omitted: 0,
  };
  if (!tool.hasResult) {
    return { input, output: null };
  }
  const { text = '', media } = await textAndMedia(tool.result);
  const resultPart: Part =
    utf8Bytes(text) > evidenceLimits.text
      ? {
          kind: 'tool-result',
          call: tool.call,
          error: tool.failed,
          digest: await sha256Hex(text),
          text: '',
          originalBytes: utf8Bytes(text),
          retainedBytes: 0,
          redaction: 'truncated',
        }
      : { kind: 'tool-result', call: tool.call, error: tool.failed, digest: null, ...retainText(text, scale.part) };
  const { message, omitted } = bounded('tool', [resultPart, ...media]);
  return { input, output: { messages: [message], omitted } };
};

/** A settled CAD check, as one line of the root's output. @public */
export type CheckLine = Readonly<{
  tool: string;
  result: Extract<Part, { kind: 'check' }>['result'];
  requirements: readonly string[];
}>;

/** What a run's root records in words. @public */
export type RootContentInput = Readonly<{
  prompt: unknown;
  reply: unknown;
  design: readonly DesignFile[];
  checks: readonly CheckLine[];
}>;

const textPart = (text: string, scale: ContentScale): Part => ({ kind: 'text', ...retainText(text, scale.part) });

const sourcePart = async (file: DesignFile, keep: boolean, scale: ContentScale): Promise<Part> => {
  // oxlint-disable-next-line no-control-regex -- control characters are what a path may not carry.
  const path = utf8Prefix(redactSource(file.path).text.replaceAll(/[\u0000-\u001F]/gu, ''), 256) || '[path]';
  if (file.text === undefined || !keep) {
    return {
      kind: 'source',
      path,
      digest: file.text === undefined ? null : await sha256Hex(file.text),
      text: '',
      originalBytes: file.bytes,
      retainedBytes: 0,
      redaction: 'truncated',
    };
  }
  return { kind: 'source', path, digest: null, ...retainText(file.text, scale.part) };
};

/**
 * A run's root content (LW6): this turn's message in; the reply, the changed design source and one line per check out.
 * Design source is kept whole file by file, in path order, while the files fit the design cap and each fits the part
 * cap; any other file keeps only its size and digest.
 *
 * @param root - What the run's rows and its final revision say.
 * @param scale - How much text to keep.
 * @returns The input section, `null` without a message, and the output section, `null` when there is nothing.
 * @public
 */
export const rootContent = async (
  root: RootContentInput,
  scale: ContentScale,
): Promise<Readonly<{ input: MaybeSection; output: MaybeSection }>> => {
  const prompt = await textAndMedia(root.prompt);
  const promptParts: Part[] = [...(prompt.text === undefined ? [] : [textPart(prompt.text, scale)]), ...prompt.media];
  const promptMessage = bounded('user', promptParts);
  const reply = await textAndMedia(root.reply);
  let remaining = scale.design;
  const design: Part[] = [];
  for (const file of root.design.toSorted((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
  )) {
    const keep = file.text !== undefined && file.bytes <= Math.min(remaining, scale.part);
    if (keep) {
      remaining -= file.bytes;
    }
    // oxlint-disable-next-line no-await-in-loop -- one file at a time, in path order, against one budget
    design.push(await sourcePart(file, keep, scale));
  }
  const checks = root.checks.map(
    (check): Part => ({
      kind: 'check',
      result: check.result,
      ...retainText(
        `${check.tool} ${check.result}: ${check.requirements.join(', ') || 'no requirements named'}`,
        scale.part,
      ),
    }),
  );
  const outputParts: Part[] = [
    ...(reply.text === undefined ? [] : [textPart(reply.text, scale)]),
    ...design,
    ...checks,
  ];
  const outputMessage = bounded('assistant', outputParts);
  return {
    input: promptParts.length === 0 ? null : { messages: [promptMessage.message], omitted: promptMessage.omitted },
    output: outputParts.length === 0 ? null : { messages: [outputMessage.message], omitted: outputMessage.omitted },
  };
};
