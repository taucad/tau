/**
 * Table-driven assertion that every language contribution declares its
 * `activationLanguageIds` explicitly. Catches regressions where a contribution
 * silently relies on the `[languageId]` fallback (which masks intent and makes
 * multi-id families easy to break).
 */
import { describe, it, expect } from 'vitest';
import { codeLanguages } from '@taucad/types/constants';
import type { LanguageContribution } from '#lib/monaco-language-registry.js';
import { jsContribution } from '#lib/javascript-contribution.js';
import { tsContribution } from '#lib/typescript-contribution.js';
import { kclContribution } from '#lib/kcl-language/kcl-register-language.js';
import { openscadContribution } from '#lib/openscad-language/openscad-register-language.js';
import { stepfileContribution } from '#lib/stepfile-language/stepfile-register-language.js';
import { stlContribution } from '#lib/stl-language/stl-register-language.js';
import { usdContribution } from '#lib/usd-language/usd-register-language.js';
import { sysmlContribution } from '#lib/sysml-language/sysml-register-language.js';

const contributions: ReadonlyArray<{
  readonly name: string;
  readonly contribution: LanguageContribution;
  readonly expectedIds: readonly string[];
}> = [
  {
    name: 'tsContribution',
    contribution: tsContribution,
    expectedIds: ['typescript', 'typescriptreact'],
  },
  {
    name: 'jsContribution',
    contribution: jsContribution,
    expectedIds: ['javascript', 'javascriptreact'],
  },
  {
    name: 'kclContribution',
    contribution: kclContribution,
    expectedIds: [codeLanguages.kcl],
  },
  {
    name: 'openscadContribution',
    contribution: openscadContribution,
    expectedIds: [codeLanguages.openscad],
  },
  {
    name: 'stepfileContribution',
    contribution: stepfileContribution,
    expectedIds: [codeLanguages.stepfile],
  },
  {
    name: 'stlContribution',
    contribution: stlContribution,
    expectedIds: [codeLanguages.stl],
  },
  {
    name: 'usdContribution',
    contribution: usdContribution,
    expectedIds: [codeLanguages.usd],
  },
  {
    name: 'sysmlContribution',
    contribution: sysmlContribution,
    expectedIds: [codeLanguages.sysml],
  },
];

describe('LanguageContribution.activationLanguageIds', () => {
  for (const { name, contribution, expectedIds } of contributions) {
    it(`${name} declares activationLanguageIds = ${JSON.stringify(expectedIds)}`, () => {
      expect(contribution.activationLanguageIds).toEqual(expectedIds);
    });
  }
});
