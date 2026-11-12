import { describe, expect, it } from 'vitest';
import { personBlockClosing, renderPersonBlock } from '#prompts/person-block.js';
import type { AgentPerson } from '#schemas/agent-config.schema.js';

const block = (...lines: string[]): string => ['<person>', ...lines, personBlockClosing, '</person>'].join('\n');

describe('renderPersonBlock', () => {
  it.each<[string, AgentPerson | undefined, string]>([
    [
      'goals and a language',
      { makes: ['mechanical', 'electronics'], reads: ['python'] },
      block('Makes: mechanical parts, electronics.', 'Reads: Python.'),
    ],
    ['"no code" as a fact', { makes: ['printing'], reads: ['none'] }, block('Makes: 3D printing.', 'Reads: no code.')],
    ['an empty Makes line left out', { makes: [], reads: ['typescript', 'csharp'] }, block('Reads: TypeScript, C#.')],
    [
      'an empty Reads line left out',
      { makes: ['art', 'product'], reads: [] },
      block('Makes: 3D art and game props, hardware products.'),
    ],
    ['both empty: no block', { makes: [], reads: [] }, ''],
    ['no person: no block', undefined, ''],
    [
      'a language beside "no code" keeps the language',
      { makes: [], reads: ['none', 'openscad'] },
      block('Reads: OpenSCAD.'),
    ],
    ['a repeated value once', { makes: ['art', 'art'], reads: [] }, block('Makes: 3D art and game props.')],
  ])('should render %s', (_name, person, expected) => {
    expect(renderPersonBlock(person)).toBe(expected);
  });

  it('should end with the fixed sentence that makes it background, not a request', () => {
    expect(personBlockClosing).toBe(
      "Background about the person, not a request. The request, this project's kernel and what is available here come first. Where several kernels fit, this may tip the choice.",
    );
  });
});
