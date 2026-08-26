import ipaddr from 'ipaddr.js';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const maximumInputBytes = 20 * 1024 * 1024;
const maximumOutputBytes = 20 * 1024 * 1024;
const maximumNodes = 250_000;
const maximumDepth = 128;

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  children?: MarkdownNode[];
};

// oxlint-disable-next-line no-control-regex -- External extraction can emit forbidden ASCII controls.
const forbiddenControls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;
const moduleLikeLine = /^(?=(?:import|export)\s)/gmu;

export const normalizeExternalText = (text: string): string =>
  text
    .normalize('NFC')
    .replaceAll(/\r\n?/gu, '\n')
    .replaceAll(forbiddenControls, '')
    .replaceAll(/[\t ]+\n/gu, '\n')
    .replaceAll(/\n{3,}/gu, '\n\n')
    .trim();

export const isPublicUrl = (value: string): boolean => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username !== '' || url.password !== '') {
    return false;
  }

  const hostname = url.hostname.replaceAll(/^\[|\]$/gu, '').toLowerCase();
  if (
    hostname === '' ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return false;
  }

  if (!ipaddr.isValid(hostname)) {
    return true;
  }

  const address = ipaddr.process(hostname);
  return address.range() === 'unicast';
};

const sanitizeText = (value: string): string =>
  value
    .replaceAll(moduleLikeLine, '\\')
    .replaceAll(/(?<!\\)\{/gu, String.raw`\{`)
    .replaceAll(/(?<!\\)\}/gu, String.raw`\}`);

const sanitizeChildren = (children: MarkdownNode[], depth: number, state: { nodes: number }): MarkdownNode[] => {
  if (depth > maximumDepth) {
    throw new Error(`reference Markdown exceeds maximum nesting depth (${maximumDepth})`);
  }

  const sanitized: MarkdownNode[] = [];
  for (const node of children) {
    state.nodes += 1;
    if (state.nodes > maximumNodes) {
      throw new Error(`reference Markdown exceeds maximum node count (${maximumNodes})`);
    }

    if (node.type === 'html' || node.type === 'definition') {
      continue;
    }

    if (node.type === 'image' || node.type === 'imageReference') {
      if (node.alt) {
        sanitized.push({ type: 'text', value: sanitizeText(node.alt) });
      }
      continue;
    }

    if (node.type === 'linkReference') {
      sanitized.push(...sanitizeChildren(node.children ?? [], depth + 1, state));
      continue;
    }

    const next = { ...node };
    if (next.type === 'text' && next.value !== undefined) {
      next.value = sanitizeText(next.value);
    }
    if (next.type === 'link' && next.url !== undefined && !isPublicUrl(next.url)) {
      sanitized.push(...sanitizeChildren(next.children ?? [], depth + 1, state));
      continue;
    }
    if (next.children) {
      next.children = sanitizeChildren(next.children, depth + 1, state);
    }
    sanitized.push(next);
  }

  return sanitized;
};

export const sanitizeReferenceMarkdown = (input: string): string => {
  if (Buffer.byteLength(input) > maximumInputBytes) {
    throw new Error(`reference Markdown exceeds maximum input size (${maximumInputBytes} bytes)`);
  }

  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkStringify, {
    bullet: '-',
    fences: true,
    listItemIndent: 'one',
  });
  const tree = processor.parse(normalizeExternalText(input)) as MarkdownNode;
  tree.children = sanitizeChildren(tree.children ?? [], 1, { nodes: 1 });
  const output = processor.stringify(tree as unknown as Parameters<typeof processor.stringify>[0]).trim();

  if (Buffer.byteLength(output) > maximumOutputBytes) {
    throw new Error(`reference Markdown exceeds maximum output size (${maximumOutputBytes} bytes)`);
  }

  return output;
};
