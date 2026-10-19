/**
 * The example suites that are executable contracts: published examples agents
 * copy, so every row must decide on the workspace harness. `test-geospec` runs
 * each one through the installed `geospec` CLI (`test-geospec.mts`), and
 * `geospec-contracts.test.ts` checks statically that every matcher outside
 * GeoSpec's mesh-evidence set reads a `format: 'step'` load.
 *
 * GeoSpec's ceilings leave some rows undecided today; those are pinned below by
 * name and refusal code, so the run still names any other row that does not pass.
 *
 * @module
 */
import { geoSpecMeshEvidenceMatchers } from 'geospec/model';
import ts from 'typescript';

/**
 * A contract example: its directory relative to `src/kernels/`, and the rows the
 * current harness cannot decide, each pinned to the one diagnostic code that
 * refuses it. Every other row must pass. A pin stays only while its row stays
 * undecided for that reason, so the gate notices both a regression and a fix.
 */
export type GeoSpecContractExample = {
  readonly example: string;
  readonly undecided: Readonly<Record<string, string>>;
};

/** The contract examples. */
export const geoSpecContractExamples: readonly GeoSpecContractExample[] = [
  {
    example: 'replicad/planetary-gear-system',
    undecided: {
      // The assembly's continuous interference evidence (35.6 MiB) exceeds the engine's 32 MiB analysis limit.
      'has no gear or hardware interference': 'GEOSPEC_ANALYSIS_LIMIT',
      'preserves clearance with a wider face and advanced input angle': 'GEOSPEC_ANALYSIS_LIMIT',
      'clears intermediate tooth contact phases': 'GEOSPEC_ANALYSIS_LIMIT',
      // The thrust-spacer clearance trims and the carrier bores are outside the qualified BRep domains.
      'dimensions the removable bearing and thrust hardware': 'GEOSPEC_UNSUPPORTED_EVIDENCE',
      'has the mounting pattern and cylindrical shaft and bearing interfaces': 'GEOSPEC_UNSUPPORTED_EVIDENCE',
    },
  },
];

/** One test row of a `geospec run --json` report. */
export type GeoSpecReportRow = {
  readonly file: string;
  readonly suite: readonly string[];
  readonly name: string;
  readonly status: string;
  readonly codes: readonly string[];
};

/**
 * Compare a contract example's report rows with its contract.
 *
 * @param contract - The example and its pinned undecided rows.
 * @param rows - Every test row the run reported.
 * @returns One line per row that breaks the contract, and per pin that matched no row.
 */
export const contractBreaks = (contract: GeoSpecContractExample, rows: readonly GeoSpecReportRow[]): string[] => {
  const breaks: string[] = rows.length === 0 ? [`${contract.example}: the run reported no rows`] : [];
  const pinned = new Set(Object.keys(contract.undecided));
  for (const row of rows) {
    const label = [row.file, ...row.suite, row.name].join(' > ');
    const pin = contract.undecided[row.name];
    pinned.delete(row.name);
    const codes = row.codes.length > 0 ? ` (${[...new Set(row.codes)].join(', ')})` : '';
    if (pin === undefined) {
      if (row.status !== 'passed') {
        breaks.push(`${label}: ${row.status}${codes}`);
      }
    } else if (row.status === 'passed') {
      breaks.push(`${label}: passed; remove its undecided pin (${pin})`);
    } else if (row.status === 'failed' || row.codes.length === 0 || !row.codes.every((code) => code === pin)) {
      breaks.push(`${label}: ${row.status}${codes}, pinned undecided by ${pin}`);
    }
  }
  for (const name of pinned) {
    breaks.push(`${contract.example}: pinned row "${name}" was not reported`);
  }
  return breaks;
};

const meshMatchers = new Set<string>(geoSpecMeshEvidenceMatchers);
const stepFormats = new Set(['step', 'stp']);

const unwrap = (node: ts.Expression): ts.Expression => {
  let current = node;
  while (ts.isAwaitExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
};

const isLoadModelCall = (node: ts.Expression): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'loadModel';

/** The `const name = …` initializer that binds `identifier` in an enclosing block, nearest first. */
const bindingOf = (identifier: ts.Identifier): ts.Expression | undefined => {
  // `parent` is typed non-null, but a source file has none: the walk stops there.
  for (let scope: ts.Node = identifier.parent; ; scope = scope.parent) {
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) {
      continue;
    }
    for (const statement of scope.statements) {
      if (!ts.isVariableStatement(statement) || statement.pos > identifier.pos) {
        continue;
      }
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === identifier.text) {
          return declaration.initializer;
        }
      }
    }
    if (ts.isSourceFile(scope)) {
      return undefined;
    }
  }
};

const loadsStep = (load: ts.CallExpression): boolean => {
  const [options] = load.arguments;
  if (!options || !ts.isObjectLiteralExpression(options)) {
    return false;
  }
  return options.properties.some(
    (property) =>
      ts.isPropertyAssignment(property) &&
      property.name.getText() === 'format' &&
      ts.isStringLiteralLike(property.initializer) &&
      stepFormats.has(property.initializer.text),
  );
};

/**
 * Find each `expectGeo(subject).<matcher>()` whose matcher needs exact BRep (it is
 * outside `geoSpecMeshEvidenceMatchers`) and whose subject is not traceable to a
 * `loadModel({ …, format: 'step' })` call.
 *
 * @param fileName - The suite path, used in each finding.
 * @param source - The suite's TypeScript source.
 * @returns One `file:line` finding per offending load (or untraceable subject), in source order.
 */
export const findMeshLoadsFeedingBrepMatchers = (fileName: string, source: string): string[] => {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const findings = new Map<number, string>();
  const lineOf = (node: ts.Node): number => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'expectGeo') {
      let access: ts.Node = node.parent;
      let matcher: string | undefined;
      while (ts.isPropertyAccessExpression(access)) {
        matcher = access.name.text;
        access = access.parent;
      }
      const [subject] = node.arguments;
      if (matcher && subject && !meshMatchers.has(matcher)) {
        let traced: ts.Expression | undefined = unwrap(subject);
        if (ts.isIdentifier(traced)) {
          const initializer = bindingOf(traced);
          traced = initializer && unwrap(initializer);
        }
        if (traced && isLoadModelCall(traced)) {
          if (!loadsStep(traced)) {
            const line = lineOf(traced);
            findings.set(
              line,
              findings.get(line) ?? `${fileName}:${line} loadModel feeds ${matcher}() without format: 'step'`,
            );
          }
        } else {
          const line = lineOf(node);
          findings.set(
            line,
            findings.get(line) ?? `${fileName}:${line} ${matcher}() subject is not traceable to a loadModel call`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return [...findings.entries()].sort(([left], [right]) => left - right).map(([, finding]) => finding);
};
