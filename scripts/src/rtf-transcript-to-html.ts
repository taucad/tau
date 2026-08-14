#!/usr/bin/env node
//
// Convert a Codex rich-text transcript into a readable, single-file HTML reader.
//
// The script uses macOS textutil to preserve links and rich-text role cues, then
// maps those cues to a light Codex-style transcript. It downloads and embeds the
// official Tailwind browser build so every script lives in the generated HTML.
//
// Required env vars:
//   None.
// Optional env vars:
//   None.
//
// Usage:
//   node scripts/src/rtf-transcript-to-html.ts input.rtf [output.html] [--title "Title"]
//   node scripts/src/rtf-transcript-to-html.ts --self-test
//
// Exit codes:
//   0  Success
//   1  Invalid input or conversion failure
//   3  Missing macOS textutil

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import process from 'node:process';

type Role = 'assistant' | 'code' | 'reasoning' | 'system' | 'user';
type Kind = 'heading' | 'list' | 'paragraph';

type Block = {
  html: string;
  kind: Kind;
  role: Role;
};

type Group = {
  blocks: Block[];
  role: Role;
};

const extractStyles = (html: string): Map<string, string> => {
  const styles = new Map<string, string>();
  const css = /<style[^>]*>([\S\s]*?)<\/style>/i.exec(html)?.[1] ?? '';

  for (const match of css.matchAll(/(?:p|span|li)\.([a-z]\d+)\s*{([^}]+)}/gi)) {
    const [, className = '', declarations = ''] = match;
    styles.set(className, declarations.toLowerCase());
  }

  return styles;
};

const classNameOf = (attributes: string): string => /\bclass="([^"]+)"/i.exec(attributes)?.[1] ?? '';

const inlineClassesOf = (html: string): string[] =>
  [...html.matchAll(/<span class="([^"]+)"/gi)].flatMap((match) => match[1]?.split(/\s+/) ?? []);

const plainTextOf = (html: string): string =>
  html
    .replaceAll(/<br\s*\/?>/gi, '\n')
    .replaceAll(/<[^>]+>/g, '')
    .replaceAll(/&nbsp;/gi, ' ')
    .replaceAll('\u{A0}', ' ')
    .trim();

const classifyBlock = (
  className: string,
  innerHtml: string,
  styles: Map<string, string>,
): { kind: Kind; role: Role } => {
  const blockStyle = styles.get(className) ?? '';
  const inlineClasses = inlineClassesOf(innerHtml);
  const text = plainTextOf(innerHtml);
  const userInline = inlineClasses.some((inlineClass) => {
    const style = styles.get(inlineClass) ?? '';
    return style.includes('background-color: rgba(255, 255, 255, 0.078)') && !style.includes('font:');
  });

  if (blockStyle.includes('background-color: #1d1d1d') && /(mono|monospaced)/.test(blockStyle)) {
    return { kind: 'paragraph', role: 'code' };
  }

  if (blockStyle.includes('rgba(255, 255, 255, 0.48)')) {
    return { kind: 'paragraph', role: 'reasoning' };
  }

  if (
    blockStyle.includes('background-color: rgba(255, 255, 255, 0.078)') ||
    userInline ||
    (/text-align:\s*center/.test(blockStyle) && text.startsWith('/'))
  ) {
    return { kind: 'paragraph', role: 'user' };
  }

  if (
    blockStyle.includes('color: #30d33b') ||
    blockStyle.includes('color: #fb0b45') ||
    (/color:\s*#949388/.test(blockStyle) && !/font:\s*15(?:\.0)?px/.test(blockStyle))
  ) {
    return { kind: 'paragraph', role: 'system' };
  }

  if (
    /font:\s*15(?:\.0)?px/.test(blockStyle) ||
    (/font:\s*14(?:\.0)?px\s+'?\.sf ns'?/.test(blockStyle) && !blockStyle.includes('background-color'))
  ) {
    return { kind: 'heading', role: 'assistant' };
  }

  return { kind: 'paragraph', role: 'assistant' };
};

const safeHref = (href: string): string | undefined => {
  try {
    const url = new URL(href);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const escapeAttribute = (value: string): string =>
  value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const sanitizeInline = (source: string, styles: Map<string, string>): string => {
  let html = source
    .replaceAll(/<span class="apple-converted-space">([\S\s]*?)<\/span>/gi, '$1')
    .replaceAll(/<i>([\S\s]*?)<\/i>/gi, '<em>$1</em>')
    .replaceAll(/<b>([\S\s]*?)<\/b>/gi, '<strong>$1</strong>');

  let previous = '';
  while (previous !== html) {
    previous = html;
    html = html.replaceAll(
      /<span class="([^"]+)">([\S\s]*?)<\/span>/gi,
      (_match, classNames: string, content: string) => {
        const classes = classNames.split(/\s+/);
        const style = classes.map((className) => styles.get(className) ?? '').join(';');

        if (/(mono|monospaced)/.test(style) || classes.some((name) => ['s12', 's15', 's16', 's18'].includes(name))) {
          return `<code>${content}</code>`;
        }
        if (/color:\s*#(?:4583e1|5b94e7|1083ff)/.test(style)) {
          return `<span class="accent">${content}</span>`;
        }
        if (/color:\s*#30d33b/.test(style)) {
          return `<span class="success">${content}</span>`;
        }
        if (/color:\s*#fb0b45/.test(style)) {
          return `<span class="danger">${content}</span>`;
        }
        if (/font:\s*14(?:\.0)?px\s+'?\.sf ns'?/.test(style)) {
          return `<strong>${content}</strong>`;
        }
        return content;
      },
    );
  }

  html = html.replaceAll(/<a\s+href="([^"]*)"[^>]*>([\S\s]*?)<\/a>/gi, (_match, href: string, content: string) => {
    const safe = safeHref(href);
    return safe ? `<a href="${escapeAttribute(safe)}" target="_blank" rel="noreferrer">${content}</a>` : content;
  });

  return html
    .replaceAll(/<(?!\/?(?:a|br|code|em|strong|span)\b)[^>]+>/gi, '')
    .replaceAll(/<span(?! class="(?:accent|danger|success)")\b[^>]*>/gi, '')
    .trim();
};

const extractBlocks = (html: string, styles: Map<string, string>): Block[] => {
  const body = /<body[^>]*>([\S\s]*?)<\/body>/i.exec(html)?.[1];
  if (!body) {
    throw new Error('textutil output did not contain a body');
  }

  const blocks: Block[] = [];

  for (const match of body.matchAll(/<(p|ul|ol)\b([^>]*)>([\S\s]*?)<\/\1>/gi)) {
    const [, tag = 'p', attributes = '', innerHtml = ''] = match;
    const className =
      tag.toLowerCase() === 'p' ? classNameOf(attributes) : classNameOf(/<li\b([^>]*)>/i.exec(innerHtml)?.[1] ?? '');
    const classification = classifyBlock(className, innerHtml, styles);
    const isEmpty = plainTextOf(innerHtml).length === 0;

    if (isEmpty) {
      blocks.push({ ...classification, html: '' });
      continue;
    }

    if (tag.toLowerCase() === 'p') {
      blocks.push({ ...classification, html: sanitizeInline(innerHtml, styles) });
      continue;
    }

    const items = [...innerHtml.matchAll(/<li\b[^>]*>([\S\s]*?)<\/li>/gi)]
      .map((item) => `<li>${sanitizeInline(item[1] ?? '', styles)}</li>`)
      .join('');
    blocks.push({
      html: `<${tag.toLowerCase()}>${items}</${tag.toLowerCase()}>`,
      kind: 'list',
      role: classification.role,
    });
  }

  return blocks;
};

const groupBlocks = (blocks: Block[]): Group[] => {
  const groups: Group[] = [];
  let current: Group | undefined;

  const flush = (): void => {
    if (!current) {
      return;
    }
    while (current.blocks[0]?.html === '') {
      current.blocks.shift();
    }
    while (current.blocks.at(-1)?.html === '') {
      current.blocks.pop();
    }
    if (current.blocks.length > 0) {
      groups.push(current);
    }
    current = undefined;
  };

  for (const block of blocks) {
    if (!current || current.role !== block.role) {
      flush();
      current = { blocks: [block], role: block.role };
      continue;
    }
    current.blocks.push(block);
  }

  flush();
  return groups;
};

const renderBlock = (block: Block): string => {
  if (!block.html) {
    return '<div class="h-1" aria-hidden="true"></div>';
  }
  if (block.kind === 'heading') {
    return `<h2>${block.html}</h2>`;
  }
  if (block.kind === 'list') {
    return block.html;
  }
  return `<p>${block.html}</p>`;
};

const renderGroup = (group: Group, userMessageNumber?: number): string => {
  if (group.role === 'code') {
    const code = group.blocks.map((block) => block.html).join('\n');
    return `<section class="code-message"><pre><code>${code}</code></pre></section>`;
  }

  const content = group.blocks.map(renderBlock).join('\n');

  if (group.role === 'user') {
    const id = userMessageNumber ? ` id="user-message-${userMessageNumber}"` : '';
    return `<section${id} class="user-message"><div class="user-bubble">${content}</div></section>`;
  }
  if (group.role === 'reasoning') {
    return `<aside class="reasoning-message">${content}</aside>`;
  }
  if (group.role === 'system') {
    return `<aside class="system-message"><span aria-hidden="true"></span><div>${content}</div></aside>`;
  }
  return `<section class="assistant-message">${content}</section>`;
};

const deriveTitle = (inputPath: string): string =>
  basename(inputPath, extname(inputPath))
    .replace(/\s+copy(?:\s+\d+)?$/i, '')
    .replaceAll(/[_-]+/g, ' ')
    .replaceAll(/\bwebgpu\b/gi, 'WebGPU')
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const inlineScript = (source: string): string => source.replaceAll('</script', String.raw`<\/script`);

const renderPage = (options: {
  groups: Group[];
  inputPath: string;
  tailwindRuntime: string;
  title: string;
}): string => {
  let userMessageNumber = 0;
  const transcript = options.groups
    .map((group) => renderGroup(group, group.role === 'user' ? ++userMessageNumber : undefined))
    .join('\n');
  const userGroups = options.groups.filter((group) => group.role === 'user');
  const userToc = userGroups
    .map((group, index) => {
      const number = index + 1;
      const preview = escapeHtml(
        group.blocks
          .map((block) => plainTextOf(block.html))
          .filter(Boolean)
          .join(' ')
          .replaceAll(/\s+/g, ' '),
      );
      return `<li>
        <a class="user-toc-link" href="#user-message-${number}" aria-label="Go to user message ${number}" aria-describedby="user-toc-preview-${number}">
          <span class="user-toc-line" aria-hidden="true"></span>
          <span id="user-toc-preview-${number}" class="user-toc-card" role="tooltip">
            <span class="user-toc-kicker">User message ${number}</span>
            <span class="user-toc-preview">${preview}</span>
          </span>
        </a>
      </li>`;
    })
    .join('\n');
  const userMessages = userGroups.length;
  const title = escapeHtml(options.title);
  const sourceName = escapeHtml(basename(options.inputPath));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${title}</title>
  <script>
    try {
      const saved = localStorage.getItem('transcript-theme');
      document.documentElement.dataset.theme = saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    } catch {
      document.documentElement.dataset.theme = 'light';
    }
  </script>
  <script>${inlineScript(options.tailwindRuntime)}</script>
  <style type="text/tailwindcss">
    @theme {
      --font-sans: "Anthropic Sans", ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
      --font-mono: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
    }

    @layer base {
      html { @apply max-w-full scroll-smooth overflow-x-hidden; }
      body { @apply min-h-screen max-w-full overflow-x-hidden bg-[#fcfcfb] font-sans text-[16px] text-[#0b0b0b] antialiased selection:bg-blue-100; }
      button, a { @apply focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600; }
    }

    @layer components {
      .transcript { @apply min-w-0 max-w-full space-y-7; }
      .transcript > *, .transcript > * > * { @apply min-w-0 max-w-full; }
      .transcript p, .transcript li, .transcript a, .transcript code { overflow-wrap: anywhere; }
      .assistant-message { @apply space-y-3 text-[16px] leading-7; }
      .assistant-message h2 { @apply mt-8 text-[17px] font-semibold leading-6 tracking-[-0.012em]; }
      .assistant-message h2:first-child { @apply mt-0; }
      .assistant-message ul, .assistant-message ol,
      .user-bubble ul, .user-bubble ol { @apply my-3 space-y-2 pl-6; }
      .assistant-message ul, .user-bubble ul { @apply list-disc; }
      .assistant-message ol, .user-bubble ol { @apply list-decimal; }
      .assistant-message a, .user-bubble a, .reasoning-message a {
        @apply rounded-sm font-medium text-blue-600 underline decoration-blue-300 underline-offset-3 hover:text-blue-800;
      }
      .assistant-message a[href^="http"]::after,
      .user-bubble a[href^="http"]::after,
      .reasoning-message a[href^="http"]::after { content: " ↗"; @apply text-[0.72em] no-underline; }
      .assistant-message code, .user-bubble code, .reasoning-message code {
        @apply rounded-md bg-[#f2f2f1] px-1.5 py-0.5 font-mono text-[0.86em] text-[#0b0b0b];
      }
      .accent { @apply font-medium text-blue-600; }
      .success { @apply font-medium text-emerald-600; }
      .danger { @apply font-medium text-rose-600; }
      .user-message { @apply flex min-w-0 max-w-full scroll-mt-24 justify-end; }
      .user-bubble {
        @apply min-w-0 max-w-[min(88%,42rem)] space-y-3 rounded-2xl rounded-br-md bg-[#eeeeed] px-4.5 py-3.5 text-[15px] leading-6;
      }
      .user-toc { @apply fixed left-5 top-[20vh] z-30 hidden min-[1100px]:block; }
      .user-toc-list {
        @apply flex max-h-[60vh] flex-col items-start gap-2 overflow-y-auto py-3 pr-8;
        scrollbar-width: none;
      }
      .user-toc-list::-webkit-scrollbar { display: none; }
      .user-toc-link { @apply relative flex h-2 w-8 items-center rounded-sm; }
      .user-toc-line {
        @apply block h-px w-3 rounded-full bg-[#a5a5a4] transition-[width,background-color] duration-150;
      }
      .user-toc-link:hover .user-toc-line,
      .user-toc-link:focus-visible .user-toc-line,
      .user-toc-link.is-current .user-toc-line { @apply w-8 bg-[#0b0b0b]; }
      .user-toc-card {
        @apply pointer-events-none fixed left-16 top-1/2 w-80 -translate-y-1/2 rounded-2xl rounded-bl-md bg-[#eeeeed] p-4 text-[#0b0b0b] opacity-0 shadow-xl ring-1 ring-black/10 transition-opacity duration-150;
      }
      .user-toc-link:hover .user-toc-card,
      .user-toc-link:focus-visible .user-toc-card { @apply opacity-100; }
      .user-toc-kicker { @apply block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#757574]; }
      .user-toc-preview {
        @apply mt-2 block overflow-hidden whitespace-pre-line text-[13px] leading-5;
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 12;
      }
      .reasoning-message {
        @apply space-y-3 text-[15px] italic leading-6 text-[#757574];
      }
      .system-message { @apply flex items-start gap-2.5 text-[13px] leading-5 text-[#757574]; }
      .system-message > span { @apply mt-[0.48rem] size-1.5 shrink-0 rounded-full bg-[#757574]; }
      .system-message div { @apply space-y-1; }
      .code-message { @apply overflow-hidden rounded-xl bg-[#1f1f1f] shadow-sm ring-1 ring-black/10; }
      .code-message pre {
        @apply max-w-full whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-5 text-[#e1e0d9];
        overflow-wrap: anywhere;
      }
    }

    [data-theme="dark"] body { @apply bg-[#20201f] text-[#e1e0d9] selection:bg-blue-900; }
    [data-theme="dark"] header { @apply border-white/10 bg-[#20201f]/95; }
    [data-theme="dark"] .page-actions button { @apply text-[#8c8c88] hover:bg-[#313131] hover:text-[#e1e0d9]; }
    [data-theme="dark"] .archive-header { @apply border-[#313131]; }
    [data-theme="dark"] .archive-meta,
    [data-theme="dark"] footer { @apply text-[#8c8c88]; }
    [data-theme="dark"] .user-bubble { background-color: rgba(255, 255, 255, 0.078); }
    [data-theme="dark"] .user-toc-line { @apply bg-[#5b5b59]; }
    [data-theme="dark"] .user-toc-link:hover .user-toc-line,
    [data-theme="dark"] .user-toc-link:focus-visible .user-toc-line,
    [data-theme="dark"] .user-toc-link.is-current .user-toc-line { @apply bg-[#e1e0d9]; }
    [data-theme="dark"] .user-toc-card { @apply bg-[#313130] text-[#e1e0d9] ring-white/10; }
    [data-theme="dark"] .user-toc-kicker { @apply text-[#8c8c88]; }
    [data-theme="dark"] .reasoning-message,
    [data-theme="dark"] .system-message { @apply text-[#8c8c88]; }
    [data-theme="dark"] .system-message > span { @apply bg-[#8c8c88]; }
    [data-theme="dark"] .assistant-message code,
    [data-theme="dark"] .user-bubble code,
    [data-theme="dark"] .reasoning-message code { @apply bg-[#313131] text-[#e1e0d9]; }
    [data-theme="dark"] .accent,
    [data-theme="dark"] .assistant-message a,
    [data-theme="dark"] .user-bubble a,
    [data-theme="dark"] .reasoning-message a { @apply text-blue-400 decoration-blue-700 hover:text-blue-300; }
    [data-theme="dark"] .theme-moon { @apply hidden; }
    :root:not([data-theme="dark"]) .theme-sun { @apply hidden; }

    @media print {
      body { @apply bg-white text-black; }
      header, .page-actions, #reading-progress, .user-toc { @apply hidden; }
      .transcript { @apply space-y-5; }
      .user-bubble { @apply bg-stone-100 shadow-none ring-1 ring-stone-200; }
      .reasoning-message { @apply text-stone-600; }
      a { @apply text-black!; }
    }
  </style>
</head>
<body>
  <div id="reading-progress" class="fixed inset-x-0 top-0 z-50 h-0.5 origin-left scale-x-0 bg-blue-600"></div>
  <nav class="user-toc" aria-label="User message navigation">
    <ol class="user-toc-list">
${userToc}
    </ol>
  </nav>
  <header class="sticky top-0 z-40 border-b border-[#eaeae9] bg-[#fcfcfb]/95 backdrop-blur-xl">
    <div class="mx-auto flex h-16 max-w-[880px] items-center justify-between gap-4 px-5 sm:px-6">
      <div class="flex min-w-0 items-center gap-3">
        <div class="grid size-8 shrink-0 place-items-center rounded-lg bg-[#0b0b0b] text-white shadow-sm" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="size-4.5" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M5 7.5h14M5 12h10M5 16.5h7" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="min-w-0">
          <p class="truncate text-[14px] font-semibold tracking-[-0.01em]">${title}</p>
          <p class="text-[11px] text-[#757574]">${userMessages} user messages · ${options.groups.length} transcript sections</p>
        </div>
      </div>
      <div class="page-actions flex items-center gap-1.5">
        <button id="theme-toggle" type="button" class="grid size-9 place-items-center rounded-lg text-[#757574] hover:bg-[#f2f2f1] hover:text-[#0b0b0b]" aria-label="Toggle color theme">
          <svg class="theme-moon size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M20 15.7A8.5 8.5 0 0 1 8.3 4 8.5 8.5 0 1 0 20 15.7Z"/>
          </svg>
          <svg class="theme-sun size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>
          </svg>
        </button>
        <button id="print" type="button" class="grid size-9 place-items-center rounded-lg text-[#757574] hover:bg-[#f2f2f1] hover:text-[#0b0b0b]" aria-label="Print transcript">
          <svg class="size-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M7 9V3h10v6M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <path d="M7 14h10v7H7z"/>
          </svg>
        </button>
      </div>
    </div>
  </header>

  <main class="mx-auto w-full max-w-[880px] px-5 py-5 sm:px-6 sm:py-8">
    <div>
      <div class="mx-auto min-w-0 max-w-full py-10 sm:py-14">
        <div class="archive-header mb-12 border-b border-[#eaeae9] pb-8">
          <p class="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600">Conversation archive</p>
          <h1 class="text-balance text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">${title}</h1>
          <p class="archive-meta mt-4 text-[13px] leading-5 text-[#757574]">Converted from ${sourceName}. Links open in a new tab.</p>
        </div>
        <article id="transcript" class="transcript">
${transcript}
        </article>
      </div>
    </div>
    <footer class="px-2 py-7 text-center text-[11px] text-[#a5a5a4]">Generated from a Codex rich-text transcript.</footer>
  </main>

  <script>
    const root = document.documentElement;
    const themeToggle = document.querySelector('#theme-toggle');
    const progress = document.querySelector('#reading-progress');
    const tocLinks = [...document.querySelectorAll('.user-toc-link')];
    const userSections = [...document.querySelectorAll('.user-message[id]')];

    themeToggle.addEventListener('click', () => {
      root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('transcript-theme', root.dataset.theme); } catch {}
    });

    document.querySelector('#print').addEventListener('click', () => window.print());

    const updateReadingState = () => {
      const distance = document.documentElement.scrollHeight - innerHeight;
      progress.style.transform = \`scaleX(\${distance > 0 ? scrollY / distance : 0})\`;

      let activeIndex = 0;
      for (let index = 0; index < userSections.length; index += 1) {
        if (userSections[index].getBoundingClientRect().top > innerHeight * 0.35) break;
        activeIndex = index;
      }
      tocLinks.forEach((link, index) => {
        const isCurrent = index === activeIndex;
        link.classList.toggle('is-current', isCurrent);
        if (isCurrent) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };

    let scheduled = false;
    const scheduleReadingState = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        updateReadingState();
        scheduled = false;
      });
    };

    addEventListener('scroll', scheduleReadingState, { passive: true });
    addEventListener('resize', scheduleReadingState);
    updateReadingState();
  </script>
</body>
</html>
`;
};

const parseArgs = (args: string[]): { input: string; output: string; title?: string } => {
  const titleIndex = args.indexOf('--title');
  const title = titleIndex === -1 ? undefined : args[titleIndex + 1];
  const positional = args.filter((_argument, index) => index !== titleIndex && index !== titleIndex + 1);

  if (!positional[0] || (titleIndex !== -1 && !title)) {
    throw new Error('usage: rtf-transcript-to-html.ts input.rtf [output.html] [--title "Title"]');
  }

  const input = resolve(positional[0]);
  const output = resolve(positional[1] ?? input.replace(/\.rtf$/i, '.html'));
  return { input, output, title };
};

const runSelfTest = (): void => {
  const fixture = `<!doctype html><style>
    p.p1 { font: 14px Helvetica; color: #dad9d0 }
    p.p2 { font: 15px '.SF NS'; color: #949388 }
    p.p8 { font: 14px Helvetica; background-color: rgba(255, 255, 255, 0.078) }
    span.s5 { color: #5b94e7 }
  </style><body>
    <p class="p2"><span>Finding</span></p>
    <p class="p1">See <a href="https://example.com"><span class="s5">source</span></a>.</p>
    <p class="p8">User question</p>
  </body>`;
  const styles = extractStyles(fixture);
  const groups = groupBlocks(extractBlocks(fixture, styles));

  assert.deepEqual(
    groups.map((group) => group.role),
    ['assistant', 'user'],
  );
  const assistantGroup = groups[0];
  const userGroup = groups[1];
  assert.ok(assistantGroup);
  assert.ok(userGroup);
  assert.match(renderGroup(assistantGroup), /target="_blank"/);
  assert.match(renderGroup(userGroup, 1), /id="user-message-1"/);
  const page = renderPage({
    groups,
    inputPath: '/tmp/transcript.rtf',
    tailwindRuntime: '/* tailwindcss */',
    title: 'Transcript',
  });
  assert.match(page, /class="user-toc"/);
  assert.match(page, /User question/);
  assert.equal(safeHref(['java', 'script:alert(1)'].join('')), undefined);
  process.stdout.write('✓ rtf transcript converter self-test passed\n');
};

const fetchTailwindRuntime = async (): Promise<string> => {
  const response = await fetch('https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4');
  if (!response.ok) {
    throw new Error(`Tailwind download failed with HTTP ${response.status}`);
  }
  const source = await response.text();
  if (!source.includes('tailwindcss')) {
    throw new Error('Tailwind download returned unexpected content');
  }
  return source;
};

const main = async (): Promise<void> => {
  if (process.argv[2] === '--self-test') {
    runSelfTest();
    return;
  }

  const { input, output, title } = parseArgs(process.argv.slice(2));
  if (!existsSync(input)) {
    throw new Error(`input not found: ${input}`);
  }
  if (extname(input).toLowerCase() !== '.rtf') {
    throw new Error('input must be an .rtf file');
  }

  try {
    execFileSync('textutil', ['-help'], { stdio: 'ignore' });
  } catch {
    process.stderr.write('ERROR: macOS textutil is required\n');
    process.exit(3);
  }

  const converted = execFileSync('textutil', ['-convert', 'html', '-stdout', input], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const styles = extractStyles(converted);
  const groups = groupBlocks(extractBlocks(converted, styles));

  if (groups.length === 0) {
    throw new Error('no transcript content found');
  }

  const tailwindRuntime = await fetchTailwindRuntime();
  writeFileSync(
    output,
    renderPage({
      groups,
      inputPath: input,
      tailwindRuntime,
      title: title ?? deriveTitle(input),
    }),
    'utf8',
  );
  process.stdout.write(`✓ wrote ${output}\n`);
};

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
