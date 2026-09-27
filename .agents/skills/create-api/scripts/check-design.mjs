#!/usr/bin/env node
// Type-checks an API design guide's sketch files and records the evidence the guide renders.
//
// Usage (from the Tau root):
//   node .agents/skills/create-api/scripts/check-design.mjs <guide-dir> --project <workspace-project-dir>
//
//   <guide-dir>  directory holding `design/**/*.ts` (under docs/research/artifacts/<subject>/api)
//   --project    workspace project whose dependencies the sketches may import (for example
//                packages/plugins/middleware). Bare imports resolve as if the sketch lived in
//                that project's `src/`, so a sketch in Tau Brain compiles against real Tau types.
//   --dotnet     the `dotnet` executable for C# sketches (default: `dotnet` on PATH)
//   --reference  an assembly C# sketches may use (repeatable), such as the kernel's PicoGK.dll
//
// Writes <guide-dir>/design/evidence.json: compiler versions, per-file diagnostics, and the inferred
// type at every `// ^?` marker. Exits 1 on any diagnostic: a design that does not compile is not
// reviewable. Expected misuse is written with `// @ts-expect-error`, which fails when it stops erroring.
// `design/**/*.cs` compile as one C# program (at most one file with top-level statements), with
// nullable references and warnings as errors; expected misuse is a `// expect-error CSxxxx` line,
// which fails unless the next line raises that error. `design/**/*.kcl` parse and run with Zoo's
// kcl-wasm-lib against a mock engine (no Zoo connection): each directory's `main.kcl` runs with its
// siblings importable, or every file runs when there is no `main.kcl`; parse issues, warnings and a
// failed run are diagnostics.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

const [guideArgument, ...rest] = process.argv.slice(2);
const projectFlag = rest.indexOf('--project');
if (!guideArgument || projectFlag < 0 || !rest[projectFlag + 1]) {
  console.error(
    'usage: check-design.mjs <guide-dir> --project <workspace-project-dir> [--dotnet <path>] [--reference <dll>]...',
  );
  process.exit(2);
}
const flagValues = (flag) => rest.flatMap((value, index) => (rest[index - 1] === flag ? [value] : []));
const dotnet = flagValues('--dotnet')[0] ?? 'dotnet';
const references = flagValues('--reference').map((reference) => fs.realpathSync(path.resolve(reference)));
const guideDirectory = fs.realpathSync(path.resolve(guideArgument));
const designDirectory = path.join(guideDirectory, 'design');
const projectDirectory = fs.realpathSync(path.resolve(rest[projectFlag + 1]));
const resolutionAnchor = path.join(projectDirectory, 'src', '__api_design__.ts');

const walk = (directory, pattern) =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath, pattern) : pattern.test(entry.name) ? [entryPath] : [];
  });
const files = walk(designDirectory, /\.tsx?$/);
const csharpFiles = walk(designDirectory, /\.cs$/);
const kclFiles = walk(designDirectory, /\.kcl$/);
if (files.length + csharpFiles.length + kclFiles.length === 0) {
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
  // `.tsx` sketches (a component's call site) resolve `react/jsx-runtime` from the --project.
  jsx: ts.JsxEmit.ReactJSX,
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

// C#: one SDK-style project in the install-coupled cache, compiling the sketches in place.
if (csharpFiles.length > 0) {
  const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
  const buildDirectory = path.join(
    process.cwd(),
    'node_modules/.cache/check-design',
    createHash('sha256').update(guideDirectory).digest('hex').slice(0, 16),
  );
  fs.mkdirSync(buildDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(buildDirectory, 'Sketches.csproj'),
    `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
    <LangVersion>latest</LangVersion>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <EnableDefaultCompileItems>false</EnableDefaultCompileItems>
  </PropertyGroup>
  <ItemGroup>
${csharpFiles.map((file) => `    <Compile Include="${escape(file)}" />`).join('\n')}
${references.map((reference) => `    <Reference Include="${escape(path.basename(reference, '.dll'))}" HintPath="${escape(reference)}" />`).join('\n')}
  </ItemGroup>
</Project>
`,
  );
  const version = spawnSync(dotnet, ['--version'], { encoding: 'utf8' }).stdout.trim();
  const build = spawnSync(dotnet, ['build', buildDirectory, '-nologo', '-v', 'quiet', '-clp:NoSummary'], {
    encoding: 'utf8',
  });
  if (build.error) {
    console.error(`dotnet: ${build.error.message}`);
    process.exit(2);
  }
  evidence.dotnet = version;
  // `path(line,col): error CS1503: message [project]`, reported once per file, line and code.
  const reported = new Map();
  for (const match of `${build.stdout}${build.stderr}`.matchAll(
    /^(.+?\.cs)\((\d+),\d+\): (?:error|warning) (\w+): (.*?)(?: \[.*])?$/gm,
  )) {
    reported.set(`${match[1]}:${match[2]}:${match[3]}`, {
      file: match[1],
      line: Number(match[2]),
      code: match[3],
      message: match[4],
    });
  }
  if (build.status !== 0 && reported.size === 0) {
    console.error(`dotnet build failed without compiler diagnostics:\n${build.stdout}${build.stderr}`);
    process.exit(2);
  }
  for (const file of csharpFiles) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    const expected = lines.flatMap((text, index) => {
      const marker = /^\s*\/\/\s*expect-error\s+(CS\d+)/.exec(text);
      return marker ? [{ line: index + 2, code: marker[1] }] : [];
    });
    const raised = [...reported.values()].filter((diagnostic) => diagnostic.file === file);
    const diagnostics = [
      ...raised
        .filter(
          (diagnostic) =>
            !expected.some(
              (expectation) => expectation.line === diagnostic.line && expectation.code === diagnostic.code,
            ),
        )
        .map(({ line, code, message }) => ({ line, code, message })),
      ...expected
        .filter(
          (expectation) =>
            !raised.some((diagnostic) => diagnostic.line === expectation.line && diagnostic.code === expectation.code),
        )
        .map(({ line, code }) => ({
          line: line - 1,
          code,
          message: `Unused 'expect-error ${code}': the next line no longer raises it.`,
        })),
    ];
    failures += diagnostics.length;
    evidence.files[path.relative(guideDirectory, file)] = { diagnostics, queries: [] };
  }
}

// KCL: parse every file and run each directory's entry against a mock engine.
if (kclFiles.length > 0) {
  const kclPackage = path.dirname(require.resolve('@taucad/kcl-wasm-lib'));
  const kcl = await import(pathToFileURL(path.join(kclPackage, 'kcl_wasm_lib.js')).href);
  await kcl.default({ module_or_path: fs.readFileSync(path.join(kclPackage, 'kcl_wasm_lib_bg.wasm')) });
  evidence.kcl = kcl.get_kcl_version();
  const lineOf = (file, offset) => fs.readFileSync(file, 'utf8').slice(0, offset).split('\n').length;
  const reportedKcl = new Map(kclFiles.map((file) => [file, []]));
  const engine = {
    fireModelingCommandFromWasm: () => {
      throw new Error('mock engine');
    },
    sendModelingCommandFromWasm: async () => {
      throw new Error('mock engine');
    },
    startNewSession: async () => {},
  };
  for (const directory of new Set(kclFiles.map((file) => path.dirname(file)))) {
    const siblings = kclFiles.filter((file) => path.dirname(file) === directory);
    const within = (file) => path.resolve(directory, path.relative(directory, path.resolve(directory, file)));
    const files = {
      readFile: async (file) => fs.readFileSync(within(file)),
      exists: async (file) => siblings.includes(within(file)),
      getAllFiles: async () => JSON.stringify(siblings),
    };
    const programs = new Map();
    for (const file of siblings) {
      const [program, issues] = kcl.parse_wasm(fs.readFileSync(file, 'utf8'));
      programs.set(file, program);
      for (const issue of issues) {
        reportedKcl.get(file).push({
          line: lineOf(file, issue.sourceRange?.[0] ?? 0),
          code: `KCL ${issue.severity}`,
          message: issue.message,
        });
      }
    }
    const main = siblings.find((file) => path.basename(file) === 'main.kcl');
    for (const entry of main ? [main] : siblings) {
      try {
        const run = await new kcl.Context(engine, files).executeMock(
          JSON.stringify(programs.get(entry)),
          entry,
          '{}',
          false,
        );
        for (const issue of run.issues ?? []) {
          reportedKcl.get(entry).push({
            line: lineOf(entry, issue.sourceRange?.[0] ?? 0),
            code: `KCL ${issue.severity}`,
            message: issue.message,
          });
        }
      } catch (error) {
        const details = error?.error?.details ?? {};
        const [start = 0, , moduleId = 0] = details.sourceRanges?.[0] ?? [];
        const file = moduleId === 0 ? entry : within(error?.filenames?.[moduleId]?.value ?? entry);
        (reportedKcl.get(file) ?? reportedKcl.get(entry)).push({
          line: lineOf(file, start),
          code: `KCL ${error?.error?.kind ?? 'error'}`,
          message: details.msg ?? String(error),
        });
      }
    }
  }
  for (const [file, diagnostics] of reportedKcl) {
    failures += diagnostics.length;
    evidence.files[path.relative(guideDirectory, file)] = { diagnostics, queries: [] };
  }
}

fs.writeFileSync(path.join(designDirectory, 'evidence.json'), `${JSON.stringify(evidence, undefined, 2)}\n`);
for (const [file, { diagnostics, queries }] of Object.entries(evidence.files)) {
  console.log(`${diagnostics.length === 0 ? 'ok  ' : 'FAIL'} ${file} (${queries.length} type queries)`);
  for (const diagnostic of diagnostics) {
    const code = typeof diagnostic.code === 'number' ? `TS${diagnostic.code}` : diagnostic.code;
    console.log(`     ${file}:${diagnostic.line} ${code} ${diagnostic.message}`);
  }
}
process.exit(failures === 0 ? 0 : 1);
