import type { ModelFamily } from '@taucad/chat';

/** Who makes each model family, which is what the row's glyph shows (Kimi is served by Together but made by Moonshot). */
const makers: Readonly<Record<ModelFamily, string>> = {
  claude: 'Anthropic',
  gpt: 'OpenAI',
  gemini: 'Google',
  grok: 'xAI',
  kimi: 'Moonshot AI',
  deepseek: 'DeepSeek',
  glm: 'Z.ai',
  qwen: 'Qwen',
  llama: 'Meta',
  minimax: 'MiniMax',
  tau: 'Tau',
};

/** The heading over models that run on the person's own machine. */
export const localGroupName = 'On this computer';

/** The heading over the person's pinned models. */
export const pinnedGroupName = 'Pinned';

type GroupableModel = {
  readonly id: string;
  readonly providerKind: 'tau-hosted' | 'local' | 'in-browser';
  readonly details: { readonly family: ModelFamily };
};

/**
 * Sections a model list the way multi-model pickers commonly do (approach A of
 * `docs/research/chat-model-list-pinned-blueprint.md`): the person's pinned
 * models first, in the order they were pinned; then one group per maker, in
 * catalog order; then models that run on this computer. A pinned model leaves
 * its own group. Empty groups are dropped. Both builds share it.
 *
 * @param models - The models to list, in catalog order.
 * @param pinnedIds - Pinned model ids, in pin order; ids not in `models` are ignored.
 * @returns The groups to draw, each with a heading.
 */
export const groupModels = <T extends GroupableModel>(
  models: readonly T[],
  pinnedIds: readonly string[],
): Array<{ name: string; items: T[] }> => {
  const pinned = pinnedIds.flatMap((id) => models.filter((model) => model.id === id));
  const groups = new Map<string, T[]>();
  const local: T[] = [];
  for (const model of models) {
    if (pinnedIds.includes(model.id)) {
      continue;
    }
    if (model.providerKind === 'tau-hosted') {
      const maker = makers[model.details.family];
      groups.set(maker, [...(groups.get(maker) ?? []), model]);
    } else {
      local.push(model);
    }
  }
  return [
    { name: pinnedGroupName, items: pinned },
    ...[...groups].map(([name, items]) => ({ name, items })),
    { name: localGroupName, items: local },
  ].filter((group) => group.items.length > 0);
};
