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

const definitionLinkPrefix = '#tau-definition-';

/** Open a definition link; the index addresses the targets collected with the markdown. */
export type DocumentationLinkHandler = (index: number) => void;

/** Markdown link to the definition target at `index`; rendering turns it into a navigation link. */
export function definitionLinkMarkdown(label: string, index: number, code = false): string {
  return `[${code ? `\`${label}\`` : escapeMarkdown(label)}](${definitionLinkPrefix}${String(index)})`;
}

function escapeMarkdown(text: string): string {
  return text.replaceAll(/[\\`*_{}[\]()<>#+!|~-]/gu, String.raw`\$&`);
}

/** Render language-server documentation without admitting raw HTML or executable links. */
export function renderEditorDocumentation(
  markdown: string,
  ownerDocument = globalThis.document,
  onDefinitionLink?: DocumentationLinkHandler,
): HTMLDivElement {
  const dom = ownerDocument.createElement('div');
  dom.className = 'cm-documentation';
  // Both raw HTML and unsafe URL schemes are removed before inserting the generated markup.
  dom.innerHTML = String(documentationProcessor.processSync(markdown));
  for (const anchor of dom.querySelectorAll('a')) {
    const href = anchor.getAttribute('href') ?? '';
    if (href.startsWith(definitionLinkPrefix)) {
      const index = Number(href.slice(definitionLinkPrefix.length));
      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        onDefinitionLink?.(index);
      });
    } else if (/^https?:/u.test(href)) {
      // External documentation opens beside the editor instead of replacing the app.
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
  }
  return dom;
}

/** Defer completion documentation parsing until the suggestion is selected. */
export function editorCompletionInfo(markdown: string | undefined): Completion['info'] {
  return markdown ? () => renderEditorDocumentation(markdown) : undefined;
}

type DisplayPart<Target> = Readonly<{ text: string; kind: string; location?: Target }>;
type DocumentationTag<Target> = Readonly<{ name: string; text?: ReadonlyArray<DisplayPart<Target>> }>;

/** TypeScript documentation as markdown, with each resolved `{@link}` collected as a definition target. */
export type TypeScriptDocumentation<Target> = Readonly<{ markdown: string; targets: readonly Target[] }>;

/** Render TypeScript display parts with `{@link}` handling that follows VS Code's text rendering. */
export function typeScriptDocumentationMarkdown<Target>(
  documentation: ReadonlyArray<DisplayPart<Target>>,
  tags: ReadonlyArray<DocumentationTag<Target>> = [],
): TypeScriptDocumentation<Target> {
  const targets: Target[] = [];
  const render = (parts: ReadonlyArray<DisplayPart<Target>>): string => {
    let output = '';
    let link: { code: boolean; name?: string; text?: string; target?: Target } | undefined;
    for (const part of parts) {
      if (part.kind === 'link') {
        if (!link) {
          link = { code: part.text === '{@linkcode ' };
          continue;
        }
        const label = link.text ?? link.name ?? '';
        if (link.target !== undefined) {
          targets.push(link.target);
          output += definitionLinkMarkdown(label, targets.length - 1, link.code);
        } else if (/^https?:/u.test(label)) {
          const [url = '', ...words] = label.split(' ');
          output += words.length === 0 ? `<${url}>` : `[${escapeMarkdown(words.join(' '))}](${url})`;
        } else {
          output += escapeMarkdown(label);
        }
        link = undefined;
      } else if (link && part.kind === 'linkName') {
        link.name = part.text;
        link.target = part.location;
      } else if (link && part.kind === 'linkText') {
        link.text = part.text;
      } else {
        output += part.text;
      }
    }
    return output;
  };
  const description = render(documentation);
  const tagLines = tags.map((tag) => {
    const text = render(tag.text ?? []);
    if (tag.name === 'example') {
      return `*@example*\n\n\`\`\`\n${text}\n\`\`\``;
    }
    const parameter = tag.text?.find((part) => part.kind === 'parameterName')?.text;
    if (parameter !== undefined) {
      const rest = render((tag.text ?? []).filter((part) => part.kind !== 'parameterName')).trim();
      return `*@${tag.name}* \`${parameter}\`${rest ? ` — ${rest}` : ''}`;
    }
    return `*@${tag.name}*${text ? ` — ${text}` : ''}`;
  });
  return { markdown: [description, ...tagLines].filter(Boolean).join('\n\n'), targets };
}

/** Preserve signature token roles supplied by TypeScript without loading another parser. */
export function renderTypeScriptDocumentation(
  parts: ReadonlyArray<{ text: string; kind: string }>,
  markdown: string,
  {
    ownerDocument = globalThis.document,
    onDefinitionLink,
  }: Readonly<{ ownerDocument?: Document; onDefinitionLink?: DocumentationLinkHandler }> = {},
): HTMLDivElement {
  const dom = renderEditorDocumentation(markdown, ownerDocument, onDefinitionLink);
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
