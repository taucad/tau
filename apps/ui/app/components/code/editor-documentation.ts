import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import type { Completion } from '@codemirror/autocomplete';
import { highlightLines, loadLanguage, peekLanguage, resolveHighlightLanguageId } from '@taucad/grammars';

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

/**
 * How documentation code is highlighted: untagged fences use the source document's language,
 * and `fenceAliases` remaps tags a server uses loosely (KCL documentation fences KCL as `js`).
 */
export type DocumentationCodeOptions = Readonly<{
  languageId?: string;
  fenceAliases?: Readonly<Record<string, string>>;
}>;

/**
 * Paint `text` into `target` with the shared grammar registry and token classes. The source
 * language is already loaded by its editor, so it paints synchronously; any other language
 * paints plain first and repaints once its grammar loads. `emphasis` wraps one range, such as
 * the active parameter of a signature.
 */
export function paintHighlightedCode(
  target: HTMLElement,
  {
    text,
    languageId,
    emphasis,
  }: Readonly<{
    text: string;
    languageId: string | undefined;
    emphasis?: Readonly<{ from: number; to: number; className: string }>;
  }>,
): void {
  const language = resolveHighlightLanguageId(languageId);
  const paint = (support = language ? peekLanguage(language) : undefined): void => {
    const { ownerDocument } = target;
    const fragment = ownerDocument.createDocumentFragment();
    const segments = highlightLines(text, support).flatMap((line, index) =>
      index > 0 ? [{ text: '\n', className: '' }, ...line] : line,
    );
    let offset = 0;
    let group: HTMLElement | undefined;
    for (const segment of segments) {
      const start = offset;
      const end = start + segment.text.length;
      offset = end;
      const cuts = emphasis ? [emphasis.from, emphasis.to].filter((cut) => cut > start && cut < end) : [];
      let from = start;
      for (const to of [...cuts, end]) {
        const piece = segment.text.slice(from - start, to - start);
        if (!piece) {
          from = to;
          continue;
        }
        let node: Node = ownerDocument.createTextNode(piece);
        if (segment.className) {
          const span = ownerDocument.createElement('span');
          span.className = segment.className;
          span.textContent = piece;
          node = span;
        }
        if (emphasis && from >= emphasis.from && to <= emphasis.to) {
          if (!group) {
            group = ownerDocument.createElement('span');
            group.className = emphasis.className;
            fragment.append(group);
          }
          group.append(node);
        } else {
          fragment.append(node);
        }
        from = to;
      }
    }
    target.replaceChildren(fragment);
  };
  paint();
  if (language && !peekLanguage(language)) {
    const repaint = async (): Promise<void> => {
      try {
        const support = await loadLanguage(language);
        if (target.textContent === text) {
          paint(support);
        }
      } catch {
        // The plain paint stays: a grammar that fails to load leaves the code readable.
      }
    };
    // async-iife: bootstrap -- tooltip DOM is built synchronously; the repaint follows once the grammar loads.
    void repaint();
  }
}

function highlightDocumentationCode(dom: HTMLElement, options: DocumentationCodeOptions): void {
  for (const code of dom.querySelectorAll('pre > code')) {
    if (!(code instanceof HTMLElement)) {
      continue;
    }
    const fence = [...code.classList].find((name) => name.startsWith('language-'))?.slice('language-'.length);
    const languageId = fence === undefined ? options.languageId : (options.fenceAliases?.[fence] ?? fence);
    paintHighlightedCode(code, { text: code.textContent, languageId });
  }
}

/** How to render documentation: its code languages and where its definition links go. */
export type DocumentationRenderOptions = DocumentationCodeOptions &
  Readonly<{ onDefinitionLink?: DocumentationLinkHandler }>;

/** Render language-server documentation without admitting raw HTML or executable links. */
export function renderEditorDocumentation(
  markdown: string,
  ownerDocument = globalThis.document,
  { onDefinitionLink, ...codeOptions }: DocumentationRenderOptions = {},
): HTMLDivElement {
  const dom = ownerDocument.createElement('div');
  dom.className = 'cm-documentation';
  // Both raw HTML and unsafe URL schemes are removed before inserting the generated markup.
  dom.innerHTML = String(documentationProcessor.processSync(markdown));
  highlightDocumentationCode(dom, codeOptions);
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
export function editorCompletionInfo(
  markdown: string | undefined,
  codeOptions: DocumentationCodeOptions = {},
): Completion['info'] {
  return markdown ? () => renderEditorDocumentation(markdown, undefined, codeOptions) : undefined;
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
  const dom = renderEditorDocumentation(markdown, ownerDocument, { onDefinitionLink, languageId: 'typescript' });
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
