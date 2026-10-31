/* eslint-disable @typescript-eslint/naming-convention -- style and fold keys are Lezer node names from the grammar. */
import { LRLanguage, delimitedIndent, foldInside, foldNodeProp, indentNodeProp } from '@codemirror/language';
import type { LRParser } from '@lezer/lr';
import { styleTags } from '@lezer/highlight';
import type { Tag } from '@lezer/highlight';

type Delimited = Readonly<Record<string, string>>;

/**
 * A Lezer language with its highlighting, bracket indentation and folding.
 * `delimited` maps each bracketed node name to its closing token.
 */
export function defineLanguage({
  name,
  parser,
  styles,
  delimited = {},
  languageData,
}: Readonly<{
  name: string;
  parser: LRParser;
  styles: Readonly<Record<string, Tag | readonly Tag[]>>;
  delimited?: Delimited;
  languageData: Readonly<Record<string, unknown>>;
}>): LRLanguage {
  const nodes = Object.keys(delimited);
  return LRLanguage.define({
    name,
    parser: parser.configure({
      props: [
        styleTags(styles),
        indentNodeProp.add(
          Object.fromEntries(nodes.map((node) => [node, delimitedIndent({ closing: delimited[node]! })])),
        ),
        foldNodeProp.add({
          ...(nodes.length > 0 ? { [nodes.join(' ')]: foldInside } : {}),
          BlockComment: (node) => ({ from: node.from + 2, to: node.to - 2 }),
        }),
      ],
    }),
    languageData,
  });
}
