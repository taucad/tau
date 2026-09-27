/**
 * Read-only exploration summaries for the shell commands an external agent runs.
 *
 * An ACP adapter reports a shell call as `kind: 'execute'` with the raw command
 * as its title whenever it cannot name the call itself — codex-acp only
 * relabels a command that parsed to exactly one action, so `sed … && sed …`
 * over two skills arrives as a 300-character shell line. This recovers the
 * same `read` / `list` / `search` actions Codex's own `parse_command` derives,
 * for the commands that only explore, and names skills by skill.
 *
 * The command is agent-authored and unbounded, so this is one left-to-right
 * pass over a capped string with no regular expression over the input. Any
 * construct outside the small grammar it understands — substitutions, writes,
 * unlisted programs — makes the whole command unknown, and the caller keeps
 * rendering the raw line. Honesty beats coverage: a summary is only shown for
 * a command whose every segment was understood.
 *
 * @see docs/research/acp-shell-command-summary-blueprint.md
 */

import { isRecord } from '@taucad/utils/schema';

/** One exploration step a shell command performs. */
export type CommandAction =
  | { readonly type: 'read'; readonly path: string }
  | { readonly type: 'list'; readonly path?: string }
  | { readonly type: 'search'; readonly query?: string; readonly path?: string };

/* Bounds that keep a hostile command from costing more than a normal one. */
const maxCommandLength = 4096;
const maxWords = 256;
const maxSegments = 32;
const maxUnwrapDepth = 2;

type Token = string | typeof sequenceToken | typeof pipeToken;
const sequenceToken = Symbol('sequence');
const pipeToken = Symbol('pipe');

/** A set from space-separated words. */
const wordSet = (list: string): ReadonlySet<string> => new Set(list.split(' '));

const isSpace = (char: string): boolean => char === ' ' || char === '\t' || char === '\r';
const isDigits = (value: string): boolean => value !== '' && [...value].every((char) => char >= '0' && char <= '9');

/**
 * Split a command into words and control operators, POSIX-shell style.
 *
 * @param command - The command, already length-checked.
 * @returns The tokens, or `undefined` for anything outside the grammar.
 */
// oxlint-disable-next-line eslint/max-lines-per-function, eslint/complexity -- one character switch; splitting it scatters the grammar.
const tokenize = (command: string): Token[] | undefined => {
  const tokens: Token[] = [];
  let word = '';
  let inWord = false;
  let quoted = false;
  const flush = (): void => {
    if (inWord) {
      tokens.push(word);
    }
    word = '';
    inWord = false;
    quoted = false;
  };

  let index = 0;
  while (index < command.length) {
    const char = command[index]!;
    const next = command[index + 1];
    if (char === "'") {
      const end = command.indexOf("'", index + 1);
      if (end === -1) {
        return undefined;
      }
      word += command.slice(index + 1, end);
      inWord = true;
      quoted = true;
      index = end + 1;
      continue;
    }
    if (char === '"') {
      index += 1;
      for (;;) {
        const inner = command[index];
        if (inner === undefined || inner === '$' || inner === '`') {
          return undefined;
        }
        if (inner === '"') {
          break;
        }
        if (inner === '\\' && command[index + 1] !== undefined && '$`"\\\n'.includes(command[index + 1]!)) {
          word += command[index + 1] === '\n' ? '' : command[index + 1];
          index += 2;
          continue;
        }
        word += inner;
        index += 1;
      }
      inWord = true;
      quoted = true;
      index += 1;
      continue;
    }
    if (char === '\\') {
      if (next === undefined) {
        return undefined;
      }
      if (next !== '\n') {
        word += next;
        inWord = true;
      }
      index += 2;
      continue;
    }
    if (isSpace(char)) {
      flush();
      index += 1;
      continue;
    }
    if (char === '\n' || char === ';') {
      flush();
      tokens.push(sequenceToken);
      index += 1;
      continue;
    }
    if (char === '|') {
      flush();
      if (next === '&') {
        return undefined;
      }
      tokens.push(next === '|' ? sequenceToken : pipeToken);
      index += next === '|' ? 2 : 1;
      continue;
    }
    if (char === '&' && next === '&') {
      flush();
      tokens.push(sequenceToken);
      index += 2;
      continue;
    }
    if (char === '>' || (char === '&' && next === '>')) {
      /* `2>/dev/null`, `>/dev/null`, `2>&1` and `&>/dev/null` discard output;
       * any other target writes a file, which is not exploration. */
      if (inWord && !quoted && isDigits(word)) {
        word = '';
        inWord = false;
      }
      flush();
      index += char === '&' ? 2 : 1;
      if (command[index] === '>') {
        index += 1;
      }
      if (command[index] === '&') {
        let end = index + 1;
        while (end < command.length && isDigits(command[end]!)) {
          end += 1;
        }
        if (end === index + 1) {
          return undefined;
        }
        index = end;
        continue;
      }
      while (index < command.length && isSpace(command[index]!)) {
        index += 1;
      }
      if (!command.startsWith('/dev/null', index)) {
        return undefined;
      }
      index += '/dev/null'.length;
      if (index < command.length && !isSpace(command[index]!) && !'\n;|&'.includes(command[index]!)) {
        return undefined;
      }
      continue;
    }
    if ('$`()<&'.includes(char) || (char === '#' && !inWord)) {
      return undefined;
    }
    word += char;
    inWord = true;
    index += 1;
  }
  flush();
  return tokens.length > maxWords ? undefined : tokens;
};

/** Sequence segments, each a pipeline of word lists. */
const segmentsOf = (tokens: readonly Token[]): string[][][] | undefined => {
  const segments: string[][][] = [];
  let pipeline: string[][] = [];
  let words: string[] = [];
  for (const token of [...tokens, sequenceToken]) {
    if (typeof token === 'string') {
      words.push(token);
      continue;
    }
    if (words.length === 0) {
      /* `a | | b` or `| b` is malformed; empty `;` segments are harmless. */
      if (token === pipeToken || pipeline.length > 0) {
        return undefined;
      }
      continue;
    }
    pipeline.push(words);
    words = [];
    if (token === sequenceToken) {
      segments.push(pipeline);
      pipeline = [];
    }
  }
  return segments.length > maxSegments ? undefined : segments;
};

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/**
 * Operands that are not flags or flag values.
 *
 * @param args - Arguments after the program name.
 * @param valued - Flags that consume the following argument.
 * @returns The operands in order.
 */
const operandsOf = (args: readonly string[], valued: ReadonlySet<string>): string[] => {
  const operands: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === '--') {
      operands.push(...args.slice(index + 1));
      break;
    }
    if (argument.startsWith('-') && argument !== '-') {
      index += valued.has(argument) ? 1 : 0;
      continue;
    }
    operands.push(argument);
  }
  return operands;
};

const valueOf = (args: readonly string[], flags: readonly string[]): string | undefined => {
  const index = args.findIndex((argument) => flags.includes(argument));
  return index === -1 ? undefined : args[index + 1];
};

const reads = (paths: readonly string[]): CommandAction[] | undefined =>
  paths.length === 0 || paths.includes('-') ? undefined : paths.map((path) => ({ type: 'read', path }));

/* Flags that take a value, per reader; `cat -n` numbers lines, `head -n 5` counts them. */
const readerFlags: Readonly<Record<string, ReadonlySet<string>>> = {
  head: wordSet('-n -c --lines --bytes'),
  tail: wordSet('-n -c --lines --bytes -s --sleep-interval --pid'),
  nl: wordSet('-s -w -v -i -b -n -d -h -f -l'),
  less: wordSet('-p -P -x -y -z -j --pattern --prompt --tabs --shift'),
  bat: wordSet(
    '-l -r -H --theme --language --style --line-range --highlight-line --tabs --terminal-width --map-syntax',
  ),
};
const listFlags = wordSet('-I -w -L -P --ignore-glob --block-size --time-style --sort --charset --filelimit');
const rgFlags = wordSet(
  '-g --glob --iglob -t --type -T --type-not --type-add -m --max-count -A -B -C --context --max-depth -M --max-columns -j --threads --sort --sortr -r --replace --color --colors -E --encoding -e --regexp -f --file',
);
const grepFlags = wordSet(
  '-e --regexp -f --file -m --max-count -A -B -C --context --include --exclude --exclude-dir --label --color -d -D -G -g --ignore-dir --ignore-file --file-search-regex',
);
const fdFlags = wordSet(
  '-e --extension -t --type -d --max-depth -E --exclude -S --size --changed-within --changed-before -o --owner -c --color -j --threads',
);

/* Pipeline stages after the first that only reshape what they are given. */
const filters = wordSet(
  'head tail wc sort uniq cut tr nl column awk sed grep egrep fgrep rg jq cat less more fold fmt expand rev tac',
);
/* Commands that neither explore nor change anything worth a line. */
const inert = wordSet('echo printf true pwd :');

const hasInPlaceFlag = (args: readonly string[]): boolean =>
  args.some(
    (argument) =>
      argument.startsWith('--in-place') ||
      (argument.startsWith('-') && !argument.startsWith('--') && argument.includes('i')),
  );

/** `Np`, `N,Mp` or `N,$p`: a line-range print, the only sed script that reads. */
const isLineRangePrint = (script: string | undefined): boolean => {
  if (script?.endsWith('p') !== true) {
    return false;
  }
  const [from, to, ...rest] = script.slice(0, -1).split(',');
  return rest.length === 0 && isDigits(from ?? '') && (to === undefined || to === '$' || isDigits(to));
};

const sedReads = (args: readonly string[]): CommandAction[] | undefined => {
  if (!args.includes('-n') || hasInPlaceFlag(args.filter((argument) => argument !== '-n'))) {
    return undefined;
  }
  const expressions = args.flatMap((argument, index) =>
    argument === '-e' || argument === '--expression' ? [args[index + 1]] : [],
  );
  const operands = operandsOf(args, wordSet('-e --expression -f --file'));
  const scripts = expressions.length > 0 ? expressions : operands.slice(0, 1);
  return scripts.length > 0 && scripts.every((script) => isLineRangePrint(script))
    ? reads(expressions.length > 0 ? operands : operands.slice(1))
    : undefined;
};

const searchOf = (args: readonly string[], valued: ReadonlySet<string>): CommandAction[] => {
  const pattern = valueOf(args, ['-e', '--regexp']);
  const operands = operandsOf(args, valued);
  const [query, ...paths] = pattern === undefined ? operands : [pattern, ...operands];
  return [
    {
      type: 'search',
      ...(query === undefined ? {} : { query }),
      ...(paths[0] === undefined ? {} : { path: paths[0] }),
    },
  ];
};

const lists = (paths: readonly string[]): CommandAction[] =>
  paths.length === 0 ? [{ type: 'list' }] : paths.map((path) => ({ type: 'list', path }));

const findActions = (args: readonly string[]): CommandAction[] | undefined => {
  const firstExpression = args.findIndex(
    (argument) => argument.startsWith('-') || argument === '!' || argument === '(',
  );
  const paths = firstExpression === -1 ? args : args.slice(0, firstExpression);
  const expressions = firstExpression === -1 ? [] : args.slice(firstExpression);
  const acting = wordSet('-exec -execdir -ok -okdir -delete -fprint -fprint0 -fprintf -fls');
  if (expressions.some((argument) => acting.has(argument))) {
    return undefined;
  }
  /* `-not -name '*.test.ts'` excludes; only a positive name test is the query. */
  const matchers = wordSet('-name -iname -path -ipath -regex -iregex');
  const at = expressions.findIndex(
    (argument, index) => matchers.has(argument) && expressions[index - 1] !== '-not' && expressions[index - 1] !== '!',
  );
  const query = at === -1 ? undefined : expressions[at + 1];
  return query === undefined
    ? lists(paths)
    : [{ type: 'search', query, ...(paths[0] === undefined ? {} : { path: paths[0] }) }];
};

/**
 * The exploration a single program invocation performs.
 *
 * @param words - Program name then arguments.
 * @returns Its actions, `[]` for an inert command, or `undefined` when unknown.
 */
// oxlint-disable-next-line eslint/complexity -- one case per program Codex's parser recognises.
const stageActions = (words: readonly string[]): CommandAction[] | undefined => {
  const [program = '', ...args] = words;
  switch (program) {
    case 'cat':
    case 'bat':
    case 'batcat':
    case 'less':
    case 'more':
    case 'nl':
    case 'head':
    case 'tail': {
      const valued = readerFlags[program === 'batcat' ? 'bat' : program] ?? new Set<string>();
      return reads(operandsOf(args, valued).filter((operand) => !(program === 'tail' && operand.startsWith('+'))));
    }
    case 'sed': {
      return sedReads(args);
    }
    case 'ls':
    case 'eza':
    case 'exa':
    case 'tree': {
      return lists(operandsOf(args, listFlags));
    }
    case 'find': {
      return findActions(args);
    }
    case 'fd': {
      if (args.some((argument) => ['-x', '--exec', '-X', '--exec-batch'].includes(argument))) {
        return undefined;
      }
      const [query, path] = operandsOf(args, fdFlags);
      return query === undefined ? lists([]) : [{ type: 'search', query, ...(path === undefined ? {} : { path }) }];
    }
    case 'rg':
    case 'rga': {
      return args.includes('--files') ? lists(operandsOf(args, rgFlags)) : searchOf(args, rgFlags);
    }
    case 'grep':
    case 'egrep':
    case 'fgrep':
    case 'ag':
    case 'ack':
    case 'pt': {
      return searchOf(args, grepFlags);
    }
    case 'git': {
      const [subcommand, ...rest] = args;
      return subcommand === 'grep'
        ? searchOf(rest, grepFlags)
        : subcommand === 'ls-files'
          ? lists(operandsOf(rest, wordSet('--exclude --exclude-from')))
          : undefined;
    }
    default: {
      return inert.has(program) ? [] : undefined;
    }
  }
};

const joinPath = (base: string, path: string): string =>
  path.startsWith('/') || path.startsWith('~') || base === ''
    ? path
    : `${base.endsWith('/') ? base.slice(0, -1) : base}/${path}`;

const withBase = (action: CommandAction, base: string | undefined): CommandAction =>
  base === undefined || action.path === undefined ? action : { ...action, path: joinPath(base, action.path) };

/** `bash -lc '<script>'` and friends: the script they run, or `undefined`. */
const wrappedScript = (words: readonly string[]): string | undefined => {
  const shell = basename(words[0] ?? '');
  if (shell !== 'bash' && shell !== 'zsh' && shell !== 'sh') {
    return undefined;
  }
  const flags = words.slice(1, -1).join(' ');
  return ['-c', '-lc', '-cl', '-l -c'].includes(flags) ? words.at(-1) : undefined;
};

/**
 * Every segment's actions, resolving `cd` for the paths after it.
 *
 * @param segments - Sequence segments of pipelines.
 * @returns The deduplicated actions, or `undefined` if any segment is unknown.
 */
const actionsOf = (segments: readonly string[][][]): CommandAction[] | undefined => {
  const actions: CommandAction[] = [];
  let base: string | undefined;
  for (const [first, ...rest] of segments) {
    if (first![0] === 'cd' && rest.length === 0) {
      const target = first!.slice(1).find((argument) => argument !== '--');
      base = target === undefined ? undefined : joinPath(base ?? '', target);
      continue;
    }
    const stage = stageActions(first!);
    if (
      stage === undefined ||
      rest.some((words) => !filters.has(words[0]!) || (words[0] === 'sed' && hasInPlaceFlag(words.slice(1))))
    ) {
      return undefined;
    }
    for (const action of stage) {
      const resolved = withBase(action, base);
      const previous = actions.at(-1);
      if (JSON.stringify(previous) !== JSON.stringify(resolved)) {
        actions.push(resolved);
      }
    }
  }
  return actions.length === 0 ? undefined : actions;
};

const summarize = (command: string, depth: number): CommandAction[] | undefined => {
  if (command.length > maxCommandLength) {
    return undefined;
  }
  const tokens = tokenize(command);
  const segments = tokens === undefined ? undefined : segmentsOf(tokens);
  if (segments === undefined) {
    return undefined;
  }
  /* A shell wrapper, or a whole command quoted as one word, runs its inner script. */
  const only = segments.length === 1 && segments[0]!.length === 1 ? segments[0]![0]! : undefined;
  const inner =
    only === undefined
      ? undefined
      : (wrappedScript(only) ?? (only.length === 1 && only[0]!.includes(' ') ? only[0] : undefined));
  if (inner !== undefined) {
    return depth < maxUnwrapDepth ? summarize(inner, depth + 1) : undefined;
  }

  return actionsOf(segments);
};

/* Every render re-derives each call's header and family; the answer is a pure function of the string. */
const memoLimit = 512;
const memo = new Map<string, readonly CommandAction[] | undefined>();

/**
 * The exploration a shell command performs, when that is all it does.
 *
 * @param command - A command an agent ran, as its adapter reported it.
 * @returns Its read, list and search actions in order, or `undefined` when any
 *   part of it is outside the understood grammar (render the raw command).
 */
export const summarizeShellCommand = (command: string): readonly CommandAction[] | undefined => {
  if (memo.has(command)) {
    return memo.get(command);
  }
  // ponytail: whole-map reset at the cap; an LRU only matters if one chat exceeds 512 distinct commands per render.
  if (memo.size >= memoLimit) {
    memo.clear();
  }
  const actions = summarize(command, 0);
  memo.set(command, actions);
  return actions;
};

/** What a path an agent read is, for a person. */
export type CommandTarget =
  | { readonly type: 'skill'; readonly skill: string }
  | { readonly type: 'skill-file'; readonly skill: string; readonly file: string }
  | { readonly type: 'file'; readonly name: string };

/**
 * Name a path the way a person would: a skill by its name, a skill's reference
 * file under its skill, anything else by its file name.
 *
 * Skills are recognised by shape — `…/skills/<name>/SKILL.md` — which covers
 * Tau's per-session `acp-skills/<hash>/.agents/skills`, `~/.codex`, `~/.claude`
 * and plugin caches alike, without a regular expression over agent input.
 *
 * @param path - A path an agent read.
 * @returns The target to render.
 */
export const describeCommandTarget = (path: string): CommandTarget => {
  const normalized = path.replaceAll('\\', '/');
  const trimmed = normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  const name = basename(trimmed) || trimmed;
  const marker = trimmed.lastIndexOf('/skills/');
  const skillsStart = marker === -1 ? (trimmed.startsWith('skills/') ? 0 : -1) : marker + 1;
  const rest = skillsStart === -1 ? undefined : trimmed.slice(skillsStart + 'skills/'.length);
  if (rest === undefined || !rest.includes('/')) {
    return { type: 'file', name };
  }
  if (name === 'SKILL.md') {
    const parent = basename(trimmed.slice(0, -'/SKILL.md'.length));
    return { type: 'skill', skill: parent };
  }
  const slash = rest.indexOf('/');
  return { type: 'skill-file', skill: rest.slice(0, slash), file: rest.slice(slash + 1) };
};

const targetLabel = (target: CommandTarget): string =>
  target.type === 'skill'
    ? `skill ${target.skill}`
    : target.type === 'skill-file'
      ? `${target.skill}/${target.file}`
      : target.name;

/** How a summarised call is presented. */
export type CommandSummary = {
  /** ACP kind whose icon the card borrows. */
  readonly kind: 'read' | 'search';
  /** Activity family the group summary counts it under. */
  readonly family: 'skill' | 'read' | 'search';
  readonly verb: string;
  readonly activeVerb: string;
  readonly detail: string;
  readonly activeDetail: string;
};

const verbs = {
  read: ['Read', 'Reading'],
  list: ['Listed', 'Listing'],
  search: ['Searched', 'Searching'],
} as const;

const phraseOf = (actions: readonly CommandAction[]): string => {
  const { type } = actions[0]!;
  if (type === 'read') {
    const targets = actions.map((action) => describeCommandTarget(action.path!));
    const labels = [...new Set(targets.map((target) => targetLabel(target)))];
    /* "skills a, b" reads better than "skill a, skill b". */
    return labels.length > 1 && targets.every((target) => target.type === 'skill')
      ? `skills ${labels.map((label) => label.slice('skill '.length)).join(', ')}`
      : labels.join(', ');
  }
  if (type === 'list') {
    const paths = actions.flatMap((action) =>
      action.path === undefined ? [] : [targetLabel(describeCommandTarget(action.path))],
    );
    return paths.length === 0 ? 'files' : [...new Set(paths)].join(', ');
  }
  return actions
    .map((action) => {
      const query = action.type === 'search' ? action.query : undefined;
      const where = action.path === undefined ? '' : `in ${targetLabel(describeCommandTarget(action.path))}`;
      return query === undefined ? where || 'files' : `for ${query}${where === '' ? '' : ` ${where}`}`;
    })
    .join(', ');
};

/**
 * Present a list of actions as one header: the first run's verb leads, later
 * runs carry their own lower-cased verb ("Read main.ts, searched for x in src").
 *
 * @param actions - At least one action, as {@link summarizeShellCommand} returns.
 * @returns The presentation.
 */
export const describeCommandActions = (actions: readonly CommandAction[]): CommandSummary => {
  const runs: CommandAction[][] = [];
  for (const action of actions) {
    const run = runs.at(-1);
    if (run?.[0]?.type === action.type) {
      run.push(action);
    } else {
      runs.push([action]);
    }
  }
  const [head, ...tail] = runs.map((run) => ({ verbs: verbs[run[0]!.type], phrase: phraseOf(run) }));
  const detailOf = (active: 0 | 1): string =>
    [head!.phrase, ...tail.map((run) => `${run.verbs[active].toLowerCase()} ${run.phrase}`)].join(', ');
  const first = actions[0]!;
  const allSkills = actions.every(
    (action) => action.type === 'read' && describeCommandTarget(action.path).type === 'skill',
  );
  return {
    kind: first.type === 'search' ? 'search' : 'read',
    family: allSkills ? 'skill' : first.type === 'search' ? 'search' : 'read',
    verb: head!.verbs[0],
    activeVerb: head!.verbs[1],
    detail: detailOf(0),
    activeDetail: detailOf(1),
  };
};

/**
 * The shell command an external call's raw input names, if it names one.
 *
 * @param input - The call's ACP `rawInput`.
 * @returns The command string.
 */
export const externalCommandOf = (input: unknown): string | undefined => {
  const command = isRecord(input) ? input['command'] : undefined;
  return typeof command === 'string' ? command : undefined;
};

/**
 * Summarise an external tool call from its ACP facts, when it only explored.
 *
 * An `execute` call is parsed from the command its `rawInput` carries (Codex
 * and Claude adapters both name it `command`), falling back to the title. A
 * `read` call is renamed only when it read a skill: its adapter title is the
 * absolute path, and a plain file's own title is already fine.
 *
 * @param call - The call's ACP kind, title, locations and raw input.
 * @returns The presentation, or `undefined` to render the call as reported.
 */
export const summarizeExternalCall = (call: {
  readonly kind?: string | undefined;
  readonly title?: string | undefined;
  readonly locations: readonly string[];
  readonly input: unknown;
}): CommandSummary | undefined => {
  if (call.kind === 'read') {
    return call.locations.some((path) => describeCommandTarget(path).type !== 'file')
      ? describeCommandActions(call.locations.map((path) => ({ type: 'read', path })))
      : undefined;
  }
  if (call.kind !== 'execute') {
    return undefined;
  }
  const command = externalCommandOf(call.input) ?? call.title;
  const actions = command === undefined ? undefined : summarizeShellCommand(command);
  return actions === undefined ? undefined : describeCommandActions(actions);
};
