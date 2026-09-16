/**
 * The one renderer for a tool call Tau did not dispatch.
 *
 * ACP is the boundary vocabulary (V3): an external agent's call arrives as a
 * `dynamic-tool` part whose `tau` tool metadata carries the emitter's own
 * `kind`, `title`, `status`, `locations` and rendered content. This switches on
 * that `kind` — never on the agent — so a new adapter, or a tool no one has
 * seen, renders through the same ten branches instead of falling to the
 * unknown-part card. Tau's own tools keep their bespoke renderers; this is the
 * floor, not their replacement.
 *
 * Every string here was written by the agent, so it is untrusted: titles and
 * text are stripped of control and bidirectional-override characters, folded
 * onto one line and bounded before they reach the DOM (the CLI's `oneLine` is
 * the same idea at the same boundary).
 */

import { ArrowRight, Brain, FileText, Globe, Pencil, Repeat, Search, Terminal, Trash2, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DynamicToolUIPart } from 'ai';
import { isRecord } from '@taucad/utils/schema';
import { createFileEditDiffStats } from '@taucad/chat/rpc';
import {
  ChatToolCard,
  ChatToolCardContent,
  ChatToolCardHeader,
  ChatToolCardIcon,
  ChatToolCardList,
  ChatToolCardListItem,
  ChatToolCardTitle,
} from '#components/chat/chat-tool-card.js';
import { ChatToolLabel } from '#components/chat/chat-tool-label.js';
import { ChatToolDescription } from '#components/chat/chat-tool-text.js';
import { ChatToolError } from '#components/chat/chat-tool-error.js';
import { CollapsibleFileOperation } from '#components/chat/chat-tool-file-operation.js';
import { CodeBlockContent, Pre } from '#components/code/code-block.js';
import { FileLink } from '#components/files/file-link.js';

/** ACP's whole `ToolKind` taxonomy, in the order the protocol declares it. @see https://agentclientprotocol.com */
export const externalToolKinds = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'think',
  'fetch',
  'switch_mode',
  'other',
] as const;

/** How one ACP tool kind is presented. */
type ExternalToolPresentation = {
  readonly icon: LucideIcon;
  readonly verb: string;
  readonly activeVerb: string;
  /**
   * Which body the card renders. `list` shows locations and text, `diff` shows
   * one file-operation card per diff block, `command` shows the captured
   * output, `path` shows the file the call named, and `text` is the honest home
   * for a call whose vocabulary Tau has no shape for.
   */
  readonly body: 'list' | 'diff' | 'command' | 'path' | 'text';
};

const presentations = {
  read: { icon: FileText, verb: 'Read', activeVerb: 'Reading', body: 'list' },
  edit: { icon: Pencil, verb: 'Edited', activeVerb: 'Editing', body: 'diff' },
  delete: { icon: Trash2, verb: 'Deleted', activeVerb: 'Deleting', body: 'path' },
  move: { icon: ArrowRight, verb: 'Moved', activeVerb: 'Moving', body: 'path' },
  search: { icon: Search, verb: 'Searched', activeVerb: 'Searching', body: 'list' },
  execute: { icon: Terminal, verb: 'Ran', activeVerb: 'Running', body: 'command' },
  think: { icon: Brain, verb: 'Thought', activeVerb: 'Thinking', body: 'text' },
  fetch: { icon: Globe, verb: 'Fetched', activeVerb: 'Fetching', body: 'list' },
  // eslint-disable-next-line @typescript-eslint/naming-convention -- ACP's own `ToolKind` spelling.
  switch_mode: { icon: Repeat, verb: 'Switched mode', activeVerb: 'Switching mode', body: 'text' },
  other: { icon: Wrench, verb: 'Ran', activeVerb: 'Running', body: 'text' },
} as const satisfies Record<(typeof externalToolKinds)[number], ExternalToolPresentation>;

/**
 * How a call of this kind is presented.
 *
 * Total by construction: an absent kind, and a kind from a protocol version
 * this build has never seen, both resolve to `other` — which is a real card,
 * not a placeholder, because "an agent did something we have no vocabulary for"
 * is a permanent state of affairs (D14).
 *
 * @param kind - The emitter's `ToolKind`, if it sent one.
 * @returns The presentation for that kind.
 */
export const externalToolPresentation = (kind: string | undefined): ExternalToolPresentation =>
  (presentations as Record<string, ExternalToolPresentation | undefined>)[kind ?? ''] ?? presentations.other;

/* Control bytes, and the bidirectional overrides that let a title reorder the
 * text around it. Tab and newline survive, then fold into the space collapse. */
// oxlint-disable-next-line no-control-regex -- matching these exact code points is the point of this pattern.
const unsafeDisplay = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/**
 * Fold agent-authored text onto one bounded, inert line.
 *
 * @param text - Text an agent wrote.
 * @param limit - Longest string to keep before eliding.
 * @returns The same text, stripped, collapsed and truncated.
 */
export const sanitizeAgentText = (text: string, limit = 200): string => {
  const folded = text.replaceAll(unsafeDisplay, '').replaceAll(/\s+/gu, ' ').trim();
  return folded.length > limit ? `${folded.slice(0, limit)}…` : folded;
};

/**
 * Strip a path an agent authored of everything that can reorder what is read.
 *
 * `locations` and diff paths are agent-authored strings like every other field
 * on these blocks, and a `U+202E` in one reorders the displayed path exactly as
 * it would a title (3-review S4). Only the unsafe code points go: the folding
 * {@link sanitizeAgentText} does would eat the spaces a real filename may
 * contain, and this string still has to read as a path.
 *
 * @param path - A path an agent reported.
 * @returns The same path with no control or bidirectional-override bytes.
 */
export const sanitizeAgentPath = (path: string): string => path.replaceAll(unsafeDisplay, '');

type AcpFacts = {
  readonly kind?: string;
  readonly title?: string;
  readonly nativeName?: string;
  readonly locations: readonly string[];
  readonly content: readonly unknown[];
};

const stringAt = (record: Record<string, unknown> | undefined, key: string): string | undefined =>
  typeof record?.[key] === 'string' ? record[key] : undefined;

/**
 * Read the emitter's facts off the part's tool metadata.
 *
 * A refinement that only ever arrived at `in_progress` — Codex sends its diff
 * exactly once, before the call completes — reaches the durable result row
 * rather than the call row, and the SDK carries a part's metadata from the call
 * chunk alone. So the result is the second place content is looked for.
 *
 * @param part - The dynamic tool part.
 * @param output - The call's result, once it has one.
 * @returns The facts this card renders from.
 */
const factsOf = (part: DynamicToolUIPart, output: unknown): AcpFacts => {
  const facts = isRecord(part.toolMetadata?.['tau']) ? part.toolMetadata['tau'] : {};
  const locations = Array.isArray(facts['locations']) ? facts['locations'] : [];
  return {
    ...(stringAt(facts, 'kind') === undefined ? {} : { kind: stringAt(facts, 'kind') }),
    ...(stringAt(facts, 'title') === undefined ? {} : { title: stringAt(facts, 'title') }),
    ...(stringAt(facts, 'nativeName') === undefined ? {} : { nativeName: stringAt(facts, 'nativeName') }),
    locations: locations.flatMap((location: unknown) => {
      const path = stringAt(isRecord(location) ? location : undefined, 'path');
      return path === undefined ? [] : [path];
    }),
    content: Array.isArray(facts['content']) ? facts['content'] : Array.isArray(output) ? output : [],
  };
};

/** Diff blocks the agent rendered; a `null` `oldText` is a file it created. */
const diffBlocks = (
  content: readonly unknown[],
): ReadonlyArray<{ path: string; oldText: string | undefined; newText: string }> =>
  content.flatMap((block) => {
    if (!isRecord(block) || block['type'] !== 'diff' || typeof block['path'] !== 'string') {
      return [];
    }
    return [
      {
        path: block['path'],
        oldText: typeof block['oldText'] === 'string' ? block['oldText'] : undefined,
        newText: typeof block['newText'] === 'string' ? block['newText'] : '',
      },
    ];
  });

/**
 * Text the agent rendered, from its content blocks and its raw output.
 *
 * A `{type:'terminal'}` block is deliberately ignored: Tau advertises no
 * terminal capability, so no terminal was ever created and its id resolves to
 * nothing. Both adapters send the same bytes as text or `formatted_output`.
 */
const bodyText = (facts: AcpFacts, output: unknown): string => {
  const blocks = facts.content.flatMap((block) => {
    if (!isRecord(block) || block['type'] !== 'content' || !isRecord(block['content'])) {
      return [];
    }
    const text = stringAt(block['content'], 'text');
    return text === undefined ? [] : [text];
  });
  if (typeof output === 'string') {
    blocks.push(output);
  } else if (isRecord(output)) {
    const formatted = stringAt(output, 'formatted_output') ?? stringAt(output, 'output') ?? stringAt(output, 'text');
    if (formatted !== undefined) {
      blocks.push(formatted);
    }
  }
  return blocks.join('\n');
};

const exitCodeOf = (output: unknown): number | undefined =>
  isRecord(output) && typeof output['exit_code'] === 'number' ? output['exit_code'] : undefined;

const isPreliminary = (part: DynamicToolUIPart): boolean => Reflect.get(part, 'preliminary') === true;

const cardStatus = (part: DynamicToolUIPart): 'loading' | 'ready' | 'error' =>
  part.state === 'input-streaming' || part.state === 'input-available' || isPreliminary(part)
    ? 'loading'
    : part.state === 'output-error'
      ? 'error'
      : 'ready';

/**
 * One external agent's tool call, rendered from the ACP facts it sent.
 *
 * @param part - The dynamic tool part the log projection produced.
 * @returns The card for this call.
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one kind switch and the bodies it selects; splitting them would hide the mapping this component exists to be.
export function ChatMessageToolExternal({ part }: { readonly part: DynamicToolUIPart }): ReactNode {
  const output = part.state === 'output-available' ? part.output : undefined;
  const facts = factsOf(part, output);
  const { icon, verb, activeVerb, body } = externalToolPresentation(facts.kind);
  const status = cardStatus(part);
  const isLoading = status === 'loading';
  const label = sanitizeAgentText(facts.title ?? facts.nativeName ?? part.toolName);

  if (part.state === 'output-error') {
    return <ChatToolError errorText={sanitizeAgentText(part.errorText, 400)} icon={icon} noun={label} />;
  }

  const displayVerb = isLoading ? activeVerb : verb;
  const lowerLabel = label.toLowerCase();
  const titleVerbs = facts.kind === 'search' ? [verb, activeVerb, 'Search'] : [verb, activeVerb];
  const repeatedVerb = titleVerbs.find((candidate) => {
    const lowerCandidate = candidate.toLowerCase();
    return lowerLabel === lowerCandidate || lowerLabel.startsWith(`${lowerCandidate} `);
  });
  const detail = repeatedVerb === undefined ? label : label.slice(repeatedVerb.length).trimStart();

  const diffs = diffBlocks(facts.content);
  if (body === 'diff' && diffs.length > 0) {
    return (
      <>
        {diffs.map((diff) => (
          <CollapsibleFileOperation
            key={diff.path}
            operation={diff.oldText === undefined ? 'create' : 'edit'}
            /* One prop is both this card's label and its link target, so the
             * strip happens here: a path carrying an override byte is not a
             * path any Tau surface should read out *or* open. */
            targetFile={sanitizeAgentPath(diff.path)}
            toolStatus={part.state}
            diffStats={createFileEditDiffStats(diff.oldText ?? '', diff.newText)}
          />
        ))}
      </>
    );
  }

  const text = bodyText(facts, output);
  const exitCode = exitCodeOf(output);
  const hasBody = text !== '' || facts.locations.length > 0;

  const header = (
    <ChatToolCardHeader>
      <ChatToolCardIcon icon={icon} {...(exitCode !== undefined && exitCode !== 0 ? { tone: 'destructive' } : {})} />
      <ChatToolCardTitle>
        <ChatToolLabel verb={displayVerb}>
          <ChatToolDescription className={body === 'command' ? 'font-mono' : undefined}>{detail}</ChatToolDescription>
        </ChatToolLabel>
      </ChatToolCardTitle>
    </ChatToolCardHeader>
  );

  if (!hasBody) {
    return (
      <ChatToolCard variant='minimal' status={status} isCollapsible={false}>
        {header}
      </ChatToolCard>
    );
  }

  return (
    <div {...(isLoading ? { role: 'status', 'aria-busy': true } : {})}>
      <ChatToolCard variant='minimal' status={status} isDefaultOpen={false}>
        {header}
        <ChatToolCardContent>
          {body === 'command' || body === 'text' ? (
            <CodeBlockContent>
              <Pre language={body === 'command' ? 'bash' : 'plaintext'}>{sanitizeAgentText(text, 4000)}</Pre>
            </CodeBlockContent>
          ) : (
            <ChatToolCardList>
              {facts.locations.map((path) => (
                <ChatToolCardListItem key={path} icon={FileText}>
                  {/* The child is what is read; the prop is what is opened. */}
                  <FileLink path={path}>{sanitizeAgentPath(path)}</FileLink>
                </ChatToolCardListItem>
              ))}
              {text
                .split('\n')
                .filter((line) => line.trim() !== '')
                .map((line, index) => (
                  // oxlint-disable-next-line eslint/no-array-index-key -- agent output lines have no id and repeat.
                  <ChatToolCardListItem key={`line-${String(index)}`}>{sanitizeAgentText(line)}</ChatToolCardListItem>
                ))}
            </ChatToolCardList>
          )}
        </ChatToolCardContent>
      </ChatToolCard>
    </div>
  );
}
