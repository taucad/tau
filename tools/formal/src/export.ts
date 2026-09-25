import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Outcome } from '#expected.js';
import type { CoveringSuite, SpecGraph, SpecView } from '#graph.js';
import { buildSpecGraph, coveringSuite, serializeGraph, serializeSuite } from '#graph.js';
import { runTlcCase } from '#tlc.js';
import type { FormalContext, LocatedTools } from '#toolchain.js';
import { cacheDirectory } from '#toolchain.js';

/** The variables a module declares (`VARIABLE` or `VARIABLES`, comments stripped). */
export const moduleVariables = (tla: string): string[] => {
  const block = /^VARIABLES?\s+([\S\s]*?)(?=\n\s*\n|\n\S)/m.exec(tla)?.[1] ?? '';
  return block
    .split('\n')
    .map((line) => line.replace(/\\\*.*$/, ''))
    .join(' ')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
};

/**
 * The generated export wrapper (replaces S6's hand-written `TurnProtocolGraph.tla`): an
 * ACTION_CONSTRAINT that appends every transition TLC generates to `FORMAL_EDGES` as one NDJSON line.
 */
export const exportWrapper = (module: string, variables: readonly string[]): string => {
  const record = (prime: string): string => `[${variables.map((name) => `${name} |-> ${name}${prime}`).join(', ')}]`;
  return [
    '---- MODULE FormalExport ----',
    `EXTENDS ${module}, IOUtils`,
    `FormalEdge == Serialize(<<<<${record('')}, ${record("'")}>>>>, IOEnv.FORMAL_EDGES,`,
    '  [format |-> "NDJSON", charset |-> "UTF-8", openOptions |-> <<"WRITE", "CREATE", "APPEND">>])',
    '====',
    '',
  ].join('\n');
};

export type GraphExport = {
  readonly outcome: Outcome;
  readonly graph?: SpecGraph;
  readonly suite?: CoveringSuite;
  readonly seconds: number;
};

/** Runs a module's export configuration and builds its canonical graph and covering suite. */
export const exportGraph = async (
  context: FormalContext,
  run: {
    readonly tools: Required<Pick<LocatedTools, 'java' | 'tlc'>>;
    readonly directory: string;
    readonly module: string;
    readonly config: string;
    readonly phase: string;
    readonly action?: string;
  },
): Promise<GraphExport> => {
  const work = mkdtempSync(path.join(cacheDirectory(context), 'export-'));
  try {
    for (const file of readdirSync(run.directory).filter((entry) => entry.endsWith('.tla'))) {
      copyFileSync(path.join(run.directory, file), path.join(work, file));
    }
    const variables = moduleVariables(readFileSync(path.join(run.directory, `${run.module}.tla`), 'utf8'));
    writeFileSync(path.join(work, 'FormalExport.tla'), exportWrapper(run.module, variables));
    writeFileSync(
      path.join(work, 'FormalExport.cfg'),
      `${readFileSync(path.join(run.directory, run.config), 'utf8')}\nACTION_CONSTRAINT FormalEdge\n`,
    );
    const edges = path.join(work, 'edges.ndjson');
    const { outcome, result } = await runTlcCase(context, {
      tools: run.tools,
      directory: work,
      module: 'FormalExport.tla',
      config: 'FormalExport.cfg',
      env: { ...context.env, FORMAL_EDGES: edges }, // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      timeoutSeconds: 300,
      workers: 1,
    });
    if (outcome !== 'pass' || !existsSync(edges)) {
      return {
        outcome: outcome === 'pass' ? { error: 'the export wrote no edges' } : outcome,
        seconds: result.seconds,
      };
    }
    const pairs = readFileSync(edges, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => JSON.parse(line) as readonly [SpecView, SpecView]);
    const graph = buildSpecGraph(pairs, run.action ?? 'act');
    return { outcome, graph, suite: coveringSuite(graph, run.phase), seconds: result.seconds };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};

/** Committed file → freshly generated text, for staleness checks and `formal update`. */
export const generatedFiles = (directory: string, module: string, exported: GraphExport): Record<string, string> =>
  exported.graph && exported.suite
    ? {
        [path.join(directory, module, 'graph.json')]: serializeGraph(exported.graph),
        [path.join(directory, module, 'suite.json')]: serializeSuite(exported.suite),
      }
    : {};

/** The committed files that differ from their regenerated text. */
export const staleFiles = (files: Readonly<Record<string, string>>): string[] =>
  Object.entries(files)
    .filter(([file, text]) => !existsSync(file) || readFileSync(file, 'utf8') !== text)
    .map(([file]) => file);

/**
 * The generated simulation wrapper (replaces S6's `TurnProtocolTraces.tla`): each simulated
 * behaviour that reaches `Quiescent` is appended to `FORMAL_TRACES` as one NDJSON line.
 */
export const simulationWrapper = (module: string): string =>
  [
    '---- MODULE FormalSimulate ----',
    `EXTENDS ${module}, TLCExt, IOUtils`,
    'FormalTrace == Quiescent => Serialize(<<Trace>>, IOEnv.FORMAL_TRACES,',
    '  [format |-> "NDJSON", charset |-> "UTF-8", openOptions |-> <<"WRITE", "CREATE", "APPEND">>])',
    '====',
    '',
  ].join('\n');

/**
 * Nightly: TLC random simulation of a module's export configuration from `seed`, for forward
 * replay beyond the covering suite (S6 caught its retry-limit mutant this way). The module must
 * define `Quiescent`. Returns the behaviours that reached quiescence.
 */
export const simulateBehaviours = async (
  context: FormalContext,
  run: {
    readonly tools: Required<Pick<LocatedTools, 'java' | 'tlc'>>;
    readonly directory: string;
    readonly module: string;
    readonly config: string;
    readonly seed: number;
    readonly traces: number;
    readonly depth: number;
  },
): Promise<{ readonly outcome: Outcome; readonly behaviours: SpecView[][]; readonly seconds: number }> => {
  const work = mkdtempSync(path.join(cacheDirectory(context), 'simulate-'));
  try {
    for (const file of readdirSync(run.directory).filter((entry) => entry.endsWith('.tla'))) {
      copyFileSync(path.join(run.directory, file), path.join(work, file));
    }
    writeFileSync(path.join(work, 'FormalSimulate.tla'), simulationWrapper(run.module));
    writeFileSync(
      path.join(work, 'FormalSimulate.cfg'),
      `${readFileSync(path.join(run.directory, run.config), 'utf8')}\nINVARIANT FormalTrace\n`,
    );
    const traces = path.join(work, 'traces.ndjson');
    const { outcome, result } = await runTlcCase(context, {
      tools: run.tools,
      directory: work,
      module: 'FormalSimulate.tla',
      config: 'FormalSimulate.cfg',
      env: { ...context.env, FORMAL_TRACES: traces }, // eslint-disable-line @typescript-eslint/naming-convention -- environment variable
      timeoutSeconds: 900,
      workers: 1,
      extra: ['-simulate', `num=${run.traces}`, '-depth', String(run.depth), '-seed', String(run.seed), '-deadlock'],
    });
    const behaviours = existsSync(traces)
      ? readFileSync(traces, 'utf8')
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => JSON.parse(line) as SpecView[])
      : [];
    return { outcome, behaviours, seconds: result.seconds };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
};
