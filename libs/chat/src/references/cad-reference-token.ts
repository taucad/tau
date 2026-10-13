import type { GeometryComponentReference } from '@taucad/types';
import type { CadReference } from '#references/cad-reference.schema.js';

/** The part of a reference its text token carries. @public */
export type CadReferenceTokenTarget = Readonly<{ path: string; componentId: string }>;

/** One run of message text: plain text, or a `@cad[...]` token and the target it names. @public */
export type CadReferenceTokenSegment =
  | Readonly<{ type: 'text'; value: string }>
  | Readonly<{ type: 'cadReference'; token: string; target: CadReferenceTokenTarget }>;

const escapePart = (value: string, special: RegExp): string => value.replaceAll(special, (char) => `\\${char}`);
const unescapePart = (value: string): string => value.replaceAll(/\\(.)/gu, '$1');

/**
 * `@cad[<path>#<componentId>]`: a backslash escapes `\`, `[`, `]` and (in the path) `#`.
 * A token starts the text or follows whitespace or an opening bracket or parenthesis, like an `@path` reference.
 */
const tokenPattern = /(?<=^|[\s([{])@cad\[((?:\\.|[^\\\]#])+)#((?:\\.|[^\\\]])+)\]/gu;

/**
 * The text token for a reference: what the message text carries, what drafts keep, and what a text host pastes.
 *
 * @param target - The file path and component id (a whole {@link CadReference} target also fits).
 * @returns The token, such as `@cad[gears/main.ts#component:sun_gear]`.
 * @public
 */
export function formatCadReferenceToken(target: CadReferenceTokenTarget): string {
  return `@cad[${escapePart(target.path, /[\\[\]#]/gu)}#${escapePart(target.componentId, /[\\[\]]/gu)}]`;
}

/**
 * The text token of a structured reference.
 *
 * @param reference - The reference.
 * @returns Its `@cad[...]` token.
 * @public
 */
export function cadReferenceToken(reference: CadReference): string {
  return formatCadReferenceToken({ path: reference.resource.path, componentId: reference.target.componentId });
}

/**
 * Split text into plain runs and `@cad[...]` tokens. Text that is not a well-formed token stays text, so
 * joining every segment's text (`value`, or `token`) gives back the input.
 *
 * @param text - Message or draft text.
 * @returns The segments in order.
 * @public
 */
export function parseCadReferenceTokens(text: string): CadReferenceTokenSegment[] {
  const segments: CadReferenceTokenSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(tokenPattern)) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) });
    }
    segments.push({
      type: 'cadReference',
      token: match[0],
      target: { path: unescapePart(match[1] ?? ''), componentId: unescapePart(match[2] ?? '') },
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments;
}

/**
 * The wire reference for a viewer's geometry component reference.
 *
 * @param reference - What the viewer built for a component (`buildGeometryComponentReference`).
 * @returns The structured reference.
 * @public
 */
export function cadReferenceFromGeometryComponent(reference: GeometryComponentReference): CadReference {
  return {
    resource: {
      kind: 'workspace-file',
      path: reference.filePath,
      ...(reference.geometryHash === undefined ? {} : { revision: reference.geometryHash }),
    },
    target: {
      kind: 'component',
      componentId: reference.componentId,
      ...(reference.selector === '' ? {} : { selector: reference.selector }),
      label: reference.label,
      componentKind: reference.kind,
    },
  };
}

/**
 * The reference a bare token names, when nothing richer travelled with it (a draft or a pasted message). The label
 * is the component id's last segment; the kind is unknown.
 *
 * @param target - The token's path and component id.
 * @returns A structured reference with only what the token says.
 * @public
 */
export function cadReferenceFromToken(target: CadReferenceTokenTarget): CadReference {
  return {
    resource: { kind: 'workspace-file', path: target.path },
    target: {
      kind: 'component',
      componentId: target.componentId,
      label: cadReferenceTokenLabel(target),
      componentKind: 'unknown',
    },
  };
}

/**
 * A short label for a token target: the component id after its last `:` or `/`.
 *
 * @param target - The token's path and component id.
 * @returns The label.
 * @public
 */
export function cadReferenceTokenLabel(target: CadReferenceTokenTarget): string {
  const tail = /[^:/]+$/u.exec(target.componentId)?.[0];
  return tail ?? target.componentId;
}
