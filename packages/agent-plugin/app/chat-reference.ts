import { cadReferenceFromGeometryComponent, cadReferenceToken } from '@taucad/chat/references';
import type { CadReference } from '@taucad/chat/references';
import type { TauViewerModel } from '@taucad/mcp/viewer-protocol';
import type { GeometryComponentReference } from '@taucad/types';

/** What "Add to chat" hands the conversation: the text the model reads, and the structured references behind it. */
export type ChatReference = Readonly<{ text: string; references: readonly CadReference[] }>;

/**
 * The page's "Add to chat" payload (blueprint D6, E8): the parts' labels and `@cad[...]` tokens, the same reference
 * objects the workbench chip carries, or the model's name and file when no part is named.
 *
 * @param model - The model the page shows.
 * @param parts - The viewer's references to the parts, in the order the person added them.
 * @returns The text and references.
 */
export const chatReferenceOf = (model: TauViewerModel, parts: readonly GeometryComponentReference[]): ChatReference => {
  if (parts.length === 0) {
    return { text: `${model.title} (${model.sourceFile ?? model.path})`, references: [] };
  }
  const references = parts.map((part) => cadReferenceFromGeometryComponent(part));
  const labels = parts.map((part) => part.label).join(', ');
  const tokens = references.map((reference) => cadReferenceToken(reference)).join(' ');
  return { text: `${labels} in ${model.title} ${tokens}`, references };
};
