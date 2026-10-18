/**
 * The project root a CLI verb works in: one resolution for `tau mcp`, `tau test`, `tau check`, `tau export` and
 * `tau open`, so every verb agrees on where a model's imports and an agent's paths resolve.
 *
 * @module
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Where a project root came from, as `tau mcp` names it on stderr. @internal */
export type ProjectRootSource =
  | '--project'
  | 'CLAUDE_PROJECT_DIR'
  | 'working directory'
  | 'tau.json'
  | "model's folder";

/** A resolved project root and where it came from. @internal */
export type ProjectRoot = Readonly<{ root: string; source: ProjectRootSource }>;

/**
 * The project root a verb works in.
 *
 * An explicit `--project` wins. A model file belongs to the nearest folder at or above it holding a `tau.json`, else
 * its own folder. A folder verb works in `CLAUDE_PROJECT_DIR` when it reads one (Claude Code sets it for the servers
 * it launches), else in the working directory. A named folder is the root as named, never widened to a `tau.json`
 * above it, because an agent names its files relative to the folder it works in.
 *
 * @internal
 * @param input - `--project`, the model file of a file verb, `CLAUDE_PROJECT_DIR` for `tau mcp`, and the working
 * directory relative paths resolve from.
 * @returns The absolute root and its source.
 */
export const resolveProjectRoot = (
  input: Readonly<{
    project?: string | undefined;
    file?: string | undefined;
    claudeProjectDir?: string | undefined;
    cwd: string;
  }>,
): ProjectRoot => {
  if (input.project !== undefined) {
    return { root: resolve(input.cwd, input.project), source: '--project' };
  }
  if (input.file !== undefined) {
    const file = resolve(input.cwd, input.file);
    for (let current = dirname(file); ; current = dirname(current)) {
      if (existsSync(resolve(current, 'tau.json'))) {
        return { root: current, source: 'tau.json' };
      }
      if (dirname(current) === current) {
        return { root: dirname(file), source: "model's folder" };
      }
    }
  }
  if (input.claudeProjectDir !== undefined) {
    return { root: resolve(input.cwd, input.claudeProjectDir), source: 'CLAUDE_PROJECT_DIR' };
  }
  return { root: resolve(input.cwd), source: 'working directory' };
};
