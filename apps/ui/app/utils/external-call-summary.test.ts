import { describe, expect, it } from 'vitest';
import { summarizeExternalCall, summaryNoun } from '#utils/external-call-summary.js';
import type { ExternalCallFacts } from '#utils/external-call-summary.js';

const skills = '/Users/rifont/Library/Application Support/Tau/acp-skills/6948/.agents/skills';

const call = (facts: Partial<ExternalCallFacts>): ExternalCallFacts => ({ locations: [], input: {}, ...facts });

const headerOf = (facts: Partial<ExternalCallFacts>): string | undefined => {
  const summary = summarizeExternalCall(call(facts));
  return summary === undefined ? undefined : `${summary.verb} ${summary.detail}`.trim();
};

describe('summarizeExternalCall', () => {
  it.each<[string, Partial<ExternalCallFacts>, string]>([
    // Codex read titles.
    [
      'a skill read',
      {
        kind: 'read',
        title: `Read file '${skills}/cad-replicad/SKILL.md'`,
        locations: [`${skills}/cad-replicad/SKILL.md`],
      },
      'Read skill cad-replicad',
    ],
    [
      'a plain Codex file read',
      { kind: 'read', title: "Read file '/work/cube/main.scad'", locations: ['/work/cube/main.scad'] },
      'Read main.scad',
    ],
    ['a directory listing', { kind: 'read', title: "List files in 'src'" }, 'Listed src'],
    ['a bare listing', { kind: 'read', title: 'List files' }, 'Listed files'],
    [
      'an image view',
      { kind: 'read', title: 'View Image /private/tmp/vase.png', locations: ['/private/tmp/vase.png'] },
      'Viewed image vase.png',
    ],
    // Web calls, from the raw input first and the title second.
    [
      'a web search input',
      {
        kind: 'search',
        title: 'Web search',
        input: { type: 'webSearch', query: '', action: { type: 'search', query: 'Nylon 11 CF modulus' } },
      },
      'Searched the web for Nylon 11 CF modulus',
    ],
    [
      'a web search title',
      { kind: 'search', title: 'Web search: worm gear thrust' },
      'Searched the web for worm gear thrust',
    ],
    ['an empty web search', { kind: 'search', title: 'Web search', input: { type: 'webSearch' } }, 'Searched the web'],
    [
      'a page open',
      {
        kind: 'search',
        title: 'Open page: https://www.pdas.com/naca456.html?x=1',
        input: { type: 'webSearch', action: { type: 'openPage', url: 'https://www.pdas.com/naca456.html?x=1' } },
      },
      'Opened pdas.com/naca456.html',
    ],
    [
      'a find in page',
      {
        kind: 'search',
        title: "Find in page for 'chord' in https://pdas.com/a/",
        input: { type: 'webSearch', action: { type: 'findInPage', url: 'https://pdas.com/a/', pattern: 'chord' } },
      },
      "Searched pdas.com/a for 'chord'",
    ],
    // Agent action titles.
    ['a subagent message', { kind: 'other', title: 'Interact with subagent airframe' }, 'Messaged subagent airframe'],
    ['a subagent start', { kind: 'other', title: 'Start subagent gimbal' }, 'Started subagent gimbal'],
    ['a wait', { kind: 'other', title: 'wait' }, 'Waited for agents'],
    ['an image generation', { kind: 'other', title: 'Image generation' }, 'Generated image'],
    ['a guardian review', { kind: 'think', title: 'Guardian Review' }, 'Reviewed approval'],
    ['a compaction', { kind: 'think', title: 'Compact conversation' }, 'Compacted conversation'],
    [
      'a foreign MCP call',
      { kind: 'execute', title: 'mcp.cua_repl.js', input: { code: '1' } },
      'Called js on cua_repl',
    ],
    ['a shell command', { kind: 'execute', input: { command: 'rg -n foo src', cwd: '/w' } }, 'Searched for foo in src'],
  ])('names %s', (_name, facts, header) => {
    expect(headerOf(facts)).toBe(header);
  });

  it.each<[string, Partial<ExternalCallFacts>]>([
    ['a plain read with its own title', { kind: 'read', title: 'Read main.ts', locations: ['main.ts'] }],
    ['a file search', { kind: 'search', title: "Search for 'x' in src" }],
    ['an unknown other title', { kind: 'other', title: 'Index dependency graph' }],
    ['a malformed MCP title', { kind: 'execute', title: 'mcp.', input: {} }],
    ['a raw shell command', { kind: 'execute', input: { command: 'openscad -o a.stl main.scad' } }],
    ['an edit', { kind: 'edit', title: 'Editing files' }],
  ])('leaves %s as reported', (_name, facts) => {
    expect(summarizeExternalCall(call(facts))).toBeUndefined();
  });

  it('assigns the families the group summary counts under', () => {
    expect(summarizeExternalCall(call({ kind: 'search', title: 'Web search: q' }))?.family).toBe('web-search');
    expect(summarizeExternalCall(call({ kind: 'search', title: 'Open page: https://a.b' }))?.family).toBe('web-read');
    expect(summarizeExternalCall(call({ kind: 'other', title: 'Start subagent x' }))?.family).toBe('other');
    expect(
      summarizeExternalCall(call({ kind: 'read', title: 'View Image /a.png', locations: ['/a.png'] }))?.locations,
    ).toEqual(['/a.png']);
  });

  it('phrases a failed call as what it was doing, for the error code to own the verb', () => {
    const summary = summarizeExternalCall(
      call({ kind: 'execute', input: { command: 'sed -n 1,9p a.ts && command -v dotnet' } }),
    );
    expect(summary === undefined ? undefined : summaryNoun(summary)).toBe('reading a.ts, checking for dotnet');
  });
});
