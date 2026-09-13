import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noSceneOverrideMaterialRule } from './no-scene-override-material.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

const TODO_COMMENT =
  '// TODO(webgpu-shader-and-pipeline-policy): replace with traverse-and-swap or composite-quad depth write';

describe('no-scene-override-material', () => {
  it('flags scene.overrideMaterial assignments and tolerates unrelated members', () => {
    ruleTester.run('no-scene-override-material', noSceneOverrideMaterialRule, {
      valid: [
        {
          name: 'unrelated material assignment on a mesh',
          code: 'mesh.material = newMaterial;',
        },
        {
          name: 'read-only access to scene.overrideMaterial',
          code: 'const previous = scene.overrideMaterial;',
        },
        {
          name: 'assignment on a non-scene receiver',
          code: 'helper.overrideMaterial = m;',
        },
        {
          name: 'computed property access',
          code: "scene['overrideMaterial'] = m;",
        },
        {
          name: 'unrelated property on a scene-like object',
          code: 'scene.background = color;',
        },
        {
          name: 'compound operator (treated as configured pattern, not bare assignment)',
          code: 'scene.overrideMaterial ??= m;',
        },
      ],
      invalid: [
        {
          name: 'flags scene.overrideMaterial = m',
          code: 'scene.overrideMaterial = depthOnly;',
          errors: [{ messageId: 'noSceneOverrideMaterial' }],
          output: TODO_COMMENT,
        },
        {
          name: 'flags this.scene.overrideMaterial = m',
          code: 'this.scene.overrideMaterial = depthOnly;',
          errors: [{ messageId: 'noSceneOverrideMaterial' }],
          output: TODO_COMMENT,
        },
        {
          name: 'flags state.scene.overrideMaterial = null',
          code: 'state.scene.overrideMaterial = null;',
          errors: [{ messageId: 'noSceneOverrideMaterial' }],
          output: TODO_COMMENT,
        },
        {
          name: 'flags identifier name containing scene substring',
          code: 'overlayScene.overrideMaterial = mat;',
          errors: [{ messageId: 'noSceneOverrideMaterial' }],
          output: TODO_COMMENT,
        },
        {
          name: 'flags useThree() destructure receiver',
          code: 'useThree().scene.overrideMaterial = mat;',
          errors: [{ messageId: 'noSceneOverrideMaterial' }],
          output: TODO_COMMENT,
        },
        {
          name: 'flags within an expression (no parent ExpressionStatement)',
          code: 'const result = (scene.overrideMaterial = depthOnly);',
          errors: [{ messageId: 'noSceneOverrideMaterial' }],
          output: null,
        },
      ],
    });
  });
});
