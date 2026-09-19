import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noInlineActorSelectorRule } from './no-inline-actor-selector.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

describe('no-inline-actor-selector', () => {
  it('flags inline selectors and freshly allocated defaults on curried selector hooks', () => {
    ruleTester.run('no-inline-actor-selector', noInlineActorSelectorRule, {
      valid: [
        {
          name: 'module-level selector with an undefined default',
          code: 'const v = useCadSelector(selectGeometry, undefined);',
        },
        {
          name: 'module-level selector with a primitive default',
          code: "const v = useCadSelector(selectStreamState, 'idle');",
        },
        {
          name: 'module-level selector with a hoisted object default',
          code: 'const v = useCadSelector(selectArtifactSave, idleArtifactSave);',
        },
        {
          name: 'memoized parameterised selector',
          code: 'const v = useCadSelector(selectIssuesFor, undefined);',
        },
        {
          name: 'other hooks are out of scope',
          code: 'const v = useGraphicsSelector((state) => state.context.enableGrid);',
        },
        {
          name: 'unrelated call with an inline function',
          code: 'const v = useMemo(() => compute(), []);',
        },
      ],
      invalid: [
        {
          name: 'inline arrow selector',
          code: 'const v = useCadSelector((state) => state.context.geometry, undefined);',
          errors: [{ messageId: 'inlineSelector', data: { hook: 'useCadSelector' } }],
        },
        {
          name: 'inline function-expression selector',
          code: 'const v = useCadSelector(function (state) { return state.context.units; }, undefined);',
          errors: [{ messageId: 'inlineSelector' }],
        },
        {
          name: 'freshly allocated array default',
          code: 'const v = useCadSelector(selectTimelineEntries, []);',
          errors: [{ messageId: 'unstableDefault' }],
        },
        {
          name: 'freshly allocated object default',
          code: "const v = useCadSelector(selectArtifactSave, { status: 'idle' });",
          errors: [{ messageId: 'unstableDefault' }],
        },
        {
          name: 'inline selector and unstable default together',
          code: 'const v = useCadSelector((state) => state.context.entries, []);',
          errors: [{ messageId: 'inlineSelector' }, { messageId: 'unstableDefault' }],
        },
      ],
    });
  });
});
