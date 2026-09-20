#!/usr/bin/env node
// Type-checks an API design guide's sketch files and records the evidence the guide renders.
//
// Usage (from the Tau root):
//   node .agents/skills/create-ts-api/scripts/check-design.mjs <guide-dir> --project <workspace-project-dir>
//
//   <guide-dir>  directory holding `design/**/*.ts` (under docs/research/artifacts/<subject>/api)
//   --project    workspace project whose dependencies the sketches may import (for example
//                packages/plugins/middleware). Bare imports resolve as if the sketch lived in
//                that project's `src/`, so a sketch in Tau Brain compiles against real Tau types.
//
// Writes <guide-dir>/design/evidence.json: compiler version, per-file diagnostics, and the inferred
// type at every `// ^?` marker. Exits 1 on any diagnostic: a design that does not compile is not
// reviewable. Expected misuse is written with `// @ts-expect-error`, which fails when it stops erroring.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

const [guideArgument, ...rest] = process.argv.slice(2);
const projectFlag = rest.indexOf('--project');
if (!guideArgument || projectFlag < 0 || !rest[projectFlag + 1]) {
  console.error('usage: check-design.mjs <guide-dir> --project <workspace-project-dir>');
  process.exit(2);
}
const guideDirectory = fs.realpathSync(path.resolve(guideArgument));
const designDirectory = path.join(guideDirectory, 'design');
const projectDirectory = fs.realpathSync(path.resolve(rest[projectFlag + 1]));
const resolutionAnchor = path.join(projectDirectory, 'src', '__api_design__.ts');

const walk = (directory) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : /\.tsx?$/.test(entry.name) ? [entryPath] : [];
  });
const files = walk(designDirectory);
if (files.length === 0) {
  console.error(`no sketch files under ${designDirectory}`);
  process.exit(2);
}

const options = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  strict: true,
  noUncheckedIndexedAccess: true,
  noPropertyAccessFromIndexSignature: true,
  exactOptionalPropertyTypes: false,
  verbatimModuleSyntax: true,
  skipLibCheck: true,
  noEmit: true,
  lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
  types: [],
};

const host = ts.createCompilerHost(options);
// Relative imports resolve from the sketch; bare imports resolve from the chosen workspace project.
host.resolveModuleNameLiterals = (literals, containingFile, redirected, compilerOptions) =>
  literals.map((literal) => {
    const inDesign = containingFile.startsWith(designDirectory);
    const from = inDesign && !literal.text.startsWith('.') ? resolutionAnchor : containingFile;
    return ts.resolveModuleName(literal.text, from, compilerOptions, host, undefined, redirected);
  });

const program = ts.createProgram(files, options, host);
const checker = program.getTypeChecker();
const evidence = { typescript: ts.version, project: path.relative(process.cwd(), projectDirectory), files: {} };
let failures = 0;

for (const file of files) {
  const source = program.getSourceFile(file);
  const relative = path.relative(guideDirectory, file);
  const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)].map(
    (diagnostic) => ({
      line: source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1,
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }),
  );
  failures += diagnostics.length;

  // `//   ^?` asks for the type of the token above the caret, as twoslash does.
  const lines = source.text.split('\n');
  const queries = [];
  lines.forEach((text, index) => {
    const caret = /^\s*\/\/\s*\^\?/.exec(text);
    if (!caret || index === 0) {
      return;
    }
    const column = text.indexOf('^');
    const position = source.getPositionOfLineAndCharacter(index - 1, Math.min(column, lines[index - 1].length - 1));
    const findToken = (node) =>
      ts.forEachChild(node, (child) =>
        child.getStart() <= position && position < child.getEnd() ? (findToken(child) ?? child) : undefined,
      );
    const token = findToken(source);
    if (!token) {
      queries.push({ line: index + 1, type: '(no token under the caret)' });
      failures += 1;
      return;
    }
    const type = checker.getTypeAtLocation(token);
    queries.push({
      line: index + 1,
      token: token.getText(),
      type: checker.typeToString(type, token, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias),
    });
  });
  evidence.files[relative] = { diagnostics, queries };
}

fs.writeFileSync(path.join(designDirectory, 'evidence.json'), `${JSON.stringify(evidence, undefined, 2)}\n`);
for (const [file, { diagnostics, queries }] of Object.entries(evidence.files)) {
  console.log(`${diagnostics.length === 0 ? 'ok  ' : 'FAIL'} ${file} (${queries.length} type queries)`);
  for (const diagnostic of diagnostics) {
    console.log(`     ${file}:${diagnostic.line} TS${diagnostic.code} ${diagnostic.message}`);
  }
}
process.exit(failures === 0 ? 0 : 1);
