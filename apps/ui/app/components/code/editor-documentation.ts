import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Completion } from '@codemirror/autocomplete';

const documentationProcessor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeSanitize, { ...defaultSchema, tagNames: defaultSchema.tagNames?.filter((tag) => tag !== 'img') })
  .use(rehypeStringify);

/** Render language-server documentation without admitting raw HTML or executable links. */
export function renderEditorDocumentation(markdown: string, ownerDocument = globalThis.document): HTMLDivElement {
  const dom = ownerDocument.createElement('div');
  dom.className = 'cm-documentation';
  // Both raw HTML and unsafe URL schemes are removed before inserting the generated markup.
  dom.innerHTML = String(documentationProcessor.processSync(markdown));
  return dom;
}

/** Defer completion documentation parsing until the suggestion is selected. */
export function editorCompletionInfo(markdown: string | undefined): Completion['info'] {
  return markdown ? () => renderEditorDocumentation(markdown) : undefined;
}

/** Preserve signature token roles supplied by TypeScript without loading another parser. */
export function renderTypeScriptDocumentation(
  parts: ReadonlyArray<{ text: string; kind: string }>,
  markdown: string,
  ownerDocument = globalThis.document,
): HTMLDivElement {
  const dom = renderEditorDocumentation(markdown, ownerDocument);
  if (parts.length > 0) {
    const signature = ownerDocument.createElement('pre');
    for (const part of parts) {
      const span = ownerDocument.createElement('span');
      span.className = `cm-signature-${part.kind}`;
      span.textContent = part.text;
      signature.append(span);
    }
    dom.prepend(signature);
  }
  return dom;
}
