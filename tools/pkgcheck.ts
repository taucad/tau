// oxlint-disable unicorn/no-process-exit -- CLI tool
/**
 * Package Check Orchestrator
 *
 * Validates that a publishable package is ready for npm publication by running
 * a suite of checks: publint, attw (are-the-types-wrong), and madge (circular deps).
 *
 * Usage: tsx tools/pkgcheck.ts <projectRoot>
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

type CheckResult = {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  details?: string[];
};

type PackageJson = Record<string, unknown> & {
  name?: string;
  publishConfig?: Record<string, unknown>;
  'size-limit'?: unknown;
};

const projectRoot = process.argv[2];
if (!projectRoot) {
  console.error('Usage: tsx tools/pkgcheck.ts <projectRoot>');
  process.exit(1);
}

const absoluteRoot = resolve(projectRoot);
const packageJsonPath = join(absoluteRoot, 'package.json');

if (!existsSync(packageJsonPath)) {
  console.error(`No package.json found at ${packageJsonPath}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson;
const packageName = packageJson.name ?? projectRoot;

console.log(`\n${packageName} package check`);
console.log('='.repeat(`${packageName} package check`.length));
console.log();

const results: CheckResult[] = [];

async function runPublint(): Promise<CheckResult> {
  try {
    const { publint } = await import('publint');
    const { formatMessage } = await import('publint/utils');

    const { messages, pkg } = await publint({
      pkgDir: absoluteRoot,
      level: 'warning',
    });

    if (messages.length === 0) {
      return {
        name: 'publint',
        status: 'pass',
        details: ['package structure valid'],
      };
    }

    const formatted = messages
      .map((message) => formatMessage(message, pkg))
      .filter((m): m is string => m !== undefined);
    return {
      name: 'publint',
      status: 'fail',
      details: [`${String(messages.length)} issue(s) found`, ...formatted],
    };
  } catch (error) {
    return {
      name: 'publint',
      status: 'fail',
      details: [`error running publint: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Apply publishConfig overrides to a package.json object, the same way
 * `npm publish` / `pnpm publish` does at publish time.
 */
function applyPublishConfig(package_: PackageJson): PackageJson {
  const result = { ...package_ };
  const { publishConfig } = package_;
  if (!publishConfig) {
    return result;
  }

  for (const [key, value] of Object.entries(publishConfig)) {
    if (key === 'access' || key === 'registry' || key === 'tag') {
      continue;
    }

    result[key] = value;
  }

  delete result.publishConfig;
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateEsmOnlyPackageMetadata(): CheckResult {
  const publishPackage = applyPublishConfig(packageJson);
  const issues: string[] = [];

  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        visit(item, `${path}[${String(index)}]`);
      }
      return;
    }

    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        const nextPath = `${path}.${key}`;
        if (key === 'require') {
          issues.push(`${nextPath}: CommonJS export conditions are not allowed`);
        }
        if (path === '$' && key === 'module') {
          issues.push(`${nextPath}: legacy package.json module field is not allowed`);
        }
        visit(child, nextPath);
      }
      return;
    }

    if (typeof value !== 'string') {
      return;
    }

    if (value.includes('dist/cjs')) {
      issues.push(`${path}: CJS dist path is not allowed (${value})`);
    }
    if (value.includes('.cjs')) {
      issues.push(`${path}: .cjs output is not allowed (${value})`);
    }
    if (value.includes('.d.cts')) {
      issues.push(`${path}: .d.cts declarations are not allowed (${value})`);
    }
  }

  visit(publishPackage, '$');

  if (issues.length === 0) {
    return {
      name: 'tau-esm-metadata',
      status: 'pass',
      details: ['published metadata is ESM-only'],
    };
  }

  return {
    name: 'tau-esm-metadata',
    status: 'fail',
    details: [`${String(issues.length)} CJS metadata issue(s) found`, ...issues],
  };
}

function validateFlatDistLayout(): CheckResult {
  const publishPackage = applyPublishConfig(packageJson);
  const issues: string[] = [];

  function visit(value: unknown, path: string): void {
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        visit(item, `${path}[${String(index)}]`);
      }
      return;
    }

    if (isRecord(value)) {
      for (const [key, child] of Object.entries(value)) {
        visit(child, `${path}.${key}`);
      }
      return;
    }

    if (typeof value === 'string' && value.includes('dist/esm')) {
      issues.push(`${path}: redundant dist/esm path is not allowed (${value}); use dist/...`);
    }
  }

  visit(publishPackage, '$');

  const tsdownConfigPath = join(absoluteRoot, 'tsdown.config.ts');
  if (existsSync(tsdownConfigPath)) {
    const source = readFileSync(tsdownConfigPath, 'utf8');
    if (source.includes('dist/esm')) {
      issues.push('tsdown.config.ts: redundant dist/esm output path is not allowed; use outDir: "dist"');
    }
  }

  if (issues.length === 0) {
    return {
      name: 'tau-flat-dist-layout',
      status: 'pass',
      details: ['published metadata and build config use flat dist output'],
    };
  }

  return {
    name: 'tau-flat-dist-layout',
    status: 'fail',
    details: [`${String(issues.length)} flat dist layout issue(s) found`, ...issues],
  };
}

/**
 * Create a publish-ready staging directory with publishConfig applied,
 * then pack and run attw against the tarball.
 *
 * pnpm pack does NOT apply publishConfig.exports, so we must do it manually.
 */
async function runAttw(): Promise<CheckResult> {
  const stagingDirectory = join(tmpdir(), `pkgcheck-attw-${Date.now()}`);

  try {
    mkdirSync(stagingDirectory, { recursive: true });

    const publishPackage = applyPublishConfig(packageJson);
    // This staging package contains already-built outputs, not the source files
    // that package lifecycle scripts may invoke.
    delete publishPackage.scripts;
    writeFileSync(join(stagingDirectory, 'package.json'), JSON.stringify(publishPackage, undefined, 2));

    const distributionSource = join(absoluteRoot, 'dist');
    if (existsSync(distributionSource)) {
      cpSync(distributionSource, join(stagingDirectory, 'dist'), { recursive: true });
    }

    const readmeSource = join(absoluteRoot, 'README.md');
    if (existsSync(readmeSource)) {
      cpSync(readmeSource, join(stagingDirectory, 'README.md'));
    }

    const attwConfigSource = join(absoluteRoot, '.attw.json');
    if (existsSync(attwConfigSource)) {
      cpSync(attwConfigSource, join(stagingDirectory, '.attw.json'));
    }

    const output = execSync('pnpm attw --pack . --format table --profile esm-only', {
      cwd: stagingDirectory,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return {
      name: 'attw',
      status: 'pass',
      details: ['types resolve correctly', output.trim()],
    };
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      status?: number;
    };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');
    const lines = output.split('\n').filter((line) => line.trim().length > 0);

    return {
      name: 'attw',
      status: 'fail',
      details: ['type resolution issues found', ...lines],
    };
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
}

async function runMadge(): Promise<CheckResult> {
  try {
    const madgeModule = await import('madge');
    const madge = madgeModule.default;

    const tsconfigPath = existsSync(join(absoluteRoot, 'tsconfig.lib.json'))
      ? join(absoluteRoot, 'tsconfig.lib.json')
      : join(absoluteRoot, 'tsconfig.json');

    const result = await madge(join(absoluteRoot, 'src'), {
      fileExtensions: ['ts', 'tsx', 'js', 'jsx'],
      tsConfig: tsconfigPath,
      excludeRegExp: [/\.test\./, /\.spec\./, /\/testing\//],
    });

    const circular = result.circular();

    if (circular.length === 0) {
      return {
        name: 'madge',
        status: 'pass',
        details: ['no circular dependencies'],
      };
    }

    const cycles = circular.map((cycle) => cycle.join(' → '));
    return {
      name: 'madge',
      status: 'fail',
      details: [`${String(circular.length)} circular dependency chain(s) found`, ...cycles],
    };
  } catch (error) {
    return {
      name: 'madge',
      status: 'fail',
      details: [`error running madge: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

async function runSizeLimit(): Promise<CheckResult> {
  const hasSizeLimitConfig = packageJson['size-limit'] || existsSync(join(absoluteRoot, '.size-limit.json'));
  if (!hasSizeLimitConfig) {
    return {
      name: 'size-limit',
      status: 'skip',
      details: ['no config found in package.json or .size-limit.json'],
    };
  }

  try {
    const output = execSync('pnpm size-limit', {
      cwd: absoluteRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return { name: 'size-limit', status: 'pass', details: [output.trim()] };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string };
    const output = (execError.stdout ?? '') + (execError.stderr ?? '');
    return {
      name: 'size-limit',
      status: 'fail',
      details: ['bundle size budget exceeded', output.trim()],
    };
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${String(bytes)} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} kB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

function walkDirectory(directory: string): string[] {
  const paths: string[] = [];
  if (!existsSync(directory)) {
    return paths;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      paths.push(...walkDirectory(fullPath));
    } else {
      paths.push(fullPath);
    }
  }

  return paths;
}

type ExportsMap = Record<string, Record<string, unknown> | string>;

function fileSize(relativePath: string | undefined): number {
  if (!relativePath) {
    return 0;
  }

  const fullPath = join(absoluteRoot, relativePath);
  return existsSync(fullPath) ? statSync(fullPath).size : 0;
}

function collectAssets(directory: string): Map<string, { count: number; bytes: number }> {
  const byExtension = new Map<string, { count: number; bytes: number }>();
  for (const f of walkDirectory(directory)) {
    if (/\.(js|cjs|mjs|d\.ts|d\.cts|d\.mts)$/.test(basename(f))) {
      continue;
    }

    const extension = basename(f).split('.').pop() ?? '?';
    const entry = byExtension.get(extension) ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += statSync(f).size;
    byExtension.set(extension, entry);
  }

  return byExtension;
}

function getExportTarget(value: Record<string, unknown>): { js?: string; dts?: string } {
  const directImport = value['import'];
  if (typeof directImport === 'string') {
    return {
      js: directImport,
      dts: typeof value['types'] === 'string' ? value['types'] : undefined,
    };
  }

  if (typeof value['default'] === 'string') {
    return {
      js: value['default'],
      dts: typeof value['types'] === 'string' ? value['types'] : undefined,
    };
  }

  if (isRecord(directImport)) {
    return {
      js: typeof directImport['default'] === 'string' ? directImport['default'] : undefined,
      dts: typeof directImport['types'] === 'string' ? directImport['types'] : undefined,
    };
  }

  return {
    dts: typeof value['types'] === 'string' ? value['types'] : undefined,
  };
}

type ExportRow = {
  specifier: string;
  jsBytes: number;
  dtsBytes: number;
  assets: Map<string, { count: number; bytes: number }>;
  total: number;
};

function buildExportRows(): ExportRow[] {
  const publishPackage = applyPublishConfig(packageJson);
  const exports = publishPackage['exports'] as ExportsMap | undefined;
  if (!exports) {
    return [];
  }

  const rows: ExportRow[] = [];
  for (const [specifier, value] of Object.entries(exports)) {
    if (typeof value === 'string') {
      const size = fileSize(value);
      rows.push({
        specifier,
        jsBytes: size,
        dtsBytes: 0,
        assets: new Map(),
        total: size,
      });
      continue;
    }

    const target = getExportTarget(value);
    const jsBytes = fileSize(target.js);
    const dtsBytes = fileSize(target.dts);
    const exportDirectory = target.js ? dirname(join(absoluteRoot, target.js)) : undefined;
    const isRootExport = exportDirectory === join(absoluteRoot, 'dist');
    const assets =
      exportDirectory && !isRootExport && existsSync(exportDirectory)
        ? collectAssets(exportDirectory)
        : new Map<string, { count: number; bytes: number }>();
    const assetBytes = [...assets.values()].reduce((sum, { bytes }) => sum + bytes, 0);

    rows.push({
      specifier,
      jsBytes,
      dtsBytes,
      assets,
      total: jsBytes + dtsBytes + assetBytes,
    });
  }

  return rows;
}

function formatAssetCell(bytes: number, count: number, width: number): string {
  const sizeText = formatBytes(bytes);
  return `${sizeText} (${String(count)})`.padStart(width);
}

function printExportsSummary(): void {
  const rows = buildExportRows();
  if (rows.length === 0) {
    return;
  }

  const allAssetTypes = [...new Set(rows.flatMap((r) => [...r.assets.keys()]))].sort();
  const sizeCol = 10;
  const specCol = Math.max(...rows.map((r) => r.specifier.length), 10);
  const assetColWidth = 15;

  const assetHeaders = allAssetTypes.map((extension) => `.${extension}`.padStart(assetColWidth)).join('');
  const header = `  ${'Specifier'.padEnd(specCol)}${'JS'.padStart(sizeCol)}${'Types'.padStart(sizeCol)}${assetHeaders}${'Total'.padStart(sizeCol)}`;
  const divider = '─'.repeat(header.length - 2);

  console.log('\n  Exports');
  console.log(`  ${divider}`);
  console.log(header);
  console.log(`  ${divider}`);

  for (const row of rows) {
    const assetCells = allAssetTypes
      .map((extension) => {
        const entry = row.assets.get(extension);
        return entry ? formatAssetCell(entry.bytes, entry.count, assetColWidth) : '—'.padStart(assetColWidth);
      })
      .join('');

    const dtsCell = row.dtsBytes > 0 ? formatBytes(row.dtsBytes).padStart(sizeCol) : '—'.padStart(sizeCol);
    console.log(
      `  ${row.specifier.padEnd(specCol)}${formatBytes(row.jsBytes).padStart(sizeCol)}${dtsCell}${assetCells}${formatBytes(row.total).padStart(sizeCol)}`,
    );
  }

  let totalJs = 0;
  let totalDts = 0;
  let totalAll = 0;
  for (const row of rows) {
    totalJs += row.jsBytes;
    totalDts += row.dtsBytes;
    totalAll += row.total;
  }

  const totalAssetCells = allAssetTypes
    .map((extension) => {
      let bytes = 0;
      let count = 0;
      for (const row of rows) {
        const entry = row.assets.get(extension);
        if (entry) {
          bytes += entry.bytes;
          count += entry.count;
        }
      }

      return bytes > 0 ? formatAssetCell(bytes, count, assetColWidth) : '—'.padStart(assetColWidth);
    })
    .join('');

  console.log(`  ${divider}`);
  const totalDtsCell = totalDts > 0 ? formatBytes(totalDts).padStart(sizeCol) : '—'.padStart(sizeCol);
  console.log(
    `  ${`Total (${String(rows.length)} exports)`.padEnd(specCol)}${formatBytes(totalJs).padStart(sizeCol)}${totalDtsCell}${totalAssetCells}${formatBytes(totalAll).padStart(sizeCol)}`,
  );
}

type DistributionRow = {
  label: string;
  fileCount: number;
  jsBytes: number;
  dtsBytes: number;
  assets: Map<string, { count: number; bytes: number }>;
  total: number;
};

type DistributionStats = Omit<DistributionRow, 'label'>;

function createDistributionStats(): DistributionStats {
  return {
    fileCount: 0,
    jsBytes: 0,
    dtsBytes: 0,
    assets: new Map<string, { count: number; bytes: number }>(),
    total: 0,
  };
}

function addDistributionFile(stats: DistributionStats, filePath: string): void {
  const { size } = statSync(filePath);
  stats.fileCount += 1;
  stats.total += size;
  const name = basename(filePath);

  if (/\.(js|cjs|mjs)$/.test(name)) {
    stats.jsBytes += size;
    return;
  }

  if (/\.(d\.ts|d\.cts|d\.mts)$/.test(name)) {
    stats.dtsBytes += size;
    return;
  }

  const extension = name.split('.').pop() ?? '?';
  const entry = stats.assets.get(extension) ?? { count: 0, bytes: 0 };
  entry.count += 1;
  entry.bytes += size;
  stats.assets.set(extension, entry);
}

function buildDistributionRows(): DistributionRow[] {
  const distributionDirectory = join(absoluteRoot, 'dist');
  if (!existsSync(distributionDirectory)) {
    return [];
  }

  const rows: DistributionRow[] = [];
  const entries = readdirSync(distributionDirectory, { withFileTypes: true });
  const topLevelFiles = entries
    .filter((d) => d.isFile())
    .map((d) => d.name)
    .sort();
  if (topLevelFiles.length > 0) {
    const stats = createDistributionStats();
    for (const file of topLevelFiles) {
      addDistributionFile(stats, join(distributionDirectory, file));
    }

    rows.push({
      label: 'dist',
      ...stats,
    });
  }

  const subdirs = readdirSync(distributionDirectory, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const sub of subdirs) {
    const files = walkDirectory(join(distributionDirectory, sub));
    const stats = createDistributionStats();
    for (const f of files) {
      addDistributionFile(stats, f);
    }

    rows.push({
      label: `dist/${sub}`,
      ...stats,
    });
  }

  return rows;
}

function printSizeSummary(): void {
  const rows = buildDistributionRows();
  if (rows.length === 0) {
    return;
  }

  const allAssetTypes = [...new Set(rows.flatMap((r) => [...r.assets.keys()]))].sort();
  const sizeCol = 10;
  const labelCol = Math.max(...rows.map((r) => r.label.length), 10);
  const filesCol = 8;
  const assetColWidth = 15;

  const assetHeaders = allAssetTypes.map((extension) => `.${extension}`.padStart(assetColWidth)).join('');
  const header = `  ${''.padEnd(labelCol)}${'Files'.padStart(filesCol)}${'JS'.padStart(sizeCol)}${'Types'.padStart(sizeCol)}${assetHeaders}${'Total'.padStart(sizeCol)}`;
  const divider = '─'.repeat(header.length - 2);

  console.log('\n  Size');
  console.log(`  ${divider}`);
  console.log(header);
  console.log(`  ${divider}`);

  for (const row of rows) {
    const assetCells = allAssetTypes
      .map((extension) => {
        const entry = row.assets.get(extension);
        return entry ? formatAssetCell(entry.bytes, entry.count, assetColWidth) : '—'.padStart(assetColWidth);
      })
      .join('');

    console.log(
      `  ${row.label.padEnd(labelCol)}${String(row.fileCount).padStart(filesCol)}${formatBytes(row.jsBytes).padStart(sizeCol)}${formatBytes(row.dtsBytes).padStart(sizeCol)}${assetCells}${formatBytes(row.total).padStart(sizeCol)}`,
    );
  }

  let sumFiles = 0;
  let sumJs = 0;
  let sumDts = 0;
  let sumTotal = 0;
  for (const row of rows) {
    sumFiles += row.fileCount;
    sumJs += row.jsBytes;
    sumDts += row.dtsBytes;
    sumTotal += row.total;
  }

  const totalAssetCells = allAssetTypes
    .map((extension) => {
      let bytes = 0;
      let count = 0;
      for (const row of rows) {
        const entry = row.assets.get(extension);
        if (entry) {
          bytes += entry.bytes;
          count += entry.count;
        }
      }

      return bytes > 0 ? formatAssetCell(bytes, count, assetColWidth) : '—'.padStart(assetColWidth);
    })
    .join('');

  console.log(`  ${divider}`);
  console.log(
    `  ${'Total'.padEnd(labelCol)}${String(sumFiles).padStart(filesCol)}${formatBytes(sumJs).padStart(sizeCol)}${formatBytes(sumDts).padStart(sizeCol)}${totalAssetCells}${formatBytes(sumTotal).padStart(sizeCol)}`,
  );
}

function printResult(result: CheckResult): void {
  const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '⊘';
  const tag = result.status.toUpperCase();
  const summary = result.details?.[0] ?? '';

  console.log(`  [${tag}] ${icon} ${result.name} -- ${summary}`);

  if (result.status === 'fail' && result.details && result.details.length > 1) {
    for (const detail of result.details.slice(1)) {
      for (const line of detail.split('\n')) {
        console.log(`         ${line}`);
      }
    }
  }
}

async function main(): Promise<void> {
  results.push(validateEsmOnlyPackageMetadata());
  printResult(results.at(-1)!);

  results.push(validateFlatDistLayout());
  printResult(results.at(-1)!);

  results.push(await runPublint());
  printResult(results.at(-1)!);

  results.push(await runAttw());
  printResult(results.at(-1)!);

  results.push(await runMadge());
  printResult(results.at(-1)!);

  results.push(await runSizeLimit());
  printResult(results.at(-1)!);

  printExportsSummary();
  printSizeSummary();

  const failures = results.filter((r) => r.status === 'fail');
  console.log();

  if (failures.length > 0) {
    console.log(`${String(failures.length)} check(s) failed. Package is NOT ready for publishing.`);
    process.exit(1);
  }

  console.log('All checks passed. Package is ready for publishing.');
}

await main();
