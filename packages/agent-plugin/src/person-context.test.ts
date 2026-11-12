import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { codexDefaultPrompts, codexLongDescription, pluginDescription } from '#descriptions.js';

/*
 * Only Tau's own agent in the app is told what the person makes and the code they read. The plugin's agent reads the
 * tau skill, the plugin's descriptions and what `tau mcp` serves, and the viewer page hands the conversation only the
 * parts the person adds. None of them may carry the person block, and the plugin cannot build one: it never reads the
 * person record that holds the setup answers.
 */

const root = fileURLToPath(new URL('..', import.meta.url));

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return name === 'node_modules' ? [] : sourceFiles(path);
    }
    return /\.(?:ts|tsx)$/u.test(name) && !/\.test\.tsx?$/u.test(name) ? [path] : [];
  });

describe('the person block', () => {
  it('should be absent from the committed tau skill and the plugin descriptions', () => {
    const texts = [
      readFileSync(join(root, 'skills', 'tau', 'SKILL.md'), 'utf8'),
      pluginDescription,
      codexLongDescription,
      ...codexDefaultPrompts,
    ];

    for (const text of texts) {
      expect(text).not.toContain('<person>');
      expect(text).not.toMatch(/^Makes: /mu);
    }
  });

  it('should have no source that reads the person record', () => {
    const manifest = readFileSync(join(root, 'package.json'), 'utf8');
    const readers = ['app', 'src']
      .flatMap((folder) => sourceFiles(join(root, folder)))
      .filter((path) => /@taucad\/preferences|person-profile|chat-ctx-person/u.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));

    expect(manifest).not.toContain('@taucad/preferences');
    expect(readers).toEqual([]);
  });
});
