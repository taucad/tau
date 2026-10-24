/**
 * Structured evidence and policy-log classification for first-use download qualification.
 * Usage: node first-use-evidence.mts cell|summary|policy <arguments>
 * Requires Node 24; exits non-zero on malformed evidence or a failed qualification.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Cell = { name: string; verdict: 'PASS' | 'FAIL' | 'UNOBSERVABLE'; detail: string };
const expectedCells = ['facts', 'download', 'quarantine', 'ready', 'syspolicy', 'negative', 'golden'];

export const appendCell = (path: string, cell: Cell): void => {
  appendFileSync(path, `${JSON.stringify(cell)}\n`);
};

export const summarize = (directory: string): Cell[] => {
  const cells = readFileSync(`${directory}/cells.jsonl`, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Cell);
  for (const name of expectedCells) {
    if (!cells.some((cell) => cell.name === name)) {
      cells.push({ name, verdict: 'FAIL', detail: 'Not completed; inspect harness-error.txt and command stderr.' });
    }
  }
  writeFileSync(`${directory}/cells.json`, `${JSON.stringify(cells, undefined, 2)}\n`);
  const escape = (text: string): string => text.replaceAll('|', String.raw`\|`).replaceAll(/\r?\n/gu, '<br>');
  writeFileSync(
    `${directory}/summary.md`,
    [
      '| Cell | Verdict | Detail |',
      '| --- | --- | --- |',
      ...cells.map(({ name, verdict, detail }) => `| ${name} | ${verdict} | ${escape(detail)} |`),
      '',
    ].join('\n'),
  );
  return cells;
};

/** Ignore service plumbing, never an actual alert or refusal; unexplained UI alerts fail closed. */
export const policyEvidence = (input: {
  log: string;
  samples: string;
  app: string;
  store: string;
}): { pids: string[]; relevant: string[]; failures: string[]; uiAlerts: string[] } => {
  const pids = new Set<string>();
  for (const match of input.samples.matchAll(/pid (\d+) parent (\d+)/gu)) {
    for (const pid of [match[1]!, match[2]!]) {
      if (Number(pid) > 1) {
        pids.add(pid);
      }
    }
  }
  const pidPattern = pids.size > 0 ? new RegExp(`(?:pid[ =:]+|\\[)(?:${[...pids].join('|')})(?!\\d)`, 'u') : undefined;
  const lines = input.log.split('\n').filter(Boolean);
  const relevant = lines.filter(
    (line) => line.includes(input.app) || line.includes(input.store) || pidPattern?.test(line),
  );
  const refusal = /\b(?:denied|deny|reject(?:ed)?|blocked|not allowed|user override)\b/iu;
  const alert = /(?:_NSAlertPanel|\b(?:display|show|present)(?:ing|ed)?\b.*\b(?:alert|prompt)\b)/iu;
  const failures = relevant.filter((line) => refusal.test(line) || alert.test(line));
  const uiAlerts = lines.filter((line) => /(?:^| )CoreServicesUIAgent\[/u.test(line) && alert.test(line));
  return { pids: [...pids], relevant, failures, uiAlerts };
};

const annotateCells = (cells: Cell[]): void => {
  for (const cell of cells) {
    const detail = cell.detail.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
    console.log(
      `::${cell.verdict === 'FAIL' ? 'error' : 'notice'} title=First-use ${cell.name}::${detail.slice(0, 3800)}`,
    );
  }
};

const main = (): void => {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'cell': {
      const [path, name, verdict, detail] = args;
      if (!path || !name || detail === undefined || !['PASS', 'FAIL', 'UNOBSERVABLE'].includes(verdict ?? '')) {
        throw new Error('cell requires path, name, verdict and detail');
      }
      appendCell(path, { name, verdict: verdict as Cell['verdict'], detail });
      break;
    }
    case 'summary': {
      const [directory, annotate] = args;
      if (!directory) {
        throw new Error('summary requires output directory');
      }
      const cells = summarize(directory);
      if (annotate === '1') {
        annotateCells(cells);
      }
      if (cells.some((cell) => cell.verdict === 'FAIL')) {
        process.exitCode = 1;
      }
      break;
    }
    case 'policy': {
      const [directory, app, store, logStatus] = args;
      if (!directory || !app || !store) {
        throw new Error('policy requires directory, app and store');
      }
      const evidence = policyEvidence({
        log: readFileSync(`${directory}/syspolicy-log.txt`, 'utf8'),
        samples: ['build123d', 'picogk']
          .map((kernel) => readFileSync(`${directory}/ps-${kernel}.txt`, 'utf8'))
          .join('\n'),
        app,
        store,
      });
      writeFileSync(`${directory}/syspolicy-excerpt.txt`, `${evidence.relevant.join('\n')}\n`);
      writeFileSync(`${directory}/syspolicy-classification.json`, `${JSON.stringify(evidence, undefined, 2)}\n`);
      const pass =
        logStatus === '0' &&
        evidence.pids.length > 0 &&
        evidence.failures.length === 0 &&
        evidence.uiAlerts.length === 0;
      const detail = `log exit ${logStatus}; scoped PIDs ${evidence.pids.join(', ')}; ${evidence.relevant.length} attributed lines; ${evidence.failures.length} attributed refusals/alerts; ${evidence.uiAlerts.length} UI alerts (including unattributed alerts)`;
      appendCell(`${directory}/cells.jsonl`, { name: 'syspolicy', verdict: pass ? 'PASS' : 'FAIL', detail });
      console.log(`${pass ? 'PASS' : 'FAIL'} syspolicy: ${detail}`);
      break;
    }
    default: {
      throw new Error('Expected cell, summary or policy command');
    }
  }
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
