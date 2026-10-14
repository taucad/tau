import { cadReferenceFromGeometryComponent, cadReferenceToken } from '@taucad/chat/references';
import type { CadReference } from '@taucad/chat/references';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type { GeometryComponentReference } from '@taucad/types';

/** What "Add to chat" hands the conversation: the text the model reads, and the structured references behind it. */
export type ChatReference = Readonly<{ text: string; references: readonly CadReference[] }>;

/**
 * The page's "Add to chat" payload (blueprint D6, E8): the picked component's label and `@cad[...]` token, the same
 * reference object the workbench chip carries, or the model's name and file when nothing is picked.
 *
 * @param model - The model the page shows.
 * @param picked - The viewer's reference to the picked component, if any.
 * @returns The text and references.
 */
export const chatReferenceOf = (
  model: TauViewerModel,
  picked: GeometryComponentReference | undefined,
): ChatReference => {
  if (picked === undefined) {
    return { text: `${model.title} (${model.sourceFile ?? model.path})`, references: [] };
  }
  const reference = cadReferenceFromGeometryComponent(picked);
  return { text: `${picked.label} in ${model.title} ${cadReferenceToken(reference)}`, references: [reference] };
};
