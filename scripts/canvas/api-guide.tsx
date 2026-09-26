/**
 * Shared renderer for API design guides (`create-ts-api` skill). A guide is data plus compiled
 * sketch files; this module only lays them out. Import it as `@tau/api-guide` from a guide's
 * `main.tsx` under `docs/research/artifacts/<subject>/api/`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { codeToHtml } from 'shiki';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@taucad/ui/components/table';

/**
 * One sketch file: its path under the guide and its source, imported with `?raw`. TypeScript sketches
 * are compiled by the checker; a `python` or `json` sketch is shown as a source excerpt.
 */
export type Sketch = Readonly<{ file: string; source: string; language?: 'typescript' | 'tsx' | 'python' | 'json' }>;

/** Output of `check-design.mjs`, imported from `design/evidence.json`. */
export type Evidence = Readonly<{
  typescript: string;
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

export type CallSite = Readonly<{ audience: Audience; title: string; sketch: Sketch; notes?: readonly string[] }>;

/**
 * One capability of a living reference guide, shown under the recommended option. A chapter that has
 * its own design guide links to it instead of repeating its options.
 */
export type Chapter = Readonly<{
  id: string;
  title: string;
  horizon: Horizon;
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
  questions: ReadonlyArray<
    Readonly<{
      id: string;
      question: string;
      options: ReadonlyArray<Readonly<{ label: string; consequence: string }>>;
      recommendation: string;
    }>
  >;
  blastRadius: ReadonlyArray<Readonly<{ path: string; change: string }>>;
  decisions: ReadonlyArray<Readonly<{ date: string; ruling: string }>>;
  evidence: Evidence;
}>;

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

function Code({ sketch, evidence }: { sketch: Sketch; evidence?: Evidence }): React.JSX.Element {
  const [html, setHtml] = useState<string>();
  const language = sketch.language ?? 'typescript';
  // Only TypeScript sketches are compiled; anything else is a source excerpt whatever evidence exists.
  const checked = language === 'typescript' ? evidence?.files[sketch.file] : undefined;
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
      const result = await codeToHtml(source, {
        lang: language,
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: false,
      });
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
        {evidence === undefined || language !== 'typescript' ? (
          <span>source excerpt</span>
        ) : checked === undefined ? (
          <span className='text-destructive'>not compiled: run check-design</span>
        ) : checked.diagnostics.length === 0 ? (
          <span className='text-success'>compiles</span>
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
        <li key={item}>{item}</li>
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
            {site.title}
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
        <CardDescription>{chapter.summary}</CardDescription>
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
      <p className='text-sm'>{option.summary}</p>
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

/**
 * The guide's table of contents: every section, and inside them the options, the chapters and the
 * questions. The entry being read carries `aria-current`, and the list scrolls itself to keep it in view.
 */
function Contents({
  guide,
  sections,
  position,
  optionId,
  onOption,
  onNavigate,
  visible = true,
  className = '',
}: Readonly<{
  guide: ApiGuide;
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
              <ol className={tocList}>
                {(guide.chapters ?? []).map((chapter) => (
                  <li key={chapter.id}>
                    <a
                      href={`#chapter-${chapter.id}`}
                      data-toc={`chapter-${chapter.id}`}
                      aria-current={mark(`chapter-${chapter.id}`)}
                      title={chapter.title}
                      className={tocNested}
                      onClick={onNavigate}
                    >
                      {chapter.title}
                    </a>
                  </li>
                ))}
              </ol>
            ) : undefined}
            {section.id === 'questions' ? (
              <ol className='mt-0.5 mb-1.5 ml-2 flex flex-wrap gap-1 pl-2'>
                {guide.questions.map((question) => (
                  <li key={question.id}>
                    <a
                      href={`#question-${question.id}`}
                      data-toc={`question-${question.id}`}
                      aria-current={mark(`question-${question.id}`)}
                      aria-label={`${question.id}: ${question.question}`}
                      title={question.question}
                      className={`${tocNested} font-mono tabular-nums`}
                      onClick={onNavigate}
                    >
                      {question.id}
                    </a>
                  </li>
                ))}
              </ol>
            ) : undefined}
          </li>
        ))}
      </ol>
    </nav>
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
  const chapters = guide.chapters ?? [];
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
                {failing === 0
                  ? `sketches compile · TypeScript ${guide.evidence.typescript}`
                  : `${failing} compile errors`}
              </Badge>
            </div>
            <h1 className='text-2xl font-semibold'>{guide.title}</h1>
            <p className='text-muted-foreground'>{guide.oneLine}</p>
            <p className='font-mono text-xs text-muted-foreground'>owner: {guide.owner}</p>
          </header>

          <Section id='problem' title='Problem'>
            <p className='text-sm'>{guide.problem.summary}</p>
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
                                {cell.note}
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
                      <TableCell className='text-xs whitespace-normal'>{failure.when}</TableCell>
                      <TableCell className='text-xs whitespace-normal'>{failure.message}</TableCell>
                      <TableCell className='text-xs whitespace-normal'>{failure.recovery}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section id='questions' title='Open questions for the reviewer'>
            {guide.questions.map((question) => (
              <Card key={question.id} id={`question-${question.id}`} className='scroll-mt-14 md:scroll-mt-6'>
                <CardHeader>
                  <CardTitle className='text-base'>
                    {question.id}. {question.question}
                  </CardTitle>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  <ul className='space-y-1'>
                    {question.options.map((choice) => (
                      <li key={choice.label}>
                        <span className='font-medium'>{choice.label}.</span> {choice.consequence}
                      </li>
                    ))}
                  </ul>
                  <p className='text-muted-foreground'>Recommendation: {question.recommendation}</p>
                </CardContent>
              </Card>
            ))}
          </Section>

          <Section id='blast' title='Blast radius'>
            <div className='overflow-x-auto'>
              <Table className='min-w-[640px]'>
                <TableBody>
                  {guide.blastRadius.map((entry) => (
                    <TableRow key={entry.path}>
                      <TableCell className='font-mono text-xs'>{entry.path}</TableCell>
                      <TableCell className='text-xs whitespace-normal'>{entry.change}</TableCell>
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
  createRoot(document.querySelector('#root')!).render(<Guide guide={guide} />);
};
