import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { load } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

import { maxAge, scheduledWorkflows } from '#nightly-watchdog.js';

/*
 * `docs-links.yml` (CI throughput program, DL-1): lychee checks the changed docs pages on pull requests
 * and in the merge queue, every page on a `main` push and on a daily sweep that the nightly watchdog
 * watches, accepts no 403, and checks npm package pages through the registry, which answers 404.
 */

const root = resolve(import.meta.dirname, '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

/** A GitHub Actions `${{ … }}` expression, built so the source holds no template-like string literal. */
const expression = (body: string): string => ['$', '{{ ', body, ' }}'].join('');

type Step = {
  readonly id?: string;
  readonly name?: string;
  readonly if?: string;
  readonly run?: string;
  readonly uses?: string;
  readonly env?: Record<string, string>;
  readonly with?: Record<string, string | boolean>;
};
type Workflow = {
  readonly on: {
    readonly pull_request?: { readonly paths?: readonly string[] };
    readonly merge_group?: { readonly types?: readonly string[] };
    readonly push?: { readonly branches?: readonly string[]; readonly paths?: readonly string[] };
    readonly schedule?: ReadonlyArray<{ readonly cron: string }>;
    readonly workflow_dispatch?: unknown;
  };
  readonly jobs: Record<string, { readonly steps: readonly Step[] }>;
};

const source = read('.github/workflows/docs-links.yml');
const workflow = load(source) as Workflow;
const steps = workflow.jobs['links']?.steps ?? [];
const select = steps.find((step) => step.id === 'select');
const lychee = steps.filter((step) => step.uses?.startsWith('lycheeverse/lychee-action@'));
const mainConfig = read('apps/docs/lychee.toml');

const npmRemap = String.raw`^https://www\.npmjs\.com/package/(.+)$ https://registry.npmjs.org/$1`;

const paths = ['apps/docs/content/**', 'apps/docs/lychee.toml', '.github/workflows/docs-links.yml'];

/** A TOML array of single-quoted literal strings, as the lychee configs write them. */
const tomlArray = (text: string, key: string): readonly string[] | undefined => {
  const match = new RegExp(`^${key} = \\[(.*)\\]$`, 'mu').exec(text);
  return match?.[1]?.split(',').map((value) => value.trim().replaceAll(/^['"]|['"]$/gu, ''));
};

describe('docs-links.yml triggers', () => {
  it('should check docs changes on pull requests and in the merge queue', () => {
    expect(workflow.on.pull_request?.paths).toEqual(paths);
    expect(workflow.on.merge_group?.types).toEqual(['checks_requested']);
  });

  it('should check every page on a push to main with the same paths, and never on another branch', () => {
    expect(workflow.on.push?.branches).toEqual(['main']);
    expect(workflow.on.push?.paths).toEqual(paths);
    expect(source).not.toMatch(/geospec/iu);
  });

  it('should sweep every page daily and on dispatch', () => {
    const crons = (workflow.on.schedule ?? []).map((entry) => entry.cron);
    expect(crons).toHaveLength(1);
    // Day of month, month and day of week: every day.
    expect(crons[0]!.split(/\s+/u).slice(2)).toEqual(['*', '*', '*']);
    expect(workflow.on).toHaveProperty('workflow_dispatch');
  });

  it('should stay out of ci.yml, whose result is the colour of main and the release gate', () => {
    expect(read('.github/workflows/ci.yml')).not.toMatch(/lychee/iu);
  });
});

describe('docs-links.yml lychee passes', () => {
  it('should run one pass over the selected pages, through --files-from rather than evaluated args', () => {
    expect(lychee).toHaveLength(1);
    const [step] = lychee;
    const args = String(step?.with?.['args']);
    expect(/--config (\S+)/u.exec(args)?.[1]).toBe('apps/docs/lychee.toml');
    expect(args).toContain(`--files-from "${expression('runner.temp')}/docs-links-pages.txt"`);
    expect(args).not.toMatch(/--accept|\s-a\s|--remap|--exclude|--include|\.mdx/u);
    expect(step?.if).toBe("steps.select.outputs.mode != 'none'");
    expect(String(step?.with?.['fail'])).toBe('true');
  });

  it('should check npm package pages through the registry, which answers 404 for a missing package', () => {
    expect(tomlArray(mainConfig, 'remap')).toEqual([npmRemap]);
  });

  it('should accept no 403 anywhere', () => {
    expect(mainConfig).not.toMatch(/^accept\b/mu);
    expect(source).not.toMatch(/--accept\b|\s-a\s/u);
    expect(existsSync(resolve(root, 'apps/docs/lychee.npmjs.toml'))).toBe(false);
  });

  it('should exclude no host and keep no ignore file', () => {
    for (const ignore of ['.lycheeignore', 'apps/docs/.lycheeignore', 'lychee.toml']) {
      expect(existsSync(resolve(root, ignore)), ignore).toBe(false);
    }
    expect(mainConfig).not.toMatch(
      /^(?:exclude|include|exclude_path|exclude_all_private|accept_timeouts|insecure)\b/mu,
    );
  });
});

describe('docs-links.yml page selection', () => {
  let repository: string | undefined;

  afterEach(() => {
    if (repository) {
      rmSync(repository, { recursive: true, force: true });
      repository = undefined;
    }
  });

  const git = (cwd: string, ...args: string[]): string => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };

  const write = (cwd: string, files: Record<string, string>): void => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(cwd, path)), { recursive: true });
      writeFileSync(join(cwd, path), text);
    }
  };

  /** Run the select step on a change from a base commit to a head commit, as the given event. */
  const selectFor = (
    event: string,
    change: { readonly add?: Record<string, string>; readonly remove?: readonly string[] },
  ): { readonly status: number | undefined; readonly output: string; readonly pages: string; readonly log: string } => {
    repository = mkdtempSync(join(tmpdir(), 'docs-links-'));
    const cwd = repository;
    git(cwd, 'init', '--quiet', '--initial-branch=main');
    git(cwd, 'config', 'user.email', 'ci@example.invalid');
    git(cwd, 'config', 'user.name', 'CI');
    write(cwd, {
      'apps/docs/content/docs/kept.mdx': 'kept',
      'apps/docs/content/docs/gone.mdx': 'gone',
      'apps/ui/index.ts': 'ui',
    });
    git(cwd, 'add', '.');
    git(cwd, 'commit', '--quiet', '-m', 'base');
    const base = git(cwd, 'rev-parse', 'HEAD');
    write(cwd, change.add ?? {});
    for (const path of change.remove ?? []) {
      rmSync(join(cwd, path));
    }
    git(cwd, 'add', '-A');
    git(cwd, 'commit', '--quiet', '--allow-empty', '-m', 'head');
    git(cwd, 'remote', 'add', 'origin', cwd);
    const output = join(cwd, '.output');
    const pages = join(cwd, '.pages');
    writeFileSync(output, '');
    const result = spawnSync('bash', ['-c', select?.run ?? 'exit 99'], {
      cwd,
      encoding: 'utf8',
      env: Object.fromEntries([
        ['PATH', process.env['PATH']],
        ['EVENT', event],
        ['BASE', base],
        ['PAGES', pages],
        ['GITHUB_OUTPUT', output],
      ]),
    });
    return {
      status: result.status ?? undefined,
      output: readFileSync(output, 'utf8'),
      pages: existsSync(pages) ? readFileSync(pages, 'utf8') : '',
      log: result.stdout + result.stderr,
    };
  };

  it('should read the base of the pull request or the merge group', () => {
    expect(select?.env?.['BASE']).toBe(
      expression('github.event.pull_request.base.sha || github.event.merge_group.base_sha'),
    );
  });

  it.each(['schedule', 'push', 'workflow_dispatch'])('should check every page on %s', (event) => {
    const result = selectFor(event, {});
    expect(result.status).toBe(0);
    expect(result.output).toBe('mode=full\n');
    expect(result.pages).toBe('apps/docs/content/**/*.mdx\n');
  });

  it.each(['pull_request', 'merge_group'])('should check only the added and modified pages on %s', (event) => {
    const result = selectFor(event, {
      add: {
        'apps/docs/content/docs/kept.mdx': 'edited',
        'apps/docs/content/docs/new.mdx': 'new',
        'apps/docs/content/docs/meta.json': '{}',
        'apps/ui/index.ts': 'edited',
      },
      remove: ['apps/docs/content/docs/gone.mdx'],
    });
    expect(result.status).toBe(0);
    expect(result.output).toBe('mode=changed\n');
    expect(result.pages).toBe('apps/docs/content/docs/kept.mdx\napps/docs/content/docs/new.mdx\n');
  });

  it.each(['pull_request', 'merge_group'])('should skip lychee on %s when no page changed', (event) => {
    const result = selectFor(event, { add: { 'apps/ui/index.ts': 'edited' } });
    expect(result.status).toBe(0);
    expect(result.output).toBe('mode=none\n');
  });

  it.each(['apps/docs/lychee.toml', '.github/workflows/docs-links.yml'])(
    'should check every page when %s changes',
    (path) => {
      const result = selectFor('merge_group', { add: { [path]: 'changed' } });
      expect(result.status).toBe(0);
      expect(result.output).toBe('mode=full\n');
    },
  );

  it('should refuse a page name that is not a plain path', () => {
    const result = selectFor('pull_request', { add: { 'apps/docs/content/docs/$(id)*.mdx': 'x' } });
    expect(result.status).toBe(1);
    expect(result.log).toContain('::error::A changed docs page has a name outside');
    expect(result.pages).toBe('');
  });
});

describe('docs-links.yml watchdog coverage', () => {
  it('should be watched by the nightly watchdog as a daily workflow', async () => {
    const found = await scheduledWorkflows(resolve(root, '.github/workflows'));
    const docsLinks = found.find((entry) => entry.file === 'docs-links.yml');
    expect(docsLinks?.crons).toEqual((workflow.on.schedule ?? []).map((entry) => entry.cron));
    expect(maxAge(docsLinks?.crons ?? [])).toBe(36 * 60 * 60 * 1000);
  });
});
