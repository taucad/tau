/**
 * Shared renderer for API design guides (`create-ts-api` skill). A guide is data plus compiled
 * sketch files; this module only lays them out. Import it as `@tau/api-guide` from a guide's
 * `main.tsx` under `docs/research/artifacts/<subject>/api/`.
 */
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { codeToHtml } from 'shiki';
import { Badge } from '@taucad/ui/components/badge';
import { Button } from '@taucad/ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@taucad/ui/components/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@taucad/ui/components/table';

/** One compiled sketch file: its path under the guide and its source, imported with `?raw`. */
export type Sketch = Readonly<{ file: string; source: string }>;

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
  shared: ReadonlyArray<Readonly<{ audience: Audience; title: string; sketch: Sketch; notes?: readonly string[] }>>;
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

function Code({
  sketch,
  evidence,
  language = 'typescript',
}: {
  sketch: Sketch;
  evidence?: Evidence;
  language?: string;
}): React.JSX.Element {
  const [html, setHtml] = useState<string>();
  const checked = evidence?.files[sketch.file];
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
        {evidence === undefined ? (
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
        // eslint-disable-next-line react/no-danger -- Shiki output for a local sketch file.
        <div className='api-guide-code overflow-x-auto p-3 text-xs' dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </figure>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section id={id} className='scroll-mt-6 space-y-3'>
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
      {option.callSites.map((site) => (
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

function Guide({ guide }: { guide: ApiGuide }): React.JSX.Element {
  const [dark, setDark] = useState(() => globalThis.matchMedia('(prefers-color-scheme: dark)').matches);
  const [optionId, setOptionId] = useState(
    guide.options.find((option) => option.standing === 'recommended')?.id ?? guide.options[0]?.id,
  );
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  const option = guide.options.find((candidate) => candidate.id === optionId);
  const checks = [...new Set(guide.options.flatMap((candidate) => Object.keys(candidate.scorecard)))];
  const failing = Object.values(guide.evidence.files).reduce((count, file) => count + file.diagnostics.length, 0);
  const nav = [
    ['problem', 'Problem'],
    ['contract', 'Contract in words'],
    ['options', 'Options'],
    ['shared', 'Host and agent'],
    ['scorecard', 'Scorecard'],
    ['failures', 'Failures'],
    ['questions', 'Open questions'],
    ['blast', 'Blast radius'],
    ['decisions', 'Decisions'],
  ] as const;
  return (
    <div className='mx-auto flex max-w-6xl gap-8 px-4 py-8 md:px-6'>
      <style>{`.api-guide-code pre{background:transparent!important;margin:0}.api-guide-code span{color:var(--shiki-light)}.dark .api-guide-code span{color:var(--shiki-dark)}`}</style>
      <nav aria-label='Guide sections' className='sticky top-8 hidden h-fit w-44 shrink-0 space-y-1 text-sm md:block'>
        {nav.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className='block rounded px-2 py-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          >
            {label}
          </a>
        ))}
        <Button
          variant='outline'
          size='sm'
          className='mt-4 w-full'
          onClick={() => {
            setDark((value) => !value);
          }}
        >
          {dark ? 'Light theme' : 'Dark theme'}
        </Button>
      </nav>
      <main className='min-w-0 flex-1 space-y-10'>
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

        <Section id='shared' title='Host and agent call sites (same under every option)'>
          {guide.shared.map((site) => (
            <div key={site.sketch.file} className='space-y-2'>
              <h4 className='text-sm font-medium'>
                <Badge variant='secondary' className='mr-2'>
                  {site.audience}
                </Badge>
                {site.title}
              </h4>
              <Code sketch={site.sketch} evidence={guide.evidence} />
              {site.notes ? <Bullets items={site.notes} /> : undefined}
            </div>
          ))}
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
                  <TableRow key={failure.code}>
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
            <Card key={question.id}>
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
  );
}

/** Mount a guide into `#root`. */
export const mountApiGuide = (guide: ApiGuide): void => {
  createRoot(document.querySelector('#root')!).render(<Guide guide={guide} />);
};
