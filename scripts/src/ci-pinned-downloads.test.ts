import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { formatOutputs, pinnedDownloads, run } from '#ci-pinned-downloads.js';
import type { GraphFile } from '#ci-pinned-downloads.js';

const root = resolve(import.meta.dirname, '../..');
const host = 'linux-x64';

type ProjectJson = { readonly name: string; readonly targets: Record<string, { options?: { command?: string } }> };

/** The project graph node of a real project, read from its checked-in `project.json`. */
const node = (directory: string): [string, GraphFile['graph']['nodes'][string]] => {
  const project = JSON.parse(readFileSync(resolve(root, directory, 'project.json'), 'utf8')) as ProjectJson;
  return [project.name, { data: { root: directory, targets: project.targets } }];
};

const projectGraph: GraphFile = {
  graph: {
    nodes: Object.fromEntries(
      ['packages/plugins/build123d', 'packages/plugins/smlibpy', 'apps/libs/openscad-language', 'packages/cli'].map(
        (directory) => node(directory),
      ),
    ),
  },
};

const taskGraph = (...ids: string[]): GraphFile => ({
  ...projectGraph,
  tasks: {
    tasks: Object.fromEntries(
      ids.map((id) => {
        const [project = '', target = ''] = id.split(':');
        return [id, { target: { project, target } }];
      }),
    ),
  },
});

const entry = (graph: GraphFile, name: string, at = root) =>
  pinnedDownloads(graph, { root: at, host }).find((candidate) => candidate.name === name);

describe('ci-pinned-downloads', () => {
  it('should name every pinned download of a project graph, keyed by its pins', () => {
    const wasiSdk = JSON.parse(
      readFileSync(resolve(root, 'apps/libs/openscad-language/scripts/wasi-sdk.json'), 'utf8'),
    ) as { archives: Record<string, { archive: string; sha256: string }> };
    const seeds = entry(projectGraph, 'kernel-seeds');
    expect(seeds?.key).toMatch(/^ci-kernel-seeds-v1-linux-x64-[\da-f]{64}$/u);
    expect(seeds?.paths).toEqual(['out/cache/build123d-seed', 'out/cache/smlibpy-seed']);
    expect(entry(projectGraph, 'wasi-sdk')).toEqual({
      name: 'wasi-sdk',
      key: `ci-wasi-sdk-v1-linux-x64-${wasiSdk.archives['linux-x64']?.sha256}`,
      paths: [`out/cache/wasi-sdk/${wasiSdk.archives['linux-x64']?.archive}`],
    });
  });

  it('should name an entry for a task graph only when one of its tasks fills that entry', () => {
    expect(entry(taskGraph('cli:test', 'build123d:seed'), 'kernel-seeds')?.key).toBe(
      entry(projectGraph, 'kernel-seeds')?.key,
    );
    expect(entry(taskGraph('cli:test', 'build123d:seed'), 'wasi-sdk')?.key).toBe('');
    expect(entry(taskGraph('openscad-language:prepare'), 'wasi-sdk')?.key).toBe(entry(projectGraph, 'wasi-sdk')?.key);
    expect(entry(taskGraph('openscad-language:prepare'), 'kernel-seeds')?.key).toBe('');
    // The Rust tests run the same script with `--test`, which compiles nothing for wasm32.
    expect(entry(taskGraph('openscad-language:test-rust', 'cli:build'), 'wasi-sdk')?.key).toBe('');
    // Paths stay stated, so a save step with an empty key is never handed an empty path list.
    expect(entry(taskGraph('cli:build'), 'kernel-seeds')?.paths).toHaveLength(2);
  });

  describe('against a copy of the pin sources', () => {
    let copy: string;

    beforeEach(() => {
      copy = mkdtempSync(join(tmpdir(), 'tau-ci-pinned-downloads-'));
      for (const path of [
        'packages/plugins/build123d/tau-plugin.json',
        'packages/plugins/smlibpy/tau-plugin.json',
        'apps/libs/openscad-language/scripts/wasi-sdk.json',
      ]) {
        mkdirSync(dirname(join(copy, path)), { recursive: true });
        cpSync(resolve(root, path), join(copy, path));
      }
    });

    afterEach(() => {
      rmSync(copy, { recursive: true, force: true });
    });

    const edit = (path: string, change: (value: Record<string, unknown>) => void): void => {
      const value = JSON.parse(readFileSync(join(copy, path), 'utf8')) as Record<string, unknown>;
      change(value);
      writeFileSync(join(copy, path), JSON.stringify(value));
    };

    it('should change the seed key with a pin for this host and keep it for another host', () => {
      const before = entry(projectGraph, 'kernel-seeds', copy)?.key;
      expect(before).toBe(entry(projectGraph, 'kernel-seeds')?.key);
      type Variants = Record<
        string,
        Array<{ target: { os: string; arch: string }; files: Array<{ integrity: string }> }>
      >;
      const repin = (os: string): void => {
        edit('packages/plugins/smlibpy/tau-plugin.json', (manifest) => {
          for (const variant of Object.values(manifest['dependencies'] as Variants).flat()) {
            if (variant.target.os === os && variant.files[0]) {
              variant.files[0].integrity = `sha256-${os}-repinned`;
            }
          }
        });
      };
      repin('darwin');
      expect(entry(projectGraph, 'kernel-seeds', copy)?.key).toBe(before);
      repin('linux');
      expect(entry(projectGraph, 'kernel-seeds', copy)?.key).not.toBe(before);
    });

    it('should refuse a kernel package that pins nothing for this host', () => {
      edit('packages/plugins/smlibpy/tau-plugin.json', (manifest) => {
        manifest['dependencies'] = {};
      });
      expect(() => entry(projectGraph, 'kernel-seeds', copy)).toThrow(
        'packages/plugins/smlibpy/tau-plugin.json pins no linux-x64 dependency file.',
      );
    });
  });

  it('should print GITHUB_OUTPUT lines with each path list as a delimited block', () => {
    expect(formatOutputs([{ name: 'wasi-sdk', key: 'k', paths: ['a', 'b'] }])).toBe(
      'wasi-sdk-key=k\nwasi-sdk-path<<EOF\na\nb\nEOF\n',
    );
  });

  it('should exit 2 without a graph and 1 on an unreadable one', () => {
    expect(run([], { root, host }).code).toBe(2);
    expect(run(['--graph'], { root, host }).code).toBe(2);
    expect(run(['--graph', join(tmpdir(), 'tau-no-such-graph.json')], { root, host }).code).toBe(1);
  });
});
