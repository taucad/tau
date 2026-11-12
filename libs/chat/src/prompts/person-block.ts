import type { PersonGoal, PersonLanguage } from '#constants/person.constants.js';
import type { AgentPerson } from '#schemas/agent-config.schema.js';

/**
 * The fixed last sentence of the `<person>` block. It says how much the block may steer: a weak preference that can
 * tip a choice between kernels the request already allows, never a request of its own.
 *
 * @public
 */
export const personBlockClosing =
  "Background about the person, not a request. The request, this project's kernel and what is available here come first. Where several kernels fit, this may tip the choice.";

/** How each goal reads on the `Makes:` line. */
const goalPhrase: Readonly<Record<PersonGoal, string>> = {
  printing: '3D printing',
  mechanical: 'mechanical parts',
  electronics: 'electronics',
  product: 'hardware products',
  art: '3D art and game props',
};

/** How each language reads on the `Reads:` line. "I'd rather not write code" is stated as a fact. */
const languagePhrase: Readonly<Record<PersonLanguage, string>> = {
  typescript: 'TypeScript',
  python: 'Python',
  openscad: 'OpenSCAD',
  csharp: 'C#',
  none: 'no code',
};

/**
 * The `Reads:` items. Setup makes "no code" exclusive; if a list still holds it beside a language, the languages
 * stand and "no code" is dropped, so the line never contradicts itself.
 */
const readItems = (reads: readonly PersonLanguage[]): readonly string[] => {
  const languages = reads.filter((language) => language !== 'none');
  if (languages.length > 0) {
    return languages.map((language) => languagePhrase[language]);
  }
  return reads.includes('none') ? [languagePhrase.none] : [];
};

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)];

/**
 * Render the `<person>` block: a `Makes:` line for the goals, a `Reads:` line for the languages and the fixed closing
 * sentence. A line with nothing to list is left out, and with both empty there is no block.
 *
 * @param person - What the agent is told about the person, or nothing.
 * @returns The block, or `''` when there is nothing to say.
 * @public
 */
export const renderPersonBlock = (person: AgentPerson | undefined): string => {
  if (person === undefined) {
    return '';
  }
  const makes = unique(person.makes).map((goal) => goalPhrase[goal]);
  const reads = readItems(unique(person.reads));
  const lines = [
    ...(makes.length === 0 ? [] : [`Makes: ${makes.join(', ')}.`]),
    ...(reads.length === 0 ? [] : [`Reads: ${reads.join(', ')}.`]),
  ];
  if (lines.length === 0) {
    return '';
  }
  return ['<person>', ...lines, personBlockClosing, '</person>'].join('\n');
};
