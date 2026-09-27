import { describe, expect, it } from 'vitest';
import {
  describeCommandActions,
  describeCommandTarget,
  summarizeExternalCall,
  summarizeShellCommand,
} from '#utils/shell-command-summary.js';

const skills = String.raw`/Users/rifont/Library/Application\ Support/Tau/acp-skills/6948bcdbbd9e2686da178a27c0cab4cbd75563d01ebf21bee18f73829c4e7715/.agents/skills`;
const skillsPath = skills.replace(String.raw`\ `, ' ');

const headerOf = (command: string): string | undefined => {
  const actions = summarizeShellCommand(command);
  if (actions === undefined) {
    return undefined;
  }
  const summary = describeCommandActions(actions);
  return `${summary.verb} ${summary.detail}`;
};

describe('summarizeShellCommand', () => {
  it.each([
    // The reported case: two skill reads joined by `&&`, a backslash-escaped space in the path.
    [
      `sed -n '1,240p' ${skills}/cad-openscad/SKILL.md && sed -n '1,280p' ${skills}/geospec-authoring/SKILL.md`,
      'Read skills cad-openscad, geospec-authoring',
    ],
    [`sed -n '1,260p' ${skills}/cad-picogk/SKILL.md`, 'Read skill cad-picogk'],
    [
      `cat '${skillsPath}/cad-picogk/SKILL.md' '${skillsPath}/geospec-authoring/api-types.md'`,
      'Read skill cad-picogk, geospec-authoring/api-types.md',
    ],
    [`/bin/zsh -lc "sed -n '1,220p' main.geospec.ts"`, 'Read main.geospec.ts'],
    [`"sed -n '1,220p' main.geospec.ts"`, 'Read main.geospec.ts'],
    ["bash -lc 'cat main.ts main.geospec.ts'", 'Read main.ts, main.geospec.ts'],
    ['cat -n main.ts', 'Read main.ts'],
    ['head -n 50 src/a.ts', 'Read a.ts'],
    ['tail -n +10 notes.md', 'Read notes.md'],
    ['nl -ba main.ts | sed -n 1,80p', 'Read main.ts'],
    ['cd packages/app && cat package.json', 'Read package.json'],
    ['cat a.ts; echo ---; cat b.ts', 'Read a.ts, b.ts'],
    ['ls', 'Listed files'],
    ['ls -la src', 'Listed src'],
    ['find src system -type f -maxdepth 4 -print 2>/dev/null | sort', 'Listed src, system'],
    ['rg --files packages | head -n 20', 'Listed packages'],
    ["rg -n 'toHaveVolume' api-index.md", 'Searched for toHaveVolume in api-index.md'],
    ["grep -rn 'drawCircle' src 2>&1 | head", 'Searched for drawCircle in src'],
    ["find . -name '*.scad'", 'Searched for *.scad in .'],
    ["find src -type f -not -name '*.geospec.ts' -print 2>/dev/null | sort", 'Listed src'],
    ['cat main.ts && rg -n foo src', 'Read main.ts, searched for foo in src'],
  ])('summarises %s', (command, header) => {
    expect(headerOf(command)).toBe(header);
  });

  it.each([
    'git status --short',
    'shasum -a 256 main.ts; git diff --check',
    "sed -i 's/a/b/' main.ts",
    "sed -n '1,10p' a.ts > copy.ts",
    'cat $(ls)',
    'cat `ls`',
    'cat "$HOME/a.ts"',
    'find . -name x -delete',
    'find . -exec rm {} ;',
    'rg --files | xargs rm',
    'cat a.ts &',
    'cat < a.ts',
    "cat 'unterminated",
    'node tooth-profile.test.ts',
    'echo hi',
    'cd src',
    'cat a | | b',
  ])('leaves %s as the raw command', (command) => {
    expect(summarizeShellCommand(command)).toBeUndefined();
  });

  it('refuses hostile input in bounded time', () => {
    const hostile = [
      `cat ${'a'.repeat(1_000_000)}`,
      `cat ${"'".repeat(4000)}`,
      `${'bash -lc '.repeat(400)}ls`,
      `cat ${'a '.repeat(2000)}`,
      `cd ${'/'.repeat(4000)}x && cat y`,
      `ls ${'| head '.repeat(600)}`,
      `echo ${'2>/dev/null '.repeat(300)}`,
    ];
    const start = performance.now();
    for (const command of hostile) {
      summarizeShellCommand(command);
    }
    expect(performance.now() - start).toBeLessThan(50);
    expect(summarizeShellCommand(hostile[0]!)).toBeUndefined();
  });
});

describe('describeCommandTarget', () => {
  it.each([
    [`${skillsPath}/cad-picogk/SKILL.md`, { type: 'skill', skill: 'cad-picogk' }],
    [
      '/Users/rifont/.codex/plugins/cache/ponytail/ponytail/4.10.0/skills/ponytail/SKILL.md',
      { type: 'skill', skill: 'ponytail' },
    ],
    ['/Users/rifont/.codex/skills/.system/openai-docs/SKILL.md', { type: 'skill', skill: 'openai-docs' }],
    ['skills/cad-zoo/SKILL.md', { type: 'skill', skill: 'cad-zoo' }],
    [
      `${skillsPath}/geospec-authoring/api-types.md`,
      { type: 'skill-file', skill: 'geospec-authoring', file: 'api-types.md' },
    ],
    ['/Users/rifont/.codex/skills/SKILL.md', { type: 'file', name: 'SKILL.md' }],
    ['/work/main.ts', { type: 'file', name: 'main.ts' }],
  ])('names %s', (path, target) => {
    expect(describeCommandTarget(path)).toEqual(target);
  });
});

describe('summarizeExternalCall', () => {
  it("renames Codex's single-read title only when it read a skill", () => {
    const skill = summarizeExternalCall({
      kind: 'read',
      title: `Read file '${skillsPath}/cad-replicad/SKILL.md'`,
      locations: [`${skillsPath}/cad-replicad/SKILL.md`],
      input: {},
    });
    expect(skill).toMatchObject({ verb: 'Read', detail: 'skill cad-replicad', family: 'skill' });
    expect(
      summarizeExternalCall({ kind: 'read', title: 'View Image /tmp/a.png', locations: ['/tmp/a.png'], input: {} }),
    ).toBeUndefined();
  });

  it('parses the raw input command of an execute call, with an active form', () => {
    const summary = summarizeExternalCall({
      kind: 'execute',
      title: undefined,
      locations: [],
      input: { command: 'rg -n foo src', cwd: '/w' },
    });
    expect(summary).toMatchObject({
      kind: 'search',
      family: 'search',
      activeVerb: 'Searching',
      activeDetail: 'for foo in src',
    });
    expect(
      summarizeExternalCall({ kind: 'execute', title: 'mcp.tau.test_model', locations: [], input: { files: [] } }),
    ).toBeUndefined();
  });
});
