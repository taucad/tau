import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage, OutgoingHttpHeaders } from 'node:http';
import { basename, dirname, join } from 'node:path';

import { chromium } from '@playwright/test';
import type {
  Browser,
  BrowserContext,
  Locator,
  Page,
  Request,
  Route,
  Worker as PlaywrightWorker,
} from '@playwright/test';
import { JSDOM } from 'jsdom';

import { validatePdfArtifact } from '#pdf-to-md.js';
import { convertWithReferencePandoc } from '#reference-pandoc.js';
import { PublicRequestError, requestPublicUrl } from '#reference-download.js';
import type { PublicRequestOptions } from '#reference-download.js';
import { isPublicUrl } from '#reference-markdown.js';
import type { HtmlCaptureOmissions, HtmlCaptureReport, ReferencePaths } from '#reference-to-md.js';

const maximumHtmlBytes = 20 * 1024 * 1024;
const maximumSemanticNodes = 250_000;
const maximumSemanticDepth = 128;
const maximumRequests = 500;
const maximumCapabilityAttempts = 500;
const maximumResponseBytes = 20 * 1024 * 1024;
const maximumAggregateBytes = 100 * 1024 * 1024;
const maximumInteractionStates = 100;
const maximumCanvasFrames = 100;
const maximumCanvasImageBytes = 20 * 1024 * 1024;
const maximumLazyScrollSteps = 100;
const navigationTimeoutMilliseconds = 30_000;
const captureTimeoutMilliseconds = 60_000;
const idleTimeoutMilliseconds = 10_000;
const interactionTimeoutMilliseconds = 2000;

const semanticTags = new Set([
  'a',
  'blockquote',
  'br',
  'code',
  'dd',
  'dl',
  'dt',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'section',
  'strong',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]);
const droppedTags = new Set([
  'audio',
  'button',
  'canvas',
  'embed',
  'fieldset',
  'footer',
  'form',
  'iframe',
  'input',
  'link',
  'nav',
  'noscript',
  'object',
  'script',
  'select',
  'source',
  'style',
  'svg',
  'template',
  'textarea',
  'video',
]);
const droppedRoles = new Set(['alertdialog', 'banner', 'contentinfo', 'dialog', 'navigation']);
const droppedClassToken = /^(?:copy(?:-button)?|line-?number|linenumber)$/iu;
const snapshotMetadataNames = [
  'tau-reference-capture-profile',
  'tau-reference-chromium-version',
  'tau-reference-final-url',
  'tau-reference-semantic-root',
  'tau-reference-completeness',
  'tau-reference-states-discovered',
  'tau-reference-states-visited',
  'tau-reference-states-empty',
  'tau-reference-states-failed',
  'tau-reference-states-skipped',
] as const;
const mediaOmissionMetadataName = 'tau-reference-media-requests-omitted';
const v3SnapshotMetadataNames = {
  requestAttempts: 'tau-reference-request-attempts',
  peripheralRequests: 'tau-reference-peripheral-requests-omitted',
  blockedCapabilities: 'tau-reference-capabilities-blocked',
  failedSubresources: 'tau-reference-subresources-failed',
  subframes: 'tau-reference-subframes-omitted',
  nonReadingRequests: 'tau-reference-non-reading-requests-omitted',
  failedImages: 'tau-reference-images-failed',
} as const;
const supportedSnapshotMetadataNames = [
  ...snapshotMetadataNames,
  mediaOmissionMetadataName,
  ...Object.values(v3SnapshotMetadataNames),
] as const;
const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

type RawDomNode =
  | { type: 'text'; value: string }
  | {
      type: 'element';
      tag: string;
      attributes: Record<string, string>;
      children: RawDomNode[];
    };

type SemanticNode =
  | { kind: 'text'; value: string }
  | {
      kind: 'element';
      tag: string;
      attributes?: Record<string, string>;
      children: SemanticNode[];
    };

type CapturedFragment = { label: string; raw: RawDomNode };

type RouteState = {
  requestAttempts: number;
  capabilityAttempts: number;
  omissions: HtmlCaptureOmissions;
  aggregateBytes: number;
  inFlight: number;
  fatal?: Error;
};

type ResourceFailureReason =
  | 'unsafe-address'
  | 'unsafe-redirect'
  | 'transport'
  | 'content-encoding'
  | 'content-length'
  | 'response-size';

type RouteFulfillmentOutcome = { kind: 'fulfilled' } | { kind: 'resource-failed'; reason: ResourceFailureReason };

type SnapshotDomResult = { kind: 'captured'; raw: RawDomNode } | { kind: 'capture-fatal'; message: string };

class CaptureWideError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'CaptureWideError';
  }
}

const ambientCapabilities = new Set([
  'Worker',
  'SharedWorker',
  'WebSocket',
  'WebTransport',
  'RTCPeerConnection',
  'webkitRTCPeerConnection',
  'EventSource',
  'sendBeacon',
  'ServiceWorker',
]);
const disruptiveCapabilities = new Set([
  'window.open',
  'showOpenFilePicker',
  'showSaveFilePicker',
  'showDirectoryPicker',
  'popup',
  'download',
  'dialog',
  'filechooser',
]);
const omissionNames = [
  'mediaRequests',
  'peripheralRequests',
  'blockedCapabilities',
  'failedSubresources',
  'subframes',
  'nonReadingRequests',
  'failedImages',
] satisfies ReadonlyArray<keyof HtmlCaptureOmissions>;

const throwIfFatal = (state: RouteState): void => {
  if (state.fatal) {
    throw state.fatal;
  }
};

export type HtmlCaptureDependencies = {
  request?(options: PublicRequestOptions): Promise<IncomingMessage>;
  launchBrowser?(): Promise<Browser>;
  now?(): number;
};

const escapeText = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const escapeAttribute = (value: string): string => escapeText(value).replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const normalizedText = (value: string, preformatted: boolean): string =>
  preformatted ? value.replaceAll(/\r\n?/gu, '\n') : value.replaceAll(/\s+/gu, ' ').replaceAll('\u00A0', ' ');

const rawText = (node: RawDomNode): string =>
  node.type === 'text' ? node.value : node.children.map((child) => rawText(child)).join(' ');

const elementChildren = (node: RawDomNode, tag: string): RawDomNode[] => {
  if (node.type === 'text') {
    return [];
  }
  const matches: RawDomNode[] = [];
  for (const child of node.children) {
    if (child.type === 'element' && child.tag === tag) {
      matches.push(child);
    } else {
      matches.push(...elementChildren(child, tag));
    }
  }
  return matches;
};

const semanticText = (nodes: readonly SemanticNode[]): string =>
  nodes
    .map((node) => (node.kind === 'text' ? node.value : semanticText(node.children)))
    .join(' ')
    .replaceAll(/\s+/gu, ' ')
    .trim();

const semanticSignature = (nodes: readonly SemanticNode[]): string =>
  createHash('sha256').update(JSON.stringify(nodes)).digest('hex');

const safeResolvedLink = (value: string | undefined, baseUrl: string): string | undefined => {
  if (!value) {
    return undefined;
  }
  try {
    const resolved = new URL(value, baseUrl);
    return isPublicUrl(resolved.href) ? resolved.href : undefined;
  } catch {
    return undefined;
  }
};

const lowerComplexTable = (node: Extract<RawDomNode, { type: 'element' }>, baseUrl: string): SemanticNode[] => {
  const rows = elementChildren(node, 'tr');
  const cells = rows.map((row) =>
    row.type === 'element'
      ? row.children.filter(
          (child): child is Extract<RawDomNode, { type: 'element' }> =>
            child.type === 'element' && (child.tag === 'th' || child.tag === 'td'),
        )
      : [],
  );
  const complex =
    cells.length === 0 ||
    cells.some((row) => row.some((cell) => cell.attributes['colspan'] !== undefined || cell.attributes['rowspan'])) ||
    new Set(cells.map((row) => row.length)).size > 1;
  if (!complex) {
    return [];
  }

  const headings = cells[0]?.map((cell) => rawText(cell).replaceAll(/\s+/gu, ' ').trim()) ?? [];
  const items: SemanticNode[] = [];
  for (const [index, row] of cells.entries()) {
    const parts = row
      .map((cell, column) => {
        const value = semanticText(semanticFromRaw(cell, baseUrl, false));
        const heading = headings[column];
        return heading && index > 0 ? `${heading}: ${value}` : value;
      })
      .filter((value) => value !== '');
    if (parts.length === 0) {
      continue;
    }
    items.push({
      kind: 'element',
      tag: 'li',
      children: [
        {
          kind: 'element',
          tag: 'strong',
          children: [{ kind: 'text', value: `Row ${index + 1}:` }],
        },
        { kind: 'text', value: ` ${parts.join('; ')}` },
      ],
    });
  }
  return items.length === 0 ? [] : [{ kind: 'element', tag: 'ul', children: items }];
};

// oxlint-disable-next-line eslint/complexity -- The closed semantic allowlist is intentionally centralized.
const semanticFromRaw = (node: RawDomNode, baseUrl: string, preformatted: boolean): SemanticNode[] => {
  if (node.type === 'text') {
    const value = normalizedText(node.value, preformatted);
    return value === '' ? [] : [{ kind: 'text', value }];
  }

  const tag = node.tag.toLowerCase();
  const role = node.attributes['role']?.toLowerCase();
  const classTokens = (node.attributes['class'] ?? '').split(/\s+/u);
  if (
    droppedTags.has(tag) ||
    (role !== undefined && droppedRoles.has(role)) ||
    classTokens.some((token) => droppedClassToken.test(token))
  ) {
    return [];
  }

  if (tag === 'table') {
    const lowered = lowerComplexTable(node, baseUrl);
    if (lowered.length > 0) {
      return lowered;
    }
  }

  const childPreformatted = preformatted || tag === 'pre' || tag === 'code';
  let children = node.children.flatMap((child) => semanticFromRaw(child, baseUrl, childPreformatted));
  if (tag === 'pre') {
    children = children.filter((child) => child.kind !== 'text' || child.value.trim() !== '');
  }
  if (tag === 'img') {
    const alt = node.attributes['alt']?.replaceAll(/\s+/gu, ' ').trim();
    return alt
      ? [
          { kind: 'element', tag: 'img', attributes: { alt }, children: [] },
          {
            kind: 'element',
            tag: 'em',
            children: [{ kind: 'text', value: `Image: ${alt}` }],
          },
        ]
      : [];
  }
  if (tag === 'a') {
    const href = safeResolvedLink(node.attributes['href'], baseUrl);
    return href && children.length > 0 ? [{ kind: 'element', tag: 'a', attributes: { href }, children }] : children;
  }

  const outputTag = tag === 'article' || tag === 'main' ? 'section' : semanticTags.has(tag) ? tag : undefined;
  if (!outputTag) {
    return children;
  }
  if (outputTag === 'code' && preformatted) {
    const language = classTokens.find((token) => /^language-[a-z0-9][a-z0-9_+-]*$/iu.test(token));
    return [
      {
        kind: 'element',
        tag: outputTag,
        attributes: { class: language ?? 'language-text' },
        children,
      },
    ];
  }
  if (children.length === 0 && outputTag !== 'br' && outputTag !== 'hr') {
    return [];
  }
  return [{ kind: 'element', tag: outputTag, children }];
};

const dedupeLargeSections = (nodes: readonly SemanticNode[]): SemanticNode[] => {
  const seen = new Set<string>();
  const dedupe = (candidates: readonly SemanticNode[]): SemanticNode[] => {
    const output: SemanticNode[] = [];
    for (const candidate of candidates) {
      const node = candidate.kind === 'element' ? { ...candidate, children: dedupe(candidate.children) } : candidate;
      if (node.kind === 'element' && node.tag === 'section' && semanticText(node.children).length >= 100) {
        const signature = semanticSignature(node.children);
        if (seen.has(signature)) {
          continue;
        }
        seen.add(signature);
      }
      output.push(node);
    }
    return output;
  };
  return dedupe(nodes);
};

const serializeSemanticNode = (node: SemanticNode): string => {
  if (node.kind === 'text') {
    return escapeText(node.value);
  }
  const attributes = Object.entries(node.attributes ?? {})
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join('');
  if (node.tag === 'br' || node.tag === 'hr' || node.tag === 'img') {
    return `<${node.tag}${attributes}>`;
  }
  return `<${node.tag}${attributes}>${node.children.map((child) => serializeSemanticNode(child)).join('')}</${node.tag}>`;
};

const validateReport = (report: HtmlCaptureReport): void => {
  if (!/^[a-z0-9][a-z0-9.-]*$/u.test(report.profile)) {
    throw new Error('HTML snapshot capture profile is invalid');
  }
  // oxlint-disable-next-line eslint/no-control-regex -- Snapshot metadata may not contain NUL or line breaks.
  if (report.chromiumVersion.trim() === '' || /[\r\n\u0000]/u.test(report.chromiumVersion)) {
    throw new Error('HTML snapshot Chromium version is invalid');
  }
  if (!isPublicUrl(report.finalUrl)) {
    throw new Error('HTML snapshot final URL must be public HTTP(S)');
  }
  if (!['main', 'article', 'body', 'legacy-markdown'].includes(report.semanticRoot)) {
    throw new Error('HTML snapshot semantic root is invalid');
  }
  if (!['standards-complete', 'partial', 'legacy-pdf-only'].includes(report.completeness)) {
    throw new Error('HTML snapshot completeness is invalid');
  }
  for (const [name, value] of Object.entries({
    discovered: report.discovered,
    visited: report.visited,
    empty: report.empty,
    failed: report.failed,
    skipped: report.skipped,
  })) {
    if (!Number.isSafeInteger(value) || value < 0 || value > maximumInteractionStates) {
      throw new Error(`HTML snapshot ${name} count is invalid`);
    }
  }
  if (report.visited + report.skipped > report.discovered || report.failed > report.visited) {
    throw new Error('HTML snapshot interaction counts are inconsistent');
  }
  if (report.profile === 'html-v2' && report.omittedMediaRequests === undefined) {
    throw new Error('HTML snapshot html-v2 requires a media omission count');
  }
  if (
    report.omittedMediaRequests !== undefined &&
    (!Number.isSafeInteger(report.omittedMediaRequests) ||
      report.omittedMediaRequests < 0 ||
      report.omittedMediaRequests > maximumRequests)
  ) {
    throw new Error('HTML snapshot media omission count is invalid');
  }
  if (report.profile === 'html-v3') {
    if (report.requestAttempts === undefined || report.omissions === undefined) {
      throw new Error('HTML snapshot html-v3 requires request and omission counts');
    }
    if (report.omittedMediaRequests !== undefined) {
      throw new Error('HTML snapshot html-v3 may not use the html-v2 media field');
    }
  } else if (report.requestAttempts !== undefined || report.omissions !== undefined) {
    throw new Error('HTML snapshot v3 counts require the html-v3 profile');
  }
  if (report.profile !== 'html-v2' && report.omittedMediaRequests !== undefined) {
    throw new Error('HTML snapshot media omission count requires the html-v2 profile');
  }
  if (
    report.requestAttempts !== undefined &&
    (!Number.isSafeInteger(report.requestAttempts) ||
      report.requestAttempts < 0 ||
      report.requestAttempts > maximumRequests)
  ) {
    throw new Error('HTML snapshot request attempt count is invalid');
  }
  if (report.omissions) {
    for (const name of omissionNames) {
      const value = report.omissions[name];
      const maximum =
        name === 'blockedCapabilities'
          ? maximumCapabilityAttempts
          : name === 'failedImages'
            ? maximumSemanticNodes
            : maximumRequests;
      if (!Number.isSafeInteger(value) || value < 0 || value > maximum) {
        throw new Error(`HTML snapshot ${name} count is invalid`);
      }
    }
    const requestOmissions =
      report.omissions.mediaRequests +
      report.omissions.peripheralRequests +
      report.omissions.failedSubresources +
      report.omissions.subframes +
      report.omissions.nonReadingRequests;
    if (report.requestAttempts === undefined || requestOmissions > report.requestAttempts) {
      throw new Error('HTML snapshot request omission counts are inconsistent');
    }
  }
  const evidenceLoss =
    report.failed !== 0 ||
    report.skipped !== 0 ||
    (report.omissions?.blockedCapabilities ?? 0) !== 0 ||
    (report.omissions?.failedSubresources ?? 0) !== 0 ||
    (report.omissions?.subframes ?? 0) !== 0 ||
    (report.omissions?.nonReadingRequests ?? 0) !== 0 ||
    (report.omissions?.failedImages ?? 0) !== 0;
  if (report.completeness === 'standards-complete' && (report.semanticRoot === 'body' || evidenceLoss)) {
    throw new Error('HTML snapshot cannot claim standards-complete with evidence loss');
  }
};

const metadataValues = (report: HtmlCaptureReport): Record<string, string> => ({
  'tau-reference-capture-profile': report.profile,
  'tau-reference-chromium-version': report.chromiumVersion,
  'tau-reference-final-url': report.finalUrl,
  'tau-reference-semantic-root': report.semanticRoot,
  'tau-reference-completeness': report.completeness,
  'tau-reference-states-discovered': String(report.discovered),
  'tau-reference-states-visited': String(report.visited),
  'tau-reference-states-empty': String(report.empty),
  'tau-reference-states-failed': String(report.failed),
  'tau-reference-states-skipped': String(report.skipped),
  ...(report.omittedMediaRequests === undefined
    ? {}
    : { [mediaOmissionMetadataName]: String(report.omittedMediaRequests) }),
  ...(report.requestAttempts === undefined || report.omissions === undefined
    ? {}
    : {
        [v3SnapshotMetadataNames.requestAttempts]: String(report.requestAttempts),
        [mediaOmissionMetadataName]: String(report.omissions.mediaRequests),
        [v3SnapshotMetadataNames.peripheralRequests]: String(report.omissions.peripheralRequests),
        [v3SnapshotMetadataNames.blockedCapabilities]: String(report.omissions.blockedCapabilities),
        [v3SnapshotMetadataNames.failedSubresources]: String(report.omissions.failedSubresources),
        [v3SnapshotMetadataNames.subframes]: String(report.omissions.subframes),
        [v3SnapshotMetadataNames.nonReadingRequests]: String(report.omissions.nonReadingRequests),
        [v3SnapshotMetadataNames.failedImages]: String(report.omissions.failedImages),
      }),
});

const captureCompleteness = (options: {
  semanticRoot: HtmlCaptureReport['semanticRoot'];
  failed: number;
  skipped: number;
  omissions: HtmlCaptureOmissions;
}): HtmlCaptureReport['completeness'] =>
  options.semanticRoot === 'body' ||
  options.failed !== 0 ||
  options.skipped !== 0 ||
  options.omissions.blockedCapabilities !== 0 ||
  options.omissions.failedSubresources !== 0 ||
  options.omissions.subframes !== 0 ||
  options.omissions.nonReadingRequests !== 0 ||
  options.omissions.failedImages !== 0
    ? 'partial'
    : 'standards-complete';

export const buildHtmlSnapshot = (options: { report: HtmlCaptureReport; nodes: readonly SemanticNode[] }): string => {
  validateReport(options.report);
  const nodes = dedupeLargeSections(options.nodes);
  if (semanticText(nodes) === '') {
    throw new Error('HTML snapshot did not contain usable semantic content');
  }
  const metadata = metadataValues(options.report);
  const head = [
    '<meta charset="utf-8">',
    ...Object.entries(metadata).map(([name, value]) => `<meta name="${name}" content="${escapeAttribute(value)}">`),
  ].join('');
  const body = nodes.map((node) => serializeSemanticNode(node)).join('');
  const snapshot = `<!doctype html><html><head>${head}</head><body><main>${body}</main></body></html>\n`;
  if (Buffer.byteLength(snapshot) > maximumHtmlBytes) {
    throw new Error(`HTML snapshot exceeds ${maximumHtmlBytes} bytes`);
  }
  return snapshot;
};

const rawFromDomNode = (node: Node, state: { nodes: number }, depth: number): RawDomNode | undefined => {
  state.nodes += 1;
  if (state.nodes > maximumSemanticNodes) {
    throw new Error(`HTML snapshot exceeds maximum node count (${maximumSemanticNodes})`);
  }
  if (depth > maximumSemanticDepth) {
    throw new Error(`HTML snapshot exceeds maximum nesting depth (${maximumSemanticDepth})`);
  }
  if (node.nodeType === node.TEXT_NODE) {
    return { type: 'text', value: node.nodeValue ?? '' };
  }
  if (node.nodeType !== node.ELEMENT_NODE) {
    return undefined;
  }
  const element = node as Element;
  const attributes = Object.fromEntries([...element.attributes].map((attribute) => [attribute.name, attribute.value]));
  const children: RawDomNode[] = [];
  for (const child of element.childNodes) {
    const captured = rawFromDomNode(child, state, depth + 1);
    if (captured) {
      children.push(captured);
    }
  }
  return { type: 'element', tag: element.tagName.toLowerCase(), attributes, children };
};

export const createHtmlSnapshotFromHtml = (options: {
  html: string;
  report: HtmlCaptureReport;
  baseUrl: string;
}): string => {
  if (Buffer.byteLength(options.html) > maximumHtmlBytes) {
    throw new Error(`HTML input exceeds ${maximumHtmlBytes} bytes`);
  }
  const dom = new JSDOM(options.html, { url: options.baseUrl });
  try {
    const raw = rawFromDomNode(dom.window.document.body, { nodes: 0 }, 1);
    if (!raw) {
      throw new Error('HTML input did not contain a document body');
    }
    const nodes = semanticFromRaw(raw, options.baseUrl, false);
    return buildHtmlSnapshot({ report: options.report, nodes });
  } finally {
    dom.window.close();
  }
};

export const createLegacyHtmlSnapshot = (options: { markdown: string; report: HtmlCaptureReport }): string => {
  if (options.report.completeness !== 'legacy-pdf-only') {
    throw new Error('legacy HTML snapshots require legacy-pdf-only completeness');
  }
  return buildHtmlSnapshot({
    report: options.report,
    nodes: [
      {
        kind: 'element',
        tag: 'pre',
        children: [
          {
            kind: 'element',
            tag: 'code',
            attributes: { class: 'language-markdown' },
            children: [{ kind: 'text', value: options.markdown }],
          },
        ],
      },
    ],
  });
};

const parseCount = (value: string | undefined, name: string): number => {
  if (!/^\d+$/u.test(value ?? '')) {
    throw new Error(`HTML snapshot ${name} metadata is invalid`);
  }
  return Number(value);
};

export const readHtmlSnapshot = (path: string): { html: string; report: HtmlCaptureReport } => {
  if (statSync(path).size > maximumHtmlBytes) {
    throw new Error(`HTML snapshot exceeds ${maximumHtmlBytes} bytes`);
  }
  const html = readFileSync(path, 'utf8');
  if (html.includes('\u0000')) {
    throw new Error('HTML snapshot contains NUL bytes');
  }
  const dom = new JSDOM(html);
  try {
    const { document } = dom.window;
    const metadata = new Map<string, string>();
    for (const meta of document.head.querySelectorAll('meta')) {
      if (meta.hasAttribute('charset')) {
        if (meta.getAttribute('charset')?.toLowerCase().replace('-', '') !== 'utf8' || meta.attributes.length !== 1) {
          throw new Error('HTML snapshot charset metadata is invalid');
        }
        continue;
      }
      const name = meta.getAttribute('name');
      const content = meta.getAttribute('content');
      if (
        !name ||
        content === null ||
        !supportedSnapshotMetadataNames.includes(name as (typeof supportedSnapshotMetadataNames)[number])
      ) {
        throw new Error('HTML snapshot contains unsupported metadata');
      }
      if (metadata.has(name)) {
        throw new Error(`HTML snapshot contains duplicate metadata (${name})`);
      }
      metadata.set(name, content);
    }
    for (const name of snapshotMetadataNames) {
      if (!metadata.has(name)) {
        throw new Error(`HTML snapshot is missing metadata (${name})`);
      }
    }
    const profile = metadata.get('tau-reference-capture-profile') ?? '';
    const v3OnlyMetadataNames = Object.values(v3SnapshotMetadataNames);
    if (profile === 'html-v3') {
      for (const name of [mediaOmissionMetadataName, ...v3OnlyMetadataNames]) {
        if (!metadata.has(name)) {
          throw new Error('HTML snapshot html-v3 requires request and omission counts');
        }
      }
    } else if (v3OnlyMetadataNames.some((name) => metadata.has(name))) {
      throw new Error('HTML snapshot v3 metadata requires the html-v3 profile');
    }

    let nodes = 0;
    const inspect = (element: Element, depth: number): void => {
      nodes += 1;
      if (nodes > maximumSemanticNodes) {
        throw new Error(`HTML snapshot exceeds maximum node count (${maximumSemanticNodes})`);
      }
      if (depth > maximumSemanticDepth) {
        throw new Error(`HTML snapshot exceeds maximum nesting depth (${maximumSemanticDepth})`);
      }
      const tag = element.tagName.toLowerCase();
      const structural = tag === 'html' || tag === 'head' || tag === 'body' || tag === 'main' || tag === 'meta';
      if (!structural && !semanticTags.has(tag)) {
        throw new Error(`HTML snapshot contains unsupported element (${tag})`);
      }
      for (const attribute of element.attributes) {
        const allowed =
          (tag === 'meta' && ['charset', 'name', 'content'].includes(attribute.name)) ||
          (tag === 'a' && attribute.name === 'href' && isPublicUrl(attribute.value)) ||
          (tag === 'img' && attribute.name === 'alt') ||
          (tag === 'code' && attribute.name === 'class' && /^language-[a-z0-9][a-z0-9_+-]*$/iu.test(attribute.value));
        if (!allowed) {
          throw new Error(`HTML snapshot contains unsupported attribute (${tag}.${attribute.name})`);
        }
      }
      for (const child of element.children) {
        inspect(child, depth + 1);
      }
    };
    inspect(document.documentElement, 1);
    const main = document.body.querySelector(':scope > main');
    if (!main || main.textContent.trim() === '') {
      throw new Error('HTML snapshot did not contain usable semantic content');
    }

    const report: HtmlCaptureReport = {
      profile,
      chromiumVersion: metadata.get('tau-reference-chromium-version') ?? '',
      finalUrl: metadata.get('tau-reference-final-url') ?? '',
      semanticRoot: (metadata.get('tau-reference-semantic-root') ?? '') as HtmlCaptureReport['semanticRoot'],
      completeness: (metadata.get('tau-reference-completeness') ?? '') as HtmlCaptureReport['completeness'],
      discovered: parseCount(metadata.get('tau-reference-states-discovered'), 'discovered'),
      visited: parseCount(metadata.get('tau-reference-states-visited'), 'visited'),
      empty: parseCount(metadata.get('tau-reference-states-empty'), 'empty'),
      failed: parseCount(metadata.get('tau-reference-states-failed'), 'failed'),
      skipped: parseCount(metadata.get('tau-reference-states-skipped'), 'skipped'),
      requestAttempts:
        profile === 'html-v3'
          ? parseCount(metadata.get(v3SnapshotMetadataNames.requestAttempts), 'request attempt count')
          : undefined,
      omittedMediaRequests:
        profile !== 'html-v3' && metadata.has(mediaOmissionMetadataName)
          ? parseCount(metadata.get(mediaOmissionMetadataName), 'media omission count')
          : undefined,
      omissions:
        profile === 'html-v3'
          ? {
              mediaRequests: parseCount(metadata.get(mediaOmissionMetadataName), 'mediaRequests'),
              peripheralRequests: parseCount(
                metadata.get(v3SnapshotMetadataNames.peripheralRequests),
                'peripheralRequests',
              ),
              blockedCapabilities: parseCount(
                metadata.get(v3SnapshotMetadataNames.blockedCapabilities),
                'blockedCapabilities',
              ),
              failedSubresources: parseCount(
                metadata.get(v3SnapshotMetadataNames.failedSubresources),
                'failedSubresources',
              ),
              subframes: parseCount(metadata.get(v3SnapshotMetadataNames.subframes), 'subframes'),
              nonReadingRequests: parseCount(
                metadata.get(v3SnapshotMetadataNames.nonReadingRequests),
                'nonReadingRequests',
              ),
              failedImages: parseCount(metadata.get(v3SnapshotMetadataNames.failedImages), 'failedImages'),
            }
          : undefined,
    };
    validateReport(report);
    return { html, report };
  } finally {
    dom.window.close();
  }
};

export const validateHtmlSnapshot = async (path: string): Promise<void> => {
  readHtmlSnapshot(path);
};

export const convertHtmlSnapshot = async (
  path: string,
): Promise<{ markdown: string; detail: string; capture: HtmlCaptureReport }> => {
  const { html, report } = readHtmlSnapshot(path);
  if (report.completeness === 'legacy-pdf-only') {
    const dom = new JSDOM(html);
    try {
      const sources = dom.window.document.querySelectorAll('body > main > pre > code.language-markdown');
      if (sources.length !== 1) {
        throw new Error('legacy HTML snapshot must contain exactly one Markdown source');
      }
      return {
        markdown: sources[0]?.textContent ?? '',
        detail: 'inert legacy HTML snapshot',
        capture: report,
      };
    } finally {
      dom.window.close();
    }
  }
  const dom = new JSDOM(html);
  try {
    dom.window.document.querySelector('body > main h1')?.remove();
    const { markdown } = await convertWithReferencePandoc({
      profile: 'html-to-gfm',
      input: dom.serialize(),
    });
    return {
      markdown: markdown.replaceAll(/ {2}\n/gu, '\u005C\n'),
      detail: 'sandboxed Pandoc rendered HTML conversion',
      capture: report,
    };
  } finally {
    dom.window.close();
  }
};

const snapshotDom = (root: Element, options?: { excludeInteractionStates?: boolean }): SnapshotDomResult => {
  try {
    const source = options?.excludeInteractionStates ? (root.cloneNode(true) as Element) : root;
    if (options?.excludeInteractionStates) {
      const controls = [
        ...source.querySelectorAll('[aria-expanded][aria-controls]:not([role="tab"]), [role="tab"][aria-controls]'),
      ];
      const panelIds = new Set(controls.map((control) => control.getAttribute('aria-controls')).filter(Boolean));
      for (const element of source.querySelectorAll('details')) {
        element.remove();
      }
      for (const element of controls) {
        element.remove();
      }
      for (const element of source.querySelectorAll('[id]')) {
        if (panelIds.has(element.id)) {
          element.remove();
        }
      }
    }
    let nodes = 0;
    let characters = 0;
    const walk = (node: Node, depth: number): RawDomNode | undefined => {
      nodes += 1;
      if (nodes > 250_000) {
        throw new Error('rendered DOM exceeds maximum node count');
      }
      if (depth > 128) {
        throw new Error('rendered DOM exceeds maximum nesting depth');
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const value = node.nodeValue ?? '';
        characters += value.length;
        if (characters > 20 * 1024 * 1024) {
          throw new Error('rendered DOM exceeds maximum text size');
        }
        return { type: 'text', value };
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return undefined;
      }
      const element = node as Element;
      const attributes = Object.fromEntries(
        ['href', 'alt', 'role', 'class', 'colspan', 'rowspan']
          .filter((name) => element.hasAttribute(name))
          .map((name) => [name, element.getAttribute(name) ?? '']),
      );
      const children: RawDomNode[] = [];
      for (const child of element.childNodes) {
        const captured = walk(child, depth + 1);
        if (captured) {
          children.push(captured);
        }
      }
      return { type: 'element', tag: element.tagName.toLowerCase(), attributes, children };
    };
    const captured = walk(source, 1);
    if (!captured) {
      throw new Error('rendered DOM root is not an element');
    }
    return { kind: 'captured', raw: captured };
  } catch (error) {
    return { kind: 'capture-fatal', message: error instanceof Error ? error.message : String(error) };
  }
};

const remaining = (deadline: number, now: () => number, label: string): number => {
  const milliseconds = deadline - now();
  if (milliseconds <= 0) {
    throw new Error(`${label} exceeded the 60 second capture deadline`);
  }
  return milliseconds;
};

const withDeadline = async <T>(
  promise: Promise<T>,
  options: { deadline: number; now: () => number; label: string },
): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadlineTimeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => {
        reject(new Error(`${options.label} exceeded the 60 second capture deadline`));
      },
      remaining(options.deadline, options.now, options.label),
    );
  });
  try {
    return await Promise.race([promise, deadlineTimeout]);
  } finally {
    clearTimeout(timer);
  }
};

const delay = async (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/* oxlint-disable eslint/no-await-in-loop -- Settlement and recognized interaction states are intentionally sequential. */
const settlePage = async (options: {
  page: Page;
  routeState: RouteState;
  deadline: number;
  now: () => number;
  lazyScroll: boolean;
}): Promise<void> => {
  const failedImages = await withDeadline(
    options.page.evaluate(
      async ({ lazyScroll, maximumSteps }) => {
        await document.fonts.ready;
        const visibleImages = [...document.images].filter((image) => {
          const style = getComputedStyle(image);
          return image.currentSrc !== '' && style.display !== 'none' && style.visibility !== 'hidden';
        });
        const imageResults = await Promise.all(
          visibleImages.map(async (image) => {
            try {
              await image.decode();
              return 0;
            } catch {
              image.removeAttribute('src');
              image.removeAttribute('srcset');
              image.style.setProperty('display', 'none', 'important');
              return 1;
            }
          }),
        );
        const failedImages = imageResults.reduce<number>((total, value) => total + value, 0);
        for (const animation of document.getAnimations()) {
          const endTime = Number(animation.effect?.getComputedTiming().endTime);
          try {
            if (Number.isFinite(endTime)) {
              animation.finish();
            } else {
              animation.pause();
            }
          } catch {
            animation.pause();
          }
        }
        if (!lazyScroll) {
          return failedImages;
        }
        let previousHeight = 0;
        let stableBottomSamples = 0;
        for (let step = 0; step < maximumSteps; step += 1) {
          const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
          const next = Math.min(height, (step + 1) * window.innerHeight);
          window.scrollTo(0, next);
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
          const atBottom = window.scrollY + window.innerHeight >= height;
          stableBottomSamples = atBottom && height === previousHeight ? stableBottomSamples + 1 : 0;
          previousHeight = height;
          if (stableBottomSamples >= 2) {
            window.scrollTo(0, 0);
            return failedImages;
          }
        }
        window.scrollTo(0, 0);
        throw new Error('lazy content did not settle within 100 viewport steps');
      },
      { lazyScroll: options.lazyScroll, maximumSteps: maximumLazyScrollSteps },
    ),
    { deadline: options.deadline, now: options.now, label: 'page settlement' },
  );
  options.routeState.omissions.failedImages += failedImages;

  let previousDimensions = '';
  let stableSamples = 0;
  while (stableSamples < 2) {
    if (options.routeState.fatal) {
      throw options.routeState.fatal;
    }
    remaining(options.deadline, options.now, 'page settlement');
    const dimensions = await options.page.evaluate(
      () =>
        `${Math.max(document.body.scrollWidth, document.documentElement.scrollWidth)}x${Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)}`,
    );
    if (options.routeState.inFlight === 0 && dimensions === previousDimensions) {
      stableSamples += 1;
    } else {
      stableSamples = 0;
    }
    previousDimensions = dimensions;
    await delay(250);
  }
};

const selectedRoot = async (page: Page): Promise<{ locator: Locator; name: 'main' | 'article' | 'body' }> => {
  for (const name of ['article', 'main'] as const) {
    const candidates = page.locator(name);
    for (let index = 0; index < (await candidates.count()); index += 1) {
      const candidate = candidates.nth(index);
      if (
        await candidate.evaluate(
          (element) =>
            element.textContent.trim().length > 0 ||
            element.querySelector('figure, img[alt], table, pre, code, ul, ol, dl') !== null,
        )
      ) {
        return { locator: candidate, name };
      }
    }
  }
  return { locator: page.locator('body'), name: 'body' };
};

const captureLocator = async (locator: Locator): Promise<RawDomNode> => {
  const result = await locator.evaluate(snapshotDom, {});
  if (result.kind === 'capture-fatal') {
    throw new CaptureWideError(result.message);
  }
  return result.raw;
};

const captureBaseline = async (locator: Locator): Promise<RawDomNode> => {
  const result = await locator.evaluate(snapshotDom, { excludeInteractionStates: true });
  if (result.kind === 'capture-fatal') {
    throw new CaptureWideError(result.message);
  }
  return result.raw;
};

const cleanLabel = (value: string, fallback: string): string => {
  const label = value.replaceAll(/\s+/gu, ' ').trim();
  return label === '' ? fallback : label.slice(0, 500);
};

const cssAttributeValue = (value: string): string =>
  value.replaceAll('\\', String.raw`\\`).replaceAll('"', String.raw`\"`);

const tryInteractionClick = async (options: {
  locator: Locator;
  routeState: RouteState;
  deadline: number;
  now: () => number;
  label: string;
}): Promise<boolean> => {
  try {
    await options.locator.click({
      timeout: Math.min(interactionTimeoutMilliseconds, remaining(options.deadline, options.now, options.label)),
    });
    return true;
  } catch {
    throwIfFatal(options.routeState);
    remaining(options.deadline, options.now, options.label);
    return false;
  }
};

const tryInteractionCapture = async (options: {
  locator: Locator;
  routeState: RouteState;
  deadline: number;
  now: () => number;
  label: string;
}): Promise<RawDomNode | undefined> => {
  try {
    return await captureLocator(options.locator);
  } catch (error) {
    if (error instanceof CaptureWideError) {
      throw error;
    }
    throwIfFatal(options.routeState);
    remaining(options.deadline, options.now, options.label);
    return undefined;
  }
};

const collectInteractionStates = async (options: {
  root: Locator;
  page: Page;
  routeState: RouteState;
  deadline: number;
  now: () => number;
}): Promise<{
  fragments: CapturedFragment[];
  discovered: number;
  visited: number;
  empty: number;
  failed: number;
  skipped: number;
}> => {
  const details = options.root.locator('details');
  const accordions = options.root.locator('[aria-expanded][aria-controls]:not([role="tab"])');
  const tabs = options.root.locator('[role="tab"][aria-controls]');
  const malformed = await options.root
    .locator('[aria-expanded]:not([aria-controls]), [role="tab"]:not([aria-controls])')
    .count();
  const detailCount = await details.count();
  const accordionCount = await accordions.count();
  const tabCount = await tabs.count();
  const discovered = detailCount + accordionCount + tabCount + malformed;
  if (discovered > maximumInteractionStates) {
    throw new Error(`recognized interaction states exceed ${maximumInteractionStates}`);
  }

  const fragments: CapturedFragment[] = [];
  let visited = 0;
  let empty = 0;
  let failed = 0;
  let skipped = malformed;
  const detailOpen = await details.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLDetailsElement).open),
  );
  for (let index = 0; index < detailCount; index += 1) {
    const detail = details.nth(index);
    const summary = detail.locator(':scope > summary').first();
    if ((await summary.count()) !== 1) {
      skipped += 1;
      continue;
    }
    const label = cleanLabel((await summary.textContent()) ?? '', `Details ${index + 1}`);
    visited += 1;
    if (!(await detail.evaluate((element) => (element as HTMLDetailsElement).open))) {
      if (!(await tryInteractionClick({ ...options, locator: summary, label: `native details "${label}"` }))) {
        failed += 1;
        continue;
      }
      await settlePage({ ...options, lazyScroll: false });
    }
    const raw = await tryInteractionCapture({ ...options, locator: detail, label: `native details "${label}"` });
    if (!raw) {
      failed += 1;
      continue;
    }
    if (raw.type === 'element') {
      raw.children = raw.children.filter((child) => child.type !== 'element' || child.tag !== 'summary');
    }
    if (rawText(raw).trim() === '') {
      empty += 1;
    } else {
      fragments.push({ label, raw });
    }
  }
  try {
    await details.evaluateAll((elements, values) => {
      for (const [index, element] of elements.entries()) {
        (element as HTMLDetailsElement).open = values[index] ?? false;
      }
    }, detailOpen);
  } catch {
    throwIfFatal(options.routeState);
    remaining(options.deadline, options.now, 'native details restoration');
    if (visited > failed) {
      failed += 1;
    }
  }

  for (let index = 0; index < accordionCount; index += 1) {
    const control = accordions.nth(index);
    const label = cleanLabel((await control.textContent()) ?? '', `Accordion ${index + 1}`);
    const panelId = await control.getAttribute('aria-controls');
    if (!panelId) {
      skipped += 1;
      continue;
    }
    const panel = options.root.locator(`[id="${cssAttributeValue(panelId)}"]`);
    if ((await panel.count()) !== 1) {
      skipped += 1;
      continue;
    }
    const initiallyExpanded = (await control.getAttribute('aria-expanded')) === 'true';
    visited += 1;
    let stateFailed = false;
    if (!initiallyExpanded) {
      if (!(await tryInteractionClick({ ...options, locator: control, label: `accordion "${label}"` }))) {
        failed += 1;
        continue;
      }
      await settlePage({ ...options, lazyScroll: false });
    }
    const raw = await tryInteractionCapture({ ...options, locator: panel, label: `accordion "${label}"` });
    if (raw) {
      if (rawText(raw).trim() === '') {
        empty += 1;
      } else {
        fragments.push({ label, raw });
      }
    } else {
      stateFailed = true;
    }
    try {
      const expanded = (await control.getAttribute('aria-expanded')) === 'true';
      if (expanded !== initiallyExpanded) {
        if (await tryInteractionClick({ ...options, locator: control, label: `accordion "${label}" restoration` })) {
          await settlePage({ ...options, lazyScroll: false });
        } else {
          stateFailed = true;
        }
      }
    } catch {
      throwIfFatal(options.routeState);
      remaining(options.deadline, options.now, `accordion "${label}" restoration`);
      stateFailed = true;
    }
    if (stateFailed) {
      failed += 1;
    }
  }

  const initiallySelected = await tabs.evaluateAll((elements) =>
    elements.findIndex((element) => element.getAttribute('aria-selected') === 'true'),
  );
  for (let index = 0; index < tabCount; index += 1) {
    const tab = tabs.nth(index);
    const label = cleanLabel((await tab.textContent()) ?? '', `Tab ${index + 1}`);
    const panelId = await tab.getAttribute('aria-controls');
    if (!panelId) {
      skipped += 1;
      continue;
    }
    const panel = options.root.locator(`[id="${cssAttributeValue(panelId)}"]`);
    if ((await panel.count()) !== 1) {
      skipped += 1;
      continue;
    }
    visited += 1;
    if ((await tab.getAttribute('aria-selected')) !== 'true') {
      if (!(await tryInteractionClick({ ...options, locator: tab, label: `tab "${label}"` }))) {
        failed += 1;
        continue;
      }
      await settlePage({ ...options, lazyScroll: false });
    }
    const raw = await tryInteractionCapture({ ...options, locator: panel, label: `tab "${label}"` });
    if (!raw) {
      failed += 1;
      continue;
    }
    if (rawText(raw).trim() === '') {
      empty += 1;
    } else {
      fragments.push({ label, raw });
    }
  }
  if (initiallySelected >= 0 && initiallySelected < tabCount) {
    if (
      await tryInteractionClick({
        ...options,
        locator: tabs.nth(initiallySelected),
        label: 'tab restoration',
      })
    ) {
      await settlePage({ ...options, lazyScroll: false });
    } else if (visited > failed) {
      failed += 1;
    }
  }

  return { fragments, discovered, visited, empty, failed, skipped };
};
/* oxlint-enable eslint/no-await-in-loop -- Sequential settlement and state collection end here. */

/* oxlint-disable eslint/no-await-in-loop -- Canvas pixels must be captured and replaced sequentially. */
const freezeVisibleCanvases = async (page: Page): Promise<void> => {
  const canvases = page.locator('canvas');
  const count = await canvases.count();
  if (count > maximumCanvasFrames) {
    throw new Error(`visible canvas count exceeds ${maximumCanvasFrames}`);
  }
  let aggregateBytes = 0;
  for (let index = 0; index < count; index += 1) {
    const canvas = canvases.nth(index);
    if (!(await canvas.isVisible())) {
      continue;
    }
    const png = await canvas.screenshot({ animations: 'disabled', type: 'png' });
    aggregateBytes += png.byteLength;
    if (aggregateBytes > maximumCanvasImageBytes) {
      throw new Error(`rendered canvas images exceed ${maximumCanvasImageBytes} bytes`);
    }
    await canvas.evaluate(
      async (element, source) => {
        const computed = getComputedStyle(element);
        const image = document.createElement('img');
        for (const property of computed) {
          image.style.setProperty(
            property,
            computed.getPropertyValue(property),
            computed.getPropertyPriority(property),
          );
        }
        for (const attribute of element.attributes) {
          if (attribute.name !== 'width' && attribute.name !== 'height') {
            image.setAttribute(attribute.name, attribute.value);
          }
        }
        image.alt = 'Rendered canvas';
        image.src = source;
        await image.decode();
        element.replaceWith(image);
      },
      `data:image/png;base64,${png.toString('base64')}`,
    );
  }
};
/* oxlint-enable eslint/no-await-in-loop -- Canvas freeze ends here. */

const sanitizedRequestHeaders = (request: Request): OutgoingHttpHeaders => {
  const headers: OutgoingHttpHeaders = {};
  for (const [name, value] of Object.entries(request.headers())) {
    const lower = name.toLowerCase();
    if (
      hopByHopHeaders.has(lower) ||
      ['authorization', 'cookie', 'host', 'proxy-authorization', 'content-length', 'accept-encoding'].includes(lower)
    ) {
      continue;
    }
    headers[lower] = value;
  }
  headers['accept-encoding'] = 'identity';
  headers['accept-language'] = 'en-US,en;q=0.9';
  return headers;
};

const responseHeaders = (response: IncomingMessage): Record<string, string> => {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(response.headers)) {
    const lower = name.toLowerCase();
    if (value === undefined || lower === 'set-cookie' || hopByHopHeaders.has(lower) || lower === 'content-encoding') {
      continue;
    }
    headers[lower] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
};

const redirectDepth = (request: Request): number => {
  let depth = 0;
  let current = request.redirectedFrom();
  while (current) {
    depth += 1;
    current = current.redirectedFrom();
  }
  return depth;
};

const printableUrl = (url: URL): string => `${url.origin}${url.pathname}`;

const fulfillSafely = async (options: {
  route: Route;
  state: RouteState;
  deadline: number;
  now: () => number;
  request: (options: PublicRequestOptions) => Promise<IncomingMessage>;
}): Promise<RouteFulfillmentOutcome> => {
  const request = options.route.request();
  const method = request.method();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`browser request method is forbidden (${method})`);
  }
  const url = new URL(request.url());
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username !== '' || url.password !== '') {
    return { kind: 'resource-failed', reason: 'unsafe-address' };
  }
  const depth = redirectDepth(request);
  if (depth > 3) {
    return { kind: 'resource-failed', reason: 'unsafe-redirect' };
  }
  const redirectedFrom = request.redirectedFrom();
  if (redirectedFrom) {
    const prior = new URL(redirectedFrom.url());
    if (prior.protocol === 'https:' && url.protocol !== 'https:') {
      return { kind: 'resource-failed', reason: 'unsafe-redirect' };
    }
  }
  options.state.inFlight += 1;
  try {
    let response: IncomingMessage;
    try {
      response = await options.request({
        url,
        method,
        headers: sanitizedRequestHeaders(request),
        deadline: Math.min(options.deadline, options.now() + navigationTimeoutMilliseconds),
        idleTimeoutMilliseconds,
      });
    } catch (error) {
      if (error instanceof PublicRequestError) {
        return { kind: 'resource-failed', reason: error.reason };
      }
      throw error;
    }
    const encoding = response.headers['content-encoding'];
    const normalizedEncoding = typeof encoding === 'string' ? encoding : encoding?.[0];
    if (normalizedEncoding && normalizedEncoding.toLowerCase() !== 'identity') {
      response.destroy();
      return { kind: 'resource-failed', reason: 'content-encoding' };
    }
    const declaredText = response.headers['content-length'];
    const declared = Array.isArray(declaredText) ? Number(declaredText[0]) : Number(declaredText);
    if (
      declaredText !== undefined &&
      (!Number.isSafeInteger(declared) || declared < 0 || declared > maximumResponseBytes)
    ) {
      response.destroy();
      return { kind: 'resource-failed', reason: 'content-length' };
    }
    const chunks: Array<Uint8Array<ArrayBuffer>> = [];
    let bytes = 0;
    try {
      for await (const value of response) {
        const chunk = Uint8Array.from(value as Uint8Array<ArrayBuffer>);
        bytes += chunk.length;
        options.state.aggregateBytes += chunk.length;
        if (options.state.aggregateBytes > maximumAggregateBytes) {
          response.destroy();
          throw new CaptureWideError(`browser aggregate response bytes exceed ${maximumAggregateBytes}`);
        }
        if (bytes > maximumResponseBytes) {
          response.destroy();
          return { kind: 'resource-failed', reason: 'response-size' };
        }
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof CaptureWideError) {
        throw error;
      }
      return { kind: 'resource-failed', reason: 'transport' };
    }
    if (declaredText !== undefined && bytes !== declared) {
      return { kind: 'resource-failed', reason: 'content-length' };
    }
    const status = response.statusCode ?? 0;
    if (status < 100 || status > 599) {
      return { kind: 'resource-failed', reason: 'transport' };
    }
    const headers = responseHeaders(response);
    if (status >= 300 && status < 400) {
      const { location } = headers;
      if (!location) {
        return { kind: 'resource-failed', reason: 'unsafe-redirect' };
      }
      let redirected: URL;
      try {
        redirected = new URL(location, url);
      } catch {
        return { kind: 'resource-failed', reason: 'unsafe-redirect' };
      }
      if (
        (redirected.protocol !== 'https:' && redirected.protocol !== 'http:') ||
        redirected.username !== '' ||
        redirected.password !== '' ||
        (url.protocol === 'https:' && redirected.protocol !== 'https:')
      ) {
        return { kind: 'resource-failed', reason: 'unsafe-redirect' };
      }
    }
    try {
      await options.route.fulfill({
        status,
        headers,
        body: method === 'HEAD' ? undefined : Buffer.concat(chunks),
      });
    } catch {
      return { kind: 'resource-failed', reason: 'transport' };
    }
    return { kind: 'fulfilled' };
  } finally {
    options.state.inFlight -= 1;
  }
};

const installCapabilityBlocks = async (
  context: BrowserContext,
  recordCapability: (capability: string) => void,
): Promise<void> => {
  const bindingName = `__tauReferenceDenied_${randomUUID().replaceAll('-', '')}`;
  await context.exposeBinding(bindingName, (_source, capability: unknown) => {
    recordCapability(String(capability));
  });
  await context.addInitScript(
    ({ bindingName }) => {
      const host = globalThis as typeof globalThis & Record<string, unknown>;
      const exposed = host[bindingName];
      if (typeof exposed !== 'function') {
        throw new TypeError('reference capability reporter is unavailable');
      }
      Reflect.deleteProperty(host, bindingName);
      const report = exposed as (capability: string) => Promise<void>;
      const securityError = (name: string): DOMException =>
        new DOMException(`browser capability is forbidden (${name})`, 'SecurityError');
      const deny = (name: string): never => {
        void report(name);
        throw securityError(name);
      };
      for (const name of [
        'Worker',
        'SharedWorker',
        'WebSocket',
        'WebTransport',
        'RTCPeerConnection',
        'webkitRTCPeerConnection',
        'EventSource',
      ]) {
        if (name in host) {
          Object.defineProperty(host, name, {
            configurable: false,
            value: function blockedCapability() {
              deny(name);
            },
          });
        }
      }
      if ('sendBeacon' in navigator) {
        const blockedSendBeacon = (): false => {
          void report('sendBeacon');
          return false;
        };
        Object.defineProperty(navigator, 'sendBeacon', {
          configurable: false,
          get: () => blockedSendBeacon,
          set: () => undefined,
        });
      }
      if ('serviceWorker' in navigator) {
        Object.defineProperty(navigator.serviceWorker, 'register', {
          configurable: false,
          value: async () => {
            void report('ServiceWorker');
            throw securityError('ServiceWorker');
          },
        });
      }
      for (const name of ['showOpenFilePicker', 'showSaveFilePicker', 'showDirectoryPicker']) {
        if (name in host) {
          Object.defineProperty(host, name, {
            configurable: false,
            value: () => {
              deny(name);
            },
          });
        }
      }
      Object.defineProperty(host, 'open', {
        configurable: false,
        value: () => {
          deny('window.open');
        },
      });
    },
    { bindingName },
  );
};

const closeWorker = async (worker: PlaywrightWorker): Promise<void> => {
  try {
    await worker.evaluate(() => {
      globalThis.close();
    });
  } catch {
    // The worker may already have stopped after its routed script was denied.
  }
};

const temporaryPath = (destination: string): string =>
  join(dirname(destination), `.${basename(destination)}.tmp-${randomUUID()}`);

const commitPair = (options: {
  pdfTemporary: string;
  snapshotTemporary: string;
  paths: Extract<ReferencePaths, { format: 'html' }>;
}): void => {
  const destinations = [
    { temporary: options.pdfTemporary, destination: options.paths.artifact },
    { temporary: options.snapshotTemporary, destination: options.paths.snapshot },
  ];
  const backups: Array<{ backup: string; destination: string }> = [];
  const installed: string[] = [];
  try {
    for (const { destination } of destinations) {
      if (!existsSync(destination)) {
        continue;
      }
      const backup = temporaryPath(destination);
      renameSync(destination, backup);
      backups.push({ backup, destination });
    }
    for (const { temporary, destination } of destinations) {
      renameSync(temporary, destination);
      chmodSync(destination, 0o644);
      installed.push(destination);
    }
  } catch (error) {
    for (const destination of installed) {
      if (existsSync(destination)) {
        unlinkSync(destination);
      }
    }
    for (const { backup, destination } of backups.reverse()) {
      if (existsSync(backup)) {
        renameSync(backup, destination);
      }
    }
    throw error;
  } finally {
    for (const { temporary } of destinations) {
      if (existsSync(temporary)) {
        unlinkSync(temporary);
      }
    }
  }
  for (const { backup } of backups) {
    if (existsSync(backup)) {
      rmSync(backup, { force: true });
    }
  }
};

export const captureHtmlReference = async (options: {
  id: string;
  url: string;
  paths: ReferencePaths;
  dependencies?: HtmlCaptureDependencies;
}): Promise<void> => {
  if (options.paths.format !== 'html') {
    throw new Error(`${options.id}: HTML capture requires HTML reference paths`);
  }
  const sourceUrl = new URL(options.url);
  if (
    sourceUrl.protocol !== 'https:' ||
    sourceUrl.username !== '' ||
    sourceUrl.password !== '' ||
    (sourceUrl.port !== '' && sourceUrl.port !== '443')
  ) {
    throw new Error(`${options.id}: HTML capture requires credential-free HTTPS on port 443`);
  }
  const now = options.dependencies?.now ?? Date.now;
  const deadline = now() + captureTimeoutMilliseconds;
  const request =
    options.dependencies?.request ?? (async (requestOptions: PublicRequestOptions) => requestPublicUrl(requestOptions));
  const launchBrowser = options.dependencies?.launchBrowser ?? (async () => chromium.launch({ headless: true }));
  mkdirSync(dirname(options.paths.artifact), { recursive: true });
  mkdirSync(dirname(options.paths.snapshot), { recursive: true });
  const pdfTemporary = temporaryPath(options.paths.artifact);
  const snapshotTemporary = temporaryPath(options.paths.snapshot);
  const routeState: RouteState = {
    requestAttempts: 0,
    capabilityAttempts: 0,
    aggregateBytes: 0,
    inFlight: 0,
    omissions: {
      mediaRequests: 0,
      peripheralRequests: 0,
      blockedCapabilities: 0,
      failedSubresources: 0,
      subframes: 0,
      nonReadingRequests: 0,
      failedImages: 0,
    },
  };
  let browser: Browser | undefined;

  try {
    browser = await launchBrowser();
    const context = await browser.newContext({
      acceptDownloads: false,
      colorScheme: 'light',
      deviceScaleFactor: 1,
      javaScriptEnabled: true,
      locale: 'en-US',
      permissions: [],
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      timezoneId: 'UTC',
      viewport: { width: 1280, height: 720 },
    });
    const setFatal = (error: Error): void => {
      routeState.fatal ??= error;
    };
    const recordCapability = (capability: string): void => {
      routeState.capabilityAttempts += 1;
      if (routeState.capabilityAttempts > maximumCapabilityAttempts) {
        setFatal(new Error(`browser capability attempt count exceeds ${maximumCapabilityAttempts}`));
        return;
      }
      if (ambientCapabilities.has(capability)) {
        routeState.omissions.blockedCapabilities += 1;
        return;
      }
      if (disruptiveCapabilities.has(capability)) {
        setFatal(new Error(`browser capability is forbidden (${capability})`));
        return;
      }
      setFatal(new Error('browser reported an unknown blocked capability'));
    };
    await installCapabilityBlocks(context, recordCapability);
    await context.routeWebSocket('**/*', (webSocket) => {
      recordCapability('WebSocket');
      void webSocket.close();
    });
    await context.route('**/*', async (route) => {
      const routeRequest = route.request();
      routeState.requestAttempts += 1;
      if (routeState.requestAttempts > maximumRequests) {
        setFatal(new Error(`browser request count exceeds ${maximumRequests}`));
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      if (routeRequest.isNavigationRequest() && routeRequest.frame().parentFrame()) {
        routeState.omissions.subframes += 1;
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      const method = routeRequest.method();
      if (method !== 'GET' && method !== 'HEAD') {
        routeState.omissions.nonReadingRequests += 1;
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      const resourceType = routeRequest.resourceType();
      if (resourceType === 'media') {
        routeState.omissions.mediaRequests += 1;
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      if (resourceType === 'texttrack' || resourceType === 'manifest') {
        routeState.omissions.peripheralRequests += 1;
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      if (resourceType === 'eventsource') {
        recordCapability('EventSource');
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      let fetchDestination: string | undefined;
      try {
        const allHeaders = await routeRequest.allHeaders();
        fetchDestination = allHeaders['sec-fetch-dest']?.toLowerCase();
      } catch (error) {
        setFatal(error instanceof Error ? error : new Error(String(error)));
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      if (
        resourceType === 'worker' ||
        resourceType === 'sharedworker' ||
        fetchDestination === 'worker' ||
        fetchDestination === 'sharedworker' ||
        fetchDestination === 'serviceworker'
      ) {
        recordCapability(
          resourceType === 'sharedworker' || fetchDestination === 'sharedworker' ? 'SharedWorker' : 'Worker',
        );
        await route.abort('blockedbyclient').catch(() => undefined);
        return;
      }
      try {
        const outcome = await fulfillSafely({ route, state: routeState, deadline, now, request });
        if (outcome.kind === 'resource-failed') {
          if (routeRequest.isNavigationRequest() && !routeRequest.frame().parentFrame()) {
            setFatal(new Error(`browser main document resource failed (${outcome.reason})`));
          } else {
            routeState.omissions.failedSubresources += 1;
          }
          await route.abort('blockedbyclient').catch(() => undefined);
        }
      } catch (error) {
        setFatal(error instanceof Error ? error : new Error(String(error)));
        await route.abort('blockedbyclient').catch(() => undefined);
      }
    });
    const page = await context.newPage();
    const workerClosures = new Set<Promise<void>>();
    context.on('page', (candidate) => {
      if (candidate !== page) {
        recordCapability('popup');
        void candidate.close();
      }
    });
    page.on('download', (download) => {
      recordCapability('download');
      void download.cancel();
    });
    page.on('dialog', (dialog) => {
      recordCapability('dialog');
      void dialog.dismiss();
    });
    page.on('filechooser', () => {
      recordCapability('filechooser');
    });
    page.on('worker', (worker) => {
      recordCapability('Worker');
      workerClosures.add(closeWorker(worker));
    });

    try {
      await withDeadline(
        page.goto(sourceUrl.href, {
          waitUntil: 'domcontentloaded',
          timeout: navigationTimeoutMilliseconds,
        }),
        { deadline, now, label: 'HTML navigation' },
      );
    } catch (error) {
      throw routeState.fatal ?? error;
    }
    throwIfFatal(routeState);
    await settlePage({ page, routeState, deadline, now, lazyScroll: true });
    const root = await selectedRoot(page);
    const finalUrl = new URL(page.url());
    if (!isPublicUrl(finalUrl.href) || finalUrl.username !== '' || finalUrl.password !== '') {
      throw new Error('HTML capture finished on a non-public or credential-bearing URL');
    }
    const baselineRaw = await captureBaseline(root.locator);
    const interaction = await collectInteractionStates({
      root: root.locator,
      page,
      routeState,
      deadline,
      now,
    });
    await settlePage({ page, routeState, deadline, now, lazyScroll: false });
    await Promise.all(workerClosures);
    throwIfFatal(routeState);
    const settledFinalUrl = new URL(page.url());
    if (
      !isPublicUrl(settledFinalUrl.href) ||
      settledFinalUrl.username !== '' ||
      settledFinalUrl.password !== '' ||
      settledFinalUrl.origin !== finalUrl.origin ||
      settledFinalUrl.pathname !== finalUrl.pathname ||
      settledFinalUrl.search !== finalUrl.search
    ) {
      throw new Error('recognized interaction changed the trusted top-level URL');
    }

    const baselineNodes = semanticFromRaw(baselineRaw, finalUrl.href, false);
    const known = new Set<string>();
    const addSignatures = (nodes: readonly SemanticNode[]): void => {
      known.add(semanticSignature(nodes));
      for (const node of nodes) {
        if (node.kind === 'element') {
          addSignatures(node.children);
        }
      }
    };
    addSignatures(baselineNodes);
    const additional: SemanticNode[] = [];
    for (const fragment of interaction.fragments) {
      const nodes = semanticFromRaw(fragment.raw, finalUrl.href, false);
      const signature = semanticSignature(nodes);
      if (nodes.length === 0 || known.has(signature)) {
        continue;
      }
      known.add(signature);
      additional.push({
        kind: 'element',
        tag: 'section',
        children: [{ kind: 'element', tag: 'h2', children: [{ kind: 'text', value: fragment.label }] }, ...nodes],
      });
    }
    const completeness = captureCompleteness({
      semanticRoot: root.name,
      failed: interaction.failed,
      skipped: interaction.skipped,
      omissions: routeState.omissions,
    });
    const report: HtmlCaptureReport = {
      profile: 'html-v3',
      chromiumVersion: browser.version(),
      finalUrl: finalUrl.href,
      semanticRoot: root.name,
      completeness,
      discovered: interaction.discovered,
      visited: interaction.visited,
      empty: interaction.empty,
      failed: interaction.failed,
      skipped: interaction.skipped,
      requestAttempts: routeState.requestAttempts,
      omissions: { ...routeState.omissions },
    };
    const snapshot = buildHtmlSnapshot({ report, nodes: [...baselineNodes, ...additional] });
    writeFileSync(snapshotTemporary, snapshot, { encoding: 'utf8', mode: 0o600, flag: 'wx' });

    await page.emulateMedia({ media: 'screen', colorScheme: 'light', reducedMotion: 'reduce' });
    await page.addStyleTag({
      content:
        '*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}html{color-scheme:light!important}audio,video{display:none!important}img,svg,canvas{max-height:85vh!important;object-fit:contain!important;break-inside:avoid-page!important}',
    });
    await page.locator('body *').evaluateAll((elements) => {
      for (const element of elements) {
        const { position } = getComputedStyle(element);
        if (position === 'fixed' || position === 'sticky') {
          (element as HTMLElement).style.setProperty('position', 'static', 'important');
        }
      }
    });
    await freezeVisibleCanvases(page);
    await withDeadline(
      page.pdf({
        path: pdfTemporary,
        displayHeaderFooter: false,
        outline: true,
        preferCSSPageSize: true, // eslint-disable-line @typescript-eslint/naming-convention -- Playwright API field.
        printBackground: true,
        scale: 1,
        tagged: true,
      }),
      { deadline, now, label: 'PDF capture' },
    );
    await context.close();
    await browser.close();
    browser = undefined;

    await validatePdfArtifact(pdfTemporary);
    readHtmlSnapshot(snapshotTemporary);
    commitPair({ pdfTemporary, snapshotTemporary, paths: options.paths });
    console.log(
      `${options.id}: captured HTML pair from ${printableUrl(finalUrl)} (${routeState.requestAttempts} requests, ${routeState.aggregateBytes} bytes, ${routeState.omissions.mediaRequests} media requests omitted)`,
    );
  } finally {
    await browser?.close().catch(() => undefined);
    for (const path of [pdfTemporary, snapshotTemporary]) {
      if (existsSync(path)) {
        rmSync(path, { force: true });
      }
    }
  }
};

export const validateHtmlArtifacts = async (paths: ReferencePaths): Promise<void> => {
  if (paths.format !== 'html') {
    throw new Error('HTML validation requires HTML reference paths');
  }
  await validatePdfArtifact(paths.artifact);
  await validateHtmlSnapshot(paths.snapshot);
};
