/**
 * A Seatbelt profile, as the pinned sandbox runtime writes it for a macOS launch, and a small evaluator of its file
 * rules (blueprint E1). It lets a Linux run check what a macOS launch may read and write, at the profile-generation
 * level: the runtime's own SBPL generator turns {@link shellSandboxProfile}'s filesystem into rules, and the evaluator
 * applies them as Seatbelt does, last match wins over `(deny default)`.
 *
 * It models the filters the runtime emits for file operations (`subpath`, `literal`, `regex`, `require-all`,
 * `require-any`, `require-not`, `vnode-type`) and refuses any other, so a runtime upgrade that writes a new filter fails
 * here instead of being read as no match. It is not Seatbelt: path resolution, firmlinks and the kernel's own checks
 * are observed only on a Mac.
 */
import { wrapCommandWithSandboxMacOS } from '@anthropic-ai/sandbox-runtime/dist/sandbox/macos-sandbox-utils.js';
import {
  getDefaultWritePaths,
  removeTrailingGlobSuffix,
} from '@anthropic-ai/sandbox-runtime/dist/sandbox/sandbox-utils.js';

type Expression = string | readonly Expression[];

/** The file lists {@link shellSandboxProfile} hands the runtime. */
export type ProfileFilesystem = Readonly<{
  denyRead: readonly string[];
  allowRead: readonly string[];
  allowWrite: readonly string[];
  denyWrite: readonly string[];
}>;

/** One file operation on one path. */
export type SeatbeltQuery = Readonly<{ operation: string; path: string; directory?: boolean }>;

const parse = (source: string): Expression[] => {
  const forms: Expression[] = [];
  const stack: Expression[][] = [forms];
  let index = 0;
  while (index < source.length) {
    const character = source[index]!;
    switch (character) {
      case ';': {
        const end = source.indexOf('\n', index);
        index = end === -1 ? source.length : end;
        break;
      }
      case '(': {
        const list: Expression[] = [];
        stack.at(-1)!.push(list);
        stack.push(list);
        index += 1;
        break;
      }
      case ')': {
        stack.pop();
        index += 1;
        break;
      }
      case '"': {
        let end = index + 1;
        while (source[end] !== '"') {
          end += source[end] === '\\' ? 2 : 1;
        }
        stack.at(-1)!.push(`"${JSON.parse(source.slice(index, end + 1)) as string}`);
        index = end + 1;
        break;
      }
      default: {
        if (/\s/u.test(character)) {
          index += 1;
        } else {
          const match = /^[^\s()";]+/u.exec(source.slice(index))![0];
          stack.at(-1)!.push(match);
          index += match.length;
        }
      }
    }
  }
  return forms;
};

const text = (expression: Expression | undefined): string => {
  if (typeof expression !== 'string' || !expression.startsWith('"')) {
    throw new Error(`expected a string, got ${JSON.stringify(expression)}`);
  }
  return expression.slice(1);
};

const matches = (filter: Expression, query: SeatbeltQuery): boolean => {
  if (typeof filter === 'string') {
    throw new TypeError(`unexpected filter ${filter}`);
  }
  const [kind, ...rest] = filter;
  switch (kind) {
    case 'subpath': {
      const root = text(rest[0]);
      return query.path === root || query.path.startsWith(root === '/' ? '/' : `${root}/`);
    }
    case 'literal': {
      return query.path === text(rest[0]);
    }
    case 'regex': {
      return new RegExp(text(rest[0]), 'u').test(query.path);
    }
    case 'require-all': {
      return rest.every((inner) => matches(inner, query));
    }
    case 'require-any': {
      return rest.some((inner) => matches(inner, query));
    }
    case 'require-not': {
      return !matches(rest[0]!, query);
    }
    case 'vnode-type': {
      return rest[0] === 'DIRECTORY' && query.directory === true;
    }
    default: {
      throw new Error(`the evaluator does not model the filter ${JSON.stringify(filter)}`);
    }
  }
};

/**
 * Whether a rule's operation name covers one concrete operation (`file-read*` covers `file-read-data`).
 *
 * @param operation - The rule's operation name.
 * @param concrete - The queried operation.
 * @returns Whether the rule applies to it.
 */
const covers = (operation: string, concrete: string): boolean =>
  operation.endsWith('*') ? concrete.startsWith(operation.slice(0, -1)) : operation === concrete;

/**
 * The Seatbelt profile the runtime writes for one launch's filesystem lists, built as its sandbox manager does on macOS
 * (trailing `/**` stripped, no glob expansion, the default write roots first).
 *
 * @param filesystem - {@link shellSandboxProfile}'s `filesystem`.
 * @returns The SBPL text.
 */
export const seatbeltProfileOf = (filesystem: ProfileFilesystem): string => {
  const wrapped = wrapCommandWithSandboxMacOS({
    command: 'true',
    needsNetworkRestriction: false,
    readConfig: {
      denyOnly: filesystem.denyRead.map((path) => removeTrailingGlobSuffix(path)),
      allowWithinDeny: filesystem.allowRead.map((path) => removeTrailingGlobSuffix(path)),
    },
    writeConfig: {
      allowOnly: [...getDefaultWritePaths(), ...filesystem.allowWrite.map((path) => removeTrailingGlobSuffix(path))],
      denyWithinAllow: filesystem.denyWrite.map((path) => removeTrailingGlobSuffix(path)),
    },
    binShell: 'sh',
  });
  const start = wrapped.indexOf("'(version 1)");
  const end = wrapped.indexOf("' ", start + 1);
  if (start === -1 || end === -1) {
    throw new Error('the runtime wrote no Seatbelt profile');
  }
  return wrapped.slice(start + 1, end).replaceAll(`'"'"'`, "'");
};

/**
 * Whether a profile allows one file operation, deciding as Seatbelt does: the last rule whose operation and filter
 * match wins, and `(deny default)` answers when none does.
 *
 * @param profile - SBPL text from {@link seatbeltProfileOf}.
 * @param query - The operation and path.
 * @returns `allow` or `deny`.
 */
export const seatbeltDecision = (profile: string, query: SeatbeltQuery): 'allow' | 'deny' => {
  let decision: 'allow' | 'deny' = 'deny';
  for (const form of parse(profile)) {
    if (typeof form === 'string' || (form[0] !== 'allow' && form[0] !== 'deny')) {
      continue;
    }
    const [action, ...rest] = form as readonly string[];
    const operations = rest.filter((part): part is string => typeof part === 'string');
    if (!operations.some((operation) => covers(operation, query.operation))) {
      continue;
    }
    const filters = (rest as readonly Expression[]).filter(
      (part): part is readonly Expression[] => typeof part !== 'string' && part[0] !== 'with',
    );
    if (filters.length === 0 || filters.some((filter) => matches(filter, query))) {
      decision = action as 'allow' | 'deny';
    }
  }
  return decision;
};
