/**
 * Shared renderer for API design guides (`create-api` skill). A guide is data plus compiled
 * sketch files; this module only lays them out. Import it as `@tau/api-guide` from a guide's
 * `main.tsx` under `docs/research/artifacts/<subject>/api/`.
 */
import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDot,
  CirclePause,
  CircleQuestionMark,
  Lightbulb,
  ThumbsUp,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { codeToHtml, createHighlighter } from 'shiki';
import type { LanguageInput } from 'shiki';
import { unified } from 'unified';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
// The chapter delivery type below is `Progress`, so the bar takes another name here.
import { Progress as ProgressBar } from '@taucad/ui/components/progress';
import { RadioGroup, RadioGroupItem } from '@taucad/ui/components/radio-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@taucad/ui/components/table';
import { Textarea } from '@taucad/ui/components/textarea';

/**
 * One sketch file: its path under the guide and its source, imported with `?raw`. TypeScript sketches
 * and `csharp` sketches are compiled and `kcl` sketches parsed and run by the checker; a `python`, `openscad`
 * or `json` sketch is shown as a source excerpt.
 */
export type Sketch = Readonly<{
  file: string;
  source: string;
  language?: 'typescript' | 'tsx' | 'csharp' | 'python' | 'kcl' | 'openscad' | 'json';
}>;

/** Output of `check-design.mjs`, imported from `design/evidence.json`. */
export type Evidence = Readonly<{
  typescript: string;
  /** The .NET SDK that compiled the C# sketches, when there are any. */
  dotnet?: string;
  /** The kcl-wasm-lib version that parsed and ran the KCL sketches, when there are any. */
  kcl?: string;
  project: string;
  files: Readonly<
    Record<
      string,
      Readonly<{
        diagnostics: ReadonlyArray<Readonly<{ line: number; code: number; message: string }>>;
        queries: ReadonlyArray<Readonly<{ line: number; token?: string; type: string }>>;
      }>
    >
  >;
}>;

export type Verdict = 'pass' | 'concern' | 'fail' | 'n/a';
export type Audience = 'author' | 'host' | 'agent' | 'kernel' | 'framework';
/** How far a reference chapter is from shipping: what exists, what this guide proposes, what is only mapped. */
export type Horizon = 'shipped' | 'proposed' | 'later' | 'placeholder';
/** Where a reference chapter stands in delivery, marked in the table of contents: landed, built next, or waiting. */
export type Progress = 'complete' | 'next' | 'pending';
/**
 * Where an open question stands, marked in the table of contents and on its card: awaiting a ruling, ruled as
 * recommended, ruled another way, or set aside for later. A question is open until a decision settles it.
 */
export type QuestionStatus = 'open' | 'accepted' | 'amended' | 'deferred';

export type CallSite = Readonly<{ audience: Audience; title: string; sketch: Sketch; notes?: readonly string[] }>;

/**
 * One capability of a living reference guide, shown under the recommended option. A chapter that has
 * its own design guide links to it instead of repeating its options.
 */
export type Chapter = Readonly<{
  id: string;
  title: string;
  horizon: Horizon;
  progress: Progress;
  summary: string;
  /** The child guide that owns this chapter's options and rulings, when one exists. */
  guide?: Readonly<{ title: string; href: string }>;
  contract?: readonly string[];
  sketches: readonly CallSite[];
  /** Ids of the open questions this chapter waits on. */
  questions?: readonly string[];
}>;

export type GuideOption = Readonly<{
  id: string;
  name: string;
  standing: 'recommended' | 'alternative' | 'rejected';
  summary: string;
  /** Exported names this option adds, changes or removes. The sprawl count is read from here. */
  surfaceDelta: Readonly<{ added: readonly string[]; changed: readonly string[]; removed: readonly string[] }>;
  surface?: Sketch;
  callSites: ReadonlyArray<Readonly<{ audience: Audience; title: string; sketch: Sketch; notes?: readonly string[] }>>;
  misuse?: Sketch;
  gains: readonly string[];
  costs: readonly string[];
  /** Keyed by rubric check id from the skill's review-rubric.md. */
  scorecard: Readonly<Record<string, Readonly<{ verdict: Verdict; note: string }>>>;
}>;

export type ApiGuide = Readonly<{
  title: string;
  status: 'draft' | 'in-review' | 'approved';
  revision: number;
  owner: string;
  oneLine: string;
  problem: Readonly<{
    summary: string;
    today: ReadonlyArray<Readonly<{ label: string; code: string }>>;
    pains: readonly string[];
  }>;
  contract: readonly string[];
  options: readonly GuideOption[];
  /** Reference chapters, one per capability, rendered after the options when present. */
  chapters?: readonly Chapter[];
  shared: readonly CallSite[];
  failures: ReadonlyArray<Readonly<{ code: string; when: string; message: string; recovery: string }>>;
  /** Every string in a question is Markdown (GFM), as are the guide's other prose strings. */
  questions: ReadonlyArray<
    Readonly<{
      id: string;
      /** The decision, in one sentence. */
      question: string;
      /** What a reviewer needs to decide without reading the rest of the guide: the background and what hangs on it. */
      context?: string;
      /** Flag the recommended choice with `recommended`; a label containing "(recommended)" also counts. */
      options: ReadonlyArray<Readonly<{ label: string; consequence: string; recommended?: boolean }>>;
      /** Why the recommended choice wins; with none flagged, what the call turns on. */
      recommendation: string;
    }>
  >;
  blastRadius: ReadonlyArray<Readonly<{ path: string; change: string }>>;
  decisions: ReadonlyArray<
    Readonly<{
      date: string;
      ruling: string;
      /** The open questions this ruling settles, by id, and how. A later decision overrides an earlier one. */
      settles?: Readonly<Record<string, Exclude<QuestionStatus, 'open'>>>;
    }>
  >;
  evidence: Evidence;
  /** Grammars for sketch languages Shiki does not bundle, such as KCL (`tauCustomShikiLanguages`). */
  languages?: readonly LanguageInput[];
}>;

type Question = ApiGuide['questions'][number];
type Choice = Question['options'][number];

const recommendedMark = /\s*\(recommended\)/i;

/** The flagged choice, else one labelled "(recommended)". A question may recommend nothing. */
const recommendedOf = (question: Question): Choice | undefined =>
  question.options.find((choice) => choice.recommended) ??
  question.options.find((choice) => recommendedMark.test(choice.label));

/** A label as shown and recorded: the badge, not the label, says which choice is recommended. */
const labelOf = (choice: Choice): string => choice.label.replace(recommendedMark, '');

const isRecommended = (question: Question, label: string | undefined): boolean => {
  const recommended = recommendedOf(question);
  return recommended !== undefined && labelOf(recommended) === label;
};

/** A reviewer's decision: the chosen label, or none when the question is deferred, and an optional note. */
type Decision = Readonly<{ choice: string | undefined; note: string | undefined }>;

/**
 * A decision is a review comment the agent reads: `Decision <id>: <label>`, marked `(recommended)` when it is,
 * or `Decision <id>: deferred`, then an optional `Note: …` line.
 */
const decisionPattern = /^Decision ([\w.-]+): ([^\n]*)(?:\nNote: (.*))?$/s;

const decisionBody = (question: Question, { choice, note }: Decision): string => {
  const ruling =
    choice === undefined ? 'deferred' : `${choice}${isRecommended(question, choice) ? ' (recommended)' : ''}`;
  return `Decision ${question.id}: ${ruling}${note === undefined ? '' : `\nNote: ${note}`}`;
};

const parseDecision = (body: string): readonly [string, Decision] | undefined => {
  const [, id, line = '', note] = decisionPattern.exec(body) ?? [];
  if (id === undefined) {
    return undefined;
  }
  const choice = line.replace(recommendedMark, '').trim();
  return [id, { choice: choice === 'deferred' ? undefined : choice, note: note?.trim() }];
};

/** A recorded decision's status. Choosing where nothing is recommended counts as accepted. */
const statusOf = (question: Question, { choice }: Decision): Exclude<QuestionStatus, 'open'> => {
  if (choice === undefined) {
    return 'deferred';
  }
  return recommendedOf(question) === undefined || isRecommended(question, choice) ? 'accepted' : 'amended';
};

/**
 * Records a decision as an immutable review comment on the question's status mark, through the review layer
 * the canvas runner injects (scripts/canvas/review-layer.ts). Resolves to why it failed, or undefined once written.
 */
const recordDecision = async (question: Question, decision: Decision): Promise<string | undefined> => {
  const mark = document.querySelector(`[data-review-id="${CSS.escape(`decision-${question.id}`)}"]`);
  if (!mark || !document.querySelector('tau-review-layer')) {
    return 'Recording needs the canvas dev server; this page is read-only.';
  }
  return new Promise((resolve) => {
    mark.dispatchEvent(
      new CustomEvent('tau-review:comment', {
        bubbles: true,
        composed: true,
        detail: {
          body: decisionBody(question, decision),
          excerpt: `${question.id}: ${question.question}`,
          done: (ok: boolean, message: string) => {
            resolve(ok ? undefined : message);
          },
        },
      }),
    );
  });
};

type RecordedDecisions = Readonly<{
  decisions: ReadonlyMap<string, Decision>;
  /** Review events written but not yet committed by Finish review. */
  pending: number;
  record: (id: string, decision: Decision) => void;
  committed: () => void;
}>;

/** Decisions already recorded in this canvas's review events, keyed by question id (the latest wins). */
function useRecordedDecisions(): RecordedDecisions {
  const [decisions, setDecisions] = useState<ReadonlyMap<string, Decision>>(new Map());
  const [pending, setPending] = useState(0);
  useEffect(() => {
    // async-iife: bootstrap — one read of the review events on mount; failures leave nothing recorded.
    void (async () => {
      try {
        const response = await fetch('/__tau/review/threads');
        const reply = (await response.json()) as { pending?: number; threads?: Array<{ comment: { body: string } }> };
        const found = (reply.threads ?? []).map(({ comment }) => parseDecision(comment.body));
        setDecisions(new Map(found.filter((entry) => entry !== undefined)));
        setPending(reply.pending ?? 0);
      } catch {
        // No review endpoint (a static build): nothing recorded to show.
      }
    })();
  }, []);
  const record = useCallback((id: string, decision: Decision) => {
    setDecisions((current) => new Map(current).set(id, decision));
    setPending((count) => count + 1);
  }, []);
  const committed = useCallback(() => {
    setPending(0);
  }, []);
  return { decisions, pending, record, committed };
}

type Settlement = Readonly<{ status: Exclude<QuestionStatus, 'open'>; date: string; ruling: string }>;

/** Each settled question's latest ruling, keyed by question id; a question missing here is open. */
const settlementsOf = (decisions: ApiGuide['decisions']): ReadonlyMap<string, Settlement> =>
  new Map(
    decisions.flatMap(({ date, ruling, settles = {} }) =>
      Object.entries(settles).map(([id, status]) => [id, { status, date, ruling }] as const),
    ),
  );

const verdictTone: Record<Verdict, string> = {
  pass: 'bg-success/15 text-success',
  concern: 'bg-warning/15 text-warning',
  fail: 'bg-destructive/15 text-destructive',
  'n/a': 'bg-muted text-muted-foreground',
};

const horizonTone: Record<Horizon, string> = {
  shipped: 'bg-success/15 text-success',
  proposed: 'bg-primary/15 text-primary',
  later: 'bg-warning/15 text-warning',
  placeholder: 'bg-muted text-muted-foreground',
};

const themes = { light: 'github-light', dark: 'github-dark' } as const;
// Set once by `mountApiGuide`; a language Shiki does not bundle is highlighted with the guide's grammars.
let guideLanguages: readonly LanguageInput[] = [];
let guideHighlighter: ReturnType<typeof createHighlighter> | undefined;
const highlightCode = async (code: string, language: NonNullable<Sketch['language']>): Promise<string> => {
  if (language !== 'kcl') {
    return codeToHtml(code, { lang: language, themes, defaultColor: false });
  }
  guideHighlighter ??= createHighlighter({ themes: Object.values(themes), langs: [...guideLanguages] });
  const highlighter = await guideHighlighter;
  return highlighter.codeToHtml(code, { lang: language, themes, defaultColor: false });
};

const markdown = unified().use(remarkParse).use(remarkGfm);
type MarkdownNode = ReturnType<typeof markdown.parse>['children'][number];
// ponytail: unbounded, since a guide is a fixed set of authored strings.
const markdownTrees = new Map<string, readonly MarkdownNode[]>();
const inlineCode = 'rounded-sm bg-muted px-1 py-px font-mono text-[0.9em] wrap-anywhere';
// What `inline` flattens, so a label, title or table cell never holds a block element.
const blockTypes = new Set([
  'paragraph',
  'heading',
  'list',
  'listItem',
  'blockquote',
  'table',
  'tableRow',
  'tableCell',
]);
// Nodes that become one unstyled element around their children.
const wrappers = new Map<string, 'del' | 'em' | 'li' | 'p'>([
  ['delete', 'del'],
  ['emphasis', 'em'],
  ['listItem', 'li'],
  ['paragraph', 'p'],
]);

/** Relative targets and web or mail links; any other scheme (`javascript:`) renders as plain text. */
const safeHref = (url: string): string | undefined =>
  /^[a-z][\d+.a-z-]*:/i.test(url) && !/^(?:https?|mailto):/i.test(url) ? undefined : url;

function renderMarkdown(nodes: readonly MarkdownNode[], inline: boolean): React.ReactNode[] {
  return nodes.map((node) => {
    // Sibling nodes never share a source offset.
    const key = node.position?.start.offset;
    const children = 'children' in node ? renderMarkdown(node.children, inline) : undefined;
    if (inline && blockTypes.has(node.type)) {
      return <Fragment key={key}>{children}</Fragment>;
    }
    switch (node.type) {
      case 'text': {
        return node.value;
      }
      case 'inlineCode': {
        return (
          <code key={key} className={inlineCode}>
            {node.value}
          </code>
        );
      }
      case 'code': {
        return inline ? (
          <code key={key} className={inlineCode}>
            {node.value}
          </code>
        ) : (
          <pre key={key} className='overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs'>
            {node.value}
          </pre>
        );
      }
      case 'strong': {
        return (
          <strong key={key} className='font-semibold'>
            {children}
          </strong>
        );
      }
      case 'link': {
        return (
          <a key={key} href={safeHref(node.url)} className='underline underline-offset-2'>
            {children}
          </a>
        );
      }
      case 'break': {
        return <br key={key} />;
      }
      case 'heading': {
        return (
          <p key={key} className='font-semibold'>
            {children}
          </p>
        );
      }
      case 'list': {
        return node.ordered ? (
          <ol key={key} className='list-decimal space-y-1 pl-5'>
            {children}
          </ol>
        ) : (
          <ul key={key} className='list-disc space-y-1 pl-5'>
            {children}
          </ul>
        );
      }
      case 'blockquote': {
        return (
          <blockquote key={key} className='border-l-2 pl-3 text-muted-foreground'>
            {children}
          </blockquote>
        );
      }
      default: {
        const Wrapper = wrappers.get(node.type);
        if (Wrapper) {
          return <Wrapper key={key}>{children}</Wrapper>;
        }
        // Raw HTML and anything unstyled keep their text.
        return 'value' in node ? node.value : <Fragment key={key}>{children}</Fragment>;
      }
    }
  });
}

/**
 * An authored string as Markdown (GFM). `inline` keeps it inside a heading, label, list item or table cell;
 * otherwise paragraphs and lists render as blocks. Raw HTML stays text.
 */
function Markdown({ text, inline = false }: Readonly<{ text: string; inline?: boolean }>): React.JSX.Element {
  let tree = markdownTrees.get(text);
  if (!tree) {
    tree = markdown.parse(text).children;
    markdownTrees.set(text, tree);
  }
  return <>{renderMarkdown(tree, inline)}</>;
}

function Code({ sketch, evidence }: { sketch: Sketch; evidence?: Evidence }): React.JSX.Element {
  const [html, setHtml] = useState<string>();
  const language = sketch.language ?? 'typescript';
  // TypeScript and C# sketches are compiled and KCL sketches run; anything else is a source excerpt.
  const compiled = language === 'typescript' || language === 'csharp' || language === 'kcl';
  const checked = compiled ? evidence?.files[sketch.file] : undefined;
  // Inferred types replace the `^?` marker lines, so the reader sees what the compiler saw.
  const source = useMemo(() => {
    const lines = sketch.source.replace(/\n+$/, '').split('\n');
    for (const query of checked?.queries ?? []) {
      const marker = lines[query.line - 1] ?? '';
      lines[query.line - 1] = `${marker.slice(0, marker.indexOf('^'))}^? ${query.type}`;
    }
    return lines.join('\n');
  }, [sketch.source, checked]);
  useEffect(() => {
    let live = true;
    const highlight = async (): Promise<void> => {
      const result = await highlightCode(source, language);
      if (live) {
        setHtml(result);
      }
    };
    // async-iife: bootstrap -- an effect cannot return the highlight promise; `live` guards a stale result.
    void highlight();
    return () => {
      live = false;
    };
  }, [source, language]);
  return (
    <figure className='overflow-hidden rounded-md border bg-card'>
      <figcaption className='flex items-center justify-between gap-2 border-b px-3 py-1.5 font-mono text-xs text-muted-foreground'>
        <span>{sketch.file}</span>
        {evidence === undefined || !compiled ? (
          <span>source excerpt</span>
        ) : checked === undefined ? (
          <span className='text-destructive'>not compiled: run check-design</span>
        ) : checked.diagnostics.length === 0 ? (
          <span className='text-success'>{language === 'kcl' ? 'parses and runs' : 'compiles'}</span>
        ) : (
          <span className='text-destructive'>{checked.diagnostics.length} compile errors</span>
        )}
      </figcaption>
      {html === undefined ? (
        <pre className='overflow-x-auto p-3 text-xs'>{source}</pre>
      ) : (
        // oxlint-disable-next-line react/no-danger -- Shiki output for a local sketch file.
        <div className='api-guide-code overflow-x-auto p-3 text-xs' dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </figure>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section id={id} className='scroll-mt-14 space-y-3 md:scroll-mt-6'>
      <h2 className='text-lg font-semibold'>{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: readonly string[] }): React.JSX.Element {
  return (
    <ul className='list-disc space-y-1 pl-5 text-sm'>
      {items.map((item) => (
        <li key={item}>
          <Markdown text={item} inline />
        </li>
      ))}
    </ul>
  );
}

function CallSites({ sites, evidence }: { sites: readonly CallSite[]; evidence: Evidence }): React.JSX.Element {
  return (
    <>
      {sites.map((site) => (
        <div key={site.sketch.file} className='space-y-2'>
          <h4 className='text-sm font-medium'>
            <Badge variant='secondary' className='mr-2'>
              {site.audience}
            </Badge>
            <Markdown text={site.title} inline />
          </h4>
          <Code sketch={site.sketch} evidence={evidence} />
          {site.notes ? <Bullets items={site.notes} /> : undefined}
        </div>
      ))}
    </>
  );
}

function ChapterView({ chapter, evidence }: { chapter: Chapter; evidence: Evidence }): React.JSX.Element {
  return (
    <Card id={`chapter-${chapter.id}`} className='scroll-mt-14 md:scroll-mt-6'>
      <CardHeader>
        <CardTitle className='flex flex-wrap items-center gap-2 text-base'>
          {chapter.title}
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${horizonTone[chapter.horizon]}`}>
            {chapter.horizon}
          </span>
        </CardTitle>
        <CardDescription className='space-y-2'>
          <Markdown text={chapter.summary} />
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {chapter.guide ? (
          <p className='text-sm'>
            Owning guide:{' '}
            <a href={chapter.guide.href} className='underline underline-offset-2'>
              {chapter.guide.title}
            </a>
          </p>
        ) : undefined}
        {chapter.contract ? <Bullets items={chapter.contract} /> : undefined}
        <CallSites sites={chapter.sketches} evidence={evidence} />
        {chapter.questions && chapter.questions.length > 0 ? (
          <p className='text-xs text-muted-foreground'>
            Waits on:{' '}
            {chapter.questions.map((id, index) => (
              <span key={id}>
                {index > 0 ? ', ' : ''}
                <a href={`#question-${id}`} className='underline underline-offset-2'>
                  {id}
                </a>
              </span>
            ))}
          </p>
        ) : undefined}
      </CardContent>
    </Card>
  );
}

function OptionView({ option, evidence }: { option: GuideOption; evidence: Evidence }): React.JSX.Element {
  const { added, changed, removed } = option.surfaceDelta;
  return (
    <div className='space-y-4'>
      <div className='space-y-2 text-sm'>
        <Markdown text={option.summary} />
      </div>
      <div className='flex flex-wrap gap-2 text-xs'>
        <Badge variant='outline'>+{added.length} exported names</Badge>
        <Badge variant='outline'>~{changed.length} changed</Badge>
        <Badge variant='outline'>−{removed.length} removed</Badge>
      </div>
      <div className='grid gap-1 font-mono text-xs text-muted-foreground'>
        {added.map((name) => (
          <span key={name}>+ {name}</span>
        ))}
        {changed.map((name) => (
          <span key={name}>~ {name}</span>
        ))}
        {removed.map((name) => (
          <span key={name}>− {name}</span>
        ))}
      </div>
      <CallSites sites={option.callSites} evidence={evidence} />
      {option.surface ? (
        <div className='space-y-2'>
          <h4 className='text-sm font-medium'>The surface</h4>
          <Code sketch={option.surface} evidence={evidence} />
        </div>
      ) : undefined}
      {option.misuse ? (
        <div className='space-y-2'>
          <h4 className='text-sm font-medium'>Misuse that does not compile</h4>
          <Code sketch={option.misuse} evidence={evidence} />
        </div>
      ) : undefined}
      <div className='grid gap-4 md:grid-cols-2'>
        <div>
          <h4 className='mb-1 text-sm font-medium'>Gains</h4>
          <Bullets items={option.gains} />
        </div>
        <div>
          <h4 className='mb-1 text-sm font-medium'>Costs</h4>
          <Bullets items={option.costs} />
        </div>
      </div>
    </div>
  );
}

/** How far below the top of the viewport a heading must pass before its section counts as being read. */
const readingLine = 96;

type ReadingPosition = Readonly<{ section: string | undefined; item: string | undefined }>;

/**
 * Where the reader is: the last section whose top has passed the reading line, and the last chapter or
 * question inside it that has. At the end of the page every visible target counts, so a short final
 * section can still become current.
 */
function useReadingPosition(targets: ReadonlyArray<Readonly<{ id: string; nested: boolean }>>): ReadingPosition {
  const [position, setPosition] = useState<ReadingPosition>({ section: undefined, item: undefined });
  useEffect(() => {
    const measured = targets.flatMap((target) => {
      const element = document.querySelector(`#${CSS.escape(target.id)}`);
      return element ? [{ ...target, element }] : [];
    });
    let frame = 0;
    const measure = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { innerHeight, scrollY } = globalThis;
        const line = innerHeight + scrollY >= document.documentElement.scrollHeight - 1 ? innerHeight : readingLine;
        let section: string | undefined;
        let item: string | undefined;
        for (const { id, nested, element } of measured) {
          if (element.getBoundingClientRect().top > line) {
            break;
          }
          if (nested) {
            item = id;
          } else {
            section = id;
            item = undefined;
          }
        }
        setPosition((previous) =>
          previous.section === section && previous.item === item ? previous : { section, item },
        );
      });
    };
    measure();
    globalThis.addEventListener('scroll', measure, { passive: true });
    globalThis.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      globalThis.removeEventListener('scroll', measure);
      globalThis.removeEventListener('resize', measure);
    };
  }, [targets]);
  return position;
}

const tocEntry =
  'block rounded px-2 text-muted-foreground cursor-action hover:bg-accent hover:text-accent-foreground focus-visible:focus-outline aria-[current=location]:bg-accent aria-[current=location]:text-foreground';
const tocNested = `${tocEntry} truncate py-0.5 text-xs leading-5`;
const tocList = 'mt-0.5 mb-1.5 ml-2 space-y-0.5 border-l pl-2';

type MarkedState = Progress | QuestionStatus;

// Each state has its own shape as well as its hue, so the marks do not rely on color.
const marks = {
  complete: [CircleCheck, 'text-success'],
  next: [CircleDot, 'text-information'],
  pending: [Circle, 'text-muted-foreground'],
  open: [CircleQuestionMark, 'text-information'],
  accepted: [CircleCheck, 'text-success'],
  amended: [CircleAlert, 'text-warning'],
  deferred: [CirclePause, 'text-muted-foreground'],
} as const;

const statusTone: Record<QuestionStatus, string> = {
  open: 'bg-information/15 text-information',
  accepted: 'bg-success/15 text-success',
  amended: 'bg-warning/15 text-warning',
  deferred: 'bg-muted text-muted-foreground',
};

const rulingLead: Record<Settlement['status'], string> = {
  accepted: 'Accepted as recommended',
  amended: 'Amended',
  deferred: 'Deferred',
};

/** A chapter's delivery state or a question's status as a colored leading glyph; the text beside it names the state. */
function Mark({ state }: { state: MarkedState }): React.JSX.Element {
  const [Icon, tone] = marks[state];
  return <Icon aria-hidden className={`mr-1 inline size-3 align-[-2px] ${tone}`} />;
}

/** The legend is for sighted readers; each entry also names its state in text. */
function Legend({ states }: { states: readonly MarkedState[] }): React.JSX.Element {
  return (
    <p aria-hidden className='mt-0.5 ml-2 flex flex-wrap gap-x-3 px-2 text-xs leading-5 text-muted-foreground'>
      {states.map((state) => (
        <span key={state}>
          <Mark state={state} />
          {state}
        </span>
      ))}
    </p>
  );
}

/**
 * The guide's table of contents: every section, and inside them the options, the chapters and the
 * questions. The entry being read carries `aria-current`, and the list scrolls itself to keep it in view.
 */
function Contents({
  guide,
  statuses,
  sections,
  position,
  optionId,
  onOption,
  onNavigate,
  visible = true,
  className = '',
}: Readonly<{
  guide: ApiGuide;
  statuses: ReadonlyMap<string, QuestionStatus>;
  sections: ReadonlyArray<Readonly<{ id: string; label: string }>>;
  position: ReadingPosition;
  optionId: string | undefined;
  onOption: (id: string) => void;
  onNavigate?: () => void;
  /** False while the list is folded away; it is brought to the current entry again when it opens. */
  visible?: boolean;
  className?: string;
}>): React.JSX.Element {
  const list = useRef<HTMLElement>(null);
  // The deepest entry being read: a chapter or question, the selected option while reading the options, else the section.
  const current =
    position.item ??
    (position.section === 'options' && optionId !== undefined ? `option-${optionId}` : position.section);
  useEffect(() => {
    if (!visible || current === undefined) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const scroller = list.current;
      const entry = scroller?.querySelector<HTMLElement>(`[data-toc="${current}"]`);
      if (!scroller || !entry) {
        return;
      }
      const { offsetTop, offsetHeight } = entry;
      if (offsetTop < scroller.scrollTop || offsetTop + offsetHeight > scroller.scrollTop + scroller.clientHeight) {
        scroller.scrollTop = offsetTop - scroller.clientHeight / 3;
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [current, visible]);
  const mark = (id: string): 'location' | undefined => (current === id ? 'location' : undefined);
  return (
    <nav ref={list} aria-label='Guide contents' className={`relative ${className}`}>
      <ol className='space-y-0.5 text-sm'>
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              data-toc={section.id}
              data-within={position.section === section.id}
              aria-current={mark(section.id)}
              className={`${tocEntry} py-1 data-[within=true]:text-foreground`}
              onClick={onNavigate}
            >
              {section.label}
            </a>
            {section.id === 'options' ? (
              <ol className={tocList}>
                {guide.options.map((candidate) => (
                  <li key={candidate.id}>
                    <a
                      href='#options'
                      data-toc={`option-${candidate.id}`}
                      aria-current={mark(`option-${candidate.id}`)}
                      title={candidate.name}
                      className={tocNested}
                      onClick={() => {
                        onOption(candidate.id);
                        onNavigate?.();
                      }}
                    >
                      {candidate.name}
                    </a>
                  </li>
                ))}
              </ol>
            ) : undefined}
            {section.id === 'chapters' ? (
              <>
                <Legend states={['complete', 'next', 'pending']} />
                <ol className={tocList}>
                  {(guide.chapters ?? []).map((chapter) => (
                    <li key={chapter.id}>
                      <a
                        href={`#chapter-${chapter.id}`}
                        data-toc={`chapter-${chapter.id}`}
                        aria-current={mark(`chapter-${chapter.id}`)}
                        aria-label={`${chapter.title} (${chapter.progress})`}
                        title={`${chapter.title} (${chapter.progress})`}
                        className={tocNested}
                        onClick={onNavigate}
                      >
                        <Mark state={chapter.progress} />
                        {chapter.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </>
            ) : undefined}
            {section.id === 'questions' && guide.questions.length > 0 ? (
              <>
                <Legend states={['open', 'accepted', 'amended', 'deferred']} />
                <ol className='mt-0.5 mb-1.5 ml-2 flex flex-wrap gap-1 pl-2'>
                  {guide.questions.map((question) => {
                    const status = statuses.get(question.id) ?? 'open';
                    return (
                      <li key={question.id}>
                        <a
                          href={`#question-${question.id}`}
                          data-toc={`question-${question.id}`}
                          aria-current={mark(`question-${question.id}`)}
                          aria-label={`${question.id}, ${status}: ${question.question}`}
                          title={`${question.question} (${status})`}
                          className={`${tocNested} font-mono tabular-nums`}
                          onClick={onNavigate}
                        >
                          <Mark state={status} />
                          {question.id}
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : undefined}
          </li>
        ))}
      </ol>
    </nav>
  );
}

const kbd = 'rounded border bg-muted px-1 font-mono text-xs text-muted-foreground';
const optionRow =
  'flex cursor-action items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50 has-[[data-state=checked]]:bg-accent has-[:focus-visible]:focus-outline';
const inlineIcon = 'mr-1 inline size-3.5 align-[-2px]';

/** Marks the recommended choice with a glyph and the word, so it never relies on color. */
function RecommendedBadge({ id }: Readonly<{ id?: string }>): React.JSX.Element {
  return (
    <span
      id={id}
      className='inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary'
    >
      <ThumbsUp aria-hidden className='size-3' />
      Recommended
    </span>
  );
}

/**
 * The choices with their consequences, the reason beside the recommended one, and the actions that record a
 * decision. Keys: a digit picks a choice, Enter confirms from a choice, ⌘Enter or Ctrl+Enter from the note.
 */
function QuestionForm({
  question,
  initial,
  focusOnMount,
  onDecided,
  onCancel,
}: Readonly<{
  question: Question;
  initial: Decision | undefined;
  focusOnMount: boolean;
  onDecided: (question: Question, decision: Decision) => void;
  onCancel: (() => void) | undefined;
}>): React.JSX.Element {
  const recommended = recommendedOf(question);
  const [choice, setChoice] = useState(initial?.choice ?? (recommended && labelOf(recommended)));
  const [note, setNote] = useState(initial?.note ?? '');
  const [noting, setNoting] = useState(initial?.note !== undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const form = useRef<HTMLDivElement>(null);
  const prefix = `question-${question.id}`;
  useEffect(() => {
    if (focusOnMount) {
      form.current?.querySelector<HTMLElement>('[role=radio][data-state=checked]')?.focus();
    }
  }, [focusOnMount]);
  const submit = async (value: string | undefined): Promise<void> => {
    if (pending) {
      return;
    }
    const decision = { choice: value, note: note.trim() === '' ? undefined : note.trim() };
    setPending(true);
    const failure = await recordDecision(question, decision);
    setPending(false);
    setError(failure);
    if (failure === undefined) {
      onDecided(question, decision);
    }
  };
  const confirm = (): void => {
    if (choice !== undefined) {
      // async-iife: bootstrap — submit settles its own failure into `error`.
      void submit(choice);
    }
  };
  const onChoiceKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    // A radio swallows Enter (WAI-ARIA radios do not submit), so the group confirms for it.
    if (event.key === 'Enter' && (event.target as HTMLElement).getAttribute('role') === 'radio') {
      event.preventDefault();
      confirm();
      return;
    }
    const position = Number(event.key);
    const option = question.options[position - 1];
    if (option) {
      event.preventDefault();
      setChoice(labelOf(option));
      form.current?.querySelector<HTMLElement>(`#${CSS.escape(`${prefix}-option-${position}`)}`)?.focus();
    }
  };
  return (
    <div ref={form} className='space-y-3 text-sm'>
      <RadioGroup
        value={choice ?? ''}
        onValueChange={setChoice}
        aria-labelledby={`${prefix}-title`}
        className='gap-2'
        onKeyDown={onChoiceKey}
      >
        {question.options.map((option, index) => {
          const id = `${prefix}-option-${index + 1}`;
          const flagged = option === recommended;
          return (
            <label key={option.label} className={`${optionRow} ${flagged ? 'border-primary/40' : ''}`}>
              <RadioGroupItem
                id={id}
                value={labelOf(option)}
                className='mt-0.5'
                aria-labelledby={flagged ? `${id}-label ${id}-badge` : `${id}-label`}
                aria-describedby={flagged ? `${id}-consequence ${prefix}-why` : `${id}-consequence`}
              />
              <span className='min-w-0 flex-1 space-y-1'>
                <span className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                  <span id={`${id}-label`} className='font-medium'>
                    <Markdown text={labelOf(option)} inline />
                  </span>
                  {flagged ? <RecommendedBadge id={`${id}-badge`} /> : undefined}
                  <kbd aria-hidden className={`ml-auto hidden md:inline ${kbd}`}>
                    {index + 1}
                  </kbd>
                </span>
                <span id={`${id}-consequence`} className='block text-muted-foreground'>
                  <Markdown text={option.consequence} inline />
                </span>
                {flagged ? (
                  <span id={`${prefix}-why`} className='block'>
                    <Lightbulb aria-hidden className={`${inlineIcon} text-primary`} />
                    <span className='font-medium'>Why: </span>
                    <Markdown text={question.recommendation} inline />
                  </span>
                ) : undefined}
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {recommended ? undefined : (
        <p>
          <Lightbulb aria-hidden className={`${inlineIcon} text-muted-foreground`} />
          <span className='font-medium'>Recommendation: </span>
          <Markdown text={question.recommendation} inline />
        </p>
      )}
      {noting ? (
        <Textarea
          // oxlint-disable-next-line jsx-a11y/no-autofocus -- opened by the reviewer's own click on Add note
          autoFocus
          value={note}
          rows={2}
          aria-label={`Note on ${question.id}`}
          placeholder='A note for the agent (optional). ⌘Enter or Ctrl+Enter confirms.'
          onChange={(event) => {
            setNote(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              confirm();
            }
          }}
        />
      ) : undefined}
      <div className='flex flex-wrap items-center gap-2'>
        <Button size='sm' disabled={pending || choice === undefined} onClick={confirm}>
          {isRecommended(question, choice) ? 'Confirm recommended' : 'Confirm choice'}
          <kbd aria-hidden className='hidden font-mono opacity-60 md:inline'>
            ↵
          </kbd>
        </Button>
        <Button
          size='sm'
          variant='ghost'
          disabled={pending}
          onClick={() => {
            // async-iife: bootstrap — submit settles its own failure into `error`.
            void submit(undefined);
          }}
        >
          Defer
        </Button>
        {noting ? undefined : (
          <Button
            size='sm'
            variant='ghost'
            onClick={() => {
              setNoting(true);
            }}
          >
            Add note
          </Button>
        )}
        {onCancel ? (
          <Button size='sm' variant='ghost' onClick={onCancel}>
            Cancel
          </Button>
        ) : undefined}
        {error ? (
          <span role='alert'>
            <CircleAlert aria-hidden className={`${inlineIcon} text-destructive`} />
            {error}
          </span>
        ) : undefined}
      </div>
    </div>
  );
}

/** One question: deciding it, what was recorded for it, or the guide's ruling once one settles it. */
function QuestionCard({
  question,
  position,
  status,
  settlement,
  decision,
  onDecided,
}: Readonly<{
  question: Question;
  position: string;
  status: QuestionStatus;
  settlement: Settlement | undefined;
  decision: Decision | undefined;
  onDecided: (question: Question, decision: Decision) => void;
}>): React.JSX.Element {
  const [changing, setChanging] = useState(false);
  const recommended = recommendedOf(question);
  const deciding = settlement === undefined && (decision === undefined || changing);
  let body: React.JSX.Element | undefined;
  if (settlement) {
    // An accepted question's ruling is its recommended choice; the others say how the ruling differs.
    const ruling = settlement.status === 'accepted' ? recommended && labelOf(recommended) : settlement.ruling;
    body = (
      <div className='space-y-2 text-sm'>
        <p>
          <span className='font-medium'>
            {rulingLead[settlement.status]} on {settlement.date}
          </span>
          {ruling === undefined ? (
            '.'
          ) : (
            <>
              : <Markdown text={ruling} inline />
            </>
          )}
        </p>
        <details>
          <summary className='cursor-action text-muted-foreground'>Options and recommendation</summary>
          <ul className='mt-2 space-y-1'>
            {question.options.map((choice) => (
              <li key={choice.label}>
                <span className='font-medium'>
                  <Markdown text={labelOf(choice)} inline />
                </span>
                {choice === recommended ? ' (recommended)' : ''}: <Markdown text={choice.consequence} inline />
              </li>
            ))}
          </ul>
          <p className='mt-2 text-muted-foreground'>
            Recommendation: <Markdown text={question.recommendation} inline />
          </p>
        </details>
      </div>
    );
  } else if (deciding) {
    body = (
      <QuestionForm
        question={question}
        initial={decision}
        focusOnMount={changing}
        onDecided={(decided, value) => {
          setChanging(false);
          onDecided(decided, value);
        }}
        onCancel={
          changing
            ? () => {
                setChanging(false);
              }
            : undefined
        }
      />
    );
  } else if (decision) {
    body = (
      <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
        {decision.choice === undefined ? (
          <span className='font-medium'>Deferred</span>
        ) : (
          <>
            <span className='font-medium'>
              <Markdown text={decision.choice} inline />
            </span>
            {isRecommended(question, decision.choice) ? <RecommendedBadge /> : undefined}
          </>
        )}
        <Button
          size='xs'
          variant='ghost'
          className='ml-auto'
          aria-label={`Change the decision on ${question.id}`}
          onClick={() => {
            setChanging(true);
          }}
        >
          Change
        </Button>
        {decision.note ? <p className='basis-full text-muted-foreground'>Note: {decision.note}</p> : undefined}
      </div>
    );
  }
  return (
    <Card
      id={`question-${question.id}`}
      data-review-id={`question-${question.id}`}
      className='scroll-mt-14 gap-3 px-4 md:scroll-mt-6'
    >
      <div className='flex items-center gap-2 text-xs text-muted-foreground'>
        <span className='font-mono'>{question.id}</span>
        <span aria-hidden>·</span>
        <span className='tabular-nums'>{position}</span>
        {/* Decisions are recorded on this mark; the review layer draws no pin for them (the card shows them). */}
        <span
          data-review-id={`decision-${question.id}`}
          data-review-pinless
          className={`ml-auto rounded px-1.5 py-0.5 font-medium ${statusTone[status]}`}
        >
          <Mark state={status} />
          {status}
        </span>
      </div>
      <h3 id={`question-${question.id}-title`} className='text-base leading-snug font-semibold'>
        <Markdown text={question.question} inline />
      </h3>
      {deciding && question.context ? (
        <div className='space-y-2 text-sm'>
          <Markdown text={question.context} />
        </div>
      ) : undefined}
      {body}
    </Card>
  );
}

/**
 * The open questions as a review queue: progress, accept every recommendation at once, and after each
 * decision the next open question takes focus; once none is left, Finish review commits the review to Brain.
 */
function Questions({
  guide,
  settlements,
  statuses,
  recorded,
}: Readonly<{
  guide: ApiGuide;
  settlements: ReadonlyMap<string, Settlement>;
  statuses: ReadonlyMap<string, QuestionStatus>;
  recorded: RecordedDecisions;
}>): React.JSX.Element {
  const { questions } = guide;
  // A fresh object per request, so asking for the same question twice still moves focus.
  const [focus, setFocus] = useState<Readonly<{ id: string | undefined }>>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Readonly<{ ok: boolean; text: string }>>();
  const isOpen = (id: string): boolean => statuses.get(id) === 'open';
  const open = questions.filter((question) => isOpen(question.id));
  const acceptable = open.flatMap((question) => {
    const recommended = recommendedOf(question);
    return recommended ? [{ question, decision: { choice: labelOf(recommended), note: undefined } }] : [];
  });
  useEffect(() => {
    if (!focus) {
      return;
    }
    const card = document.querySelector(focus.id === undefined ? '#questions' : `#question-${CSS.escape(focus.id)}`);
    const still = globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
    card?.scrollIntoView({ block: 'start', behavior: still ? 'instant' : 'smooth' });
    const target =
      focus.id === undefined
        ? document.querySelector<HTMLElement>('#finish-review')
        : card?.querySelector<HTMLElement>('[role=radio][data-state=checked], [role=radio]');
    target?.focus({ preventScroll: true });
  }, [focus]);
  /** The first open question after `id`, wrapping, that this batch has not just decided. */
  const nextOpen = (id: string | undefined, decided: ReadonlySet<string>): string | undefined => {
    const index = questions.findIndex((question) => question.id === id);
    return [...questions.slice(index + 1), ...questions.slice(0, index + 1)].find(
      (question) => isOpen(question.id) && !decided.has(question.id),
    )?.id;
  };
  const decide = (question: Question, decision: Decision): void => {
    recorded.record(question.id, decision);
    setNotice(undefined);
    setFocus({ id: nextOpen(question.id, new Set([question.id])) });
  };
  const acceptAll = async (): Promise<void> => {
    setBusy(true);
    const decided = new Set<string>();
    for (const { question, decision } of acceptable) {
      // Sequential: each event is its own file, and the layer reloads the threads after each write.
      // oxlint-disable-next-line no-await-in-loop -- one event per question, in order
      const failure = await recordDecision(question, decision);
      if (failure) {
        setNotice({ ok: false, text: failure });
        break;
      }
      recorded.record(question.id, decision);
      decided.add(question.id);
    }
    setBusy(false);
    setFocus({ id: nextOpen(undefined, decided) });
  };
  const finish = async (): Promise<void> => {
    if (!document.querySelector('tau-review-layer')) {
      setNotice({ ok: false, text: 'Finishing needs the canvas dev server; this page is read-only.' });
      return;
    }
    setBusy(true);
    const [ok, text] = await new Promise<readonly [boolean, string]>((resolve) => {
      globalThis.dispatchEvent(
        new CustomEvent('tau-review:finish', {
          detail: {
            done: (committed: boolean, message: string) => {
              resolve([committed, message]);
            },
          },
        }),
      );
    });
    setBusy(false);
    setNotice({ ok, text });
    if (ok) {
      recorded.committed();
    }
  };
  if (questions.length === 0) {
    return <p className='text-sm text-muted-foreground'>No open questions.</p>;
  }
  const most = Math.max(...questions.map((question) => question.options.length));
  return (
    <>
      <div className='space-y-3'>
        <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
          <ProgressBar
            value={((questions.length - open.length) / questions.length) * 100}
            aria-label='Questions decided'
            className='h-1.5 w-32'
          />
          <span role='status' className='text-sm tabular-nums'>
            {questions.length - open.length} of {questions.length} decided
          </span>
          {open.length > 0 ? (
            <span className='hidden text-xs text-muted-foreground md:inline'>
              <kbd className={kbd}>1</kbd>–<kbd className={kbd}>{most}</kbd> choose · <kbd className={kbd}>↵</kbd>{' '}
              confirm and go to the next · <kbd className={kbd}>C</kbd> comment
            </span>
          ) : undefined}
        </div>
        <div className='flex flex-wrap items-center gap-2 text-sm empty:hidden'>
          {acceptable.length > 0 ? (
            <Button variant='outline' size='sm' disabled={busy} onClick={acceptAll}>
              {acceptable.length === 1
                ? 'Accept the recommendation'
                : `Accept all ${acceptable.length} recommendations`}
            </Button>
          ) : undefined}
          {open.length === 0 && recorded.pending > 0 ? (
            <>
              <Button id='finish-review' size='sm' disabled={busy} onClick={finish}>
                Finish review
              </Button>
              <span className='text-muted-foreground'>
                Commits this review (decisions and comments) to Brain in one commit; the agent applies it next.
              </span>
            </>
          ) : undefined}
          {notice ? (
            <span role={notice.ok ? 'status' : 'alert'}>
              {notice.ok ? (
                <CircleCheck aria-hidden className={`${inlineIcon} text-success`} />
              ) : (
                <CircleAlert aria-hidden className={`${inlineIcon} text-destructive`} />
              )}
              {notice.text}
            </span>
          ) : undefined}
        </div>
      </div>
      {questions.map((question, index) => (
        <QuestionCard
          key={question.id}
          question={question}
          position={`${index + 1} of ${questions.length}`}
          status={statuses.get(question.id) ?? 'open'}
          settlement={settlements.get(question.id)}
          decision={recorded.decisions.get(question.id)}
          onDecided={decide}
        />
      ))}
    </>
  );
}

function Guide({ guide }: { guide: ApiGuide }): React.JSX.Element {
  const [dark, setDark] = useState(() => globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
  const [optionId, setOptionId] = useState(
    guide.options.find((option) => option.standing === 'recommended')?.id ?? guide.options[0]?.id,
  );
  const contents = useRef<HTMLDetailsElement>(null);
  const [contentsOpen, setContentsOpen] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  const option = guide.options.find((candidate) => candidate.id === optionId);
  const checks = [...new Set(guide.options.flatMap((candidate) => Object.keys(candidate.scorecard)))];
  const failing = Object.values(guide.evidence.files).reduce((count, file) => count + file.diagnostics.length, 0);
  // Name each checker that actually ran, from the sketch files it recorded.
  const checkedFiles = Object.keys(guide.evidence.files);
  const toolchains = [
    checkedFiles.some((file) => /\.tsx?$/.test(file)) && `TypeScript ${guide.evidence.typescript}`,
    guide.evidence.dotnet !== undefined && `.NET ${guide.evidence.dotnet}`,
    guide.evidence.kcl !== undefined && `KCL ${guide.evidence.kcl}`,
  ].filter(Boolean);
  const chapters = guide.chapters ?? [];
  const settlements = useMemo(() => settlementsOf(guide.decisions), [guide.decisions]);
  const recorded = useRecordedDecisions();
  // What the contents and the cards show: the guide's ruling, else the decision recorded in this review.
  const statuses = useMemo(
    () =>
      new Map<string, QuestionStatus>(
        guide.questions.map((question) => {
          const decision = recorded.decisions.get(question.id);
          const recordedStatus = decision === undefined ? 'open' : statusOf(question, decision);
          return [question.id, settlements.get(question.id)?.status ?? recordedStatus];
        }),
      ),
    [guide.questions, settlements, recorded.decisions],
  );
  const sections = useMemo(
    () => [
      { id: 'problem', label: 'Problem' },
      { id: 'contract', label: 'Contract in words' },
      { id: 'options', label: 'Options' },
      ...((guide.chapters?.length ?? 0) > 0 ? [{ id: 'chapters', label: 'Reference chapters' }] : []),
      { id: 'shared', label: 'Host and agent' },
      { id: 'scorecard', label: 'Scorecard' },
      { id: 'failures', label: 'Failures' },
      { id: 'questions', label: 'Open questions' },
      { id: 'blast', label: 'Blast radius' },
      { id: 'decisions', label: 'Decisions' },
    ],
    [guide.chapters],
  );
  // Every anchor the reading position is measured against, in page order.
  const targets = useMemo(
    () =>
      sections.flatMap(({ id }) => [
        { id, nested: false },
        ...(id === 'chapters'
          ? (guide.chapters ?? []).map((chapter) => ({ id: `chapter-${chapter.id}`, nested: true }))
          : []),
        ...(id === 'questions'
          ? guide.questions.map((question) => ({ id: `question-${question.id}`, nested: true }))
          : []),
      ]),
    [sections, guide.chapters, guide.questions],
  );
  const position = useReadingPosition(targets);
  const reading = sections.find((section) => section.id === position.section);
  const themeToggle = (
    <Button
      variant='outline'
      size='sm'
      className='w-full shrink-0'
      onClick={() => {
        setDark((value) => !value);
      }}
    >
      {dark ? 'Light theme' : 'Dark theme'}
    </Button>
  );
  return (
    <>
      <a
        href='#main'
        className='sr-only rounded bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-30 focus-visible:focus-outline'
      >
        Skip to the guide
      </a>
      {/* Narrow screens: the same contents behind a sticky disclosure that closes once a link is followed. */}
      <details
        ref={contents}
        className='sticky top-0 z-20 border-b bg-background md:hidden'
        onToggle={(event) => {
          setContentsOpen(event.currentTarget.open);
        }}
      >
        <summary className='cursor-action truncate px-4 py-2 text-sm focus-visible:focus-outline'>
          Contents
          {reading ? <span className='text-muted-foreground'> · {reading.label}</span> : undefined}
        </summary>
        <div className='absolute inset-x-0 top-full space-y-3 border-b bg-background px-4 pt-1 pb-4 shadow-sm'>
          <Contents
            guide={guide}
            statuses={statuses}
            sections={sections}
            position={position}
            optionId={optionId}
            onOption={setOptionId}
            visible={contentsOpen}
            className='max-h-[60dvh] overflow-y-auto overscroll-contain'
            onNavigate={() => {
              if (contents.current) {
                contents.current.open = false;
              }
            }}
          />
          {themeToggle}
        </div>
      </details>
      <div className='mx-auto flex max-w-6xl gap-8 px-4 py-8 md:px-6'>
        <style>{`.api-guide-code pre{background:transparent!important;margin:0}.api-guide-code span{color:var(--shiki-light)}.dark .api-guide-code span{color:var(--shiki-dark)}`}</style>
        <aside className='sticky top-8 hidden max-h-[calc(100dvh-4rem)] w-56 shrink-0 flex-col gap-3 self-start md:flex'>
          <Contents
            guide={guide}
            statuses={statuses}
            sections={sections}
            position={position}
            optionId={optionId}
            onOption={setOptionId}
            className='min-h-0 flex-1 overflow-y-auto overscroll-contain'
          />
          {themeToggle}
        </aside>
        <main id='main' className='min-w-0 flex-1 space-y-10'>
          <header className='space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge>{guide.status}</Badge>
              <Badge variant='outline'>revision {guide.revision}</Badge>
              <Badge variant='outline' className={failing === 0 ? 'text-success' : 'text-destructive'}>
                {failing === 0 ? `sketches check · ${toolchains.join(' · ')}` : `${failing} sketch errors`}
              </Badge>
            </div>
            <h1 className='text-2xl font-semibold'>{guide.title}</h1>
            <p className='text-muted-foreground'>
              <Markdown text={guide.oneLine} inline />
            </p>
            <p className='font-mono text-xs text-muted-foreground'>owner: {guide.owner}</p>
          </header>

          <Section id='problem' title='Problem'>
            <div className='space-y-2 text-sm'>
              <Markdown text={guide.problem.summary} />
            </div>
            {guide.problem.today.map((excerpt) => (
              <Code key={excerpt.label} sketch={{ file: excerpt.label, source: excerpt.code }} />
            ))}
            <Bullets items={guide.problem.pains} />
          </Section>

          <Section id='contract' title='Contract in words'>
            <Bullets items={guide.contract} />
          </Section>

          <Section id='options' title='Options'>
            <div role='tablist' aria-label='Design options' className='flex flex-wrap gap-2'>
              {guide.options.map((candidate) => (
                <Button
                  key={candidate.id}
                  role='tab'
                  aria-selected={candidate.id === optionId}
                  variant={candidate.id === optionId ? 'default' : 'outline'}
                  size='sm'
                  className='h-auto max-w-full text-left whitespace-normal'
                  onClick={() => {
                    setOptionId(candidate.id);
                  }}
                >
                  {candidate.name}
                  {candidate.standing === 'recommended'
                    ? ' · recommended'
                    : candidate.standing === 'rejected'
                      ? ' · rejected'
                      : ''}
                </Button>
              ))}
            </div>
            {option ? (
              <Card>
                <CardHeader>
                  <CardTitle>{option.name}</CardTitle>
                  <CardDescription>{option.standing}</CardDescription>
                </CardHeader>
                <CardContent>
                  <OptionView option={option} evidence={guide.evidence} />
                </CardContent>
              </Card>
            ) : undefined}
          </Section>

          {chapters.length > 0 ? (
            <Section id='chapters' title='Reference chapters (under the recommended option)'>
              <nav aria-label='Chapters' className='flex flex-wrap gap-2 text-xs'>
                {chapters.map((chapter) => (
                  <a
                    key={chapter.id}
                    href={`#chapter-${chapter.id}`}
                    className='rounded border px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  >
                    {chapter.title}
                    <span className={`ml-1.5 rounded px-1 font-medium ${horizonTone[chapter.horizon]}`}>
                      {chapter.horizon}
                    </span>
                  </a>
                ))}
              </nav>
              {chapters.map((chapter) => (
                <ChapterView key={chapter.id} chapter={chapter} evidence={guide.evidence} />
              ))}
            </Section>
          ) : undefined}

          <Section id='shared' title='Host and agent call sites (same under every option)'>
            <CallSites sites={guide.shared} evidence={guide.evidence} />
          </Section>

          <Section id='scorecard' title='Scorecard against the review rubric'>
            <div className='overflow-x-auto'>
              <Table className='min-w-[640px]'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Check</TableHead>
                    {guide.options.map((candidate) => (
                      <TableHead key={candidate.id}>{candidate.name}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.map((check) => (
                    <TableRow key={check}>
                      <TableCell className='font-mono text-xs'>{check}</TableCell>
                      {guide.options.map((candidate) => {
                        const cell = candidate.scorecard[check];
                        return (
                          <TableCell key={candidate.id} className='align-top text-xs whitespace-normal'>
                            {cell ? (
                              <>
                                <span className={`mr-1 rounded px-1.5 py-0.5 font-medium ${verdictTone[cell.verdict]}`}>
                                  {cell.verdict}
                                </span>
                                <Markdown text={cell.note} inline />
                              </>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section id='failures' title='Failures a caller can cause'>
            <div className='overflow-x-auto'>
              <Table className='min-w-[640px]'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Recovery</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guide.failures.map((failure) => (
                    <TableRow key={`${failure.code} ${failure.when}`}>
                      <TableCell className='font-mono text-xs'>{failure.code}</TableCell>
                      <TableCell className='text-xs whitespace-normal'>
                        <Markdown text={failure.when} inline />
                      </TableCell>
                      <TableCell className='text-xs whitespace-normal'>
                        <Markdown text={failure.message} inline />
                      </TableCell>
                      <TableCell className='text-xs whitespace-normal'>
                        <Markdown text={failure.recovery} inline />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section id='questions' title='Open questions for the reviewer'>
            <Questions guide={guide} settlements={settlements} statuses={statuses} recorded={recorded} />
          </Section>

          <Section id='blast' title='Blast radius'>
            <div className='overflow-x-auto'>
              <Table className='min-w-[640px]'>
                <TableBody>
                  {guide.blastRadius.map((entry) => (
                    <TableRow key={entry.path}>
                      <TableCell className='font-mono text-xs'>{entry.path}</TableCell>
                      <TableCell className='text-xs whitespace-normal'>
                        <Markdown text={entry.change} inline />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section id='decisions' title='Decisions'>
            {guide.decisions.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                None yet. This guide is for discussion; nothing here is implemented.
              </p>
            ) : (
              <Bullets items={guide.decisions.map((decision) => `${decision.date}: ${decision.ruling}`)} />
            )}
          </Section>
        </main>
      </div>
    </>
  );
}

/** Mount a guide into `#root`. */
export const mountApiGuide = (guide: ApiGuide): void => {
  guideLanguages = guide.languages ?? [];
  createRoot(document.querySelector('#root')!).render(<Guide guide={guide} />);
};
