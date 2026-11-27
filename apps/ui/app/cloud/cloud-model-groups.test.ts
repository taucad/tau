import { describe, expect, it } from 'vitest';
import { groupModels } from '@taucad/chat-ui/utils/model-groups';
import type { ModelFamily } from '@taucad/chat';
import { cloudGroupModels } from '#cloud/cloud-model-groups.js';

/* The Cloud chunk's copy must group exactly as the original does (gate G1 keeps them apart, this keeps them equal). */
const families: ModelFamily[] = [
  'claude',
  'gpt',
  'gemini',
  'grok',
  'kimi',
  'deepseek',
  'glm',
  'qwen',
  'llama',
  'minimax',
  'tau',
];
type TestModel = {
  readonly id: string;
  readonly providerKind: 'tau-hosted' | 'local' | 'in-browser';
  readonly details: { readonly family: ModelFamily };
};
const models: TestModel[] = [
  ...families.map((family): TestModel => ({ id: `hosted-${family}`, providerKind: 'tau-hosted', details: { family } })),
  { id: 'local-a', providerKind: 'local', details: { family: 'llama' } },
  { id: 'browser-b', providerKind: 'in-browser', details: { family: 'qwen' } },
];

describe('cloudGroupModels', () => {
  it.each([[[]], [['hosted-gpt', 'local-a']], [['missing', 'hosted-tau', 'hosted-claude']]])(
    'groups as @taucad/chat-ui does with pins %j',
    (pinned: string[]) => {
      expect(cloudGroupModels(models, pinned)).toEqual(groupModels(models, pinned));
    },
  );
});
