/**
 * One summary for every external tool call Tau can name better than its title.
 *
 * Shell commands go through {@link summarizeShellCommand}. Everything else an
 * adapter titles for its own terminal — `View Image /tmp/a.png`, `Open page:
 * https://…`, `Interact with subagent x`, `mcp.server.tool` — is recognised by
 * the title's leading words and restated as a verb and detail, so the card,
 * the error card and the group summary all read the same phrase. Titles are
 * agent-authored: only `startsWith`/`indexOf` run over them, never a regular
 * expression, and an unrecognised title keeps today's rendering.
 *
 * @see docs/research/acp-shell-command-summary-blueprint.md
 */

import { isRecord } from '@taucad/utils/schema';
import {
  describeCommandActions,
  describeCommandTarget,
  externalCommandOf,
  summarizeShellCommand,
} from '#utils/shell-command-summary.js';
import type { CommandAction, CommandSummary } from '#utils/shell-command-summary.js';

/** The ACP facts a summary is derived from. */
export type ExternalCallFacts = {
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly locations: readonly string[];
  readonly input: unknown;
};

const summary = (
  fields: Omit<CommandSummary, 'activeDetail' | 'locations'> & {
    readonly activeDetail?: string;
    readonly locations?: readonly string[];
  },
): CommandSummary => ({ activeDetail: fields.detail, locations: [], ...fields });

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1) || path;

/** `https://www.pdas.com/a/b/?q=1` → `pdas.com/a/b`. */
const displayUrl = (url: string): string => {
  const scheme = url.indexOf('://');
  let rest = scheme === -1 ? url : url.slice(scheme + 3);
  rest = rest.startsWith('www.') ? rest.slice(4) : rest;
  const cut = [rest.indexOf('?'), rest.indexOf('#')].filter((index) => index !== -1);
  rest = cut.length === 0 ? rest : rest.slice(0, Math.min(...cut));
  return rest.endsWith('/') ? rest.slice(0, -1) : rest;
};

/** The text after `prefix`, with one pair of surrounding quotes removed. */
const after = (title: string, prefix: string): string => {
  const rest = title.slice(prefix.length).trim();
  return rest.length > 1 && rest.startsWith("'") && rest.endsWith("'") ? rest.slice(1, -1) : rest;
};

const stringAt = (record: unknown, key: string): string | undefined =>
  isRecord(record) && typeof record[key] === 'string' && record[key] !== '' ? record[key] : undefined;

type WebAction = Record<string, unknown> | undefined;

const openPageSummary = (title: string, action: WebAction): CommandSummary => {
  const url = stringAt(action, 'url') ?? after(title, 'Open page:');
  return summary({
    kind: 'fetch',
    family: 'web-read',
    verb: 'Opened',
    activeVerb: 'Opening',
    detail: url === '' ? 'a page' : displayUrl(url),
  });
};

const findInPageSummary = (title: string, action: WebAction): CommandSummary => {
  const pattern = stringAt(action, 'pattern');
  const url = stringAt(action, 'url');
  const where = url === undefined ? 'a page' : displayUrl(url);
  const detail =
    pattern === undefined && url === undefined
      ? after(title, 'Find in page')
      : `${where}${pattern === undefined ? '' : ` for '${pattern}'`}`;
  return summary({ kind: 'fetch', family: 'web-read', verb: 'Searched', activeVerb: 'Searching', detail });
};

const webSearchSummary = (title: string, input: unknown, action: WebAction): CommandSummary => {
  const queries = Array.isArray(action?.['queries']) ? action['queries'] : [];
  const joined = queries.filter((entry) => typeof entry === 'string' && entry !== '').join(', ');
  const query =
    stringAt(action, 'query') ??
    (joined === '' ? undefined : joined) ??
    stringAt(input, 'query') ??
    after(title, 'Web search:');
  return summary({
    kind: 'fetch',
    family: 'web-search',
    verb: 'Searched',
    activeVerb: 'Searching',
    detail: query === '' || query === 'Web search' ? 'the web' : `the web for ${query}`,
  });
};

/**
 * A web search, page open or find-in-page. Codex reports all three as ACP
 * `search` with a `webSearch` raw input; the title is the fallback.
 */
const webSummary = (title: string, input: unknown): CommandSummary | undefined => {
  const isWeb = stringAt(input, 'type') === 'webSearch';
  const action = isRecord(input) && isRecord(input['action']) ? input['action'] : undefined;
  const actionType = stringAt(action, 'type');
  if (actionType === 'openPage' || (!isWeb && title.startsWith('Open page'))) {
    return openPageSummary(title, action);
  }
  if (actionType === 'findInPage' || (!isWeb && title.startsWith('Find in page'))) {
    return findInPageSummary(title, action);
  }
  return isWeb || title.startsWith('Web search') ? webSearchSummary(title, input, action) : undefined;
};

/** Codex's own read titles, restated without the path it already carries in `locations`. */
const readSummary = (title: string, locations: readonly string[]): CommandSummary | undefined => {
  if (title.startsWith('View Image ')) {
    const path = locations[0] ?? after(title, 'View Image ');
    return summary({
      kind: 'read',
      family: 'read',
      verb: 'Viewed',
      activeVerb: 'Viewing',
      detail: `image ${basename(path)}`,
      locations: [path],
    });
  }
  if (title.startsWith('List files')) {
    const path = title.startsWith('List files in ') ? after(title, 'List files in ') : '';
    return describeCommandActions([path === '' ? { type: 'list' } : { type: 'list', path }]);
  }
  const reads = locations.map((path): CommandAction => ({ type: 'read', path }));
  /* A plain file's own title is fine unless it is Codex's `Read file '<absolute path>'`. */
  const isSkill = locations.some((path) => describeCommandTarget(path).type !== 'file');
  return reads.length > 0 && (isSkill || title.startsWith('Read file ')) ? describeCommandActions(reads) : undefined;
};

/* Imperative titles an agent gives an action, restated in the transcript's tenses. */
const imperatives: ReadonlyArray<readonly [prefix: string, verb: string, activeVerb: string]> = [
  ['Interact with ', 'Messaged', 'Messaging'],
  ['Start ', 'Started', 'Starting'],
  ['Interrupt ', 'Interrupted', 'Interrupting'],
  ['Complete ', 'Completed', 'Completing'],
  ['Compact ', 'Compacted', 'Compacting'],
];

/* Titles that are nouns, not actions. */
const nounTitles = new Map<string, readonly [verb: string, activeVerb: string, detail: string]>([
  ['wait', ['Waited', 'Waiting', 'for agents']],
  ['image generation', ['Generated', 'Generating', 'image']],
  ['guardian review', ['Reviewed', 'Reviewing', 'approval']],
]);

/** An `other` or `think` call whose title reads as an action. */
const titleSummary = (kind: 'other' | 'think', title: string): CommandSummary | undefined => {
  const noun = nounTitles.get(title.trim().toLowerCase());
  if (noun !== undefined) {
    return summary({ kind, family: 'other', verb: noun[0], activeVerb: noun[1], detail: noun[2] });
  }
  const match = imperatives.find(([prefix]) => title.startsWith(prefix));
  return match === undefined
    ? undefined
    : summary({ kind, family: 'other', verb: match[1], activeVerb: match[2], detail: title.slice(match[0].length) });
};

/** `mcp.<server>.<tool>`: a foreign MCP call, named tool first. */
const mcpSummary = (title: string): CommandSummary | undefined => {
  if (!title.startsWith('mcp.')) {
    return undefined;
  }
  const rest = title.slice('mcp.'.length);
  const dot = rest.indexOf('.');
  return dot <= 0 || dot === rest.length - 1
    ? undefined
    : summary({
        kind: 'execute',
        family: 'execute',
        verb: 'Called',
        activeVerb: 'Calling',
        detail: `${rest.slice(dot + 1)} on ${rest.slice(0, dot)}`,
      });
};

const shellSummary = (command: string): CommandSummary | undefined => {
  const actions = command === '' ? undefined : summarizeShellCommand(command);
  return actions === undefined ? undefined : describeCommandActions(actions);
};

/**
 * Summarise an external tool call from its ACP facts.
 *
 * @param call - The call's ACP kind, title, locations and raw input.
 * @returns The presentation, or `undefined` to render the call as reported.
 */
export const summarizeExternalCall = (call: ExternalCallFacts): CommandSummary | undefined => {
  const title = call.title ?? '';
  switch (call.kind) {
    case 'execute': {
      const command = externalCommandOf(call.input);
      if (command === undefined) {
        return mcpSummary(title) ?? shellSummary(title);
      }
      return shellSummary(command);
    }
    case 'read': {
      return readSummary(title, call.locations);
    }
    case 'search':
    case 'fetch': {
      return webSummary(title, call.input);
    }
    case 'other':
    case 'think': {
      return titleSummary(call.kind, title);
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The summary as a noun phrase for a failed call's header, where the error
 * code owns the verb: "Attempted" + "reading skill cad-picogk".
 *
 * @param call - The summary.
 * @returns The phrase.
 */
export const summaryNoun = (call: CommandSummary): string =>
  `${call.activeVerb.toLowerCase()} ${call.activeDetail}`.trim();
